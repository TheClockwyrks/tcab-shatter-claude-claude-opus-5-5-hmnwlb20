// Shatter — captures the showcase media from real play.
//
// The game runs headless over a native canvas, flown by the keyboard autopilot
// in scripts/autopilot.ts, and the engine's recorder captures the build's own
// drawing. Nothing here poses the game: the only inputs are key events.
// Screenshots come from the real browser instead (scripts/screenshots.mjs).
//
//   npx vitest run --config scripts/capture.config.ts

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { BINDINGS, FIELD_H, FIELD_W, LAYOUT } from "../src/constants";
import { BACKGROUND, game } from "../src/game";
import { pilot, type Keys, type PilotOptions } from "./autopilot";

const OUT = new URL("../showcase/", import.meta.url);

/** A small seeded generator, so a capture replays the same way each run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function session(seed: number) {
  Math.random = seeded(seed);
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();

  const key = (code: string, down: boolean): void => {
    const e = new Event(down ? "keydown" : "keyup");
    Object.defineProperty(e, "code", { value: code });
    Object.defineProperty(e, "repeat", { value: false });
    target.dispatchEvent(e);
  };
  const held: Keys = {
    left: false,
    right: false,
    up: false,
    fire: false,
    torpedo: false,
  };
  const codes: Record<keyof Keys, string> = {
    left: BINDINGS.left.keys[0] ?? "ArrowLeft",
    right: BINDINGS.right.keys[0] ?? "ArrowRight",
    up: BINDINGS.up.keys[0] ?? "ArrowUp",
    fire: BINDINGS.a.keys[0] ?? "Space",
    torpedo: BINDINGS.b.keys[0] ?? "KeyF",
  };

  const play = async (
    frames: number,
    opts: PilotOptions,
    log?: (t: number) => void,
  ): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      const want =
        engine.state.screen === "playing"
          ? pilot(engine.state, opts)
          : {
              ...held,
              left: false,
              right: false,
              up: false,
              fire: false,
              torpedo: false,
            };
      for (const k of Object.keys(codes) as (keyof Keys)[]) {
        if (want[k] !== held[k]) {
          key(codes[k], want[k]);
          held[k] = want[k];
        }
      }
      await engine.advance(1);
      log?.(engine.state.simTime);
    }
  };

  const tap = async (code: string): Promise<void> => {
    key(code, true);
    await engine.advance(1);
    key(code, false);
    await engine.advance(1);
  };

  const record = async (
    file: string,
    frames: number,
    opts: PilotOptions,
  ): Promise<void> => {
    engine.startRecording();
    await play(frames, opts);
    const rec = engine.stopRecording();
    const gz = gzipSync(JSON.stringify(rec));
    writeFileSync(new URL(file, OUT), gz);
    console.log(
      `${file}: ${rec.frames.length} frames, ${(gz.length / 1024 / 1024).toFixed(2)} MiB`,
    );
  };

  return { engine, play, tap, record };
}

it("captures the showcase", async () => {
  const mode = process.env.CAPTURE ?? "all";
  if (mode === "survey") {
    const lines: string[] = [];
    const say = (m: string): void => void lines.push(m);
    const s = await session(Number(process.env.SEED ?? 7));
    await s.tap("Enter");
    s.engine.events.on("cue:played", (e) =>
      say(`${(e.t / 1000).toFixed(2)} ${e.cue}`),
    );
    await s.play(60 * 60, { torpedoes: true }, (t) => {
      const st = s.engine.state;
      if (st.torpedoes.length && Math.round(t * 60) % 30 === 0)
        say(`${t.toFixed(2)} torpedo up`);
    });
    const snap = s.engine.debug.snapshot(s.engine.state);
    say(
      `score ${snap.score} lives ${snap.lives} wave ${snap.wave} screen ${snap.screen}`,
    );
    writeFileSync(process.env.SURVEY_OUT ?? "survey.txt", lines.join("\n"));
    return;
  }

  // One continuous game, flown by the autopilot from the title onward. The
  // clip windows were chosen by surveying this seed's run.
  const s = await session(7);
  await s.play(30, { torpedoes: false });
  await s.tap("Enter");
  const opts = { torpedoes: true };
  await s.play(56, opts); // to t = 1.0 s
  await s.record("torpedo.json.gz", 3 * 60, opts); // the opening torpedo strike
  await s.play(90, opts);
  await s.record("battle.json.gz", 7 * 60, opts); // wave one coming apart
  await s.play(4.5 * 60, opts);
  await s.record("saucer.json.gz", 6.5 * 60, opts); // the saucer arrives to hunt
});
