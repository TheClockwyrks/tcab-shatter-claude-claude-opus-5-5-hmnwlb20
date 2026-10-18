// Shatter — the render-free simulation core.
//
// Everything that decides an outcome on the field lives here: building a fresh
// game, the per-tick order `specs/simulation.md` fixes, the waves, the saucer
// cadence, and every collision. Nothing here reads a canvas, the frame loop, or
// wall-clock time; a tick is a function of the state and the held controls.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  BULLET_R,
  CORE_R,
  CUES,
  type CueName,
  EXTRA_LIFE_STEP,
  FACE_UP,
  FIELD_H,
  FIELD_W,
  FIRE_INTERVAL_TICKS,
  HIT_FLASH_TIME,
  INVULN_TIME,
  MAX_BULLETS,
  MUZZLE_SPEED,
  ROCK_CHILD,
  ROCK_HEALTH,
  ROCK_RADIUS,
  ROCK_SPEED_MAX,
  ROCK_SPEED_MIN,
  type RockSize,
  SAFE_X,
  SAFE_Y,
  SAUCER_AIM_ERROR,
  SAUCER_BULLET_LIFE,
  SAUCER_BULLET_R,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_GAP_MAX,
  SAUCER_GAP_MIN,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_INTERVAL,
  SAUCER_WEAVE_SPEED,
  SCORE_LARGE,
  SCORE_MEDIUM,
  SCORE_SAUCER,
  SCORE_SMALL,
  SHIP_DRAG_HALFLIFE,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SHIP_TURN,
  SPLIT_KICK,
  STAR_X,
  STAR_Y,
  START_LIVES,
  TICK_DT,
  TORPEDO_CONE,
  TORPEDO_LIFE,
  TORPEDO_R,
  TORPEDO_RECHARGE,
  TORPEDO_SCATTER,
  TORPEDO_SPEED,
  TORPEDO_TURN,
  WAVE_BANNER_TIME,
  WAVE_BASE_ROCKS,
  WAVE_MIN_SHIP_DIST,
  WAVE_MIN_STAR_DIST,
  WAVE_SPEED_CAP,
  WAVE_SPEED_STEP,
} from "./constants";
import type {
  BulletState,
  FieldEdge,
  RockState,
  SaucerEdge,
  SaucerState,
  ShatterState,
  ShipState,
  TorpedoState,
} from "./game";
import type { Particle } from "./types";
import {
  gravityAt,
  normalizeAngle,
  separation,
  sweptContact,
  uniform,
  wrapCoord,
  wrappedDistance,
} from "./vec";

/** Tolerance for a timer reaching zero after repeated `TICK_DT` subtraction. */
export const EPS = 1e-9;

/** How close the saucer's mind lets it come to the star before it steers off. */
export const SAUCER_AVOID_R = 120;

/** The nose offset a shot or a torpedo leaves the ship from. */
export const NOSE = SHIP_R - 1;

/** Score paid for each rock size. */
export const ROCK_SCORE: Readonly<Record<RockSize, number>> = {
  large: SCORE_LARGE,
  medium: SCORE_MEDIUM,
  small: SCORE_SMALL,
};

/** The held controls one tick reads. */
export interface TickInput {
  readonly left: boolean;
  readonly right: boolean;
  readonly thrust: boolean;
  readonly fire: boolean;
  readonly torpedo: boolean;
}

export const IDLE_INPUT: TickInput = {
  left: false,
  right: false,
  thrust: false,
  fire: false,
  torpedo: false,
};

type Mut<T> = { -readonly [K in keyof T]: T[K] };
type View = DeepReadonly<ShatterState>;

/** The read-only view, taken back as the plain state it was built as. */
export function thaw(s: View): ShatterState {
  return s as ShatterState;
}

/** A ship at rest at the safe point, as a life begins. */
export function freshShip(invuln: number): ShipState {
  return {
    x: SAFE_X,
    y: SAFE_Y,
    vx: 0,
    vy: 0,
    angle: FACE_UP,
    thrusting: false,
    invuln,
    collision: true,
    fireCooldown: 0,
  };
}

/** The title-screen state every declared field is reset to. */
export function initialState(muted: boolean): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: freshShip(0),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
    fireHeld: false,
    fireQueued: false,
    torpedoQueued: false,
    extraLifeTimer: 0,
    menuPress: null,
    particles: [],
  };
}

