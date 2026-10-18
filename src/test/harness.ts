// Shatter — a headless engine for the unit tests: a native canvas, a clock of
// the test's own, and an event target keys and pointers are dispatched at.

import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT, TICK_DT } from "../constants";
import {
  BACKGROUND,
  game,
  type ShatterDebugApi,
  type ShatterState,
} from "../game";

export interface Harness {
  readonly engine: Engine<ShatterState, ShatterDebugApi>;
  readonly debug: ShatterDebugApi;
  /** Applies a pose. */
  pose(
    f: (s: Parameters<ShatterDebugApi["snapshot"]>[0]) => ShatterState,
  ): void;
  /** Reads the snapshot of the current state. */
  snap(): ReturnType<ShatterDebugApi["snapshot"]>;
  /** Runs `n` frames of one tick each. */
  frames(n: number): Promise<void>;
  /** Runs frames covering `seconds` of game time. */
  seconds(t: number): Promise<void>;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** Presses and releases a key, with a frame between. */
  tap(code: string): Promise<void>;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    device?: string,
    id?: number,
  ): void;
}

export async function boot(stepMs = TICK_DT * 1000): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const debug = engine.debug;

  const fire = (type: string, props: Record<string, unknown>): void => {
    const e = new Event(type);
    for (const [k, v] of Object.entries(props))
      Object.defineProperty(e, k, { value: v });
    target.dispatchEvent(e);
  };

  const h: Harness = {
    engine,
    debug,
    pose: (f) => {
      engine.apply(f);
    },
    snap: () => debug.snapshot(engine.state),
    frames: (n) => engine.advance(n),
    seconds: (t) => engine.advance(Math.round(t / (stepMs / 1000))),
    keyDown: (code) => fire("keydown", { code, repeat: false }),
    keyUp: (code) => fire("keyup", { code, repeat: false }),
    tap: async (code) => {
      h.keyDown(code);
      await engine.advance(1);
      h.keyUp(code);
      await engine.advance(1);
    },
    pointer: (type, x, y, device = "mouse", id = 1) =>
      fire(type, {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
  };
  return h;
}

/** Boots and opens a game with the field emptied and the spawners shut. */
export async function bootQuiet(stepMs?: number): Promise<Harness> {
  const h = await boot(stepMs);
  h.pose((s) => h.debug.setScreen(s, "playing"));
  h.pose((s) => h.debug.setWaveSpawning(s, false));
  h.pose((s) => h.debug.setSaucerSpawning(s, false));
  return h;
}

/** The last entry of a list, or `undefined`. */
export function last<T>(list: readonly T[]): T | undefined {
  return list[list.length - 1];
}
