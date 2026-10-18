// Shatter — a keyboard autopilot for capturing the showcase.
//
// It plays the way a person does: it looks at the field and holds keys. It
// reads the state and never poses it, so everything a capture shows comes from
// the game's own rules.

import type { DeepReadonly } from "ts-essentials";
import {
  MUZZLE_SPEED,
  ROCK_RADIUS,
  STAR_X,
  STAR_Y,
  TORPEDO_CONE,
} from "../src/constants";
import type { ShatterState } from "../src/game";
import { normalizeAngle, separation } from "../src/vec";

export interface Keys {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
  torpedo: boolean;
}

export interface PilotOptions {
  /** Launch the torpedo when a Large rock sits in the cone. */
  readonly torpedoes: boolean;
}

/** The keys a steady player would hold this frame. */
export function pilot(s: DeepReadonly<ShatterState>, opts: PilotOptions): Keys {
  const keys: Keys = {
    left: false,
    right: false,
    up: false,
    fire: false,
    torpedo: false,
  };
  const ship = s.ship;

  // Pick a target: the saucer first, else the nearest rock, led for flight time.
  let best: { x: number; y: number; d: number; large: boolean } | null = null;
  const consider = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    large: boolean,
    bias: number,
  ): void => {
    const { dx, dy } = separation(ship.x, ship.y, x, y);
    const d = Math.hypot(dx, dy);
    const t = d / MUZZLE_SPEED;
    const score = d * bias;
    if (!best || score < best.d)
      best = {
        x: ship.x + dx + vx * t,
        y: ship.y + dy + vy * t,
        d: score,
        large,
      };
  };
  for (const r of s.rocks)
    consider(r.x, r.y, r.vx, r.vy, r.size === "large", 1);
  if (s.saucer)
    consider(s.saucer.x, s.saucer.y, s.saucer.vx, s.saucer.vy, false, 0.4);

  // Danger: a rock closing in, or the star's core ahead.
  let flee: number | null = null;
  for (const r of s.rocks) {
    const { dx, dy } = separation(ship.x, ship.y, r.x, r.y);
    const gap = Math.hypot(dx, dy) - ROCK_RADIUS[r.size];
    const closing = dx * (r.vx - ship.vx) + dy * (r.vy - ship.vy) < 0;
    if (gap < 70 && closing) flee = Math.atan2(-dy, -dx);
  }

  let desired: number | null = null;
  if (flee !== null && ship.invuln <= 0) {
    desired = flee;
    keys.up = Math.abs(normalizeAngle(flee - ship.angle)) < 0.6;
  } else if (best) {
    const b: { x: number; y: number; d: number; large: boolean } = best;
    desired = Math.atan2(b.y - ship.y, b.x - ship.x);
    const err = Math.abs(normalizeAngle(desired - ship.angle));
    keys.fire = err < 0.1;
    keys.torpedo =
      opts.torpedoes &&
      b.large &&
      err < TORPEDO_CONE * 0.6 &&
      s.torpedoCharge >= 1;
    const { dx, dy } = separation(ship.x, ship.y, STAR_X, STAR_Y);
    keys.up =
      err < 0.3 &&
      b.d > 420 &&
      Math.hypot(ship.vx, ship.vy) < 120 &&
      Math.hypot(dx, dy) > 160;
  }
  if (desired !== null) {
    const err = normalizeAngle(desired - ship.angle);
    if (err > 0.04) keys.right = true;
    else if (err < -0.04) keys.left = true;
  }
  return keys;
}
