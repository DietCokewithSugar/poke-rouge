/**
 * 真新镇的地图：草地、小路、树林、海边，以及 4 栋建筑和通往 1 号道路的出口。
 * 静态部分画进一张离屏画布，海浪等动画在每帧绘制。
 */
import { Rng } from '../../shared/rng';
import type { TrainerLook } from '../../shared/trainers';
import { tallGrass, tree, type Px } from './tiles';

export const TOWN_W = 768;
export const TOWN_H = 640;
/** 海从这里开始（走不过去） */
export const SEA_Y = 572;

export type PlaceId = 'home' | 'center' | 'battle' | 'lab' | 'route' | 'karp' | 'oak' | 'sign';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Building extends Rect {
  id: Exclude<PlaceId, 'route' | 'karp' | 'oak' | 'sign'>;
  name: string;
  /** 门的中心 x（门在建筑底边） */
  door: number;
  roof: [string, string, string];
  wall: [string, string];
}

export const BUILDINGS: Building[] = [
  { id: 'home', name: '我的家', x: 112, y: 92, w: 112, h: 96, door: 168, roof: ['#a83838', '#d85050', '#f07868'], wall: ['#f0e0c0', '#c8b090'] },
  { id: 'center', name: '宝可梦中心', x: 520, y: 92, w: 136, h: 96, door: 588, roof: ['#b02838', '#e04050', '#f87080'], wall: ['#f8f8f8', '#c8c8d0'] },
  { id: 'battle', name: '对战场', x: 96, y: 372, w: 152, h: 116, door: 172, roof: ['#2848a0', '#3868d0', '#68a0f0'], wall: ['#e8e8f0', '#b8b8c8'] },
  { id: 'lab', name: '大木研究所', x: 464, y: 360, w: 208, h: 128, door: 536, roof: ['#485868', '#687888', '#98a8b8'], wall: ['#f8f8f0', '#c8c8c0'] },
];

/** 走进去就能互动的区域 */
export interface Spot extends Rect { id: PlaceId; label: string; hint: string }

export const NPCS: Record<'oak' | 'karp', { x: number; y: number; look: TrainerLook }> = {
  oak: { x: 612, y: 522, look: { skin: '#f0c8a0', hair: '#c8c8c8', hairStyle: 'slick', top: '#f8f8f8', top2: '#c86838', bottom: '#806850', shoes: '#584030' } },
  karp: { x: 470, y: 236, look: { skin: '#e8b890', hair: '#583828', hairStyle: 'slick', top: '#e8a030', top2: '#f8f8f8', bottom: '#384868', shoes: '#302820' } },
};

const SPOT_HINT: Record<Building['id'], string> = { home: '换训练家、换伙伴', center: '联机冒险', battle: '宝可梦对战', lab: '研究与图鉴' };

export const SPOTS: Spot[] = [
  ...BUILDINGS.map((b) => ({ id: b.id, label: b.name, hint: SPOT_HINT[b.id], x: b.door - 14, y: b.y + b.h - 6, w: 28, h: 26 })),
  { id: 'route', label: '1号道路', hint: '出发冒险', x: 344, y: 0, w: 80, h: 44 },
  { id: 'oak', label: '大木博士', hint: '和博士说话', x: NPCS.oak.x - 18, y: NPCS.oak.y - 26, w: 36, h: 40 },
  { id: 'karp', label: '鲤鱼王推销员', hint: '“要不要来一只鲤鱼王？”', x: NPCS.karp.x - 18, y: NPCS.karp.y - 26, w: 36, h: 40 },
  { id: 'sign', label: '真新镇', hint: '看告示牌', x: 418, y: 262, w: 28, h: 26 },
];

/** 出生点：家门口 */
export const SPAWN = { x: 168, y: 214 };

