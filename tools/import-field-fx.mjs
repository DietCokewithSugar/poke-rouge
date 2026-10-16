#!/usr/bin/env node
/**
 * 局部属性场地的特效素材：从 PokéRogue（pagefaultgames/pokerogue-assets）的 images/battle_anims/ 里
 * 挑出要用的战斗动画帧（这批动画图最早来自 Pokémon Reborn），裁掉透明边、按需要换色后拼成一张图集，
 * 另外把几张整屏的前景纹理（烟雾、暴风雪、狂风、沙尘）转成白色的透明度蒙版，运行时再上色、平铺滚动。
 *
 * 输出：
 *   public/fx/fields.png              图集
 *   public/fx/<haze|blizzard|wind|sand>.png  纹理蒙版
 *   src/client/gfx/fieldFxMeta.ts     每段动画的帧在图集里的位置与锚点偏移
 *
 * 用法： node tools/import-field-fx.mjs /path/to/pokerogue-assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const [PR] = process.argv.slice(2);
const SRC = PR && path.join(PR, 'images/battle_anims');
if (!SRC || !fs.existsSync(SRC)) {
  console.error('用法: node tools/import-field-fx.mjs /path/to/pokerogue-assets');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'public/fx');
fs.mkdirSync(outDir, { recursive: true });

const CELL = 96;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const file = (sheet) => (sheet === 'DustandGrass' ? 'DustandGrass.png' : `PRAS- ${sheet}.png`);

/**
 * 换色：按亮度把原图映射到一组新的颜色上（从暗到亮）
 * @type {Record<string, [number, number, number][]>}
 */
const RAMPS = {
  // 绿色的叶之龙卷 → 白色的旋风
  wind: [[96, 140, 190], [150, 196, 232], [206, 236, 255], [255, 255, 255]],
  // 淡紫的冰块 → 粉色的晶石
  pink: [[96, 24, 92], [176, 56, 150], [232, 108, 204], [255, 178, 236], [255, 232, 250]],
  // 淡紫的冰刺、冰晶 → 冰蓝色
  ice: [[40, 96, 160], [100, 170, 225], [180, 226, 250], [255, 255, 255]],
  // 红色的熔岩风暴 → 发亮的黄白色喷柱（压在熔岩上才看得清）
  hot: [[150, 30, 0], [255, 110, 20], [255, 200, 60], [255, 250, 200]],
};

/**
 * 要用的动画： sheet 精灵表 · frames 帧号 · anchor 锚点（c 中心 / b 底边中点）· ramp 换色
 * 帧号按 96×96 的格子从左到右、从上到下数。
 */
const ANIMS = {
  // 熔岩池
  flame: { sheet: 'Status', frames: range(12, 16), anchor: 'b' }, // 从熔岩里窜出来的火苗
  geyser: { sheet: 'Magma Storm', frames: range(0, 10), anchor: 'b', ramp: 'hot' }, // 熔岩喷柱
  bomb: { sheet: 'Rock', frames: range(6, 14), anchor: 'c' }, // 飞出来的熔岩块
  // 阴云毒雾
  bubble: { sheet: 'Poison', frames: range(0, 6), anchor: 'b' }, // 毒泡鼓起来又破掉
  cloud: { sheet: 'Poison', frames: range(7, 15), anchor: 'c' }, // 毒云
  drip: { sheet: 'Poison', frames: range(19, 26), anchor: 'c' }, // 滴下来的毒液
  // 局部阵雨
  drop: { sheet: 'Weather', frames: [2], anchor: 'c' },
  splash: { sheet: 'Weather', frames: [3, 4], anchor: 'c' },
  bolt: { sheet: 'Electric', frames: range(20, 23), anchor: 'b' }, // 落雷
  zap: { sheet: 'Electric', frames: range(24, 29), anchor: 'c' }, // 雷击后地上的电火花
  // 繁茂草丛
  sprout: { sheet: 'Grass', frames: range(28, 34), anchor: 'b' }, // 长出来的嫩芽
  leaf: { sheet: 'Grass', frames: range(8, 16), anchor: 'c' }, // 飘落的叶子
  petal: { sheet: 'Grass', frames: range(0, 3), anchor: 'c' }, // 花瓣
  rustle: { sheet: 'DustandGrass', frames: range(3, 5), anchor: 'b' }, // 草叶翻动
  // 共鸣晶石
  gem: { sheet: 'Ice', frames: [12], anchor: 'b', ramp: 'pink' }, // 晶石本体
  arc: { sheet: 'Mirror Coat', frames: range(6, 14), anchor: 'b' }, // 一圈圈的共鸣波（上半圆）
  glint: { sheet: 'Mirror Coat', frames: range(0, 5), anchor: 'c' }, // 闪光
  orb: { sheet: 'Orbs', frames: range(0, 5), anchor: 'c' }, // 升起的光球
  // 上升气流
  whirl: { sheet: 'Leaf Tornado', frames: range(23, 33), anchor: 'b', ramp: 'wind' }, // 旋风
  gust: { sheet: 'Gust', frames: [0], anchor: 'b' },
  spin: { sheet: 'Leaf Tornado', frames: range(0, 14), anchor: 'c' }, // 卷起来的叶子
  wisp: { sheet: 'Mist', frames: [0, 1], anchor: 'c' }, // 气流的白线
  // 开阔空地
  dust: { sheet: 'DustandGrass', frames: range(0, 2), anchor: 'b' }, // 扬起的尘土
  pebble: { sheet: 'Rock', frames: range(0, 5), anchor: 'c' }, // 石子
  // 寒霜区域
  spike: { sheet: 'Ice', frames: range(13, 16), anchor: 'b', ramp: 'ice' }, // 冒出来的冰刺
  shard: { sheet: 'Ice', frames: [17, 18, 19, 23], anchor: 'c', ramp: 'ice' }, // 冰晶
  frost: { sheet: 'Powder Snow', frames: range(0, 9), anchor: 'c' }, // 寒气
  burst: { sheet: 'Ice', frames: range(0, 6), anchor: 'c' }, // 雪团散开
  sparkle: { sheet: 'Weather', frames: [6, 7], anchor: 'c' },
};

