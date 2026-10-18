// Shatter — the values the engine's debug overlay shows. Each is a pure read
// of the state handed to it.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { ShatterState } from "./game";

const deg = (rad: number): number => (rad * 180) / Math.PI;

export function registerDiagnostics(api: InitApi<ShatterState>): void {
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("score", (s) => s.score);
  d.register("lives", (s) => s.lives);
  d.register("wave", (s) => s.wave);
  d.register(
    "ship pos",
    (s) => `${s.ship.x.toFixed(1)}, ${s.ship.y.toFixed(1)}`,
  );
  d.register(
    "ship vel",
    (s) => `${s.ship.vx.toFixed(1)}, ${s.ship.vy.toFixed(1)}`,
  );
  d.register("ship speed", (s) => Math.hypot(s.ship.vx, s.ship.vy).toFixed(1));
  d.register("ship facing", (s) => `${deg(s.ship.angle).toFixed(1)} deg`);
  d.register("ship grace", (s) => `${s.ship.invuln.toFixed(2)} s`);
  d.register("bullets", (s) => s.bullets.length);
  d.register("rocks", (s) => s.rocks.length);
  d.register("saucer", (s) =>
    s.saucer ? `${s.saucer.x.toFixed(1)}, ${s.saucer.y.toFixed(1)}` : "none",
  );
  d.register("torpedo charge", (s) => `${Math.round(s.torpedoCharge * 100)}%`);
  d.register("torpedoes", (s) => s.torpedoes.length);
  d.register("sim time", (s) => `${s.simTime.toFixed(2)} s`);
}