/**
 * A new game, as `specs/progression.md` opens one: three ships, no score, wave
 * one with its banner running, a cleared field, and the saucer cadence from the
 * start. The world gates and any posed draws carry over.
 */
export function newGame(s: View): ShatterState {
  return {
    ...thaw(s),
    screen: "playing",
    menuIndex: 0,
    score: 0,
    lives: START_LIVES,
    wave: 1,
    waveBanner: WAVE_BANNER_TIME,
    ship: freshShip(0),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    saucerClock: 0,
    saucerDue: SAUCER_FIRST_DELAY,
    fireHeld: false,
    fireQueued: false,
    torpedoQueued: false,
    extraLifeTimer: 0,
    menuPress: null,
    particles: [],
  };
}

/** The base speed multiplier wave `n`'s rocks take. */
export function waveSpeedFactor(n: number): number {
  return 1 + Math.min(WAVE_SPEED_CAP, WAVE_SPEED_STEP * (n - 1));
}

/** A fresh gap until the next saucer, drawn uniformly. */
export function drawSaucerGap(): number {
  return uniform(SAUCER_GAP_MIN, SAUCER_GAP_MAX);
}

/** The cosmetic spin rate of a rock, fixed by its id. */
export function spinRate(id: number): number {
  const h = ((id * 2654435761) >>> 0) / 4294967296;
  return (h - 0.5) * 1.8;
}

/** A rock at full health for its size. */
export function makeRock(
  id: number,
  size: RockSize,
  x: number,
  y: number,
  vx: number,
  vy: number,
): RockState {
  return {
    id,
    x: wrapCoord(x, FIELD_W),
    y: wrapCoord(y, FIELD_H),
    vx,
    vy,
    size,
    spin: (id * 1.7) % (Math.PI * 2),
    health: ROCK_HEALTH[size],
    flash: 0,
  };
}

/** A saucer arriving from `edge` at row `y`, heading into the field. */
export function makeSaucer(
  id: number,
  edge: SaucerEdge,
  y: number,
  weave: 1 | -1,
): SaucerState {
  return {
    id,
    x: edge === "left" ? 0 : FIELD_W - 1e-3,
    y: wrapCoord(y, FIELD_H),
    vx: edge === "left" ? SAUCER_SPEED : -SAUCER_SPEED,
    vy: 0,
    mind: true,
    gun: true,
    travel: true,
    weave,
    fireClock: SAUCER_FIRE_INTERVAL,
    weaveClock: SAUCER_WEAVE_INTERVAL,
    age: 0,
  };
}

/** A position on `edge`, a fraction `u` of the way along it. */
export function edgePoint(
  edge: FieldEdge,
  u: number,
): { x: number; y: number; nx: number; ny: number } {
  switch (edge) {
    case "top":
      return { x: u * FIELD_W, y: 0, nx: 0, ny: 1 };
    case "bottom":
      return { x: u * FIELD_W, y: FIELD_H - 1e-3, nx: 0, ny: -1 };
    case "left":
      return { x: 0, y: u * FIELD_H, nx: 1, ny: 0 };
    case "right":
      return { x: FIELD_W - 1e-3, y: u * FIELD_H, nx: -1, ny: 0 };
  }
}

const FIELD_EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

/** A body's start-of-tick position and its displacement over the tick. */
interface Sweep {
  readonly x: number;
  readonly y: number;
  readonly mx: number;
  readonly my: number;
}

const STILL_STAR: Sweep = { x: STAR_X, y: STAR_Y, mx: 0, my: 0 };

/** When, as a fraction of the tick, two swept bodies first come within `reach`. */
function contact(a: Sweep, b: Sweep, reach: number): number | null {
  const { dx, dy } = separation(a.x, a.y, b.x, b.y);
  return sweptContact(dx, dy, b.mx - a.mx, b.my - a.my, reach);
}

/** Moves a body by its velocity over one tick and wraps it, recording the sweep. */
function move<T extends { x: number; y: number; vx: number; vy: number }>(
  b: T,
): { body: T; sweep: Sweep } {
  const mx = b.vx * TICK_DT;
  const my = b.vy * TICK_DT;
  return {
    body: {
      ...b,
      x: wrapCoord(b.x + mx, FIELD_W),
      y: wrapCoord(b.y + my, FIELD_H),
    },
    sweep: { x: b.x, y: b.y, mx, my },
  };
}

