import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Apply saved theme before render to avoid flash and ensure all routes honor it
(() => {
  try {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || (!saved && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  } catch {
    // ignore
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
