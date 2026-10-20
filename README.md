# zcode-diff-lens

Local dev marketplace repository for **diff-lens**, a ZCode plugin:
Cursor-style git change review in a session side panel — cascading status tree with
per-folder badges, inline Monaco diff (single- or dual-pane), per-file revert, and
one-click hand-off to the agent.

Verified against **ZCode 3.16.2**.

## Repository layout

```
marketplace.json     local dev marketplace (points to ./diff-lens)
diff-lens/           the plugin (PR-ready for zai-org/zcode-plugins/external_plugins/)
```

All documentation — features, panel symbols, architecture, security notes, development and
install steps — lives in [diff-lens/README.md](./diff-lens/README.md).

## Install from GitHub

Open **Plugin Marketplace → Add → Add Plugin Marketplace**, paste
`https://github.com/hzbd/zcode-diff-lens`, then **Personal → diff-lens → Diff Lens → Install**.

## License

[MIT](./LICENSE)
