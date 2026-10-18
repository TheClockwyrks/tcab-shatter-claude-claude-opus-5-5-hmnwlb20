// Shatter — the game: the state it holds, the debug surface that poses and
// reads that state, and the three functions the engine drives.
//
// The simulation lives in `world.ts` and steps without a canvas, the menus in
// `menu.ts`, the debug surface in `debug.ts`, and the drawing in `render.ts`.
// This module declares the contract and wires those parts to the engine.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES, type RockSize } from "./constants";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { initialState } from "./world";
import { renderGame } from "./render";
import type { Rect } from "./menu";
import type { MenuPress, Particle } from "./types";
import { stepFrame } from "./frame";

// ---- The declared state (specs/state.md) ---------------------------------

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;

  // ---- Build-owned fields beside the declared contract ----
  // Input bookkeeping and cosmetics only; `reset` returns each to neutral.

  /** The gun's key has been held since a press seen during play. */
  readonly fireHeld: boolean;
  /** A fire press arrived and waits for the next tick to read it. */
  readonly fireQueued: boolean;
  /** A torpedo press arrived and waits for the next tick to read it. */
  readonly torpedoQueued: boolean;
  /** Seconds left on the on-field EXTRA SHIP announcement. */
  readonly extraLifeTimer: number;
  /** A pointer or touch contact that went down inside a menu entry. */
  readonly menuPress: MenuPress | null;
  /** Explosion sparks, drawn and nothing else. */
  readonly particles: readonly Particle[];
}

// ---- The debug and automation surface (specs/instrumentation.md) ---------

type View = DeepReadonly<ShatterState>;

/** What `snapshot` returns: a plain read of the state. */
export interface Snapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;
  readonly muted: boolean;
  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;
  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;
  readonly ship: ShipState & { readonly speed: number };
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly size: RockSize;
    readonly radius: number;
    readonly health: number;
  }[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;
  readonly torpedoReady: boolean;
  readonly simTime: number;
}

/**
 * The debug surface. Every operation takes the current state first; a pose
 * returns the next state and a reading returns what it read.
 */
export interface ShatterDebugApi {
  readonly version: number;

  reset(state: View): ShatterState;
  snapshot(state: View): Snapshot;
  reconcile(state: View): ShatterState;
  menuItemRect(state: View, index: number): Rect | null;

  setScreen(state: View, screen: Screen): ShatterState;
  setMenuIndex(state: View, n: number): ShatterState;
  setScore(state: View, n: number): ShatterState;
  setLives(state: View, n: number): ShatterState;
  setWave(state: View, n: number): ShatterState;
  setWaveBanner(state: View, seconds: number): ShatterState;

  setWaveSpawning(state: View, enabled: boolean): ShatterState;
  setSaucerSpawning(state: View, enabled: boolean): ShatterState;
  setSaucerDue(state: View, seconds: number): ShatterState;

  setShipPosition(state: View, x: number, y: number): ShatterState;
  setShipVelocity(state: View, vx: number, vy: number): ShatterState;
  setShipAngle(state: View, radians: number): ShatterState;
  setShipInvuln(state: View, seconds: number): ShatterState;
  setFireCooldown(state: View, ticks: number): ShatterState;
  setShipCollision(state: View, enabled: boolean): ShatterState;

  addBullet(
    state: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeBullet(state: View, id: number): ShatterState;
  clearBullets(state: View): ShatterState;
  addEnemyBullet(
    state: View,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeEnemyBullet(state: View, id: number): ShatterState;
  clearEnemyBullets(state: View): ShatterState;

  addRock(state: View, size: RockSize, x: number, y: number): ShatterState;
  setRockVelocity(
    state: View,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState;
  setRockHealth(state: View, id: number, hp: number): ShatterState;
  removeRock(state: View, id: number): ShatterState;
  clearRocks(state: View): ShatterState;

  addSaucer(state: View, x: number, y: number): ShatterState;
  setSaucerVelocity(state: View, vx: number, vy: number): ShatterState;
  setSaucerWeave(state: View, direction: 1 | -1): ShatterState;
  removeSaucer(state: View): ShatterState;
  setSaucerMind(state: View, enabled: boolean): ShatterState;
  setSaucerGun(state: View, enabled: boolean): ShatterState;
  setSaucerTravel(state: View, enabled: boolean): ShatterState;

  setNextSaucerEdge(state: View, edge: SaucerEdge): ShatterState;
  setNextSaucerRow(state: View, y: number): ShatterState;
  setNextSaucerAim(state: View, radians: number): ShatterState;
  setNextRockSpeed(state: View, speed: number): ShatterState;
  setNextRecycleEdge(state: View, edge: FieldEdge): ShatterState;

  setTorpedoCharge(state: View, fraction: number): ShatterState;
  addTorpedo(state: View, x: number, y: number, heading: number): ShatterState;
  setTorpedoHeading(state: View, id: number, radians: number): ShatterState;
  setTorpedoHoming(state: View, id: number, enabled: boolean): ShatterState;
  removeTorpedo(state: View, id: number): ShatterState;
  clearTorpedoes(state: View): ShatterState;
}

/** The field background: a deep blue-black, so the letterbox matches space. */
export const BACKGROUND = "#05060f";

/** One distinct short sound per event; `thrust` is held while burning. */
const CUE_SPECS = {
  [CUES.fire]: {
    wave: "square",
    freq: 880,
    freqTo: 440,
    durationMs: 70,
    gain: 0.08,
  },
  [CUES.shatter]: {
    wave: "sawtooth",
    freq: 220,
    freqTo: 40,
    durationMs: 260,
    gain: 0.16,
  },
  [CUES.thrust]: { wave: "sawtooth", freq: 58, durationMs: 100, gain: 0.07 },
  [CUES.saucer]: {
    wave: "triangle",
    freq: 520,
    freqTo: 1040,
    durationMs: 420,
    gain: 0.14,
  },
  [CUES.death]: {
    wave: "sawtooth",
    freq: 320,
    freqTo: 30,
    durationMs: 700,
    gain: 0.22,
  },
  [CUES.extraLife]: {
    wave: "sine",
    freq: 660,
    freqTo: 1320,
    durationMs: 380,
    gain: 0.18,
  },
} as const;

/** The game this build's engine drives. */
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>): [ShatterState, ShatterDebugApi] {
    for (const name of ACTIONS) api.input.register(name, BINDINGS[name]);
    for (const [cue, spec] of Object.entries(CUE_SPECS))
      api.audio.define(cue, spec);
    registerDiagnostics(api);
    return [initialState(false), createDebugApi()];
  },

  update(
    state: DeepReadonly<ShatterState>,
    api: UpdateApi,
    dt: number,
  ): ShatterState {
    return stepFrame(state, api, dt);
  },

  render(state: DeepReadonly<ShatterState>, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
