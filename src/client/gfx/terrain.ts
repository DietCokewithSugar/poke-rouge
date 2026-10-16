/**
 * 局部属性场地的画法：每种场地一套像素风的地面图案，外圈一道深色描边、里面一道亮边，看得清边界在哪里。
 * 整块场地出现时预先画成一张图，每帧只叠一层明暗变化的发光和少量小动画（只画画面里的）。
 * 全部画在地面层：区域、地面警示圈、敌人、弹幕都画在它上面，不会被挡住。
 */
import { Rng } from '../../shared/rng';
import { TERRAIN_CELL as C, TERRAINS, type Terrain, type TerrainId } from '../../shared/terrain';
import { pxCircle } from './fx';
import type { Px } from './tiles';

/** 小动画的位置：格子里的一个点（cl, ct 为格子左上角），p 为相位，k 为变化 */
interface Spot { x: number; y: number; cl: number; ct: number; p: number; k: number }

interface Look {
  /** 外圈描边、内圈亮边（rgba） */
  edge: [number, number, number, number];
  rim: [number, number, number, number];
  /** 底色和花纹：画一个格子（画出格子的部分会按场地的形状裁掉） */
  tile(px: Px, x: number, y: number, rng: Rng): void;
  /** 不按格子对齐的大花纹，先于 tile 铺满整张图（tile 画的细节叠在上面），ox、oy 为图在世界坐标里的左上角 */
  paint?(d: Uint8ClampedArray, W: number, H: number, ox: number, oy: number, rng: Rng): void;
  /** 这些颜色的像素放进发光层，随时间变亮变暗 */
  glow?: { from: string[]; to: string };
  /** 每个格子放一个小动画的概率 */
  spots: number;
  spot(ctx: CanvasRenderingContext2D, s: Spot, t: number): void;
}

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

/** 一小段随机折线（裂缝） */
function crack(px: Px, rng: Rng, x: number, y: number, n: number, col: string) {
  let cx = x, cy = y;
  const dx = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < n; i++) {
    px(cx, cy, col);
    if (rng.chance(0.6)) cx += dx; else cy += 1;
  }
}

/** 小晶石：w 为宽（奇数），h 为高，(cx, by) 为底部中点 */
function prism(px: Px, cx: number, by: number, w: number, h: number, light: string, mid: string, shade: string) {
  const half = (w - 1) / 2;
  for (let r = 0; r < h; r++) {
    const k = Math.min(r, half);
    for (let d = -k; d <= k; d++) px(cx + d, by - h + r, d < 0 ? light : d === 0 ? mid : shade);
  }
}

const MOLTEN = '#e8541c', MOLTEN2 = '#f47a26';
const CRUST: [number, number, number][] = [[74, 30, 22], [85, 36, 26], [63, 26, 20], [70, 28, 24]];

/**
 * 熔岩：一块块大小不一的岩壳（抖动网格上的点做最近点划分，和格子不对齐），
 * 岩壳之间是发光的岩浆缝，缝边的岩壳颜色亮一点，看起来是烧红的边。
 */
