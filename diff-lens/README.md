# diff-lens

A Cursor-style git change review panel for the ZCode session sidebar.

> **Verified against ZCode 3.16.2** (build 3.16.2.8769). `ui.surfaces` / MCP Apps are
> experimental — behavior on other ZCode versions is unverified.

- **Cascading status tree**: per-file markers for untracked / added / modified / deleted / renamed / conflicted; folders are colored by their "worst" status and show a change-count badge, so collapsed folders still reveal where the changes are.
- **Inline diff**: Monaco Diff Editor, inline red/green view by default (switchable to side-by-side), comparing HEAD against the working tree.
- **Per-file revert**: one click after a two-step confirmation discards all changes of that file (including staged ones; irreversible).
- **Ask Agent**: posts a summary of the current file's changes into the main chat for agent review.
- **Zero-token browsing**: panel browsing, refresh and diff are all local MCP tool calls — no model involvement; only "Ask Agent" consumes session tokens.

## Install and try in ZCode

1. Open **Plugin Marketplace → Add → Add Plugin Marketplace** and add this repository as a
   marketplace, from either:
   - **GitHub** — paste `https://github.com/hzbd/zcode-diff-lens` (a GitHub `owner/repo`
     shorthand or any Git URL works too).
   - **Local checkout** — paste the repository's root folder (the parent of `diff-lens/`);
     its `marketplace.json` makes it a local dev marketplace.
2. **Personal → diff-lens → Diff Lens → Install**.
3. Open a session in any **git repository** — the "Diff Lens" panel appears in the session
   sidebar; edit a few files and try the tree, the diff, revert and "Ask Agent".

New versions: once the marketplace source changes (a git push, or a local `npm run build`
for the checkout case), **Refresh** the marketplace and **Update** the plugin. Manage
installed plugins under **Settings → Plugins**.

## Panel symbols

Status chips (VS Code SCM-style letters, color-coded on each file row and in the topbar counters):

| Chip | Status | Notes |
| --- | --- | --- |
| `M` | modified | tracked file with working-tree or staged changes |
| `A` | added | new file staged into the index |
| `U` | untracked | new file not yet added to git |
| `D` | deleted | |
| `R` | renamed | hover a renamed row to see `oldPath → path` |
| `!` | conflict | merge/unmerged entries (VS Code SCM convention) |

- **Folders** are tinted by the "worst" status beneath them — `!` > `D` > `M` > `R` > `A` > `U` — and show a badge with the number of changes under that folder, so collapsed folders still reveal where the changes are.
- **File icons** are language monograms (`TS`, `JS`, `PY`, `<>`, `$`, …) with a neutral `•` fallback for unknown extensions.
- **Topbar**: `<project> - Diff.lens`, then `⑂ <branch> → <upstream>`, then whole-tree counters `nM nA nU nD nR` (`n!` appears only when conflicts exist). `⟳` forces a refresh; `▤ Inline` / `⬒ Split` switches the diff layout.
- **Diff toolbar**: `+N −N` counts added/deleted lines; the `binary` tag marks files whose content is never transferred; `truncated` marks a diff side cut at 800,000 chars; `↺ Revert` discards that file's changes (two-step: "Confirm revert?", irreversible); `✦ Ask Agent` posts the file's change summary into the main chat.

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
npm run build     # web/dist/index.html + server/dist/index.mjs (both artifacts are committed)
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
- `node` must be on PATH. For end-user distribution, run the server through ZCode Helper (`ELECTRON_RUN_AS_NODE=1`), like the official ios-simulator plugin does.
- `ui.surfaces` / MCP Apps are experimental; ZCode or ext-apps SDK upgrades may introduce incompatibilities — test against the target version.

## Host tip: the native code preview pane

The right-side code preview pane ("Code viewer") is ZCode host UI, independent of this plugin.
On ZCode 3.16.2 there is **no button to hide it**. Workaround: drag the splitter between the
chat area and the side pane until the preview collapses, leaving only the file tree. Caveats:
clicking a file re-opens the preview, and the collapsed state **resets whenever the side pane
is toggled closed and reopened** (re-drag needed).

## License

[MIT](./LICENSE)
