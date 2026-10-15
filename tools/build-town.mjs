#!/usr/bin/env node
/**
 * 用火红/叶绿（pret/pokefirered）的图块拼出游戏里的真新镇：
 *   上方是 1 号道路的南端，中间是原版真新镇（我的家、小茂的家、大木研究所、花园、海边），
 *   东边扩建出宝可梦中心与道馆（取自常磐市），四周用树林围起来。
 * 输出：
 *   public/town/bg.png   画在人物下面的图层
 *   public/town/fg.png   画在人物上面的图层（树冠、屋檐）
 *   src/client/gfx/townMap.ts  地图尺寸、碰撞、门与 NPC 的位置
 *
 * 用法： node tools/build-town.mjs /path/to/pokefirered
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from './png.mjs';
import { backdrop, behavior, drawMetatile, loadTilesets, readLayout } from './frlg.mjs';

const ROOT = process.argv[2];
if (!ROOT || !fs.existsSync(path.join(ROOT, 'data/layouts/PalletTown/map.bin'))) {
  console.error('用法: node tools/build-town.mjs /path/to/pokefirered');
  process.exit(1);
}
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const tsP = loadTilesets(ROOT, 'general', 'pallet_town');
const tsV = loadTilesets(ROOT, 'general', 'viridian_city');
const P = readLayout(ROOT, 'PalletTown', 24, 20);
const V = readLayout(ROOT, 'ViridianCity', 48, 40);
const R = readLayout(ROOT, 'Route1', 24, 40);

/** 可走动的地图：36 × 24 格；外面再围一圈树（MARGIN 格），大屏幕上镜头到边时不会露出空白 */
const W = 36, H = 24, TOP = 4, MARGIN = 6;
const GW = W + MARGIN * 2, GH = H + MARGIN * 2;
const BORDER = [28, 29, 20, 21];
const grid = new Array(GW * GH);
const set = (x, y, ts, c, solid = !!c.collision) => { grid[(y + MARGIN) * GW + x + MARGIN] = { ts, id: c.id, solid }; };
const at = (x, y) => grid[(y + MARGIN) * GW + x + MARGIN];

for (let y = -MARGIN; y < H + MARGIN; y++) {
  for (let x = -MARGIN; x < W + MARGIN; x++) set(x, y, tsP, { id: BORDER[(((y % 2) + 2) % 2) * 2 + (((x % 2) + 2) % 2)] }, true);
}
for (let y = 0; y < TOP; y++) for (let x = 0; x < 24; x++) set(x, y, tsP, R.cells[(36 + y) * 24 + x]);
for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) set(x, TOP + y, tsP, P.cells[y * 24 + x]);

// 东边扩建：草地，挨着树林的一圈用带阴影的边缘图块
const open = new Set();
for (let y = TOP + 2; y <= TOP + 15; y++) for (let x = 22; x <= 33; x++) open.add(`${x},${y}`);
const TREES = new Set([28, 29, 20, 21, 22, 23, 30, 31, 36, 37, 38, 39]);
const isTree = (x, y) => { const c = at(x, y); return !c || (c.solid && c.ts === tsP && TREES.has(c.id)); };
for (const k of open) {
  const [x, y] = k.split(',').map(Number);
  const edge = (dx, dy) => !open.has(`${x + dx},${y + dy}`) && isTree(x + dx, y + dy);
  const up = edge(0, -1), dn = edge(0, 1), lf = edge(-1, 0), rt = edge(1, 0);
  let id = 662;
  if (up && lf) id = 678; else if (up && rt) id = 655; else if (dn && lf) id = 694; else if (dn && rt) id = 671;
  else if (up) id = 654; else if (lf) id = 686; else if (rt) id = 663; else if (dn) id = 670;
  set(x, y, tsP, { id, collision: 0 });
}
// 原版真新镇东边的树林拆掉了，靠树林那一列的阴影边缘改成普通草地
for (let y = TOP + 2; y <= TOP + 15; y++) {
  const c = at(21, y);
  if (c.id === 663) set(21, y, tsP, { id: 662, collision: 0 });
  if (c.id === 655) set(21, y, tsP, { id: 654, collision: 0 });
}
const copy = (L, ts, sx, sy, w, h, dx, dy) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(dx + x, dy + y, ts, L.cells[(sy + y) * L.w + sx + x]); };
const PC = { x: 26, y: TOP + 2 }, GYM = { x: 25, y: TOP + 10 };
copy(V, tsV, 24, 22, 5, 5, PC.x, PC.y);
copy(V, tsV, 33, 6, 6, 5, GYM.x, GYM.y);
// 扩建区的花
const FLOWERS = [[23, TOP + 6], [24, TOP + 6], [23, TOP + 7], [32, TOP + 12], [33, TOP + 12], [32, TOP + 13], [33, TOP + 13], [23, TOP + 14], [24, TOP + 14]];
for (const [x, y] of FLOWERS) set(x, y, tsP, { id: 4, collision: 0 });

