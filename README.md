# zcode-diff-lens

Workspace for `diff-lens`, a ZCode plugin: a Cursor-style git change review panel (cascading status tree + inline Monaco diff). Verified against **ZCode 3.16.2**.

## Repository layout

```
marketplace.json     local dev marketplace (points to ./diff-lens)
diff-lens/           the plugin (PR-ready for zai-org/zcode-plugins/external_plugins/)
```

## Local development

```bash
cd diff-lens
npm install
npm run build    # artifacts: server/dist/index.mjs + web/dist/index.html (both are committed)
npm run smoke    # host-free end-to-end tests
```

## Install and try in ZCode

1. Open **Plugin Marketplace → Add → Add Plugin Marketplace** and paste this repo root:
   `/Users/eddie/Projects/nodejs/zcode-diff-lens`
2. **Personal → diff-lens → Diff Lens → Install**
3. Open a session in any **git repository** — the "Diff Lens" panel appears in the session sidebar; edit a few files and try the tree, the diff, revert and "Ask Agent".
4. Update flow: change source → `npm run build` → refresh in the marketplace page → update the plugin.

Manage installed plugins under **Settings → Plugins**.

Tip: the native right-side code preview pane is host UI, independent of this plugin — close it
once via its title-bar button and the layout persists (stays closed until you click a file).

## License

[MIT](./LICENSE)
