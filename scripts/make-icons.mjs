#!/usr/bin/env node
/**
 * Generates build/icon.png (1024x1024) and build/icon.ico from one procedural drawing.
 *
 * Pure Node -- node:zlib and node:fs only. An icon pipeline that needs sharp/ImageMagick is one
 * more thing to install in CI, and the artwork here is a handful of rounded rectangles and a
 * bezier, so we rasterize it ourselves and write the PNG/ICO containers by hand.
 *
 * The drawing is InkVisual's own subject: two knot cards joined by a divert wire. Every colour is
 * lifted from the app's dark theme (src/styles.css) or the file palette (src/ui/colors.ts) so the
 * icon and the window agree. It has to survive 16x16, so it is few shapes, large, high contrast --
 * no text, no hairlines.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');

/* ---------------------------------------------------------------- palette */
/* Dark-theme tokens from src/styles.css, plus two hues from PALETTE in src/ui/colors.ts. */
const GROUND_TOP = [0x23, 0x24, 0x28]; // --panel
const GROUND_BOT = [0x1a, 0x1b, 0x1e]; // --bg
const RULE = [0x34, 0x36, 0x3c]; // --rule: card border, and the rim that keeps the icon's
const CARD = [0x2c, 0x2d, 0x32]; //         silhouette visible on a dark taskbar
const ROW = [0x4a, 0x4d, 0x55]; // --pv-prose: the dim bars inside a card body
const WIRE = [0x7f, 0xb4, 0xff]; // --pv-divert
const HEAD_A = [0x3f, 0x7f, 0xd6]; // PALETTE[0] -- a file colour
const HEAD_B = [0x2f, 0x9e, 0x63]; // PALETTE[2] -- a second file's colour

/* ---------------------------------------------------------------- geometry */
const S = 1024; // master size
const SS = 3; // supersample factor; shapes are analytically antialiased on top of this

/** x, y, w, h, corner radius. Two cards on a diagonal, with equal margins all round. */
const cardA = { x: 104, y: 150, w: 366, h: 286, r: 46 };
const cardB = { x: 554, y: 588, w: 366, h: 286, r: 46 };
const BORDER = 7; // card outline thickness (the app's 1px --rule border, scaled up)
const HEADER = 88; // coloured strip height, ~31% of the card -- the app's ratio at 1024
const WIRE_W = 34;

/* The divert. Both ends sit *inside* a card so the stroke is capped by the card, never floating.
   Control points are horizontal, the way React Flow draws a bezier edge; the 250px reach is what
   makes the S read as a curve rather than a line running down card A's edge. */
const WIRE_PATH = [
  [cardA.x + cardA.w - 32, cardA.y + cardA.h / 2],
  [cardA.x + cardA.w + 250, cardA.y + cardA.h / 2],
  [cardB.x - 250, cardB.y + cardB.h / 2],
  [cardB.x + 32, cardB.y + cardB.h / 2],
];

/* ---------------------------------------------------------------- raster helpers */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed distance to a rounded rect; negative inside. Coverage falls out of it for free. */
function sdRoundRect(px, py, { x, y, w, h, r }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

/** Distance -> pixel coverage. One pixel of feather centred on the edge. */
const cov = (d) => clamp01(0.5 - d);

function inset(rect, by) {
  return { x: rect.x + by, y: rect.y + by, w: rect.w - 2 * by, h: rect.h - 2 * by, r: Math.max(0, rect.r - by) };
}

/**
 * The wire's coverage, rasterized once at 1:1 by stamping discs along the curve and keeping the
 * maximum coverage. Sampling this per subpixel would cost 9x for no gain: the mask is already
 * area-correct at output resolution.
 */
function wireMask() {
  const m = new Float32Array(S * S);
  const [p0, p1, p2, p3] = WIRE_PATH;
  const R = WIRE_W / 2;
  const steps = 3000;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    const px = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0];
    const py = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1];
    const x0 = Math.max(0, Math.floor(px - R - 1));
    const x1 = Math.min(S - 1, Math.ceil(px + R + 1));
    const y0 = Math.max(0, Math.floor(py - R - 1));
    const y1 = Math.min(S - 1, Math.ceil(py + R + 1));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px;
        const c = cov(Math.hypot(dx, dy) - R);
        const k = y * S + x;
        if (c > m[k]) m[k] = c;
      }
    }
  }
  return m;
}

