import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// `base` defaults to "/" (root hosting, e.g. Netlify/Vercel and all local
// tooling). For a GitHub Pages project site it's served from /<repo>/, so the
// deploy workflow sets VITE_BASE=/Omixfit/.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
