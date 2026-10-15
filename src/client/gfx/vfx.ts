/**
 * 技能特效的像素小图：用代码按格子画出形状（火焰、水滴、叶片、闪电……），
 * 再用属性调色板上色，并加一圈深色描边，和 PMD 精灵的画风保持一致。
 * 思路参考 pokesurvivor（JPTER78，MIT）的 vfx.js。
 *
 * 格子里的字母：o 描边 · d 暗 · m 中 · l 亮 · w 高光 · L 半透明亮色
 * 有方向的形状都朝右画，绘制时再旋转（吸附到 16 个方向，减少旋转时的闪烁）。
 */
import { SKILLS } from '../../shared/skills';

export type Pal = string;

/** 每种属性 5 个颜色：描边、暗、中、亮、高光 */
export const PAL: Record<string, [string, string, string, string, string]> = {
  fire: ['#6b1200', '#b8300a', '#ff6a1f', '#ffb22e', '#fff2a0'],
  water: ['#0f2f78', '#1f56c4', '#3d8bff', '#8ccaff', '#eaf7ff'],
  grass: ['#14400f', '#24721e', '#45b23c', '#97e36c', '#eaffd0'],
  electric: ['#6b4300', '#c48a00', '#ffd21a', '#fff36a', '#ffffff'],
  psychic: ['#5e0a3a', '#b0246e', '#ff4f9a', '#ff9fcf', '#ffe8f3'],
  ice: ['#134a60', '#2f8aa8', '#62d2ea', '#bff3ff', '#ffffff'],
  fighting: ['#561208', '#9a2a16', '#e04a2e', '#ff9c6c', '#ffe2cc'],
  poison: ['#2e0a3c', '#5e1f7e', '#a043d0', '#d995f2', '#f7e2ff'],
  ground: ['#3a250c', '#6e4c1e', '#aa7c3c', '#dcb66c', '#f6e6b8'],
  flying: ['#283c66', '#5672b0', '#93b2ff', '#d2e2ff', '#ffffff'],
  bug: ['#2e3a06', '#5b7414', '#90b82a', '#cbe86c', '#f4ffd2'],
  rock: ['#2e2418', '#5a4a34', '#8e7a5a', '#c6b08a', '#f0e4c6'],
  ghost: ['#160e2c', '#33256a', '#5c48aa', '#9e8aea', '#e8deff'],
  dragon: ['#160a50', '#2e1ea0', '#5a3cff', '#a490ff', '#e8e2ff'],
  dark: ['#0e0a0c', '#2a2026', '#463840', '#7c6a74', '#d4c4cc'],
  steel: ['#232d38', '#56667a', '#8c9caf', '#cad6e2', '#ffffff'],
  fairy: ['#6a2050', '#b04a8a', '#ff8acb', '#ffc4e6', '#ffffff'],
  normal: ['#3e3834', '#7a7068', '#c4bcb0', '#ece6dc', '#ffffff'],
  aura: ['#0c2460', '#1c4cb0', '#3a7cff', '#90d2ff', '#ffffff'],
  gold: ['#5a3a00', '#b07800', '#f0c020', '#ffe878', '#ffffff'],
  solar: ['#6a4a00', '#d09a10', '#ffe040', '#fff8a8', '#ffffff'],
  hyper: ['#5a1800', '#c04a10', '#ff8c28', '#ffd070', '#fffbe0'],
  heal: ['#0c4a20', '#1e8a40', '#40d070', '#a8f8b8', '#ffffff'],
  danger: ['#4a0010', '#a01828', '#f83848', '#ff9098', '#ffe0e4'],
};

export interface Grid {
  w: number; h: number; g: (string | null)[][];
  set(x: number, y: number, c: string): void;
  get(x: number, y: number): string | null;
  fill(fn: (x: number, y: number) => string | null): void;
  outline(): void;
  line(x0: number, y0: number, x1: number, y1: number, c: string, thick?: number, side?: string): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: string): void;
}

