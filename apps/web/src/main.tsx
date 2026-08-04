import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import "./shared/tokens.css";
import "./shared/components.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("root element not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
