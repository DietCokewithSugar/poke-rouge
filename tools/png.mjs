/**
 * 最小的 PNG 读写（素材导入工具用）：读取索引色 / 真彩色 PNG，写出 RGBA PNG。
 * 只依赖 node:zlib。
 */
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 返回 { width, height, palette: [[r,g,b,a]...] | null, index: Uint8Array | null, rgba: Uint8Array } */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a png');
  let o = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') { palette = []; for (let i = 0; i < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2], 255]); }
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  if (interlace) throw new Error('interlaced png not supported');
  if (palette && trns) for (let i = 0; i < trns.length && i < palette.length; i++) palette[i][3] = trns[i];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      cur[x] = f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
    prev = cur;
  }
  const rgba = new Uint8Array(width * height * 4);
  let index = null;
  if (type === 3) {
    index = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = x * depth;
        const byte = out[y * stride + (bit >> 3)];
        const v = depth === 8 ? byte : (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        index[y * width + x] = v;
        const c = palette[v] ?? [0, 0, 0, 0];
        rgba.set(c, (y * width + x) * 4);
      }
    }
  } else if (depth === 8) {
    for (let i = 0; i < width * height; i++) {
      const s = i * channels;
      if (type === 6) rgba.set([out[s], out[s + 1], out[s + 2], out[s + 3]], i * 4);
      else if (type === 2) rgba.set([out[s], out[s + 1], out[s + 2], 255], i * 4);
      else if (type === 4) rgba.set([out[s], out[s], out[s], out[s + 1]], i * 4);
      else rgba.set([out[s], out[s], out[s], 255], i * 4);
    }
  } else throw new Error(`unsupported png type ${type}/${depth}`);
  return { width, height, palette, index, rgba };
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(kind, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA → PNG */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** JASC-PAL 文本调色板 → [[r,g,b]...] */
export function readJasc(text) {
  const lines = text.trim().split(/\r?\n/);
  const n = Number(lines[2]);
  return lines.slice(3, 3 + n).map((l) => l.trim().split(/\s+/).map(Number));
}
