#!/usr/bin/env node
/**
 * 训练家素材：
 *   正面立绘：PokéRogue（pagefaultgames/pokerogue-assets，CC BY-NC-SA 4.0）的 images/trainer/*，取第一帧
 *   行走图：火红/叶绿（pret/pokefirered）的人物行走图，按游戏里的调色板上色；
 *           道馆馆主在原作里只有站立的 3 帧，这里补出走路的帧（身体下沉 1 像素、一只脚抬起）
 *   道馆馆主与道馆训练家只要立绘；大木博士的立绘取自火红/叶绿的开场
 * 输出 public/trainers/<id>.png（立绘）与 public/trainers/<id>_ow.png（9 帧行走图，16×32）。
 *
 * 用法： node tools/import-trainers.mjs /path/to/pokefirered /path/to/pokerogue-assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng, readJasc } from './png.mjs';

const [FRLG, PR] = process.argv.slice(2);
if (!FRLG || !PR || !fs.existsSync(path.join(FRLG, 'graphics/object_events')) || !fs.existsSync(path.join(PR, 'images/trainer'))) {
  console.error('用法: node tools/import-trainers.mjs /path/to/pokefirered /path/to/pokerogue-assets');
  process.exit(1);
}
const out = path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), 'public/trainers');
fs.mkdirSync(out, { recursive: true });

/** 训练家：正面立绘、行走图、行走图用的调色板 */
const TRAINERS = {
  ash: { front: 'red', ow: 'red_normal', pal: 'player' },
  misty: { front: 'misty', ow: 'misty', pal: 'npc_blue' },
  brock: { front: 'brock', ow: 'brock', pal: 'npc_green' },
  gary: { front: 'blue', ow: 'blue', pal: 'npc_green' },
  rocket: { front: 'rocket_grunt_f', ow: 'rocket_f', pal: 'npc_white' },
  giovanni: { front: 'giovanni', ow: 'giovanni', pal: 'npc_white' },
  sabrina: { front: 'sabrina', ow: 'sabrina', pal: 'npc_blue' },
  lance: { front: 'lance', ow: 'lance', pal: 'npc_white' },
};
/** 镇上的 NPC：只要行走图 */
const NPCS = {
  npc_oak: { ow: 'prof_oak', pal: 'npc_white' },
  npc_karp: { ow: 'fat_man', pal: 'npc_white' },
  npc_mom: { ow: 'mom', pal: 'npc_blue' },
  npc_guide: { ow: 'gym_guy', pal: 'npc_pink' },
};
/** 道馆馆主与道馆训练家：只要立绘（对话与对战开场用） */
const ART = {
  surge: 'lt_surge', erika: 'erika', koga: 'koga', blaine: 'blaine',
  camper: 'camper_m', swimmer: 'swimmer_f', rocker: 'guitarist', beauty: 'beauty',
  janine: 'janine', psychic: 'psychic_m', scientist: 'scientist_m', blackbelt: 'black_belt_m',
};

const FW = 16, FH = 32;

function overworld(name, pal) {
  const img = decodePng(fs.readFileSync(path.join(FRLG, 'graphics/object_events/pics/people', `${name}.png`)));
  const colors = readJasc(fs.readFileSync(path.join(FRLG, 'graphics/object_events/palettes', `${pal}.pal`), 'utf8'));
  const n = Math.floor(img.width / FW);
  /** 帧 → 16×32 的索引色（0 透明） */
  const frames = Array.from({ length: n }, (_, f) => {
    const a = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) a[y * FW + x] = img.index[y * img.width + f * FW + x];
    return a;
  });
  const all = n >= 9 ? frames.slice(0, 9) : [frames[0], frames[1], frames[2], ...synthWalk(frames[0]), ...synthWalk(frames[1]), ...synthSide(frames[2])];
  const rgba = new Uint8Array(FW * 9 * FH * 4);
  all.forEach((a, f) => {
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const ix = a[y * FW + x];
      if (!ix) continue;
      rgba.set([...colors[ix], 255], (y * FW * 9 + f * FW + x) * 4);
    }
  });
  return rgba;
}

const get = (a, x, y) => (x < 0 || y < 0 || x >= FW || y >= FH ? 0 : a[y * FW + x]);
function bottomRow(a) { for (let y = FH - 1; y >= 0; y--) for (let x = 0; x < FW; x++) if (a[y * FW + x]) return y; return FH - 1; }

