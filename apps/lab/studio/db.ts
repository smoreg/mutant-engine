/**
 * The studio's store: the creatures the generator made and the lab saved,
 * in one local SQLite file through `node:sqlite`. A creature is its lab state
 * (the hash string, unique) and the numbers a shelf shows; the body is
 * replayed from the state, never stored. `apiRoute` is the whole HTTP api
 * as a function of a method, a path and a parsed body, so the server is only
 * plumbing and the tests call it directly. Time comes in from the caller.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import type { CreatureSummary, GenParams } from "../batch.js";

export interface CreatureRecord extends CreatureSummary {
  id?: number;
  /** Null for a creature saved from the lab. */
  batch?: number | null;
  created?: string;
  star?: boolean;
}

interface BatchRecord {
  id: number;
  label: string;
  params: GenParams | null;
  created: string;
  /** Creatures still in the batch. */
  count: number;
}

export interface Listing {
  batches: BatchRecord[];
  creatures: CreatureRecord[];
}

// Vite 5 does not know `node:sqlite` as a builtin and would try to resolve it as a package.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  params TEXT,
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  batch INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  seed INTEGER NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  mutations INTEGER NOT NULL,
  nodes INTEGER NOT NULL,
  heads INTEGER NOT NULL,
  humanoid REAL NOT NULL,
  body_hash TEXT NOT NULL,
  star INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS creatures_batch ON creatures(batch);
`;

interface CreatureRow {
  id: number;
  key: string;
  batch: number | null;
  seed: number;
  name: string;
  source: string;
  mutations: number;
  nodes: number;
  heads: number;
  humanoid: number;
  body_hash: string;
  star: number;
  created: string;
}

export class Store {
  private readonly db: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  private upsert(c: CreatureSummary, batch: number | null, now: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO creatures (key, batch, seed, name, source, mutations, nodes, heads, humanoid, body_hash, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET batch = COALESCE(excluded.batch, creatures.batch), name = excluded.name, source = excluded.source, created = excluded.created
         RETURNING id`,
      )
      .get(c.key, batch, c.seed, c.name, c.source, c.mutations, c.nodes, c.heads, c.humanoid, c.bodyHash, now) as { id: number };
    return row.id;
  }

  /** A batch and its creatures in one transaction; a creature already kept moves to it with its star. Batches left empty go. */
  saveBatch(batch: { label: string; params: GenParams | null }, creatures: readonly CreatureSummary[], now: string): number {
    this.db.exec("BEGIN");
    try {
      const { id } = this.db.prepare("INSERT INTO batches (label, params, created) VALUES (?, ?, ?) RETURNING id").get(batch.label, batch.params === null ? null : JSON.stringify(batch.params), now) as { id: number };
      for (const c of creatures) this.upsert(c, id, now);
      this.pruneBatches();
      this.db.exec("COMMIT");
      return id;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** One creature without a batch: saved from the lab. One already in a batch stays there. */
  saveOne(c: CreatureSummary, now: string): number {
    const id = this.upsert(c, null, now);
    this.pruneBatches();
    return id;
  }

  setStar(id: number, on: boolean): void {
    this.db.prepare("UPDATE creatures SET star = ? WHERE id = ?").run(on ? 1 : 0, id);
  }

  remove(id: number): void {
    this.db.prepare("DELETE FROM creatures WHERE id = ?").run(id);
    this.pruneBatches();
  }

  private pruneBatches(): void {
    this.db.exec("DELETE FROM batches WHERE id NOT IN (SELECT DISTINCT batch FROM creatures WHERE batch IS NOT NULL)");
  }

  /** Newest batch first; creatures by batch, then by seed. */
  list(): Listing {
    const batches = (this.db.prepare("SELECT b.id, b.label, b.params, b.created, COUNT(c.id) AS count FROM batches b JOIN creatures c ON c.batch = b.id GROUP BY b.id ORDER BY b.id DESC").all() as unknown as { id: number; label: string; params: string | null; created: string; count: number }[]).map((b) => ({
      id: b.id,
      label: b.label,
      params: b.params === null ? null : (JSON.parse(b.params) as GenParams),
      created: b.created,
      count: b.count,
    }));
    const creatures = (this.db.prepare("SELECT * FROM creatures ORDER BY batch IS NULL, batch DESC, seed, id").all() as unknown as CreatureRow[]).map((r) => ({
      id: r.id,
      key: r.key,
      batch: r.batch,
      seed: r.seed,
      name: r.name,
      source: r.source,
      mutations: r.mutations,
      nodes: r.nodes,
      heads: r.heads,
      humanoid: r.humanoid,
      bodyHash: r.body_hash,
      star: r.star === 1,
      created: r.created,
    }));
    return { batches, creatures };
  }
}

interface ApiAnswer {
  status: number;
  json: unknown;
}

function isSummary(x: unknown): x is CreatureSummary {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  return typeof c.key === "string" && typeof c.name === "string" && typeof c.source === "string" && typeof c.bodyHash === "string" && ["seed", "mutations", "nodes", "heads", "humanoid"].every((k) => typeof c[k] === "number");
}

/** The api under `/api`: GET /health, GET /creatures, POST /batch, POST /creatures, PATCH and DELETE /creatures/:id. */
export function apiRoute(store: Store, method: string, path: string, body: unknown, now: string): ApiAnswer {
  const bad = (why: string): ApiAnswer => ({ status: 400, json: { error: why } });
  if (method === "GET" && path === "/health") return { status: 200, json: { ok: true } };
  if (method === "GET" && path === "/creatures") return { status: 200, json: store.list() };
  if (method === "POST" && path === "/batch") {
    const b = body as { label?: unknown; params?: unknown; creatures?: unknown } | undefined;
    if (b === undefined || typeof b.label !== "string" || !Array.isArray(b.creatures) || !b.creatures.every(isSummary)) return bad("a batch needs a label and creatures");
    const id = store.saveBatch({ label: b.label, params: (b.params ?? null) as GenParams | null }, b.creatures, now);
    return { status: 200, json: { id, saved: b.creatures.length } };
  }
  if (method === "POST" && path === "/creatures") {
    if (!isSummary(body)) return bad("not a creature");
    return { status: 200, json: { id: store.saveOne(body, now) } };
  }
  const m = /^\/creatures\/(\d+)$/.exec(path);
  if (m !== null) {
    const id = Number(m[1]);
    if (method === "DELETE") {
      store.remove(id);
      return { status: 200, json: { ok: true } };
    }
    if (method === "PATCH") {
      const star = (body as { star?: unknown } | undefined)?.star;
      if (typeof star !== "boolean") return bad("only a star can change");
      store.setStar(id, star);
      return { status: 200, json: { ok: true } };
    }
  }
  return { status: 404, json: { error: "no such route" } };
}
