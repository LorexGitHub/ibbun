import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // register.ts lazily imports each slice's server part; the browser never loads it,
  // but the dep scanner follows it into native server-only packages.
  optimizeDeps: { exclude: ["@node-rs/argon2"] },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` } },
});
