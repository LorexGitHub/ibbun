import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A slice's register.ts imports its server part lazily (`import("./server/index.ts")`). That part runs in
// Node and pulls in native packages (argon2, pg), so the dependency scan must not follow it into the browser build.
const skipServerParts = {
  name: "skip-slice-server-parts",
  setup(build: { onResolve: (options: { filter: RegExp }, callback: () => { path: string; external: boolean }) => void }) {
    build.onResolve({ filter: /(^|\/)server\/index\.ts$/ }, () => ({ path: "server", external: true }));
  },
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { esbuildOptions: { plugins: [skipServerParts] } },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` } },
});
