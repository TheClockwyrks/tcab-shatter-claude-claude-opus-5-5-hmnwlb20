// Shatter — the debug and automation surface `specs/instrumentation.md` fixes.
//
// Every operation is a reading or a pose of the state, written in the shape of
// `update`: it takes the current state read-only and returns what it read or
// the next state. A call the game has no defined state for throws.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  ROCK_HEALTH,
  ROCK_RADIUS,
  type RockSize,
  SAUCER_BULLET_LIFE,
  SHATTER_DEBUG_VERSION,
  TORPEDO_LIFE,
  TORPEDO_SPEED,
} from "./constants";
import type {
  FieldEdge,
  SaucerEdge,
  SaucerState,
  Screen,
  ShatterDebugApi,
  ShatterState,
  Snapshot,
} from "./game";
import { menuItems, menuRect } from "./menu";
import {
  drawSaucerGap,
  initialState,
  makeRock,
  makeSaucer,
  thaw,
} from "./world";

type View = DeepReadonly<ShatterState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "playing",
  "paused",
  "gameover",
];
const SIZES: readonly RockSize[] = ["large", "medium", "small"];
const SAUCER_EDGES: readonly SaucerEdge[] = ["left", "right"];
const FIELD_EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

function fail(op: string, why: string): never {
  throw new Error(`Shatter debug: ${op}: ${why}`);
}

function num(op: string, name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    fail(op, `${name} must be a finite number, got ${String(v)}`);
  return v;
}

function whole(
  op: string,
  name: string,
  v: unknown,
  min: number,
  max = Infinity,
): number {
  const n = num(op, name, v);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(op, `${name} must be a whole number from ${min} to ${max}, got ${n}`);
  return n;
}

function flag(op: string, v: unknown): boolean {
  if (typeof v !== "boolean")
    fail(op, `enabled must be a boolean, got ${String(v)}`);
  return v;
}

function oneOf<T extends string>(op: string, v: unknown, set: readonly T[]): T {
  if (typeof v !== "string" || !(set as readonly string[]).includes(v)) {
    fail(op, `expected one of ${set.join(", ")}, got ${String(v)}`);
  }
  return v as T;
}

/** The index of the entity carrying `id` in `list`, or a loud failure. */
function locate(
  op: string,
  list: readonly { readonly id: number }[],
  id: unknown,
): number {
  const n = num(op, "id", id);
  const i = list.findIndex((e) => e.id === n);
  if (i < 0) fail(op, `no live entity carries id ${n}`);
  return i;
}

function withSaucer(
  op: string,
  s: View,
  change: (sc: SaucerState) => SaucerState,
): ShatterState {
  const st = thaw(s);
  if (!st.saucer) fail(op, "no saucer is up");
  return { ...st, saucer: change(st.saucer) };
}

function replaceAt<T>(list: readonly T[], i: number, value: T): T[] {
  return list.map((e, j) => (j === i ? value : e));
}

