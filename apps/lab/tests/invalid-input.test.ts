import { expect, it } from "vitest";
import { overridesRoute } from "../studio/overrides.js";
import { apiRoute, Store } from "../studio/db.js";

it("rejects malformed overrides without throwing or writing a file", () => {
  let writes = 0;
  for (const value of [null, [], 1, "oops", { ru: 42 }, { tags: {} }, { disabled: "false" }, { target: { toHead: "false" } }, { target: { minSize: 4 } }, { surprise: true }, { target: { kinds: [{ toString: 1 }] } }]) {
    expect(overridesRoute("PUT", { overrides: { tentacle: value } }, () => ({}), () => writes++).status).toBe(400);
  }
  expect(writes).toBe(0);
});
it("rejects a null batch and non-finite summaries before touching SQLite", () => {
  const store = new Store(":memory:");
  try {
    expect(apiRoute(store,"POST","/batch",null,"now").status).toBe(400);
    const creature = { key: "x", name: "x", source: "abyss", bodyHash: "x", seed: 1, mutations: 0, nodes: 1, heads: 1, humanoid: Infinity };
    expect(apiRoute(store,"POST","/creatures",creature,"now").status).toBe(400);
    expect(store.list().creatures).toHaveLength(0);
  } finally { store.close(); }
});
