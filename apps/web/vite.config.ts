import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { noServerParts } from "./src/no-server-parts.ts";

export default defineConfig(({ mode }) => ({
  // SHOWCASE=1 (ADR 0017) reaches the browser as VITE_SHOWCASE.
  define: { "import.meta.env.VITE_SHOWCASE": JSON.stringify(process.env.SHOWCASE ?? loadEnv(mode, "../..", "").SHOWCASE ?? "") },
  plugins: [noServerParts, react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // register.ts lazily imports each slice's server part; the browser never loads it,
  // but the dep scanner follows it into native server-only packages.
  optimizeDeps: { exclude: ["@node-rs/argon2"] },
  server: { port: 5173, proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` } },
}));
