import { defineConfig } from "vite";

export default defineConfig({
  build: { rollupOptions: { input: ["index.html", "workspace/index.html"] } },
});
