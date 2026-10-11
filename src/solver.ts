import { CHANNELS } from "./constants";
import type { BoardState, Channel, Cell } from "./game";

interface Edge {
  to: number;
  bit: bigint;
  block: bigint;
}
export interface Route {
  cells: readonly Cell[];
  edges: bigint;
  blocked: bigint;
  uses: readonly number[];
  branches: readonly number[];
}
export interface Analysis {
  routes: readonly (readonly Route[])[];
  solutions: readonly (readonly Route[])[];
  determinedShare: number;
  branching: number;
  sharedCrystals: number;
  exhausted: boolean;
}
/** Enumerate undirected segment sets, then combine compatible channel routes.
 * Work limits reject candidates; they never certify an incomplete enumeration. */
export function analyze(
  board: BoardState,
  maxSolutions = 256,
  budget = 2000000,
): Analysis {
  const nodes = board.nodes;
  const channels = CHANNELS.filter((c) => nodes.some((n) => n.channel === c));
  const pairs: [number, number][] = [];
  nodes.forEach((a, i) =>
    nodes.forEach((b, j) => {
      if (
        j > i &&
        Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) === 1
      )
        pairs.push([i, j]);
    }),
  );
  const graph: Edge[][] = nodes.map(() => []);
  pairs.forEach(([i, j], k) => {
    const a = nodes[i],
      b = nodes[j];
    let block = 1n << BigInt(k);
    if (a.col !== b.col && a.row !== b.row)
      pairs.forEach(([p, q], l) => {
        const c = nodes[p],
          d = nodes[q];
        if (
          c.col !== d.col &&
          c.row !== d.row &&
          a.col + b.col === c.col + d.col &&
          a.row + b.row === c.row + d.row
        )
          block |= 1n << BigInt(l);
      });
    graph[i].push({ to: j, bit: 1n << BigInt(k), block });
    graph[j].push({ to: i, bit: 1n << BigInt(k), block });
  });
  let work = 0,
    exhausted = false;
  const routes = channels.map((channel) => {
    const ends = nodes
      .map((n, i) => (n.kind === "emitter" && n.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (ends.length !== 2) return [];
    const allLenses = nodes.reduce(
      (m, n, i) =>
        n.kind === "lens" && n.channel === channel ? m | (1n << BigInt(i)) : m,
      0n,
    );
    const result: Route[] = [];
    const seen = new Set<string>();
    const path = [ends[0]];
    const uses = nodes.map(() => 0);
    const branches: number[] = [];
    function moves(from: number, visited: bigint, blocked: bigint): Edge[] {
      if (from === ends[1]) return [];
      return graph[from].filter(
        (e) =>
          !(e.bit & blocked) &&
          (!nodes[e.to].channel || nodes[e.to].channel === channel) &&
          (nodes[e.to].kind === "crystal"
            ? uses[e.to] < nodes[e.to].charges!
            : !(visited & (1n << BigInt(e.to)))),
      );
    }
    function walk(
      from: number,
      visited: bigint,
      lenses: bigint,
      edges: bigint,
      blocked: bigint,
    ): void {
      if (++work > budget) {
        exhausted = true;
        return;
      }
      if (from === ends[1]) {
        if (lenses === allLenses && !seen.has(String(edges))) {
          seen.add(String(edges));
          result.push({
            cells: path.map((i) => ({ col: nodes[i].col, row: nodes[i].row })),
            edges,
            blocked,
            uses: [...uses],
            branches: [...branches],
          });
        }
        return;
      }
      const options = moves(from, visited, blocked);
      for (const e of options) {
        path.push(e.to);
        uses[e.to]++;
        branches.push(options.length);
        walk(
          e.to,
          visited | (1n << BigInt(e.to)),
          nodes[e.to].kind === "lens" ? lenses | (1n << BigInt(e.to)) : lenses,
          edges | e.bit,
          blocked | e.block,
        );
        branches.pop();
        uses[e.to]--;
        path.pop();
        if (exhausted) return;
      }
    }
    walk(ends[0], 1n << BigInt(ends[0]), 0n, 0n, 0n);
    return result;
  });
  const solutions: Route[][] = [];
  const selected: Route[] = [];
  const total = nodes.map(() => 0);
  function combine(c: number, blocked: bigint): void {
    if (++work > budget || solutions.length > maxSolutions) {
      exhausted = true;
      return;
    }
    if (c === channels.length) {
      if (nodes.every((n, i) => n.kind !== "crystal" || total[i] === n.charges))
        solutions.push([...selected]);
      return;
    }
    for (const route of routes[c]) {
      if (
        route.edges & blocked ||
        nodes.some(
          (n, i) =>
            n.kind === "crystal" && total[i] + route.uses[i] > n.charges!,
        )
      )
        continue;
      selected.push(route);
      route.uses.forEach((v, i) => (total[i] += v));
      combine(c + 1, blocked | route.blocked);
      route.uses.forEach((v, i) => (total[i] -= v));
      selected.pop();
      if (exhausted) return;
    }
  }
  if (!exhausted) combine(0, 0n);
  let determined = 0,
    length = 0,
    branchSum = 0,
    sharedCrystals = 0;
  if (solutions.length) {
    for (let c = 0; c < channels.length; c++) {
      let intersection = solutions[0][c].edges;
      solutions.forEach((s) => (intersection &= s[c].edges));
      determined += String(intersection.toString(2)).split("1").length - 1;
    }
    length = solutions[0].reduce((n, r) => n + r.cells.length - 1, 0);
    // Recount legal options with earlier channels already drawn.
    for (const solution of solutions) {
      let blocked = 0n;
      const used = nodes.map(() => 0);
      sharedCrystals = Math.max(
        sharedCrystals,
        nodes.filter(
          (n, i) =>
            n.kind === "crystal" &&
            solution.filter((r) => r.uses[i] > 0).length > 1,
        ).length,
      );
      solution.forEach((route, c) => {
        let visited = 0n;
        route.cells.forEach((cell, k) => {
          const i = nodes.findIndex(
            (n) => n.col === cell.col && n.row === cell.row,
          );
          visited |= 1n << BigInt(i);
          if (nodes[i].kind === "crystal") used[i]++;
          if (k === route.cells.length - 1) return;
          branchSum += graph[i].filter(
            (e) =>
              !(e.bit & blocked) &&
              (!nodes[e.to].channel || nodes[e.to].channel === channels[c]) &&
              (nodes[e.to].kind === "crystal"
                ? used[e.to] < nodes[e.to].charges!
                : !(visited & (1n << BigInt(e.to)))),
          ).length;
          const next = route.cells[k + 1];
          const e = graph[i].find(
            (e) => nodes[e.to].col === next.col && nodes[e.to].row === next.row,
          )!;
          blocked |= e.block;
        });
      });
    }
  }
  return {
    routes,
    solutions,
    determinedShare: length ? determined / length : 1,
    branching: length ? branchSum / (length * solutions.length) : 0,
    sharedCrystals,
    exhausted,
  };
}
export function solutionBeams(
  board: BoardState,
  solution: readonly Route[],
): { channel: Channel; cells: readonly Cell[] }[] {
  return CHANNELS.filter((c) => board.nodes.some((n) => n.channel === c)).map(
    (channel, i) => ({ channel, cells: solution[i].cells }),
  );
}
