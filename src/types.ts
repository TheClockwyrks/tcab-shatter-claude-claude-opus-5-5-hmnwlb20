// Shatter — the build's own additions beside the declared state.
//
// These fields are cosmetic or input bookkeeping. They never decide an outcome
// on the field, and `reset` returns each to the neutral value below.

/** A short-lived spark or ember, drawn for an explosion and nothing else. */
export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
  readonly max: number;
  readonly hue: number;
  readonly size: number;
}

/** A pointer or touch contact that went down inside a menu entry. */
export interface MenuPress {
  readonly id: number;
  readonly index: number;
}
