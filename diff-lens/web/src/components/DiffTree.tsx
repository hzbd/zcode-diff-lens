import { useEffect, useState } from "react";
import type { TreeNode } from "../gitTree";
import type { FileStatus } from "../mcp";

// VS Code SCM-style status letters (U = untracked, ! = conflict).
const STATUS_LABEL: Record<FileStatus, string> = {
  modified: "M",
  added: "A",
  untracked: "U",
  deleted: "D",
  renamed: "R",
  conflict: "!",
};

// Compact language monograms with brand colors, Seti-icon-theme spirit.
const EXT_META: Record<string, { label: string; color: string }> = {
  ts: { label: "TS", color: "#3178c6" }, tsx: { label: "TS", color: "#3178c6" },
  mts: { label: "TS", color: "#3178c6" }, cts: { label: "TS", color: "#3178c6" },
  js: { label: "JS", color: "#e8d44d" }, jsx: { label: "JS", color: "#e8d44d" },
  mjs: { label: "JS", color: "#e8d44d" }, cjs: { label: "JS", color: "#e8d44d" },
  json: { label: "{}", color: "#cbcb41" }, jsonc: { label: "{}", color: "#cbcb41" },
  py: { label: "PY", color: "#4b8bbe" },
  go: { label: "GO", color: "#00add8" },
  rs: { label: "RS", color: "#dea584" },
  java: { label: "J", color: "#b07219" },
  kt: { label: "KT", color: "#a97bff" }, kts: { label: "KT", color: "#a97bff" },
  swift: { label: "SW", color: "#f05138" },
  rb: { label: "RB", color: "#cc342d" },
  php: { label: "PHP", color: "#7377ad" },
  c: { label: "C", color: "#8ea4c8" }, h: { label: "C", color: "#8ea4c8" },
  cpp: { label: "C+", color: "#f34b7d" }, cc: { label: "C+", color: "#f34b7d" },
  hpp: { label: "C+", color: "#f34b7d" }, mm: { label: "C+", color: "#f34b7d" },
  cs: { label: "C#", color: "#178600" },
  md: { label: "MD", color: "#519aba" }, markdown: { label: "MD", color: "#519aba" },
  css: { label: "#", color: "#42a5f5" }, scss: { label: "S#", color: "#c6538c" },
  less: { label: "L#", color: "#2f6bae" },
  html: { label: "<>", color: "#e44d26" }, htm: { label: "<>", color: "#e44d26" },
  xml: { label: "<>", color: "#8b949e" }, svg: { label: "<>", color: "#ffb13b" },
  vue: { label: "V", color: "#41b883" }, svelte: { label: "S", color: "#ff3e00" },
  yml: { label: "Y", color: "#cb171e" }, yaml: { label: "Y", color: "#cb171e" },
  toml: { label: "T", color: "#9c4221" }, ini: { label: "·", color: "#8b949e" },
  sh: { label: "$", color: "#89e051" }, bash: { label: "$", color: "#89e051" },
  zsh: { label: "$", color: "#89e051" }, fish: { label: "$", color: "#89e051" },
  sql: { label: "Q", color: "#e38c00" },
  txt: { label: "T", color: "#8b949e" },
  lock: { label: "L", color: "#8b949e" },
};
const FALLBACK_META = { label: "•", color: "#8b949e" };

function FileIcon({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  const meta = EXT_META[ext] ?? FALLBACK_META;
  return (
    <span className="ficon">
      <span className="fmono" style={{ color: meta.color, background: `${meta.color}22` }}>
        {meta.label}
      </span>
    </span>
  );
}

function FolderIcon() {
  return (
    <span className="ficon folder-icon">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M1.75 3.25h4.1l1.4 1.75h7v8H1.75v-9.75z"
          fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Twisty({ open, ghost }: { open?: boolean; ghost?: boolean }) {
  return (
    <span className={`twisty${open ? " open" : ""}${ghost ? " ghost" : ""}`} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path
          d="M4.5 2.75 8.25 6 4.5 9.25"
          fill="none" stroke="currentColor" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Guides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="guide" aria-hidden="true" />
      ))}
    </>
  );
}

function Row({
  node,
  depth,
  open,
  selected,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  open: boolean;
  selected: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  if (node.type === "dir") {
    return (
      <div
        className={`row dir s-${node.worst ?? "modified"}`}
        onClick={() => onToggle(node.path)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle(node.path)}
      >
        <Guides depth={depth} />
        <Twisty open={open} />
        <FolderIcon />
        <span className="name">{node.name}</span>
        <span className="badge">{node.count}</span>
      </div>
    );
  }
  return (
    <div
      className={`row file s-${node.status}${selected === node.path ? " selected" : ""}`}
      onClick={() => onSelect(node.path)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(node.path)}
      title={node.oldPath ? `${node.oldPath} → ${node.path}` : node.path}
    >
      <Guides depth={depth} />
      <Twisty ghost />
      <FileIcon name={node.name} />
      <span className="name">{node.name}</span>
      <span className={`chip s-${node.status}`}>{STATUS_LABEL[node.status]}</span>
    </div>
  );
}

export function DiffTree({
  nodes,
  initialExpanded,
  selected,
  onSelect,
}: {
  nodes: TreeNode[];
  initialExpanded: Set<string>;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  useEffect(() => setExpanded(initialExpanded), [initialExpanded]);

  const toggle = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const render = (list: TreeNode[], depth: number) =>
    list.map((n) => (
      <div key={n.path}>
        <Row
          node={n}
          depth={depth}
          open={expanded.has(n.path)}
          selected={selected}
          onSelect={onSelect}
          onToggle={toggle}
        />
        {n.type === "dir" && expanded.has(n.path) && render(n.children, depth + 1)}
      </div>
    ));

  return <div className="tree">{render(nodes, 0)}</div>;
}
