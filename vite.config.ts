import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

function spaFallbackPlugin(): Plugin {
  return {
    name: "spa-fallback-plugin",
    closeBundle() {
      const distDir = path.resolve(__dirname, "./dist");
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        const indexHtml = fs.readFileSync(indexPath, "utf-8");
        // Create 404.html fallback for static hosts
        fs.writeFileSync(path.join(distDir, "404.html"), indexHtml);

        // Ensure routes have physical index.html files so static hosts serve them without 404
        const routes = ["auth", "messages", "templates", "history", "analytics", "contacts", "settings", "profile"];
        for (const route of routes) {
          const routeDir = path.join(distDir, route);
          if (!fs.existsSync(routeDir)) {
            fs.mkdirSync(routeDir, { recursive: true });
          }
          fs.writeFileSync(path.join(routeDir, "index.html"), indexHtml);
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/nvidia-integrate": {
        target: "https://integrate.api.nvidia.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia-integrate/, ""),
        secure: true,
      },
      "/api/nvidia": {
        target: "https://ai.api.nvidia.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia/, ""),
        secure: true,
      },
      "/api/runway": {
        target: "https://api.runwayml.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/runway/, ""),
        secure: true,
      },
      "/api/runway-dev": {
        target: "https://api.dev.runwayml.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/runway-dev/, ""),
        secure: true,
      },
    },
  },
  plugins: [react(), spaFallbackPlugin()],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
