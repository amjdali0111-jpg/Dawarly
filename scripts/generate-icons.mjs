// Renders the PWA icons from the brand mark (same artwork as <LogoMark/>).
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7af3e8"/><stop offset="1" stop-color="#14a99c"/></linearGradient></defs>
  <rect width="64" height="64" rx="${pad ? 0 : 14}" fill="#0a1c2a"/>
  <g transform="translate(${pad},${pad}) scale(${(64 - 2 * pad) / 64})">
    <path d="M32 4C19.3 4 9 14.1 9 26.6 9 43 32 60 32 60s23-17 23-33.4C55 14.1 44.7 4 32 4z" fill="url(#lg)"/>
    <circle cx="30" cy="25" r="11" fill="#0a1c2a"/>
    <circle cx="30" cy="25" r="7" fill="none" stroke="#7af3e8" stroke-width="3"/>
    <path d="M35 30l7 7" stroke="#7af3e8" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 6l1.6 3.4L55 11l-3.4 1.6L50 16l-1.6-3.4L45 11l3.4-1.6z" fill="#ffe08a"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["public/icons/icon-192.png", 192, 4],
  ["public/icons/icon-512.png", 512, 4],
  ["public/icons/icon-maskable-512.png", 512, 12],
  ["public/icons/apple-touch-icon.png", 180, 6],
  ["src/app/icon.png", 48, 2],
];
for (const [out, size, pad] of jobs) {
  await sharp(Buffer.from(mark(pad))).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