// 渲染
const PW = GW * 16, PH = GH * 16;
const bottom = new Uint8Array(PW * PH * 4), top = new Uint8Array(PW * PH * 4);
const bd = backdrop(tsP);
for (let i = 0; i < PW * PH; i++) bottom.set([...bd, 255], i * 4);
grid.forEach((c, i) => drawMetatile(c.ts, c.id, bottom, top, PW, (i % GW) * 16, Math.floor(i / GW) * 16));

// 从常磐市搬来的建筑，最上面一排图块里还带着常磐市的石板路：把这些像素换成真新镇的草地
function tileRgba(ts, id) {
  const b = new Uint8Array(16 * 16 * 4), t = new Uint8Array(16 * 16 * 4);
  drawMetatile(ts, id, b, t, 16, 0, 0);
  return b;
}
const grass = tileRgba(tsP, 662);
const foreign = new Set();
for (const t of [tileRgba(tsV, 366), tileRgba(tsV, 1), tileRgba(tsV, 8), tileRgba(tsV, 9)]) for (let i = 0; i < 256; i++) foreign.add(t.subarray(i * 4, i * 4 + 3).join(','));
for (const b of [{ ...PC, w: 5, h: 5 }, { ...GYM, w: 6, h: 4 }, ...FLOWERS.map(([x, y]) => ({ x, y, w: 1, h: 1 }))]) {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const ox = (x + MARGIN) * 16, oy = (y + MARGIN) * 16;
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const o = ((oy + py) * PW + ox + px) * 4;
      if (foreign.has(`${bottom[o]},${bottom[o + 1]},${bottom[o + 2]}`)) bottom.set(grass.subarray((py * 16 + px) * 4, (py * 16 + px) * 4 + 4), o);
    }
  }
}
fs.mkdirSync(path.join(out, 'public/town'), { recursive: true });
fs.writeFileSync(path.join(out, 'public/town/bg.png'), encodePng(PW, PH, bottom));
fs.writeFileSync(path.join(out, 'public/town/fg.png'), encodePng(PW, PH, top));

// 碰撞：图块自带的碰撞位 + 水面、跳台（只能往下跳）也走不过去
const WATER = (b) => (b >= 0x10 && b <= 0x1b) || (b >= 0x38 && b <= 0x3b);
const rows = [];
for (let y = 0; y < H; y++) {
  let s = '';
  for (let x = 0; x < W; x++) {
    const c = at(x, y);
    s += c.solid || WATER(behavior(c.ts, c.id)) ? '#' : '.';
  }
  rows.push(s);
}
// 门（站在门下面那一格互动）与 NPC
const door = (x, y) => ({ x, y: y + 1 });
const spots = {
  home: door(6, TOP + 7),
  rival: door(15, TOP + 7),
  lab: door(16, TOP + 13),
  center: door(PC.x + 2, PC.y + 4),
  battle: door(GYM.x + 3, GYM.y + 4),
  sign: { x: 9, y: TOP + 12 },
};
const npcs = { oak: { x: 19, y: TOP + 14 }, karp: { x: 31, y: PC.y + 5 }, mom: { x: 8, y: TOP + 8 } };
for (const n of Object.values(npcs)) rows[n.y] = rows[n.y].slice(0, n.x) + '#' + rows[n.y].slice(n.x + 1);

const ts = `/* 由 tools/build-town.mjs 生成，请勿手改。图块来自火红/叶绿（pret/pokefirered）。 */
/** 可走动的地图（格）与外围装饰树林的宽度（格），每格 16 像素 */
export const TOWN_COLS = ${W};
export const TOWN_ROWS = ${H};
export const TOWN_MARGIN = ${MARGIN};
/** # 走不过去 */
export const TOWN_SOLID = ${JSON.stringify(rows, null, 2)};
/** 门口（站在这一格互动）与告示牌 */
export const TOWN_DOORS = ${JSON.stringify(spots)};
/** NPC 站的格子 */
export const TOWN_NPCS = ${JSON.stringify(npcs)};
/** 北边通往 1 号道路的出口（格） */
export const TOWN_ROUTE = { x0: 11, x1: 14, y0: 0, y1: 1 };
`;
fs.writeFileSync(path.join(out, 'src/client/gfx/townMap.ts'), ts);
console.log(`真新镇 ${W}×${H} 格，图片 ${PW}×${PH} 像素`);
