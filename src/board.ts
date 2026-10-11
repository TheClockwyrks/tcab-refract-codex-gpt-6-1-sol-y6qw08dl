import * as C from "./constants";
import type { Cell, BoardState, BeamState } from "./game";

export const equal = (a: Cell | undefined, b: Cell | undefined): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const cellX = (col: number, cols: number): number =>
  C.BOARD_CX - ((cols - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number, rows: number): number =>
  C.BOARD_CY - ((rows - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export function parseBoard(lines: readonly string[]): BoardState {
  const cols = lines[0]?.length ?? 0;
  if (
    !cols ||
    !lines.length ||
    cols > C.GRID_MAX_COLS ||
    lines.length > C.GRID_MAX_ROWS ||
    lines.some((l) => l.length !== cols || /[^.TSDtsd123]/.test(l))
  )
    throw new Error("Invalid board notation or dimensions");
  const nodes: BoardState["nodes"][number][] = [];
  lines.forEach((line, row) =>
    [...line].forEach((char, col) => {
      if (char === ".") return;
      const crystal = /[123]/.test(char);
      nodes.push({
        col,
        row,
        kind: crystal
          ? "crystal"
          : char === char.toUpperCase()
            ? "emitter"
            : "lens",
        channel: crystal ? null : C.CHANNELS["tsd".indexOf(char.toLowerCase())],
        charges: crystal ? Number(char) : null,
      });
    }),
  );
  return { cols, rows: lines.length, nodes };
}
export function emptyBeams(board: BoardState): BeamState[] {
  return C.CHANNELS.filter((c) => board.nodes.some((n) => n.channel === c)).map(
    (channel) => ({ channel, cells: [] }),
  );
}
