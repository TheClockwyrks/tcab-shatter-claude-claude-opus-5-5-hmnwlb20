// Shatter — one frame: the screen flow, the fixed-timestep accumulator, and the
// cues the ticks raised.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CUES, type CueName, TICK_DT } from "./constants";
import type { ShatterState } from "./game";
import { readMenu } from "./menu";
import { EPS, newGame, thaw, tick, type TickInput } from "./world";

type View = DeepReadonly<ShatterState>;

/** Splits the accumulated time into whole ticks and the remainder carried on. */
export function accumulate(
  tickClock: number,
  dt: number,
): { ticks: number; rest: number } {
  const acc = tickClock + (Number.isFinite(dt) && dt > 0 ? dt : 0);
  const ticks = Math.floor(acc / TICK_DT + EPS);
  return { ticks, rest: Math.max(0, acc - ticks * TICK_DT) };
}

/** Leaves the menus for live play with the gun's hold forgotten. */
function enterPlay(s: ShatterState): ShatterState {
  return {
    ...s,
    screen: "playing",
    menuIndex: 0,
    menuPress: null,
    fireHeld: false,
    fireQueued: false,
    torpedoQueued: false,
  };
}

function toTitle(s: ShatterState, menuIndex: number): ShatterState {
  return { ...s, screen: "title", menuIndex, menuPress: null };
}

/** Applies the screen-level input of one frame: the menus, pausing, resuming. */
export function screenInput(state: View, api: UpdateApi): ShatterState {
  const s = thaw(state);
  switch (s.screen) {
    case "title": {
      const m = readMenu("title", s.menuIndex, s.menuPress, api);
      if (m.confirmed) {
        if (m.index === 0) return enterPlay(newGame(s));
        return { ...s, screen: "howto", menuIndex: m.index, menuPress: null };
      }
      return { ...s, menuIndex: m.index, menuPress: m.press };
    }
    case "howto": {
      const confirm = api.input.pressed("confirm");
      const back = api.input.pressed("back");
      return confirm || back ? toTitle(s, s.menuIndex) : s;
    }
    case "playing": {
      if (api.input.pressed("pause")) {
        return { ...s, screen: "paused", menuIndex: 0, menuPress: null };
      }
      const pressedFire = api.input.pressed("a");
      const heldFire = api.input.value("a") > 0;
      return {
        ...s,
        fireHeld: pressedFire || (s.fireHeld && heldFire),
        fireQueued: s.fireQueued || pressedFire,
        torpedoQueued: s.torpedoQueued || api.input.pressed("b"),
      };
    }
    case "paused": {
      const pause = api.input.pressed("pause");
      const back = api.input.pressed("back");
      if (pause || back) return enterPlay(s);
      const m = readMenu("paused", s.menuIndex, s.menuPress, api);
      if (!m.confirmed) return { ...s, menuIndex: m.index, menuPress: m.press };
      if (m.index === 0) return enterPlay(s);
      if (m.index === 1) return enterPlay(newGame(s));
      return toTitle(s, 0);
    }
    case "gameover": {
      if (api.input.pressed("back")) return toTitle(s, 0);
      const m = readMenu("gameover", s.menuIndex, s.menuPress, api);
      if (!m.confirmed) return { ...s, menuIndex: m.index, menuPress: m.press };
      if (m.index === 0) return enterPlay(newGame(s));
      return toTitle(s, 0);
    }
  }
}

/** Runs `ticks` whole ticks of live play, playing each tick's cues on it. */
export function runTicks(
  state: View,
  ticks: number,
  held: Omit<TickInput, "fire" | "torpedo">,
  play: (cue: CueName) => void,
): ShatterState {
  let s = thaw(state);
  for (let i = 0; i < ticks; i++) {
    if (s.screen !== "playing") {
      s = { ...s, simTime: s.simTime + TICK_DT };
      continue;
    }
    const cues = new Set<CueName>();
    const input: TickInput = {
      ...held,
      fire: s.fireQueued || s.fireHeld,
      torpedo: s.torpedoQueued,
    };
    s = tick(s, input, cues);
    s = {
      ...s,
      simTime: s.simTime + TICK_DT,
      fireQueued: false,
      torpedoQueued: false,
    };
    for (const cue of cues) play(cue);
  }
  return s;
}

/** The whole of one `update`. */
export function stepFrame(
  state: View,
  api: UpdateApi,
  dt: number,
): ShatterState {
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());

  let s = screenInput(state, api);
  const { ticks, rest } = accumulate(s.tickClock, dt);
  s = { ...s, tickClock: rest };

  if (s.screen === "playing") {
    const held = {
      left: api.input.value("left") > 0,
      right: api.input.value("right") > 0,
      thrust: api.input.value("up") > 0,
    };
    s = runTicks(s, ticks, held, (cue) => api.audio.play(cue));
  } else {
    s = { ...s, simTime: s.simTime + ticks * TICK_DT };
  }

  const burning = s.screen === "playing" && s.ship.thrusting;
  if (burning && !api.audio.looping(CUES.thrust)) api.audio.loop(CUES.thrust);
  if (!burning && api.audio.looping(CUES.thrust)) api.audio.stop(CUES.thrust);

  return { ...s, muted: api.audio.muted() };
}
