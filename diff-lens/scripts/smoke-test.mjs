// Host-free smoke test: drive the bundled server over stdio as the host would,
// against a disposable git repository, and check the panel resource.
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SERVER = new URL("../server/dist/index.mjs", import.meta.url).pathname;
const PLUGIN_ROOT = new URL("..", import.meta.url).pathname;
const PANEL_URI = "ui://diff-lens/panel";

function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

const repo = await mkdtemp(path.join(tmpdir(), "gdr-smoke-"));
const run = (cmd, args) =>
  new Promise((res, rej) =>
    execFile(cmd, args, { cwd: repo, encoding: "utf8" }, (e, so, se) =>
      e ? rej(new Error(`${cmd} ${args} → ${se}`)) : res(so)));

import { execFile } from "node:child_process";

try {
  // --- fixture repo ---
  await run("git", ["init", "-q", "-b", "main"]);
  await run("git", ["config", "user.email", "t@t"]);
  await run("git", ["config", "user.name", "t"]);
  await mkdir(path.join(repo, "src", "nested"), { recursive: true });
  await writeFile(path.join(repo, "src", "a.ts"), "const a = 1;\n");
  await writeFile(path.join(repo, "src", "nested", "b.py"), "x = 1\n");
  await run("git", ["add", "."]);
  await run("git", ["commit", "-q", "-m", "init"]);
  await writeFile(path.join(repo, "src", "a.ts"), "const a = 2;\nconst b = 3;\n"); // modified
  await writeFile(path.join(repo, "src", "nested", "c.txt"), "new\n");            // untracked
  await run("git", ["rm", "-q", "src/nested/b.py"]);                              // deleted

  // --- spawn server like the host does ---
  const client = new Client({ name: "smoke", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: repo,
    env: {
      ...process.env,
      DIFF_LENS_PLUGIN_ROOT: PLUGIN_ROOT,
      DIFF_LENS_PROJECT_DIR: repo,
    },
  });
  await client.connect(transport);
  console.log("connected");

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  ok(names.includes("git_status"), "tools/list has git_status");
  ok(names.includes("get_file_diff_payload"), "tools/list has get_file_diff_payload");
  ok(names.includes("discard_file_changes"), "tools/list has discard_file_changes");

  const st = await client.callTool({ name: "git_status", arguments: {} });
  const entries = st.structuredContent.entries;
  ok(st.structuredContent.isRepo === true, "git_status: isRepo");
  ok(st.structuredContent.branch === "main", "git_status: branch=main");
  ok(entries.some((e) => e.path === "src/a.ts" && e.status === "modified"), "git_status: a.ts modified");
  ok(entries.some((e) => e.path === "src/nested/c.txt" && e.status === "untracked"), "git_status: c.txt untracked");
  ok(entries.some((e) => e.path === "src/nested/b.py" && e.status === "deleted"), "git_status: b.py deleted");

  const diff = await client.callTool({ name: "get_file_diff_payload", arguments: { path: "src/a.ts" } });
  ok(diff.structuredContent.status === "modified", "diff: status modified");
  ok(diff.structuredContent.original === "const a = 1;\n", "diff: original content");
  ok(diff.structuredContent.current.includes("const b = 3;"), "diff: current content");
  ok(diff.structuredContent.additions === 2 && diff.structuredContent.deletions === 1, "diff: numstat +2/-1");

  const newDiff = await client.callTool({ name: "get_file_diff_payload", arguments: { path: "src/nested/c.txt" } });
  ok(newDiff.structuredContent.status === "untracked" && newDiff.structuredContent.original === "", "diff: untracked has empty original");

  const guard = await client.callTool({ name: "discard_file_changes", arguments: { path: "src/a.ts", confirm: "wrong" } });
  ok(guard.isError === true, "discard: refuses wrong confirm");

  const escape = await client.callTool({ name: "get_file_diff_payload", arguments: { path: "../../etc/passwd" } }).catch(() => null);
  ok(escape === null || escape.isError === true, "diff: rejects path escape");

  const discard = await client.callTool({ name: "discard_file_changes", arguments: { path: "src/a.ts", confirm: "src/a.ts" } });
  ok(discard.structuredContent.ok === true, "discard: a.ts reverted");
  const st2 = await client.callTool({ name: "git_status", arguments: {} });
  ok(!st2.structuredContent.entries.some((e) => e.path === "src/a.ts"), "discard: a.ts gone from status");

  const res = await client.readResource({ uri: PANEL_URI });
  const html = res.contents[0].text;
  ok(res.contents[0].mimeType === "text/html;profile=mcp-app", "resource: mcp-app mime");
  ok(html.length > 100_000, `resource: single-file html (${Math.round(html.length / 1024)} KB)`);
  ok(html.includes("id=\"root\""), "resource: mounts React root");

  await client.close();
  console.log("\nALL SMOKE TESTS PASSED");
} finally {
  await rm(repo, { recursive: true, force: true });
}
