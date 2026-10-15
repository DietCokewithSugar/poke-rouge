/**
 * 读取 pret/pokefirered（火红/叶绿反汇编工程）的图块与地图数据：
 *   瓦片 tiles.png（4bpp 索引色）+ 调色板 palettes/*.pal + 图块 metatiles.bin + 图块属性 metatile_attributes.bin
 *   地图 map.bin（每格 2 字节：图块编号、碰撞、高度）
 * 渲染成 RGBA：下层（画在人物下面）与上层（画在人物上面，例如屋檐、树冠）分开。
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, readJasc } from './png.mjs';

export const NUM_TILES_IN_PRIMARY = 640;
export const NUM_METATILES_IN_PRIMARY = 640;
export const NUM_PALS_IN_PRIMARY = 7;

function loadSet(dir) {
  const png = decodePng(fs.readFileSync(path.join(dir, 'tiles.png')));
  const pals = [];
  for (let i = 0; i < 16; i++) {
    const f = path.join(dir, 'palettes', `${String(i).padStart(2, '0')}.pal`);
    pals.push(fs.existsSync(f) ? readJasc(fs.readFileSync(f, 'utf8')) : []);
  }
  const mt = fs.readFileSync(path.join(dir, 'metatiles.bin'));
  const attr = fs.readFileSync(path.join(dir, 'metatile_attributes.bin'));
  return { png, pals, mt, attr };
}

/** 一对图块组（主 + 副） */
export function loadTilesets(root, primary, secondary) {
  return { p: loadSet(path.join(root, 'data/tilesets/primary', primary)), s: loadSet(path.join(root, 'data/tilesets/secondary', secondary)) };
}

function tilePixel(ts, tile, x, y) {
  const set = tile < NUM_TILES_IN_PRIMARY ? ts.p : ts.s;
  const t = tile < NUM_TILES_IN_PRIMARY ? tile : tile - NUM_TILES_IN_PRIMARY;
  const w = set.png.width;
  const tx = (t % (w / 8)) * 8 + x, ty = Math.floor(t / (w / 8)) * 8 + y;
  if (ty >= set.png.height) return 0;
  return set.png.index[ty * w + tx];
}

function palColor(ts, pal, ix) {
  const set = pal < NUM_PALS_IN_PRIMARY ? ts.p : ts.s;
  return set.pals[pal]?.[ix] ?? [255, 0, 255];
}

/** 图块的层类型：0 普通（后 4 块在人物上面）1 遮挡（都在下面）2 分层（后 4 块在上面） */
export function layerType(ts, id) {
  const set = id < NUM_METATILES_IN_PRIMARY ? ts.p : ts.s;
  const i = id < NUM_METATILES_IN_PRIMARY ? id : id - NUM_METATILES_IN_PRIMARY;
  if (i * 4 + 4 > set.attr.length) return 1;
  return (set.attr.readUInt32LE(i * 4) >>> 29) & 3;
}

export function behavior(ts, id) {
  const set = id < NUM_METATILES_IN_PRIMARY ? ts.p : ts.s;
  const i = id < NUM_METATILES_IN_PRIMARY ? id : id - NUM_METATILES_IN_PRIMARY;
  if (i * 4 + 4 > set.attr.length) return 0;
  return set.attr.readUInt32LE(i * 4) & 0x1ff;
}

/** 把一个 16×16 的图块画进 RGBA 画布（bottom / top 两张） */
export function drawMetatile(ts, id, bottom, top, W, ox, oy) {
  const set = id < NUM_METATILES_IN_PRIMARY ? ts.p : ts.s;
  const i = id < NUM_METATILES_IN_PRIMARY ? id : id - NUM_METATILES_IN_PRIMARY;
  if (i * 16 + 16 > set.mt.length) return;
  const lt = layerType(ts, id);
  for (let k = 0; k < 8; k++) {
    const e = set.mt.readUInt16LE(i * 16 + k * 2);
    const tile = e & 0x3ff, hf = (e >> 10) & 1, vf = (e >> 11) & 1, pal = e >> 12;
    const qx = (k & 1) * 8, qy = ((k >> 1) & 1) * 8;
    const dest = k >= 4 && lt !== 1 ? top : bottom;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const ix = tilePixel(ts, tile, hf ? 7 - x : x, vf ? 7 - y : y);
        if (!ix) continue;
        const c = palColor(ts, pal, ix);
        const o = ((oy + qy + y) * W + ox + qx + x) * 4;
        dest[o] = c[0]; dest[o + 1] = c[1]; dest[o + 2] = c[2]; dest[o + 3] = 255;
      }
    }
  }
}

/** 读取地图：返回 { w, h, cells: [{ id, collision, elevation }] } */
export function readLayout(root, name, w, h) {
  const b = fs.readFileSync(path.join(root, 'data/layouts', name, 'map.bin'));
  const cells = [];
  for (let i = 0; i < w * h; i++) {
    const v = b.readUInt16LE(i * 2);
    cells.push({ id: v & 0x3ff, collision: (v >> 10) & 3, elevation: v >> 12 });
  }
  return { w, h, cells };
}

/** 背景色：主图块组 0 号调色板的 0 号颜色 */
export function backdrop(ts) {
  return ts.p.pals[0]?.[0] ?? [0, 0, 0];
}
