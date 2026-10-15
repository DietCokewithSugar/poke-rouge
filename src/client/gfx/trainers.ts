/**
 * 训练家像素形象：按 TrainerLook（发型、帽子、衣服颜色……）程序化画出 16×24 的行走图，
 * 4 个方向 × 3 帧（站立、迈左脚、迈右脚），自动描边，和宝可梦精灵的画风一致。
 */
import { TRAINERS, trainerOf, type TrainerLook } from '../../shared/trainers';
import { grid, type Grid } from './vfx';

export const TW = 16;
export const TH = 24;
/** 方向：0 下 1 左 2 上 3 右 */
export type TDir = 0 | 1 | 2 | 3;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const inEll = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

function head(P: Grid, L: TrainerLook, dir: TDir) {
  const side = dir === 1;
  const cx = side ? 7.2 : 8, cy = 7.2;
  P.fill((x, y) => (inEll(x, y, cx, cy, 4.4, 4.6) ? 's' : null));
  // 头发：正面只盖住额头与两侧，背面整个盖住，侧面盖住后脑
  P.fill((x, y) => {
    if (!inEll(x, y, cx, cy, 4.6, 4.8)) return null;
    if (dir === 2) return y < 11 ? 'h' : null;
    if (dir === 0) return y <= 4 || (y <= 6 && (x <= 4 || x >= 11)) ? 'h' : null;
    return y <= 4 || x >= 8 || (y <= 6 && x >= 6) ? 'h' : null;
  });
  const st = L.hairStyle;
  if (st === 'spiky') {
    const tips = dir === 1 ? [[5, 2], [8, 1.5], [11, 3], [12, 5]] : dir === 2 ? [[4, 3], [6, 1.5], [9, 1.5], [12, 3]] : [[4, 3], [7, 1.5], [10, 2], [12, 4]];
    for (const [tx, ty] of tips) P.fill((x, y) => (Math.abs(x + 0.5 - tx) + (y + 0.5 - ty) * 0.8 < 1.4 && y >= ty - 1 && y <= 4 ? 'h' : null));
  } else if (st === 'long') {
    P.fill((x, y) => {
      if (y < 4 || y > 15) return null;
      if (dir === 0) return (x === 3 || x === 4 || x === 11 || x === 12) && y <= 14 ? 'h' : null;
      if (dir === 2) return x >= 3 && x <= 12 && y <= 15 ? 'h' : null;
      return x >= 7 && x <= 12 && y <= 15 ? 'h' : null;
    });
  } else if (st === 'ponytail') {
    P.fill((x, y) => {
      if (dir === 0) return x >= 12 && x <= 13 && y >= 3 && y <= 9 ? 'h' : null;
      if (dir === 2) return x >= 2 && x <= 3 && y >= 3 && y <= 9 ? 'h' : null;
      return x >= 11 && x <= 13 && y >= 3 && y <= 8 ? 'h' : null;
    });
  } else if (st === 'swept') {
    P.fill((x, y) => (dir !== 2 && y === 5 && x >= (dir === 1 ? 3 : 4) && x <= (dir === 1 ? 7 : 8) ? 'h' : null));
    P.fill((x, y) => (y === 2 && x >= 5 && x <= 11 ? 'h' : null));
  } else if (st === 'slick') {
    // 梳到脑后的背头：侧面和背面的头发更低
    P.fill((x, y) => (dir !== 0 && y >= 9 && y <= 10 && x >= 7 && x <= 11 && inEll(x, y, cx, cy, 4.6, 4.8) ? 'h' : null));
  }
  if (L.cap) {
    P.fill((x, y) => (inEll(x, y, cx, 4.6, 4.8, 3.6) && y <= 4 ? 'c' : null));
    if (dir === 0) {
      P.fill((x, y) => (y >= 2 && y <= 3 && x >= 6 && x <= 9 ? 'C' : null));
      P.fill((x, y) => (y === 5 && x >= 3 && x <= 12 ? 'c' : null));
    } else if (dir === 1) {
      P.fill((x, y) => (y === 5 && x >= 1 && x <= 7 ? 'c' : null));
    } else if (dir === 2) {
      P.fill((x, y) => (y === 5 && x >= 6 && x <= 9 ? 'C' : null));
    }
  }
  // 眼睛
  if (dir === 0) {
    for (const ex of [6, 9]) {
      if (L.squint) P.set(ex, 8, 'e'), P.set(ex + (ex === 6 ? -1 : 1), 8, 'e');
      else { P.set(ex, 7, 'e'); P.set(ex, 8, 'e'); }
    }
  } else if (dir === 1) {
    if (L.squint) { P.set(4, 8, 'e'); P.set(5, 8, 'e'); } else { P.set(4, 7, 'e'); P.set(4, 8, 'e'); }
  }
}