/** 碰撞：树林、海、建筑、告示牌、NPC */
export const SOLIDS: Rect[] = [
  { x: 0, y: 0, w: 344, h: 40 }, { x: 424, y: 0, w: 344, h: 40 },
  { x: 0, y: 0, w: 32, h: TOWN_H }, { x: TOWN_W - 32, y: 0, w: 32, h: TOWN_H },
  { x: 0, y: SEA_Y, w: TOWN_W, h: TOWN_H - SEA_Y },
  ...BUILDINGS.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h - 4 })),
  { x: 424, y: 254, w: 16, h: 12 },
  { x: NPCS.oak.x - 6, y: NPCS.oak.y - 5, w: 12, h: 6 },
  { x: NPCS.karp.x - 6, y: NPCS.karp.y - 5, w: 12, h: 6 },
];

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 脚底 (x, y) 的碰撞盒有没有撞到东西 */
export function blocked(x: number, y: number): boolean {
  const box = { x: x - 5, y: y - 4, w: 10, h: 5 };
  if (x < 4 || x > TOWN_W - 4 || y < 6 || y > TOWN_H) return true;
  return SOLIDS.some((s) => hit(box, s));
}

export function spotAt(x: number, y: number): Spot | null {
  return SPOTS.find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) ?? null;
}

let cached: HTMLCanvasElement | null = null;

