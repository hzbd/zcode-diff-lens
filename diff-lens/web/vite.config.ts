import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The panel is mounted by the host from a single MCP resource read, so the
// build must inline JS/CSS into one self-contained index.html.
export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 20000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
