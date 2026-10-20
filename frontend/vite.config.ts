import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        main: "index.html",
        "ssr-client": "src/ssr/entry-client.tsx",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "^/feed\\.xml$": "http://127.0.0.1:8000",
      "^/w/[^/]+/feed\\.xml$": "http://127.0.0.1:8000",
    },
  },
});