/** Builds the surface. It holds nothing; every call reads the state handed in. */
export function createDebugApi(): ShatterDebugApi {
  return {
    version: SHATTER_DEBUG_VERSION,

    reset: (s) => initialState(s.muted),

    snapshot: (s): Snapshot => ({
      version: SHATTER_DEBUG_VERSION,
      screen: s.screen,
      menuIndex: s.menuIndex,
      score: s.score,
      lives: s.lives,
      wave: s.wave,
      waveBanner: s.waveBanner,
      muted: s.muted,
      waveSpawning: s.waveSpawning,
      saucerSpawning: s.saucerSpawning,
      saucerClock: s.saucerClock,
      saucerDue: s.saucerDue,
      nextSaucerEdge: s.nextSaucerEdge,
      nextSaucerRow: s.nextSaucerRow,
      nextSaucerAim: s.nextSaucerAim,
      nextRockSpeed: s.nextRockSpeed,
      nextRecycleEdge: s.nextRecycleEdge,
      ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
      bullets: s.bullets.map((b) => ({ ...b })),
      rocks: s.rocks.map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        vx: r.vx,
        vy: r.vy,
        size: r.size,
        radius: ROCK_RADIUS[r.size],
        health: r.health,
      })),
      saucer: s.saucer ? { ...s.saucer } : null,
      enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
      torpedoes: s.torpedoes.map((t) => ({ ...t })),
      torpedoCharge: s.torpedoCharge,
      torpedoReady: s.torpedoCharge >= 1,
      simTime: s.simTime,
    }),

    // Every derived reading is worked out at the call, so there is no stored
    // copy to bring back into agreement.
    reconcile: (s) => thaw(s),

    menuItemRect: (s, index) => {
      num("menuItemRect", "index", index);
      return menuRect(s.screen, index);
    },

    setScreen: (s, screen) => {
      const next = oneOf("setScreen", screen, SCREENS);
      const items = menuItems(next === "howto" ? "title" : next);
      const keep = items
        ? s.menuIndex >= 0 && s.menuIndex < items.length
        : next !== "playing";
      return {
        ...thaw(s),
        screen: next,
        menuIndex: keep ? s.menuIndex : 0,
        menuPress: null,
      };
    },
    setMenuIndex: (s, n) => {
      const items = menuItems(s.screen === "howto" ? "title" : s.screen);
      const idx = whole(
        "setMenuIndex",
        "n",
        n,
        0,
        items ? items.length - 1 : Infinity,
      );
      return { ...thaw(s), menuIndex: idx };
    },
    setScore: (s, n) => ({ ...thaw(s), score: num("setScore", "n", n) }),
    setLives: (s, n) => ({ ...thaw(s), lives: num("setLives", "n", n) }),
    setWave: (s, n) => ({ ...thaw(s), wave: num("setWave", "n", n) }),
    setWaveBanner: (s, seconds) => {
      const t = num("setWaveBanner", "seconds", seconds);
      if (t < 0)
        fail("setWaveBanner", `seconds must not be negative, got ${t}`);
      return { ...thaw(s), waveBanner: t };
    },

    setWaveSpawning: (s, enabled) => ({
      ...thaw(s),
      waveSpawning: flag("setWaveSpawning", enabled),
    }),
    setSaucerSpawning: (s, enabled) => ({
      ...thaw(s),
      saucerSpawning: flag("setSaucerSpawning", enabled),
    }),
    setSaucerDue: (s, seconds) => ({
      ...thaw(s),
      saucerDue: num("setSaucerDue", "seconds", seconds),
    }),

    setShipPosition: (s, x, y) => ({
      ...thaw(s),
      ship: {
        ...s.ship,
        x: num("setShipPosition", "x", x),
        y: num("setShipPosition", "y", y),
      },
    }),
    setShipVelocity: (s, vx, vy) => ({
      ...thaw(s),
      ship: {
        ...s.ship,
        vx: num("setShipVelocity", "vx", vx),
        vy: num("setShipVelocity", "vy", vy),
      },
    }),
    setShipAngle: (s, radians) => ({
      ...thaw(s),
      ship: { ...s.ship, angle: num("setShipAngle", "radians", radians) },
    }),
    setShipInvuln: (s, seconds) => ({
      ...thaw(s),
      ship: { ...s.ship, invuln: num("setShipInvuln", "seconds", seconds) },
    }),
    setFireCooldown: (s, ticks) => ({
      ...thaw(s),
      ship: { ...s.ship, fireCooldown: num("setFireCooldown", "ticks", ticks) },
    }),
    setShipCollision: (s, enabled) => ({
      ...thaw(s),
      ship: { ...s.ship, collision: flag("setShipCollision", enabled) },
    }),

    addBullet: (s, x, y, vx, vy) => {
      const op = "addBullet";
      const b = {
        id: s.nextId,
        x: num(op, "x", x),
        y: num(op, "y", y),
        vx: num(op, "vx", vx),
        vy: num(op, "vy", vy),
        life: BULLET_LIFE,
      };
      return { ...thaw(s), bullets: [...s.bullets, b], nextId: s.nextId + 1 };
    },
    removeBullet: (s, id) => {
      const i = locate("removeBullet", s.bullets, id);
      return { ...thaw(s), bullets: s.bullets.filter((_, j) => j !== i) };
    },
    clearBullets: (s) => ({ ...thaw(s), bullets: [] }),
    addEnemyBullet: (s, x, y, vx, vy) => {
      const op = "addEnemyBullet";
      const b = {
        id: s.nextId,
        x: num(op, "x", x),
        y: num(op, "y", y),
        vx: num(op, "vx", vx),
        vy: num(op, "vy", vy),
        life: SAUCER_BULLET_LIFE,
      };
      return {
        ...thaw(s),
        enemyBullets: [...s.enemyBullets, b],
        nextId: s.nextId + 1,
      };
    },
    removeEnemyBullet: (s, id) => {
      const i = locate("removeEnemyBullet", s.enemyBullets, id);
      return {
        ...thaw(s),
        enemyBullets: s.enemyBullets.filter((_, j) => j !== i),
      };
    },
    clearEnemyBullets: (s) => ({ ...thaw(s), enemyBullets: [] }),

    addRock: (s, size, x, y) => {
      const op = "addRock";
      const rock = makeRock(
        s.nextId,
        oneOf(op, size, SIZES),
        num(op, "x", x),
        num(op, "y", y),
        0,
        0,
      );
      return { ...thaw(s), rocks: [...s.rocks, rock], nextId: s.nextId + 1 };
    },
    setRockVelocity: (s, id, vx, vy) => {
      const op = "setRockVelocity";
      const i = locate(op, s.rocks, id);
      const r = thaw(s).rocks[i];
      if (!r) fail(op, "no such rock");
      return {
        ...thaw(s),
        rocks: replaceAt(thaw(s).rocks, i, {
          ...r,
          vx: num(op, "vx", vx),
          vy: num(op, "vy", vy),
        }),
      };
    },
    setRockHealth: (s, id, hp) => {
      const op = "setRockHealth";
      const i = locate(op, s.rocks, id);
      const r = thaw(s).rocks[i];
      if (!r) fail(op, "no such rock");
      const health = whole(op, "hp", hp, 1, ROCK_HEALTH[r.size]);
      return {
        ...thaw(s),
        rocks: replaceAt(thaw(s).rocks, i, { ...r, health }),
      };
    },
    removeRock: (s, id) => {
      const i = locate("removeRock", s.rocks, id);
      return { ...thaw(s), rocks: s.rocks.filter((_, j) => j !== i) };
    },
    clearRocks: (s) => ({ ...thaw(s), rocks: [] }),

    addSaucer: (s, x, y) => {
      const op = "addSaucer";
      const base = makeSaucer(s.nextId, "left", 0, 1);
      const saucer = { ...base, x: num(op, "x", x), y: num(op, "y", y) };
      return { ...thaw(s), saucer, nextId: s.nextId + 1 };
    },
    setSaucerVelocity: (s, vx, vy) =>
      withSaucer("setSaucerVelocity", s, (sc) => ({
        ...sc,
        vx: num("setSaucerVelocity", "vx", vx),
        vy: num("setSaucerVelocity", "vy", vy),
      })),
    setSaucerWeave: (s, direction) => {
      if (direction !== 1 && direction !== -1)
        fail(
          "setSaucerWeave",
          `direction must be 1 or -1, got ${String(direction)}`,
        );
      return withSaucer("setSaucerWeave", s, (sc) => ({
        ...sc,
        weave: direction,
      }));
    },
    removeSaucer: (s) =>
      s.saucer
        ? {
            ...thaw(s),
            saucer: null,
            saucerClock: 0,
            saucerDue: drawSaucerGap(),
          }
        : thaw(s),
    setSaucerMind: (s, enabled) =>
      withSaucer("setSaucerMind", s, (sc) => ({
        ...sc,
        mind: flag("setSaucerMind", enabled),
      })),
    setSaucerGun: (s, enabled) =>
      withSaucer("setSaucerGun", s, (sc) => ({
        ...sc,
        gun: flag("setSaucerGun", enabled),
      })),
    setSaucerTravel: (s, enabled) =>
      withSaucer("setSaucerTravel", s, (sc) => ({
        ...sc,
        travel: flag("setSaucerTravel", enabled),
      })),

    setNextSaucerEdge: (s, edge) => ({
      ...thaw(s),
      nextSaucerEdge: oneOf("setNextSaucerEdge", edge, SAUCER_EDGES),
    }),
    setNextSaucerRow: (s, y) => ({
      ...thaw(s),
      nextSaucerRow: num("setNextSaucerRow", "y", y),
    }),
    setNextSaucerAim: (s, radians) => ({
      ...thaw(s),
      nextSaucerAim: num("setNextSaucerAim", "radians", radians),
    }),
    setNextRockSpeed: (s, speed) => ({
      ...thaw(s),
      nextRockSpeed: num("setNextRockSpeed", "speed", speed),
    }),
    setNextRecycleEdge: (s, edge) => ({
      ...thaw(s),
      nextRecycleEdge: oneOf("setNextRecycleEdge", edge, FIELD_EDGES),
    }),

    setTorpedoCharge: (s, fraction) => {
      const f = num("setTorpedoCharge", "fraction", fraction);
      if (f < 0 || f > 1)
        fail("setTorpedoCharge", `fraction must be from 0 to 1, got ${f}`);
      return { ...thaw(s), torpedoCharge: f };
    },
    addTorpedo: (s, x, y, heading) => {
      const op = "addTorpedo";
      const h = num(op, "heading", heading);
      const t = {
        id: s.nextId,
        x: num(op, "x", x),
        y: num(op, "y", y),
        vx: Math.cos(h) * TORPEDO_SPEED,
        vy: Math.sin(h) * TORPEDO_SPEED,
        heading: h,
        life: TORPEDO_LIFE,
        homing: true,
      };
      return {
        ...thaw(s),
        torpedoes: [...s.torpedoes, t],
        nextId: s.nextId + 1,
      };
    },
    setTorpedoHeading: (s, id, radians) => {
      const op = "setTorpedoHeading";
      const i = locate(op, s.torpedoes, id);
      const h = num(op, "radians", radians);
      const t = thaw(s).torpedoes[i];
      if (!t) fail(op, "no such torpedo");
      const speed = Math.hypot(t.vx, t.vy);
      return {
        ...thaw(s),
        torpedoes: replaceAt(thaw(s).torpedoes, i, {
          ...t,
          heading: h,
          vx: Math.cos(h) * speed,
          vy: Math.sin(h) * speed,
        }),
      };
    },
    setTorpedoHoming: (s, id, enabled) => {
      const op = "setTorpedoHoming";
      const i = locate(op, s.torpedoes, id);
      const t = thaw(s).torpedoes[i];
      if (!t) fail(op, "no such torpedo");
      return {
        ...thaw(s),
        torpedoes: replaceAt(thaw(s).torpedoes, i, {
          ...t,
          homing: flag(op, enabled),
        }),
      };
    },
    removeTorpedo: (s, id) => {
      const i = locate("removeTorpedo", s.torpedoes, id);
      return { ...thaw(s), torpedoes: s.torpedoes.filter((_, j) => j !== i) };
    },
    clearTorpedoes: (s) => ({ ...thaw(s), torpedoes: [] }),
  };
}