function lavaPlates(d: Uint8ClampedArray, W: number, H: number, ox: number, oy: number, rng: Rng) {
  const S = 22;
  const gx0 = Math.floor(ox / S) - 1, gy0 = Math.floor(oy / S) - 1;
  const gw = Math.ceil(W / S) + 3, gh = Math.ceil(H / S) + 3;
  const sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh), tone = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    sx[k] = (gx0 + i) * S + rng.range(3, S - 3) - ox;
    sy[k] = (gy0 + j) * S + rng.range(3, S - 3) - oy;
    tone[k] = rng.chance(0.04) ? 255 : rng.int(0, CRUST.length - 1);
  }
  const m1 = [232, 84, 28], m2 = [244, 122, 38], hot = [106, 48, 34];
  for (let y = 0; y < H; y++) {
    const cj = Math.floor((y + oy) / S) - gy0;
    for (let x = 0; x < W; x++) {
      const ci = Math.floor((x + ox) / S) - gx0;
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const k = j * gw + i, dd = (sx[k] - x) ** 2 + (sy[k] - y) ** 2;
        if (dd < d1) { d2 = d1; d1 = dd; best = k; } else if (dd < d2) d2 = dd;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const o = (y * W + x) * 4;
      // 偶尔有一整块是翻滚的岩浆，没有结壳
      const c = tone[best] === 255 ? (edge < 2 ? m2 : m1) : edge < 0.9 ? m2 : edge < 1.9 ? m1 : edge < 3.2 ? hot : CRUST[tone[best]];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
}

const LOOKS: Record<TerrainId, Look> = {
  lava: {
    edge: [30, 10, 8, 255], rim: [255, 122, 42, 255],
    tile(px, x, y, rng) {
      // 岩壳上的小坑和裂纹
      for (let i = 0; i < 2; i++) px(x + rng.int(1, 14), y + rng.int(1, 14), '#341410');
      if (rng.chance(0.3)) crack(px, rng, x + rng.int(3, 11), y + rng.int(3, 8), rng.int(2, 4), '#5c2618');
    },
    paint: lavaPlates,
    glow: { from: [MOLTEN, MOLTEN2], to: '#ffd060' },
    spots: 0.3,
    spot(ctx, s, t) {
      // 冒泡、破掉，再飘出一颗火星
      const ph = frac(t / (2 + s.k * 0.45) + s.p);
      if (ph < 0.45) {
        if (ph < 0.2) dot(ctx, s.x, s.y, '#ffb030', 2, 2);
        else { dot(ctx, s.x - 1, s.y, '#ffb030', 4, 2); dot(ctx, s.x, s.y - 1, '#ffb030', 2, 4); dot(ctx, s.x, s.y, '#ffe080', 1, 1); }
      } else if (ph < 0.55) {
        for (const [dx, dy] of [[-2, -2], [3, -2], [-2, 3], [3, 3]]) dot(ctx, s.x + dx, s.y + dy, '#ffe080');
      } else if (ph < 0.85) {
        const rise = Math.min(7, s.y - s.ct - 1);
        dot(ctx, s.x + Math.round(Math.sin(ph * 12)), s.y - ((ph - 0.55) / 0.3) * rise, ph < 0.7 ? '#ffd060' : '#ff8a3c');
      }
    },
  },
  miasma: {
    edge: [52, 14, 84, 245], rim: [196, 120, 248, 225],
    tile(px, x, y, rng) {
      px(x, y, 'rgba(120,22,180,0.62)', C, C);
      if (rng.chance(0.6)) px(x + rng.int(0, 10), y + rng.int(0, 11), 'rgba(44,8,76,0.4)', rng.int(3, 6), rng.int(2, 4));
      if (rng.chance(0.35)) {
        const bx = x + rng.int(3, 12), by = y + rng.int(3, 12);
        px(bx, by, '#8a4ac0', 2, 2);
        px(bx, by, '#c890f8');
      }
      if (rng.chance(0.4)) px(x + rng.int(1, 13), y + rng.int(1, 14), 'rgba(200,150,250,0.35)', 2, 1);
    },
    spots: 0.38,
    spot(ctx, s, t) {
      // 慢慢飘动、时浓时淡的雾团，偶尔冒一个泡
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * (0.14 + 0.1 * Math.sin(t * 1.3 + s.p * TAU));
      pxCircle(ctx, s.cl + 7.5 + Math.sin(t * 0.7 + s.p * 9), s.ct + 7.5 + Math.cos(t * 0.5 + s.p * 5) * 0.8, 4 + (s.k % 2), '#c890f8');
      ctx.globalAlpha = a0;
      const ph = frac(t / 2.6 + s.p);
      if (s.k === 0 && ph < 0.5) dot(ctx, s.x, s.y - ph * 10, ph < 0.4 ? '#d8a8ff' : '#f0d8ff');
    },
  },
  rain: {
    edge: [42, 76, 136, 235], rim: [144, 200, 255, 200],
    tile(px, x, y, rng) {
      px(x, y, 'rgba(56,104,200,0.27)', C, C);
      if (rng.chance(0.5)) px(x + rng.int(1, 11), y + rng.int(1, 14), 'rgba(170,210,255,0.35)', rng.int(2, 4), 1);
      if (rng.chance(0.3)) {
        // 积水
        const bx = x + rng.int(2, 6), by = y + rng.int(4, 10), w = rng.int(5, 8);
        const water = 'rgba(110,160,240,0.55)';
        px(bx, by, water, w, 3);
        px(bx + 1, by - 1, water, w - 2, 1);
        px(bx + 1, by + 3, water, w - 2, 1);
        px(bx + 1, by, 'rgba(225,242,255,0.75)', 2, 1);
      }
    },
    spots: 0.55,
    spot(ctx, s, t) {
      // 落下的雨滴和溅起的水花
      const ph = frac(t / (0.85 + s.k * 0.22) + s.p);
      if (ph < 0.4) {
        dot(ctx, s.x, s.ct + 1 + (s.y - s.ct - 3) * (ph / 0.4), '#e0f0ff', 1, 3);
      } else if (ph < 0.68) {
        const r = 1 + ((ph - 0.4) / 0.28) * 2.5;
        dot(ctx, s.x - r, s.y, '#a8d0ff');
        dot(ctx, s.x + r, s.y, '#a8d0ff');
        dot(ctx, s.x - r * 0.6, s.y - 1, '#cfe6ff');
        dot(ctx, s.x + r * 0.6, s.y - 1, '#cfe6ff');
      }
    },
  },
  thicket: {
    edge: [22, 62, 22, 255], rim: [136, 208, 104, 255],
    tile(px, x, y, rng) {
      px(x, y, '#2a6a26', C, C);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const bx = x + c * 4 + (r % 2), by = y + r * 4;
          px(bx + 1, by, '#5cb048', 1, 2);
          px(bx, by + 1, '#3c8c34', 1, 2);
          px(bx + 2, by + 1, '#3c8c34', 1, 2);
          px(bx + 3, by + 3, '#1d5a1c');
        }
      }
      for (let i = 0; i < 2; i++) px(x + rng.int(1, 14), y + rng.int(0, 13), '#8ad860');
      if (rng.chance(0.08)) {
        const fx = x + rng.int(3, 11), fy = y + rng.int(3, 11);
        px(fx, fy, '#f8f0a0'); px(fx - 1, fy + 1, '#f8f0a0'); px(fx + 1, fy + 1, '#f8f0a0'); px(fx, fy + 1, '#f8c830');
      }
    },
    spots: 0.35,
    spot(ctx, s, t) {
      // 随风摆动的草叶，偶尔飘起一点花粉
      const sw = Math.round(Math.sin(t * 2.4 + s.p * TAU) * 1.2);
      for (const d of [-2, 0, 2]) {
        dot(ctx, s.x + d, s.y - 2, '#4a9c3c', 1, 3);
        dot(ctx, s.x + d + sw, s.y - 4 + Math.abs(d) / 2, '#8ad860');
      }
      const ph = frac(t / 3.4 + s.p);
      if (s.k < 2 && ph < 0.6) dot(ctx, s.x + Math.sin(ph * 9) * 2, s.y - 3 - ph * Math.min(8, s.y - s.ct - 4), '#eef8b0');
    },
  },
  crystal: {
    edge: [74, 48, 96, 255], rim: [255, 184, 240, 255],
    tile(px, x, y, rng) {
      px(x, y, rng.pick(['#9a7cb8', '#8e70ac', '#9474b2']), C, C);
      px(x, y, '#6e5490', C, 1);
      px(x, y, '#6e5490', 1, C);
      px(x + 1, y + 1, '#ae94cc', C - 2, 1);
      for (let i = 0; i < 2; i++) px(x + rng.int(2, 13), y + rng.int(3, 13), '#7e62a0');
      if (rng.chance(0.28)) {
        const cx = x + rng.int(4, 11), by = y + rng.int(9, 14);
        px(cx - 2, by, '#5a4070', 5, 1);
        prism(px, cx, by, 3, rng.int(4, 6), '#ffc8f4', '#ff9ce8', '#c070e0');
      }
    },
    glow: { from: ['#ff9ce8', '#ffc8f4'], to: '#ffffff' },
    spots: 0.22,
    spot(ctx, s, t) {
      // 地上一闪一闪的晶光
      const ph = frac(t / 3 + s.p);
      if (ph > 0.25) return;
      const k = ph < 0.08 || ph > 0.17 ? 0 : 1;
      dot(ctx, s.x, s.y, '#ffffff');
      if (k) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(ctx, s.x + dx, s.y + dy, '#ffd8f8');
    },
  },
  updraft: {
    edge: [84, 120, 168, 255], rim: [255, 255, 255, 235],
    tile(px, x, y, rng) {
      px(x, y, 'rgba(184,222,255,0.42)', C, C);
      if (rng.chance(0.45)) {
        // 小旋涡
        const bx = x + rng.int(3, 9), by = y + rng.int(3, 9);
        for (const [dx, dy] of [[1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 2], [1, 1]]) px(bx + dx, by + dy, 'rgba(255,255,255,0.8)');
        px(bx + 4, by + 1, 'rgba(120,170,230,0.6)', 1, 2);
      }
      if (rng.chance(0.4)) px(x + rng.int(1, 10), y + rng.int(1, 14), 'rgba(255,255,255,0.55)', rng.int(3, 5), 1);
    },
    spots: 0.5,
    spot(ctx, s, t) {
      // 往上飘的白色气流线，偶尔卷起一片叶子
      const ph = frac(t / (1.1 + s.k * 0.3) + s.p);
      const y = s.ct + 14 - ph * 11;
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * Math.min(1, (1 - ph) * 1.4);
      dot(ctx, s.x, y - 3, '#ffffff', 1, 4);
      if (s.k === 0) dot(ctx, Math.min(s.cl + 13, s.x + 2 + Math.sin(ph * 10) * 1.5), y, '#a8e070', 2, 1);
      ctx.globalAlpha = a0;
    },
  },
  clearing: {
    edge: [122, 90, 36, 255], rim: [248, 224, 144, 255],
    tile(px, x, y, rng) {
      px(x, y, rng.pick(['#d4a850', '#cca04c', '#dab058']), C, C);
      for (let i = 0; i < 3; i++) px(x + rng.int(1, 14), y + rng.int(1, 14), '#b8903c');
      for (let i = 0; i < 2; i++) px(x + rng.int(1, 14), y + rng.int(1, 14), '#e8c878');
      if (rng.chance(0.35)) {
        const bx = x + rng.int(2, 11), by = y + rng.int(2, 11);
        px(bx, by, '#a88848', 3, 2);
        px(bx, by, '#f0d890');
        px(bx, by + 2, 'rgba(0,0,0,0.18)', 3, 1);
      }
      if (rng.chance(0.15)) crack(px, rng, x + rng.int(3, 11), y + rng.int(3, 9), rng.int(3, 5), '#a8843c');
    },
    spots: 0.18,
    spot(ctx, s, t) {
      // 风吹起的尘土
      const ph = frac(t / 3.2 + s.p);
      if (ph > 0.7) return;
      dot(ctx, s.cl + 2 + ph * 15, s.y + Math.sin(ph * 14) * 1.5, '#f8ecb8');
      if (s.k === 0) dot(ctx, s.cl + 1 + ph * 13, s.y + 2, '#f0dca0');
    },
  },
  frost: {
    edge: [90, 144, 184, 255], rim: [255, 255, 255, 255],
    tile(px, x, y, rng) {
      px(x, y, rng.pick(['#cfeaf8', '#d8f0ff', '#c4e2f4']), C, C);
      if (rng.chance(0.45)) crack(px, rng, x + rng.int(2, 11), y + rng.int(2, 8), rng.int(4, 7), '#9ccbe8');
      if (rng.chance(0.3)) {
        const bx = x + rng.int(3, 11), by = y + rng.int(4, 13);
        px(bx, by, '#ffffff'); px(bx + 1, by - 1, '#ffffff'); px(bx + 2, by - 2, '#ffffff');
      }
      for (let i = 0; i < 2; i++) px(x + rng.int(1, 14), y + rng.int(1, 14), '#ffffff');
      px(x + rng.int(1, 14), y + rng.int(1, 14), '#b0d8f0');
    },
    spots: 0.3,
    spot(ctx, s, t) {
      // 冰面上的闪光和飘落的雪花
      const ph = frac(t / 2.6 + s.p);
      if (s.k < 2) {
        if (ph < 0.22) {
          dot(ctx, s.x, s.y, '#ffffff');
          if (ph > 0.06 && ph < 0.16) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(ctx, s.x + dx, s.y + dy, '#e8f8ff');
        }
      } else {
        dot(ctx, s.x + Math.sin(ph * 8) * 1.5, s.ct + 1 + ph * 13, '#ffffff');
      }
    },
  },
};

