/**
 * The page's side of the studio's store: `npm run studio` serves the page
 * and `/api` over SQLite. Opened as a file or from a static server the page
 * has no api, and every call says so instead of failing loudly.
 */
import type { CreatureSummary, GenParams } from "./batch.js";

export interface StoredCreature extends CreatureSummary {
  id: number;
  batch: number | null;
  created: string;
  star: boolean;
}

interface StoredBatch {
  id: number;
  label: string;
  params: GenParams | null;
  created: string;
  count: number;
}

export interface Listing {
  batches: StoredBatch[];
  creatures: StoredCreature[];
}

export const NO_STORE = "хранилище не подключено: запусти npm run studio";

let known: boolean | null = null;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`./api${path}`, init);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Whether the page is served with a store; asked once. */
export async function hasStore(): Promise<boolean> {
  if (known !== null) return known;
  if (location.protocol === "file:") return (known = false);
  try {
    await call("GET", "/health");
    known = true;
  } catch {
    known = false;
  }
  return known;
}

export function listCreatures(): Promise<Listing> {
  return call("GET", "/creatures");
}

export function saveBatch(label: string, params: GenParams, creatures: CreatureSummary[]): Promise<{ id: number; saved: number }> {
  return call("POST", "/batch", { label, params, creatures });
}

export function saveCreature(c: CreatureSummary): Promise<{ id: number }> {
  return call("POST", "/creatures", c);
}

export function starCreature(id: number, star: boolean): Promise<unknown> {
  return call("PATCH", `/creatures/${id}`, { star });
}

export function removeCreature(id: number): Promise<unknown> {
  return call("DELETE", `/creatures/${id}`);
}
