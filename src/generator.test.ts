import { describe, expect, test } from "vitest";
import { generate, meetsFloor } from "./generator";
import { analyze } from "./solver";
import { TIERS, CHANNELS } from "./constants";
describe("Cascade certificates", () => {
  for (const t of TIERS)
    test(`tier ${t.tier} satisfies geometry, roles and the measured floor`, () => {
      for (let i = 0; i < 8; i++) {
        const b = generate(t.tier);
        expect(b.cols).toBeGreaterThanOrEqual(t.minCols);
        expect(b.cols).toBeLessThanOrEqual(t.maxCols);
        expect(b.rows).toBeGreaterThanOrEqual(t.minRows);
        expect(b.rows).toBeLessThanOrEqual(t.maxRows);
        expect(b.cols * b.rows - b.nodes.length).toBeLessThanOrEqual(
          t.maxEmptyCells,
        );
        const crystals = b.nodes.filter((n) => n.kind === "crystal");
        expect(crystals.length).toBeGreaterThanOrEqual(t.minCrystals);
        expect(crystals.length).toBeLessThanOrEqual(t.maxCrystals);
        crystals.forEach((n) => {
          expect(n.charges).toBeGreaterThanOrEqual(t.minCharges);
          expect(n.charges).toBeLessThanOrEqual(t.maxCharges);
        });
        CHANNELS.slice(0, t.channels).forEach((c) =>
          expect(
            b.nodes.filter((n) => n.channel === c && n.kind === "emitter"),
          ).toHaveLength(2),
        );
        expect(meetsFloor(analyze(b, t.maxSolutions), t)).toBe(true);
      }
    }, 30000);
  test("invalid tiers fail loudly", () => expect(() => generate(6)).toThrow());
});
