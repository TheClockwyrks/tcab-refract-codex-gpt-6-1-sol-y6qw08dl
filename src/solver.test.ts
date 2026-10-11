import { expect, test } from "vitest";
import { analyze } from "./solver";
import { parseBoard } from "./board";
import { CAMPAIGN } from "./campaign";

test("counts segment sets once and measures the two opening-board solutions", () => {
  const a = analyze(parseBoard(CAMPAIGN[0]));
  expect(a.exhausted).toBe(false);
  expect(a.routes[0]).toHaveLength(2);
  expect(a.solutions).toHaveLength(2);
  expect(a.determinedShare).toBe(0.5);
  // Both canonical drawings offer 14 legal choices over their six steps.
  expect(a.branching).toBeCloseTo(14 / 6);
  expect(a.sharedCrystals).toBe(0);
});

test("distinguishes complete channel routes from satisfied crystal solutions", () => {
  const a = analyze(parseBoard(["T2T"]));
  expect(a.routes[0]).toHaveLength(1);
  expect(a.solutions).toHaveLength(0);
});

test("opposing diagonals cannot be combined into a solution", () => {
  const a = analyze(parseBoard(["TS", "ST"]));
  expect(a.routes.map((r) => r.length)).toEqual([1, 1]);
  expect(a.solutions).toHaveLength(0);
});

test("a capped search explicitly declines to certify a candidate", () => {
  expect(analyze(parseBoard(CAMPAIGN[0]), 64, 1).exhausted).toBe(true);
  expect(analyze(parseBoard(["Tt"])).solutions).toHaveLength(0);
});
