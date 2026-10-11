import { afterEach, describe, expect, test } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type RefractState, type Cell } from "./game";
import {
  action,
  cellX,
  cellY,
  debug,
  initialState,
  legal,
  parseBoard,
  load,
  targets,
} from "./simulation";
import { analyze, solutionBeams } from "./solver";
import { CAMPAIGN } from "./campaign";
import * as C from "./constants";

const engines: ReturnType<typeof createEngine<RefractState, typeof debug>>[] =
  [];
async function setup(step = 20) {
  const events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  function key(code: string) {
    const down = new Event("keydown");
    Object.assign(down, { code, repeat: false });
    events.dispatchEvent(down);
    const up = new Event("keyup");
    Object.assign(up, { code });
    events.dispatchEvent(up);
  }
  function pointer(
    type: string,
    x: number,
    y: number,
    device = "mouse",
    primary = true,
    id = 1,
  ) {
    const e = new Event(type);
    Object.assign(e, {
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: device,
      isPrimary: primary,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    });
    events.dispatchEvent(e);
  }
  return { engine, key, pointer };
}
afterEach(() => engines.splice(0).forEach((e) => e.destroy()));
function at(s: RefractState, c: Cell): [number, number] {
  return [cellX(c.col, s.board.cols), cellY(c.row, s.board.rows)];
}
function down(s: RefractState, col: number, row: number): RefractState {
  return debug.pointerDown(s, ...at(s, { col, row }));
}
function move(s: RefractState, col: number, row: number): RefractState {
  return debug.pointerMove(s, ...at(s, { col, row }));
}
function posed(lines: readonly string[]): RefractState {
  return debug.loadBoard(initialState(), lines);
}

describe("engine integration", () => {
  test("registers every action, cue and current diagnostics; renders all screens", async () => {
    const { engine } = await setup();
    expect(engine.debug.version).toBe(C.REFRACT_DEBUG_VERSION);
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const) {
      engine.apply((s) => debug.loadBoard(s, CAMPAIGN[0]));
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
      expect(engine.diagnostics().find((d) => d.name === "screen")?.value).toBe(
        screen,
      );
      expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    }
    expect(engine.state.simTime).toBeCloseTo(0.12);
  });
  test("keyboard menus wrap, lock, clear, mute and return correctly", async () => {
    const { engine, key } = await setup();
    key("ArrowUp");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(2);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    key("Escape");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(2);
    key("ArrowDown");
    await engine.advance(1);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("select");
    key("ArrowLeft");
    await engine.advance(1);
    expect(engine.state.selectIndex).toBe(5);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("select");
    key("ArrowRight");
    await engine.advance(1);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    engine.apply((s) => down(s, 1, 0));
    engine.apply((s) => move(s, 2, 0));
    key("KeyR");
    await engine.advance(1);
    expect(engine.state.beams[0].cells).toHaveLength(0);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("select");
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
  });
  test("ordered pointer samples draw and solve inside one frame; cues deduplicate", async () => {
    const { engine, pointer } = await setup();
    engine.apply((s) => debug.loadBoard(s, ["TtT"]));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    const start = at(engine.state, { col: 0, row: 0 });
    pointer("pointerdown", ...start);
    pointer("pointermove", ...at(engine.state, { col: 1, row: 0 }));
    pointer("pointermove", ...at(engine.state, { col: 2, row: 0 }));
    pointer("pointerup", ...at(engine.state, { col: 2, row: 0 }));
    await engine.advance(1);
    expect(engine.state.screen).toBe("solved");
    expect(engine.state.tracing).toBeNull();
    expect(cues).toEqual([
      C.CUES.connect,
      C.CUES.channelComplete,
      C.CUES.solved,
    ]);
  });
  test("primary touch draws while a second contact changes nothing", async () => {
    const { engine, pointer } = await setup();
    engine.apply((s) => debug.loadBoard(s, ["TttT"]));
    pointer("pointerdown", ...at(engine.state, { col: 0, row: 0 }), "touch");
    pointer(
      "pointerdown",
      ...at(engine.state, { col: 3, row: 0 }),
      "touch",
      false,
      2,
    );
    pointer("pointermove", ...at(engine.state, { col: 1, row: 0 }), "touch");
    await engine.advance(1);
    expect(engine.state.beams[0].cells).toHaveLength(2);
    expect(engine.state.pointer.device).toBe("touch");
  });
  test("simulation time depends only on deltas, and pointer snapshot mirrors engine", async () => {
    const { engine } = await setup();
    await engine.advance(10);
    expect(engine.state.simTime).toBeCloseTo(0.2);
    engine.setClock(new SequenceClock([5, 35]));
    await engine.advance(10);
    expect(engine.state.simTime).toBeCloseTo(0.4);
  });
  test("clear cue fires only for segments, never a lone start", async () => {
    const { engine, key } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => debug.loadBoard(s, ["TttT"]));
    engine.apply((s) => down(s, 0, 0));
    key("KeyR");
    await engine.advance(1);
    expect(cues).toEqual([]);
    engine.apply((s) => move(down(s, 0, 0), 1, 0));
    key("KeyR");
    await engine.advance(1);
    expect(cues).toEqual([C.CUES.clear]);
  });
});

