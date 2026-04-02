/**
 * One-off maintainer script: replaces raw rgba(42|255|74,...) with var(--token).
 * Run from frontend/: node scripts/tokenize-theme-colors.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "..", "src", "styles.css");
let text = readFileSync(path, "utf8");

const ink = {
  "0.025": "--ink-a025",
  "0.04": "--ink-a04",
  "0.045": "--ink-a045",
  "0.05": "--ink-a05",
  "0.055": "--ink-a055",
  "0.06": "--ink-a06",
  "0.065": "--ink-a065",
  "0.068": "--ink-a068",
  "0.07": "--ink-a07",
  "0.08": "--ink-a08",
  "0.09": "--ink-a09",
  "0.1": "--ink-a10",
  "0.12": "--ink-a12",
  "0.14": "--ink-a14",
  "0.16": "--ink-a16",
  "0.18": "--ink-a18",
  "0.2": "--ink-a20",
  "0.22": "--ink-a22",
  "0.28": "--ink-a28",
  "0.32": "--ink-a32",
  "0.35": "--ink-a35",
  "0.38": "--ink-a38",
  "0.52": "--ink-a52",
  "0.58": "--ink-a58",
  "0.88": "--ink-a88",
};

const frost = {
  "0.32": "--frost-a32",
  "0.34": "--frost-a34",
  "0.35": "--frost-a35",
  "0.36": "--frost-a36",
  "0.38": "--frost-a38",
  "0.4": "--frost-a40",
  "0.42": "--frost-a42",
  "0.45": "--frost-a45",
  "0.52": "--frost-a52",
  "0.55": "--frost-a55",
  "0.65": "--frost-a65",
  "0.72": "--frost-a72",
  "0.75": "--frost-a75",
  "0.92": "--frost-a92",
};

const blue = {
  "0.055": "--blue-a055",
  "0.06": "--blue-a06",
  "0.065": "--blue-a065",
  "0.07": "--blue-a07",
  "0.08": "--blue-a08",
  "0.09": "--blue-a09",
  "0.1": "--blue-a10",
  "0.12": "--blue-a12",
  "0.13": "--blue-a13",
  "0.2": "--blue-a20",
  "0.22": "--blue-a22",
  "0.24": "--blue-a24",
  "0.28": "--blue-a28",
};

function replaceAll(map, rgbPrefix) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const a of keys) {
    const from = `${rgbPrefix}${a})`;
    const to = `var(${map[a]})`;
    if (!text.includes(from)) continue;
    const n = text.split(from).length - 1;
    text = text.split(from).join(to);
    console.log(rgbPrefix + a + ")", "->", map[a], "x" + n);
  }
}

replaceAll(ink, "rgba(42, 41, 38, ");
replaceAll(frost, "rgba(255, 255, 255, ");
replaceAll(blue, "rgba(74, 95, 110, ");

writeFileSync(path, text);
console.log("Wrote", path);
