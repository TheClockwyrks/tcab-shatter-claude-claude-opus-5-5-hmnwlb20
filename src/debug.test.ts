import { describe, expect, it } from "vitest";
import {
  FACE_UP,
  SAFE_X,
  SAFE_Y,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_SPEED,
  SAUCER_WEAVE_INTERVAL,
  SHATTER_DEBUG_VERSION,
} from "./constants";
import { boot } from "./test/harness";

describe("the debug surface", () => {
  it("carries its version and reports a complete snapshot", async () => {
    const h = await boot();
    expect(h.debug.version).toBe(SHATTER_DEBUG_VERSION);
    const s = h.snap();
    expect(Object.keys(s).sort()).toEqual(
      [
        "version",
        "screen",
        "menuIndex",
        "score",
        "lives",
        "wave",
        "waveBanner",
        "muted",
        "waveSpawning",
        "saucerSpawning",
        "saucerClock",
        "saucerDue",
        "nextSaucerEdge",
        "nextSaucerRow",
        "nextSaucerAim",
        "nextRockSpeed",
        "nextRecycleEdge",
        "ship",
        "bullets",
        "rocks",
        "saucer",
        "enemyBullets",
        "torpedoes",
        "torpedoCharge",
        "torpedoReady",
        "simTime",
      ].sort(),
    );
    expect(s.ship.speed).toBe(0);
    expect(s.torpedoReady).toBe(true);
  });

  it("poses and reads back every field it sets", async () => {
    const h = await boot();
    const d = h.debug;
    h.pose((s) => d.setScreen(s, "paused"));
    h.pose((s) => d.setMenuIndex(s, 2));
    h.pose((s) => d.setScore(s, 70));
    h.pose((s) => d.setLives(s, 5));
    h.pose((s) => d.setWave(s, 4));
    h.pose((s) => d.setWaveBanner(s, 1));
    h.pose((s) => d.setWaveSpawning(s, false));
    h.pose((s) => d.setSaucerSpawning(s, false));
    h.pose((s) => d.setSaucerDue(s, 3));
    h.pose((s) => d.setShipPosition(s, 10, 20));
    h.pose((s) => d.setShipVelocity(s, 3, 4));
    h.pose((s) => d.setShipAngle(s, 1));
    h.pose((s) => d.setShipInvuln(s, 2));
    h.pose((s) => d.setFireCooldown(s, 9));
    h.pose((s) => d.setShipCollision(s, false));
    h.pose((s) => d.setNextSaucerEdge(s, "left"));
    h.pose((s) => d.setNextSaucerRow(s, 50));
    h.pose((s) => d.setNextSaucerAim(s, 0.1));
    h.pose((s) => d.setNextRockSpeed(s, 80));
    h.pose((s) => d.setNextRecycleEdge(s, "bottom"));
    h.pose((s) => d.setTorpedoCharge(s, 0.25));
    const s = h.snap();
    expect(s).toMatchObject({
      screen: "paused",
      menuIndex: 2,
      score: 70,
      lives: 5,
      wave: 4,
      waveBanner: 1,
      waveSpawning: false,
      saucerSpawning: false,
      saucerDue: 3,
      nextSaucerEdge: "left",
      nextSaucerRow: 50,
      nextSaucerAim: 0.1,
      nextRockSpeed: 80,
      nextRecycleEdge: "bottom",
      torpedoCharge: 0.25,
      torpedoReady: false,
      ship: {
        x: 10,
        y: 20,
        vx: 3,
        vy: 4,
        speed: 5,
        angle: 1,
        invuln: 2,
        fireCooldown: 9,
        collision: false,
      },
    });
    expect(h.debug.reconcile(h.engine.state)).toEqual(h.engine.state);
  });

  it("adds, addresses, and removes entities by id", async () => {
    const h = await boot();
    const d = h.debug;
    h.pose((s) => d.addRock(s, "medium", 100, 100));
    h.pose((s) => d.addBullet(s, 1, 2, 3, 4));
    h.pose((s) => d.addEnemyBullet(s, 5, 6, 7, 8));
    h.pose((s) => d.addTorpedo(s, 9, 10, 0));
    h.pose((s) => d.addSaucer(s, 300, 200));
    const s = h.snap();
    const ids = [
      s.rocks[0]?.id,
      s.bullets[0]?.id,
      s.enemyBullets[0]?.id,
      s.torpedoes[0]?.id,
      s.saucer?.id,
    ];
    expect(new Set(ids).size).toBe(5);
    expect(s.rocks[0]).toMatchObject({
      size: "medium",
      radius: 26,
      health: 2,
      vx: 0,
      vy: 0,
    });
    expect(s.saucer).toMatchObject({
      vx: SAUCER_SPEED,
      vy: 0,
      weave: 1,
      fireClock: SAUCER_FIRE_INTERVAL,
      weaveClock: SAUCER_WEAVE_INTERVAL,
      age: 0,
      mind: true,
      gun: true,
      travel: true,
    });
    const rid = s.rocks[0]?.id ?? -1;
    const tid = s.torpedoes[0]?.id ?? -1;
    h.pose((x) => d.setRockVelocity(x, rid, 5, 6));
    h.pose((x) => d.setRockHealth(x, rid, 1));
    h.pose((x) => d.setTorpedoHeading(x, tid, Math.PI / 2));
    h.pose((x) => d.setSaucerVelocity(x, -1, 2));
    h.pose((x) => d.setSaucerWeave(x, -1));
    let t = h.snap();
    expect(t.rocks[0]).toMatchObject({ vx: 5, vy: 6, health: 1 });
    expect(t.torpedoes[0]?.vy).toBeCloseTo(420);
    expect(t.saucer).toMatchObject({ vx: -1, vy: 2, weave: -1 });
    h.pose((x) => d.removeRock(x, rid));
    h.pose((x) => d.removeBullet(x, s.bullets[0]?.id ?? -1));
    h.pose((x) => d.removeEnemyBullet(x, s.enemyBullets[0]?.id ?? -1));
    h.pose((x) => d.removeTorpedo(x, tid));
    h.pose((x) => d.removeSaucer(x));
    t = h.snap();
    expect([
      t.rocks.length,
      t.bullets.length,
      t.enemyBullets.length,
      t.torpedoes.length,
      t.saucer,
    ]).toEqual([0, 0, 0, 0, null]);
    h.pose((x) => d.addRock(x, "small", 1, 1));
    h.pose((x) => d.addBullet(x, 1, 2, 3, 4));
    h.pose((x) => d.addEnemyBullet(x, 1, 2, 3, 4));
    h.pose((x) => d.addTorpedo(x, 1, 2, 3));
    h.pose((x) => d.clearRocks(x));
    h.pose((x) => d.clearBullets(x));
    h.pose((x) => d.clearEnemyBullets(x));
    h.pose((x) => d.clearTorpedoes(x));
    t = h.snap();
    expect([
      t.rocks.length,
      t.bullets.length,
      t.enemyBullets.length,
      t.torpedoes.length,
    ]).toEqual([0, 0, 0, 0]);
  });

  it("resets every declared field to the title, leaving mute alone", async () => {
    const h = await boot();
    await h.tap("KeyM");
    await h.tap("Enter");
    await h.seconds(2);
    h.pose((s) => h.debug.setNextSaucerAim(s, 1));
    h.pose((s) => h.debug.addSaucer(s, 1, 1));
    h.pose((s) => h.debug.reset(s));
    const s = h.snap();
    expect(s).toMatchObject({
      screen: "title",
      menuIndex: 0,
      score: 0,
      lives: 3,
      wave: 0,
      waveBanner: 0,
      rocks: [],
      bullets: [],
      enemyBullets: [],
      torpedoes: [],
      saucer: null,
      torpedoCharge: 1,
      waveSpawning: true,
      saucerSpawning: true,
      saucerClock: 0,
      saucerDue: SAUCER_FIRST_DELAY,
      nextSaucerAim: null,
      simTime: 0,
      muted: true,
      ship: {
        x: SAFE_X,
        y: SAFE_Y,
        vx: 0,
        vy: 0,
        angle: FACE_UP,
        invuln: 0,
        fireCooldown: 0,
        collision: true,
      },
    });
  });

  it("fails loudly on a call with no defined state", async () => {
    const h = await boot();
    const d = h.debug;
    const st = h.engine.state;
    expect(() => d.setScore(st, Number.NaN)).toThrow();
    expect(() => d.setShipPosition(st, Infinity, 0)).toThrow();
    expect(() => d.setScreen(st, "nowhere" as never)).toThrow();
    expect(() => d.addRock(st, "huge" as never, 0, 0)).toThrow();
    expect(() => d.removeRock(st, 999)).toThrow();
    expect(() => d.removeBullet(st, 999)).toThrow();
    expect(() => d.setTorpedoHeading(st, 999, 0)).toThrow();
    expect(() => d.setSaucerVelocity(st, 1, 1)).toThrow();
    expect(() => d.setSaucerWeave(st, 0 as never)).toThrow();
    expect(() => d.setTorpedoCharge(st, 2)).toThrow();
    expect(() => d.setWaveBanner(st, -1)).toThrow();
    expect(() => d.setMenuIndex(st, 7)).toThrow();
    expect(() => d.setWaveSpawning(st, "yes" as never)).toThrow();
    expect(() => d.setNextRecycleEdge(st, "middle" as never)).toThrow();
    expect(() => d.menuItemRect(st, Number.NaN)).toThrow();
    const withRock = d.addRock(st, "small", 1, 1);
    const id = withRock.rocks[0]?.id ?? -1;
    expect(() => d.setRockHealth(withRock, id, 2)).toThrow();
    expect(() => d.setRockHealth(withRock, id, 0)).toThrow();
    expect(d.removeSaucer(st)).toEqual(st);
    expect(d.menuItemRect(st, 5)).toBeNull();
  });

  it("leaves the state it was handed as it was", async () => {
    const h = await boot();
    const before = JSON.stringify(h.engine.state);
    h.debug.addRock(h.engine.state, "large", 1, 1);
    h.debug.setScore(h.engine.state, 5);
    expect(JSON.stringify(h.engine.state)).toBe(before);
  });
});

describe("diagnostics", () => {
  it("registers the required readings as pure reads", async () => {
    const h = await boot();
    h.pose((s) => h.debug.addSaucer(s, 10, 20));
    const names = h.engine.diagnostics().map((d) => d.name);
    for (const n of [
      "screen",
      "score",
      "lives",
      "wave",
      "ship pos",
      "ship vel",
      "ship speed",
      "ship facing",
      "ship grace",
      "bullets",
      "rocks",
      "saucer",
      "torpedo charge",
      "torpedoes",
      "sim time",
    ]) {
      expect(names).toContain(n);
    }
    expect(h.engine.diagnostics().every((d) => d.error === undefined)).toBe(
      true,
    );
    expect(h.engine.diagnostics().find((d) => d.name === "saucer")?.value).toBe(
      "10.0, 20.0",
    );
    h.pose((s) => h.debug.removeSaucer(s));
    expect(h.engine.diagnostics().find((d) => d.name === "saucer")?.value).toBe(
      "none",
    );
  });
});
