/**
 * 局部属性场地的画面：每块场地按格子铺一层贴图（熔岩、毒雾、阵雨、草丛、晶石、气流、空地、寒霜），
 * 边界用一圈像素线标出来，再按种类叠加动画（冒泡、飘雾、落雨、飘雪、上升的风……），动画只画在场地的轮廓里面。
 * 还在预告的场地只闪烁边框和淡淡的底色；生效的一瞬间闪一下白光。
 */
import { FIELDS, FIELD_CELL, type FieldId } from '../../shared/fields';
import { Rng } from '../../shared/rng';
import { pxCircle, pxRing, twinkle } from './fx';
import { tallGrass, type Px } from './tiles';
import { drawShape } from './vfx';

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
  /** 包围盒（世界坐标） */
  x0: number;
  y0: number;
  w: number;
  h: number;
  layer: HTMLCanvasElement;
  edge: HTMLCanvasElement;
  clip: Path2D;
  /** 动画落点：场地里的格子中心（打乱后的固定顺序） */
  spots: [number, number][];
}

interface Look {
  /** 一个格子的贴图 */
  tile(px: Px, x: number, y: number, r: Rng, cell: number): void;
  /** 边框：外圈、内圈的颜色 */
  edge: [string, string];
}

const LOOKS: Record<FieldId, Look> = {
  lava: {
    edge: ['#2a0c04', '#ffb040'],
    tile(px, x, y, r) {
      px(x, y, '#c43a12', T, T);
      for (let i = 0; i < 3; i++) {
        const a = r.int(0, 12), b = r.int(0, 14);
        px(x + a, y + b, '#ff7a24', r.int(2, 4), 2);
        px(x + a + 1, y + b, '#ffc03a', 1, 1);
      }
      if (r.chance(0.55)) {
        const a = r.int(0, 9), b = r.int(0, 10), w = r.int(4, 7), h = r.int(3, 5);
        px(x + a, y + b, '#3a1208', w, h);
        px(x + a + 1, y + b, '#5e2410', w - 2, 1);
        px(x + a, y + b + h, 'rgba(0,0,0,.25)', w, 1);
      }
    },
  },
  smog: {
    edge: ['#c070f0', 'rgba(200,120,255,.35)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(60,16,90,.42)', T, T);
      if (r.chance(0.5)) px(x + r.int(0, 8), y + r.int(0, 8), 'rgba(30,6,50,.35)', r.int(4, 8), r.int(3, 6));
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), 'rgba(210,140,255,.55)');
    },
  },
  rain: {
    edge: ['#6ab0ff', 'rgba(200,230,255,.45)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(24,54,110,.34)', T, T);
      if (r.chance(0.3)) {
        const a = r.int(0, 8), b = r.int(2, 12), w = r.int(5, 8);
        px(x + a, y + b, 'rgba(120,180,255,.45)', w, 3);
        px(x + a + 1, y + b, 'rgba(225,242,255,.65)', 2, 1);
      }
    },
  },
  grass: {
    edge: ['#123e10', '#78e060'],
    tile(px, x, y, r) {
      tallGrass(px, x, y, ['#1a5a18', '#2c8a26', '#58c444']);
      if (r.chance(0.12)) { const a = r.int(2, 12), b = r.int(2, 12); px(a + x, b + y, '#f8f0a0'); px(a + x + 1, b + y + 1, '#f8f0a0'); }
    },
  },
  crystal: {
    edge: ['#ff8ad8', 'rgba(255,200,240,.5)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(255,110,210,.16)', T, T);
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), 'rgba(255,205,240,.75)');
      if (r.chance(0.15)) { const a = r.int(1, 12), b = r.int(1, 11); px(x + a, y + b, '#c050a8', 2, 3); px(x + a, y + b, '#ffd0f0', 1, 1); }
    },
  },
  updraft: {
    edge: ['#a8e4ff', 'rgba(240,252,255,.5)'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(170,225,255,.24)', T, T);
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
      if (r.chance(0.35)) { const a = r.int(1, 13), b = r.int(1, 13); px(x + a, y + b, '#9c8050', 2, 2); px(x + a, y + b, '#e8d6a8', 1, 1); }
    },
  },
  frost: {
    edge: ['#5a9ed0', '#ffffff'],
    tile(px, x, y, r) {
      px(x, y, 'rgba(214,242,255,.86)', T, T);
      px(x + r.int(0, 10), y + r.int(0, 15), '#9fd4f0', r.int(3, 6), 1);
      px(x + r.int(0, 15), y + r.int(0, 10), '#9fd4f0', 1, r.int(2, 4));
      for (let i = 0; i < 2; i++) px(x + r.int(0, 15), y + r.int(0, 15), '#ffffff');
    },
  },
};

