# Shatter

Shatter is a gravity-well rock shooter that runs entirely in the browser. You
fly a small ship under pure momentum around a star fixed at the centre of a
wrapping field. The star's gravity bends every bullet and every rock (but never
your ship), so shots curve around it and rocks swing through the field on
curved paths. The larger rocks are armored and take several hits to break, a
guided torpedo on a ten-second recharge destroys any rock outright, and an enemy
saucer drops in now and then to hunt you. Clear a wave and a denser, faster one
arrives.

Everything is drawn in code on a canvas. There are no art files, no backend, and
nothing to sign in to.

## Install

You need Node.js 20 or newer.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173/>).

## Production build

```sh
npm run build
```

This type-checks the project and writes a self-contained static site to `dist/`,
with `index.html` at its root. Serve that directory from any static file server,
at any base path. To try the build locally:

```sh
npm run preview
```

## Controls

| Key                | Action                                    |
| ------------------ | ----------------------------------------- |
| `←` `→` or `A` `D` | Turn                                      |
| `↑` or `W`         | Thrust                                    |
| `Space`            | Fire (hold to keep firing)                |
| `F`                | Launch the guided torpedo (when charged)  |
| `P` or `Esc`       | Pause and resume                          |
| `M`                | Mute or unmute                            |
| `↑` `↓` or `W` `S` | Move through a menu                       |
| `Enter` or `Space` | Choose a menu entry                       |
| `Esc`              | Go back from a menu screen                |
| `` ` `` (backtick) | Show or hide the debug overlay            |

The menus also work with a mouse or a touch screen. On a touch device the engine
shows an on-screen pad and buttons.

## Development

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm test`          | Runs the unit tests with coverage (Vitest) |
| `npm run typecheck` | Type-checks with `tsc`                     |
| `npm run lint`      | Lints with ESLint                          |
| `npm run format`    | Checks formatting with Prettier            |

The game is built on the Simple 2D engine, which documents itself in `engine/`.
The rules live in `specs/`. The source is in `src/`:

- `game.ts` declares the state and the debug surface types and wires the game
  to the engine.
- `world.ts` is the render-free simulation: the fixed 120 Hz tick, gravity,
  collisions, waves, and the saucer.
- `frame.ts` handles the screen flow and turns each frame's time into whole
  ticks.
- `menu.ts` lays out the menus and reads keys, mouse and touch for them.
- `debug.ts` is the debug and automation surface the engine returns as
  `engine.debug`.
- `render.ts` draws everything.

### The showcase

`showcase/` holds the store-page description and its media. The replays are
recorded from real play by a keyboard autopilot. The screenshots are taken from
the production build in Chromium:

```sh
npx vitest run --config scripts/capture.config.ts   # replays
npm run build && npm run preview &                  # then, in another shell:
node scripts/screenshots.mjs                        # screenshots
```
