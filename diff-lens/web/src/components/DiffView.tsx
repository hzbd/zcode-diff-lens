import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all.js";
// Monarch-only language colorizers (main thread, no workers needed in the
// sandboxed single-file webview).
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution.js";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/php/php.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution.js";
import "monaco-editor/esm/vs/basic-languages/swift/swift.contribution.js";
import "monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js";
import type { DiffPayload } from "../mcp";

// The panel never uses language services (workers); neutralize worker
// requests so nothing breaks inside the sandboxed single-file page.
(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker: () =>
    new Worker(
      URL.createObjectURL(
        new Blob(["self.onmessage = () => {};"], { type: "application/javascript" }),
      ),
    ),
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", pyi: "python",
  go: "go", rs: "rust", java: "java",
  c: "cpp", h: "cpp", cc: "cpp", cpp: "cpp", hpp: "cpp", mm: "cpp",
  cs: "csharp",
  md: "markdown", markdown: "markdown",
  yaml: "yaml", yml: "yaml",
  xml: "xml", html: "xml", svg: "xml", xhtml: "xml",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", php: "php", rb: "ruby",
  swift: "swift", kt: "kotlin", kts: "kotlin",
};

function languageOf(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

let themesDefined = false;
function defineThemes() {
  if (themesDefined) return;
  themesDefined = true;
  monaco.editor.defineTheme("gdr-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "diffEditor.insertedTextBackground": "#1b7f3f33",
      "diffEditor.removedTextBackground": "#b3444333",
      "diffEditor.insertedLineBackground": "#1b7f3f26",
      "diffEditor.removedLineBackground": "#b3444326",
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
    },
  });
  monaco.editor.defineTheme("gdr-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "diffEditor.insertedTextBackground": "#1b7f3f2e",
      "diffEditor.removedTextBackground": "#b344432e",
      "diffEditor.insertedLineBackground": "#1b7f3f1f",
      "diffEditor.removedLineBackground": "#b344431f",
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
    },
  });
}

export function DiffView({
  payload,
  sideBySide,
  theme,
}: {
  payload: DiffPayload;
  sideBySide: boolean;
  theme: "dark" | "light";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IDiffEditor | null>(null);
  const modelsRef = useRef<{ original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null>(null);

  // Create once.
  useEffect(() => {
    if (!hostRef.current || editorRef.current) return;
    defineThemes();
    editorRef.current = monaco.editor.createDiffEditor(hostRef.current, {
      readOnly: true,
      originalEditable: false,
      enableSplitViewResizing: false,
      renderSideBySide: false,
      renderOverviewRuler: false,
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 12,
      lineHeight: 18,
      scrollBeyondLastLine: false,
      renderIndicators: true,
      diffWordWrap: "on",
      ignoreTrimWhitespace: false,
      glyphMargin: false,
      folding: false,
      renderLineHighlight: "none",
      theme: theme === "light" ? "gdr-light" : "gdr-dark",
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
      modelsRef.current?.original.dispose();
      modelsRef.current?.modified.dispose();
      modelsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap models per payload.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const lang = languageOf(payload.path);
    modelsRef.current?.original.dispose();
    modelsRef.current?.modified.dispose();
    const original = monaco.editor.createModel(payload.original, lang);
    const modified = monaco.editor.createModel(payload.current, lang);
    modelsRef.current = { original, modified };
    editor.setModel({ original, modified });
  }, [payload]);

  // Toggle layout + theme without recreating the editor.
  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);
  useEffect(() => {
    monaco.editor.setTheme(theme === "light" ? "gdr-light" : "gdr-dark");
  }, [theme]);

  return <div ref={hostRef} className="monaco-host" />;
}