// ---------------------------------------------------------------- 预先画好的场地

interface Art {
  /** 图在世界坐标里的左上角 */
  ox: number;
  oy: number;
  base: HTMLCanvasElement;
  glow: HTMLCanvasElement | null;
  spots: Spot[];
}

const arts = new WeakMap<Terrain, Art>();

function rgb(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function build(t: Terrain): Art {
  const L = LOOKS[t.kind];
  const has = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < t.gw && gy < t.gh && t.cells[gy * t.gw + gx] === 1;
  let x0 = t.gw, y0 = t.gh, x1 = -1, y1 = -1;
  for (let gy = 0; gy < t.gh; gy++) for (let gx = 0; gx < t.gw; gx++) if (has(gx, gy)) {
    x0 = Math.min(x0, gx); y0 = Math.min(y0, gy); x1 = Math.max(x1, gx); y1 = Math.max(y1, gy);
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const ox = x0 * C, oy = y0 * C, W = (x1 - x0 + 1) * C, H = (y1 - y0 + 1) * C;
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const g = base.getContext('2d')!;
  const rng = new Rng(t.cx * 7919 + t.cy * 104729 + t.count * 31 + TERRAIN_SEED[t.kind]);
  const px: Px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const spots: Spot[] = [];
  if (L.paint) {
    const im = g.getImageData(0, 0, W, H);
    L.paint(im.data, W, H, ox, oy, rng);
    g.putImageData(im, 0, 0);
  }
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (!has(gx, gy)) continue;
      L.tile(px, gx * C - ox, gy * C - oy, rng);
      if (rng.chance(L.spots)) spots.push({ x: gx * C + rng.int(4, 11), y: gy * C + rng.int(5, 12), cl: gx * C, ct: gy * C, p: rng.next(), k: rng.int(0, 3) });
    }
  }
  // 场地的形状：凸出的角削圆，再描两道边
  const R = 5;
  const mask = new Uint8Array(W * H);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (!has(gx, gy)) continue;
      for (let py = 0; py < C; py++) {
        for (let pxl = 0; pxl < C; pxl++) {
          const sx = pxl < R ? -1 : pxl >= C - R ? 1 : 0, sy = py < R ? -1 : py >= C - R ? 1 : 0;
          if (sx && sy && !has(gx + sx, gy) && !has(gx, gy + sy)) {
            const dx = pxl + 0.5 - (sx < 0 ? R : C - R), dy = py + 0.5 - (sy < 0 ? R : C - R);
            if (dx * dx + dy * dy > R * R) continue;
          }
          mask[(gy * C - oy + py) * W + gx * C - ox + pxl] = 1;
        }
      }
    }
  }
  const m = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const ring = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x] && (!m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1))) ring[y * W + x] = 1;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mask[i] && !ring[i] && (ring[i - 1] === 1 || ring[i + 1] === 1 || ring[i - W] === 1 || ring[i + W] === 1)) ring[i] = 2;
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const glowFrom = new Set((L.glow?.from ?? []).map(rgb));
  let glowImg: ImageData | null = null;
  if (L.glow) glowImg = g.createImageData(W, H);
  const gc = L.glow ? rgb(L.glow.to) : 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (!mask[i]) { d[o + 3] = 0; continue; }
    if (glowImg && d[o + 3] === 255 && glowFrom.has((d[o] << 16) | (d[o + 1] << 8) | d[o + 2])) {
      glowImg.data[o] = gc >> 16; glowImg.data[o + 1] = (gc >> 8) & 255; glowImg.data[o + 2] = gc & 255; glowImg.data[o + 3] = 255;
    }
    const e = ring[i] === 1 ? L.edge : ring[i] === 2 ? L.rim : null;
    if (e) { d[o] = e[0]; d[o + 1] = e[1]; d[o + 2] = e[2]; d[o + 3] = e[3]; }
  }
  g.putImageData(img, 0, 0);
  let glow: HTMLCanvasElement | null = null;
  if (glowImg) {
    glow = document.createElement('canvas');
    glow.width = W;
    glow.height = H;
    glow.getContext('2d')!.putImageData(glowImg, 0, 0);
  }
  return { ox, oy, base, glow, spots };
}