/** Applies one tick of the well to a ballistic body's velocity. */
function pull<T extends { x: number; y: number; vx: number; vy: number }>(
  b: T,
): T {
  const { ax, ay } = gravityAt(b.x, b.y);
  return { ...b, vx: b.vx + ax * TICK_DT, vy: b.vy + ay * TICK_DT };
}

/** A burst of sparks at a position, for an explosion. */
function burst(
  x: number,
  y: number,
  count: number,
  speed: number,
  hue: number,
  vx = 0,
  vy = 0,
): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.25 + Math.random() * 0.75);
    const life = 0.35 + Math.random() * 0.55;
    out.push({
      x,
      y,
      vx: vx * 0.5 + Math.cos(a) * sp,
      vy: vy * 0.5 + Math.sin(a) * sp,
      life,
      max: life,
      hue: hue + (Math.random() - 0.5) * 30,
      size: 1 + Math.random() * 2.2,
    });
  }
  return out;
}

const MAX_PARTICLES = 500;

/**
 * Advances the field by exactly one tick of `TICK_DT`, in the order
 * `specs/simulation.md` fixes, and records every cue the tick raises in `cues`.
 *
 * The caller runs it only while the screen is `playing`; `simTime` and the
 * accumulator are the frame's business.
 */
export function tick(
  state: View,
  input: TickInput,
  cues: Set<CueName>,
): ShatterState {
  const s: Mut<ShatterState> = { ...thaw(state) };
  let nextId = s.nextId;
  const fresh = (): number => nextId++;
  const particles: Particle[] = [];

  // ---- Timers ------------------------------------------------------------
  let ship: Mut<ShipState> = {
    ...s.ship,
    invuln: Math.max(0, s.ship.invuln - TICK_DT),
    fireCooldown: Math.max(0, s.ship.fireCooldown - 1),
  };
  let bullets: Mut<BulletState>[] = s.bullets
    .map((b) => ({ ...b, life: b.life - TICK_DT }))
    .filter((b) => b.life > EPS);
  let enemyBullets: Mut<BulletState>[] = s.enemyBullets
    .map((b) => ({ ...b, life: b.life - TICK_DT }))
    .filter((b) => b.life > EPS);
  let torpedoes: Mut<TorpedoState>[] = s.torpedoes
    .map((t) => ({ ...t, life: t.life - TICK_DT }))
    .filter((t) => t.life > EPS);
  let rocks: Mut<RockState>[] = s.rocks.map((r) => ({
    ...r,
    flash: Math.max(0, r.flash - TICK_DT),
    spin: (r.spin + spinRate(r.id) * TICK_DT) % (Math.PI * 2),
  }));
  let torpedoCharge = Math.min(1, s.torpedoCharge + TICK_DT / TORPEDO_RECHARGE);
  if (torpedoCharge > 1 - EPS) torpedoCharge = 1;
  s.extraLifeTimer = Math.max(0, s.extraLifeTimer - TICK_DT);

  let saucer: Mut<SaucerState> | null = s.saucer ? { ...s.saucer } : null;
  const depart = (): void => {
    saucer = null;
    s.saucerClock = 0;
    s.saucerDue = drawSaucerGap();
  };
  if (saucer) {
    saucer.age += TICK_DT;
    saucer.fireClock -= TICK_DT;
    saucer.weaveClock -= TICK_DT;
    if (!saucer.gun) saucer.fireClock = Math.max(0, saucer.fireClock);
    if (!saucer.mind) saucer.weaveClock = Math.max(0, saucer.weaveClock);
    if (saucer.age >= SAUCER_LIFETIME - EPS) depart();
  } else {
    s.saucerClock += TICK_DT;
    if (s.saucerSpawning && s.lives > 0 && s.saucerClock >= s.saucerDue - EPS) {
      const edge: SaucerEdge =
        s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right");
      const row = s.nextSaucerRow ?? uniform(SAUCER_R, FIELD_H - SAUCER_R);
      s.nextSaucerEdge = null;
      s.nextSaucerRow = null;
      saucer = makeSaucer(fresh(), edge, row, Math.random() < 0.5 ? 1 : -1);
      s.saucerClock = 0;
      cues.add(CUES.saucer);
    }
  }

  if (s.waveBanner > 0) {
    s.waveBanner -= TICK_DT;
    if (s.waveBanner <= EPS) {
      s.waveBanner = 0;
      if (s.waveSpawning) {
        const placed = spawnWave(
          s.wave,
          ship.x,
          ship.y,
          s.nextRockSpeed,
          fresh,
        );
        s.nextRockSpeed = null;
        rocks = [...rocks, ...placed];
      }
    }
  }

  // ---- 1. Control forces -------------------------------------------------
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  ship.angle = normalizeAngle(ship.angle + turn * SHIP_TURN * TICK_DT);
  ship.thrusting = input.thrust;
  const fx = Math.cos(ship.angle);
  const fy = Math.sin(ship.angle);

  if (input.fire && ship.fireCooldown <= 0 && bullets.length < MAX_BULLETS) {
    bullets.push({
      id: fresh(),
      x: wrapCoord(ship.x + fx * NOSE, FIELD_W),
      y: wrapCoord(ship.y + fy * NOSE, FIELD_H),
      vx: ship.vx + fx * MUZZLE_SPEED,
      vy: ship.vy + fy * MUZZLE_SPEED,
      life: BULLET_LIFE,
    });
    ship.fireCooldown = FIRE_INTERVAL_TICKS;
    cues.add(CUES.fire);
  }

  if (input.torpedo && torpedoCharge >= 1 && torpedoes.length === 0) {
    torpedoes.push({
      id: fresh(),
      x: wrapCoord(ship.x + fx * NOSE, FIELD_W),
      y: wrapCoord(ship.y + fy * NOSE, FIELD_H),
      vx: fx * TORPEDO_SPEED,
      vy: fy * TORPEDO_SPEED,
      heading: ship.angle,
      life: TORPEDO_LIFE,
      homing: true,
    });
    torpedoCharge = 0;
  }

  torpedoes = torpedoes.map((t) =>
    t.homing ? steerTorpedo(t, rocks, saucer) : t,
  );

  if (saucer) {
    const sc: Mut<SaucerState> = saucer;
    if (sc.mind) {
      if (sc.weaveClock <= EPS) {
        sc.vy =
          sc.vy !== 0
            ? -Math.sign(sc.vy) * SAUCER_WEAVE_SPEED
            : sc.weave * SAUCER_WEAVE_SPEED;
        sc.weaveClock += SAUCER_WEAVE_INTERVAL;
      }
      sc.vy = avoidCore(sc);
    }
    if (sc.gun && sc.fireClock <= EPS) {
      const { dx, dy } = separation(sc.x, sc.y, ship.x, ship.y);
      const error =
        s.nextSaucerAim ?? uniform(-SAUCER_AIM_ERROR, SAUCER_AIM_ERROR);
      s.nextSaucerAim = null;
      const bearing = Math.atan2(dy, dx) + error;
      enemyBullets.push({
        id: fresh(),
        x: sc.x,
        y: sc.y,
        vx: Math.cos(bearing) * SAUCER_BULLET_SPEED + sc.vx,
        vy: Math.sin(bearing) * SAUCER_BULLET_SPEED + sc.vy,
        life: SAUCER_BULLET_LIFE,
      });
      sc.fireClock += SAUCER_FIRE_INTERVAL;
    }
  }

  // ---- 2 & 3. Gravity and velocity ---------------------------------------
  let vx = ship.vx + (ship.thrusting ? fx * SHIP_THRUST * TICK_DT : 0);
  let vy = ship.vy + (ship.thrusting ? fy * SHIP_THRUST * TICK_DT : 0);
  const drag = Math.pow(0.5, TICK_DT / SHIP_DRAG_HALFLIFE);
  vx *= drag;
  vy *= drag;
  const speed = Math.hypot(vx, vy);
  if (speed > SHIP_MAX) {
    vx *= SHIP_MAX / speed;
    vy *= SHIP_MAX / speed;
  }
  ship.vx = vx;
  ship.vy = vy;
  bullets = bullets.map(pull);
  enemyBullets = enemyBullets.map(pull);
  rocks = rocks.map(pull);

  // ---- 4 & 5. Position and wrap ------------------------------------------
  const shipMove = move(ship);
  ship = shipMove.body;
  const bulletMoves = bullets.map(move);
  const enemyMoves = enemyBullets.map(move);
  const torpedoMoves = torpedoes.map(move);
  const rockMoves = rocks.map(move);
  let saucerSweep: Sweep | null = null;
  if (saucer) {
    const sc: Mut<SaucerState> = saucer;
    if (sc.travel) {
      const m = move(sc);
      saucer = keepClearOfCore(m.body);
      saucerSweep = m.sweep;
    } else {
      saucerSweep = { x: sc.x, y: sc.y, mx: 0, my: 0 };
    }
  }

  // ---- 6. Collision ------------------------------------------------------
  // The slide along the core.
  {
    const { dx, dy } = separation(STAR_X, STAR_Y, ship.x, ship.y);
    const d = Math.hypot(dx, dy);
    const minD = CORE_R + SHIP_R;
    if (d < minD) {
      const nx = d > 0 ? dx / d : 0;
      const ny = d > 0 ? dy / d : 1;
      ship.x = wrapCoord(STAR_X + nx * minD, FIELD_W);
      ship.y = wrapCoord(STAR_Y + ny * minD, FIELD_H);
      const inward = ship.vx * nx + ship.vy * ny;
      if (inward < 0) {
        ship.vx -= inward * nx;
        ship.vy -= inward * ny;
      }
    }
  }

  // Live rocks with the sweep they took this tick; fragments join unswept.
  interface LiveRock {
    rock: Mut<RockState>;
    sweep: Sweep;
    alive: boolean;
  }
  const live: LiveRock[] = rockMoves.map((m) => ({
    rock: m.body,
    sweep: m.sweep,
    alive: true,
  }));
  const born: LiveRock[] = [];
  let destroyedAny = false;
  let score = s.score;
  let lives = s.lives;

  const award = (points: number): void => {
    const before = Math.floor(score / EXTRA_LIFE_STEP);
    score += points;
    const gained = Math.floor(score / EXTRA_LIFE_STEP) - before;
    if (gained > 0) {
      lives += gained;
      s.extraLifeTimer = 2;
      cues.add(CUES.extraLife);
    }
  };

  const destroyRock = (target: LiveRock, kx: number, ky: number): void => {
    target.alive = false;
    destroyedAny = true;
    const r = target.rock;
    award(ROCK_SCORE[r.size]);
    cues.add(CUES.shatter);
    particles.push(
      ...burst(
        r.x,
        r.y,
        r.size === "large" ? 26 : r.size === "medium" ? 18 : 12,
        160,
        30,
        r.vx,
        r.vy,
      ),
    );
    const child = ROCK_CHILD[r.size];
    if (child) {
      for (const sign of [1, -1]) {
        const frag = makeRock(
          fresh(),
          child,
          r.x,
          r.y,
          r.vx + kx * sign,
          r.vy + ky * sign,
        );
        born.push({
          rock: frag,
          sweep: { x: frag.x, y: frag.y, mx: 0, my: 0 },
          alive: true,
        });
      }
    }
  };

  const destroySaucer = (): void => {
    const sc = saucer;
    if (!sc) return;
    award(SCORE_SAUCER);
    particles.push(...burst(sc.x, sc.y, 34, 220, 300, sc.vx, sc.vy));
    depart();
  };

  type Target = LiveRock | "core" | "saucer";
  /** The first thing a projectile's path reaches this tick, or `null`. */
  const firstHit = (sweep: Sweep, radius: number): Target | null => {
    const best: { t: number; hit: Target | null } = { t: Infinity, hit: null };
    const offer = (t: number | null, target: Target): void => {
      if (t !== null && t < best.t) {
        best.t = t;
        best.hit = target;
      }
    };
    offer(contact(sweep, STILL_STAR, CORE_R + radius), "core");
    for (const lr of live) {
      if (lr.alive)
        offer(contact(sweep, lr.sweep, radius + ROCK_RADIUS[lr.rock.size]), lr);
    }
    if (saucer && saucerSweep)
      offer(contact(sweep, saucerSweep, radius + SAUCER_R), "saucer");
    return best.hit;
  };

  // The ship's bullets: each lands on the first thing its path reaches.
  const survivingBullets: Mut<BulletState>[] = [];
  bulletMoves.forEach(({ body: b, sweep }) => {
    const hit = firstHit(sweep, BULLET_R);
    if (hit === null) {
      survivingBullets.push(b);
    } else if (hit === "saucer") {
      destroySaucer();
    } else if (hit !== "core") {
      const lr: LiveRock = hit;
      lr.rock.health -= 1;
      if (lr.rock.health <= 0) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        destroyRock(lr, (-b.vy / sp) * SPLIT_KICK, (b.vx / sp) * SPLIT_KICK);
      } else {
        lr.rock.flash = HIT_FLASH_TIME;
        particles.push(...burst(b.x, b.y, 5, 90, 40));
      }
    }
  });
  bullets = survivingBullets;

  // Torpedoes: the same, but a rock they reach is destroyed outright.
  const survivingTorpedoes: Mut<TorpedoState>[] = [];
  torpedoMoves.forEach(({ body: t, sweep }) => {
    const hit = firstHit(sweep, TORPEDO_R);
    if (hit === null) {
      survivingTorpedoes.push(t);
    } else if (hit === "saucer") {
      destroySaucer();
    } else if (hit === "core") {
      particles.push(...burst(t.x, t.y, 10, 120, 20));
    } else {
      const ux = Math.cos(t.heading);
      const uy = Math.sin(t.heading);
      destroyRock(hit, ux * TORPEDO_SCATTER, uy * TORPEDO_SCATTER);
      particles.push(...burst(t.x, t.y, 20, 260, 15));
    }
  });
  torpedoes = survivingTorpedoes;

  // Rocks the core swallows are recycled from an edge.
  for (const lr of live) {
    if (!lr.alive) continue;
    if (
      contact(lr.sweep, STILL_STAR, CORE_R + ROCK_RADIUS[lr.rock.size]) === null
    )
      continue;
    const edge =
      s.nextRecycleEdge ?? FIELD_EDGES[Math.floor(Math.random() * 4)] ?? "top";
    const sp =
      s.nextRockSpeed ??
      uniform(ROCK_SPEED_MIN[lr.rock.size], ROCK_SPEED_MAX[lr.rock.size]);
    s.nextRecycleEdge = null;
    s.nextRockSpeed = null;
    const p = edgePoint(edge, Math.random());
    lr.rock = {
      ...lr.rock,
      x: p.x,
      y: p.y,
      vx: p.nx * sp,
      vy: p.ny * sp,
      flash: 0,
    };
    lr.sweep = { x: p.x, y: p.y, mx: 0, my: 0 };
  }

  rocks = [...live, ...born].filter((lr) => lr.alive).map((lr) => lr.rock);

  // Saucer bullets: absorbed by the core, lethal to an exposed ship.
  const lethal = ship.collision && ship.invuln <= 0;
  const shipSweep: Sweep = shipMove.sweep;
  let shipHit = false;
  const survivingEnemy: Mut<BulletState>[] = [];
  enemyMoves.forEach(({ body: b, sweep }) => {
    if (contact(sweep, STILL_STAR, CORE_R + SAUCER_BULLET_R) !== null) return;
    if (
      lethal &&
      !shipHit &&
      contact(sweep, shipSweep, SAUCER_BULLET_R + SHIP_R) !== null
    ) {
      shipHit = true;
      return;
    }
    survivingEnemy.push(b);
  });
  enemyBullets = survivingEnemy;

  if (lethal && !shipHit) {
    shipHit = live.some(
      (lr) =>
        lr.alive &&
        contact(shipSweep, lr.sweep, SHIP_R + ROCK_RADIUS[lr.rock.size]) !==
          null,
    );
  }
  if (lethal && !shipHit && saucer && saucerSweep) {
    shipHit = contact(shipSweep, saucerSweep, SHIP_R + SAUCER_R) !== null;
  }

  if (shipHit) {
    cues.add(CUES.death);
    particles.push(...burst(ship.x, ship.y, 40, 240, 190, ship.vx, ship.vy));
    lives -= 1;
    if (lives > 0) {
      ship = { ...freshShip(INVULN_TIME) };
      torpedoCharge = 1;
    } else {
      lives = 0;
      ship = { ...ship, thrusting: false, vx: 0, vy: 0 };
      s.screen = "gameover";
      s.menuIndex = 0;
      s.menuPress = null;
    }
  }

  // ---- The wave loop -----------------------------------------------------
  if (destroyedAny && rocks.length === 0 && s.waveSpawning) {
    s.wave += 1;
    s.waveBanner = WAVE_BANNER_TIME;
  }

  // ---- Cosmetics ---------------------------------------------------------
  const moved = s.particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx * TICK_DT,
      y: p.y + p.vy * TICK_DT,
      vx: p.vx * 0.985,
      vy: p.vy * 0.985,
      life: p.life - TICK_DT,
    }))
    .filter((p) => p.life > 0);
  const allParticles = [...moved, ...particles];

  return {
    ...s,
    ship,
    bullets,
    enemyBullets,
    torpedoes,
    rocks,
    saucer,
    torpedoCharge,
    score,
    lives,
    nextId,
    particles:
      allParticles.length > MAX_PARTICLES
        ? allParticles.slice(-MAX_PARTICLES)
        : allParticles,
  };
}

