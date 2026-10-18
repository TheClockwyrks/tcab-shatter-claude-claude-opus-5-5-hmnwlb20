import { describe, expect, it } from "vitest";
import {
  CORE_R,
  FIELD_H,
  FIELD_W,
  ROCK_HEALTH,
  ROCK_RADIUS,
  SCORE_LARGE,
  SCORE_MEDIUM,
  SCORE_SMALL,
  SPLIT_KICK,
  STAR_X,
  STAR_Y,
  TORPEDO_SCATTER,
} from "./constants";
import { bootQuiet, last, type Harness } from "./test/harness";

/** Places a rock in a quiet corner and a bullet just beside it, heading in. */
async function shootRock(
  h: Harness,
  size: "large" | "medium" | "small",
): Promise<number> {
  h.pose((s) => h.debug.addRock(s, size, 200, 150));
  const id = last(h.snap().rocks)?.id ?? -1;
  h.pose((s) =>
    h.debug.addBullet(s, 200 - ROCK_RADIUS[size] - 10, 150, 600, 0),
  );
  await h.frames(4);
  return id;
}

describe("armor", () => {
  it("chips a large rock without destroying or scoring it", async () => {
    const h = await bootQuiet();
    const id = await shootRock(h, "large");
    const s = h.snap();
    expect(s.rocks).toHaveLength(1);
    expect(s.rocks[0]?.id).toBe(id);
    expect(s.rocks[0]?.health).toBe(ROCK_HEALTH.large - 1);
    expect(s.bullets).toHaveLength(0);
    expect(s.score).toBe(0);
    expect(h.engine.state.rocks[0]?.flash ?? 0).toBeGreaterThan(0);
    await h.seconds(0.2);
    expect(h.engine.state.rocks[0]?.flash).toBe(0);
  });

  it("splits on the hit that takes health to zero, fanning across the shot", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "large", 200, 150));
    const id = h.snap().rocks[0]?.id ?? -1;
    h.pose((s) => h.debug.setRockHealth(s, id, 1));
    h.pose((s) => h.debug.addBullet(s, 140, 150, 600, 0));
    await h.frames(4);
    const s = h.snap();
    expect(s.score).toBe(SCORE_LARGE);
    expect(s.rocks).toHaveLength(2);
    const [a, b] = s.rocks;
    expect(a?.size).toBe("medium");
    expect(a?.health).toBe(ROCK_HEALTH.medium);
    expect(a?.id).not.toBe(id);
    expect(b?.id).not.toBe(a?.id);
    // Perpendicular to a bullet travelling +x: the kick is along y, opposite ways.
    expect(Math.abs((a?.vy ?? 0) - (b?.vy ?? 0))).toBeCloseTo(
      2 * SPLIT_KICK,
      0,
    );
    expect(Math.abs((a?.vx ?? 0) - (b?.vx ?? 0))).toBeLessThan(1);
  });

  it("pays each size's figure on destruction", async () => {
    for (const [size, score] of [
      ["medium", SCORE_MEDIUM],
      ["small", SCORE_SMALL],
    ] as const) {
      const h = await bootQuiet();
      h.pose((s) => h.debug.addRock(s, size, 200, 150));
      const id = h.snap().rocks[0]?.id ?? -1;
      h.pose((s) => h.debug.setRockHealth(s, id, 1));
      h.pose((s) =>
        h.debug.addBullet(s, 200 - ROCK_RADIUS[size] - 10, 150, 600, 0),
      );
      await h.frames(4);
      expect(h.snap().score).toBe(score);
      expect(h.snap().rocks).toHaveLength(size === "small" ? 0 : 2);
    }
  });

  it("lets rocks pass through each other", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "small", 100, 100));
    h.pose((s) => h.debug.addRock(s, "small", 110, 100));
    await h.frames(10);
    expect(h.snap().rocks).toHaveLength(2);
  });
});

