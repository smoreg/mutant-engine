import { expect, it } from "vitest";
import { MUTATIONS } from "../content/mutations.js";
import { mutationLabel, mutationDescription, organKindLabel, coverLabel } from "../labels.js";

it("provides both languages for each catalog row without a global locale", () => {
  for (const row of MUTATIONS) {
    for (const locale of ["en", "ru"] as const) {
      expect(mutationLabel(row.id, locale).length).toBeGreaterThan(0);
      expect(mutationDescription(row.id, locale).length).toBeGreaterThan(0);
    }
  }
  expect(organKindLabel("greatBrain")).toBe("great brain");
  expect(organKindLabel("eye", "ru")).toBe("глаз");
  expect(coverLabel("dragonScales")).toBe("dragon scales");
  expect(mutationLabel("custom-row")).toBe("custom-row");
});
