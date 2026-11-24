import { createRoot } from "react-dom/client";
import Auth from "./Auth";
createRoot(document.getElementById("root")!).render(<Auth />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