export function townCanvas(): HTMLCanvasElement {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = TOWN_W;
  c.height = TOWN_H;
  const x = c.getContext('2d')!;
  const rng = new Rng(20261014);
  const px: Px = (cx, cy, col, ww = 1, hh = 1) => { x.fillStyle = col; x.fillRect(cx, cy, ww, hh); };

  // 草地
  const ground = ['#88c070', '#80b868', '#90c878'];
  for (let ty = 0; ty < TOWN_H / 16; ty++) {
    for (let tx = 0; tx < TOWN_W / 16; tx++) {
      const gx = tx * 16, gy = ty * 16;
      px(gx, gy, ground[(tx * 7 + ty * 3 + ((tx ^ ty) & 1)) % 3], 16, 16);
      for (let i = 0; i < 3; i++) px(gx + rng.int(0, 15), gy + rng.int(0, 15), '#68a050');
      if (rng.chance(0.3)) {
        const bx = gx + rng.int(2, 10), by = gy + rng.int(3, 11);
        for (const [dx, dy] of [[0, 2], [1, 1], [2, 2], [3, 0], [4, 2]]) px(bx + dx, by + dy, '#5a9848');
      }
    }
  }

  // 小路
  const path = (r: Rect) => {
    px(r.x, r.y, '#b89860', r.w, r.h);
    px(r.x + 1, r.y + 1, '#e0c888', r.w - 2, r.h - 2);
    for (let i = 0; i < (r.w * r.h) / 40; i++) px(r.x + 2 + rng.int(0, r.w - 5), r.y + 2 + rng.int(0, r.h - 5), rng.chance(0.5) ? '#d8c080' : '#e8d090', 2, 1);
  };
  const paths: Rect[] = [
    { x: 360, y: 0, w: 48, h: 320 },
    { x: 96, y: 292, w: 600, h: 44 },
    { x: 152, y: 186, w: 32, h: 112 },
    { x: 572, y: 186, w: 32, h: 112 },
    { x: 156, y: 330, w: 32, h: 46 },
    { x: 520, y: 330, w: 32, h: 34 },
    { x: 384, y: 330, w: 32, h: 230 },
    { x: 400, y: 520, w: 260, h: 32 },
  ];
  paths.forEach(path);

  // 花坛与草丛
  const flower = (fx: number, fy: number, col: string) => {
    px(fx + 1, fy, col); px(fx, fy + 1, col); px(fx + 2, fy + 1, col); px(fx + 1, fy + 2, col); px(fx + 1, fy + 1, '#f8d030');
  };
  const bed = (bx: number, by: number, w: number, h: number) => {
    for (let i = 0; i < (w * h) / 60; i++) flower(bx + rng.int(0, w - 3), by + rng.int(0, h - 3), rng.pick(['#f85858', '#f8e048', '#ffffff', '#f8a8d0']));
  };
  bed(232, 200, 100, 70); bed(436, 196, 70, 40); bed(250, 380, 90, 90); bed(60, 230, 70, 50); bed(690, 230, 40, 60);
  for (const [gx, gy] of [[40, 520], [56, 520], [72, 520], [40, 536], [56, 536], [700, 300], [700, 316], [716, 316], [300, 520], [316, 520], [300, 504]]) tallGrass(px, gx, gy, ['#3f8a3a', '#5aa848', '#78c060']);

  // 1 号道路方向的高草丛
  for (let gx = 352; gx < 416; gx += 16) tallGrass(px, gx, 0, ['#3f8a3a', '#5aa848', '#78c060']);

  // 海与沙滩
  px(0, SEA_Y - 10, '#e8d8a0', TOWN_W, 10);
  for (let i = 0; i < 120; i++) px(rng.int(0, TOWN_W - 2), SEA_Y - 10 + rng.int(0, 8), '#d0c088', 2, 1);
  px(0, SEA_Y, '#3878d8', TOWN_W, TOWN_H - SEA_Y);

  // 树林
  const leaf = ['#205820', '#307830', '#48a040', '#70c058'];
  for (let yy = -16; yy < SEA_Y - 16; yy += 30) {
    tree(px, -6, yy, leaf, '#704820');
    tree(px, TOWN_W - 26, yy + 12, leaf, '#704820');
  }
  for (let xx = -8; xx < TOWN_W; xx += 30) {
    if (xx > 320 && xx < 420) continue;
    tree(px, xx, -10, leaf, '#704820');
  }

  // 栅栏：家门前的院子
  const fence = (fx: number, fy: number, n: number) => {
    for (let i = 0; i < n; i++) {
      px(fx + i * 8, fy, '#f8f8f8', 2, 10);
      px(fx + i * 8 + 2, fy, '#a8a8b0', 1, 10);
    }
    px(fx, fy + 2, '#f8f8f8', n * 8, 2);
    px(fx, fy + 6, '#f8f8f8', n * 8, 2);
    px(fx, fy + 4, '#a8a8b0', n * 8, 1);
  };
  fence(40, 232, 6); fence(240, 278, 12);

  for (const b of BUILDINGS) building(px, b);

  // 告示牌
  px(424, 254, '#704820', 16, 10);
  px(425, 255, '#c08850', 14, 7);
  px(427, 257, '#7a4a24', 10, 1);
  px(427, 259, '#7a4a24', 8, 1);
  px(431, 264, '#704820', 2, 6);

  cached = c;
  return c;
}