const TERRAIN_SEED: Record<TerrainId, number> = { lava: 1, miasma: 2, rain: 3, thicket: 4, crystal: 5, updraft: 6, clearing: 7, frost: 8 };

function artOf(t: Terrain): Art {
  let a = arts.get(t);
  if (!a) { a = build(t); arts.set(t, a); }
  return a;
}

/** 画场地的地面（在区域、地面警示圈的下面）；view 为画面在世界里的范围 */
export function drawTerrain(ctx: CanvasRenderingContext2D, t: Terrain, time: number, alpha: number, view: { x: number; y: number; w: number; h: number }) {
  const a = artOf(t);
  ctx.globalAlpha = alpha;
  ctx.drawImage(a.base, a.ox, a.oy);
  if (a.glow) {
    ctx.globalAlpha = alpha * (t.kind === 'lava' ? 0.2 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.1)) : 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.6)));
    ctx.drawImage(a.glow, a.ox, a.oy);
    ctx.globalAlpha = alpha;
  }
  const L = LOOKS[t.kind];
  const x0 = view.x - C, y0 = view.y - C, x1 = view.x + view.w + C, y1 = view.y + view.h + C;
  for (const s of a.spots) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    L.spot(ctx, s, time);
  }
  if (TERRAINS[t.kind].circle) {
    drawEnergy(ctx, t, time);
    drawCrystal(ctx, t, time, alpha);
  }
  ctx.globalAlpha = 1;
}

