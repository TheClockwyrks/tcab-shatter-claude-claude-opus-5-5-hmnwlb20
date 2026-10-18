// Shatter — the vertical menus: their entries, their hit regions, and how the
// keys, a mouse, and a touch contact move and confirm the highlight.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import { GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import type { Screen } from "./game";
import type { MenuPress } from "./types";

/** A rectangle in logical units, `x, y` its top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The entries the screen's menu shows, or `null` for a screen with none. */
export function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "gameover":
      return GAMEOVER_ITEMS;
    default:
      return null;
  }
}

const ENTRY_W = 380;
const ENTRY_H = 54;
const ENTRY_GAP = 14;

/** Where each screen's first entry sits, as its top edge. */
const MENU_TOP: Readonly<Record<string, number>> = {
  title: 440,
  paused: 320,
  gameover: 470,
};

/** The hit region of entry `index` on `screen`'s menu, or `null` when none. */
export function menuRect(screen: Screen, index: number): Rect | null {
  const items = menuItems(screen);
  if (!items || !Number.isInteger(index) || index < 0 || index >= items.length)
    return null;
  const top = MENU_TOP[screen] ?? 0;
  return {
    x: 640 - ENTRY_W / 2,
    y: top + index * (ENTRY_H + ENTRY_GAP),
    w: ENTRY_W,
    h: ENTRY_H,
  };
}

/** The entry whose region holds `(x, y)`, or `-1`. */
export function hitEntry(screen: Screen, x: number, y: number): number {
  const items = menuItems(screen);
  if (!items) return -1;
  for (let i = 0; i < items.length; i++) {
    const r = menuRect(screen, i);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/** What one frame's input did to a menu. */
export interface MenuOutcome {
  readonly index: number;
  readonly confirmed: boolean;
  readonly press: MenuPress | null;
}

/**
 * Reads one frame of menu input: the key edges first, then the pointer and the
 * touch contacts in arrival order. A key confirm takes the key's entry alone.
 */
export function readMenu(
  screen: Screen,
  index: number,
  press: MenuPress | null,
  api: UpdateApi,
): MenuOutcome {
  const items = menuItems(screen);
  const count = items ? items.length : 0;
  let idx = index;
  if (count > 0) {
    if (api.input.pressed("up")) idx = (idx - 1 + count) % count;
    if (api.input.pressed("down")) idx = (idx + 1) % count;
    if (idx < 0 || idx >= count) idx = 0;
  }
  if (api.input.pressed("confirm"))
    return { index: idx, confirmed: true, press: null };
  if (count === 0) return { index: idx, confirmed: false, press: null };

  let held = press;
  for (const sample of api.input.pointerSamples()) {
    const hit = hitEntry(screen, sample.x, sample.y);
    if (sample.type === "move") {
      if (hit >= 0) idx = hit;
    } else if (sample.type === "down") {
      if (hit >= 0) idx = hit;
      held = { id: sample.id, index: hit };
    } else {
      const landed = held && held.id === sample.id ? held.index : -1;
      if (held && held.id === sample.id) held = null;
      if (hit >= 0 && hit === landed)
        return { index: hit, confirmed: true, press: null };
    }
  }
  return { index: idx, confirmed: false, press: held };
}
