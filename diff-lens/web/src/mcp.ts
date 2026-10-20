// Typed wrappers around the MCP Apps bridge (the panel's only channel to the
// git tools exposed by server/src/index.mjs).
import type { App } from "@modelcontextprotocol/ext-apps";

export type FileStatus =
  | "modified"
  | "added"
  | "untracked"
  | "deleted"
  | "renamed"
  | "conflict";

export interface GitEntry {
  path: string;
  oldPath: string | null;
  x: string;
  y: string;
  status: FileStatus;
}

export interface GitStatus {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  entries: GitEntry[];
}

export interface DiffPayload {
  path: string;
  status: FileStatus;
  oldPath: string | null;
  isBinary: boolean;
  additions: number;
  deletions: number;
  original: string;
  current: string;
  truncated: boolean;
}

export async function callTool<T>(
  app: App,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await app.callServerTool({ name, arguments: args });
  if (res.structuredContent !== undefined && res.structuredContent !== null) {
    return res.structuredContent as T;
  }
  const text = (res.content ?? [])
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n")
    .trim();
  if (res.isError) throw new Error(text || `tool ${name} failed`);
  throw new Error(text || `tool ${name} returned no structured content`);
}

export async function fetchStatus(app: App): Promise<GitStatus> {
  return callTool<GitStatus>(app, "git_status");
}

export async function fetchDiff(app: App, path: string): Promise<DiffPayload> {
  return callTool<DiffPayload>(app, "get_file_diff_payload", { path });
}

export async function discardChanges(app: App, path: string): Promise<void> {
  await callTool<{ ok: boolean }>(app, "discard_file_changes", { path, confirm: path });
}

export async function askAgentAboutFile(
  app: App,
  p: DiffPayload,
): Promise<void> {
  const ren = p.oldPath ? ` (renamed from ${p.oldPath})` : "";
  const text =
    `[diff-lens] Please review the working-tree changes in \`${p.path}\`${ren}` +
    ` (+${p.additions} / -${p.deletions}${p.isBinary ? ", binary file" : ""}).` +
    ` Point out potential issues and suggest improvements.`;
  const res = await app.sendMessage({
    role: "user",
    content: [{ type: "text", text }],
  });
  if (res.isError) throw new Error("host rejected the message");
}
