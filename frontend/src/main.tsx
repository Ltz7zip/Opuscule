import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/legacy-workspace.css";
import "./styles/controls.css";

if ((document as Document & { startViewTransition?: unknown }).startViewTransition === undefined) {
  document.documentElement.dataset.motion = "css";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
