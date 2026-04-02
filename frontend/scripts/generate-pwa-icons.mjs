/**
 * Rasterize public/logo-mark.svg into PNGs for manifest / Apple touch icon.
 * Run: npm run generate:icons (from frontend/)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "logo-mark.svg");
const bg = { r: 245, g: 243, b: 237, alpha: 1 };

const svg = readFileSync(svgPath);

const sizes = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

for (const { file, size } of sizes) {
  const out = join(root, "public", file);
  await sharp(svg)
    .resize(size, size, {
      fit: "contain",
      background: bg,
      position: "center",
    })
    .png()
    .toFile(out);
  console.log("Wrote", file);
}
