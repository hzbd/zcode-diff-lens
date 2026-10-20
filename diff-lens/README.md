# diff-lens

A Cursor-style git change review panel for the ZCode session sidebar.

- **Cascading status tree**: per-file markers for untracked / added / modified / deleted / renamed / conflicted; folders are colored by their "worst" status and show a change-count badge, so collapsed folders still reveal where the changes are.
- **Inline diff**: Monaco Diff Editor, inline red/green view by default (switchable to side-by-side), comparing HEAD against the working tree.
- **Per-file revert**: one click after a two-step confirmation discards all changes of that file (including staged ones; irreversible).
- **Ask Agent**: posts a summary of the current file's changes into the main chat for agent review.
- **Zero-token browsing**: panel browsing, refresh and diff are all local MCP tool calls — no model involvement; only "Ask Agent" consumes session tokens.

## Architecture (aligned with the actual ZCode host implementation)

```
.zcode-plugin/plugin.json
  mcpServers.diff-lens   node ${CLAUDE_PLUGIN_ROOT}/server/dist/index.mjs
                                  cwd=${ZCODE_PROJECT_DIR}
  ui.surfaces[0]                  id=diff-lens
                                  server=diff-lens (must match an mcpServers key)
                                  resourceUri=ui://diff-lens/panel
                                  availability="session" (the only value the host accepts today)

server/dist/index.mjs   dependency-free single-file bundle (esbuild)
  tools:  git_status · get_file_diff_payload · discard_file_changes
  resource: ui://diff-lens/panel → text/html;profile=mcp-app

web/dist/index.html     Vite + React + Monaco, inlined to one file via vite-plugin-singlefile
  @modelcontextprotocol/ext-apps/react → useApp()
  app.callServerTool()  calls the git tools (host RPC: mcp/uiCallTool)
  app.sendMessage()     "Ask Agent" posts into the chat
```

Data path: `webview ⇄ (postMessage / MCP Apps) ⇄ ZCode host ⇄ (stdio JSON-RPC) ⇄ server ⇄ git CLI` — fully local.

## Development

```bash
npm install
npm run build     # web/dist/index.html + server/dist/index.mjs
npm run smoke     # host-free smoke tests (drives every tool and the panel resource on a temp git repo)
```

After changing source, run `npm run build` again, then in ZCode: **Settings → Plugins → marketplace → Refresh/Update**.

### Layout

```
server/src/index.mjs             MCP server source (tools + panel resource)
scripts/build-server.mjs         esbuild bundling
scripts/smoke-test.mjs           end-to-end smoke tests
web/src/App.tsx                  main panel: state, polling, toolbar, revert / Ask Agent
web/src/gitTree.ts               cascading tree building and status aggregation
web/src/components/DiffTree.tsx  file tree UI
web/src/components/DiffView.tsx  Monaco diff container
web/vite.config.ts               single-file build config
docs/DESIGN.md                   design doc (incl. errata against the original proposal)
```

## Security design

- `discard_file_changes` is destructive: the `confirm` argument must exactly equal `path` (server-side double confirmation + a two-step UI click).
- All repository paths are normalized and validated; absolute paths and `..` escapes are refused.
- Diff sides above 800,000 characters are truncated; binary files are never transferred.
- Tools declare `readOnlyHint` / `destructiveHint`, visible to both host and model.

## Known limits

- The panel mounts in the session sidebar (`availability: "session"` is the only value the host currently supports); it cannot touch the native file tree.
- Expanded/selected state lives in panel memory for the session; MCP Apps 2.x has no widgetState API.
- `node` must be on PATH (true on this machine). For end-user distribution, follow the ios-simulator plugin and run through ZCode Helper (`ELECTRON_RUN_AS_NODE=1`).
- `ui.surfaces` / MCP Apps are experimental; ZCode or ext-apps SDK upgrades may introduce incompatibilities — test against the target version.

## License

[MIT](./LICENSE)