/** Turns a homing torpedo toward the nearest body in its forward cone. */
export function steerTorpedo(
  t: DeepReadonly<TorpedoState>,
  rocks: readonly DeepReadonly<RockState>[],
  saucer: DeepReadonly<SaucerState> | null,
): Mut<TorpedoState> {
  let bestD = Infinity;
  let bearing: number | null = null;
  const consider = (x: number, y: number): void => {
    const { dx, dy } = separation(t.x, t.y, x, y);
    const d = Math.hypot(dx, dy);
    if (d === 0) return;
    const b = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(b - t.heading)) > TORPEDO_CONE) return;
    if (d < bestD) {
      bestD = d;
      bearing = b;
    }
  };
  for (const r of rocks) consider(r.x, r.y);
  if (saucer) consider(saucer.x, saucer.y);
  let heading = t.heading;
  if (bearing !== null) {
    const diff = normalizeAngle(bearing - heading);
    const step = TORPEDO_TURN * TICK_DT;
    heading = normalizeAngle(heading + Math.max(-step, Math.min(step, diff)));
  }
  return {
    ...t,
    heading,
    vx: Math.cos(heading) * TORPEDO_SPEED,
    vy: Math.sin(heading) * TORPEDO_SPEED,
  };
}

/**
 * The saucer's vertical velocity once its mind has kept it clear of the core:
 * inside the avoidance ring its vertical motion is turned away from the star.
 */