/** 正面 / 背面：整体下沉 1 像素，再把左（或右）半边的脚抬起 2 像素 */
function synthWalk(a) {
  const feet = bottomRow(a) - 3;
  return [true, false].map((rightUp) => {
    const b = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) b[y * FW + x] = get(a, x, y - 1);
    for (let y = feet; y < FH; y++) {
      for (let x = rightUp ? 8 : 0; x < (rightUp ? FW : 8); x++) b[y * FW + x] = y + 2 + 1 < FH ? get(a, x, y + 2 - 1) : 0;
    }
    return b;
  });
}

/** 侧面：整体下沉 1 像素，脚分开（前脚往前、后脚往后） */
function synthSide(a) {
  const feet = bottomRow(a) - 3;
  let minX = FW, maxX = 0;
  for (let y = feet; y < FH; y++) for (let x = 0; x < FW; x++) if (a[y * FW + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const mid = (minX + maxX) / 2;
  return [1, -1].map((s) => {
    const b = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) b[y * FW + x] = get(a, x, y - 1);
    for (let y = feet + 1; y < FH; y++) {
      const row = Array.from({ length: FW }, (_, x) => get(a, x, y - 1));
      for (let x = 0; x < FW; x++) b[y * FW + x] = 0;
      for (let x = 0; x < FW; x++) {
        if (!row[x]) continue;
        const dx = x < mid ? -s : s;
        const nx = Math.max(0, Math.min(FW - 1, x + dx));
        if (!b[y * FW + nx]) b[y * FW + nx] = row[x];
      }
    }
    return b;
  });
}

/** PokéRogue 立绘：TexturePacker 图集的第一帧（裁掉透明边） */
function front(name) {
  const img = decodePng(fs.readFileSync(path.join(PR, 'images/trainer', `${name}.png`)));
  const atlas = JSON.parse(fs.readFileSync(path.join(PR, 'images/trainer', `${name}.json`), 'utf8'));
  let frames = atlas.textures?.[0]?.frames ?? atlas.frames;
  if (!Array.isArray(frames)) frames = Object.entries(frames).map(([filename, f]) => ({ filename, ...f }));
  const f = frames.slice().sort((a, b) => String(a.filename).localeCompare(String(b.filename)))[0];
  if (f.rotated) throw new Error(`${name}: rotated frames are not supported`);
  const { x, y, w, h } = f.frame;
  const rgba = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) rgba.set(img.rgba.subarray(((y + yy) * img.width + x + xx) * 4, ((y + yy) * img.width + x + xx) * 4 + 4), (yy * w + xx) * 4);
  return { w, h, rgba };
}

/**
 * 大木博士的立绘：火红/叶绿开场「欢迎来到宝可梦的世界」那张（graphics/oak_speech/oak/），
 * 图片里的颜色序号从某个 16 色调色板开始，按最小的非零序号对齐到 pal.pal。
 */
function oakPic() {
  const dir = path.join(FRLG, 'graphics/oak_speech/oak');
  if (!fs.existsSync(path.join(dir, 'pic.png'))) return null;
  const img = decodePng(fs.readFileSync(path.join(dir, 'pic.png')));
  const colors = readJasc(fs.readFileSync(path.join(dir, 'pal.pal'), 'utf8'));
  let base = Infinity;
  for (const ix of img.index) if (ix % 16) base = Math.min(base, ix - (ix % 16));
  const rgba = new Uint8Array(img.width * img.height * 4);
  img.index.forEach((ix, i) => { if (ix % 16 && colors[ix - base]) rgba.set([...colors[ix - base], 255], i * 4); });
  return { w: img.width, h: img.height, rgba };
}

for (const [id, t] of Object.entries(TRAINERS)) {
  fs.writeFileSync(path.join(out, `${id}_ow.png`), encodePng(FW * 9, FH, overworld(t.ow, t.pal)));
  const f = front(t.front);
  fs.writeFileSync(path.join(out, `${id}.png`), encodePng(f.w, f.h, f.rgba));
  console.log(`${id}: 行走图 ${t.ow}，立绘 ${t.front} ${f.w}×${f.h}`);
}
for (const [id, t] of Object.entries(NPCS)) fs.writeFileSync(path.join(out, `${id}_ow.png`), encodePng(FW * 9, FH, overworld(t.ow, t.pal)));
for (const [id, name] of Object.entries(ART)) {
  const f = front(name);
  fs.writeFileSync(path.join(out, `${id}.png`), encodePng(f.w, f.h, f.rgba));
  console.log(`${id}: 立绘 ${name} ${f.w}×${f.h}`);
}
const oak = oakPic();
if (oak) fs.writeFileSync(path.join(out, 'oak.png'), encodePng(oak.w, oak.h, oak.rgba));
else console.log('没有找到 graphics/oak_speech/oak/pic.png，跳过大木博士的立绘');
