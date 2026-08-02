import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));

for (const id of ["gameCanvas", "score", "best", "startButton", "retryButton", "meterFill"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing required element #${id}`);
}

assert.match(html, /viewport-fit=cover/, "Safe-area viewport support is required");
assert.match(css, /100dvh/, "Dynamic viewport height support is required");
assert.match(css, /touch-action:\s*none/, "Touch gestures must not scroll the page while playing");
assert.match(js, /requestAnimationFrame\(loop\)/, "Game loop is required");
assert.match(js, /localStorage\.setItem/, "Best score persistence is required");
assert.match(js, /pointerdown/, "Pointer controls are required");
assert.equal(manifest.display, "standalone", "The web app must be installable in standalone mode");

console.log("Smoke checks passed");
