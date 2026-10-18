import { describe, expect, it } from "vitest";
import { TICK_DT } from "./constants";
import { boot, type Harness } from "./test/harness";
import { accumulate } from "./frame";

function centre(h: Harness, i: number): [number, number] {
  const r = h.debug.menuItemRect(h.engine.state, i);
  if (!r) throw new Error(`no entry ${i}`);
  return [r.x + r.w / 2, r.y + r.h / 2];
}

describe("the title menu", () => {
  it("opens on the title with PLAY highlighted, and wraps the highlight", async () => {
    const h = await boot();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(0);
    await h.tap("ArrowUp");
    expect(h.snap().menuIndex).toBe(1);
    await h.tap("KeyS");
    expect(h.snap().menuIndex).toBe(0);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });

  it("opens how-to and returns with HOW TO PLAY highlighted", async () => {
    const h = await boot();
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().menuIndex).toBe(1);
    expect(h.debug.menuItemRect(h.engine.state, 0)).toBeNull();
    await h.tap("Space");
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(1);
    await h.tap("Enter");
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });
});

describe("pausing", () => {
  it("freezes the field and resumes on a single Escape", async () => {
    const h = await boot();
    await h.tap("Enter");
    await h.seconds(2);
    await h.tap("Escape");
    const frozen = h.snap();
    expect(frozen.screen).toBe("paused");
    await h.seconds(1);
    const later = h.snap();
    expect(later.rocks).toEqual(frozen.rocks);
    expect(later.saucerClock).toBe(frozen.saucerClock);
    expect(later.simTime).toBeGreaterThan(frozen.simTime + 0.9);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("playing");
    await h.tap("KeyP");
    expect(h.snap().screen).toBe("paused");
    await h.tap("KeyP");
    expect(h.snap().screen).toBe("playing");
  });

  it("restarts and quits from the pause menu", async () => {
    const h = await boot();
    await h.tap("Enter");
    h.pose((s) => h.debug.setScore(s, 500));
    await h.tap("KeyP");
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().score).toBe(0);
    await h.tap("KeyP");
    await h.tap("ArrowUp");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(0);
  });

  it("does not fire on the Space that confirmed RESUME", async () => {
    const h = await boot();
    await h.tap("Enter");
    await h.tap("KeyP");
    h.keyDown("Space");
    await h.frames(30);
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().bullets).toHaveLength(0);
    h.keyUp("Space");
    await h.frames(1);
    h.keyDown("Space");
    await h.frames(1);
    expect(h.snap().bullets).toHaveLength(1);
  });
});

describe("game over", () => {
  it("plays again or returns to the menu", async () => {
    const h = await boot();
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("Enter");
    expect(h.snap().screen).toBe("playing");
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("title");
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });
});

describe("pointer and touch", () => {
  it("highlights on hover and confirms a press and release in one entry", async () => {
    const h = await boot();
    const [x1, y1] = centre(h, 1);
    h.pointer("pointermove", x1, y1);
    await h.frames(1);
    expect(h.snap().menuIndex).toBe(1);
    h.pointer("pointerdown", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.frames(1);
    expect(h.snap().screen).toBe("howto");
  });

  it("confirms nothing when the press and release fall in different entries", async () => {
    const h = await boot();
    const [x0, y0] = centre(h, 0);
    const [x1, y1] = centre(h, 1);
    h.pointer("pointerdown", x0, y0);
    await h.frames(1);
    h.pointer("pointermove", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.frames(1);
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(1);
    h.pointer("pointerdown", 5, 5);
    h.pointer("pointerup", x1, y1);
    await h.frames(1);
    expect(h.snap().screen).toBe("title");
  });

  it("drives the pause menu by touch", async () => {
    const h = await boot();
    await h.tap("Enter");
    await h.tap("KeyP");
    const [x, y] = centre(h, 2);
    h.pointer("pointerdown", x, y, "touch", 7);
    await h.frames(1);
    expect(h.snap().menuIndex).toBe(2);
    h.pointer("pointerup", x, y, "touch", 7);
    await h.frames(1);
    expect(h.snap().screen).toBe("title");
  });

  it("lets the pointer's highlight win over a key move on one frame, and a key confirm win outright", async () => {
    const h = await boot();
    const [x1, y1] = centre(h, 1);
    h.keyDown("ArrowDown");
    h.pointer("pointermove", centre(h, 0)[0], centre(h, 0)[1]);
    await h.frames(1);
    h.keyUp("ArrowDown");
    expect(h.snap().menuIndex).toBe(0);
    h.keyDown("Enter");
    h.pointer("pointerdown", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.frames(1);
    expect(h.snap().screen).toBe("playing");
  });
});

describe("the fixed timestep", () => {
  it("carries the remainder of a frame into the next", () => {
    const { ticks, rest } = accumulate(0, TICK_DT * 2.5);
    expect(ticks).toBe(2);
    expect(rest).toBeCloseTo(TICK_DT * 0.5);
    expect(accumulate(0, Number.NaN).ticks).toBe(0);
  });

  it("advances the same whatever the frame rate", async () => {
    const a = await boot(1000 / 30);
    const b = await boot(1000 / 144);
    for (const h of [a, b]) {
      h.pose((s) => h.debug.setScreen(s, "playing"));
      h.pose((s) => h.debug.setWaveSpawning(s, false));
      h.pose((s) => h.debug.addBullet(s, 100, 100, 300, 0));
    }
    await a.frames(30);
    await b.frames(144);
    expect(a.snap().bullets[0]?.x ?? 0).toBeCloseTo(
      b.snap().bullets[0]?.x ?? 1,
      0,
    );
  });
});

describe("audio", () => {
  it("toggles the engine's mute bit from any screen and mirrors it", async () => {
    const h = await boot();
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(true);
    await h.tap("Enter");
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(false);
  });

  it("holds the thrust cue while burning and stops it on release", async () => {
    const h = await boot();
    const log: string[] = [];
    h.engine.events.on("cue:looped", (e) => log.push(`loop:${e.cue}`));
    h.engine.events.on("cue:stopped", (e) => log.push(`stop:${e.cue}`));
    h.engine.events.on("cue:played", (e) => log.push(`play:${e.cue}`));
    await h.tap("Enter");
    h.keyDown("ArrowUp");
    await h.frames(10);
    h.keyUp("ArrowUp");
    await h.frames(2);
    expect(log).toEqual(["loop:thrust", "stop:thrust"]);
    await h.tap("Space");
    expect(log).toContain("play:fire");
  });
});
