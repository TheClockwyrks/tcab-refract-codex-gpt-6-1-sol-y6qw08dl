import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import {
  initialState,
  debug,
  pointerEvent,
  action,
  settle,
  completeBeam,
  spent,
  solved,
} from "./simulation";
import { render } from "./render";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

export type RefractDebugApi = typeof debug;
export const BACKGROUND = "#0b1418";
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    C.ACTIONS.forEach((name) =>
      api.input.register(name, { keys: [...C.BINDINGS[name]] }),
    );
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 1 ? "triangle" : "sine",
        freq: [480, 360, 660, 880, 200][i],
        freqTo: [720, 180, 990, 1320, 80][i],
        durationMs: [65, 80, 170, 320, 150][i],
        gain: 0.1,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("cols", (s) => s.board.cols);
    api.diagnostics.register("rows", (s) => s.board.rows);
    C.CHANNELS.forEach((channel) =>
      api.diagnostics.register(channel, (s) => {
        const b = s.beams.find((b) => b.channel === channel);
        return b
          ? `${Math.max(0, b.cells.length - 1)} / ${completeBeam(s.board, b) ? "complete" : "open"}`
          : "absent";
      }),
    );
    for (let row = 0; row < C.GRID_MAX_ROWS; row++)
      api.diagnostics.register(
        `crystals row ${row}`,
        (s) =>
          s.board.nodes
            .filter((n) => n.kind === "crystal" && n.row === row)
            .map((n) => `${n.col}: ${spent(s.beams, n)}/${n.charges}`)
            .join(" · ") || "-",
      );
    api.diagnostics.register("solved", (s) => solved(s));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [initialState(), debug];
  },
  update(state: DeepReadonly<RefractState>, api, dt) {
    let next: RefractState = { ...state, simTime: state.simTime + dt };
    const cues = new Set<string>();
    function observe(
      before: RefractState,
      after: RefractState,
      cleared = false,
    ): void {
      const a = before.beams.reduce(
          (n, b) => n + Math.max(0, b.cells.length - 1),
          0,
        ),
        b = after.beams.reduce(
          (n, b) => n + Math.max(0, b.cells.length - 1),
          0,
        );
      if (cleared) {
        if (a) cues.add(C.CUES.clear);
      } else if (before.board === after.board) {
        if (b > a) cues.add(C.CUES.connect);
        if (b < a) cues.add(C.CUES.retract);
      }
      after.beams.forEach((b) => {
        if (
          completeBeam(after.board, b) &&
          !before.beams.some(
            (a) => a.channel === b.channel && completeBeam(before.board, a),
          )
        )
          cues.add(C.CUES.channelComplete);
      });
      if (
        before.screen === "playing" &&
        (after.screen === "solved" || after.screen === "complete")
      )
        cues.add(C.CUES.solved);
    }
    for (const name of C.ACTIONS)
      if (api.input.pressed(name)) {
        if (name === "mute") api.audio.setMuted(!api.audio.muted());
        else {
          const before = next;
          next = action(next, name);
          observe(
            before,
            next,
            name === "clear" && before.screen === "playing",
          );
        }
      }
    for (const p of api.input.pointerSamples())
      if (p.primary && (p.button === null || p.button === "primary")) {
        const before = next;
        next = pointerEvent(next, p.type, p.x, p.y, p.device);
        observe(
          before,
          next,
          p.type === "up" && before.armedTarget === "clear",
        );
      }
    api.input.pointerPressed();
    api.input.pointerReleased();
    const before = next;
    next = settle(next);
    observe(before, next);
    cues.forEach((cue) => api.audio.play(cue));
    const p = api.input.pointer();
    return {
      ...next,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
    };
  },
  render,
};
