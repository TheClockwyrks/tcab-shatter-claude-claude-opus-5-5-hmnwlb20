import { describe, expect, it } from "vitest";
import { BULLET_LIFE, TICK_DT, TRAIL_TICKS } from "./constants";
import { trailPath } from "./render";
import { boot, last } from "./test/harness";

describe("drawing", () => {
  it("draws every screen and every body without failing, recording real operations", async () => {
    const h = await boot();
    h.engine.startRecording();
    await h.frames(2);
    for (const screen of ["howto", "playing", "paused", "gameover"] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      h.pose((s) => h.debug.addRock(s, "large", 2, 2));
      h.pose((s) => h.debug.addBullet(s, 1278, 300, 300, 0));
      h.pose((s) => h.debug.addEnemyBullet(s, 300, 300, 0, 200));
      h.pose((s) => h.debug.addTorpedo(s, 600, 100, 0));
      h.pose((s) => h.debug.addSaucer(s, 1270, 500));
      h.pose((s) => h.debug.setShipInvuln(s, 1));
      h.pose((s) => h.debug.setLives(s, 14));
      h.pose((s) => h.debug.setWaveBanner(s, 1));
      await h.frames(3);
    }
    h.pose((s) => h.debug.setScreen(s, "playing"));
    const id = h.snap().rocks[0]?.id ?? -1;
    h.pose((s) => h.debug.setRockHealth(s, id, 1));
    h.keyDown("ArrowUp");
    await h.frames(3);
    const rec = h.engine.stopRecording();
    expect(rec.frames.length).toBeGreaterThan(10);
    expect(rec.ops.length).toBeGreaterThan(50);
  });

  it("traces a bullet's trail over at most TRAIL_TICKS of its own travel", () => {
    const fresh = trailPath(
      { id: 1, x: 100, y: 100, vx: 120, vy: 0, life: BULLET_LIFE },
      BULLET_LIFE,
    );
    expect(fresh).toHaveLength(1);
    const old = trailPath(
      { id: 1, x: 100, y: 100, vx: 120, vy: 0, life: 0.5 },
      BULLET_LIFE,
    );
    expect(old).toHaveLength(TRAIL_TICKS + 1);
    const tail = last(old) ?? [0, 0];
    expect(Math.hypot(tail[0], tail[1])).toBeLessThanOrEqual(
      120 * TRAIL_TICKS * TICK_DT * 1.1,
    );
  });
});
