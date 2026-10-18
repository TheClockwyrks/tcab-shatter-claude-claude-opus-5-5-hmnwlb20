// Shatter — the drawing. Everything is drawn in code, in logical units, from
// the state alone; nothing here changes the state or decides an outcome.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  BULLET_R,
  CORE_R,
  FIELD_H,
  FIELD_W,
  HALO_R,
  ROCK_HEALTH,
  ROCK_RADIUS,
  type RockSize,
  SAUCER_BULLET_LIFE,
  SAUCER_BULLET_R,
  SAUCER_R,
  STAR_X,
  STAR_Y,
  TAGLINE_TEXT,
  TICK_DT,
  TITLE_TEXT,
  TORPEDO_R,
  TRAIL_TICKS,
} from "./constants";
import type {
  BulletState,
  RockState,
  SaucerState,
  ShatterState,
  ShipState,
  TorpedoState,
} from "./game";
import { menuItems, menuRect } from "./menu";
import { gravityAt } from "./vec";
import { EPS } from "./world";

type View = DeepReadonly<ShatterState>;
type Ctx = CanvasRenderingContext2D;

const FONT = "'Trebuchet MS', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace";

const COLOR = {
  text: "#eef3ff",
  dim: "#8f9bbd",
  accent: "#5ef2ff",
  ship: "#5ef2ff",
  shipFill: "#0c2333",
  flame: "#ffb347",
  rock: "#7d7368",
  rockEdge: "#cdbca9",
  crack: "#1c140f",
  saucer: "#ff4fd8",
  bullet: "#e9fbff",
  bulletTrail: "94, 242, 255",
  enemy: "#ff5a6e",
  enemyTrail: "255, 90, 110",
  torpedo: "#ffb02e",
  gold: "#ffd166",
};

// ---- Deterministic decoration ---------------------------------------------

/** A small deterministic hash in `[0, 1)`. */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface BackStar {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

const BACK_STARS: readonly BackStar[] = Array.from({ length: 170 }, (_, i) => ({
  x: hash(i, 1) * FIELD_W,
  y: hash(i, 2) * FIELD_H,
  r: 0.4 + hash(i, 3) * 1.1,
  a: 0.15 + hash(i, 4) * 0.5,
}));

/** The jagged outline of a rock, as unit-radius offsets fixed by its id. */
function rockOutline(id: number): readonly (readonly [number, number])[] {
  const n = 11;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (hash(id, i + 50) - 0.5) * 0.35;
    const r = 0.8 + hash(id, i) * 0.28;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Runs `draw` at a body's position and at each wrapped duplicate its reach crosses. */
function wrapped(
  x: number,
  y: number,
  reach: number,
  draw: (x: number, y: number) => void,
): void {
  const xs = [x];
  const ys = [y];
  if (x - reach < 0) xs.push(x + FIELD_W);
  if (x + reach > FIELD_W) xs.push(x - FIELD_W);
  if (y - reach < 0) ys.push(y + FIELD_H);
  if (y + reach > FIELD_H) ys.push(y - FIELD_H);
  for (const px of xs) for (const py of ys) draw(px, py);
}

// ---- The field ---------------------------------------------------------------

function drawSpace(ctx: Ctx, t: number): void {
  for (const [i, s] of BACK_STARS.entries()) {
    const tw = 0.75 + 0.25 * Math.sin(t * (0.6 + hash(i, 5) * 1.6) + i);
    ctx.fillStyle = `rgba(200, 215, 255, ${(s.a * tw).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
  }
}

function drawStar(ctx: Ctx, t: number): void {
  const pulse = 1 + 0.03 * Math.sin(t * 2.1);
  const halo = ctx.createRadialGradient(
    STAR_X,
    STAR_Y,
    CORE_R,
    STAR_X,
    STAR_Y,
    HALO_R * 1.5,
  );
  halo.addColorStop(0, "rgba(255, 196, 92, 0.55)");
  halo.addColorStop(0.25, "rgba(255, 140, 60, 0.22)");
  halo.addColorStop(0.6, "rgba(200, 80, 60, 0.07)");
  halo.addColorStop(1, "rgba(120, 40, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, HALO_R * 1.5, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(
    STAR_X,
    STAR_Y,
    0,
    STAR_X,
    STAR_Y,
    CORE_R * pulse,
  );
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.55, "#fff1c4");
  core.addColorStop(1, "#ffb648");
  ctx.fillStyle = core;
  ctx.shadowColor = "rgba(255, 190, 90, 0.9)";
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, CORE_R * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawRock(ctx: Ctx, r: DeepReadonly<RockState>, dimmed = false): void {
  const radius = ROCK_RADIUS[r.size];
  const outline = rockOutline(r.id);
  const full = ROCK_HEALTH[r.size];
  const damage = full > 1 ? (full - r.health) / (full - 1) : 0;
  wrapped(r.x, r.y, radius * 1.1, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r.spin);
    ctx.globalAlpha = dimmed ? 0.35 : 1;
    ctx.beginPath();
    outline.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px * radius, py * radius);
      else ctx.lineTo(px * radius, py * radius);
    });
    ctx.closePath();
    const red = Math.round(125 + damage * 70);
    const green = Math.round(115 - damage * 45);
    const blue = Math.round(104 - damage * 50);
    ctx.fillStyle = r.flash > 0 ? "#ffffff" : `rgb(${red}, ${green}, ${blue})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      r.flash > 0 ? "#ffffff" : damage > 0 ? "#ffb08a" : COLOR.rockEdge;
    ctx.stroke();

    // Cracks: one jagged fissure per hit taken, glowing faintly as it deepens.
    const hits = full - r.health;
    if (hits > 0 && r.flash <= 0) {
      ctx.lineWidth = r.size === "large" ? 2.6 : 2;
      ctx.lineCap = "round";
      for (let k = 0; k < hits; k++) {
        const base = hash(r.id, 90 + k) * Math.PI * 2;
        ctx.strokeStyle = COLOR.crack;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let j = 1; j <= 3; j++) {
          const a = base + (hash(r.id, 100 + k * 5 + j) - 0.5) * 0.9;
          const d = (radius * 0.85 * j) / 3;
          ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 120, 60, ${0.35 + damage * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.lineWidth = r.size === "large" ? 2.6 : 2;
      }
    }
    ctx.restore();
  });
}

function drawShipShape(
  ctx: Ctx,
  x: number,
  y: number,
  angle: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-16, 13);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-16, -13);
  ctx.closePath();
  ctx.restore();
}

