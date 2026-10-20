// Cascade tree: turn flat changed-path lists into a folder tree where every
// directory aggregates the count and worst status of the changes beneath it.
import type { FileStatus, GitEntry } from "./mcp";

export type Severity = number;

// Higher wins when a folder contains several kinds of change.
export const STATUS_SEVERITY: Record<FileStatus, Severity> = {
  conflict: 6,
  deleted: 5,
  modified: 4,
  renamed: 3,
  added: 2,
  untracked: 1,
};

export interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
  count: number; // changed files (recursively)
  worst: FileStatus | null;
}

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  status: FileStatus;
  oldPath: string | null;
}

export type TreeNode = DirNode | FileNode;

export function buildTree(entries: GitEntry[]): TreeNode[] {
  const root: DirNode = {
    type: "dir", name: "", path: "", children: [], count: 0, worst: null,
  };
  const dirMap = new Map<string, DirNode>([["", root]]);

  const ensureDir = (dirPath: string): DirNode => {
    const hit = dirMap.get(dirPath);
    if (hit) return hit;
    const idx = dirPath.lastIndexOf("/");
    const parentPath = idx === -1 ? "" : dirPath.slice(0, idx);
    const parent = ensureDir(parentPath);
    const node: DirNode = {
      type: "dir",
      name: dirPath.slice(idx + 1),
      path: dirPath,
      children: [],
      count: 0,
      worst: null,
    };
    parent.children.push(node);
    dirMap.set(dirPath, node);
    return node;
  };

  for (const e of entries) {
    const idx = e.path.lastIndexOf("/");
    const dirPath = idx === -1 ? "" : e.path.slice(0, idx);
    const dir = ensureDir(dirPath);
    dir.children.push({
      type: "file",
      name: e.path.slice(idx + 1),
      path: e.path,
      status: e.status,
      oldPath: e.oldPath,
    });
    // bubble count + worst status up the chain
    let cur: DirNode | undefined = dir;
    while (cur) {
      cur.count += 1;
      if (!cur.worst || STATUS_SEVERITY[e.status] > STATUS_SEVERITY[cur.worst]) {
        cur.worst = e.status;
      }
      const pIdx: number = cur.path.lastIndexOf("/");
      const parentPath: string | null =
        cur.path === "" ? null : pIdx === -1 ? "" : cur.path.slice(0, pIdx);
      cur = parentPath === null ? undefined : dirMap.get(parentPath);
    }
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.type === "dir") sortRec(n.children);
  };
  sortRec(root.children);
  return root.children;
}

export function countByStatus(entries: GitEntry[]): Record<FileStatus, number> {
  const c: Record<FileStatus, number> = {
    modified: 0, added: 0, untracked: 0, deleted: 0, renamed: 0, conflict: 0,
  };
  for (const e of entries) c[e.status] += 1;
  return c;
}

// Initial expansion: open directories that contain few entries so the user
// sees actual files, but keep dense trees collapsed (badges carry the info).
export function defaultExpanded(nodes: TreeNode[], limit = 12): Set<string> {
  const out = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type !== "dir") continue;
      if (n.count <= limit && list.length <= limit * 2) {
        out.add(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}
