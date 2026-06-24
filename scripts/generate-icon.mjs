// Generates media/icon.png — a 128x128 placeholder guardian icon.
// Pure Node (zlib) PNG encoder; no dependencies. Replace with real art later.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const S = 128;
const px = Buffer.alloc(S * S * 4);

const setPx = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
};

const disc = (cx, cy, rad, r, g, b) => {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) setPx(x, y, r, g, b);
    }
};

// Rounded-square background with a vertical green gradient.
const corner = 22;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cx = x < corner ? corner : x > S - 1 - corner ? S - 1 - corner : x;
    const cy = y < corner ? corner : y > S - 1 - corner ? S - 1 - corner : y;
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > corner * corner) {
      setPx(x, y, 0, 0, 0, 0);
      continue;
    }
    const t = y / S;
    setPx(
      x,
      y,
      Math.round(31 + (18 - 31) * t),
      Math.round(86 + (52 - 86) * t),
      Math.round(60 + (38 - 60) * t),
    );
  }
}

// Leaf antenna.
for (let y = 28; y < 48; y++) {
  setPx(64, y, 47, 93, 58);
  setPx(65, y, 47, 93, 58);
}
disc(71, 30, 8, 91, 208, 138);

// Guardian body + belly + eyes.
disc(64, 72, 34, 126, 226, 168);
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const dx = (x - 64) / 22;
    const dy = (y - 80) / 18;
    if (dx * dx + dy * dy <= 1) setPx(x, y, 182, 240, 208);
  }
disc(52, 64, 7, 255, 255, 255);
disc(77, 64, 7, 255, 255, 255);
disc(53, 65, 3, 35, 48, 58);
disc(78, 65, 3, 35, 48, 58);

// PNG encode.
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('media', { recursive: true });
writeFileSync('media/icon.png', png);
console.log('Wrote media/icon.png');
