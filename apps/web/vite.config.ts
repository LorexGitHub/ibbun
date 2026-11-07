import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // A slice's register.ts imports its server part lazily, so Vite's scan reaches server-only code. The browser never runs it.
  optimizeDeps: { exclude: ["@node-rs/argon2"] },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` } },
});
