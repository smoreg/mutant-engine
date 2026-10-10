/**
 * One body, one flat row: the graph in one line, every field of `derive(body)`
 * by dotted path, the strikes and the hash. The sanity audit reads bodies
 * through this and nothing else (docs/tasks/sanity/README.md, «Стенд»).
 */
import { bodyHash, bodyToText, derive, strikes, type Body } from "../index.js";

export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;

const round = (x: number): number => Math.round(x * 1000) / 1000;

/** Objects by dotted path; an array of numbers or strings joins with commas, one of objects goes as compact JSON. */
export function flatten(value: unknown, prefix: string, out: Row): Row {
  if (value === null || value === undefined) {
    out[prefix] = "";
  } else if (typeof value === "number") {
    out[prefix] = round(value);
  } else if (typeof value === "string" || typeof value === "boolean") {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    out[prefix] = value.every((v) => typeof v !== "object" || v === null) ? value.join(",") : JSON.stringify(value);
  } else if (value instanceof Map || value instanceof Set) {
    out[prefix] = JSON.stringify([...value]);
  } else {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix === "" ? k : `${prefix}.${k}`, out);
  }
  return out;
}

/** The text format without its comment lines, joined into one line. */
export function graphLine(body: Body): string {
  return bodyToText(body)
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.startsWith("#"))
    .join(" ; ");
}

export function probe(id: string, body: Body): Row {
  const d = derive(body);
  const list = strikes(body);
  const row: Row = { id, hash: bodyHash(body) };
  flatten(d, "", row);
  row["strikes.n"] = list.length;
  row["strikes.reach"] = list.reduce((r, s) => Math.max(r, s.reach), 0);
  row["strikes.force"] = round(list.reduce((r, s) => Math.max(r, s.force), 0));
  row["strikes.list"] = list.map((s) => `${s.kind}${s.bite === null ? "" : `/${s.bite}`} ${s.dice} ${s.type} r${s.reach} f${round(s.force)}`).join("; ");
  row.graph = graphLine(body);
  return row;
}

const cell = (v: Cell | undefined): string => (v === undefined ? "" : String(v).replace(/[\t\n]/g, " "));

/** The columns in first-seen order across all rows; a field one body lacks stays empty. */
export function toTsv(rows: readonly Row[]): string {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) seen.add(k), cols.push(k);
  return [cols.join("\t"), ...rows.map((r) => cols.map((c) => cell(r[c])).join("\t"))].join("\n");
}
