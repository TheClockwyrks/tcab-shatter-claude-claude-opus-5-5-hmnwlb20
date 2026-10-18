import { describe, expect, it } from "vitest";
import {
  BULLET_LIFE,
  FACE_UP,
  FIRE_INTERVAL_TICKS,
  MAX_BULLETS,
  MUZZLE_SPEED,
  SAFE_X,
  SAFE_Y,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SHIP_TURN,
  STAR_X,
  STAR_Y,
  TICK_DT,
} from "./constants";
import { bootQuiet } from "./test/harness";

describe("inertial flight", () => {
  it("turns at SHIP_TURN without touching the velocity", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 200, 200));
    h.keyDown("ArrowRight");
    await h.frames(60);
    h.keyUp("ArrowRight");
    const s = h.snap();
    expect(s.ship.angle - FACE_UP).toBeCloseTo(SHIP_TURN * 60 * TICK_DT, 5);
    expect(s.ship.speed).toBe(0);
  });

  it("turns counter-clockwise on the left key", async () => {
    const h = await bootQuiet();
    h.keyDown("KeyA");
    await h.frames(12);
    expect(h.snap().ship.angle).toBeLessThan(FACE_UP);
  });

  it("thrusts along the facing and is never pulled by the star", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 100));
    h.pose((s) => h.debug.setShipAngle(s, 0));
    h.keyDown("ArrowUp");
    await h.frames(1);
    const s = h.snap();
    expect(s.ship.thrusting).toBe(true);
    expect(s.ship.vx).toBeGreaterThan(SHIP_THRUST * TICK_DT * 0.99);
    expect(s.ship.vy).toBe(0);
    h.keyUp("ArrowUp");
    await h.frames(1);
    expect(h.snap().ship.thrusting).toBe(false);
  });

  it("halves an un-thrusting ship's speed every three seconds", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 100));
    h.pose((s) => h.debug.setShipVelocity(s, 200, 0));
    await h.seconds(3);
    expect(h.snap().ship.speed).toBeCloseTo(100, 3);
  });

  it("caps the speed at SHIP_MAX", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 100));
    h.pose((s) => h.debug.setShipAngle(s, 0));
    h.pose((s) => h.debug.setShipVelocity(s, SHIP_MAX, 0));
    h.keyDown("ArrowUp");
    await h.frames(30);
    expect(h.snap().ship.speed).toBeLessThanOrEqual(SHIP_MAX + 1e-9);
    expect(h.snap().ship.speed).toBeGreaterThan(SHIP_MAX - 1);
  });

  it("slides along the core without losing a life", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, STAR_X, STAR_Y + 50));
    h.pose((s) => h.debug.setShipVelocity(s, 60, -300));
    await h.frames(10);
    const s = h.snap();
    const d = Math.hypot(s.ship.x - STAR_X, s.ship.y - STAR_Y);
    expect(d).toBeGreaterThanOrEqual(44 - 1e-6);
    expect(s.ship.vx).toBeGreaterThan(0);
    expect(s.lives).toBe(3);
  });

  it("wraps across the field edge carrying its velocity", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 1278, 100));
    h.pose((s) => h.debug.setShipVelocity(s, 240, 0));
    await h.frames(3);
    const s = h.snap();
    expect(s.ship.x).toBeLessThan(10);
    expect(s.ship.vx).toBeGreaterThan(238);
  });
});

describe("the gun", () => {
  it("fires from the nose with the ship's velocity plus the muzzle speed", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 200, 600));
    h.pose((s) => h.debug.setShipVelocity(s, 30, 0));
    h.keyDown("Space");
    await h.frames(1);
    const s = h.snap();
    expect(s.bullets).toHaveLength(1);
    const b = s.bullets[0];
    expect(b).toBeDefined();
    if (!b) return;
    expect(Math.hypot(b.x - s.ship.x, b.y - s.ship.y)).toBeLessThanOrEqual(
      SHIP_R + 5,
    );
    expect(b.vy).toBeLessThan(-MUZZLE_SPEED + 20);
    expect(b.vx).toBeGreaterThan(25);
    expect(s.ship.fireCooldown).toBe(FIRE_INTERVAL_TICKS);
  });

  it("repeats at the gate while held, up to four in flight", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 100, 650));
    h.pose((s) => h.debug.setShipAngle(s, 0));
    h.keyDown("Space");
    await h.frames(FIRE_INTERVAL_TICKS);
    expect(h.snap().bullets).toHaveLength(1);
    await h.frames(1);
    expect(h.snap().bullets).toHaveLength(2);
    await h.frames(FIRE_INTERVAL_TICKS * 6);
    expect(h.snap().bullets.length).toBeLessThanOrEqual(MAX_BULLETS);
    expect(h.snap().bullets).toHaveLength(MAX_BULLETS);
  });

  it("does not fire while the gate is shut", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setFireCooldown(s, 50));
    await h.tap("Space");
    expect(h.snap().bullets).toHaveLength(0);
    expect(h.snap().ship.fireCooldown).toBe(48);
  });

  it("removes a bullet when its lifetime runs out", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addBullet(s, 100, 650, 10, 0));
    await h.seconds(BULLET_LIFE - 0.05);
    expect(h.snap().bullets).toHaveLength(1);
    await h.seconds(0.1);
    expect(h.snap().bullets).toHaveLength(0);
  });

  it("bends a bullet toward the star", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addBullet(s, STAR_X - 300, STAR_Y - 150, 400, 0));
    await h.seconds(0.5);
    expect(h.snap().bullets[0]?.vy ?? 0).toBeGreaterThan(10);
  });

  it("is absorbed by the core", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addBullet(s, STAR_X, STAR_Y + 100, 0, -500));
    await h.seconds(0.3);
    expect(h.snap().bullets).toHaveLength(0);
    expect(h.snap().score).toBe(0);
  });

  it("starts each life at the safe point", async () => {
    const h = await bootQuiet();
    const s = h.snap();
    expect([s.ship.x, s.ship.y, s.ship.angle]).toEqual([
      SAFE_X,
      SAFE_Y,
      FACE_UP,
    ]);
  });
});
