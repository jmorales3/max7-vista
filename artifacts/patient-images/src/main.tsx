import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { triggerForceLogout, triggerSuspended } from "./lib/authBridge";

const _originalFetch = window.fetch.bind(window);
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await _originalFetch(...args);
  const url =
    typeof args[0] === "string"
      ? args[0]
      : args[0] instanceof Request
        ? args[0].url
        : String(args[0]);

  if (response.status === 401) {
    if (!url.includes("/api/auth/")) {
      triggerForceLogout();
    }
  } else if (response.status === 403) {
    const clone = response.clone();
    clone.json().then((body: { code?: string }) => {
      if (body.code === "ACCOUNT_SUSPENDED") {
        triggerSuspended();
      }
    }).catch(() => {});
  }

  return response;
};

createRoot(document.getElementById("root")!).render(<App />);
