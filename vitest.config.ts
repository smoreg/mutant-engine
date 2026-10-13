import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "out/.vite",
  // Workspace packages resolve to their sources under this condition, so tests never need a build.
  resolve: { conditions: ["mutant-engine:source"] },
  ssr: { resolve: { conditions: ["mutant-engine:source"] } },
  test: {
    // Keep seeded simulation checks usable on small CI runners. Timing budgets live in bench.
    maxWorkers: 2,
    testTimeout: 60_000,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
