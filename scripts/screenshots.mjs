// Shatter — captures the showcase screenshots from the built game in Chromium.
//
// Serve the production build first (`npm run build && npm run preview`), then:
//
//   node scripts/screenshots.mjs [url]
//
// The game is played from the keyboard alone, as a person would.

import process from "node:process";
import { URL } from "node:url";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const out = new URL("../showcase/", import.meta.url);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: new URL("title.png", out).pathname });

await page.keyboard.press("Enter");
await page.waitForTimeout(1800);
await page.keyboard.down("Space");
for (let i = 0; i < 14; i++) {
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(140);
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(160);
  if (i === 6) await page.keyboard.press("KeyF");
  if (i === 9) {
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(250);
    await page.screenshot({ path: new URL("field.png", out).pathname });
    await page.keyboard.up("ArrowUp");
  }
}
await page.keyboard.up("Space");
await browser.close();