/**
 * 整张的前景纹理 → 白色 + 透明度（亮度 lo..hi 线性映射到 0..1，invert 时暗的地方更不透明）
 * rotate 顺时针转 90°（狂风的横条变成往上吹的竖条）；mirror 拼成 2×2 的镜像图，让本来不能无缝平铺的图也能平铺；
 * color 保留原来的颜色（精神场地的底图）。
 */
const TEXTURES = {
  haze: { sheet: 'Haze FG', lo: 44, hi: 153, invert: true },
  blizzard: { sheet: 'Blizzard FG', lo: 179, hi: 233, mirror: true },
  wind: { sheet: 'Hurricane FG', lo: 129, hi: 190, rotate: true },
  sand: { sheet: 'Sandstorm', lo: 96, hi: 223, invert: true, mirror: true },
  psychic: { sheet: 'Psychic Terrain BG', mirror: true, color: true },
};

const sheets = new Map();
function sheet(name) {
  let s = sheets.get(name);
  if (!s) {
    s = decodePng(fs.readFileSync(path.join(SRC, file(name))));
    sheets.set(name, s);
  }
  return s;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 按亮度在色带上插值 */
function rampColor(ramp, t) {
  const k = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(k)), f = k - i;
  return ramp[i].map((c, j) => Math.round(c + (ramp[i + 1][j] - c) * f));
}

