/**
 * The editor tab without the page: the palette (the parts tab's entries, one
 * per kind of the model's tables), what a drag of a part lights on a body (the
 * elements its `attachChoices` sit on), the command a drop makes, what the
 * knife takes from an element, the numbers at the side and the names of the
 * history. Everything the tab does is a command of the model; this file only
 * reads the model and names things. No DOM.
 */
import {
  eatableRu,
  COVERS,
  MEMBRANES,
  ORGANS,
  SUMMARY_RU,
  anatomy,
  attachChoices,
  attachRu,
  bulk,
  ceilingOf,
  choiceElements,
  controlCap,
  controlLoad,
  derive,
  fmt,
  mass,
  mutationRu,
  operationsFor,
  segmentName,
  summarize,
  targetName,
  upkeep,
  validate,
  type AttachChoice,
  type AttachCommand,
  type Body,
  type Command,
  type Ids,
  type Operation,
  type Run,
} from "@mutant-engine/core";
import { EDIT_CMD_RU, EDIT_TEXT, HOW_RU } from "./edit-text.js";
import { filterParts, partEntries, type PartEntry, type PartTable } from "./parts.js";

export interface EditFilter {
  table?: PartTable;
  q?: string;
}

/** The palette under a filter: the parts tab's list, by category and by name. */
export function paletteEntries(f: EditFilter): PartEntry[] {
  return filterParts(partEntries(), { ...(f.table === undefined ? {} : { table: f.table }), ...(f.q === undefined ? {} : { q: f.q }) });
}

export interface DropPlan {
  part: string;
  choices: AttachChoice[];
  /** Element id to the choices sitting on it. */
  byElement: Map<number, AttachChoice[]>;
  /** The elements to light. */
  lit: Ids;
}

/** What a drag of the part lights on the body: every element one of its places sits on. */
export function dropPlan(body: Body, part: string): DropPlan {
  const choices = attachChoices(body, part);
  const byElement = new Map<number, AttachChoice[]>();
  for (const c of choices) {
    for (const id of choiceElements(body, c)) byElement.set(id, [...(byElement.get(id) ?? []), c]);
  }
  const lit: Ids = { nodes: [], segments: [], membranes: [] };
  for (const id of [...byElement.keys()].sort((a, b) => a - b)) {
    if (body.nodes[id] !== undefined) lit.nodes.push(id);
    else if (body.segments[id] !== undefined) lit.segments.push(id);
  }
  return { part, choices, byElement, lit };
}

export function choicesAt(plan: DropPlan, id: number): AttachChoice[] {
  return plan.byElement.get(id) ?? [];
}

export function attachCommand(part: string, c: AttachChoice): AttachCommand {
  return { t: "attach", part, how: c.how, target: c.target };
}

/** A line of the drop menu: the way and the place. */
export function choiceLabel(body: Body, c: AttachChoice): string {
  return `${HOW_RU[c.how]} → ${targetName(body, c.target)}`;
}

// ---------------------------------------------------------------- the knife

/** What the knife does to the element: the operations of the part it belongs to, the organs at a node or on a segment first. */
export function removalsAt(body: Body, el: { node: number } | { segment: number }): Operation[] {
  const parts = anatomy(body);
  const out: Operation[] = [];
  if ("segment" in el) {
    const part = parts.find((p) => p.segment === el.segment);
    if (part !== undefined) out.push(...operationsFor(body, part));
    return out;
  }
  // A node: the part it tips (its endings), or the core when it is where your brain sits.
  for (const part of parts) {
    if (part.tip !== el.node) continue;
    const ops = operationsFor(body, part);
    out.push(...ops.filter((o) => o.command.t === "excise" && o.command.at === "end"));
    out.push(...ops.filter((o) => !(o.command.t === "excise" && o.command.at === "end")));
    break;
  }
  return out;
}

/** What a drop into the trash does: the whole part off cleanly, else the gentlest cut there is. */
export function trashOp(body: Body, el: { node: number } | { segment: number }): Operation | null {
  const ops = removalsAt(body, el);
  return ops.find((o) => o.kind === "remove") ?? ops.find((o) => o.kind === "excise" || o.kind === "trim") ?? ops[0] ?? null;
}