export function grid(w: number, h: number): Grid {
  const g: (string | null)[][] = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  const G: Grid = {
    w, h, g,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : null; },
    fill(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); if (c) g[y][x] = c; } },
    outline() {
      const marks: [number, number][] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const c = G.get(x + a, y + b); return !!c && c !== 'o'; })) marks.push([x, y]);
      }
      for (const [x, y] of marks) g[y][x] = 'o';
    },
    line(x0, y0, x1, y1, c, thick = 0, side) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
        if (thick) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!G.get(Math.round(x + a), Math.round(y + b))) G.set(x + a, y + b, side ?? c);
        G.set(x, y, c);
      }
    },
    arc(cx, cy, r, a0, a1, c) {
      const n = Math.ceil(r * Math.abs(a1 - a0) * 2) + 2;
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; G.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c); }
    },
  };
  return G;
}

/** 确定性的伪随机，形状每次生成都一样 */
function hash(a: number, b: number, c: number) {
  let x = Math.imul(a * 374761393 + b * 668265263 + c * 2147483647, 1274126177);
  x ^= x >>> 13;
  x = Math.imul(x, 1103515245);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

interface ShapeDef { w: number; h: number; frames?: number; dir?: boolean; spin?: boolean; gen(P: Grid, f: number): void }

const SHAPES: Record<string, ShapeDef> = {
  fire: { w: 15, h: 11, frames: 3, dir: true, gen(P, f) {
    const cx = 10.5, cy = 5;
    for (let x = 1; x <= 9; x++) {
      const t = (x - 1) / 8;
      const th = 0.5 + t * 2.6 + (hash(x, f, 3) - 0.5) * 1.3;
      const yc = cy + Math.sin(x * 1.4 + f * 2.1) * 0.8 * (1 - t);
      for (let y = 0; y < P.h; y++) {
        const d = Math.abs(y - yc);
        if (d > th || (t < 0.3 && hash(x, y + f * 7, 5) < 0.4)) continue;
        P.set(x, y, d < th * 0.4 && t > 0.3 ? 'l' : 'm');
      }
    }
    P.fill((x, y) => { const d = Math.hypot(x - cx, (y - cy) * 1.1); return d < 1.3 ? 'w' : d < 2.4 ? 'l' : d < 3.5 ? 'm' : null; });
    P.outline();
  } },
  flame: { w: 9, h: 12, frames: 3, gen(P, f) {
    // 竖直的火苗（地面火焰、火焰旋涡）
    for (let y = 0; y < 12; y++) {
      const t = y / 11;
      const half = 0.6 + t * 3.4 - (t > 0.85 ? (t - 0.85) * 12 : 0);
      const xc = 4 + Math.sin(y * 0.9 + f * 2) * (1 - t) * 1.2;
      for (let x = 0; x < 9; x++) {
        const d = Math.abs(x - xc);
        if (d > half) continue;
        P.set(x, y, d < half * 0.35 && t > 0.4 ? 'w' : d < half * 0.65 ? 'l' : 'm');
      }
    }
    P.outline();
  } },
  drop: { w: 13, h: 9, dir: true, gen(P) {
    for (let x = 2; x <= 7; x++) {
      const th = ((x - 2) / 5) * 2.6;
      for (let y = 0; y < P.h; y++) { const d = Math.abs(y - 4); if (d <= th) P.set(x, y, d < th * 0.5 ? 'l' : 'm'); }
    }
    P.fill((x, y) => { const d = Math.hypot(x - 8.5, y - 4); return d < 1.6 ? 'l' : d < 3.3 ? 'm' : null; });
    P.set(9, 2, 'w'); P.set(10, 3, 'w');
    P.outline();
  } },
  bubble: { w: 11, h: 11, frames: 2, gen(P, f) {
    const rx = 4.3 + f * 0.3, ry = 4.3 - f * 0.3;
    P.fill((x, y) => { const e = Math.hypot((x - 5) / rx, (y - 5) / ry); return e <= 1 ? (e > 0.76 ? 'm' : 'L') : null; });
    P.set(3, 3, 'w'); P.set(4, 3, 'w'); P.set(3, 4, 'w'); P.set(7, 7, 'l');
    P.outline();
  } },
  leaf: { w: 12, h: 7, spin: true, gen(P) {
    P.fill((x, y) => { const dx = Math.abs(x - 5.5) / 5.6, dy = (y - 3) / 2.7; return dx + dy * dy <= 1 ? (y < 3 ? 'l' : 'm') : null; });
    for (let x = 2; x <= 9; x++) P.set(x, 3, 'd');
    P.set(4, 2, 'w');
    P.outline();
  } },
  petal: { w: 9, h: 7, spin: true, gen(P) {
    P.fill((x, y) => { const d = Math.hypot((x - 4) / 4, (y - 3) / 2.8); return d <= 1 ? (d < 0.45 ? 'w' : y < 3 ? 'l' : 'm') : null; });
    P.set(8, 3, 'm');
    P.outline();
  } },
  seed: { w: 7, h: 8, spin: true, gen(P) {
    P.fill((x, y) => { const d = Math.hypot((x - 3) / 2.6, (y - 4) / 3.3); return d <= 1 ? (d < 0.4 ? 'l' : 'm') : null; });
    P.set(2, 2, 'w'); P.set(3, 6, 'd');
    P.outline();
  } },
  bolt: { w: 15, h: 10, frames: 2, dir: true, gen(P, f) {
    const pts = f ? [[0, 3], [4, 7], [7, 2], [10, 7], [14, 4]] : [[0, 6], [4, 2], [7, 7], [10, 2], [14, 5]];
    for (let i = 0; i < pts.length - 1; i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'w', 1, 'l');
    P.outline();
  } },
  shard: { w: 13, h: 7, dir: true, gen(P) {
    P.fill((x, y) => (Math.abs(x - 6) / 6.2 + Math.abs(y - 3) / 3.4 <= 1 ? (y < 3 ? 'l' : 'm') : null));
    for (let x = 6; x <= 11; x++) P.set(x, 3, 'w');
    P.set(4, 2, 'w');
    P.outline();
  } },
  rock: { w: 12, h: 11, frames: 3, spin: true, gen(P, f) {
    const r = [0, 1, 2, 3, 4, 5, 6].map((i) => 3.6 + hash(i, f, 9) * 1.4);
    P.fill((x, y) => {
      const dx = x - 5.5, dy = y - 5;
      const a = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 6;
      const i = Math.floor(a), t = a - i;
      const R = r[i] * (1 - t) + r[(i + 1) % 6] * t;
      const d = Math.hypot(dx, dy);
      if (d > R) return null;
      const lit = (-dx * 0.6 - dy * 0.8) / R;
      return lit > 0.35 ? 'l' : lit > -0.3 ? 'm' : 'd';
    });
    P.set(6, 5, 'd'); P.set(7, 6, 'd'); P.set(4, 3, 'w');
    P.outline();
  } },
  blob: { w: 12, h: 11, frames: 2, gen(P, f) {
    P.fill((x, y) => {
      const dx = x - 5.5, dy = y - 4.8;
      const R = 3.9 + Math.sin(Math.atan2(dy, dx) * 3 + f * 2) * 0.5;
      const d = Math.hypot(dx, dy);
      if (d > R) return null;
      const lit = (-dx * 0.6 - dy * 0.8) / R;
      return lit > 0.4 ? 'l' : lit > -0.35 ? 'm' : 'd';
    });
    P.set(4, 3, 'w'); P.set(3, 3, 'w');
    P.set(6, 9, 'm'); if (f) P.set(6, 10, 'm');
    P.outline();
  } },
  needle: { w: 13, h: 5, dir: true, gen(P) {
    for (let x = 1; x <= 9; x++) P.set(x, 2, 'm');
    for (let x = 3; x <= 8; x++) P.set(x, 1, 'l');
    P.set(10, 2, 'w'); P.set(11, 2, 'w');
    P.set(1, 1, 'd'); P.set(1, 3, 'd');
    P.outline();
  } },
  star: { w: 11, h: 11, frames: 2, spin: true, gen(P, f) {
    const L = f ? 3 : 4;
    for (let i = -L; i <= L; i++) { P.set(5 + i, 5, Math.abs(i) === L ? 'm' : 'l'); P.set(5, 5 + i, Math.abs(i) === L ? 'm' : 'l'); }
    const D = f ? 2 : 1;
    for (let i = 1; i <= D; i++) for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.set(5 + a * i, 5 + b * i, 'l');
    P.set(5, 5, 'w'); P.set(4, 5, 'w'); P.set(6, 5, 'w'); P.set(5, 4, 'w'); P.set(5, 6, 'w');
  } },
  streak: { w: 15, h: 5, dir: true, gen(P) {
    for (let x = 0; x < 15; x++) P.set(x, 2, x < 4 ? 'd' : x < 8 ? 'm' : x < 12 ? 'l' : 'w');
    for (let x = 7; x <= 12; x++) { P.set(x, 1, 'l'); P.set(x, 3, 'm'); }
    P.set(13, 1, 'w'); P.set(13, 3, 'w');
  } },
  wind: { w: 13, h: 11, frames: 2, spin: true, gen(P, f) {
    P.arc(6, 5, 4.6, -0.6 + f * 0.7, 2.9 + f * 0.7, 'l');
    P.arc(6, 5, 3.6, -0.3 + f * 0.7, 2.2 + f * 0.7, 'w');
    P.arc(6, 5, 2.2, 1.8 + f, 4.6 + f, 'l');
  } },
  ring: { w: 13, h: 13, frames: 2, gen(P, f) {
    P.fill((x, y) => {
      const d = Math.hypot(x - 6, y - 6);
      if (Math.abs(d - (5 + f * 0.6)) < 0.75) return 'm';
      if (Math.abs(d - (3 + f * 0.5)) < 0.7) return 'l';
      return null;
    });
    P.set(6, 6, 'w');
  } },
  crescent: { w: 12, h: 11, dir: true, gen(P) {
    P.fill((x, y) => {
      const a = Math.hypot(x - 6.5, y - 5), b = Math.hypot(x - 3.8, y - 5);
      if (a > 4.8 || b < 4.2) return null;
      return b < 5.1 ? 'l' : 'm';
    });
    P.set(10, 5, 'w'); P.set(10, 4, 'w');
    P.outline();
  } },
  note: { w: 11, h: 11, dir: true, gen(P) {
    P.arc(1, 5, 2.2, -0.7, 0.7, 'w');
    P.arc(1, 5, 4.6, -0.6, 0.6, 'l');
    P.arc(1, 5, 7.2, -0.5, 0.5, 'm');
  } },
  impact: { w: 15, h: 15, frames: 2, gen(P, f) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + (f ? Math.PI / 8 : 0), L = (k % 2 ? 3.5 : 6) * (f ? 1 : 0.75);
      P.line(7, 7, 7 + Math.cos(a) * L, 7 + Math.sin(a) * L, 'l');
      P.set(7 + Math.cos(a) * L, 7 + Math.sin(a) * L, 'm');
    }
    P.fill((x, y) => (Math.hypot(x - 7, y - 7) < 1.8 ? 'w' : null));
  } },
  claw: { w: 13, h: 13, gen(P) {
    for (let i = 0; i < 3; i++) P.line(1 + i * 3.5, 11, 6 + i * 3.5, 1, 'w', 1, 'l');
    P.outline();
  } },
  jaws: { w: 13, h: 11, frames: 2, gen(P, f) {
    const gap = f ? 0 : 2;
    for (let x = 1; x <= 11; x++) { P.set(x, 1, 'm'); P.set(x, 9, 'm'); }
    for (let t = 0; t < 4; t++) {
      const x = 2 + t * 3;
      P.set(x, 2, 'w'); P.set(x + 1, 2, 'w'); P.set(x, 3, 'w'); P.set(x + 1, 3, 'l');
      if (!gap) P.set(x, 4, 'w');
      P.set(x + 1, 8, 'w'); P.set(x + 2, 8, 'w'); P.set(x + 1, 7, 'w'); P.set(x + 2, 7, 'l');
      if (!gap) P.set(x + 1, 6, 'w');
    }
    P.outline();
  } },
  arrow: { w: 7, h: 9, gen(P) {
    for (let y = 0; y < 4; y++) for (let x = 3 - y; x <= 3 + y; x++) P.set(x, y, x === 3 - y ? 'w' : 'l');
    for (let y = 4; y < 9; y++) for (let x = 2; x <= 4; x++) P.set(x, y, x === 2 ? 'w' : 'm');
    P.outline();
  } },
  ball: { w: 11, h: 11, frames: 2, gen(P, f) {
    P.fill((x, y) => { const d = Math.hypot(x - 5, y - 5); return d < 1.5 ? 'w' : d < 2.9 ? 'l' : d < 4.2 + f * 0.3 ? 'm' : null; });
    P.set(3, 3, 'w');
    P.outline();
  } },
  orb: { w: 15, h: 15, frames: 2, gen(P, f) {
    // 大能量球：外圈有电光
    P.fill((x, y) => { const d = Math.hypot(x - 7, y - 7); return d < 2 ? 'w' : d < 3.6 ? 'l' : d < 5.2 ? 'm' : null; });
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + f * 0.5;
      P.set(7 + Math.cos(a) * 6.4, 7 + Math.sin(a) * 6.4, 'l');
    }
    P.set(5, 5, 'w');
    P.outline();
  } },
  shadow: { w: 13, h: 13, frames: 3, gen(P, f) {
    P.fill((x, y) => { const d = Math.hypot(x - 6, y - 6); return d < 1.6 ? 'l' : d < 3 ? 'm' : d < 4.4 ? 'd' : null; });
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + f * 0.7, r = 4.8 + hash(k, f, 4) * 1.4;
      P.set(6 + Math.cos(a) * r, 6 + Math.sin(a) * r, 'm');
    }
    P.set(5, 5, 'w');
    P.outline();
  } },
  heart: { w: 9, h: 8, gen(P) {
    ['.ll...ll.', 'lwll.llll', 'lllllllll', 'lllllllll', '.lllllll.', '..lllll..', '...lll...', '....l....']
      .forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') P.set(x, y, c === 'w' ? 'w' : 'l'); }));
    P.outline();
  } },
  plus: { w: 7, h: 7, gen(P) {
    for (let i = 0; i < 7; i++) { P.set(3, i, i === 3 ? 'w' : 'l'); P.set(i, 3, i === 3 ? 'w' : 'l'); }
    P.set(2, 3, 'w'); P.set(3, 2, 'w');
    P.outline();
  } },
  spark: { w: 7, h: 7, frames: 2, gen(P, f) {
    const L = f ? 3 : 2;
    for (let i = -L; i <= L; i++) { P.set(3 + i, 3, 'l'); P.set(3, 3 + i, 'l'); }
    P.set(3, 3, 'w');
  } },
  cloud: { w: 15, h: 10, frames: 2, gen(P, f) {
    const blobs = [[4, 6, 3.4], [8, 4.5, 3.8], [11.5, 6.2, 2.8], [7, 7, 3]];
    P.fill((x, y) => {
      let best = 9;
      for (const [cx, cy, r] of blobs) best = Math.min(best, Math.hypot(x - cx, (y - cy) * 1.15) / (r + f * 0.3));
      return best <= 1 ? (best < 0.45 ? 'l' : y < 5 ? 'l' : 'm') : null;
    });
    P.set(6, 3, 'w'); P.set(7, 2, 'w');
    P.outline();
  } },
  vine: { w: 9, h: 9, spin: true, gen(P) {
    P.line(1, 7, 7, 1, 'm', 1, 'd');
    P.set(3, 3, 'l'); P.set(2, 2, 'l'); P.set(6, 6, 'l'); P.set(7, 5, 'l');
    P.outline();
  } },
  eye: { w: 13, h: 9, gen(P) {
    P.fill((x, y) => { const d = Math.hypot((x - 6) / 6, (y - 4) / 3.5); return d <= 1 ? (d > 0.8 ? 'm' : 'L') : null; });
    P.fill((x, y) => (Math.hypot(x - 6, y - 4) < 2 ? 'd' : null));
    P.set(6, 4, 'w'); P.set(5, 3, 'w');
    P.outline();
  } },
};