describe("the torpedo", () => {
  it("launches from the nose at its own speed, spending the charge", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 600));
    h.pose((s) => h.debug.setShipVelocity(s, 200, 0));
    h.pose((s) => h.debug.setShipAngle(s, 0));
    await h.tap("KeyF");
    const s = h.snap();
    expect(s.torpedoes).toHaveLength(1);
    expect(s.torpedoes[0]?.vx).toBeCloseTo(420);
    expect(s.torpedoes[0]?.vy).toBeCloseTo(0);
    expect(s.torpedoReady).toBe(false);
    expect(s.torpedoCharge).toBeLessThan(0.01);
  });

  it("recharges linearly over ten seconds and refuses below full", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setTorpedoCharge(s, 0));
    await h.seconds(5);
    expect(h.snap().torpedoCharge).toBeCloseTo(0.5, 3);
    await h.tap("KeyF");
    expect(h.snap().torpedoes).toHaveLength(0);
    await h.seconds(5);
    expect(h.snap().torpedoReady).toBe(true);
  });

  it("launches at most one at a time", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 650));
    h.pose((s) => h.debug.setShipAngle(s, 0));
    await h.tap("KeyF");
    h.pose((s) => h.debug.setTorpedoCharge(s, 1));
    await h.tap("KeyF");
    expect(h.snap().torpedoes).toHaveLength(1);
  });

  it("homes onto a rock in its cone and destroys it outright, scattering along its line", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "large", 400, 100));
    h.pose((s) => h.debug.addTorpedo(s, 100, 130, 0));
    await h.seconds(1);
    const s = h.snap();
    expect(s.torpedoes).toHaveLength(0);
    expect(s.score).toBe(SCORE_LARGE);
    expect(s.rocks).toHaveLength(2);
    const [a, b] = s.rocks;
    const sep = Math.hypot(
      (a?.vx ?? 0) - (b?.vx ?? 0),
      (a?.vy ?? 0) - (b?.vy ?? 0),
    );
    expect(Math.abs(sep - 2 * TORPEDO_SCATTER)).toBeLessThan(10);
  });

  it("never acquires a body behind it and flies straight through the well", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "small", 100, 500));
    h.pose((s) => h.debug.addTorpedo(s, 300, STAR_Y - 120, 0));
    await h.frames(30);
    const t = h.snap().torpedoes[0];
    expect(t?.heading).toBe(0);
    expect(t?.vy).toBe(0);
  });

  it("holds its heading with guidance off", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "large", 400, 160));
    h.pose((s) => h.debug.addTorpedo(s, 100, 130, 0));
    const id = h.snap().torpedoes[0]?.id ?? -1;
    h.pose((s) => h.debug.setTorpedoHoming(s, id, false));
    await h.frames(20);
    expect(h.snap().torpedoes[0]?.heading).toBe(0);
  });

  it("passes through the ship and is absorbed by the core", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 300, STAR_Y));
    h.pose((s) => h.debug.addTorpedo(s, 250, STAR_Y, 0));
    await h.frames(20);
    expect(h.snap().lives).toBe(3);
    expect(h.snap().torpedoes).toHaveLength(1);
    await h.seconds(1);
    expect(h.snap().torpedoes).toHaveLength(0);
    expect(h.snap().score).toBe(0);
  });

  it("expires after its lifetime", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addTorpedo(s, 100, 40, 0));
    await h.seconds(3.4);
    expect(h.snap().torpedoes).toHaveLength(1);
    await h.seconds(0.2);
    expect(h.snap().torpedoes).toHaveLength(0);
  });
});

describe("star recycling", () => {
  it("re-places a swallowed rock on the posed edge at the posed speed, keeping its health", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "large", STAR_X + 100, STAR_Y));
    const id = h.snap().rocks[0]?.id ?? -1;
    h.pose((s) => h.debug.setRockHealth(s, id, 2));
    h.pose((s) => h.debug.setNextRecycleEdge(s, "left"));
    h.pose((s) => h.debug.setNextRockSpeed(s, 77));
    await h.seconds(0.5);
    const s = h.snap();
    const r = s.rocks[0];
    expect(s.rocks).toHaveLength(1);
    expect(r?.id).toBe(id);
    expect(r?.health).toBe(2);
    expect(s.nextRecycleEdge).toBeNull();
    expect(s.nextRockSpeed).toBeNull();
    expect(Math.min(r?.x ?? 999, FIELD_W - (r?.x ?? 0))).toBeLessThan(80);
    expect(r?.vx ?? 0).toBeGreaterThan(0);
    expect(s.score).toBe(0);
  });

  it("draws an edge when none is posed", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addRock(s, "small", STAR_X, STAR_Y + CORE_R + 10));
    await h.frames(5);
    const r = h.snap().rocks[0];
    const nearEdge =
      Math.min(r?.x ?? 999, FIELD_W - (r?.x ?? 0)) < 30 ||
      Math.min(r?.y ?? 999, FIELD_H - (r?.y ?? 0)) < 30;
    expect(nearEdge).toBe(true);
  });
});
