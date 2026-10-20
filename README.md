# zcode-diff-lens

Local dev marketplace repository for **diff-lens**, a ZCode plugin: a Cursor-style git change
review panel (cascading status tree + inline Monaco diff).

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
