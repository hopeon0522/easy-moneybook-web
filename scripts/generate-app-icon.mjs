import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const size = 1024;
const pixels = Buffer.alloc(size * size * 4);

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
}

function blend(x, y, color, opacity = 1) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (Math.floor(y) * size + Math.floor(x)) * 4;
  const a = (color[3] / 255) * opacity;
  const inv = 1 - a;
  pixels[index] = Math.round(color[0] * a + pixels[index] * inv);
  pixels[index + 1] = Math.round(color[1] * a + pixels[index + 1] * inv);
  pixels[index + 2] = Math.round(color[2] * a + pixels[index + 2] * inv);
  pixels[index + 3] = Math.round(255 * a + pixels[index + 3] * inv);
}

function roundedRectMask(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const d = Math.hypot(px - cx, py - cy);
  return Math.max(0, Math.min(1, r + 0.75 - d));
}

function fillRoundRect(x, y, w, h, r, color) {
  for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py += 1) {
    for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px += 1) {
      const alpha = roundedRectMask(px + 0.5, py + 0.5, x, y, w, h, r);
      if (alpha > 0) blend(px, py, color, alpha);
    }
  }
}

function strokeRoundRect(x, y, w, h, r, strokeWidth, color) {
  fillRoundRect(x, y, w, h, r, color);
  fillRoundRect(x + strokeWidth, y + strokeWidth, w - strokeWidth * 2, h - strokeWidth * 2, Math.max(0, r - strokeWidth), rgba('#fffdfd'));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function strokeLine(ax, ay, bx, by, width, color) {
  const half = width / 2;
  const minX = Math.floor(Math.min(ax, bx) - half - 2);
  const maxX = Math.ceil(Math.max(ax, bx) + half + 2);
  const minY = Math.floor(Math.min(ay, by) - half - 2);
  const maxY = Math.ceil(Math.max(ay, by) + half + 2);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distance = distanceToSegment(px + 0.5, py + 0.5, ax, ay, bx, by);
      const alpha = Math.max(0, Math.min(1, half + 0.75 - distance));
      if (alpha > 0) blend(px, py, color, alpha);
    }
  }
}

function strokePolyline(points, width, color) {
  for (let index = 0; index < points.length - 1; index += 1) {
    strokeLine(points[index][0], points[index][1], points[index + 1][0], points[index + 1][1], width, color);
  }
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function writePng(path) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (size * 4 + 1)] = 0;
    pixels.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND')]));
}

const red = rgba('#ff5a52');
fillRoundRect(0, 0, 1024, 1024, 228, rgba('#fffdfd'));
fillRoundRect(258, 276, 472, 486, 76, rgba('#3f3f46', 28));
strokeRoundRect(250, 258, 492, 500, 80, 44, red);
strokePolyline(
  [
    [256, 352],
    [224, 383],
    [256, 416],
    [224, 449],
    [256, 482],
    [224, 515],
    [256, 548],
    [224, 581],
    [256, 614]
  ],
  34,
  red
);
fillRoundRect(408, 386, 224, 116, 16, red);
strokeLine(392, 590, 666, 590, 34, red);
strokeLine(392, 670, 606, 670, 34, red);

writePng('assets/app-icon/easy-moneybook-icon.png');