function drawShip(ctx: Ctx, ship: DeepReadonly<ShipState>, t: number): void {
  const grace = ship.invuln > 0;
  const blink = grace && Math.floor(ship.invuln * 12) % 2 === 0;
  wrapped(ship.x, ship.y, 24, (x, y) => {
    if (ship.thrusting) {
      const flick = 0.75 + 0.25 * Math.sin(t * 70) + 0.15 * Math.sin(t * 37);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ship.angle);
      const flame = ctx.createLinearGradient(-10, 0, -10 - 22 * flick, 0);
      flame.addColorStop(0, "rgba(255, 245, 200, 0.95)");
      flame.addColorStop(0.4, "rgba(255, 170, 60, 0.85)");
      flame.addColorStop(1, "rgba(255, 70, 30, 0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-11, -6);
      ctx.lineTo(-11 - 24 * flick, 0);
      ctx.lineTo(-11, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = blink ? 0.3 : 1;
    drawShipShape(ctx, x, y, ship.angle, 1);
    ctx.fillStyle = COLOR.shipFill;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = grace ? "#ffffff" : COLOR.ship;
    ctx.shadowColor = COLOR.ship;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    if (grace) {
      ctx.save();
      ctx.strokeStyle = `rgba(94, 242, 255, ${0.25 + 0.25 * Math.sin(t * 10)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawSaucer(ctx: Ctx, sc: DeepReadonly<SaucerState>, t: number): void {
  wrapped(sc.x, sc.y, SAUCER_R * 1.6, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = COLOR.saucer;
    ctx.shadowBlur = 16;
    // Dome.
    ctx.beginPath();
    ctx.ellipse(0, -4, 10, 9, 0, Math.PI, 0);
    ctx.fillStyle = "rgba(150, 240, 255, 0.85)";
    ctx.fill();
    // Hull.
    ctx.beginPath();
    ctx.ellipse(0, 2, SAUCER_R * 1.45, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3a1240";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.saucer;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Running lights.
    for (let i = 0; i < 5; i++) {
      const on = Math.floor(t * 8 + i) % 5 === 0;
      ctx.fillStyle = on ? "#ffffff" : "#ff9cf0";
      ctx.beginPath();
      ctx.arc(-16 + i * 8, 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

/**
 * The recent path of a ballistic round, as offsets from its current position:
 * the forward step run backwards through the well for at most `TRAIL_TICKS`
 * ticks, and no further back than the round has existed.
 */
export function trailPath(
  b: DeepReadonly<BulletState>,
  lifetime: number,
): [number, number][] {
  const age = lifetime - b.life;
  const steps = Math.min(TRAIL_TICKS, Math.floor(age / TICK_DT + EPS));
  const out: [number, number][] = [[0, 0]];
  let x = b.x;
  let y = b.y;
  let vx = b.vx;
  let vy = b.vy;
  for (let i = 0; i < steps; i++) {
    x -= vx * TICK_DT;
    y -= vy * TICK_DT;
    const { ax, ay } = gravityAt(
      ((x % FIELD_W) + FIELD_W) % FIELD_W,
      ((y % FIELD_H) + FIELD_H) % FIELD_H,
    );
    vx -= ax * TICK_DT;
    vy -= ay * TICK_DT;
    out.push([x - b.x, y - b.y]);
  }
  return out;
}

function drawRound(
  ctx: Ctx,
  b: DeepReadonly<BulletState>,
  lifetime: number,
  radius: number,
  head: string,
  trail: string,
): void {
  const path = trailPath(b, lifetime);
  const reach =
    path.reduce((m, [dx, dy]) => Math.max(m, Math.abs(dx), Math.abs(dy)), 0) +
    radius +
    2;
  wrapped(b.x, b.y, reach, (x, y) => {
    ctx.save();
    ctx.lineCap = "round";
    const n = path.length - 1;
    for (let i = n; i >= 1; i--) {
      const a = path[i - 1];
      const c = path[i];
      if (!a || !c) continue;
      const f = 1 - (i - 1) / Math.max(1, TRAIL_TICKS);
      ctx.strokeStyle = `rgba(${trail}, ${(0.85 * f * f).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.4, radius * 1.8 * f);
      ctx.beginPath();
      ctx.moveTo(x + c[0], y + c[1]);
      ctx.lineTo(x + a[0], y + a[1]);
      ctx.stroke();
    }
    ctx.fillStyle = head;
    ctx.shadowColor = `rgb(${trail})`;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawTorpedo(
  ctx: Ctx,
  tp: DeepReadonly<TorpedoState>,
  t: number,
): void {
  wrapped(tp.x, tp.y, 30, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tp.heading);
    // Exhaust plume.
    const len = 18 + 6 * Math.sin(t * 50);
    const plume = ctx.createLinearGradient(-6, 0, -6 - len, 0);
    plume.addColorStop(0, "rgba(255, 240, 180, 0.95)");
    plume.addColorStop(1, "rgba(255, 90, 20, 0)");
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-6 - len, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    // Body.
    ctx.shadowColor = COLOR.torpedo;
    ctx.shadowBlur = 18;
    ctx.fillStyle = COLOR.torpedo;
    ctx.beginPath();
    ctx.moveTo(TORPEDO_R + 6, 0);
    ctx.lineTo(0, TORPEDO_R - 1);
    ctx.lineTo(-7, TORPEDO_R - 1);
    ctx.lineTo(-7, -(TORPEDO_R - 1));
    ctx.lineTo(0, -(TORPEDO_R - 1));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tp.homing ? "#ff3b1f" : "#7a5a30";
    ctx.beginPath();
    ctx.arc(TORPEDO_R + 1, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles(ctx: Ctx, s: View): void {
  for (const p of s.particles) {
    const f = Math.max(0, p.life / p.max);
    ctx.fillStyle = `hsla(${p.hue.toFixed(0)}, 100%, ${(55 + 35 * f).toFixed(0)}%, ${f.toFixed(3)})`;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
}

function drawField(ctx: Ctx, s: View, showShip: boolean): void {
  const t = s.simTime;
  drawSpace(ctx, t);
  drawStar(ctx, t);
  for (const r of s.rocks) drawRock(ctx, r);
  for (const b of s.enemyBullets)
    drawRound(
      ctx,
      b,
      SAUCER_BULLET_LIFE,
      SAUCER_BULLET_R,
      "#ffd0d6",
      COLOR.enemyTrail,
    );
  for (const b of s.bullets)
    drawRound(ctx, b, BULLET_LIFE, BULLET_R, COLOR.bullet, COLOR.bulletTrail);
  for (const tp of s.torpedoes) drawTorpedo(ctx, tp, t);
  if (s.saucer) drawSaucer(ctx, s.saucer, t);
  if (showShip) drawShip(ctx, s.ship, t);
  drawParticles(ctx, s);
}

// ---- Text and the HUD --------------------------------------------------------

function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  font = FONT,
  weight = "700",
): void {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawHud(ctx: Ctx, s: View): void {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 6;
  text(
    ctx,
    String(s.score).padStart(6, "0"),
    28,
    40,
    38,
    COLOR.text,
    "left",
    MONO,
  );

  // Ships in reserve.
  const reserve = Math.max(0, s.lives - 1);
  for (let i = 0; i < Math.min(reserve, 10); i++) {
    drawShipShape(ctx, 40 + i * 26, 84, -Math.PI / 2, 0.55);
    ctx.fillStyle = COLOR.shipFill;
    ctx.fill();
    ctx.strokeStyle = COLOR.ship;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  if (reserve > 10)
    text(ctx, `+${reserve - 10}`, 40 + 10 * 26, 84, 16, COLOR.ship, "left");

  // The torpedo glyph and its charge bar.
  const ready = s.torpedoCharge >= 1;
  ctx.save();
  ctx.translate(46, 118);
  ctx.fillStyle = ready ? COLOR.torpedo : "#5b5146";
  ctx.shadowColor = ready ? COLOR.torpedo : "transparent";
  ctx.shadowBlur = ready ? 10 : 0;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(8, -5);
  ctx.lineTo(-14, -5);
  ctx.lineTo(-18, -8);
  ctx.lineTo(-18, 8);
  ctx.lineTo(-14, 5);
  ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(
    ctx,
    ready ? "TORPEDO READY" : "TORPEDO",
    72,
    118,
    14,
    ready ? COLOR.gold : COLOR.dim,
    "left",
  );
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(28, 132, 170, 7);
  ctx.fillStyle = ready ? COLOR.torpedo : "#b07a2a";
  ctx.fillRect(28, 132, 170 * Math.max(0, Math.min(1, s.torpedoCharge)), 7);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(28.5, 132.5, 170, 7);

  if (s.wave > 0)
    text(ctx, `WAVE ${s.wave}`, FIELD_W - 28, 40, 24, COLOR.dim, "right");

  if (s.extraLifeTimer > 0) {
    const a = Math.min(1, s.extraLifeTimer * 2);
    ctx.globalAlpha = a;
    text(ctx, "EXTRA SHIP!", FIELD_W / 2, 48, 30, COLOR.gold);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBanner(ctx: Ctx, s: View): void {
  if (s.waveBanner <= 0) return;
  const a = Math.min(1, s.waveBanner * 3, 1.5 - s.waveBanner + 0.4);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.fillStyle = "rgba(5, 6, 15, 0.72)";
  ctx.fillRect(FIELD_W / 2 - 220, FIELD_H / 2 - 52, 440, 104);
  ctx.strokeStyle = "rgba(94, 242, 255, 0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD_W / 2 - 220, FIELD_H / 2 - 52, 440, 104);
  ctx.shadowColor = COLOR.accent;
  ctx.shadowBlur = 18;
  text(ctx, `WAVE ${s.wave}`, FIELD_W / 2, FIELD_H / 2 + 2, 64, COLOR.text);
  ctx.restore();
}

function drawMenu(ctx: Ctx, s: View): void {
  const items = menuItems(s.screen);
  if (!items) return;
  items.forEach((label, i) => {
    const r = menuRect(s.screen, i);
    if (!r) return;
    const on = i === s.menuIndex;
    ctx.save();
    ctx.fillStyle = on ? "rgba(94, 242, 255, 0.18)" : "rgba(10, 14, 30, 0.75)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = on ? COLOR.accent : "rgba(143, 155, 189, 0.45)";
    ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (on) {
      ctx.shadowColor = COLOR.accent;
      ctx.shadowBlur = 12;
      text(ctx, "▶", r.x + 30, r.y + r.h / 2, 18, COLOR.accent);
    }
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
      26,
      on ? "#ffffff" : COLOR.dim,
    );
    ctx.restore();
  });
}

function veil(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

/** A few dim rocks orbiting behind the title, worked out from the time alone. */
function drawTitleBackdrop(ctx: Ctx, t: number): void {
  drawSpace(ctx, t);
  drawStar(ctx, t);
  const sizes: RockSize[] = [
    "large",
    "medium",
    "small",
    "medium",
    "large",
    "small",
  ];
  sizes.forEach((size, i) => {
    const orbit = 230 + i * 55;
    const a = t * (0.12 - i * 0.012) + i * 1.9;
    const rock: RockState = {
      id: 900 + i,
      x: STAR_X + Math.cos(a) * orbit,
      y: STAR_Y + Math.sin(a) * orbit * 0.55,
      vx: 0,
      vy: 0,
      size,
      spin: t * 0.4 + i,
      health: ROCK_HEALTH[size],
      flash: 0,
    };
    drawRock(ctx, rock, true);
  });
}

function drawTitle(ctx: Ctx, s: View): void {
  drawTitleBackdrop(ctx, s.simTime);
  veil(ctx, 0.35);
  ctx.save();
  ctx.shadowColor = COLOR.accent;
  ctx.shadowBlur = 28;
  text(ctx, TITLE_TEXT, FIELD_W / 2, 220, 132, "#ffffff");
  ctx.shadowBlur = 0;
  text(
    ctx,
    TAGLINE_TEXT,
    FIELD_W / 2,
    316,
    28,
    COLOR.gold,
    "center",
    FONT,
    "600",
  );
  ctx.restore();
  drawMenu(ctx, s);
  text(
    ctx,
    "ARROWS / WASD fly  ·  SPACE fire  ·  F torpedo  ·  ENTER select",
    FIELD_W / 2,
    680,
    18,
    COLOR.dim,
    "center",
    FONT,
    "500",
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  [
    "THE GOAL",
    "Shoot every rock down through its fragments to clear the wave. A denser, faster wave follows.",
  ],
  [
    "THE STAR",
    "Its gravity pulls your bullets and the rocks, but never your ship, so shots bend around it.",
  ],
  [
    "",
    "Curve a shot past the star to hit a rock on its far side. Your ship just slides along the core.",
  ],
  [
    "",
    "A rock the star swallows is not gone: it comes back in from the edge of the field.",
  ],
  [
    "ARMOR",
    "Larger rocks are armored and take several hits to break. Cracks show how hurt a rock is.",
  ],
  [
    "THE SAUCER",
    "Every so often a saucer arrives to hunt you. Shoot it down for a big bonus.",
  ],
  [
    "TORPEDO",
    "One guided torpedo on a ten-second recharge. It homes onto the nearest body in a narrow",
  ],
  [
    "",
    "forward cone, flies true through the well, and destroys any rock outright.",
  ],
];

const HOWTO_KEYS: readonly (readonly [string, string])[] = [
  ["ARROWS or WASD", "turn and thrust"],
  ["SPACE", "fire the gun"],
  ["F", "launch the torpedo"],
  ["P or ESC", "pause"],
  ["M", "mute sound"],
  ["ENTER or SPACE", "select on menus"],
  ["ESC", "go back"],
];

function drawHowto(ctx: Ctx, s: View): void {
  drawTitleBackdrop(ctx, s.simTime);
  veil(ctx, 0.78);
  text(ctx, "HOW TO PLAY", FIELD_W / 2, 64, 48, "#ffffff");
  HOWTO_LINES.forEach(([head, body], i) => {
    const y = 132 + i * 36;
    if (head) text(ctx, head, 170, y, 18, COLOR.gold, "right");
    text(ctx, body, 190, y, 19, COLOR.text, "left", FONT, "500");
  });
  text(ctx, "CONTROLS", FIELD_W / 2, 438, 24, COLOR.accent);
  HOWTO_KEYS.forEach(([keys, does], i) => {
    const y = 476 + i * 28;
    text(ctx, keys, FIELD_W / 2 - 16, y, 19, COLOR.gold, "right", MONO);
    text(ctx, does, FIELD_W / 2 + 16, y, 19, COLOR.text, "left", FONT, "500");
  });
  text(
    ctx,
    "Press ENTER or ESC to return",
    FIELD_W / 2,
    690,
    18,
    COLOR.dim,
    "center",
    FONT,
    "500",
  );
}

/** Draws the whole frame for whichever screen the state is on. */
export function renderGame(s: View, ctx: Ctx): void {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  switch (s.screen) {
    case "title":
      drawTitle(ctx, s);
      return;
    case "howto":
      drawHowto(ctx, s);
      return;
    case "playing":
      drawField(ctx, s, true);
      drawBanner(ctx, s);
      drawHud(ctx, s);
      return;
    case "paused":
      drawField(ctx, s, true);
      drawHud(ctx, s);
      veil(ctx, 0.6);
      text(ctx, "PAUSED", FIELD_W / 2, 230, 72, "#ffffff");
      drawMenu(ctx, s);
      return;
    case "gameover":
      drawField(ctx, s, false);
      veil(ctx, 0.62);
      text(ctx, "GAME OVER", FIELD_W / 2, 210, 84, COLOR.enemy);
      text(
        ctx,
        `FINAL SCORE  ${s.score}`,
        FIELD_W / 2,
        318,
        34,
        "#ffffff",
        "center",
        MONO,
      );
      text(ctx, `REACHED WAVE ${s.wave}`, FIELD_W / 2, 376, 26, COLOR.gold);
      drawMenu(ctx, s);
      return;
  }
}
