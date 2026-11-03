/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    // Firebase alone is ~700 kB; it is cached after the first load.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
