import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// No StrictMode: the MCP Apps handshake creates real connections and should
// not be double-invoked in the host webview.
createRoot(document.getElementById("root")!).render(<App />);