/** 取出一帧：裁到不透明的部分 → { w, h, x0, y0, rgba }（x0, y0 是在 96×96 格子里的位置） */
function cut(img, idx) {
  const cols = Math.floor(img.width / CELL);
  const cx = (idx % cols) * CELL, cy = Math.floor(idx / cols) * CELL;
  let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (img.rgba[((cy + y) * img.width + cx + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error(`empty frame ${idx}`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((cy + y0 + y) * img.width + cx + x0 + x) * 4;
    rgba.set(img.rgba.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { w, h, x0, y0, rgba };
}

function recolor(frames, ramp) {
  let lo = 255, hi = 0;
  for (const f of frames) for (let i = 0; i < f.w * f.h; i++) {
    if (!f.rgba[i * 4 + 3]) continue;
    const l = lum(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2]);
    lo = Math.min(lo, l); hi = Math.max(hi, l);
  }
  for (const f of frames) for (let i = 0; i < f.w * f.h; i++) {
    if (!f.rgba[i * 4 + 3]) continue;
    const l = lum(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2]);
    f.rgba.set(rampColor(ramp, (l - lo) / Math.max(1, hi - lo)), i * 4);
  }
}

// 1. 取帧
const pieces = [];
const meta = {};
for (const [name, a] of Object.entries(ANIMS)) {
  const img = sheet(a.sheet);
  const frames = a.frames.map((i) => cut(img, i));
  if (a.ramp) recolor(frames, RAMPS[a.ramp]);
  // 锚点按整段动画的外框算，每帧的偏移都相对于同一个点，播放时不会抖
  const ux0 = Math.min(...frames.map((f) => f.x0)), ux1 = Math.max(...frames.map((f) => f.x0 + f.w));
  const uy0 = Math.min(...frames.map((f) => f.y0)), uy1 = Math.max(...frames.map((f) => f.y0 + f.h));
  const ax = Math.round((ux0 + ux1) / 2), ay = a.anchor === 'b' ? uy1 : Math.round((uy0 + uy1) / 2);
  meta[name] = frames.map((f) => {
    const p = { ...f, ox: f.x0 - ax, oy: f.y0 - ay, x: 0, y: 0 };
    pieces.push(p);
    return p;
  });
}

// 2. 拼图集（按高度排好，一行一行往下摆，帧之间空 1 像素）
const W = 512;
let x = 0, y = 0, rowH = 0;
for (const p of [...pieces].sort((a, b) => b.h - a.h || b.w - a.w)) {
  if (x + p.w > W) { x = 0; y += rowH + 1; rowH = 0; }
  p.x = x; p.y = y;
  x += p.w + 1;
  rowH = Math.max(rowH, p.h);
}
const H = y + rowH;
const atlas = new Uint8Array(W * H * 4);
for (const p of pieces) for (let yy = 0; yy < p.h; yy++) atlas.set(p.rgba.subarray(yy * p.w * 4, (yy + 1) * p.w * 4), ((p.y + yy) * W + p.x) * 4);
fs.writeFileSync(path.join(outDir, 'fields.png'), encodePng(W, H, atlas));

// 3. 纹理蒙版
for (const [name, t] of Object.entries(TEXTURES)) {
  const img = sheet(t.sheet);
  let w = img.width, h = img.height;
  let px = (xx, yy) => img.rgba.subarray((yy * img.width + xx) * 4, (yy * img.width + xx) * 4 + 4);
  if (t.rotate) {
    const src = px, sh = h;
    [w, h] = [h, w];
    px = (xx, yy) => src(yy, sh - 1 - xx);
  }
  const ow = t.mirror ? w * 2 : w, oh = t.mirror ? h * 2 : h;
  const out = new Uint8Array(ow * oh * 4);
  for (let yy = 0; yy < oh; yy++) for (let xx = 0; xx < ow; xx++) {
    const sx = xx < w ? xx : ow - 1 - xx, sy = yy < h ? yy : oh - 1 - yy;
    const c = px(sx, sy);
    if (t.color) { out.set(c, (yy * ow + xx) * 4); continue; }
    let k = (lum(c[0], c[1], c[2]) - t.lo) / (t.hi - t.lo);
    if (t.invert) k = 1 - k;
    out.set([255, 255, 255, Math.round(Math.max(0, Math.min(1, k)) * 255)], (yy * ow + xx) * 4);
  }
  fs.writeFileSync(path.join(outDir, `${name}.png`), encodePng(ow, oh, out));
}

// 4. 元数据
const rows = Object.entries(meta).map(([name, fs_]) => `  ${name}: [${fs_.map((p) => `[${p.x},${p.y},${p.w},${p.h},${p.ox},${p.oy}]`).join(',')}],`);
const ts = `/* 由 tools/import-field-fx.mjs 生成，请勿手改。
 * 局部属性场地的特效帧：素材来自 PokéRogue 的战斗动画图（images/battle_anims/，最早出自 Pokémon Reborn）。
 * 每帧 [x, y, w, h, ox, oy]：在 public/fx/fields.png 里的位置和大小，ox, oy 是左上角相对锚点的偏移（原图像素）。
 */
export type FxFrame = [number, number, number, number, number, number];
export const FIELD_FX = {
${rows.join('\n')}
} satisfies Record<string, FxFrame[]>;
export type FxName = keyof typeof FIELD_FX;
export const FIELD_TEXTURES = ${JSON.stringify(Object.keys(TEXTURES))} as const;
export type FxTexture = (typeof FIELD_TEXTURES)[number];
`;
fs.writeFileSync(path.join(root, 'src/client/gfx/fieldFxMeta.ts'), ts);
console.log(`atlas ${W}x${H}, ${pieces.length} frames; textures: ${Object.keys(TEXTURES).join(', ')}`);
