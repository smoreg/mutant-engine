/**
 * The findings of the sanity audit in one table: every `out/sanity/<facet>.tsv`
 * read, duplicates of one (rule, stat) folded into one line that keeps the
 * worst severity, sorted high → low (docs/tasks/sanity/README.md, «Формат находки»).
 */

export const COLUMNS = ["id", "фасет", "тело", "стат", "есть", "ожидалось", "тяжесть", "правило", "предложение"] as const;
export type Finding = Record<(typeof COLUMNS)[number], string>;
export interface Folded extends Finding {
  /** Findings folded into this line, and their ids. */
  n: number;
  ids: string;
}

const RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };
const rank = (s: string): number => RANK[s] ?? 3;

/** Lines of a findings file; the header and blank lines are skipped, a short line is padded. */
export function parse(text: string): Finding[] {
  const out: Finding[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    if (cells[0] === "id") continue;
    out.push(Object.fromEntries(COLUMNS.map((c, i) => [c, (cells[i] ?? "").trim()])) as Finding);
  }
  return out;
}

export function fold(findings: readonly Finding[]): Folded[] {
  const by = new Map<string, Folded>();
  for (const f of findings) {
    const key = `${f.правило}\u0000${f.стат}`;
    const had = by.get(key);
    if (had === undefined) {
      by.set(key, { ...f, n: 1, ids: f.id });
      continue;
    }
    const n = had.n + 1;
    const ids = `${had.ids},${f.id}`;
    by.set(key, rank(f.тяжесть) < rank(had.тяжесть) ? { ...f, n, ids } : { ...had, n, ids });
  }
  return [...by.values()].sort((x, y) => rank(x.тяжесть) - rank(y.тяжесть) || y.n - x.n || x.id.localeCompare(y.id));
}

export function toTsv(rows: readonly Folded[]): string {
  const cols = [...COLUMNS, "n", "ids"] as const;
  return [cols.join("\t"), ...rows.map((r) => cols.map((c) => String(r[c])).join("\t"))].join("\n") + "\n";
}

/** At most `limit` lines for a reader: the counts, then the worst lines first. */
export function summary(rows: readonly Folded[], limit = 40): string {
  const count = (s: string): number => rows.filter((r) => r.тяжесть === s).length;
  const head = `high ${count("high")}  mid ${count("mid")}  low ${count("low")}  (${rows.length} rules, ${rows.reduce((a, r) => a + r.n, 0)} findings)`;
  const cut = (s: string, w: number): string => (s.length > w ? `${s.slice(0, w - 1)}…` : s);
  const lines = rows.map((r) => `${r.тяжесть.padEnd(4)} ×${String(r.n).padEnd(3)} ${cut(r.стат, 18).padEnd(18)} ${cut(`${r.есть} vs ${r.ожидалось}`, 16).padEnd(16)} ${cut(r.правило, 70)}`);
  const room = limit - 1;
  if (lines.length <= room) return [head, ...lines].join("\n");
  return [head, ...lines.slice(0, room - 1), `… ${lines.length - room + 1} more in summary.tsv`].join("\n");
}
