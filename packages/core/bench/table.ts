/** Plain text tables for the terminal: the bench prints numbers, nothing else. */

interface Column {
  head: string;
  /** Numbers read right, names read left. */
  right?: boolean;
}

export function table(cols: readonly Column[], rows: readonly (readonly string[])[]): string {
  const width = cols.map((c, i) => Math.max(c.head.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: readonly string[]): string =>
    cells.map((v, i) => (cols[i]?.right === true ? v.padStart(width[i]!) : v.padEnd(width[i]!))).join("  ").trimEnd();
  return [line(cols.map((c) => c.head)), width.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

export function pct(part: number, whole: number): string {
  return whole === 0 ? "-" : `${Math.round((part * 100) / whole)}%`;
}

export function num(x: number, digits = 1): string {
  return x.toFixed(digits);
}
