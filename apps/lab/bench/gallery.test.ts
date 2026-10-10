import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGallery } from "./body-gallery.js";

describe("body gallery", () => {
  it("builds 60 bodies into one self-contained html in at most 5 s", () => {
    const dir = mkdtempSync(join(tmpdir(), "body-gallery-"));
    try {
      const out = join(dir, "body-gallery.html");
      const t0 = performance.now();
      const result = buildGallery(out, 60);
      const ms = performance.now() - t0;
      expect(result.bodies).toBe(60);
      expect(ms).toBeLessThanOrEqual(5000);
      const html = readFileSync(out, "utf8");
      expect(html.match(/<article class="card/g)).toHaveLength(60);
      expect(html.match(/class="silhouette"/g)).toHaveLength(60);
      expect(html).toContain("8: 1 -шея:1/1 кожа- 2");
      expect(html).toContain("#0b0a09");
      expect(html).not.toMatch(/<(script|link|img)\s[^>]*(src|href)="(https?:)?\/\//);
      expect(html).not.toMatch(/@import|url\(http/);
      expect(html).toContain("<!doctype html>");
      console.log(`gallery: ${result.bodies} bodies, ${ms.toFixed(0)} ms, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${result.unreadable.length} flagged`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
