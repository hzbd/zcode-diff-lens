// diff-lens local MCP server.
// Serves the panel HTML at ui://diff-lens/panel and exposes git tools
// for the panel to call via the MCP Apps bridge (app.callServerTool).
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const PANEL_URI = "ui://diff-lens/panel";
// Keep each diff side comfortably below host resource limits (16MB) and Monaco's comfort zone.
const MAX_SIDE_CHARS = 800_000;

const log = (...a) => console.error("[diff-lens]", ...a);

function git(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", ...opts },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = typeof stderr === "string" ? stderr : "";
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

// The host sets DIFF_LENS_PROJECT_DIR to the session workspace; fall
// back to cwd so the server also works when run manually.
function projectDir() {
  return process.env.DIFF_LENS_PROJECT_DIR || process.cwd();
}

let cachedRoot; // undefined = not computed, null = not a repo, string = repo root
async function repoRoot() {
  if (cachedRoot !== undefined) return cachedRoot;
  try {
    cachedRoot = (await git(["rev-parse", "--show-toplevel"], { cwd: projectDir() })).trim() || null;
  } catch {
    cachedRoot = null;
  }
  return cachedRoot;
}

function notRepo() {
  return {
    structuredContent: { isRepo: false, root: null, branch: null, entries: [] },
  };
}

function classify(x, y) {
  if (x === "?") return "untracked";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || x === "B" || y === "B") return "conflict";
  if (x === "R") return "renamed";
  if (x === "D" || y === "D") return "deleted";
  if (x === "A") return "added";
  return "modified";
}

function parsePorcelain(out) {
  const entries = [];
  let branch = null;
  let upstream = null;
  let ahead = 0;
  let behind = 0;
  for (const line of out.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const header = line.slice(3);
      const m = header.match(/^(\S+?)(?:\.\.\.(\S+?))?(?:\s+\[([^\]]*)\])?\s*$/);
      if (m) {
        branch = m[1] === "No" && header.startsWith("No commits yet") ? null : m[1];
        upstream = m[2] || null;
        const track = m[3];
        if (track) {
          const a = track.match(/ahead (\d+)/);
          const b = track.match(/behind (\d+)/);
          ahead = a ? Number(a[1]) : 0;
          behind = b ? Number(b[1]) : 0;
        }
      }
    } else if (line.length > 3) {
      const x = line[0];
      const y = line[1];
      let p = line.slice(3);
      let oldPath = null;
      const arrow = p.indexOf(" -> ");
      if (arrow !== -1) {
        oldPath = p.slice(0, arrow);
        p = p.slice(arrow + 4);
      }
      entries.push({ path: p, oldPath, x, y, status: classify(x, y) });
    }
  }
  return { branch, upstream, ahead, behind, entries };
}

// Resolve a repo-relative path and refuse anything that escapes the worktree.
function safeRepoPath(root, rel) {
  const norm = path.normalize(rel).replace(/^([.][.][/\\])+/, "");
  if (path.isAbsolute(norm)) throw new Error("absolute paths are not allowed");
  const abs = path.resolve(root, norm);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("path escapes the repository");
  return { rel: norm.split(path.sep).join("/"), abs };
}

function truncateSide(text) {
  if (text.length <= MAX_SIDE_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_SIDE_CHARS) + "\n\n… [truncated by diff-lens]",
    truncated: true,
  };
}

const server = new McpServer({ name: "diff-lens", version: "0.1.4" });

server.registerTool(
  "git_status",
  {
    title: "Git status (panel data)",
    description:
      "List all working-tree changes (modified / added / deleted / renamed / untracked / conflicted) plus branch info, relative to HEAD, for the diff review panel.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const root = await repoRoot();
    if (!root) return notRepo();
    const out = await git(
      ["status", "--porcelain=v1", "-b", "--untracked-files=all"],
      { cwd: root },
    );
    const { branch, upstream, ahead, behind, entries } = parsePorcelain(out);
    return {
      structuredContent: {
        isRepo: true,
        root,
        projectName: path.basename(root),
        branch,
        upstream,
        ahead,
        behind,
        entries,
      },
    };
  },
);