const cache = new Map<string, HTMLCanvasElement>();

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const IDX: Record<string, number> = { o: 0, d: 1, m: 2, l: 3, w: 4 };

function sprite(shape: string, pal: Pal, frame = 0): HTMLCanvasElement {
  const S = SHAPES[shape] ?? SHAPES.ball;
  const f = ((frame | 0) % (S.frames ?? 1) + (S.frames ?? 1)) % (S.frames ?? 1);
  const k = `${shape}|${pal}|${f}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const P = grid(S.w, S.h);
  S.gen(P, f);
  const cv = document.createElement('canvas');
  cv.width = S.w;
  cv.height = S.h;
  const c = cv.getContext('2d')!;
  const colors = PAL[pal] ?? PAL.normal;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const ch = P.g[y][x];
    if (!ch) continue;
    c.fillStyle = ch === 'L' ? rgba(colors[3], 0.5) : colors[IDX[ch]];
    c.fillRect(x, y, 1, 1);
  }
  cache.set(k, cv);
  return cv;
}

export interface DrawOpts { angle?: number; scale?: number; frame?: number; alpha?: number }

/** 以 (x, y) 为中心绘制。 */
export function drawShape(ctx: CanvasRenderingContext2D, shape: string, pal: Pal, x: number, y: number, o: DrawOpts = {}) {
  const S = SHAPES[shape] ?? SHAPES.ball;
  const cv = sprite(shape, pal, o.frame ?? 0);
  const k = o.scale ?? 1;
  const prev = ctx.globalAlpha;
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = prev * o.alpha;
  const a = o.angle ? Math.round(o.angle / (Math.PI / 8)) * (Math.PI / 8) : 0;
  if (a) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(a);
    ctx.drawImage(cv, Math.round((-S.w * k) / 2), Math.round((-S.h * k) / 2), S.w * k, S.h * k);
    ctx.restore();
  } else {
    ctx.drawImage(cv, Math.round(x - (S.w * k) / 2), Math.round(y - (S.h * k) / 2), S.w * k, S.h * k);
  }
  ctx.globalAlpha = prev;
}

export const isDir = (shape: string) => !!SHAPES[shape]?.dir;
export const spins = (shape: string) => !!SHAPES[shape]?.spin;

// ---------------------------------------------------------------- 每个技能的外观

export type Trail = 'ember' | 'drip' | 'spark' | 'bubbles' | 'dirt' | 'wisp' | 'leafy' | 'glitter';
export type MeleeExtra = 'impact' | 'claw' | 'jaws' | 'vine' | 'drops' | 'bolts' | 'shards' | 'flames' | 'streak';

export interface Vis {
  pal: Pal;
  proj?: string;
  trail?: Trail;
  melee?: MeleeExtra;
  beam?: string | 'lightning';
  /** 范围技能向外飞出的小图 */
  nova?: string;
  /** 定点打击：落下的东西 / 爆炸的样子 */
  fall?: string;
  boom?: 'fire' | 'impact' | 'bolt' | 'rings' | 'splash' | 'rocks' | 'leaves' | 'column' | 'cloud' | 'big';
  /** 持续区域里飘着的小图 */
  zone?: string;
}

const V: Record<string, Partial<Vis>> = {
  tackle: { melee: 'impact' }, scratch: { melee: 'claw' }, quick: { melee: 'streak' }, slash: { melee: 'claw' },
  star: { pal: 'gold', proj: 'star', trail: 'glitter' }, voice: { nova: 'note' }, hyperbeam: { pal: 'hyper', beam: 'impact' },
  ember: { proj: 'fire', trail: 'ember' }, firefang: { melee: 'jaws' }, firespin: {}, flamethrower: { beam: 'fire' },
  fireblast: { fall: 'fire', boom: 'fire' }, flareblitz: { nova: 'flame' },
  water: { proj: 'drop', trail: 'drip' }, shield: {}, bubble: { proj: 'bubble', trail: 'bubbles' }, waterpulse: { proj: 'ring', trail: 'bubbles' },
  aquatail: { melee: 'drops' }, surf: { nova: 'drop' }, hydropump: { beam: 'drop' },
  vine: { melee: 'vine' }, seed: { proj: 'seed', trail: 'leafy' }, leaf: { proj: 'leaf' }, seedbomb: { fall: 'seed', boom: 'leaves' },
  energyball: { proj: 'orb', trail: 'leafy' }, petal: { pal: 'fairy', proj: 'petal' }, heal: { pal: 'heal' },
  solarbeam: { pal: 'solar', beam: 'star' }, frenzyplant: { nova: 'vine' },
  shock: { proj: 'bolt', trail: 'spark' }, electroball: { proj: 'orb', trail: 'spark' }, sparkmelee: { melee: 'bolts' },
  thunderbolt: { beam: 'lightning' }, discharge: { nova: 'bolt' }, thunder: { boom: 'column' }, volttackle: { melee: 'bolts' },
  buff: { pal: 'gold' }, psy: { proj: 'ring' }, psybeam: { beam: 'ring' }, psychocut: { proj: 'crescent', trail: 'glitter' },
  psychic: { boom: 'rings' }, shadowball: { proj: 'shadow', trail: 'wisp' }, aurasphere: { pal: 'aura', proj: 'orb', trail: 'spark' },
  futuresight: { boom: 'column' }, psystrike: { proj: 'ring', trail: 'wisp' },
  dragonbreath: { melee: 'flames' }, dragonclaw: { melee: 'claw' }, meteor: { fall: 'rock', boom: 'big' },
  airslash: { proj: 'crescent', trail: 'glitter' }, metalclaw: { melee: 'claw' }, irontail: { melee: 'shards' },
  icebeam: { beam: 'shard' }, bite: { melee: 'jaws' }, darkpulse: { nova: 'crescent' }, chop: { melee: 'impact' },
  poisonpowder: {}, sludge: { fall: 'blob', boom: 'splash' }, rockslide: { fall: 'rock', boom: 'rocks' }, earthquake: { nova: 'rock' },
  // 敌人
  e_sting: { pal: 'poison', proj: 'needle' }, e_acid: { pal: 'poison', proj: 'blob', trail: 'bubbles' },
  e_spore: { pal: 'bug', proj: 'ball' }, e_shock: { pal: 'electric', proj: 'bolt', trail: 'spark' },
  e_shadow: { pal: 'ghost', proj: 'shadow', trail: 'wisp' }, e_psy: { pal: 'psychic', proj: 'ring', boom: 'rings' },
  e_gust: { pal: 'flying', proj: 'wind' }, e_rock: { pal: 'rock', proj: 'rock', boom: 'rocks' },
  e_bubble: { pal: 'water', proj: 'bubble' }, e_star: { pal: 'fairy', proj: 'star', trail: 'glitter' },
  e_ring: { pal: 'normal', proj: 'ring' }, e_blast: { pal: 'electric', boom: 'impact' }, e_cloud: { pal: 'poison', boom: 'cloud' },
  e_slam: { pal: 'ground', boom: 'rocks' }, e_vanish: { pal: 'ghost', boom: 'cloud' },
  e_fire: { pal: 'fire', proj: 'fire', trail: 'ember' }, e_ice: { pal: 'ice', proj: 'shard' }, e_leaf: { pal: 'grass', proj: 'leaf' },
  e_mud: { pal: 'ground', proj: 'blob', trail: 'dirt' }, e_dragon: { pal: 'dragon', proj: 'orb', trail: 'spark' }, e_dark: { pal: 'dark', proj: 'crescent' },
  // 初代 151 只补充的招式
  headbutt: { melee: 'impact' }, hyperfang: { melee: 'jaws' }, payday: { pal: 'gold', proj: 'orb', trail: 'glitter' }, sing: { pal: 'fairy', nova: 'note' },
  triattack: { pal: 'hyper', proj: 'star', trail: 'spark' }, bodyslam: { nova: 'impact' }, doubleedge: { melee: 'impact' }, explosion: { pal: 'hyper', nova: 'flame' },
  firepunch: { melee: 'flames' }, heatwave: { nova: 'flame' }, whirlpool: { zone: 'bubble' }, crabhammer: { melee: 'drops' }, waterfall: { melee: 'drops' },
  scald: { proj: 'drop', trail: 'drip' }, megadrain: { pal: 'heal', proj: 'orb', trail: 'leafy' }, stunspore: { pal: 'electric', zone: 'cloud' },
  gigadrain: { proj: 'orb', trail: 'leafy' }, leafblade: { melee: 'claw' }, powerwhip: { melee: 'vine' }, thunderpunch: { melee: 'bolts' },
  zapcannon: { proj: 'orb', trail: 'spark' }, powdersnow: { proj: 'shard', trail: 'glitter' }, iceshard: { proj: 'shard' }, aurorabeam: { beam: 'ring' },
  icepunch: { melee: 'shards' }, blizzard: { nova: 'shard' }, karate: { melee: 'impact' }, crosschop: { melee: 'claw' }, closecombat: { nova: 'impact' },
  hijump: { melee: 'streak' }, focusblast: { proj: 'orb', trail: 'spark' }, poisonsting: { proj: 'needle' }, acid: { proj: 'blob', trail: 'bubbles' },
  poisonjab: { melee: 'streak' }, sludgewave: { nova: 'blob' }, gunkshot: { fall: 'blob', boom: 'splash' }, mudslap: { proj: 'blob', trail: 'dirt' },
  bonemerang: { proj: 'crescent' }, bulldoze: { nova: 'rock' }, dig: { boom: 'rocks' }, earthpower: { boom: 'column' }, gust: { proj: 'wind' },
  peck: { melee: 'streak' }, wingattack: { melee: 'claw' }, aerialace: { proj: 'crescent', trail: 'glitter' }, drillpeck: { melee: 'streak' },
  hurricane: { zone: 'wind' }, bravebird: { melee: 'streak' }, hypnosis: { proj: 'ring' }, bugbite: { melee: 'jaws' }, strugglebug: { proj: 'ball' },
  pinmissile: { proj: 'needle' }, signalbeam: { beam: 'ring' }, xscissor: { melee: 'claw' }, bugbuzz: { nova: 'note' }, megahorn: { melee: 'impact' },
  rockthrow: { fall: 'rock', boom: 'rocks' }, rocktomb: { fall: 'rock', boom: 'rocks' }, ancientpower: { proj: 'rock' }, powergem: { beam: 'shard' },
  stoneedge: { nova: 'rock' }, lick: { melee: 'jaws' }, nightshade: { proj: 'shadow', trail: 'wisp' }, shadowclaw: { melee: 'claw' },
  hex: { zone: 'shadow' }, shadowforce: { boom: 'cloud' }, twister: { zone: 'wind' }, dragonrage: { proj: 'fire', trail: 'ember' },
  dragonpulse: { beam: 'ring' }, outrage: { nova: 'flame' }, nightslash: { melee: 'claw' }, crunch: { melee: 'jaws' }, steelwing: { melee: 'claw' },
  flashcannon: { beam: 'ring' }, meteormash: { melee: 'impact' }, fairywind: { proj: 'star', trail: 'glitter' }, disarm: { nova: 'heart' },
  drainkiss: { proj: 'heart', trail: 'glitter' }, dazzle: { nova: 'star' }, playrough: { melee: 'impact' }, moonblast: { proj: 'orb', trail: 'glitter' },
  spikecannon: { proj: 'needle' }, eggbomb: { fall: 'ball', boom: 'impact' }, vacuum: { proj: 'crescent' }, seismic: { boom: 'impact' },
  pursuit: { proj: 'crescent', trail: 'wisp' }, aquajet: { proj: 'drop', trail: 'drip' }, bulletpunch: { proj: 'orb' }, gyroball: { proj: 'orb', trail: 'spark' },
  dragondarts: { proj: 'arrow' }, flamewheel: { proj: 'fire', trail: 'ember' }, wildcharge: { proj: 'orb', trail: 'spark' },
};

const FX_TYPE = new Map<string, string>();
for (const s of Object.values(SKILLS)) if (!FX_TYPE.has(s.fx)) FX_TYPE.set(s.fx, s.type);

const visCache = new Map<string, Vis>();
export function vis(fx: string): Vis {
  const base = fx.replace(/_(pre|charge)$/, '');
  let v = visCache.get(base);
  if (!v) {
    const o = V[base] ?? {};
    v = { ...o, pal: o.pal ?? FX_TYPE.get(base) ?? 'normal' };
    visCache.set(base, v);
  }
  return v;
}
