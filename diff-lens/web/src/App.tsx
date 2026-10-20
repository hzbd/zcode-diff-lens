import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useDocumentTheme } from "@modelcontextprotocol/ext-apps/react";
import {
  askAgentAboutFile,
  discardChanges,
  fetchDiff,
  fetchStatus,
  type DiffPayload,
  type GitStatus,
} from "./mcp";
import { buildTree, countByStatus, defaultExpanded } from "./gitTree";
import { DiffTree } from "./components/DiffTree";
import { DiffView } from "./components/DiffView";

const POLL_MS = 3000;

export function App() {
  const { app, isConnected, error: connError } = useApp({
    appInfo: { name: "diff-lens-panel", version: "0.1.6" },
    capabilities: {},
  });
  const theme = useDocumentTheme();

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payload, setPayload] = useState<DiffPayload | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(false);
  const [confirming, setConfirming] = useState(false); // revert two-step confirm
  const [busy, setBusy] = useState(false); // revert/ask in flight
  const payloadCache = useRef(new Map<string, DiffPayload>());

  const refresh = useCallback(
    async (keepSelection = true) => {
      if (!app) return;
      try {
        const s = await fetchStatus(app);
        setStatus(s);
        setStatusError(null);
        payloadCache.current.clear();
        if (!keepSelection && s.entries.length) setSelected(s.entries[0].path);
      } catch (e) {
        setStatusError(e instanceof Error ? e.message : String(e));
      }
    },
    [app],
  );

  // Initial load + polling so the tree tracks edits made in the editor.
  useEffect(() => {
    if (!isConnected || !app) return;
    void refresh(false);
    const t = setInterval(() => void refresh(true), POLL_MS);
    return () => clearInterval(t);
  }, [isConnected, app, refresh]);

  // Drop a selection that no longer exists (file reverted / committed).
  useEffect(() => {
    if (status && selected && !status.entries.some((e) => e.path === selected)) {
      setSelected(null);
      setPayload(null);
      setConfirming(false);
    }
  }, [status, selected]);

  // Load the diff payload whenever the selection changes.
  useEffect(() => {
    if (!app || !selected) return;
    const cached = payloadCache.current.get(selected);
    if (cached) {
      setPayload(cached);
      return;
    }
    let cancelled = false;
    setPayloadLoading(true);
    setPayloadError(null);
    fetchDiff(app, selected)
      .then((p) => {
        if (cancelled) return;
        payloadCache.current.set(selected, p);
        setPayload(p);
      })
      .catch((e) => {
        if (!cancelled) setPayloadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setPayloadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app, selected]);

  const tree = useMemo(() => (status ? buildTree(status.entries) : []), [status]);
  const expanded = useMemo(
    () => (tree.length ? defaultExpanded(tree) : new Set<string>()),
    [tree],
  );
  const counts = useMemo(
    () => (status ? countByStatus(status.entries) : null),
    [status],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? "dark";
  }, [theme]);

  const onRevert = async () => {
    if (!app || !selected || busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await discardChanges(app, selected);
      setSelected(null);
      setPayload(null);
      await refresh(true);
    } catch (e) {
      setPayloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const onAskAgent = async () => {
    if (!app || !payload || busy) return;
    setBusy(true);
    try {
      await askAgentAboutFile(app, payload);
    } catch (e) {
      setPayloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (connError) {
    return <div className="empty error">Panel connection failed: {connError.message}</div>;
  }
  if (!isConnected) {
    return <div className="empty">Connecting to host…</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <svg className="logo" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
          <path d="M8 13.5 L14 8.5 M16.5 16.5 L21 21" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="panel-title" title={status?.projectName ?? undefined}>
          {status?.projectName ? `${status.projectName} - Diff.lens` : "Diff.lens"}
        </span>
        <span className="branch" title={status?.root ?? undefined}>
          {status?.isRepo
            ? `⑂ ${status.branch ?? "(no branch)"}${
                status.upstream ? ` → ${status.upstream}` : ""
              }`
            : "not a git repository"}
        </span>
        {counts && status?.isRepo && (
          <span className="counts">
            <span className="c-modified" title="modified">{counts.modified}M</span>
            <span className="c-added" title="added">{counts.added}A</span>
            <span className="c-untracked" title="untracked">{counts.untracked}U</span>
            <span className="c-deleted" title="deleted">{counts.deleted}D</span>
            <span className="c-renamed" title="renamed">{counts.renamed}R</span>
            {counts.conflict > 0 && (
              <span className="c-conflict" title="conflict">{counts.conflict}!</span>
            )}
          </span>
        )}
        <button className="ghost" onClick={() => void refresh(true)} title="Refresh">
          ⟳
        </button>
        <button
          className={sideBySide ? "ghost on" : "ghost"}
          onClick={() => setSideBySide((v) => !v)}
          title="Toggle inline / side-by-side diff"
        >
          {sideBySide ? "⬒ Split" : "▤ Inline"}
        </button>
      </header>

      {statusError && <div className="banner error">{statusError}</div>}

      <div className="body">
        <aside className="tree-pane">
          {!status?.isRepo ? (
            <div className="empty small">Not a git repository</div>
          ) : status.entries.length === 0 ? (
            <div className="empty small">Working tree clean — no changes</div>
          ) : (
            <DiffTree nodes={tree} initialExpanded={expanded} selected={selected} onSelect={setSelected} />
          )}
        </aside>

        <main className="diff-pane">
          <div className="diff-toolbar">
            <span className="path" title={payload?.path ?? ""}>
              {payload?.path ?? (selected ?? "")}
            </span>
            {payload && !payload.isBinary && (
              <span className="stat">
                <span className="add">+{payload.additions}</span>{" "}
                <span className="del">−{payload.deletions}</span>
              </span>
            )}
            {payload?.isBinary && <span className="tag binary">binary</span>}
            {payload?.truncated && <span className="tag">truncated</span>}
            <span className="spacer" />
            {selected && (
              <>
                <button
                  className={confirming ? "danger" : "ghost"}
                  disabled={busy}
                  onClick={() => void onRevert()}
                  title="Revert this file to HEAD (irreversible)"
                >
                  {confirming ? "Confirm revert?" : "↺ Revert"}
                </button>
                <button
                  className="ghost"
                  disabled={busy || !payload}
                  onClick={() => void onAskAgent()}
                  title="Send this file's changes to the agent for review"
                >
                  ✦ Ask Agent
                </button>
              </>
            )}
          </div>
          <div className="diff-host">
            {payloadError ? (
              <div className="empty error">{payloadError}</div>
            ) : payloadLoading ? (
              <div className="empty">Loading diff…</div>
            ) : !selected ? (
              <div className="empty">Select a file on the left to view its changes</div>
            ) : payload?.isBinary ? (
              <div className="empty">Binary file — line diff not available</div>
            ) : payload ? (
              <DiffView payload={payload} sideBySide={sideBySide} theme={theme ?? "dark"} />
            ) : (
              <div className="empty">Select a file on the left to view its changes</div>
            )}
          </div>
        </main>
      </div>

      {confirming && (
        <div className="banner warn">
          This irreversibly discards all changes in <code>{selected}</code>, including staged
          ones. Click “Confirm revert?” again to proceed — click elsewhere to cancel.
        </div>
      )}
    </div>
  );
}