function canvas(w: number, h: number): [HTMLCanvasElement, Px] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  return [c, (px, py, col, ww = 1, hh = 1) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); }];
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
  const [layer, px] = canvas(w, h);
  const [edge, ex] = canvas(w, h);
  const clip = new Path2D();
  const inside = (gx: number, gy: number) => gx >= 0 && gx < cols && set.has(gy * cols + gx);
  for (const c of cells) {
    const gx = c % cols, gy = Math.floor(c / cols);
    const x = gx * T - x0, y = gy * T - y0;
    L.tile(px, x, y, new Rng(c * 7919 + id), c);
    clip.rect(gx * T, gy * T, T, T);
    const [o, i] = L.edge;
    if (!inside(gx, gy - 1)) { ex(x, y, o, T, 1); ex(x, y + 1, i, T, 1); }
    if (!inside(gx, gy + 1)) { ex(x, y + T - 1, o, T, 1); ex(x, y + T - 2, i, T, 1); }
    if (!inside(gx - 1, gy)) { ex(x, y, o, 1, T); ex(x + 1, y, i, 1, T); }
    if (!inside(gx + 1, gy)) { ex(x + T - 1, y, o, 1, T); ex(x + T - 2, y, i, 1, T); }
  }
  const spots = new Rng(id * 31 + 7).shuffle(cells.map((c) => [(c % cols) * T + T / 2, Math.floor(c / cols) * T + T / 2] as [number, number]));
  return { id, kind, cells, set, cols, cx, cy, activeAt, born, x0, y0, w, h, layer, edge, clip, spots };
}

/** 世界坐标 (x, y) 在不在这块场地里 */
export function inField(f: FieldVis, x: number, y: number) {
  const gx = Math.floor(x / T), gy = Math.floor(y / T);
  return gx >= 0 && gx < f.cols && f.set.has(gy * f.cols + gx);
}