describe("beam transactions", () => {
  test("an empty start disappears on release; distant and other-channel nodes refuse", () => {
    let s = posed(["Tt.ST"]);
    s = down(s, 0, 0);
    expect(s.beams[0].cells).toHaveLength(1);
    s = move(s, 3, 0);
    expect(s.beams[0].cells).toHaveLength(1);
    s = debug.pointerUp(s);
    expect(s.beams[0].cells).toHaveLength(0);
    s = posed(["TS", "tT"]);
    s = down(s, 0, 0);
    s = move(s, 1, 0);
    expect(s.beams[0].cells).toHaveLength(1);
  });
  test("retract, shorten and orient either end without modifying earlier states", () => {
    const original = posed(["TtttT"]);
    let s = down(original, 0, 0);
    s = move(s, 1, 0);
    s = move(s, 2, 0);
    s = move(s, 3, 0);
    s = debug.pointerUp(s);
    const saved = s;
    s = down(s, 2, 0);
    expect(s.beams[0].cells).toHaveLength(3);
    s = move(s, 1, 0);
    expect(s.beams[0].cells).toHaveLength(2);
    s = debug.pointerUp(s);
    s = down(s, 0, 0);
    expect(s.beams[0].cells[1]).toEqual({ col: 0, row: 0 });
    expect(saved.beams[0].cells).toHaveLength(4);
    expect(original.beams[0].cells).toHaveLength(0);
  });
  test("crystals spend on entry, refund on retraction, and incomplete crossings do not solve", () => {
    let s = posed(["T1T"]);
    s = down(s, 0, 0);
    s = move(s, 1, 0);
    expect(debug.snapshot(s).board.nodes[1].spent).toBe(1);
    expect(debug.snapshot(s).solved).toBe(false);
    s = move(s, 0, 0);
    expect(debug.snapshot(s).board.nodes[1].spent).toBe(0);
    s = move(s, 1, 0);
    s = move(s, 2, 0);
    expect(s.screen).toBe("solved");
  });
  test("diagonals and segments are exclusive; emitters never pass through", () => {
    const board = parseBoard(["TS", "ST"]);
    const beams = [
      {
        channel: "triangle" as const,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 1 },
        ],
      },
      { channel: "square" as const, cells: [{ col: 1, row: 0 }] },
    ];
    expect(legal(board, beams, "square", { col: 0, row: 1 })).toBe(false);
    expect(legal(board, beams, "triangle", { col: 0, row: 0 })).toBe(false);
    let s = posed(["TtT", "..t"]);
    s = move(move(down(s, 0, 0), 1, 0), 2, 0);
    expect(s.screen).toBe("playing");
    expect(move(s, 2, 1).beams[0].cells).toHaveLength(3);
  });
  test("a shared crystal at neither end is ambiguous; an end takes priority", () => {
    const s = {
      ...posed(["T2S", "T.S"]),
      beams: [
        {
          channel: "triangle" as const,
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 0, row: 1 },
          ],
        },
        {
          channel: "square" as const,
          cells: [
            { col: 2, row: 0 },
            { col: 1, row: 0 },
            { col: 2, row: 1 },
          ],
        },
      ],
    };
    expect(down(s, 1, 0).tracing).toBeNull();
    const end = {
      ...s,
      beams: [
        s.beams[0],
        { ...s.beams[1], cells: s.beams[1].cells.slice(0, 2) },
      ],
    };
    expect(down(end, 1, 0).tracing?.channel).toBe("square");
  });
  test("last crystal occurrence is kept on shortening and exhausted charges refuse entry", () => {
    const board = parseBoard(["T2t", "t.t", "Ttt"]);
    let s = load(initialState(), board);
    for (const [i, c] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 0],
      [0, 1],
    ].entries())
      s = i === 0 ? down(s, c[0], c[1]) : move(s, c[0], c[1]);
    expect(
      debug.snapshot(s).board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(2);
    expect(legal(board, s.beams, "triangle", { col: 1, row: 0 })).toBe(false);
    s = debug.pointerUp(s);
    s = down(s, 1, 0);
    expect(s.beams[0].cells).toHaveLength(5);
  });
});

