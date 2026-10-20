# zcode-diff-lens

`diff-lens` ZCode 插件的工作仓库：Cursor 风格 Git 变更审查面板（级联状态树 + Monaco 行内 diff）。

## 仓库结构

```
marketplace.json                  本地测试市场（指向 ./diff-lens）
diff-lens/                插件本体（可直接 PR 到 zai-org/zcode-plugins/external_plugins/）
```

## 本地开发

```bash
cd diff-lens
npm install
npm run build    # 产物：server/dist/index.mjs + web/dist/index.html（均需提交）
npm run smoke    # 无宿主端到端测试
```

## 在 ZCode 中安装试用

1. 打开 **插件市场 → 添加 → 添加插件市场**，粘贴本仓库根目录：
   `/Users/eddie/Projects/nodejs/zcode-diff-lens`
2. **个人 → dev-zcode-diff-lens → Diff Lens → 安装**
3. 在任意 **Git 仓库** 中打开会话，侧栏应出现「Diff Lens 变更审查」面板；改动若干文件后查看树、diff、还原与"问 Agent"。
4. 更新流程：改源码 → `npm run build` → 市场页刷新 → 插件更新。

管理入口：**Settings → Plugins**。