/** 共鸣晶石的能量圈：淡淡的粉色圆面，一圈慢慢转动的虚线，三颗绕着转的光点 */
function drawEnergy(ctx: CanvasRenderingContext2D, t: Terrain, time: number) {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (0.13 + 0.05 * Math.sin(time * 2));
  pxCircle(ctx, t.cx, t.cy, t.cr, '#ff9ce8');
  ctx.globalAlpha = a0 * 0.9;
  const n = Math.max(24, Math.round((t.cr * TAU) / 3));
  const rot = time * 0.35;
  ctx.fillStyle = '#ffd0f4';
  for (let i = 0; i < n; i++) {
    if (i % 4 === 3) continue;
    const ang = (i / n) * TAU + rot;
    ctx.fillRect(Math.round(t.cx + Math.cos(ang) * t.cr), Math.round(t.cy + Math.sin(ang) * t.cr), 1, 1);
  }
  ctx.globalAlpha = a0 * 0.45;
  ctx.fillStyle = '#c070e0';
  for (let i = 0; i < n; i += 2) {
    const ang = (i / n) * TAU - rot * 0.6;
    ctx.fillRect(Math.round(t.cx + Math.cos(ang) * (t.cr + 1)), Math.round(t.cy + Math.sin(ang) * (t.cr + 1)), 1, 1);
  }
  ctx.globalAlpha = a0;
  for (let k = 0; k < 3; k++) {
    const ang = time * 0.9 + (k * TAU) / 3;
    const x = t.cx + Math.cos(ang) * t.cr, y = t.cy + Math.sin(ang) * t.cr;
    dot(ctx, x - 1, y - 1, '#ffffff', 2, 2);
    dot(ctx, x - 2, y - 0.5, '#ffd8f8');
    dot(ctx, x + 1, y - 0.5, '#ffd8f8');
  }
}

