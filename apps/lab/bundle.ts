/**
 * One page into one file: `vite build` of its directory, then the script and
 * the stylesheet are folded into the html, so the result opens with a double
 * click, without a server and without a single outside link. A module of its
 * own so that importing it does not also run the lab's build (decision 572).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";

export interface PageBuild {
  path: string;
  bytes: number;
  ms: number;
}

/** A script body may not contain the end of its own tag; inside JS the escaped slash means the same thing. */
function escapeScript(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

export async function buildPage(opts: { root: string; name: string; outPath: string }): Promise<PageBuild> {
  const t0 = performance.now();
  const { root, name, outPath } = opts;
  const tmp = mkdtempSync(join(tmpdir(), `${name}-build-`));
  try {
    await build({
      root,
      configFile: false,
      // The workspace packages from their sources: the lab never waits for a build.
      resolve: { conditions: ["mutant-engine:source"] },
      logLevel: "warn",
      base: "./",
      build: {
        outDir: tmp,
        emptyOutDir: true,
        modulePreload: { polyfill: false },
        cssCodeSplit: false,
        assetsInlineLimit: 1e9,
        target: "es2022",
        sourcemap: false,
        rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: `${name}.js`, assetFileNames: `${name}.[ext]` } },
      },
    });
    let html = readFileSync(join(tmp, "index.html"), "utf8");
    html = html.replace(/<script type="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/, (_, src: string) => `<script type="module">${escapeScript(readFileSync(join(tmp, src), "utf8"))}</script>`);
    html = html.replace(/<link rel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/, (_, href: string) => `<style>${readFileSync(join(tmp, href), "utf8")}</style>`);
    if (/\b(src|href)="/.test(html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script type="module">[\s\S]*?<\/script>/, ""))) {
      throw new Error(`${name} build: an outside reference survived the inlining`);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf8");
    return { path: outPath, bytes: Buffer.byteLength(html), ms: performance.now() - t0 };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
