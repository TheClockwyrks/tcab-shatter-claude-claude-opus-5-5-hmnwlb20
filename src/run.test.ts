import { describe, expect, it } from "vitest";
import {
  INVULN_TIME,
  SAFE_X,
  SAFE_Y,
  START_LIVES,
  STAR_X,
  STAR_Y,
  WAVE_BANNER_TIME,
  WAVE_BASE_ROCKS,
  WAVE_MIN_SHIP_DIST,
  WAVE_MIN_STAR_DIST,
} from "./constants";
import { boot, bootQuiet } from "./test/harness";
import { wrappedDistance } from "./vec";
import { waveSpeedFactor } from "./world";

describe("lives", () => {
  it("loses a ship to a rock and respawns at the safe point with grace", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipPosition(s, 200, 200));
    h.pose((s) => h.debug.setTorpedoCharge(s, 0.2));
    h.pose((s) => h.debug.addRock(s, "small", 220, 200));
    const deaths: string[] = [];
    h.engine.events.on("cue:played", (e) => deaths.push(e.cue));
    await h.frames(1);
    const s = h.snap();
    expect(s.lives).toBe(START_LIVES - 1);
    expect([s.ship.x, s.ship.y, s.ship.speed]).toEqual([SAFE_X, SAFE_Y, 0]);
    expect(s.ship.invuln).toBeCloseTo(INVULN_TIME);
    expect(s.torpedoCharge).toBe(1);
    expect(deaths).toContain("death");
  });

  it("ignores lethal contact through the grace and resumes as it ends", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipInvuln(s, 0.5));
    h.pose((s) => h.debug.addRock(s, "large", SAFE_X, SAFE_Y));
    await h.seconds(0.4);
    expect(h.snap().lives).toBe(3);
    await h.seconds(0.2);
    expect(h.snap().lives).toBe(2);
  });

  it("costs nothing with the contact gate off", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.addRock(s, "large", SAFE_X, SAFE_Y));
    h.pose((s) => h.debug.addEnemyBullet(s, SAFE_X, SAFE_Y, 0, 0));
    await h.frames(10);
    expect(h.snap().lives).toBe(3);
  });

  it("loses a ship to a saucer bullet, removing the bullet", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addEnemyBullet(s, SAFE_X - 40, SAFE_Y, 300, 0));
    await h.seconds(0.2);
    expect(h.snap().lives).toBe(2);
    expect(h.snap().enemyBullets).toHaveLength(0);
  });

  it("loses a ship to the saucer itself", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.addSaucer(s, SAFE_X, SAFE_Y));
    await h.frames(1);
    expect(h.snap().lives).toBe(2);
  });

  it("ends the game on the tick the last ship is lost", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setLives(s, 1));
    h.pose((s) => h.debug.setScore(s, 1234));
    h.pose((s) => h.debug.addRock(s, "large", SAFE_X, SAFE_Y));
    await h.frames(1);
    const s = h.snap();
    expect(s.screen).toBe("gameover");
    expect(s.lives).toBe(0);
    expect(s.menuIndex).toBe(0);
    expect(s.score).toBe(1234);
  });
});

describe("the extra ship", () => {
  it("is granted for each multiple crossed, and not by a posed score", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setScore(s, 9990));
    expect(h.snap().lives).toBe(3);
    h.pose((s) => h.debug.addRock(s, "small", 200, 150));
    h.pose((s) => h.debug.addBullet(s, 176, 150, 600, 0));
    const cues: string[] = [];
    h.engine.events.on("cue:played", (e) => cues.push(e.cue));
    await h.frames(4);
    expect(h.snap().score).toBe(10090);
    expect(h.snap().lives).toBe(4);
    expect(cues).toContain("extra-life");
    expect(h.engine.state.extraLifeTimer).toBeGreaterThan(0.5);
  });
});

describe("waves", () => {
  it("opens with the WAVE 1 banner and spawns four rocks clear of the ship and the star", async () => {
    const h = await boot();
    await h.tap("Enter");
    let s = h.snap();
    expect(s.screen).toBe("playing");
    expect(s.wave).toBe(1);
    expect(s.lives).toBe(START_LIVES);
    expect(s.rocks).toHaveLength(0);
    expect(s.waveBanner).toBeGreaterThan(0);
    await h.seconds(WAVE_BANNER_TIME);
    s = h.snap();
    expect(s.waveBanner).toBe(0);
    expect(s.rocks).toHaveLength(WAVE_BASE_ROCKS + 1);
    for (const r of s.rocks) {
      expect(r.size).toBe("large");
      expect(r.health).toBe(3);
      expect(
        wrappedDistance(r.x, r.y, s.ship.x, s.ship.y),
      ).toBeGreaterThanOrEqual(WAVE_MIN_SHIP_DIST - 5);
      expect(wrappedDistance(r.x, r.y, STAR_X, STAR_Y)).toBeGreaterThanOrEqual(
        WAVE_MIN_STAR_DIST - 5,
      );
    }
  });

  it("clears on the tick the last rock is destroyed and spawns the next wave as the banner ends", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setWaveSpawning(s, true));
    h.pose((s) => h.debug.setWave(s, 3));
    h.pose((s) => h.debug.addRock(s, "small", 200, 150));
    h.pose((s) => h.debug.addBullet(s, 176, 150, 600, 0));
    h.pose((s) => h.debug.setNextRockSpeed(s, 100));
    await h.frames(4);
    let s = h.snap();
    expect(s.wave).toBe(4);
    expect(s.waveBanner).toBeGreaterThan(WAVE_BANNER_TIME - 0.1);
    expect(s.rocks).toHaveLength(0);
    await h.seconds(WAVE_BANNER_TIME);
    s = h.snap();
    expect(s.rocks).toHaveLength(WAVE_BASE_ROCKS + 4);
    expect(s.nextRockSpeed).toBeNull();
  });

  it("scales a wave's speed by the factor, capped at forty percent", () => {
    expect(waveSpeedFactor(1)).toBe(1);
    expect(waveSpeedFactor(6)).toBeCloseTo(1.2);
    expect(waveSpeedFactor(11)).toBeCloseTo(1.4);
    expect(waveSpeedFactor(30)).toBeCloseTo(1.4);
  });

  it("does not clear on a field emptied without a destruction", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setWaveSpawning(s, true));
    h.pose((s) => h.debug.setWave(s, 2));
    await h.frames(10);
    expect(h.snap().wave).toBe(2);
    expect(h.snap().waveBanner).toBe(0);
  });

  it("runs a posed banner down and puts up the wave it names, unless the gate is shut", async () => {
    const h = await bootQuiet();
    h.pose((s) => h.debug.setWave(s, 2));
    h.pose((s) => h.debug.setWaveBanner(s, 0.2));
    await h.seconds(0.3);
    expect(h.snap().rocks).toHaveLength(0);
    h.pose((s) => h.debug.setWaveSpawning(s, true));
    h.pose((s) => h.debug.setWaveBanner(s, 0.2));
    await h.seconds(0.3);
    expect(h.snap().rocks).toHaveLength(WAVE_BASE_ROCKS + 2);
  });
});