// ---------------------------------------------------------------- 共鸣晶石

let crystalArt: HTMLCanvasElement | null = null;

/** 21×28 的晶石：一大两小，底下一块岩石，带描边 */
function crystalSprite(): HTMLCanvasElement {
  if (crystalArt) return crystalArt;
  const W = 21, H = 28;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px: Px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  prism(px, 5, 24, 5, 10, '#ffc8f4', '#ff9ce8', '#c070e0');
  prism(px, 15, 24, 5, 13, '#ffc8f4', '#ff9ce8', '#c070e0');
  prism(px, 10, 25, 9, 22, '#ffd8f8', '#ff9ce8', '#c070e0');
  px(10, 6, '#ffffff', 1, 6);
  px(8, 12, '#ffffff', 1, 3);
  px(3, 24, '#5a4070', 15, 2);
  px(2, 25, '#4a3060', 17, 2);
  // 描边
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const edge: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push(y * W + x);
  }
  for (const i of edge) { d[i * 4] = 58; d[i * 4 + 1] = 32; d[i * 4 + 2] = 80; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  crystalArt = c;
  return c;
}

/** 场地中心的晶石：也画在地面层，走到它后面的单位不会被挡住 */
function drawCrystal(ctx: CanvasRenderingContext2D, t: Terrain, time: number, alpha: number) {
  const s = crystalSprite();
  const bob = Math.round(Math.sin(time * 1.8) * 1);
  ctx.globalAlpha = alpha * 0.3;
  ctx.fillStyle = '#000000';
  ctx.fillRect(t.cx - 9, t.cy + 1, 18, 2);
  ctx.globalAlpha = alpha * (0.25 + 0.15 * Math.sin(time * 2));
  pxCircle(ctx, t.cx, t.cy - 10, 9, '#ffb8f0');
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, t.cx - 10, t.cy - 25 + bob);
  const ph = frac(time / 2.2);
  if (ph < 0.3) {
    const k = ph < 0.08 || ph > 0.22 ? 0 : 1;
    dot(ctx, t.cx, t.cy - 24 + bob, '#ffffff');
    if (k) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, -2]]) dot(ctx, t.cx + dx, t.cy - 24 + bob + dy, '#ffffff');
  }
  ctx.globalAlpha = 1;
}