export function avoidCore(sc: DeepReadonly<SaucerState>): number {
  const { dx, dy } = separation(STAR_X, STAR_Y, sc.x, sc.y);
  if (Math.hypot(dx, dy) >= SAUCER_AVOID_R) return sc.vy;
  const away = dy > 0 ? 1 : dy < 0 ? -1 : sc.weave;
  if (Math.sign(sc.vy) === away && Math.abs(sc.vy) >= SAUCER_WEAVE_SPEED)
    return sc.vy;
  return away * SAUCER_WEAVE_SPEED;
}

/** Never lets the saucer's circle overlap the core, whatever it was steered to. */
export function keepClearOfCore<T extends { x: number; y: number }>(sc: T): T {
  const { dx, dy } = separation(STAR_X, STAR_Y, sc.x, sc.y);
  const d = Math.hypot(dx, dy);
  const minD = CORE_R + SAUCER_R + 0.5;
  if (d >= minD) return sc;
  const nx = d > 0 ? dx / d : 0;
  const ny = d > 0 ? dy / d : -1;
  return {
    ...sc,
    x: wrapCoord(STAR_X + nx * minD, FIELD_W),
    y: wrapCoord(STAR_Y + ny * minD, FIELD_H),
  };
}

/**
 * Places wave `n`'s Large rocks, each at a uniform point clear of the ship and
 * the star, drifting in a uniform direction at a base speed (posed, or drawn)
 * scaled by the wave's factor.
 */
export function spawnWave(
  n: number,
  shipX: number,
  shipY: number,
  posedSpeed: number | null,
  fresh: () => number,
): RockState[] {
  const count = WAVE_BASE_ROCKS + n;
  const factor = waveSpeedFactor(n);
  const out: RockState[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 2000; tries++) {
      x = Math.random() * FIELD_W;
      y = Math.random() * FIELD_H;
      if (
        wrappedDistance(x, y, shipX, shipY) >= WAVE_MIN_SHIP_DIST &&
        wrappedDistance(x, y, STAR_X, STAR_Y) >= WAVE_MIN_STAR_DIST
      )
        break;
    }
    const base =
      posedSpeed ?? uniform(ROCK_SPEED_MIN.large, ROCK_SPEED_MAX.large);
    const sp = base * factor;
    const dir = Math.random() * Math.PI * 2;
    out.push(
      makeRock(fresh(), "large", x, y, Math.cos(dir) * sp, Math.sin(dir) * sp),
    );
  }
  return out;
}