// ---------------------------------------------------------------- the side

export interface EditStats {
  summary: [string, string][];
  budgets: [string, string][];
  errors: string[];
}

export function editStats(body: Body): EditStats {
  const s = summarize(derive(body));
  const summary: [string, string][] = Object.entries(s).map(([k, v]) => [SUMMARY_RU[k] ?? k, fmt(v)]);
  const budgets: [string, string][] = [
    [EDIT_TEXT.meat, `${fmt(mass(body))} / ${fmt(body.meat)} / ${fmt(ceilingOf(body))}`],
    [EDIT_TEXT.upkeep, fmt(upkeep(body))],
    [EDIT_TEXT.control, `${fmt(controlLoad(body))} / ${fmt(controlCap(body))}`],
    [EDIT_TEXT.bulk, fmt(bulk(body))],
  ];
  return { summary, budgets, errors: validate(body) };
}

export interface HistoryRow {
  /** Index into the state's commands. */
  index: number;
  text: string;
  rejected: boolean;
  /** The body's hash after the command. */
  hash: string;
}

function commandText(before: Body, c: Command): string {
  switch (c.t) {
    case "attach":
      return `${attachRu(c.part)} · ${HOW_RU[c.how]} → ${targetName(before, c.target)}`;
    case "mutate":
      return `${EDIT_CMD_RU.mutate}${c.id === undefined ? "" : ` ${mutationRu(c.id)}`}${c.n > 1 ? ` ×${c.n}` : ""}`;
    case "place":
      return `${EDIT_CMD_RU.place} ${mutationRu(c.id)} → ${targetName(before, c.target)}`;
    case "excise": {
      if (c.at === "limb") return `${EDIT_CMD_RU.excise} ${segmentName(before, c.id)}`;
      const list = c.at === "end" ? before.nodes[c.id]?.ends : c.at === "cavity" ? before.segments[c.id]?.cavity : before.segments[c.id]?.growths;
      const outer = list?.[c.slot];
      const o = c.sub === undefined ? outer : outer?.contents?.[c.sub];
      return `${EDIT_CMD_RU.excise} ${o === undefined ? "" : ORGANS[o.kind].ru}`;
    }
    case "cut":
      return `${EDIT_CMD_RU.cut} ${segmentName(before, c.segment)}`;
    case "reshape": {
      const r = c.r;
      if (r.t === "membrane") {
        const m = before.membranes[r.membrane];
        return `${EDIT_CMD_RU.reshape} ${m === undefined ? "" : MEMBRANES[m.kind].ru}`;
      }
      if (r.t === "cover") {
        const s = before.segments[r.segment];
        return `${EDIT_CMD_RU.reshape} ${s === undefined ? "" : COVERS[s.cover].ru}`;
      }
      return EDIT_CMD_RU.unfuse;
    }
    case "unmutate":
      return `${EDIT_CMD_RU.unmutate} ${c.step}`;
    case "tick":
      return `${EDIT_CMD_RU.tick} ${c.n}`;
    case "separate":
      return EDIT_CMD_RU.separate;
    case "sway":
      return EDIT_CMD_RU.sway;
    case "eat":
      return `${EDIT_CMD_RU.eat} ${eatableRu(c.part)}${c.n > 1 ? ` ×${c.n}` : ""}`;
  }
}

/** One row per command of the run, named on the body before it, marked when the model refused it. */
export function historyRows(r: Run): HistoryRow[] {
  return r.state.commands.map((c, index) => {
    const steps = r.steps.filter((s) => s.command === index);
    const first = steps[0];
    const last = steps[steps.length - 1];
    const before = first?.before ?? r.steps[0]!.body;
    const rejected = steps.length > 0 && steps.every((s) => (s.event.kind === "attach" || s.event.kind === "place" ? s.event.result === null : s.event.kind === "mutate" ? s.event.result === null : false));
    return { index, text: commandText(before, c), rejected, hash: last?.hash ?? r.steps[0]!.hash };
  });
}