describe("campaign and debug contract", () => {
  test("all authoritative campaign boards are solvable; progression and replays preserve unlocks", () => {
    let s = initialState();
    CAMPAIGN.forEach((lines, i) => {
      s = load({ ...s, boardIndex: i }, parseBoard(lines));
      const analysis = analyze(s.board, 1000, 4000000);
      expect(analysis.solutions.length).toBeGreaterThan(0);
      const beams = solutionBeams(s.board, analysis.solutions[0]);
      for (const b of beams) {
        s = debug.pointerDown(s, ...at(s, b.cells[0]));
        for (const c of b.cells.slice(1)) s = debug.pointerMove(s, ...at(s, c));
        s = debug.pointerUp(s);
      }
      expect(s.screen).toBe(i === 23 ? "complete" : "solved");
      expect(s.unlockedCount).toBe(Math.min(i + 2, 24));
      expect(s.solvedBoards).toHaveLength(i + 1);
    });
    expect(action(s, "confirm").screen).toBe("select");
    s = action({ ...s, menuIndex: 1 }, "confirm");
    expect(s.screen).toBe("title");
  }, 30000);
  test("pointer targets arm, cancel, highlight and activate each screen", () => {
    let s = initialState();
    const t = targets(s)[0];
    s = debug.pointerMove(s, t.x + 10, t.y + 10);
    s = debug.pointerDown(s, t.x + 10, t.y + 10, "pen");
    expect(s.armedTarget).toBe("menu-0");
    s = debug.pointerMove(s, 0, 0);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("select");
    const b = targets(s)[0];
    s = debug.pointerDown(s, b.x + 10, b.y + 10, "touch");
    s = debug.pointerUp(s, "touch");
    expect(s.screen).toBe("playing");
    const back = targets(s).find((t) => t.id === "back")!;
    s = debug.pointerDown(s, back.x + 10, back.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("select");
  });
  test("all target rectangles are fingertip sized, in bounds and disjoint", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        const ts = targets({ ...initialState(), screen, mode });
        for (const a of ts) {
          expect(a.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
          expect(a.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
          expect(a.x + a.w).toBeLessThanOrEqual(C.STAGE_W);
          expect(a.y + a.h).toBeLessThanOrEqual(C.STAGE_H);
          for (const b of ts)
            if (a !== b)
              expect(
                a.x + a.w <= b.x ||
                  b.x + b.w <= a.x ||
                  a.y + a.h <= b.y ||
                  b.y + b.h <= a.y,
              ).toBe(true);
        }
      }
  });
  test("poses are immediate and independent; reconcile is idempotent; invalid notation throws", () => {
    let s = { ...initialState(), simTime: 5, muted: true };
    s = debug.setMode(s, "cascade");
    s = debug.setSolvedCount(s, 11);
    expect(s.tier).toBe(1);
    s = debug.setTier(s, 4);
    expect(s.solvedCount).toBe(11);
    s = debug.setMenuIndex(s, 17);
    expect(s.menuIndex).toBe(17);
    s = debug.loadBoard(s, ["TtT"]);
    s = move(move(down(s, 0, 0), 1, 0), 2, 0);
    expect(s.solvedCount).toBe(12);
    expect(s.tier).toBe(3);
    expect(s.screen).toBe("solved");
    const snap = debug.snapshot(s);
    expect(debug.snapshot(debug.reconcile(s))).toEqual(snap);
    expect(debug.reconcile(debug.reconcile(s))).toEqual(s);
    s = debug.clear(s);
    expect(s.screen).toBe("solved");
    expect(s.beams[0].cells).toHaveLength(0);
    s = debug.reset(s);
    expect(s).toEqual(initialState(true));
    for (const lines of [
      [],
      ["?"],
      ["TT", "T"],
      ["TTTTTTTT"],
      Array(7).fill("T"),
    ])
      expect(() => debug.loadBoard(s, lines)).toThrow();
  });
  test("Cascade restarts from tier one and keeps campaign progress", () => {
    let s: RefractState = {
      ...initialState(),
      solvedBoards: [0, 1],
      unlockedCount: 3,
      boardIndex: 1,
      selectIndex: 1,
    };
    s = action({ ...s, menuIndex: 1 }, "confirm");
    expect(s.mode).toBe("cascade");
    expect(s.solvedBoards).toEqual([0, 1]);
    expect(s.tier).toBe(1);
    s = action(
      { ...s, screen: "solved", solvedCount: 8, tier: 2, menuIndex: 1 },
      "confirm",
    );
    expect(s.solvedCount).toBe(0);
    expect(s.tier).toBe(1);
    s = action(s, "back");
    expect(s.menuIndex).toBe(1);
    expect(s.screen).toBe("title");
  });
});
