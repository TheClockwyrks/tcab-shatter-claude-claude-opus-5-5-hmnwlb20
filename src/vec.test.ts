import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W, MU, SOFTEN, STAR_X, STAR_Y } from "./constants";
import {
  gravityAt,
  normalizeAngle,
  separation,
  sweptContact,
  wrapCoord,
  wrapDelta,
  wrappedDistance,
} from "./vec";

describe("the wrapping field", () => {
  it("wraps coordinates into range on both sides", () => {
    expect(wrapCoord(FIELD_W + 10, FIELD_W)).toBeCloseTo(10);
    expect(wrapCoord(-10, FIELD_W)).toBeCloseTo(FIELD_W - 10);
    expect(wrapCoord(FIELD_W, FIELD_W)).toBe(0);
  });

  it("takes the shortest separation across a seam, in [-size/2, size/2)", () => {
    expect(wrapDelta(FIELD_W - 20, FIELD_W)).toBeCloseTo(-20);
    expect(wrapDelta(FIELD_W / 2, FIELD_W)).toBeCloseTo(-FIELD_W / 2);
    expect(wrapDelta(-FIELD_H / 2, FIELD_H)).toBeCloseTo(-FIELD_H / 2);
    const s = separation(5, 5, FIELD_W - 5, FIELD_H - 5);
    expect(s.dx).toBeCloseTo(-10);
    expect(s.dy).toBeCloseTo(-10);
    expect(wrappedDistance(0, 0, FIELD_W - 3, FIELD_H - 4)).toBeCloseTo(5);
  });

  it("normalizes angles into (-PI, PI]", () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5);
  });
});

describe("the gravity law", () => {
  const mag = (x: number, y: number): number =>
    Math.hypot(gravityAt(x, y).ax, gravityAt(x, y).ay);

  it("matches the table in specs/gravity.md", () => {
    expect(mag(STAR_X + 200, STAR_Y)).toBeCloseTo(112.5);
    expect(mag(STAR_X, STAR_Y + 150)).toBeCloseTo(200);
    expect(mag(STAR_X - 120, STAR_Y)).toBeCloseTo(312.5);
    expect(mag(STAR_X + 40, STAR_Y)).toBeCloseTo(MU / (SOFTEN * SOFTEN));
  });

  it("points at the star along the direct, unwrapped vector", () => {
    const g = gravityAt(10, STAR_Y);
    expect(g.ax).toBeGreaterThan(0);
    expect(g.ay).toBeCloseTo(0);
    expect(gravityAt(STAR_X, STAR_Y)).toEqual({ ax: 0, ay: 0 });
  });
});

describe("swept contact", () => {
  it("reports overlap at the start of the tick as t = 0", () => {
    expect(sweptContact(3, 0, 0, 0, 5)).toBe(0);
  });

  it("catches a fast body passing straight through", () => {
    const t = sweptContact(100, 0, -200, 0, 10);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(0.45);
  });

  it("misses bodies that never come within reach or move apart", () => {
    expect(sweptContact(100, 50, -200, 0, 10)).toBeNull();
    expect(sweptContact(100, 0, 50, 0, 10)).toBeNull();
    expect(sweptContact(100, 0, 0, 0, 10)).toBeNull();
    expect(sweptContact(100, 0, -50, 0, 10)).toBeNull();
  });
});
