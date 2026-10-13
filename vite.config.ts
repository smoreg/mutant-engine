import { defineConfig } from "vite";

// vite-node (examples, scripts, the lab's builders) reads this: workspace packages resolve to their sources.
export default defineConfig({
  cacheDir: "out/.vite",
  resolve: { conditions: ["mutant-engine:source"] },
  ssr: { resolve: { conditions: ["mutant-engine:source"] } },
});
