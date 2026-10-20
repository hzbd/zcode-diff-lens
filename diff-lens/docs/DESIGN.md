# diff-lens 设计文档（修正版）

本版本基于对 ZCode 宿主（`zcode.cjs`）与 `@modelcontextprotocol/ext-apps@2.0.3` 的实际代码核查，
修正了初版方案中与实现不符的部分。所有"宿主约束"均来自反编译的校验逻辑，可复查。

## 1. 初版方案勘误表

| 初版方案 | 实际情况 | 本版处理 |
| --- | --- | --- |
| `plugin.json` 用 `mcp` 字段声明服务 | 字段名为 `mcpServers`，值为 server 名 → 配置的映射 | 已用 `mcpServers.diff-lens` |
| `ui.surfaces` 指向 `web/dist/index.html` 文件路径 | surface 由 `server`（须已在 `mcpServers` 声明）+ `resourceUri`（`ui://` 开头，≤2048 字符）组成；宿主通过 `mcp/uiReadResource` 从该 MCP server 读取 mime 为 `text/html;profile=mcp-app` 的资源并挂载 | server 注册 `ui://diff-lens/panel` 资源，返回单文件 HTML |
| Vite 默认多文件产物 | 资源以单次 read 返回，页面运行在沙箱 webview 中无法加载外部子资源 | `vite-plugin-singlefile` 内联全部 JS/CSS（产物约 4MB < 宿主 16MB 资源上限） |
| `widgetState` 持久化展开/选中 | ext-apps 2.x 无此 API | React 组件内状态（随会话存活），5 秒轮询 git_status |
| `bridge.sendMessage` 名称模糊 | 真实 API 为 `App` 实例方法：`callServerTool` / `readServerResource` / `sendMessage({role, content})` / `updateModelContext` | 已按真实签名实现 |
| 页面 → 工具调用机制未说明 | 宿主 wire 方法为 `mcp/uiCallTool`（另有 uiReadResource/uiSubscribeResource/uiSampling/uiRegisterAppTools 等） | SDK 封装，无需手写协议 |
| 未考虑 Monaco worker | 沙箱单文件页面无法按默认方式加载 worker | 仅引入 Monarch 主线程语法（basic-languages），`MonacoEnvironment.getWorker` 提供 no-op blob worker 兜底 |
| `discard_file_changes` 一键执行 | 破坏性操作需双重防护 | UI 两步确认 + 服务端 `confirm===path` 强校验 + `destructiveHint` 标注 |

初版判断正确且已保留的：UI 插件路线优于魔改源码；`availability: "session"` 只能挂会话侧栏；
全链路本地 RPC、浏览 0 Token；`zai-org/zcode-plugins` 的 `external_plugins/` + 根 `marketplace.json` 贡献路径。

## 2. 宿主约束清单（实测依据）

surface 清单校验（宿主 `Vno`/`KKs` 函数）：

- `ui` 为对象，`ui.surfaces` 为数组；每项：
  - `id` 匹配 `[A-Za-z0-9][A-Za-z0-9_.-]*`，≤128 字符，插件内唯一
  - `title` 非空字符串或 locale→string 映射
  - `server` 必须是 `mcpServers` 中已声明的键（宿主会改写为 `plugin:<插件名>:<声明名>`）
  - `resourceUri` 以 `ui://` 开头且 ≤2048 字符
  - `availability` 必须字面等于 `"session"`
  - `icon` 可选
- 校验失败仅产生 warning 级 `plugin_manifest_invalid` 诊断，surface 不注册。

MCP Apps 能力协商：客户端在 `initialize` 的 `extensions["io.modelcontextprotocol/ui"].mimeTypes`
中声明 `text/html;profile=mcp-app`；server 用 `registerAppResource`（ext-apps server helpers）注册资源。

清单 token 展开（宿主 `_` 替换逻辑）：`CLAUDE_PLUGIN_ROOT`/`ZCODE_PLUGIN_ROOT` → 插件安装根，
`ZCODE_PROJECT_DIR` → 会话工作目录，`ZCODE_PLUGIN_DATA` → 插件数据目录。本插件用
`CLAUDE_PLUGIN_ROOT` 定位构建产物、`ZCODE_PROJECT_DIR` 作为 git cwd。

## 3. 工具契约

| 工具 | 入参 | 返回 structuredContent | 说明 |
| --- | --- | --- | --- |
| `git_status` | `{}` | `{isRepo, root, branch, upstream, ahead, behind, entries[]}` | `git status --porcelain=v1 -b --untracked-files=all` 解析；每项 `{path, oldPath, x, y, status}` |
| `get_file_diff_payload` | `{path}` | `{path, status, oldPath, isBinary, additions, deletions, original, current, truncated}` | original=`git show HEAD:<path>`（新增/未跟踪为空），current=工作区文件（删除为空）；numstat 提供加减行数；二进制不传内容；单侧 >800k 字符截断 |
| `discard_file_changes` | `{path, confirm}` | `{ok, path}` | `confirm!==path` 直接拒绝；untracked→`git clean -f`，新增→`git rm -f`，其余→`git restore --source=HEAD --staged --worktree`，重命名同时还原旧路径 |

## 4. 前端数据流

```
useApp() 完成 ui/initialize 握手
  → callServerTool(git_status)          首次加载 + 每 5s 轮询
  → buildTree(entries)                  文件夹聚合 count + 最严重状态（U>D>M>R>A>?）
  → 选中文件 → callServerTool(get_file_diff_payload)（带缓存，轮询刷新时失效）
  → Monaco createDiffEditor（readOnly, renderSideBySide 可切, 自动布局）
  → 还原：两步确认 → callServerTool(discard_file_changes) → 刷新
  → 问 Agent：app.sendMessage({role:"user", content:[...]})
```

## 5. 验证状态

- [x] `npm run build`：server 1.3MB 单文件 bundle；web 4.0MB 单文件 HTML（gzip 1.0MB）
- [x] `npm run smoke`：20 项断言全过（工具列表、状态解析、diff 内容与 numstat、
      确认护栏、路径逃逸拒绝、还原后状态消失、资源 mime 与内容）
- [x] 清单镜像校验（按宿主校验函数规则）：id/title/server/resourceUri/availability 全部合法
- [ ] ZCode 应用内实测（surface 出现在侧栏、webview 握手、callServerTool 路由到插件 server）——需人工安装试用
