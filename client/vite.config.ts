import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// In development the browser talks to Vite (http://localhost:5173) only. Vite forwards /api and
// /socket.io to the Express server, so the app is same-origin: no CORS preflights, and the httpOnly
// refresh-token cookie "just works". In production put the same two paths behind your reverse proxy
// (Nginx, Caddy, Vercel/Netlify rewrites...) or set VITE_API_URL and configure CORS on the API.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.API_PROXY_TARGET ?? "http://localhost:4000";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget },
        "/socket.io": { target: apiTarget, ws: true },
      },
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
