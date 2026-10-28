import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { bootMotionChrome } from "./lib/motionChrome";
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/legacy-workspace.css";
import "./styles/controls.css";
import "./styles/world-concept.css";

bootMotionChrome();

if ((document as Document & { startViewTransition?: unknown }).startViewTransition === undefined) {
  document.documentElement.dataset.motion = "css";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
