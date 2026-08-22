import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Vitest's 5000ms default was intermittently too tight for the first test in each file —
    // jsdom environment setup itself (not the test logic) is what's slow on a cold/loaded
    // machine, matching the same class of timeout issue documented for the backend's e2e specs
    // (backend/CLAUDE.md). Every other test in an already-warmed-up file passes well under 1s.
    testTimeout: 20_000,
  },
});
