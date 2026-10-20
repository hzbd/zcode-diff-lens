# diff-lens

ZCode 会话侧栏的 Cursor 风格 Git 变更审查面板。

- **级联状态树**：未跟踪 / 新增 / 修改 / 删除 / 重命名 / 冲突逐文件标记，文件夹按"最严重状态"着色并显示变更计数 Badge，折叠状态也能一眼看到哪里变了。
- **行内 Diff**：Monaco Diff Editor，默认单栏红绿混排（可切双栏），基于 HEAD 与工作区的两方比对。
- **单文件还原**：两步确认后一键丢弃该文件全部改动（含暂存区，不可恢复）。
- **问 Agent**：把当前文件的改动摘要投递到主聊天会话，交给 Agent 审查。
- **0 Token 浏览**：面板浏览、刷新、diff 全部走本地 MCP 工具调用，不经过模型；仅"问 Agent"消耗会话 Token。

## 架构（与 ZCode 宿主实际实现对齐）

```
.zcode-plugin/plugin.json
  mcpServers.diff-lens   node ${CLAUDE_PLUGIN_ROOT}/server/dist/index.mjs
                                  cwd=${ZCODE_PROJECT_DIR}
  ui.surfaces[0]                  id=diff-lens
                                  server=diff-lens（必须与 mcpServers 键一致）
                                  resourceUri=ui://diff-lens/panel
                                  availability="session"（宿主目前仅支持该值）

server/dist/index.mjs   无依赖单文件 bundle（esbuild）
  tools:  git_status · get_file_diff_payload · discard_file_changes
  resource: ui://diff-lens/panel → text/html;profile=mcp-app

web/dist/index.html     Vite + React + Monaco，vite-plugin-singlefile 内联为单文件
  @modelcontextprotocol/ext-apps/react → useApp()
  app.callServerTool()  调 git 工具（宿主 RPC：mcp/uiCallTool）
  app.sendMessage()     "问 Agent" 投递到聊天
```

数据链路：`Webview ⇄ (postMessage/MCP Apps) ⇄ ZCode Host ⇄ (stdio JSON-RPC) ⇄ server ⇄ git CLI`，全程本地。

## 开发

```bash
npm install
npm run build     # web/dist/index.html + server/dist/index.mjs
npm run smoke     # 无宿主烟雾测试（临时 git 仓库上驱动全部工具与资源）
```

改动源码后重新 `npm run build`，然后在 ZCode 里 **Settings → Plugins → 对应市场 → 刷新/更新**。

### 目录

```
server/src/index.mjs          MCP server 源码（工具 + 面板资源）
scripts/build-server.mjs      esbuild 打包
scripts/smoke-test.mjs        端到端烟雾测试
web/src/App.tsx               主面板：状态、轮询、工具栏、还原/问 Agent
web/src/gitTree.ts            级联树构建与状态聚合
web/src/components/DiffTree.tsx  文件树 UI
web/src/components/DiffView.tsx  Monaco Diff 容器
web/vite.config.ts            单文件构建配置
docs/DESIGN.md                设计文档（含对初版方案的勘误）
```

## 安全设计

- `discard_file_changes` 为破坏性工具：`confirm` 参数必须与 `path` 完全一致才执行（服务端双确认 + UI 两步点击）。
- 所有仓库路径经归一化校验，拒绝绝对路径与 `..` 逃逸。
- diff 单侧超过 800,000 字符自动截断；二进制文件不传输内容。
- 工具标注 `readOnlyHint` / `destructiveHint`，宿主与模型均可见。

## 已知边界

- 面板挂载于会话侧栏（`availability: "session"` 是宿主当前唯一支持的取值），不会侵入原生文件树。
- 状态（展开/选中）保存在面板内存中，随会话存活；MCP Apps 2.x 没有 widgetState 接口。
- `node` 需在 PATH 上（本机开发场景满足）。面向普通用户分发时可参照 ios-simulator 插件用 ZCode Helper（`ELECTRON_RUN_AS_NODE=1`）替代。
- `ui.surfaces` / MCP Apps 属实验性能力，ZCode 或 ext-apps SDK 升级可能引入不兼容，需在目标版本实测。
