/**
 * The studio on a local server: the page from apps/lab with vite (edits
 * reload it) and `/api` over the SQLite store.
 *
 *   npm run studio                 -> http://localhost:8794
 *   PORT=9000 MUTANT_STUDIO_DB=./x.sqlite npm run studio
 *
 * The base is shared by every worktree unless MUTANT_STUDIO_DB says otherwise.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { Store, apiRoute } from "./db.js";
import { overridesRoute, parseOverridesSource } from "./overrides.js";

/** The editor writes the catalog's edits into the repository the studio runs from. */
const OVERRIDES = resolve(import.meta.dirname, "..", "..", "..", "packages", "core", "content", "overrides.ts");

const port = Number(process.env.PORT ?? 8794);
const path = resolve(process.env.MUTANT_STUDIO_DB ?? join(homedir(), ".mutant-engine", "studio.sqlite"));
const store = new Store(path);

const server = await createServer({
  root: resolve(import.meta.dirname, ".."),
  configFile: false,
  resolve: { conditions: ["mutant-engine:source"] },
  server: { port, strictPort: true },
  plugins: [
    {
      name: "studio-api",
      configureServer(s) {
        // The page was out/lab.html behind a static server; the old address still opens it.
        s.middlewares.use((req, res, next) => {
          if (req.url === "/lab.html" || req.url?.startsWith("/lab.html#")) {
            res.statusCode = 302;
            res.setHeader("location", "/");
            res.end();
            return;
          }
          next();
        });
        s.middlewares.use("/api/overrides", (req, res) => {
          let text = "";
          req.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")));
          req.on("end", () => {
            let answer;
            try {
              const body = text === "" ? undefined : (JSON.parse(text) as unknown);
              answer = overridesRoute(req.method ?? "GET", body, () => parseOverridesSource(readFileSync(OVERRIDES, "utf8")) ?? {}, (t) => writeFileSync(OVERRIDES, t, "utf8"));
            } catch (e) {
              answer = { status: 400, json: { problems: [e instanceof Error ? e.message : String(e)] } };
            }
            res.statusCode = answer.status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(answer.json));
          });
        });
        s.middlewares.use("/api", (req, res) => {
          let text = "";
          req.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")));
          req.on("end", () => {
            let answer;
            try {
              const body = text === "" ? undefined : (JSON.parse(text) as unknown);
              answer = apiRoute(store, req.method ?? "GET", (req.url ?? "/").split("?")[0]!, body, new Date().toISOString());
            } catch (e) {
              answer = { status: 400, json: { error: e instanceof Error ? e.message : String(e) } };
            }
            res.statusCode = answer.status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(answer.json));
          });
        });
      },
    },
  ],
});
await server.listen();
console.log(`studio: http://localhost:${port}  ->  ${path}`);