function building(px: Px, b: Building) {
  const { x, y, w, h } = b;
  const roofH = Math.round(h * 0.48);
  const [rd, rm, rl] = b.roof;
  const [wl, wd] = b.wall;
  // 阴影
  px(x + 4, y + h, 'rgba(0,0,0,.22)', w, 4);
  // 墙
  px(x + 4, y + roofH - 4, '#282028', w - 8, h - roofH + 4);
  px(x + 5, y + roofH - 4, wl, w - 10, h - roofH + 3);
  px(x + 5, y + h - 8, wd, w - 10, 7);
  // 屋顶：屋檐伸出墙外，横向瓦片
  px(x, y, '#282028', w, roofH);
  px(x + 1, y + 1, rm, w - 2, roofH - 2);
  for (let ry = y + 5; ry < y + roofH - 2; ry += 5) px(x + 1, ry, rd, w - 2, 1);
  px(x + 1, y + 1, rl, w - 2, 2);
  px(x + 1, y + roofH - 3, rd, w - 2, 2);
  // 窗户
  const win = (wx: number, wy: number) => {
    px(wx, wy, '#282028', 14, 12);
    px(wx + 1, wy + 1, '#a8d8f8', 12, 10);
    px(wx + 1, wy + 1, '#e8f8ff', 5, 3);
    px(wx + 7, wy + 1, '#282028', 1, 10);
    px(wx + 1, wy + 6, '#282028', 12, 1);
  };
  const wy = y + roofH + 6;
  const doorW = b.id === 'center' || b.id === 'lab' ? 24 : 16;
  const dx = b.door - doorW / 2;
  for (let wx = x + 14; wx + 14 < x + w - 10; wx += 26) {
    if (wx + 14 > dx - 4 && wx < dx + doorW + 4) continue;
    win(wx, wy);
  }
  // 门
  const dy = y + h - 24;
  px(dx - 1, dy - 1, '#282028', doorW + 2, 25);
  if (b.id === 'center' || b.id === 'lab') {
    px(dx, dy, '#a8d8f8', doorW, 24);
    px(dx + doorW / 2 - 1, dy, '#585868', 2, 24);
    px(dx + 2, dy + 2, '#e8f8ff', 4, 8);
  } else {
    px(dx, dy, '#a86a3a', doorW, 24);
    px(dx + 2, dy + 2, '#c88850', doorW - 4, 9);
    px(dx + 2, dy + 13, '#c88850', doorW - 4, 9);
    px(dx + doorW - 4, dy + 12, '#ffd23f', 2, 2);
  }
  px(dx - 3, y + h - 1, '#a0a0a8', doorW + 6, 3);
  // 屋顶上的标志
  const cx = b.door, cy = y + Math.round(roofH / 2);
  if (b.id === 'center') pokeball(px, cx - 6, cy - 7, 14);
  if (b.id === 'battle') {
    pokeball(px, cx - 6, cy - 7, 14);
    for (const fx of [x + 10, x + w - 14]) { px(fx, y - 12, '#583828', 1, 14); px(fx + 1, y - 12, '#e83838', 6, 4); }
  }
  if (b.id === 'lab') {
    px(x + w - 36, y - 8, '#282028', 12, 10);
    px(x + w - 35, y - 7, '#b8b8c0', 10, 9);
    px(x + w - 33, y - 12, '#787880', 6, 4);
  }
  if (b.id === 'home') {
    px(x + w - 26, y - 10, '#282028', 12, 12);
    px(x + w - 25, y - 9, '#a85838', 10, 11);
  }
}

function pokeball(px: Px, x: number, y: number, s: number) {
  const r = s / 2;
  for (let yy = 0; yy < s; yy++) {
    for (let xx = 0; xx < s; xx++) {
      const d = Math.hypot(xx + 0.5 - r, yy + 0.5 - r);
      if (d > r) continue;
      let col = yy < r - 1 ? '#e83838' : yy > r ? '#f8f8f8' : '#282028';
      if (d > r - 1.2) col = '#282028';
      if (d < 2.2) col = d < 1.3 ? '#f8f8f8' : '#282028';
      px(x + xx, y + yy, col);
    }
  }
}

/** 每帧画的海浪 */
export function drawSea(ctx: CanvasRenderingContext2D, t: number, x0: number, x1: number) {
  for (let y = SEA_Y + 6; y < TOWN_H; y += 12) {
    const off = Math.floor(t * 6 + y) % 24;
    for (let x = Math.floor(x0 / 24) * 24 - 24; x < x1 + 24; x += 24) {
      ctx.fillStyle = '#68a8f0';
      ctx.fillRect(x + off, y, 8, 1);
      ctx.fillStyle = '#a8d0f8';
      ctx.fillRect(x + off + 2, y - 1, 4, 1);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  const foam = Math.floor(t * 2) % 2;
  for (let x = Math.floor(x0 / 16) * 16; x < x1; x += 16) ctx.fillRect(x + foam * 6, SEA_Y, 6, 1);
}