/** Draw the whole icon at S x S, RGBA, supersampled SS x SS. */
function render() {
  const wire = wireMask();
  const out = new Uint8ClampedArray(S * S * 4);
  const cardAIn = inset(cardA, BORDER);
  const cardBIn = inset(cardB, BORDER);
  const ground = { x: 0, y: 0, w: S, h: S, r: 184 };
  const n = SS * SS;

  for (let oy = 0; oy < S; oy++) {
    for (let ox = 0; ox < S; ox++) {
      // Accumulate premultiplied so partially covered edges do not drag black in.
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = oy + (sy + 0.5) / SS;
        for (let sx = 0; sx < SS; sx++) {
          const x = ox + (sx + 0.5) / SS;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          // src-over onto a transparent start
          const put = (col, alpha) => {
            if (alpha <= 0) return;
            r = col[0] * alpha + r * (1 - alpha);
            g = col[1] * alpha + g * (1 - alpha);
            b = col[2] * alpha + b * (1 - alpha);
            a = alpha + a * (1 - alpha);
          };

          const gd = sdRoundRect(x, y, ground);
          const gc = cov(gd);
          if (gc > 0) {
            const t = y / S;
            put(
              [
                GROUND_TOP[0] + (GROUND_BOT[0] - GROUND_TOP[0]) * t,
                GROUND_TOP[1] + (GROUND_BOT[1] - GROUND_TOP[1]) * t,
                GROUND_TOP[2] + (GROUND_BOT[2] - GROUND_TOP[2]) * t,
              ],
              gc,
            );
            // Rim: the outer 10px of the ground, so the silhouette reads on a dark background.
            put(RULE, gc * cov(gd + 10) * 0.85);
          }

          put(WIRE, wire[oy * S + ox]);

          for (const [card, cardIn, head] of [
            [cardA, cardAIn, HEAD_A],
            [cardB, cardBIn, HEAD_B],
          ]) {
            put(RULE, cov(sdRoundRect(x, y, card)));
            const ci = cov(sdRoundRect(x, y, cardIn));
            put(CARD, ci);
            put(head, ci * clamp01(cardIn.y + HEADER + 0.5 - y));
            // Two body bars: enough structure to read as a knot card at 256px, too chunky to
            // turn to mush at 16px.
            const bx = cardIn.x + 34;
            const by = cardIn.y + HEADER + 48;
            put(ROW, cov(sdRoundRect(x, y, { x: bx, y: by, w: cardIn.w * 0.62, h: 32, r: 16 })));
            put(ROW, cov(sdRoundRect(x, y, { x: bx, y: by + 56, w: cardIn.w * 0.4, h: 32, r: 16 })));
          }

          ar += r * a;
          ag += g * a;
          ab += b * a;
          aa += a;
        }
      }
      const i = (oy * S + ox) * 4;
      const alpha = aa / n;
      if (alpha > 0) {
        out[i] = Math.round(ar / aa);
        out[i + 1] = Math.round(ag / aa);
        out[i + 2] = Math.round(ab / aa);
      }
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- resampling */
/** Box filter with fractional edge weights, so non-integer ratios (1024 -> 48) stay clean. */
function resize(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * yr;
    const y1 = y0 + yr;
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * xr;
      const x1 = x0 + xr;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const i = (sy * sw + sx) * 4;
          const av = (src[i + 3] / 255) * w;
          r += src[i] * av;
          g += src[i + 1] * av;
          b += src[i + 2] * av;
          a += av;
          wsum += w;
        }
      }
      const i = (dy * dw + dx) * 4;
      if (a > 0) {
        dst[i] = Math.round(r / a);
        dst[i + 1] = Math.round(g / a);
        dst[i + 2] = Math.round(b / a);
      }
      dst[i + 3] = Math.round((a / wsum) * 255);
    }
  }
  return dst;
}

/* ---------------------------------------------------------------- PNG */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  // 10..12: deflate / adaptive filtering / no interlace, all zero

  // Filter type 0 on every scanline: the image is smooth gradients, deflate copes fine.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 4);
    raw[off] = 0;
    for (let i = 0; i < w * 4; i++) raw[off + 1 + i] = rgba[y * w * 4 + i];
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- ICO */
/** 6-byte header, one 16-byte directory entry per image, then the PNG payloads. */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  for (const [i, img] of images.entries()) {
    const e = i * 16;
    dir[e] = img.size >= 256 ? 0 : img.size; // 256 is encoded as 0
    dir[e + 1] = img.size >= 256 ? 0 : img.size;
    dir[e + 2] = 0; // palette size
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  }
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

/* ---------------------------------------------------------------- main */
const master = render();
mkdirSync(OUT, { recursive: true });

const png = encodePng(master, S, S);
writeFileSync(join(OUT, 'icon.png'), png);

const ICO_SIZES = [256, 128, 64, 48, 32, 16];
const ico = encodeIco(
  ICO_SIZES.map((size) => ({ size, png: encodePng(resize(master, S, S, size, size), size, size) })),
);
writeFileSync(join(OUT, 'icon.ico'), ico);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build/icon.png  ${S}x${S}                      ${kb(png.length)}`);
console.log(`build/icon.ico  ${ICO_SIZES.join(', ')}  ${kb(ico.length)}`);
