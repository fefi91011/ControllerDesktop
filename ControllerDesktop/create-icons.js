// create-icons.js – erzeugt App- und Tray-Icon ohne externe Abhängigkeiten
// Aufruf: node create-icons.js
//
// Zeichnet das Markenzeichen (D-Pad-Plus auf Graphit-Kachel) und schreibt PNGs.
// build/icon.png ist die Vorlage für electron-builder (Installer + EXE-Icon).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BUILD_SIZE = 512;
const APP_SIZE = 256;
const TRAY_SIZE = 32;

// ─── Zeichnen ─────────────────────────────────────────────────
function inRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || x > left + width || y < top || y > top + height) return false;
  const innerLeft = left + radius;
  const innerRight = left + width - radius;
  const innerTop = top + radius;
  const innerBottom = top + height - radius;
  const cx = Math.min(Math.max(x, innerLeft), innerRight);
  const cy = Math.min(Math.max(y, innerTop), innerBottom);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

// Gibt [r, g, b, a] im Bereich 0–255 für die normierte Koordinate (u, v) zurück.
function samplePixel(u, v) {
  // D-Pad-Plus liegt auf der Kachel und wird zuerst geprüft
  const arm = 0.26;
  const armRadius = 0.035;
  const horizontal = inRoundedRect(u, v, 0.5 - 0.33, 0.5 - arm / 2, 0.66, arm, armRadius);
  const vertical = inRoundedRect(u, v, 0.5 - arm / 2, 0.5 - 0.33, arm, 0.66, armRadius);

  if (horizontal || vertical) return [0xe9, 0xec, 0xe5, 255];

  const plate = inRoundedRect(u, v, 0.02, 0.02, 0.96, 0.96, 0.22);

  if (plate) {
    // Graphit-Verlauf von oben (heller) nach unten (dunkler)
    const top = [0x2c, 0x33, 0x2d];
    const bottom = [0x12, 0x16, 0x13];
    const mix = Math.min(1, Math.max(0, v));
    return [
      Math.round(top[0] + (bottom[0] - top[0]) * mix),
      Math.round(top[1] + (bottom[1] - top[1]) * mix),
      Math.round(top[2] + (bottom[2] - top[2]) * mix),
      255
    ];
  }

  return [0, 0, 0, 0];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 Supersampling für weiche Kanten

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          const [pr, pg, pb, pa] = samplePixel(u, v);
          const alpha = pa / 255;
          r += pr * alpha;
          g += pg * alpha;
          b += pb * alpha;
          a += pa;
        }
      }

      const total = samples * samples;
      const alphaAvg = a / total;
      const weight = alphaAvg / 255 || 1;

      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(r / total / weight);
      rgba[offset + 1] = Math.round(g / total / weight);
      rgba[offset + 2] = Math.round(b / total / weight);
      rgba[offset + 3] = Math.round(alphaAvg);
    }
  }

  return rgba;
}

// ─── PNG schreiben ────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function writeIcon(target, size) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encodePng(size, render(size)));
  console.log(`  ${path.relative(process.cwd(), target)} (${size}px)`);
}

console.log('Erstelle Icons:');
writeIcon(path.join(__dirname, 'build', 'icon.png'), BUILD_SIZE);
writeIcon(path.join(__dirname, 'src', 'icons', 'icon.png'), APP_SIZE);
writeIcon(path.join(__dirname, 'src', 'icons', 'tray.png'), TRAY_SIZE);
