/**
 * 局部属性场地的画面：每块场地按格子铺一层贴图，边界用一圈像素线标出来，再按种类叠加动画，动画只画在场地的轮廓里面。
 * 熔岩池和寒霜区域按"液面"来画：到边界的距离决定颜色，从外到里是岸边、泡沫、浅处、深处，边角是圆的
 * （画法参考 pokesurvivor 的 paintLiquid）。火苗、熔岩喷柱、毒泡、毒云、落雷、嫩芽、共鸣波、旋风、冰刺、寒气这些动画帧
 * 取自 PokéRogue 的战斗动画图（tools/import-field-fx.mjs 导入，见 fieldFxMeta.ts），烟雾、暴风雪、狂风、沙尘是平铺滚动的纹理。
 * 还在预告的场地只闪烁边框和淡淡的底色；生效的一瞬间闪一下白光。
 */
import { FIELDS, FIELD_CELL, type FieldId } from '../../shared/fields';
import { Rng } from '../../shared/rng';
import { FIELD_FX, type FxName, type FxTexture } from './fieldFxMeta';
import { pxCircle, pxRing, twinkle } from './fx';
import { tallGrass, type Px } from './tiles';

const T = FIELD_CELL;

export interface FieldVis {
  id: number;
  kind: FieldId;
  cells: number[];
  set: Set<number>;
  cols: number;
  cx: number;
  cy: number;
  /** 本地时间（秒）：从这时起生效；born 是出现的时间 */
  activeAt: number;
  born: number;
  /** 特性生成的场地：不在中间写名字（宝可梦头上已经飘过字了） */
  byAbility?: boolean;
  /** 包围盒（世界坐标） */
  x0: number;
  y0: number;
  w: number;
  h: number;
  layer: HTMLCanvasElement;
  /** 熔岩的第二帧液面：和第一帧交替淡入淡出，看起来在流动 */
  layer2: HTMLCanvasElement | null;
  edge: HTMLCanvasElement;
  clip: Path2D;
  /** 动画落点：场地里的格子中心（打乱后的固定顺序） */
  spots: [number, number][];
  /** 阵雨里的水洼（中心、半径），涟漪画在这里 */
  pools: [number, number, number, number][];
  /** 地上的点缀（空地的石子、寒霜的冰晶、草丛的小苗）：[动画, 帧, x, y, 是否镜像] */
  deco: [FxName, number, number, number, boolean][];
  /** 旋风、尘卷沿着走的路线（只在场地里一格一格地走） */
  walks: [number, number][][];
}

// ---------------------------------------------------------------- 素材

