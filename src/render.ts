import type { RenderApi } from "@clockwyrks/simple-2d";
import type { RefractState, Channel, NodeState } from "./game";
import * as C from "./constants";
import {
  cellX,
  cellY,
  completeBeam,
  menuItems,
  spent,
  targets,
} from "./simulation";

const ink = "#e7eee9",
  quiet = "#82999b",
  line = "#26383d",
  mint = "#a6e7cf";
const colors: Record<Channel, string> = {
  triangle: "#ffba78",
  square: "#80dacf",
  diamond: "#bfa5f2",
};
type Context = RenderApi["ctx"];
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = "monospace",
): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.fillText(value, x, y);
}
function stroke(
  ctx: Context,
  points: readonly (readonly [number, number])[],
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function shape(
  ctx: Context,
  channel: Channel | null,
  x: number,
  y: number,
  r: number,
): void {
  const count = channel === "triangle" ? 3 : channel === null ? 6 : 4;
  const rotation = channel === "square" ? Math.PI / 4 : -Math.PI / 2;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = rotation + (i * Math.PI * 2) / count,
      px = x + Math.cos(a) * r,
      py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function node(
  ctx: Context,
  n: NodeState,
  x: number,
  y: number,
  used = 0,
  hover = false,
): void {
  const color = n.channel ? colors[n.channel] : mint;
  if (hover) {
    ctx.beginPath();
    ctx.arc(x, y, C.NODE_HIT_R - 4, 0, Math.PI * 2);
    ctx.strokeStyle = color + "50";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = used ? 14 : 0;
  shape(ctx, n.channel, x, y, C.NODE_R - 6);
  ctx.lineWidth = n.kind === "emitter" ? 3 : 1.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = n.kind === "lens" ? color : "#101f24";
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (n.kind === "emitter") {
    shape(ctx, n.channel, x, y, 10);
    ctx.strokeStyle = color + "75";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (n.kind === "lens") {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#0b1418";
    ctx.fill();
  }
  if (n.kind === "crystal") {
    ctx.textAlign = "center";
    text(
      ctx,
      `${used}/${n.charges}`,
      x,
      y + 5,
      13,
      used === n.charges ? ink : mint,
    );
    ctx.textAlign = "left";
    for (let i = 0; i < n.charges!; i++) {
      ctx.fillStyle = i < used ? mint : "#30494c";
      ctx.fillRect(x - (n.charges! * 7 - 2) / 2 + i * 7, y + 12, 5, 3);
    }
  }
  ctx.restore();
}
function background(ctx: Context): void {
  const g = ctx.createRadialGradient(700, 350, 20, 700, 350, 780);
  g.addColorStop(0, "#14252b");
  g.addColorStop(1, "#0b1418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#839b9911";
  for (let y = 24; y < C.STAGE_H; y += 24)
    for (let x = 24; x < C.STAGE_W; x += 24) ctx.fillRect(x, y, 1, 1);
  stroke(
    ctx,
    [
      [48, 110],
      [1232, 110],
    ],
    line,
  );
  text(ctx, "R /", 48, 65, 26, mint);
  text(ctx, "REFRACT", 112, 62, 18, ink);
  text(ctx, "OPTICAL STUDIES", 112, 84, 10, quiet);
  text(ctx, "INTERACTIVE LIGHT LAB", 995, 64, 12, quiet);
  ctx.fillStyle = mint;
  ctx.fillRect(1224, 55, 7, 7);
}
function button(
  ctx: Context,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  active = false,
  index?: number,
): void {
  ctx.fillStyle = active ? "#a6e7cf" : "#122228";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? mint : "#31464b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (index !== undefined)
    text(
      ctx,
      String(index + 1).padStart(2, "0"),
      x + 18,
      y + h / 2 + 5,
      12,
      active ? "#3d655c" : quiet,
    );
  text(
    ctx,
    label,
    x + (index === undefined ? 22 : 56),
    y + h / 2 + 6,
    16,
    active ? "#102722" : ink,
  );
  if (active)
    text(ctx, "↗", x + w - 32, y + h / 2 + 7, 22, "#102722", "sans-serif");
}
function board(ctx: Context, s: RefractState): void {
  // Quiet center marks expose the lattice without implying nodes in empty cells.
  ctx.fillStyle = "#385259";
  for (let row = 0; row < s.board.rows; row++)
    for (let col = 0; col < s.board.cols; col++) {
      const x = cellX(col, s.board.cols),
        y = cellY(row, s.board.rows);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  for (const b of s.beams) {
    const pts = b.cells.map(
      (c) => [cellX(c.col, s.board.cols), cellY(c.row, s.board.rows)] as const,
    );
    if (pts.length < 2) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = colors[b.channel];
    ctx.shadowBlur = 18;
    stroke(ctx, pts, colors[b.channel] + "25", 14);
    stroke(ctx, pts, colors[b.channel], 4);
    ctx.shadowBlur = 0;
    stroke(ctx, pts, "#ffffff95", 1);
    ctx.restore();
  }
  s.board.nodes.forEach((n) =>
    node(
      ctx,
      n,
      cellX(n.col, s.board.cols),
      cellY(n.row, s.board.rows),
      n.kind === "crystal"
        ? spent(s.beams, n)
        : s.beams.some((b) =>
              b.cells.some((c) => c.col === n.col && c.row === n.row),
            )
          ? 1
          : 0,
      s.screen === "playing" &&
        Math.hypot(
          s.pointer.x - cellX(n.col, s.board.cols),
          s.pointer.y - cellY(n.row, s.board.rows),
        ) <= C.NODE_HIT_R,
    ),
  );
}
function title(ctx: Context, s: RefractState): void {
  text(ctx, "01 — A PUZZLE OF CONNECTION", 160, 167, 12, mint);
  text(ctx, C.TITLE_TEXT, 151, 255, 82, ink, "Georgia, serif");
  text(ctx, C.TAGLINE_TEXT, 160, 292, 18, quiet);
  targets(s).forEach((t, i) =>
    button(ctx, C.TITLE_ITEMS[i], t.x, t.y, t.w, t.h, s.menuIndex === i, i),
  );
  text(ctx, "24 crafted boards. Endless possibilities.", 160, 634, 13, quiet);
  // An original optical diagram: three channels thread a single neutral prism.
  const cx = 899,
    cy = 351;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 6);
  ctx.strokeStyle = "#2b484d";
  ctx.lineWidth = 1;
  ctx.strokeRect(-150, -150, 300, 300);
  ctx.strokeRect(-122, -122, 244, 244);
  ctx.restore();
  const rays: [Channel, number, number, number, number][] = [
    ["triangle", 701, 218, 1071, 430],
    ["square", 733, 463, 1105, 249],
    ["diamond", 880, 156, 936, 547],
  ];
  rays.forEach(([ch, x, y, tx, ty]) => {
    ctx.save();
    ctx.shadowColor = colors[ch];
    ctx.shadowBlur = 20;
    stroke(
      ctx,
      [
        [x, y],
        [cx, cy],
        [tx, ty],
      ],
      colors[ch],
      2,
    );
    ctx.restore();
    node(
      ctx,
      { col: 0, row: 0, kind: "emitter", channel: ch, charges: null },
      x,
      y,
    );
    node(
      ctx,
      { col: 0, row: 0, kind: "lens", channel: ch, charges: null },
      tx,
      ty,
    );
  });
  shape(ctx, null, cx, cy, 60);
  ctx.fillStyle = "#12292d";
  ctx.fill();
  ctx.strokeStyle = mint;
  ctx.lineWidth = 1;
  ctx.stroke();
  shape(ctx, null, cx, cy, 44);
  ctx.strokeStyle = "#a6e7cf55";
  ctx.stroke();
  text(ctx, "R", cx - 17, cy + 14, 38, mint, "Georgia, serif");
  text(ctx, "EMIT  /  THREAD  /  CONNECT", 770, 619, 12, quiet);
  stroke(
    ctx,
    [
      [688, 584],
      [1120, 584],
    ],
    line,
  );
}
function select(ctx: Context, s: RefractState): void {
  text(ctx, "THE CAMPAIGN", 160, 167, 30, ink, "Georgia, serif");
  text(
    ctx,
    `${String(s.solvedBoards.length).padStart(2, "0")} / ${C.CAMPAIGN_LENGTH} STUDIES COMPLETE`,
    839,
    165,
    13,
    mint,
  );
  C.SET_LABELS.forEach((label, i) => {
    text(ctx, label, 160, 247 + i * 92, 14, mint);
    text(
      ctx,
      ["ORIGINS", "DUET", "SPECTRUM", "SUMMIT"][i],
      160,
      266 + i * 92,
      10,
      quiet,
    );
  });
  targets(s).forEach((t) => {
    if (t.id === "back") {
      button(ctx, C.BACK_LABEL, t.x, t.y, t.w, t.h);
      return;
    }
    const i = Number(t.id.slice(6)) - 1,
      locked = i >= s.unlockedCount,
      done = s.solvedBoards.includes(i),
      active = s.selectIndex === i;
    ctx.fillStyle = active ? "#a6e7cf" : locked ? "#101c21" : "#1b3035";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = active ? mint : line;
    ctx.strokeRect(t.x, t.y, t.w, t.h);
    text(
      ctx,
      String(i + 1).padStart(2, "0"),
      t.x + 16,
      t.y + 32,
      22,
      active ? "#132c25" : locked ? "#5a7177" : ink,
    );
    text(
      ctx,
      done ? "✓ SOLVED" : locked ? "LOCKED" : "OPEN",
      t.x + 16,
      t.y + 56,
      10,
      active ? "#315e51" : done ? mint : quiet,
    );
  });
  text(
    ctx,
    "Choose a study. Every connection is a possibility.",
    292,
    617,
    13,
    quiet,
  );
}
function howto(ctx: Context): void {
  text(ctx, "How to draw the light", 160, 169, 34, ink, "Georgia, serif");
  const steps = [
    [
      "01",
      "FIND YOUR CHANNEL",
      "Each shape has two outlined emitters. Filled shapes are lenses.",
      "Press an emitter and drag through every lens of the same shape.",
    ],
    [
      "02",
      "FOLLOW THE LATTICE",
      "Connect neighboring nodes in any of eight directions, diagonals included.",
      "Empty cells cannot be crossed. Other channels’ nodes are off limits.",
    ],
    [
      "03",
      "SPEND THE CRYSTALS",
      "Hexagonal crystals welcome any channel. Spend every charge exactly.",
      "Each entry spends one charge; leave the crystal to finish the crossing.",
    ],
    [
      "04",
      "MAKE ROOM FOR LIGHT",
      "Each segment is used once. The two diagonals of a cell cannot cross.",
      "Refused moves leave your beam as it was. Release to keep your work.",
    ],
  ];
  steps.forEach(([num, heading, a, b], i) => {
    const y = 228 + i * 91;
    text(ctx, num, 160, y, 18, mint);
    text(ctx, heading, 211, y, 16, ink);
    text(ctx, a, 211, y + 26, 14, quiet);
    text(ctx, b, 211, y + 48, 14, quiet);
  });
  button(ctx, C.BACK_LABEL, 48, 624, 144, C.TARGET_MIN_H);
  text(
    ctx,
    "Drag backward to undo · Grab either end to resume · Grab inside to shorten",
    250,
    635,
    13,
    mint,
  );
  text(
    ctx,
    `${C.BINDINGS.clear[0].replace("Key", "")} clear  /  ESC back  /  M sound  /  Arrows + Enter choose`,
    250,
    665,
    12,
    quiet,
  );
}
function playing(ctx: Context, s: RefractState): void {
  text(
    ctx,
    s.mode === "campaign"
      ? `CAMPAIGN / ${C.SET_LABELS[Math.floor(s.boardIndex / 6)]}`
      : "CASCADE / ENDLESS STUDIES",
    48,
    154,
    12,
    mint,
  );
  text(
    ctx,
    s.mode === "campaign"
      ? `Study ${String(s.boardIndex + 1).padStart(2, "0")}`
      : "Follow the light",
    48,
    191,
    28,
    ink,
    "Georgia, serif",
  );
  text(ctx, "CHANNELS", 48, 278, 11, quiet);
  s.beams.forEach((b, i) => {
    const y = 316 + i * 77;
    node(
      ctx,
      { col: 0, row: 0, channel: b.channel, kind: "emitter", charges: null },
      70,
      y,
      0,
    );
    text(ctx, b.channel.toUpperCase(), 112, y - 3, 12, colors[b.channel]);
    text(
      ctx,
      completeBeam(s.board, b) ? "CONNECTED ✓" : "AWAITING LIGHT",
      112,
      y + 19,
      10,
      quiet,
    );
  });
  text(ctx, "PRESS. TRACE. CONNECT.", 986, 169, 12, mint);
  text(ctx, "Take your time.", 986, 198, 15, ink, "Georgia, serif");
  text(ctx, "Every path begins", 986, 227, 12, quiet);
  text(ctx, "with a little light.", 986, 246, 12, quiet);
  if (s.mode === "cascade") {
    text(ctx, `${C.HUD_SOLVED_LABEL}  ${s.solvedCount}`, 986, 313, 14, ink);
    text(ctx, `${C.HUD_TIER_LABEL}    ${s.tier}`, 986, 341, 14, ink);
  } else {
    text(ctx, `${s.boardIndex + 1} / ${C.CAMPAIGN_LENGTH}`, 986, 313, 16, ink);
    text(ctx, "CRAFTED STUDIES", 986, 338, 10, quiet);
  }
  text(ctx, "OUTLINE → EMITTER", 986, 416, 10, quiet);
  text(ctx, "SOLID   → LENS", 986, 439, 10, quiet);
  text(ctx, "HEXAGON → CRYSTAL", 986, 462, 10, quiet);
  board(ctx, s);
  targets(s).forEach((t) =>
    button(
      ctx,
      t.id === "back" ? C.BACK_LABEL : C.CLEAR_LABEL,
      t.x,
      t.y,
      t.w,
      t.h,
      s.armedTarget === t.id,
    ),
  );
  text(ctx, "ESC", 207, 669, 10, quiet);
  text(ctx, C.BINDINGS.clear[0].replace("Key", ""), 1066, 669, 10, quiet);
  text(
    ctx,
    "Drag to draw  ·  Retrace to undo  ·  Release to keep",
    399,
    693,
    11,
    quiet,
  );
}
export function render(s: RefractState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  background(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "select") select(ctx, s);
  else if (s.screen === "howto") howto(ctx);
  else if (s.screen === "playing") playing(ctx, s);
  else {
    board(ctx, s);
    text(
      ctx,
      s.screen === "complete" ? "ALL 24 STUDIES COMPLETE" : C.SOLVED_TITLE_TEXT,
      48,
      170,
      24,
      mint,
      "Georgia, serif",
    );
    text(
      ctx,
      s.mode === "campaign"
        ? `Study ${String(s.boardIndex + 1).padStart(2, "0")}`
        : `${s.solvedCount} boards solved`,
      48,
      208,
      16,
      quiet,
    );
    text(ctx, "A beautiful connection.", 48, 245, 16, ink, "Georgia, serif");
    text(ctx, "CONTINUE YOUR STUDY", 970, 254, 12, mint);
    targets(s).forEach((t, i) =>
      button(ctx, menuItems(s)[i], t.x, t.y, t.w, t.h, s.menuIndex === i),
    );
  }
  text(ctx, s.muted ? "M / SOUND OFF" : "M / SOUND ON", 1095, 705, 9, quiet);
  ctx.restore();
}
