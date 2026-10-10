import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "out/.vite",
  // Workspace packages resolve to their sources under this condition, so tests never need a build.
  resolve: { conditions: ["mutant-engine:source"] },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