function body(P: Grid, L: TrainerLook, dir: TDir, frame: number) {
  const side = dir === 1;
  // 披风在身体后面
  if (L.cape) {
    P.fill((x, y) => {
      if (y < 12 || y > 21) return null;
      if (dir === 0) return x === 3 || x === 12 ? 'K' : null;
      if (dir === 2) return x >= 3 && x <= 12 ? 'K' : null;
      return x >= 9 && x <= 12 && y <= 20 ? 'K' : null;
    });
  }
  const x0 = side ? 5 : 4, x1 = side ? 10 : 11;
  // 上衣与内衬
  P.fill((x, y) => {
    if (y < 12 || y > 17 || x < x0 || x > x1) return null;
    if (dir === 0 && L.top2 && x >= 7 && x <= 8 && y <= 16) return 'u';
    return x === x1 ? 'T' : 't';
  });
  if (L.mark && dir === 0) for (const [mx, my] of [[7, 13], [8, 13], [7, 14], [8, 15], [7, 15]]) P.set(mx, my, 'r');
  // 手臂随步伐摆动
  const swing = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  if (side) {
    const ax = 7 - swing;
    P.fill((x, y) => (x === ax && y >= 12 && y <= 16 ? (y >= 16 ? 's' : 't') : null));
  } else {
    // 正面/背面：摆到前面的那只手看起来更低
    for (const [ax, s] of [[3, swing], [12, -swing]] as const) {
      P.fill((x, y) => (x === ax && y >= 12 && y <= 16 + Math.max(0, s) ? (y >= 15 + Math.max(0, s) ? 's' : 't') : null));
    }
  }
  // 裤子 / 裙子与鞋
  if (L.skirt) P.fill((x, y) => (y >= 17 && y <= 19 && x >= 3 && x <= 12 ? (x === 12 ? 'P' : 'p') : null));
  const legs: [number, number, number][] = side
    ? frame === 0 ? [[6, 7, 0], [8, 9, 0]] : frame === 1 ? [[4, 6, 0], [9, 10, -1]] : [[9, 11, 0], [5, 6, -1]]
    : [[5, 6, frame === 1 ? -1 : 0], [9, 10, frame === 2 ? -1 : 0]];
  for (const [la, lb, lift] of legs) {
    P.fill((x, y) => {
      if (x < la || x > lb) return null;
      const bottom = 22 + lift;
      if (y >= 18 && y < bottom) return L.skirt && y <= 19 ? null : x === lb ? 'P' : 'p';
      if (y >= bottom && y <= bottom + 1) return 'f';
      return null;
    });
  }
}

const sheetCache = new Map<string, HTMLCanvasElement[]>();

