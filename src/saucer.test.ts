import { describe, expect, it, vi } from "vitest";
import {
  CORE_R,
  FIELD_H,
  FIELD_W,
  SAUCER_BULLET_LIFE,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_GAP_MAX,
  SAUCER_GAP_MIN,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_SPEED,
  SCORE_SAUCER,
  STAR_X,
  STAR_Y,
} from "./constants";
import { boot, bootQuiet, last } from "./test/harness";

describe("the saucer's cadence", () => {
  it("first arrives SAUCER_FIRST_DELAY into a game, from the posed edge and row", async () => {
    const h = await boot(50);
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setWaveSpawning(s, false));
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.setNextSaucerEdge(s, "right"));
    h.pose((s) => h.debug.setNextSaucerRow(s, 100));
    const played: string[] = [];
    h.engine.events.on("cue:played", (e) => played.push(e.cue));
    await h.seconds(SAUCER_FIRST_DELAY - 0.1);
    expect(h.snap().saucer).toBeNull();
    await h.seconds(0.15);
    const s = h.snap();
    expect(s.saucer).not.toBeNull();
    expect(s.saucer?.vx).toBe(-SAUCER_SPEED);
    expect(s.saucer?.y).toBeCloseTo(100);
    expect(s.saucer?.x ?? 0).toBeGreaterThan(FIELD_W - 30);
    expect(s.nextSaucerEdge).toBeNull();
    expect(s.nextSaucerRow).toBeNull();
    expect(played).toContain("saucer");
  });

  it("leaves after its lifetime and draws the next gap", async () => {
    const h = await bootQuiet(50);
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.addSaucer(s, 100, 100));
    h.pose((s) => h.debug.setSaucerGun(s, false));
    await h.seconds(SAUCER_LIFETIME - 0.1);
    expect(h.snap().saucer).not.toBeNull();
    await h.seconds(0.2);
    const s = h.snap();
    expect(s.saucer).toBeNull();
    expect(s.saucerDue).toBeGreaterThanOrEqual(SAUCER_GAP_MIN);
    expect(s.saucerDue).toBeLessThanOrEqual(SAUCER_GAP_MAX);
  });

  it("follows a removal with the next arrival once the clock reaches the due figure", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setSaucerSpawning(s, true));
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.addSaucer(s, 100, 100));
    h.pose((s) => h.debug.removeSaucer(s));
    h.pose((s) => h.debug.removeSaucer(s));
    h.pose((s) => h.debug.setSaucerDue(s, 1));
    await h.seconds(0.9);
    expect(h.snap().saucer).toBeNull();
    await h.seconds(0.2);
    expect(h.snap().saucer).not.toBeNull();
  });

  it("never arrives with the gate shut", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setSaucerDue(s, 0.5));
    await h.seconds(1);
    expect(h.snap().saucer).toBeNull();
  });
});

describe("the saucer's flight", () => {
  it("weaves every interval, reversing at each reroll", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, 100, 100));
    h.pose((s) => h.debug.setSaucerGun(s, false));
    h.pose((s) => h.debug.setSaucerWeave(s, -1));
    await h.seconds(0.95);
    expect(h.snap().saucer?.vy).toBe(0);
    await h.seconds(0.1);
    expect(h.snap().saucer?.vy).toBe(-SAUCER_WEAVE_SPEED);
    await h.seconds(1);
    expect(h.snap().saucer?.vy).toBe(SAUCER_WEAVE_SPEED);
  });

  it("holds its velocity with its mind off, and its place with travel off", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, 100, 100));
    h.pose((s) => h.debug.setSaucerMind(s, false));
    h.pose((s) => h.debug.setSaucerGun(s, false));
    await h.seconds(1.5);
    expect(h.snap().saucer?.vy).toBe(0);
    h.pose((s) => h.debug.setSaucerMind(s, true));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    const x = h.snap().saucer?.x;
    await h.seconds(1);
    expect(h.snap().saucer?.x).toBe(x);
    expect(h.snap().saucer?.vy).not.toBe(0);
  });

  it("steers around the core on a crossing lined up with the star", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.addSaucer(s, 300, STAR_Y));
    h.pose((s) => h.debug.setSaucerGun(s, false));
    let closest = Infinity;
    for (let i = 0; i < 500; i++) {
      await h.frames(1);
      const sc = h.snap().saucer;
      if (!sc) break;
      closest = Math.min(closest, Math.hypot(sc.x - STAR_X, sc.y - STAR_Y));
    }
    expect(closest).toBeGreaterThanOrEqual(CORE_R + SAUCER_R);
  });

  it("fires at the ship with the posed aim error, plus its own velocity", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.setShipPosition(s, 600, 100));
    h.pose((s) => h.debug.addSaucer(s, 100, 100));
    h.pose((s) => h.debug.setSaucerMind(s, false));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    h.pose((s) => h.debug.setNextSaucerAim(s, 0));
    await h.seconds(SAUCER_FIRE_INTERVAL - 0.05);
    expect(h.snap().enemyBullets).toHaveLength(0);
    await h.seconds(0.1);
    const b = h.snap().enemyBullets[0];
    expect(b).toBeDefined();
    expect(b?.vx ?? 0).toBeCloseTo(SAUCER_BULLET_SPEED + SAUCER_SPEED, -1);
    expect(h.snap().nextSaucerAim).toBeNull();
    await h.seconds(SAUCER_BULLET_LIFE);
    expect(h.snap().enemyBullets.length).toBeLessThanOrEqual(1);
  });

  it("draws a fresh aim error for every shot", async () => {
    const spy = vi.spyOn(Math, "random");
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.setShipPosition(s, 600, 200));
    h.pose((s) => h.debug.addSaucer(s, 100, 200));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    h.pose((s) => h.debug.setSaucerMind(s, false));
    spy.mockReturnValue(1);
    await h.seconds(SAUCER_FIRE_INTERVAL + 0.02);
    const a = last(h.snap().enemyBullets)?.vy ?? 0;
    spy.mockReturnValue(0);
    await h.seconds(SAUCER_FIRE_INTERVAL);
    spy.mockRestore();
    const b = last(h.snap().enemyBullets)?.vy ?? 0;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(0);
  });

  it("is destroyed by a bullet, scoring and restarting the cadence", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, 300, 100));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    h.pose((s) => h.debug.addBullet(s, 300, 160, 0, -600));
    await h.frames(10);
    const s = h.snap();
    expect(s.saucer).toBeNull();
    expect(s.score).toBe(SCORE_SAUCER);
    expect(s.bullets).toHaveLength(0);
    expect(s.saucerClock).toBeLessThan(0.1);
  });

  it("is destroyed by a torpedo", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, 400, 100));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    h.pose((s) => h.debug.addTorpedo(s, 200, 100, 0));
    await h.seconds(1);
    expect(h.snap().saucer).toBeNull();
    expect(h.snap().score).toBe(SCORE_SAUCER);
  });

  it("lets rocks and its own bullets pass harmlessly", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, 300, 600));
    h.pose((s) => h.debug.addRock(s, "large", 300, 600));
    h.pose((s) => h.debug.addEnemyBullet(s, 100, 300, 0, 0));
    h.pose((s) => h.debug.addRock(s, "small", 100, 300));
    await h.frames(5);
    expect(h.snap().saucer).not.toBeNull();
    expect(h.snap().rocks).toHaveLength(2);
    expect(h.snap().enemyBullets).toHaveLength(1);
    expect(FIELD_H).toBe(720);
  });
});