export interface ViewRect { x0: number; y0: number; x1: number; y1: number }
const visible = (f: FieldVis, v: ViewRect) => f.x0 < v.x1 && f.x0 + f.w > v.x0 && f.y0 < v.y1 && f.y0 + f.h > v.y0;
const frac = (v: number) => v - Math.floor(v);
const hash = (i: number, k: number) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);

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
  const n = Math.min(36, Math.ceil(f.cells.length / 8));
  const S = f.spots;
  ctx.save();
  ctx.clip(f.clip);
  switch (f.kind) {
    case 'lava':
      for (let i = 0; i < n; i++) {
        const [x, y] = S[i % S.length];
        const ph = frac(t * 0.7 + i * 0.618);
        const bx = x + (hash(i, 1) - 0.5) * 10, by = y + (hash(i, 2) - 0.5) * 10;
        if (ph < 0.7) { pxCircle(ctx, bx, by, 1 + (ph / 0.7) * 2, '#ffb030'); ctx.fillStyle = '#fff0a0'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 1, 1); }
        else { ctx.globalAlpha = 1 - (ph - 0.7) / 0.3; pxRing(ctx, bx, by, 3 + (ph - 0.7) * 14, '#ffd060', 1, 0.7, 2); ctx.globalAlpha = 1; }
      }
      break;
    case 'rain':
      for (let i = 0; i < n; i++) {
        const [x, y] = S[(i * 3) % S.length];
        const ph = frac(t * 1.2 + i * 0.37);
        ctx.globalAlpha = 0.7 * (1 - ph);
        pxRing(ctx, x + (hash(i, 3) - 0.5) * 10, y + (hash(i, 4) - 0.5) * 10, 1 + ph * 5, '#d8ecff', 1, 0.5, 2);
      }
      ctx.globalAlpha = 1;
      break;
    case 'grass':
      for (let i = 0; i < n; i++) {
        const [x, y] = S[i % S.length];
        if (frac(t * 1.3 + i * 0.37) > 0.35) continue;
        ctx.fillStyle = '#a8f088';
        const bx = Math.round(x + (hash(i, 5) - 0.5) * 12), by = Math.round(y + (hash(i, 6) - 0.5) * 12);
        ctx.fillRect(bx, by, 1, 2);
        ctx.fillRect(bx + 2, by + 1, 1, 2);
      }
      break;
    case 'crystal':
      for (let j = 0; j < 3; j++) {
        const r = frac(t * 0.35 + j / 3) * 150;
        ctx.globalAlpha = 0.55 * (1 - r / 150);
        pxRing(ctx, f.cx, f.cy, r, '#ffa0e8', 1, 0.75, 3);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < n; i++) {
        const [x, y] = S[i % S.length];
        const ph = frac(t * 0.6 + i * 0.29) * 1.6;
        if (ph < 1) twinkle(ctx, x + (hash(i, 7) - 0.5) * 12, y + (hash(i, 8) - 0.5) * 12, ph);
      }
      break;
    case 'frost':
      for (let i = 0; i < n; i++) {
        const [x, y] = S[i % S.length];
        const ph = frac(t * 0.5 + i * 0.41) * 2;
        if (ph < 1) twinkle(ctx, x + (hash(i, 9) - 0.5) * 12, y + (hash(i, 10) - 0.5) * 12, ph);
      }
      break;
    case 'clearing':
    case 'smog':
    case 'updraft':
      break;
  }
  ctx.restore();
  // 生效的一瞬间闪一下
  const k = t - f.activeAt;
  if (k < 0.5) {
    ctx.save();
    ctx.clip(f.clip);
    ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - k / 0.5)})`;
    ctx.fillRect(f.x0, f.y0, f.w, f.h);
    ctx.restore();
  }
  ctx.globalAlpha = 0.9;
  ctx.drawImage(f.edge, f.x0, f.y0);
  ctx.globalAlpha = 1;
}

/** 空中层（画在宝可梦上面，半透明）：熔岩的火星、毒雾、雨、上升的风、尘土、雪 */
export function drawFieldAir(ctx: CanvasRenderingContext2D, f: FieldVis, t: number, v: ViewRect) {
  if (t < f.activeAt || !visible(f, v)) return;
  const n = Math.min(48, Math.ceil(f.cells.length / 6));
  const S = f.spots;
  ctx.save();
  ctx.clip(f.clip);
  switch (f.kind) {
    case 'lava':
      for (let i = 0; i < n / 2; i++) {
        const [x, y] = S[(i * 5) % S.length];
        const ph = frac(t * 0.45 + i * 0.53);
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = ph < 0.5 ? '#ffd060' : '#ff7a24';
        ctx.fillRect(Math.round(x + Math.sin(t * 2 + i) * 3), Math.round(y - ph * 22), 1, 1);
      }
      break;
    case 'smog':
      for (let i = 0; i < n / 2; i++) {
        const px = f.x0 + frac(hash(i, 11) + t * 0.012 * (i % 2 ? 1 : -1)) * f.w;
        const py = f.y0 + frac(hash(i, 12) + Math.sin(t * 0.3 + i) * 0.02) * f.h;
        ctx.globalAlpha = 0.22;
        pxCircle(ctx, px, py, 7 + (i % 4) * 2, '#7a3aa8');
        ctx.globalAlpha = 0.16;
        pxCircle(ctx, px + 6, py - 3, 5 + (i % 3) * 2, '#b878e0');
      }
      break;
    case 'rain':
      ctx.fillStyle = 'rgba(214,236,255,.6)';
      for (let i = 0; i < Math.min(140, f.cells.length / 2); i++) {
        const py = f.y0 + frac(hash(i, 13) + t * 1.1) * (f.h + 24) - 12;
        const px = f.x0 + frac(hash(i, 14) - t * 0.05) * f.w;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 4);
      }
      break;
    case 'grass':
      for (let i = 0; i < n / 6; i++) {
        const [x, y] = S[(i * 7) % S.length];
        const ph = frac(t * 0.25 + i * 0.41);
        drawShape(ctx, 'leaf', 'grass', x + Math.sin(t * 1.5 + i) * 8, y - ph * 18, { frame: 0, alpha: 0.8 * (1 - ph), angle: t * 2 + i });
      }
      break;
    case 'updraft':
      ctx.fillStyle = 'rgba(240,252,255,.55)';
      for (let i = 0; i < n; i++) {
        const px = f.x0 + hash(i, 15) * f.w;
        const py = f.y0 + f.h - frac(hash(i, 16) + t * 0.9) * (f.h + 12);
        ctx.fillRect(Math.round(px + Math.sin(t * 3 + i) * 2), Math.round(py), 1, 5);
      }
      for (let i = 0; i < n / 8; i++) {
        const [x, y] = S[(i * 11) % S.length];
        const ph = frac(t * 0.4 + i * 0.37);
        drawShape(ctx, 'wind', 'flying', x, y - ph * 24, { frame: Math.floor(t * 6 + i), alpha: 0.5 * (1 - ph) });
      }
      break;
    case 'clearing':
      ctx.fillStyle = 'rgba(236,216,164,.7)';
      for (let i = 0; i < n / 2; i++) {
        const px = f.x0 + frac(hash(i, 17) + t * 0.02) * f.w;
        const py = f.y0 + frac(hash(i, 18) + Math.sin(t * 0.7 + i) * 0.01) * f.h;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
      break;
    case 'frost':
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const px = f.x0 + frac(hash(i, 19) + Math.sin(t * 0.8 + i) * 0.01) * f.w;
        const py = f.y0 + frac(hash(i, 20) + t * 0.12) * (f.h + 8) - 4;
        const X = Math.round(px), Y = Math.round(py);
        ctx.fillRect(X, Y, 1, 1);
        if (i % 3 === 0) { ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); }
      }
      break;
    case 'crystal':
      break;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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
  if (!crystalArt) {
    const [c, px] = canvas(CRYSTAL[0].length, CRYSTAL.length);
    CRYSTAL.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (CRYSTAL_COL[row[x]]) px(x, y, CRYSTAL_COL[row[x]]); });
    crystalArt = c;
  }
  const on = t >= f.activeAt;
  const x = Math.round(f.cx), y = Math.round(f.cy);
  ctx.globalAlpha = on ? 0.3 + 0.15 * Math.sin(t * 3) : 0.2;
  pxCircle(ctx, x, y - 2, 9, '#ff9ae0');
  ctx.globalAlpha = on ? 1 : 0.5;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x - 6, y, 13, 2);
  const bob = on ? Math.round(Math.sin(t * 2) * 1) : 0;
  ctx.drawImage(crystalArt, x - (crystalArt.width >> 1), y - crystalArt.height + 1 + bob);
  if (on && frac(t * 0.5) < 0.6) twinkle(ctx, x + 2, y - crystalArt.height + 4 + bob, frac(t * 0.5) / 0.6);
  ctx.globalAlpha = 1;
}

/** 场地的名字：预告时一闪一闪，生效后再显示几秒就淡出 */
export function drawFieldName(ctx: CanvasRenderingContext2D, f: FieldVis, t: number) {
  const F = FIELDS[f.kind];
  const on = t >= f.activeAt;
  const k = t - f.activeAt;
  const a = !on ? (Math.floor(t * 4) % 2 ? 1 : 0.5) : k < 3 ? 1 : Math.max(0, 1 - (k - 3) / 0.8);
  if (a <= 0) return;
  const text = on ? F.name : `${F.name}·即将出现`;
  const x = Math.round(f.cx), y = Math.round(f.cy - (f.kind === 'crystal' ? 24 : 6));
  ctx.globalAlpha = a;
  ctx.font = '10px FusionPixel, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#101018';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = F.color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}
