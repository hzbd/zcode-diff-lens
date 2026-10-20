# diff-lens Design Doc (corrected)

This version is grounded in actual code inspection of the ZCode host (`zcode.cjs`) and
`@modelcontextprotocol/ext-apps@2.0.3`, correcting the parts of the original proposal that
did not match the implementation. Every "host constraint" below comes from the host's
(de-minified) validation logic and can be re-verified.

## 1. Errata against the original proposal

| Original proposal | Reality | What this version does |
| --- | --- | --- |
| Declare the service via an `mcp` field in `plugin.json` | The field is `mcpServers`, a map of server name → config | Uses `mcpServers.diff-lens` |
| `ui.surfaces` points at a `web/dist/index.html` file path | A surface is `server` (must be declared in `mcpServers`) + `resourceUri` (`ui://` prefix, ≤2048 chars); the host fetches a resource with mime `text/html;profile=mcp-app` from that MCP server via `mcp/uiReadResource` and mounts it | The server registers the `ui://diff-lens/panel` resource returning single-file HTML |
| Default multi-file Vite output | The resource is returned by a single read and the page runs in a sandboxed webview that cannot load external subresources | `vite-plugin-singlefile` inlines all JS/CSS (~4MB artifact < the host's 16MB resource cap) |
| `widgetState` to persist expansion/selection | ext-apps 2.x has no such API | React component state (lives with the session) + 3s polling of git_status |
| Vague `bridge.sendMessage` naming | The real API surface is on the `App` instance: `callServerTool` / `readServerResource` / `sendMessage({role, content})` / `updateModelContext` | Implemented against the real signatures |
| Page → tool call mechanism unexplained | Host wire methods: `mcp/uiCallTool` (plus uiReadResource / uiSubscribeResource / uiSampling / uiRegisterAppTools, etc.) | Wrapped by the SDK; no hand-written protocol |
| Monaco workers not considered | A sandboxed single-file page cannot load workers the default way | Only Monarch main-thread grammars (basic-languages) are imported; `MonacoEnvironment.getWorker` falls back to a no-op blob worker |
| `discard_file_changes` as a one-click action | Destructive operations need double protection | Two-step UI confirm + server-side `confirm===path` enforcement + `destructiveHint` annotation |

Original calls that proved correct and were kept: UI plugin route over forking the source;
`availability: "session"` limits panels to the session sidebar; fully local RPC with zero
token cost for browsing; the `zai-org/zcode-plugins` contribution path via `external_plugins/`
+ root `marketplace.json`.

## 2. Host constraint checklist (verified)

Surface manifest validation (host functions `Vno`/`KKs`):

- `ui` must be an object, `ui.surfaces` an array; each entry:
  - `id` matches `[A-Za-z0-9][A-Za-z0-9_.-]*`, ≤128 chars, unique within the plugin
  - `title` a non-empty string or a locale → string map
  - `server` must be a key declared in `mcpServers` (the host rewrites it to `plugin:<plugin>:<declared>`)
  - `resourceUri` starts with `ui://` and is ≤2048 chars
  - `availability` must literally equal `"session"`
  - `icon` optional
- Validation failures only produce warning-level `plugin_manifest_invalid` diagnostics; the surface is not registered.

MCP Apps capability negotiation: the client declares `text/html;profile=mcp-app` under
`extensions["io.modelcontextprotocol/ui"].mimeTypes` in `initialize`; the server registers the
resource with `registerAppResource` (ext-apps server helpers).

Manifest token expansion (host `_` replacement logic): `CLAUDE_PLUGIN_ROOT`/`ZCODE_PLUGIN_ROOT`
→ plugin install root, `ZCODE_PROJECT_DIR` → session working directory, `ZCODE_PLUGIN_DATA` →
plugin data directory. This plugin uses `CLAUDE_PLUGIN_ROOT` to locate build artifacts and
`ZCODE_PROJECT_DIR` as the git cwd.

## 3. Tool contracts

| Tool | Input | structuredContent | Notes |
| --- | --- | --- | --- |
| `git_status` | `{}` | `{isRepo, root, branch, upstream, ahead, behind, entries[]}` | Parses `git status --porcelain=v1 -b --untracked-files=all`; each entry `{path, oldPath, x, y, status}` |
| `get_file_diff_payload` | `{path}` | `{path, status, oldPath, isBinary, additions, deletions, original, current, truncated}` | original = `git show HEAD:<path>` (empty for added/untracked), current = working-tree file (empty when deleted); numstat provides +/− counts; binary content is never transferred; sides >800k chars are truncated |
| `discard_file_changes` | `{path, confirm}` | `{ok, path}` | Refused unless `confirm===path`; untracked → `git clean -f`, added → `git rm -f`, otherwise → `git restore --source=HEAD --staged --worktree`; renames also restore the old path |

## 4. Frontend data flow

```
useApp() completes the ui/initialize handshake
  → callServerTool(git_status)          initial load + 3s polling
  → buildTree(entries)                  folders aggregate count + worst status
                                        (conflict > deleted > modified > renamed > added > untracked)
  → select a file → callServerTool(get_file_diff_payload)  (cached; invalidated on poll refresh)
  → Monaco createDiffEditor (readOnly, switchable renderSideBySide, automatic layout)
  → revert: two-step confirm → callServerTool(discard_file_changes) → refresh
  → ask agent: app.sendMessage({role:"user", content:[...]})
```

## 5. Verification status

- [x] `npm run build`: server 1.3MB single-file bundle; web 4.0MB single-file HTML (1.0MB gzip)
- [x] `npm run smoke`: all 20 assertions pass (tool list, status parsing, diff content and
      numstat, confirmation guard, path-escape refusal, post-revert status, resource mime and content)
- [x] Manifest mirror validation (per the host validator rules): id/title/server/resourceUri/availability all valid
- [x] In-app verification against ZCode 3.16.2 (surface appears in the session sidebar, webview
      handshake, callServerTool routed to the plugin server)