server.registerTool(
  "get_file_diff_payload",
  {
    title: "File diff payload (HEAD vs working tree)",
    description:
      "Return the HEAD version and the working-tree version of one file so the caller can render an inline diff. Marks binary files and reports numstat additions/deletions.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Repository-relative file path"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ path: relPath }) => {
    const root = await repoRoot();
    if (!root) return { ...notRepo(), isError: true };
    const { rel, abs } = safeRepoPath(root, relPath);

    const statusOut = await git(
      ["status", "--porcelain=v1", "--untracked-files=all", "--", rel],
      { cwd: root },
    );
    const line = statusOut.split("\n").find((l) => l && !l.startsWith("##"));
    if (!line) {
      return {
        isError: true,
        content: [{ type: "text", text: `no changes reported for ${rel}` }],
      };
    }
    const status = classify(line[0], line[1]);
    let oldPath = null;
    {
      let p = line.slice(3);
      const arrow = p.indexOf(" -> ");
      if (arrow !== -1) {
        oldPath = p.slice(0, arrow);
        p = p.slice(arrow + 4);
      }
    }

    let original = "";
    if (status !== "untracked" && status !== "added") {
      try {
        original = await git(["show", `HEAD:${rel}`], { cwd: root });
      } catch {
        original = ""; // not present in HEAD (e.g. staged-new path of a rename)
      }
    }

    let current = "";
    try {
      current = await readFile(abs, "utf8");
    } catch {
      current = ""; // deleted from the worktree
    }

    let isBinary = false;
    let additions = 0;
    let deletions = 0;
    try {
      const numstat = await git(["diff", "--numstat", "HEAD", "--", rel], { cwd: root });
      const row = numstat.split("\n")[0];
      if (row) {
        const [a, d] = row.split("\t");
        if (a === "-") isBinary = true;
        else {
          additions = Number(a) || 0;
          deletions = Number(d) || 0;
        }
      }
    } catch {
      /* numstat is best-effort */
    }
    if (!isBinary && (!original && !current)) isBinary = false;
    if (!isBinary) {
      const probe = (original + current).slice(0, 8000);
      if (probe.includes("\u0000")) isBinary = true;
    }
    if (isBinary) {
      return {
        structuredContent: {
          path: rel, status, oldPath, isBinary: true, additions: 0, deletions: 0,
          original: "", current: "", truncated: false,
        },
      };
    }
    if (status === "untracked") additions = current ? current.split("\n").length : 0;

    const o = truncateSide(original);
    const c = truncateSide(current);
    return {
      structuredContent: {
        path: rel, status, oldPath, isBinary: false,
        additions, deletions,
        original: o.text, current: c.text,
        truncated: o.truncated || c.truncated,
      },
    };
  },
);

server.registerTool(
  "discard_file_changes",
  {
    title: "Discard one file's changes (destructive)",
    description:
      "Revert one file to HEAD (index + worktree), or delete it if it is new/untracked. Destructive and unrecoverable: requires confirm to equal path.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Repository-relative file path"),
      confirm: z.string().describe("Repeat the exact same path here to confirm the destructive revert"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ path: relPath, confirm }) => {
    if (confirm !== relPath) {
      return {
        isError: true,
        content: [{ type: "text", text: "refused: `confirm` must equal `path` (two-step confirmation)" }],
      };
    }
    const root = await repoRoot();
    if (!root) return { ...notRepo(), isError: true };
    const { rel } = safeRepoPath(root, relPath);

    const statusOut = await git(
      ["status", "--porcelain=v1", "--untracked-files=all", "--", rel],
      { cwd: root },
    );
    const line = statusOut.split("\n").find((l) => l && !l.startsWith("##"));
    if (!line) {
      return { isError: true, content: [{ type: "text", text: `no changes for ${rel}` }] };
    }
    const status = classify(line[0], line[1]);

    try {
      if (status === "untracked") {
        await git(["clean", "-f", "--", rel], { cwd: root });
      } else if (status === "renamed") {
        let renamedFrom = rel;
        {
          let p = line.slice(3);
          const arrow = p.indexOf(" -> ");
          if (arrow !== -1) renamedFrom = p.slice(0, arrow);
        }
        // bring the old path back, then drop the new one
        await git(["restore", "--source=HEAD", "--staged", "--worktree", "--", renamedFrom], { cwd: root }).catch(() => {});
        await git(["rm", "-f", "--", rel], { cwd: root });
      } else if (line[0] === "A" || (line[0] === " " && line[1] === "A")) {
        await git(["rm", "-f", "--", rel], { cwd: root });
      } else {
        await git(["restore", "--source=HEAD", "--staged", "--worktree", "--", rel], { cwd: root });
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `git failed: ${err.stderr || err.message}` }],
      };
    }
    return { structuredContent: { ok: true, path: rel } };
  },
);

// The panel HTML is a self-contained single-file Vite build; serve it as an
// MCP Apps resource so the host can mount it in the session surface webview.
let htmlCache;
async function panelHtml() {
  if (htmlCache !== undefined) return htmlCache;
  const root =
    process.env.DIFF_LENS_PLUGIN_ROOT ||
    path.resolve(fileURLToPath(import.meta.url), "..", "..");
  htmlCache = await readFile(path.join(root, "web", "dist", "index.html"), "utf8");
  return htmlCache;
}

registerAppResource(
  server,
  "Diff Lens Panel",
  PANEL_URI,
  {},
  async () => ({
    contents: [{ uri: PANEL_URI, mimeType: RESOURCE_MIME_TYPE, text: await panelHtml() }],
  }),
);

await server.connect(new StdioServerTransport());
log("ready");
