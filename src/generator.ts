import { TIERS, CHANNELS } from "./constants";
import type { BoardState } from "./game";
import { parseBoard } from "./board";
import { analyze, type Analysis } from "./solver";
import type { Tier } from "./constants";

// Constructive starting points are only fallbacks. Every emitted arrangement,
// including reflected and padded ones, passes the same exhaustive certificate.
const seeds: readonly (readonly (readonly string[])[])[] = [
  [[".Tt", "ttT", ".tt"]],
  [["STtt", "sstt", "ssTt", "Sss."]],
  [
    ["TTSS", "2tss", "tt2s", "ttss"],
    ["ttSs", "Ttss", "t2s2", "TtsS"],
    ["ttSS", "22ss", "tTss", "Ttss"],
    ["T2ss", "t2SS", "tsss", "ttTs"],
    ["T22s", "ttSs", "ttSs", "Ttss"],
  ],
  [
    ["Tt2DS", "tt2sD", "tts2d", "TtSsd"],
    ["ttssD", "T22Sd", "Tts2d", "ttsSD"],
    ["TT2sD", "2ts2d", "ttSsd", "ttsSD"],
    ["ttssD", "2ts2d", "TtSsd", "tTS2D"],
    ["ttSDd", "ttss2", "tt22d", "TTSsD"],
  ],
  [
    ["ttSsDD", "t2ssdd", "t2sS2d", "Ttssd2", "tTssdd"],
    ["tTssdd", "tt2SdD", "tTS2dd", "ttssdD", "t2ss2d"],
    ["TTs2dD", "ttssdD", "2tSs2d", "tt2sdd", "ttsSdd"],
    ["TtSsdd", "tTsS2d", "t22sdD", "ttssDd", "ttss2d"],
  ],
];
const integer = (lo: number, hi: number): number =>
  lo + Math.floor(Math.random() * (hi - lo + 1));
export function meetsFloor(a: Analysis, t: Tier): boolean {
  return (
    !a.exhausted &&
    a.routes.length === t.channels &&
    a.routes.every((r) => r.length >= t.minRoutes) &&
    a.solutions.length >= t.minSolutions &&
    a.solutions.length <= t.maxSolutions &&
    a.determinedShare <= t.maxDeterminedShare &&
    a.branching >= t.minBranching &&
    a.sharedCrystals >= t.minSharedCrystals
  );
}
function randomCandidate(cols: number, rows: number, t: Tier): BoardState {
  const chars = Array.from(
    { length: cols * rows },
    (_, i) =>
      "tsd"[
        Math.min(t.channels - 1, Math.floor(((i % cols) * t.channels) / cols))
      ],
  );
  for (let i = 0; i < (cols * rows) / 2; i++) {
    const a = integer(0, chars.length - 1),
      b = a + (Math.random() < 0.5 ? 1 : cols);
    if (b < chars.length) [chars[a], chars[b]] = [chars[b], chars[a]];
  }
  const count = integer(t.minCrystals, t.maxCrystals);
  const positions = Array.from({ length: chars.length }, (_, i) => i);
  // Fisher–Yates, so every cell can receive a crystal with equal probability.
  for (let i = positions.length - 1; i > 0; i--) {
    const j = integer(0, i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (let i = 0; i < count; i++)
    chars[positions[i]] = String(integer(t.minCharges, t.maxCharges));
  for (const ch of "tsd".slice(0, t.channels)) {
    const available = positions.filter((i) => chars[i] === ch);
    if (available.length < 2) return parseBoard(["TT"]); // Rejected by its tier's shape check.
    chars[available[0]] = ch.toUpperCase();
    chars[available[1]] = ch.toUpperCase();
    for (const i of available.slice(2))
      if (
        Math.random() < 0.07 &&
        chars.filter((c) => c === ".").length < t.maxEmptyCells
      )
        chars[i] = ".";
  }
  return parseBoard(
    Array.from({ length: rows }, (_, r) =>
      chars.slice(r * cols, (r + 1) * cols).join(""),
    ),
  );
}
function fallback(cols: number, rows: number, t: Tier): BoardState {
  let family = seeds[t.tier - 1];
  if (t.tier === 1)
    family =
      cols === 3 && rows === 3
        ? seeds[0]
        : cols === 4 && rows === 4
          ? [[".tTt", ".ttt", "ttTt", "tttt"]]
          : cols === 4
            ? [["tTtt", "ttTt", "ttt."]]
            : [["ttt", "Ttt", "tTt", "tt."]];
  const seed = family[integer(0, family.length - 1)];
  const ox = integer(0, cols - seed[0].length),
    oy = integer(0, rows - seed.length);
  const flipX = Math.random() < 0.5,
    flipY = Math.random() < 0.5;
  return parseBoard(
    Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => {
        const x = (flipX ? cols - 1 - col : col) - ox,
          y = (flipY ? rows - 1 - row : row) - oy;
        return seed[y]?.[x] ?? ".";
      }).join(""),
    ),
  );
}
export function generate(tier: number): BoardState {
  const t = TIERS[tier - 1];
  if (!t) throw new Error("Invalid tier");
  const cols = integer(t.minCols, t.maxCols),
    rows = integer(t.minRows, t.maxRows);
  // Candidate work is bounded. Rejection does not relax any difficulty bound.
  for (let attempt = 0; ; attempt++) {
    const board =
      attempt < (tier < 3 ? 120 : 40)
        ? randomCandidate(cols, rows, t)
        : fallback(cols, rows, t);
    if (board.cols !== cols || board.rows !== rows) continue;
    if (cols * rows - board.nodes.length > t.maxEmptyCells) continue;
    if (
      CHANNELS.slice(0, t.channels).some(
        (ch) =>
          board.nodes.filter((n) => n.channel === ch && n.kind === "emitter")
            .length !== 2,
      )
    )
      continue;
    if (meetsFloor(analyze(board, t.maxSolutions, 60000), t)) return board;
  }
}