const images = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement | null {
  let img = images.get(file);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}fx/${file}`;
    images.set(file, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
const atlas = () => image('fields.png');

/**
 * 画一帧特效：(x, y) 是这段动画的锚点（中心或底边中点），s 是缩放（素材按 2 倍像素画，0.5 正好对上地图的像素）
 * flipY 以锚点为轴上下翻转（共鸣波的上半圆翻出下半圆）。
 */
function sprite(ctx: CanvasRenderingContext2D, name: FxName, frame: number, x: number, y: number, s = 0.5, alpha = 1, flipX = false, flipY = false) {
  const A = atlas();
  if (!A || alpha <= 0) return;
  const fr = FIELD_FX[name];
  const [sx, sy, w, h, ox, oy] = fr[Math.max(0, Math.min(fr.length - 1, Math.floor(frame)))];
  const dw = w * s, dh = h * s;
  const dx = flipX ? x - ox * s - dw : x + ox * s, dy = flipY ? y - oy * s - dh : y + oy * s;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  if (flipX || flipY) {
    ctx.save();
    ctx.translate(Math.round(dx + (flipX ? dw : 0)), Math.round(dy + (flipY ? dh : 0)));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(A, sx, sy, w, h, 0, 0, dw, dh);
    ctx.restore();
  } else ctx.drawImage(A, sx, sy, w, h, Math.round(dx), Math.round(dy), dw, dh);
  ctx.globalAlpha = prev;
}

/** 按进度 k（0~1）播放一段动画 */
function play(ctx: CanvasRenderingContext2D, name: FxName, k: number, x: number, y: number, s = 0.5, alpha = 1, flipX = false) {
  sprite(ctx, name, Math.min(FIELD_FX[name].length - 1, Math.floor(k * FIELD_FX[name].length)), x, y, s, alpha, flipX);
}

/** 上了色的纹理（白色蒙版 + 颜色；color 为空就用原图的颜色），平铺用 */
const patterns = new Map<string, CanvasPattern>();
function pattern(ctx: CanvasRenderingContext2D, name: FxTexture, color: string): CanvasPattern | null {
  const key = `${name}|${color}`;
  const hit = patterns.get(key);
  if (hit) return hit;
  const img = image(`${name}.png`);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  if (color) {
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
  }
  const p = ctx.createPattern(c, 'repeat');
  if (p) patterns.set(key, p);
  return p;
}

/** 在场地的包围盒里铺一层滚动的纹理（调用前已经按场地轮廓裁剪） */
function veil(ctx: CanvasRenderingContext2D, f: FieldVis, name: FxTexture, color: string, alpha: number, ox: number, oy: number) {
  const p = pattern(ctx, name, color);
  if (!p) return;
  p.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p;
  ctx.fillRect(f.x0, f.y0, f.w, f.h);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- 贴图

const frac = (v: number) => v - Math.floor(v);
const hash = (i: number, k: number) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);
/** 像素级的噪声（液面的颗粒和波纹） */
const H = (x: number, y: number, k: number) => frac(Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453);
/** 平滑的值噪声：每 s 像素一个格点，0~1（液面深处大片的明暗） */
function vnoise(x: number, y: number, s: number, k: number) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy;
  const a = H(gx, gy, k), b = H(gx + 1, gy, k), c = H(gx, gy + 1, k), d = H(gx + 1, gy + 1, k);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

interface Look {
  /** 一个格子的贴图 */
  tile(px: Px, x: number, y: number, r: Rng, cell: number): void;
  /** 边框：外圈、内圈的颜色 */
  edge: [string, string];
}

/** 液面的颜色：岸边、泡沫、浅处、中间、深处、最深处、波纹、亮点；waves 波纹的密度 */
interface Liquid { shore: string; foam: string; light: string; mid: string; deep: string; dark: string; wave: string; glint: string; waves: number }

const LIQUIDS: Partial<Record<FieldId, Liquid>> = {
  lava: { shore: '#2a0c04', foam: '#ffd060', light: '#ff8c2a', mid: '#e8561c', deep: '#c0360e', dark: '#8c200a', wave: '#ffb040', glint: '#fff0a0', waves: 0.022 },
  frost: { shore: '#5a8ebc', foam: '#ffffff', light: '#e6f7ff', mid: '#c8eafa', deep: '#b2def4', dark: '#9ccdee', wave: '#f4fcff', glint: '#ffffff', waves: 0.03 },
};

const LOOKS: Record<FieldId, Look> = {
  lava: {
    edge: ['#1a0602', '#ff9a30'],
    tile() {},
  },
  smog: {
    edge: ['#c070f0', 'rgba(200,120,255,.35)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(84,20,118,.5)', T, T);
      if (r.chance(0.5)) px(x + r.int(0, 8), y + r.int(0, 8), 'rgba(30,6,50,.38)', r.int(4, 8), r.int(3, 6));
      if (r.chance(0.18)) {
        const a = r.int(1, 9), b = r.int(2, 11), w = r.int(4, 6);
        px(x + a, y + b, 'rgba(150,40,190,.7)', w, 3);
        px(x + a + 1, y + b, 'rgba(230,140,255,.8)', w - 2, 1);
      }
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), 'rgba(210,140,255,.55)');
    },
  },
  rain: {
    edge: ['#6ab0ff', 'rgba(200,230,255,.45)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(16,44,110,.44)', T, T);
      if (r.chance(0.5)) px(x + r.int(0, 10), y + r.int(0, 12), 'rgba(10,26,70,.25)', r.int(3, 6), r.int(2, 4));
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), 'rgba(180,215,255,.35)');
    },
  },
  grass: {
    edge: ['#123e10', '#78e060'],
    tile(px, x, y, r) {
      tallGrass(px, x, y, ['#1a5a18', '#2c8a26', '#58c444']);
      if (r.chance(0.12)) { const a = r.int(2, 12), b = r.int(2, 12); px(a + x, b + y, '#f8f0a0'); px(a + x + 1, b + y + 1, '#f8f0a0'); }
      if (r.chance(0.07)) { const a = r.int(2, 12), b = r.int(2, 12); px(a + x, b + y, '#ff9ad0'); px(a + x - 1, b + y, '#ffd0e8'); px(a + x + 1, b + y, '#ffd0e8'); px(a + x, b + y - 1, '#ffd0e8'); }
    },
  },
  crystal: {
    edge: ['#ff8ad8', 'rgba(255,200,240,.5)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(255,96,214,.2)', T, T);
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), 'rgba(255,205,240,.75)');
      if (r.chance(0.18)) { const a = r.int(1, 12), b = r.int(1, 11); px(x + a, y + b, '#c050a8', 2, 3); px(x + a, y + b, '#ffd0f0', 1, 1); px(x + a + 1, y + b + 3, 'rgba(0,0,0,.2)', 2, 1); }
    },
  },
  updraft: {
    edge: ['#a8e4ff', 'rgba(240,252,255,.5)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(170,225,255,.26)', T, T);
      if (r.chance(0.45)) {
        const a = r.int(0, 8), b = r.int(3, 14), c = 'rgba(240,252,255,.55)';
        px(x + a, y + b, c, 4, 1); px(x + a + 4, y + b - 1, c, 2, 1); px(x + a + 6, y + b - 2, c, 1, 1);
      }
    },
  },
  clearing: {
    edge: ['#8c6c34', '#ecd8a4'],
    tile(px, x, y, r, cell) {
      px(x, y, cell % 2 ? '#d6bb7e' : '#cfb375', T, T);
      for (let i = 0; i < 4; i++) px(x + r.int(0, 15), y + r.int(0, 15), '#b89a5c');
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), '#ead6a0');
      if (r.chance(0.2)) {
        // 地上的裂纹
        let a = r.int(2, 12), b = r.int(2, 12);
        for (let k = 0; k < 4; k++) { px(x + a, y + b, '#a08048'); a = Math.max(0, Math.min(15, a + r.int(-1, 1))); b = Math.min(15, b + 1); }
      }
    },
  },
  frost: {
    edge: ['#3e78a8', '#ffffff'],
    tile() {},
  },
};

function canvas(w: number, h: number): [HTMLCanvasElement, Px, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  return [c, (px, py, col, ww = 1, hh = 1) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); }, x];
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * 液面：每个像素按到场地边界的距离上色（岸边 → 泡沫 → 浅 → 深），外角削圆，内角按到角点的距离算；
 * 深处再按平滑噪声分出大片的明暗。seed 决定波纹和颗粒的位置，flow 把明暗整体挪几个像素（熔岩画两帧交替，看起来在流）。
 */
function paintLiquid(g: CanvasRenderingContext2D, cells: number[], cols: number, x0: number, y0: number, w: number, h: number,
  inside: (gx: number, gy: number) => boolean, L: Liquid, base: number, seed: number, flow: number) {
  const img = g.createImageData(w, h);
  const d = img.data;
  const C = { shore: rgb(L.shore), foam: rgb(L.foam), light: rgb(L.light), mid: rgb(L.mid), deep: rgb(L.deep), dark: rgb(L.dark), wave: rgb(L.wave), glint: rgb(L.glint) };
  const BIG = 99;
  for (const cell of cells) {
    const gx = cell % cols, gy = Math.floor(cell / cols);
    const n = inside(gx, gy - 1), s = inside(gx, gy + 1), we = inside(gx - 1, gy), e = inside(gx + 1, gy);
    const nw = inside(gx - 1, gy - 1), ne = inside(gx + 1, gy - 1), sw = inside(gx - 1, gy + 1), se = inside(gx + 1, gy + 1);
    const ox = gx * T - x0, oy = gy * T - y0;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        if (!n && !we && x + y < 3) continue;
        if (!n && !e && T - 1 - x + y < 3) continue;
        if (!s && !we && x + (T - 1 - y) < 3) continue;
        if (!s && !e && T - 1 - x + (T - 1 - y) < 3) continue;
        let dd = Math.min(n ? BIG : y, s ? BIG : T - 1 - y, we ? BIG : x, e ? BIG : T - 1 - x);
        if (n && we && !nw) dd = Math.min(dd, Math.hypot(x, y) - 0.5);
        if (n && e && !ne) dd = Math.min(dd, Math.hypot(T - 1 - x, y) - 0.5);
        if (s && we && !sw) dd = Math.min(dd, Math.hypot(x, T - 1 - y) - 0.5);
        if (s && e && !se) dd = Math.min(dd, Math.hypot(T - 1 - x, T - 1 - y) - 0.5);
        const wx = gx * T + x, wy = gy * T + y;
        const r = H(wx, wy, seed);
        let col = dd < 1 ? C.shore : dd < 2 ? C.foam : dd < 4 ? C.light : dd < 6 ? (r < 0.5 ? C.mid : C.light) : dd < 8 && r < 0.5 ? C.mid : C.deep;
        if (dd >= 6 && dd < BIG && r < 0.08) col = C.mid;
        if (dd >= 8) {
          const q = vnoise(wx + flow, wy, 22, base) * 0.65 + vnoise(wx + flow * 2, wy + flow, 9, base + 1) * 0.35 + (r - 0.5) * 0.06;
          col = q > 0.7 ? C.light : q > 0.6 ? C.mid : q < 0.34 ? C.dark : C.deep;
        }
        if (dd >= 3 && H(wx >> 2, wy, seed + 33) < L.waves && (wx & 3) !== 3) col = C.wave;
        if (dd >= 3 && H(wx, wy, seed + 34) < 0.004) col = C.glint;
        const o = ((oy + y) * w + ox + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** 熔岩里漂着的黑色岩壳（只放在四周都是熔岩的格子里，不压住岸边）：圆角的一块，边上发红光 */
function lavaCrust(px: Px, x: number, y: number, r: Rng) {
  if (!r.chance(0.16)) return;
  const w = r.int(6, 10), h = r.int(4, 6), a = r.int(1, 15 - w), b = r.int(1, 14 - h);
  for (let j = 0; j < h; j++) {
    const k = j === 0 || j === h - 1 ? 1 : 0;
    px(x + a + k - 1, y + b + j, '#ff8a2a', 1, 1);
    px(x + a + w - k, y + b + j, '#ff8a2a', 1, 1);
    px(x + a + k, y + b + j, j === 0 ? '#6a2a12' : j === h - 1 ? '#240804' : '#3e140a', w - k * 2, 1);
  }
  px(x + a + 1, y + b + h, 'rgba(0,0,0,.25)', w - 2, 1);
  if (r.chance(0.5)) px(x + a + r.int(2, w - 3), y + b + r.int(1, h - 2), '#ff5a1a', 2, 1);
}

/** 寒霜：冰面上的裂纹 */
function iceCrack(px: Px, x: number, y: number, r: Rng) {
  if (!r.chance(0.3)) return;
  let a = r.int(2, 13), b = r.int(2, 13);
  for (let k = 0; k < 5; k++) {
    px(x + a, y + b, '#ffffff');
    px(x + a, y + b + 1, 'rgba(90,150,200,.35)');
    a = Math.max(0, Math.min(15, a + (r.chance(0.5) ? 1 : -1)));
    b = Math.max(0, Math.min(14, b + r.int(-1, 1)));
  }
}

/** 收到 'field' 事件时建好这块场地的贴图、边框和轮廓 */
export function buildField(id: number, kind: FieldId, cells: number[], cols: number, cx: number, cy: number, activeAt: number, born: number): FieldVis {
  const set = new Set(cells);
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const c of cells) {
    const gx = c % cols, gy = Math.floor(c / cols);
    gx0 = Math.min(gx0, gx); gy0 = Math.min(gy0, gy); gx1 = Math.max(gx1, gx); gy1 = Math.max(gy1, gy);
  }
  const x0 = gx0 * T, y0 = gy0 * T, w = (gx1 - gx0 + 1) * T, h = (gy1 - gy0 + 1) * T;
  const L = LOOKS[kind];
  const [layer, px, g] = canvas(w, h);
  const [edge, ex] = canvas(w, h);
  const clip = new Path2D();
  const inside = (gx: number, gy: number) => gx >= 0 && gx < cols && set.has(gy * cols + gx);
  const deep = (gx: number, gy: number) => inside(gx - 1, gy - 1) && inside(gx, gy - 1) && inside(gx + 1, gy - 1) && inside(gx - 1, gy)
    && inside(gx + 1, gy) && inside(gx - 1, gy + 1) && inside(gx, gy + 1) && inside(gx + 1, gy + 1);
  const liquid = LIQUIDS[kind];
  let layer2: HTMLCanvasElement | null = null;
  if (liquid) {
    paintLiquid(g, cells, cols, x0, y0, w, h, inside, liquid, id * 5, id * 3 + 1, 0);
    if (kind === 'lava') {
      const [c2, px2, g2] = canvas(w, h);
      paintLiquid(g2, cells, cols, x0, y0, w, h, inside, liquid, id * 5, id * 3 + 2, 3);
      for (const c of cells) {
        const gx = c % cols, gy = Math.floor(c / cols);
        if (!deep(gx, gy)) continue;
        lavaCrust(px, gx * T - x0, gy * T - y0, new Rng(c * 7919 + id));
        lavaCrust(px2, gx * T - x0, gy * T - y0, new Rng(c * 7919 + id));
      }
      layer2 = c2;
    } else {
      for (const c of cells) {
        const gx = c % cols, gy = Math.floor(c / cols);
        if (deep(gx, gy)) iceCrack(px, gx * T - x0, gy * T - y0, new Rng(c * 7919 + id));
      }
    }
  }
  for (const c of cells) {
    const gx = c % cols, gy = Math.floor(c / cols);
    const x = gx * T - x0, y = gy * T - y0;
    if (!liquid) L.tile(px, x, y, new Rng(c * 7919 + id), c);
    clip.rect(gx * T, gy * T, T, T);
    const [o, i] = L.edge;
    if (!inside(gx, gy - 1)) { ex(x, y, o, T, 1); ex(x, y + 1, i, T, 1); }
    if (!inside(gx, gy + 1)) { ex(x, y + T - 1, o, T, 1); ex(x, y + T - 2, i, T, 1); }
    if (!inside(gx - 1, gy)) { ex(x, y, o, 1, T); ex(x + 1, y, i, 1, T); }
    if (!inside(gx + 1, gy)) { ex(x + T - 1, y, o, 1, T); ex(x + T - 2, y, i, 1, T); }
  }
  const spots = new Rng(id * 31 + 7).shuffle(cells.map((c) => [(c % cols) * T + T / 2, Math.floor(c / cols) * T + T / 2] as [number, number]));
  // 阵雨的水洼：挑几个四周都在场地里的格子，画一摊扁扁的水
  const pools: [number, number, number, number][] = [];
  if (kind === 'rain') {
    const r = new Rng(id * 17 + 3);
    for (const c of cells) {
      const gx = c % cols, gy = Math.floor(c / cols);
      if (!deep(gx, gy) || !r.chance(0.09)) continue;
      const pcx = gx * T + T / 2 + r.int(-3, 3), pcy = gy * T + T / 2 + r.int(-3, 3), rx = r.int(7, 12), ry = r.int(4, 6);
      pools.push([pcx, pcy, rx, ry]);
      for (let yy = -ry; yy <= ry; yy++) {
        for (let xx = -rx; xx <= rx; xx++) {
          const q = (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry);
          if (q > 1) continue;
          const col = q > 0.72 ? 'rgba(120,175,240,.55)' : yy < -ry / 2 && q > 0.3 ? 'rgba(200,230,255,.45)' : 'rgba(30,70,140,.55)';
          px(pcx + xx - x0, pcy + yy - y0, col);
        }
      }
    }
  }
  const r = new Rng(id * 101 + 5);
  const deco: FieldVis['deco'] = [];
  const DECO: Partial<Record<FieldId, [FxName, number, number, number]>> = {
    // 动画、起止帧、每多少格放一个
    clearing: ['pebble', 2, 5, 7],
    frost: ['shard', 0, 3, 12],
    grass: ['sprout', 1, 3, 14],
  };
  const dk = DECO[kind];
  if (dk) {
    for (let i = 0; i < Math.min(48, Math.ceil(cells.length / dk[3])); i++) {
      const [x, y] = spots[(i * 7) % spots.length];
      deco.push([dk[0], r.int(dk[1], dk[2]), x + r.int(-5, 5), y + r.int(-4, 5), r.chance(0.5)]);
    }
  }
  // 旋风（上升气流）和尘卷（空地）的路线：从一个格子出发，每步走到相邻的场地格子
  const walks: [number, number][][] = [];
  if (kind === 'updraft' || kind === 'clearing') {
    for (let i = 0; i < 3; i++) {
      let c = cells[r.int(0, cells.length - 1)];
      const path: [number, number][] = [];
      for (let k = 0; k < 40; k++) {
        path.push([(c % cols) * T + T / 2, Math.floor(c / cols) * T + T / 2]);
        const next = [c - cols, c + cols, c - 1, c + 1].filter((d) => set.has(d) && Math.abs((d % cols) - (c % cols)) <= 1);
        if (next.length) c = next[r.int(0, next.length - 1)];
      }
      walks.push(path);
    }
  }
  return { id, kind, cells, set, cols, cx, cy, activeAt, born, x0, y0, w, h, layer, layer2, edge, clip, spots, pools, deco, walks };
}

/** 沿着路线来回走：每格 0.9 秒，走到头再往回走 */
function walkAt(path: [number, number][], t: number): [number, number] {
  const n = path.length;
  if (n < 2) return path[0];
  const u = (t / 0.9) % (2 * (n - 1));
  const k = u < n - 1 ? u : 2 * (n - 1) - u;
  const i = Math.min(n - 2, Math.floor(k)), f = k - i;
  const [ax, ay] = path[i], [bx, by] = path[Math.min(n - 1, i + 1)];
  const e = f * f * (3 - 2 * f);
  return [ax + (bx - ax) * e, ay + (by - ay) * e];
}

/** 世界坐标 (x, y) 在不在这块场地里 */
export function inField(f: FieldVis, x: number, y: number) {
  const gx = Math.floor(x / T), gy = Math.floor(y / T);
  return gx >= 0 && gx < f.cols && f.set.has(gy * f.cols + gx);
}

export interface ViewRect { x0: number; y0: number; x1: number; y1: number }
const visible = (f: FieldVis, v: ViewRect) => f.x0 < v.x1 && f.x0 + f.w > v.x0 && f.y0 - 48 < v.y1 && f.y0 + f.h > v.y0;

/** 周期 P 秒的循环：返回 [第几轮, 这一轮过了多少秒] */
function cycle(t: number, P: number, off: number): [number, number] {
  const u = t / P + off;
  const c = Math.floor(u);
  return [c, (u - c) * P];
}

/** 第 i 个动画在第 c 轮落在场地的哪个格子（每轮换个地方），带一点格子里的偏移 */
function spot(f: FieldVis, i: number, c: number, jitter = 0.6): [number, number] {
  const S = f.spots;
  const [x, y] = S[Math.floor(hash(i * 13.1 + c * 7.7, 3.7) * S.length) % S.length];
  return [x + (hash(i + c * 3.3, 5.1) - 0.5) * T * jitter, y + (hash(i - c * 1.7, 6.3) - 0.5) * T * jitter];
}

/** 动画数量：按场地大小，有个上限 */
const count = (f: FieldVis, per: number, max: number) => Math.min(max, Math.max(1, Math.ceil(f.cells.length / per)));

/** 阵雨的落雷：每块场地自己的节奏 */
function boltAt(f: FieldVis, t: number): [number, number, number] | null {
  const [c, s] = cycle(t - f.activeAt, 6.5 + hash(f.id, 41) * 3, hash(f.id, 42));
  if (s > 0.7) return null;
  const [x, y] = spot(f, 900, c, 0.3);
  return [x, y, s];
}

/** 地面层：贴图、边框和贴着地面的动画；预告时只闪边框 */
export function drawFieldGround(ctx: CanvasRenderingContext2D, f: FieldVis, t: number, v: ViewRect) {
  if (!visible(f, v)) return;
  const on = t >= f.activeAt;
  if (!on) {
    const blink = Math.floor(t * 4) % 2;
    ctx.globalAlpha = 0.18 + 0.12 * blink;
    ctx.drawImage(f.layer, f.x0, f.y0);
    ctx.globalAlpha = blink ? 1 : 0.45;
    ctx.drawImage(f.edge, f.x0, f.y0);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.drawImage(f.layer, f.x0, f.y0);
  if (f.layer2) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.drawImage(f.layer2, f.x0, f.y0);
    ctx.globalAlpha = 1;
  }
  const S = f.spots;
  ctx.save();
  ctx.clip(f.clip);
  for (const [name, frame, x, y, flip] of f.deco) {
    if (x > v.x0 - 16 && x < v.x1 + 16 && y > v.y0 - 16 && y < v.y1 + 16) sprite(ctx, name, frame, x, y, 0.5, 1, flip);
  }
  switch (f.kind) {
    case 'lava': {
      // 冒泡
      const nb = count(f, 10, 28);
      for (let i = 0; i < nb; i++) {
        const [x, y] = S[i % S.length];
        const ph = frac(t * 0.7 + i * 0.618);
        const bx = x + (hash(i, 1) - 0.5) * 10, by = y + (hash(i, 2) - 0.5) * 10;
        if (ph < 0.7) { pxCircle(ctx, bx, by, 1 + (ph / 0.7) * 2, '#ffb030'); ctx.fillStyle = '#fff0a0'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 1, 1); }
        else { ctx.globalAlpha = 1 - (ph - 0.7) / 0.3; pxRing(ctx, bx, by, 3 + (ph - 0.7) * 14, '#ffd060', 1, 0.7, 2); ctx.globalAlpha = 1; }
      }
      // 窜起来的火苗
      const nf = count(f, 12, 16);
      for (let i = 0; i < nf; i++) {
        const [c, s] = cycle(t, 1.6 + hash(i, 21) * 0.9, hash(i, 22));
        if (s > 0.75) continue;
        const [x, y] = spot(f, i, c);
        play(ctx, 'flame', s / 0.75, x, y + 3, 0.7, 1, hash(i, c) < 0.5);
      }
      break;
    }
    case 'smog': {
      // 鼓起来又破掉的毒泡
      const nb = count(f, 10, 16);
      for (let i = 0; i < nb; i++) {
        const [c, s] = cycle(t, 1.9 + hash(i, 23) * 1.2, hash(i, 24));
        if (s > 0.9) continue;
        const [x, y] = spot(f, i, c);
        play(ctx, 'bubble', s / 0.9, x, y + 4, 0.6, 0.95);
      }
      break;
    }
    case 'rain': {
      // 水洼里的涟漪
      for (let i = 0; i < f.pools.length; i++) {
        const [x, y, rx, ry] = f.pools[i];
        for (let j = 0; j < 2; j++) {
          const ph = frac(t * 0.8 + i * 0.37 + j * 0.5);
          ctx.globalAlpha = 0.7 * (1 - ph);
          pxRing(ctx, x + (hash(i, j + 3) - 0.5) * rx, y + (hash(i, j + 4) - 0.5) * ry, 1 + ph * rx * 0.6, '#d8ecff', 1, ry / rx, 2);
        }
      }
      ctx.globalAlpha = 1;
      // 雨点落地溅起的水花（落下的那一段画在空中层）
      const nd = count(f, 2, 120);
      for (let i = 0; i < nd; i++) {
        const [c, s] = cycle(t, 0.75 + hash(i, 25) * 0.3, hash(i, 26));
        if (s < 0.42 || s > 0.62) continue;
        const [x, y] = spot(f, i, c, 0.9);
        sprite(ctx, 'splash', s < 0.52 ? 0 : 1, x, y, 0.6, 1);
      }
      // 落雷：场地闪一下，地上留一团电火花
      const b = boltAt(f, t);
      if (b) {
        const [x, y, s] = b;
        if (s < 0.25) { ctx.fillStyle = `rgba(230,240,255,${0.35 * (1 - s / 0.25)})`; ctx.fillRect(f.x0, f.y0, f.w, f.h); }
        if (s > 0.15) play(ctx, 'zap', (s - 0.15) / 0.55, x, y, 0.75, 1 - (s - 0.15) / 0.55);
      }
      break;
    }
    case 'grass': {
      // 草叶翻动
      const nr = count(f, 14, 10);
      for (let i = 0; i < nr; i++) {
        const [c, s] = cycle(t, 1.8 + hash(i, 27), hash(i, 28));
        if (s > 0.45) continue;
        const [x, y] = spot(f, i, c);
        play(ctx, 'rustle', s / 0.45, x, y + 4, 0.5, 0.9);
      }
      // 冒出来的嫩芽：长出来、摇一会儿、再隐进草里
      const ns = count(f, 16, 10);
      for (let i = 0; i < ns; i++) {
        const P = 5 + hash(i, 29) * 2;
        const [c, s] = cycle(t, P, hash(i, 30));
        const [x, y] = spot(f, i + 40, c);
        const frame = s < 0.8 ? (s / 0.8) * 5 : 5 + (Math.floor(s * 2.5) % 2);
        const a = s > P - 0.8 ? (P - s) / 0.8 : 1;
        sprite(ctx, 'sprout', frame, x, y + 5, 0.5, a, (i & 1) === 1);
      }
      break;
    }
    case 'crystal': {
      veil(ctx, f, 'psychic', '', 0.3, t * 8, 0);
      for (let j = 0; j < 3; j++) {
        const r = frac(t * 0.35 + j / 3) * 150;
        ctx.globalAlpha = 0.5 * (1 - r / 150);
        pxRing(ctx, f.cx, f.cy, r, '#ffa0e8', 1, 0.75, 3);
      }
      ctx.globalAlpha = 1;
      // 晶石脚下一圈圈的共鸣波
      for (let j = 0; j < 2; j++) {
        const ph = frac(t * 0.55 + j * 0.5);
        const a = ph < 0.7 ? 0.9 : 0.9 * (1 - (ph - 0.7) / 0.3);
        const k = Math.floor(ph * FIELD_FX.arc.length);
        sprite(ctx, 'arc', k, f.cx, f.cy, 1.3, a);
        sprite(ctx, 'arc', k, f.cx, f.cy, 1.3, a * 0.6, false, true);
      }
      // 到处闪的光点
      const ng = count(f, 7, 24);
      for (let i = 0; i < ng; i++) {
        const [c, s] = cycle(t, 1.4 + hash(i, 31) * 0.8, hash(i, 32));
        if (s > 0.6) continue;
        const [x, y] = spot(f, i, c, 0.9);
        play(ctx, 'glint', s / 0.6, x, y, 0.75);
      }
      break;
    }
    case 'updraft':
      veil(ctx, f, 'wind', '#f4fdff', 0.3, 0, -t * 46);
      break;
    case 'clearing': {
      veil(ctx, f, 'sand', '#f4e2b4', 0.16, t * 14, t * 2);
      // 扬起的尘土
      const nd = count(f, 12, 10);
      for (let i = 0; i < nd; i++) {
        const [c, s] = cycle(t, 2.2 + hash(i, 33) * 1.4, hash(i, 34));
        if (s > 0.5) continue;
        const [x, y] = spot(f, i, c);
        play(ctx, 'dust', s / 0.5, x, y + 4, 0.75, 0.9);
      }
      break;
    }
    case 'frost': {
      // 冒出来的冰刺：长出来，立一会儿，缩回去
      const ns = count(f, 14, 12);
      for (let i = 0; i < ns; i++) {
        const P = 4.5 + hash(i, 35) * 2;
        const [c, s] = cycle(t, P, hash(i, 36));
        const [x, y] = spot(f, i, c);
        const n = FIELD_FX.spike.length;
        const k = s < 0.35 ? (s / 0.35) * n : s < P - 1.6 ? n - 1 : s < P - 1.2 ? (1 - (s - (P - 1.6)) / 0.4) * n : -1;
        if (k >= 0) sprite(ctx, 'spike', k, x, y + 4, 0.75);
      }
      // 闪光
      const ng = count(f, 8, 18);
      for (let i = 0; i < ng; i++) {
        const [c, s] = cycle(t, 1.6 + hash(i, 37), hash(i, 38));
        if (s > 0.5) continue;
        const [x, y] = spot(f, i + 70, c, 0.9);
        if (atlas()) sprite(ctx, 'sparkle', s < 0.25 ? 1 : 0, x, y, 0.75, 1 - s / 0.5);
        else twinkle(ctx, x, y, s / 0.5);
      }
      break;
    }
  }
  ctx.restore();
  // 不裁剪：高出地面的东西（熔岩喷柱、落雷）
  if (f.kind === 'lava') {
    const ng = count(f, 100, 4);
    for (let i = 0; i < ng; i++) {
      const [c, s] = cycle(t, 4.2 + hash(i, 39) * 2.5, hash(i, 40));
      if (s > 1.7) continue;
      const [x, y] = spot(f, i + 90, c, 0.3);
      const k = s < 0.9 ? (s / 0.9) * 7 : 7 + (Math.floor(s * 12) % 4);
      sprite(ctx, 'geyser', k, x, y + 4, 0.55, s > 1.35 ? 1 - (s - 1.35) / 0.35 : 1);
    }
  }
  if (f.kind === 'rain') {
    const b = boltAt(f, t);
    if (b && b[2] < 0.3) {
      const [x, y, s] = b;
      sprite(ctx, 'bolt', (s / 0.3) * 4, x, y + 2, 1, 1);
      sprite(ctx, 'bolt', (s / 0.3) * 4 + 1, x + 2, y - 30, 1, 0.8, true);
    }
  }
  // 生效的一瞬间闪一下
  const k = t - f.activeAt;
  if (k < 0.5) {
    ctx.save();
    ctx.clip(f.clip);
    ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - k / 0.5)})`;
    ctx.fillRect(f.x0, f.y0, f.w, f.h);
    ctx.restore();
  }
  // 液面自己有岸边，不用再描边
  if (!LIQUIDS[f.kind]) {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(f.edge, f.x0, f.y0);
    ctx.globalAlpha = 1;
  }
}

