/**
 * 產生 PWA 圖示（不依賴任何影像套件，只用 Node 內建 zlib 手寫 PNG）。
 *
 * 執行：node scripts/generate-icons.mjs
 * 想換設計就改 draw()，重跑即可。
 *
 * 設計：深色圓角底 + 三根遞增的長條，最高那根用綠色（代表存下來的錢）。
 * 小尺寸下仍然辨識得出來，這是圖示唯一真正的要求。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ───────────────────────────── PNG 編碼

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixels: Uint8Array，長度 size*size*4，RGBA */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 每條掃描線前面要加一個 filter byte（0 = None）
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[rowStart + 1 + i] = v;
    });
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ───────────────────────────── 繪圖

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = hex("#0f172a"); // slate-900
const BARS = [hex("#475569"), hex("#94a3b8"), hex("#10b981")]; // slate-600 / slate-400 / emerald-500

function inRoundedRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * @param size    輸出邊長
 * @param maskable Android 自適應圖示會把圖裁成圓形／方圓形，
 *                 所以底色要滿版、內容要縮在中央安全區內
 */
function draw(size, maskable) {
  const S = size;
  const px = new Uint8Array(S * S * 4);

  // 底色：一般圖示做圓角，maskable 版滿版（系統自己會裁形狀）
  const bgRadius = maskable ? 0 : S * 0.22;

  // 內容區：maskable 要留安全區，內容縮小並置中
  const scale = maskable ? 0.56 : 0.56;
  const contentW = S * scale;
  const contentH = S * scale * 0.72;
  const contentX = (S - contentW) / 2;
  const baseline = (S - contentH) / 2 + contentH;

  const gap = contentW * 0.11;
  const barW = (contentW - gap * 2) / 3;
  const barR = barW * 0.3;
  const heights = [contentH * 0.5, contentH * 0.74, contentH];

  const SAMPLES = 3; // 每軸取樣數，做簡單的反鋸齒

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let bgHits = 0;
      const barHits = [0, 0, 0];

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px_ = x + (sx + 0.5) / SAMPLES;
          const py_ = y + (sy + 0.5) / SAMPLES;

          if (
            bgRadius === 0
              ? true
              : inRoundedRect(px_, py_, 0, 0, S, S, bgRadius)
          ) {
            bgHits++;
          }

          for (let b = 0; b < 3; b++) {
            const bx = contentX + b * (barW + gap);
            const bh = heights[b];
            if (inRoundedRect(px_, py_, bx, baseline - bh, barW, bh, barR)) {
              barHits[b]++;
            }
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      const bgA = bgHits / total;
      if (bgA === 0) continue;

      let [r, g, b] = BG;
      for (let i = 0; i < 3; i++) {
        const a = barHits[i] / total;
        if (a > 0) {
          r = Math.round(r * (1 - a) + BARS[i][0] * a);
          g = Math.round(g * (1 - a) + BARS[i][1] * a);
          b = Math.round(b * (1 - a) + BARS[i][2] * a);
        }
      }

      const o = (y * S + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = Math.round(bgA * 255);
    }
  }

  return encodePng(S, px);
}

// ───────────────────────────── 輸出

const targets = [
  ["public/icon-192.png", 192, false],
  ["public/icon-512.png", 512, false],
  ["public/icon-maskable-512.png", 512, true],
  ["app/icon.png", 192, false], // Next.js 慣例：瀏覽器分頁圖示
];

for (const [path, size, maskable] of targets) {
  mkdirSync(dirname(path), { recursive: true });
  const buf = draw(size, maskable);
  writeFileSync(path, buf);
  console.log(`${path.padEnd(30)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
