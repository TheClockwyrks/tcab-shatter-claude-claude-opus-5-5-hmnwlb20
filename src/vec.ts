// Shatter — small geometric helpers over the wrapping field.

import { FIELD_H, FIELD_W, MU, SOFTEN, STAR_X, STAR_Y } from "./constants";

/** Brings a coordinate into `[0, size)`. */
export function wrapCoord(v: number, size: number): number {
  const r = v % size;
  return r < 0 ? r + size : r;
}

/** Brings one axis of a separation into `[-size / 2, +size / 2)`. */
export function wrapDelta(d: number, size: number): number {
  let r = (d + size / 2) % size;
  if (r < 0) r += size;
  return r - size / 2;
}

/** The shortest wrapped separation from `(ax, ay)` to `(bx, by)`. */
export function separation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dx: number; dy: number } {
  return { dx: wrapDelta(bx - ax, FIELD_W), dy: wrapDelta(by - ay, FIELD_H) };
}

/** The shortest wrapped distance between two positions. */
export function wrappedDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const { dx, dy } = separation(ax, ay, bx, by);
  return Math.hypot(dx, dy);
}

/**
 * The star's pull on a body at `(x, y)`, using the direct (unwrapped) vector to
 * the star as `specs/gravity.md` states.
 */
export function gravityAt(x: number, y: number): { ax: number; ay: number } {
  const dx = STAR_X - x;
  const dy = STAR_Y - y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { ax: 0, ay: 0 };
  const dEff = Math.max(d, SOFTEN);
  const mag = MU / (dEff * dEff);
  return { ax: (dx / d) * mag, ay: (dy / d) * mag };
}

/** An angle brought into `(-PI, PI]`. */
export function normalizeAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r <= -Math.PI) r += Math.PI * 2;
  if (r > Math.PI) r -= Math.PI * 2;
  return r;
}

/**
 * The earliest fraction `t` of a tick in `[0, 1]` at which two bodies moving in
 * straight lines come within `reach` of each other, or `null` if they never do.
 *
 * `sx, sy` is the wrapped separation from the first body to the second at the
 * start of the tick, and `mx, my` is the second's displacement over the tick
 * minus the first's.
 */
export function sweptContact(
  sx: number,
  sy: number,
  mx: number,
  my: number,
  reach: number,
): number | null {
  const c = sx * sx + sy * sy - reach * reach;
  if (c <= 0) return 0;
  const a = mx * mx + my * my;
  if (a === 0) return null;
  const b = 2 * (sx * mx + sy * my);
  if (b >= 0) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t <= 1 ? t : null;
}

/** A uniform draw from `[min, max)`. */
export function uniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
