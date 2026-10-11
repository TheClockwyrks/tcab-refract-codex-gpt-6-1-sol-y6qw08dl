import { equal, cellX, cellY, parseBoard, emptyBeams } from "./board";
import * as C from "./constants";
import { CAMPAIGN } from "./campaign";
import { generate } from "./generator";
import type {
  RefractState,
  BoardState,
  BeamState,
  Cell,
  Channel,
  PointerDevice,
  Screen,
  Mode,
} from "./game";

export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export { cellX, cellY, parseBoard } from "./board";
export function initialState(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export const spent = (beams: readonly BeamState[], cell: Cell): number =>
  beams.reduce(
    (sum, b) => sum + b.cells.filter((c) => equal(c, cell)).length,
    0,
  );
export function completeBeam(board: BoardState, beam: BeamState): boolean {
  const nodes = board.nodes.filter((n) => n.channel === beam.channel);
  const emitters = nodes.filter((n) => n.kind === "emitter");
  return (
    beam.cells.length > 1 &&
    emitters.length === 2 &&
    emitters.every(
      (n) =>
        equal(n, beam.cells[0]) || equal(n, beam.cells[beam.cells.length - 1]),
    ) &&
    nodes
      .filter((n) => n.kind === "lens")
      .every((n) => beam.cells.filter((c) => equal(c, n)).length === 1)
  );
}
export function solved(s: RefractState): boolean {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => completeBeam(s.board, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s.beams, n) === n.charges &&
          s.beams.every(
            (b) =>
              !equal(b.cells[0], n) && !equal(b.cells[b.cells.length - 1], n),
          ),
      )
  );
}
export function legal(
  board: BoardState,
  beams: readonly BeamState[],
  channel: Channel,
  to: Cell,
): boolean {
  const beam = beams.find((b) => b.channel === channel)!;
  const from = beam.cells[beam.cells.length - 1];
  if (
    !from ||
    equal(from, to) ||
    Math.abs(from.col - to.col) > 1 ||
    Math.abs(from.row - to.row) > 1
  )
    return false;
  const node = board.nodes.find((n) => equal(n, to));
  const source = board.nodes.find((n) => equal(n, from));
  if (
    !node ||
    (node.channel && node.channel !== channel) ||
    (source?.kind === "emitter" && beam.cells.length > 1)
  )
    return false;
  if (
    node.kind === "crystal"
      ? spent(beams, node) >= node.charges!
      : beam.cells.some((c) => equal(c, to))
  )
    return false;
  for (const b of beams)
    for (let i = 1; i < b.cells.length; i++) {
      const a = b.cells[i - 1],
        z = b.cells[i];
      if ((equal(a, from) && equal(z, to)) || (equal(a, to) && equal(z, from)))
        return false;
      if (
        from.col !== to.col &&
        from.row !== to.row &&
        a.col !== z.col &&
        a.row !== z.row &&
        a.col + z.col === from.col + to.col &&
        a.row + z.row === from.row + to.row
      )
        return false;
    }
  return true;
}
function replaceBeam(
  s: RefractState,
  channel: Channel,
  cells: readonly Cell[],
): RefractState {
  return {
    ...s,
    beams: s.beams.map((b) => (b.channel === channel ? { channel, cells } : b)),
  };
}
export function settle(s: RefractState): RefractState {
  if (s.screen !== "playing" || !solved(s)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return {
      ...s,
      screen: "solved",
      menuIndex: 0,
      tracing: null,
      armedTarget: null,
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / C.TIER_ADVANCE) + 1, C.MAX_TIER),
    };
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return {
    ...s,
    screen: solvedBoards.length === C.CAMPAIGN_LENGTH ? "complete" : "solved",
    menuIndex: 0,
    tracing: null,
    armedTarget: null,
    solvedBoards,
    unlockedCount: Math.max(
      s.unlockedCount,
      Math.min(s.boardIndex + 2, C.CAMPAIGN_LENGTH),
    ),
    selectIndex: s.boardIndex,
  };
}
export function load(s: RefractState, board: BoardState): RefractState {
  return {
    ...s,
    board,
    beams: emptyBeams(board),
    screen: "playing",
    menuIndex: 0,
    tracing: null,
    armedTarget: null,
  };
}
function enterCampaign(s: RefractState, index: number): RefractState {
  return load(
    { ...s, boardIndex: index, selectIndex: index },
    parseBoard(CAMPAIGN[index]),
  );
}
export const clear = (s: RefractState): RefractState => ({
  ...s,
  beams: emptyBeams(s.board),
  tracing: null,
});
export function menuItems(s: RefractState): readonly string[] {
  if (s.screen === "title") return C.TITLE_ITEMS;
  if (s.screen === "complete") return ["BOARD SELECT", "MAIN MENU"];
  if (s.screen === "solved")
    return s.mode === "cascade"
      ? C.SOLVED_ITEMS
      : s.boardIndex < C.CAMPAIGN_LENGTH - 1
        ? ["NEXT BOARD", "REPLAY", "BOARD SELECT"]
        : ["REPLAY", "BOARD SELECT"];
  return [];
}
export function targets(s: RefractState): Target[] {
  const back = { id: "back", x: 48, y: 624, w: 144, h: C.TARGET_MIN_H };
  if (s.screen === "playing")
    return [{ id: "clear", x: 1088, y: 624, w: 144, h: C.TARGET_MIN_H }, back];
  if (s.screen === "howto") return [back];
  if (s.screen === "select")
    return [
      ...Array.from({ length: C.CAMPAIGN_LENGTH }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 292 + (i % 6) * 136,
        y: 204 + Math.floor(i / 6) * 92,
        w: 116,
        h: C.TARGET_MIN_H,
      })),
      back,
    ];
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 160 : 970,
    y: s.screen === "title" ? 338 + i * 84 : 296 + i * 84,
    w: s.screen === "title" ? 360 : 262,
    h: C.TARGET_MIN_H,
  }));
}
export function action(s: RefractState, name: string): RefractState {
  if (name === "clear") return s.screen === "playing" ? clear(s) : s;
  if (name === "back") {
    if (s.screen === "title") return s;
    const campaign =
      s.mode === "campaign" &&
      ["playing", "solved", "complete"].includes(s.screen);
    return {
      ...s,
      screen: campaign ? "select" : "title",
      selectIndex: campaign ? s.boardIndex : s.selectIndex,
      menuIndex: s.screen === "howto" ? 2 : s.mode === "campaign" ? 0 : 1,
      armedTarget: null,
      tracing: null,
      beams: s.screen === "playing" ? emptyBeams(s.board) : s.beams,
    };
  }
  if (s.screen === "select") {
    const col = s.selectIndex % 6,
      row = Math.floor(s.selectIndex / 6);
    if (name === "confirm")
      return s.selectIndex < s.unlockedCount
        ? enterCampaign(s, s.selectIndex)
        : s;
    return {
      ...s,
      selectIndex:
        name === "left"
          ? row * 6 + ((col + 5) % 6)
          : name === "right"
            ? row * 6 + ((col + 1) % 6)
            : name === "up"
              ? ((row + 3) % 4) * 6 + col
              : name === "down"
                ? ((row + 1) % 4) * 6 + col
                : s.selectIndex,
    };
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (name === "up" || name === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (name !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0)
      return { ...s, mode: "campaign", screen: "select", armedTarget: null };
    if (s.menuIndex === 1)
      return load(
        { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
        generate(1),
      );
    return { ...s, screen: "howto", menuIndex: 0, armedTarget: null };
  }
  if (s.screen === "complete")
    return {
      ...s,
      screen: s.menuIndex === 0 ? "select" : "title",
      menuIndex: 0,
      armedTarget: null,
    };
  if (s.mode === "cascade")
    return load(
      s.menuIndex === 1 ? { ...s, solvedCount: 0, tier: 1 } : s,
      generate(s.menuIndex === 1 ? 1 : s.tier),
    );
  const choice = items[s.menuIndex];
  return choice === "NEXT BOARD"
    ? enterCampaign(s, s.boardIndex + 1)
    : choice === "REPLAY"
      ? enterCampaign(s, s.boardIndex)
      : { ...s, screen: "select", armedTarget: null };
}
export function pointerEvent(
  s: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let next: RefractState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" || (type === "move" && s.pointer.down),
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target && (type === "down" || !s.pointer.down)) {
    if (target.id.startsWith("menu-"))
      next = { ...next, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      next = { ...next, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    next = {
      ...next,
      armedTarget: null,
      tracing: null,
      beams: next.beams.map((b) =>
        b.cells.length < 2 ? { ...b, cells: [] } : b,
      ),
    };
    if (target && s.armedTarget === target.id)
      return action(
        next,
        target.id === "back" || target.id === "clear" ? target.id : "confirm",
      );
    return next;
  }
  if (type === "down") next = { ...next, armedTarget: target?.id ?? null };
  if (s.screen !== "playing" || target || next.armedTarget) return next;
  const node = s.board.nodes.find(
    (n) =>
      Math.hypot(
        x - cellX(n.col, s.board.cols),
        y - cellY(n.row, s.board.rows),
      ) <= C.NODE_HIT_R,
  );
  if (!node) return next;
  if (type === "down") {
    const empty =
      node.kind === "emitter"
        ? s.beams.find((b) => b.channel === node.channel && b.cells.length < 2)
        : undefined;
    if (empty)
      return {
        ...replaceBeam(next, empty.channel, [{ col: node.col, row: node.row }]),
        tracing: { channel: empty.channel },
      };
    const end = s.beams.find(
      (b) =>
        equal(b.cells[0], node) || equal(b.cells[b.cells.length - 1], node),
    );
    const passing = s.beams.filter((b) => b.cells.some((c) => equal(c, node)));
    const beam = end ?? (passing.length === 1 ? passing[0] : undefined);
    if (!beam) return next;
    const cells = equal(beam.cells[0], node)
      ? [...beam.cells].reverse()
      : beam.cells.slice(
          0,
          beam.cells.map((c) => equal(c, node)).lastIndexOf(true) + 1,
        );
    return {
      ...replaceBeam(next, beam.channel, cells),
      tracing: { channel: beam.channel },
    };
  }
  if (!next.tracing || !next.pointer.down) return next;
  const beam = next.beams.find((b) => b.channel === next.tracing!.channel)!;
  if (equal(beam.cells[beam.cells.length - 2], node))
    return replaceBeam(next, beam.channel, beam.cells.slice(0, -1));
  if (legal(next.board, next.beams, beam.channel, node))
    next = replaceBeam(next, beam.channel, [
      ...beam.cells,
      { col: node.col, row: node.row },
    ]);
  return settle(next);
}
export function snapshot(s: RefractState) {
  return {
    version: C.REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: completeBeam(s.board, b),
        },
      ]),
    ),
    solved: solved(s),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing!.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug = {
  version: C.REFRACT_DEBUG_VERSION,
  reset: (s: RefractState) => initialState(s.muted),
  snapshot,
  reconcile: (s: RefractState): RefractState => ({ ...s }),
  setMode: (s: RefractState, mode: Mode): RefractState => ({ ...s, mode }),
  setScreen: (s: RefractState, screen: Screen): RefractState => ({
    ...s,
    screen,
    armedTarget: null,
  }),
  setMenuIndex: (s: RefractState, menuIndex: number): RefractState => ({
    ...s,
    menuIndex,
  }),
  setSolvedCount: (s: RefractState, solvedCount: number): RefractState => ({
    ...s,
    solvedCount,
  }),
  setTier: (s: RefractState, tier: number): RefractState => ({ ...s, tier }),
  generateBoard: (s: RefractState, tier: number): RefractState =>
    load(s, generate(tier)),
  loadBoard: (s: RefractState, board: readonly string[]): RefractState =>
    load(s, parseBoard(board)),
  pointerDown: (
    s: RefractState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "down", x, y, device),
  pointerMove: (
    s: RefractState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "move", x, y, device),
  pointerUp: (s: RefractState, device: PointerDevice = "mouse") =>
    pointerEvent(s, "up", s.pointer.x, s.pointer.y, device),
  clear,
};
