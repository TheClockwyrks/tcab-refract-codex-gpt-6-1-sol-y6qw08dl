# Refract

Draw the light across a dark optical bench. Connect each channel’s two outlined emitters through every filled lens of the same shape. Shared hexagonal crystals must spend every charge. Beams may connect any adjacent nodes, including diagonals, but may never share a segment or cross diagonals.

Campaign offers 24 crafted studies in four sets. Cascade generates fresh, solvable boards across five difficulty tiers, continuing indefinitely at the summit. Progress lasts for the current session.

## Run

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Everything runs locally in the browser; no backend, credentials, downloaded artwork, or audio files are needed.

## Production

```sh
npm ci
npm run build
```

Serve `dist/` with any static web server. To inspect it locally, run `npm run preview`.

## Controls

- Mouse, pen, or touch: press an emitter and drag from node to adjacent node. Release to keep the beam.
- Retrace the last segment to undo. Grab either end to resume; grab inside a beam to shorten it. A crystal shared by multiple beams can only be grabbed when it is an end.
- Arrow keys or WASD: select menu items and campaign boards. Enter or Space: accept.
- R: clear the live board. Escape: back. M: mute. Backtick: engine diagnostics.
- Every menu and board control also has a touch target.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the Simple 2D engine over a canvas and deterministic clocks, exercise pointer and keyboard behavior, trace campaign solutions, and independently check generated boards against the tier ladder. The simulation is immutable and independent of rendering. Cascade uses randomized candidates with bounded exhaustive search; only certified candidates are emitted, with constructive starting arrangements available when a random search is rejected.

The debug surface is returned as `engine.debug`. Apply poses through `engine.apply(s => engine.debug.loadBoard(s, ["TtT"]))`, and read `engine.debug.snapshot(engine.state)`. It is not published on the browser window.

Player-facing screenshots and an engine-recorded playthrough are in `showcase/`.
