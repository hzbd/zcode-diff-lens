// Bundle the MCP server into a dependency-free single ESM file so the
// installed plugin runs with nothing but `node` on PATH.
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["server/src/index.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "server/dist/index.mjs",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
