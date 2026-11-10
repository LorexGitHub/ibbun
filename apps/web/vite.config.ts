import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // register.ts lazily imports each slice's server part; the browser never loads it,
  // but the dep scanner follows it into native server-only packages.
  optimizeDeps: { exclude: ["@node-rs/argon2"] },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` } },
});