function render(look: TrainerLook, dir: TDir, frame: number): HTMLCanvasElement {
  const P = grid(TW, TH);
  const d: TDir = dir === 3 ? 1 : dir;
  body(P, look, d, frame);
  head(P, look, d);
  P.outline();
  const pal: Record<string, string> = {
    o: '#181020', s: look.skin, e: '#202028', h: look.hair, c: look.cap?.[0] ?? look.hair, C: look.cap?.[1] ?? '#f8f8f8',
    t: look.top, T: shade(look.top, 0.78), u: look.top2, p: look.bottom, P: shade(look.bottom, 0.78), f: look.shoes,
    r: look.mark ?? '#e02828', K: look.cape ?? '#202028',
  };
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const x = c.getContext('2d')!;
  for (let y = 0; y < TH; y++) {
    for (let i = 0; i < TW; i++) {
      const ch = P.g[y][dir === 3 ? TW - 1 - i : i];
      if (!ch) continue;
      x.fillStyle = pal[ch] ?? '#ff00ff';
      x.fillRect(i, y, 1, 1);
    }
  }
  return c;
}

function framesOf(key: string, look: TrainerLook): HTMLCanvasElement[] {
  let s = sheetCache.get(key);
  if (!s) {
    s = [];
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 3; f++) s.push(render(look, dir as TDir, f));
    sheetCache.set(key, s);
  }
  return s;
}

/** 某个训练家的 12 帧行走图：sheet[dir * 3 + frame] */
export function trainerFrames(id: string): HTMLCanvasElement[] {
  const T = trainerOf(id);
  return framesOf(T.id, T.look);
}

/** 镇上的 NPC（大木博士、鲤鱼王推销员） */
export function drawNpc(ctx: CanvasRenderingContext2D, key: string, look: TrainerLook, x: number, y: number, dir: TDir) {
  ctx.drawImage(framesOf(`npc:${key}`, look)[dir * 3], Math.round(x - TW / 2), Math.round(y - (TH - 1)));
}

/** 以脚底 (x, y) 为锚点画训练家 */
export function drawTrainer(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, dir: TDir, frame: number, scale = 1, alpha = 1) {
  const img = trainerFrames(id)[dir * 3 + (frame % 3)];
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(img, Math.round(x - (TW / 2) * scale), Math.round(y - (TH - 1) * scale), TW * scale, TH * scale);
  ctx.globalAlpha = prev;
}

/** 走路动画的帧：站立 → 左脚 → 站立 → 右脚 */
export function walkFrame(t: number, moving: boolean) {
  if (!moving) return 0;
  const k = Math.floor(t * 7) % 4;
  return k === 1 ? 1 : k === 3 ? 2 : 0;
}

/** 屏幕角度 → 训练家方向 */
export function tdirOf(ang: number): TDir {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= (Math.PI * 7) / 4) return 3;
  if (a < (Math.PI * 3) / 4) return 0;
  if (a < (Math.PI * 5) / 4) return 1;
  return 2;
}

/** 界面用的头像：正面站立的上半身，按 scale 放大 */
export function trainerPortrait(id: string, scale = 3, cls = 'tportrait'): HTMLCanvasElement {
  const src = trainerFrames(id)[0];
  const rows = 17;
  const c = document.createElement('canvas');
  c.width = TW * scale;
  c.height = rows * scale;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, TW, rows, 0, 0, TW * scale, rows * scale);
  c.className = cls;
  c.style.setProperty('--pw', `${(TW * scale) / 16}rem`);
  c.style.setProperty('--ph', `${(rows * scale) / 16}rem`);
  return c;
}

/** 全身像（界面里的训练家卡片） */
export function trainerFull(id: string, scale = 3, cls = 'tfull'): HTMLCanvasElement {
  const src = trainerFrames(id)[0];
  const c = document.createElement('canvas');
  c.width = TW * scale;
  c.height = TH * scale;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, TW * scale, TH * scale);
  c.className = cls;
  c.style.setProperty('--pw', `${(TW * scale) / 16}rem`);
  c.style.setProperty('--ph', `${(TH * scale) / 16}rem`);
  return c;
}

export const TRAINER_COUNT = Object.keys(TRAINERS).length;