/** 空中层（画在宝可梦上面，半透明）：火星与熔岩块、毒云、雨、落叶、光球、旋风、尘卷、寒气与雪 */
export function drawFieldAir(ctx: CanvasRenderingContext2D, f: FieldVis, t: number, v: ViewRect) {
  if (t < f.activeAt || !visible(f, v)) return;
  const n = Math.min(48, Math.ceil(f.cells.length / 6));
  const S = f.spots;
  ctx.save();
  ctx.clip(f.clip);
  switch (f.kind) {
    case 'lava': {
      for (let i = 0; i < n / 2; i++) {
        const [x, y] = S[(i * 5) % S.length];
        const ph = frac(t * 0.45 + i * 0.53);
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = ph < 0.5 ? '#ffd060' : '#ff7a24';
        ctx.fillRect(Math.round(x + Math.sin(t * 2 + i) * 3), Math.round(y - ph * 22), 1, 1);
      }
      ctx.globalAlpha = 1;
      // 喷柱甩出来的熔岩块：抛物线飞出去，落回熔岩里溅一圈
      const ng = count(f, 100, 4);
      for (let i = 0; i < ng; i++) {
        const [c, s] = cycle(t, 4.2 + hash(i, 39) * 2.5, hash(i, 40));
        if (s < 0.6 || s > 1.6) continue;
        const [x, y] = spot(f, i + 90, c, 0.3);
        for (let j = 0; j < 2; j++) {
          const k = (s - 0.6) / 0.8;
          const dx = (j ? 1 : -1) * (14 + hash(c + j, i) * 16), dy = (hash(c - j, i) - 0.5) * 14;
          if (k < 1) sprite(ctx, 'bomb', 4 + (Math.floor(k * 10) % 5), x + dx * k, y - 18 + dy * k + 18 * k - Math.sin(k * Math.PI) * 26, 0.5);
          else { ctx.globalAlpha = 1 - (s - 1.4) / 0.2; pxRing(ctx, x + dx, y + dy, 2 + (s - 1.4) * 20, '#ffd060', 1, 0.6, 2); ctx.globalAlpha = 1; }
        }
      }
      break;
    }
    case 'smog': {
      veil(ctx, f, 'haze', '#b060e0', 0.22, t * 6, Math.sin(t * 0.4) * 6);
      // 飘着的毒云
      const nc = count(f, 18, 10);
      for (let i = 0; i < nc; i++) {
        const px = f.x0 + frac(hash(i, 11) + t * 0.01 * (i % 2 ? 1 : -1)) * f.w;
        const py = f.y0 + frac(hash(i, 12) + Math.sin(t * 0.3 + i) * 0.02) * f.h;
        sprite(ctx, 'cloud', 4 + (Math.floor(t * 2.5 + i * 1.7) % 5), px, py, 0.8, 0.5, i % 3 === 0);
      }
      // 偶尔滴下来的毒液
      const nd = count(f, 30, 6);
      for (let i = 0; i < nd; i++) {
        const [c, s] = cycle(t, 2.6 + hash(i, 43) * 1.5, hash(i, 44));
        if (s > 0.8) continue;
        const [x, y] = spot(f, i + 30, c);
        play(ctx, 'drip', s / 0.8, x, y - 6, 0.5, 0.8);
      }
      break;
    }
    case 'rain': {
      // 头顶的乌云投下的影子
      for (let i = 0; i < count(f, 30, 6); i++) {
        const px = f.x0 + frac(hash(i, 45) + t * 0.015) * f.w, py = f.y0 + hash(i, 46) * f.h;
        ctx.globalAlpha = 0.12;
        pxCircle(ctx, px, py, 18 + (i % 3) * 6, '#06142e');
      }
      ctx.globalAlpha = 1;
      // 远一点的雨丝
      ctx.fillStyle = 'rgba(200,226,255,.5)';
      for (let i = 0; i < Math.min(160, f.cells.length); i++) {
        const k = frac(hash(i, 13) + t * 1.6);
        const px = f.x0 + frac(hash(i, 14) + k * 0.04) * f.w, py = f.y0 + k * (f.h + 30) - 20;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 5);
      }
      // 斜着落下的雨点（和地面层的水花同一个节奏）
      const nd = count(f, 2, 120);
      for (let i = 0; i < nd; i++) {
        const [c, s] = cycle(t, 0.75 + hash(i, 25) * 0.3, hash(i, 26));
        if (s > 0.42) continue;
        const [x, y] = spot(f, i, c, 0.9);
        const k = 1 - s / 0.42;
        sprite(ctx, 'drop', 0, x - k * 16, y - k * 44, 0.75, 0.95);
      }
      break;
    }
    case 'grass': {
      // 飘落的叶子和花瓣
      const nl = count(f, 16, 10);
      for (let i = 0; i < nl; i++) {
        const [x, y] = S[(i * 7) % S.length];
        const ph = frac(t * 0.22 + i * 0.41);
        const name: FxName = i % 4 === 3 ? 'petal' : 'leaf';
        sprite(ctx, name, Math.floor(t * 6 + i) % FIELD_FX[name].length, x + Math.sin(t * 1.5 + i) * 9, y - 22 + ph * 22, 0.65, ph < 0.8 ? 0.95 : 0.95 * (1 - (ph - 0.8) / 0.2));
      }
      break;
    }
    case 'crystal': {
      // 慢慢升起的光球
      const no = count(f, 12, 14);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < no; i++) {
        const [x, y] = S[(i * 5) % S.length];
        const ph = frac(t * 0.18 + i * 0.37);
        sprite(ctx, 'orb', [0, 1, 3][i % 3], x + Math.sin(t + i) * 4, y - ph * 26, 0.6, 0.6 * Math.sin(ph * Math.PI));
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'updraft': {
      ctx.fillStyle = 'rgba(240,252,255,.55)';
      for (let i = 0; i < n; i++) {
        const px = f.x0 + hash(i, 15) * f.w;
        const py = f.y0 + f.h - frac(hash(i, 16) + t * 0.9) * (f.h + 12);
        ctx.fillRect(Math.round(px + Math.sin(t * 3 + i) * 2), Math.round(py), 1, 5);
      }
      // 被卷上天的叶子与气流的白线
      const nl = count(f, 20, 8);
      for (let i = 0; i < nl; i++) {
        const [x, y] = S[(i * 11) % S.length];
        const ph = frac(t * 0.45 + i * 0.37);
        const a = 0.85 * Math.sin(ph * Math.PI);
        if (i % 2) sprite(ctx, 'wisp', i % 4 === 1 ? 0 : 1, x, y - ph * 30, 0.5, a * 0.7);
        else sprite(ctx, 'spin', Math.floor(t * 14 + i) % FIELD_FX.spin.length, x + Math.sin(t * 4 + i) * 6, y - ph * 30, 0.6, a);
      }
      break;
    }
    case 'clearing': {
      ctx.fillStyle = 'rgba(236,216,164,.7)';
      for (let i = 0; i < n / 2; i++) {
        const px = f.x0 + frac(hash(i, 17) + t * 0.02) * f.w;
        const py = f.y0 + frac(hash(i, 18) + Math.sin(t * 0.7 + i) * 0.01) * f.h;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
      break;
    }
    case 'frost': {
      veil(ctx, f, 'blizzard', '#ffffff', 0.22, t * 30, t * 12);
      // 贴着地面飘的寒气
      const np = count(f, 24, 6);
      for (let i = 0; i < np; i++) {
        const px = f.x0 + frac(hash(i, 47) + t * 0.012) * f.w, py = f.y0 + hash(i, 48) * f.h;
        sprite(ctx, 'frost', 5 + (Math.floor(t * 3 + i) % 5), px, py, 0.6, 0.4);
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const px = f.x0 + frac(hash(i, 19) + Math.sin(t * 0.8 + i) * 0.01) * f.w;
        const py = f.y0 + frac(hash(i, 20) + t * 0.12) * (f.h + 8) - 4;
        const X = Math.round(px), Y = Math.round(py);
        ctx.fillRect(X, Y, 1, 1);
        if (i % 3 === 0) { ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); }
      }
      break;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  // 不裁剪：在场地里游走的旋风（上升气流）和尘卷（开阔空地）
  if (f.walks.length) {
    const nw = f.kind === 'updraft' ? count(f, 110, 3) : count(f, 220, 1);
    for (let i = 0; i < nw && i < f.walks.length; i++) {
      const [x, y] = walkAt(f.walks[i], t - f.activeAt + i * 5);
      if (x < v.x0 - 24 || x > v.x1 + 24 || y < v.y0 - 8 || y > v.y1 + 48) continue;
      const k = Math.min(1, (t - f.activeAt) / 0.8);
      if (f.kind === 'updraft') sprite(ctx, 'whirl', k < 1 ? k * 8 : 7 + (Math.floor(t * 12 + i) % 4), x, y + 4, 0.5, 0.62);
      else sprite(ctx, 'gust', 0, x, y + 4, 0.38, 0.4 * k, Math.floor(t * 9 + i) % 2 === 0);
    }
  }
}

const CRYSTAL = [
  '......k.......',
  '.....k3k......',
  '.....k3wk.....',
  '....k332k.....',
  '....k3321k.k..',
  '.k..k3221kk3k.',
  'k3k.k3221k32k.',
  'k32kk3221k321k',
  'k32k33221k321k',
  'k321k3221k21k.',
  '.k21k3221k21k.',
  '.k21k3221k1k..',
  '..k1k3211kk...',
  '..kkkkkkkkk...',
];
const CRYSTAL_COL: Record<string, string> = { k: '#3a1040', '1': '#a03888', '2': '#e060c0', '3': '#ffa8e8', w: '#ffffff' };
let crystalArt: HTMLCanvasElement | null = null;

/** 共鸣晶石中心的晶石（和宝可梦一起按 y 排序画），身下有一圈呼吸的光 */
export function drawCrystal(ctx: CanvasRenderingContext2D, f: FieldVis, t: number) {
  const on = t >= f.activeAt;
  const x = Math.round(f.cx), y = Math.round(f.cy);
  ctx.globalAlpha = on ? 0.3 + 0.15 * Math.sin(t * 3) : 0.2;
  pxCircle(ctx, x, y - 2, 13, '#ff9ae0');
  ctx.globalAlpha = on ? 1 : 0.5;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x - 9, y, 19, 2);
  const bob = on ? Math.round(Math.sin(t * 2) * 1.5) : 0;
  if (atlas()) {
    sprite(ctx, 'gem', 0, x, y + 1 + bob, 0.36, on ? 1 : 0.5);
    if (on) {
      const ph = frac(t * 0.6);
      if (ph < 0.5) sprite(ctx, 'glint', (ph / 0.5) * 6, x + 4, y - 26 + bob, 0.75);
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (!crystalArt) {
    const [c, px] = canvas(CRYSTAL[0].length, CRYSTAL.length);
    CRYSTAL.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (CRYSTAL_COL[row[xx]]) px(xx, yy, CRYSTAL_COL[row[xx]]); });
    crystalArt = c;
  }
  ctx.drawImage(crystalArt, x - (crystalArt.width >> 1), y - crystalArt.height + 1 + bob);
  if (on && frac(t * 0.5) < 0.6) twinkle(ctx, x + 2, y - crystalArt.height + 4 + bob, frac(t * 0.5) / 0.6);
  ctx.globalAlpha = 1;
}

/** 场地的名字：预告时一闪一闪，生效后再显示几秒就淡出 */
export function drawFieldName(ctx: CanvasRenderingContext2D, f: FieldVis, t: number) {
  if (f.byAbility) return;
  const F = FIELDS[f.kind];
  const on = t >= f.activeAt;
  const k = t - f.activeAt;
  const a = !on ? (Math.floor(t * 4) % 2 ? 1 : 0.5) : k < 3 ? 1 : Math.max(0, 1 - (k - 3) / 0.8);
  if (a <= 0) return;
  const text = on ? F.name : `${F.name}·即将出现`;
  const x = Math.round(f.cx), y = Math.round(f.cy - (f.kind === 'crystal' ? 38 : 6));
  ctx.globalAlpha = a;
  ctx.font = '10px FusionPixel, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#101018';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = F.color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}
