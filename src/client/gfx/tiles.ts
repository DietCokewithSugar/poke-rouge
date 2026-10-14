import { Rng } from '../../shared/rng';

/** 场地四周画出的装饰边框宽度（场地外，不参与碰撞） */
export const BORDER = 72;
const T = 16;

interface Biome {
  ground: string[];
  speck: string;
  blade: string;
  path: string[];
  pathEdge: string;
  flowers: string[];
  tall: string[];
  border: 'tree' | 'rock' | 'grave' | 'stand';
  treeLeaf: string[];
  treeTrunk: string;
  rock: string[];
  outside: string;
  grid?: string;
  /** 对战场：画场地线，不画小路和草丛 */
  court?: string;
}

const BIOMES: Biome[] = [
  { // 1号道路
    ground: ['#88c070', '#80b868', '#90c878'], speck: '#68a050', blade: '#5a9848',
    path: ['#e0c888', '#d8c080', '#e8d090'], pathEdge: '#b89860',
    flowers: ['#f85858', '#f8e048', '#ffffff'], tall: ['#3f8a3a', '#5aa848', '#78c060'],
    border: 'tree', treeLeaf: ['#205820', '#307830', '#48a040', '#70c058'], treeTrunk: '#704820',
    rock: ['#787878', '#a0a0a0', '#c8c8c8'], outside: '#305830',
  },
  { // 常磐森林
    ground: ['#58a058', '#509850', '#60a860'], speck: '#408040', blade: '#387838',
    path: ['#a89060', '#a08858', '#b09868'], pathEdge: '#806840',
    flowers: ['#f8a8d0', '#f8f8a0', '#c0e8ff'], tall: ['#28682a', '#3a8a38', '#58a848'],
    border: 'tree', treeLeaf: ['#103810', '#1c5020', '#2c6c2c', '#489048'], treeTrunk: '#503010',
    rock: ['#606860', '#808880', '#a8b0a8'], outside: '#183818',
  },
  { // 月见山
    ground: ['#a08868', '#988060', '#a89070'], speck: '#806848', blade: '#786040',
    path: ['#b8a080', '#b09878', '#c0a888'], pathEdge: '#806848',
    flowers: ['#90a8c8', '#c8b0e0', '#e0e0e0'], tall: ['#706048', '#887050', '#a08868'],
    border: 'rock', treeLeaf: ['#403028', '#584838', '#706050', '#887868'], treeTrunk: '#302018',
    rock: ['#605040', '#807060', '#a09080'], outside: '#281c14',
  },
  { // 宝可梦之塔
    ground: ['#9888b0', '#9080a8', '#a090b8'], speck: '#7868a0', blade: '#706090',
    path: ['#b8a8d0', '#b0a0c8', '#c0b0d8'], pathEdge: '#706090',
    flowers: ['#f8f0a0', '#f8c8f8', '#ffffff'], tall: ['#605080', '#706098', '#8070a8'],
    border: 'grave', treeLeaf: ['#383050', '#504868', '#686080', '#8880a0'], treeTrunk: '#282038',
    rock: ['#787090', '#9890b0', '#b8b0d0'], outside: '#201830', grid: '#887aa0',
  },
  { // 对战场（宝可梦联盟）
    ground: ['#c8b088', '#c0a880', '#d0b890'], speck: '#a89068', blade: '#a89068',
    path: [], pathEdge: '', flowers: [], tall: [],
    border: 'stand', treeLeaf: ['#384058', '#506080', '#7088a8', '#a0b8d0'], treeTrunk: '',
    rock: [], outside: '#202838', court: '#f8f0e0',
  },
];

const cache = new Map<number, HTMLCanvasElement>();

export function arenaCanvas(biome: number, w: number, h: number): HTMLCanvasElement {
  const key = biome * 100000 + w * 10 + h;
  const hit = cache.get(key);
  if (hit) return hit;
  const B = BIOMES[biome] ?? BIOMES[0];
  const W = w + BORDER * 2, H = h + BORDER * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const rng = new Rng(1234 + biome * 77);
  const px = (cx: number, cy: number, col: string, ww = 1, hh = 1) => { x.fillStyle = col; x.fillRect(cx, cy, ww, hh); };

  x.fillStyle = B.outside;
  x.fillRect(0, 0, W, H);

  // 地面
  const ox = BORDER, oy = BORDER;
  for (let ty = 0; ty < h / T; ty++) {
    for (let tx = 0; tx < w / T; tx++) {
      const gx = ox + tx * T, gy = oy + ty * T;
      px(gx, gy, B.ground[(tx * 7 + ty * 3 + ((tx ^ ty) & 1)) % B.ground.length], T, T);
      if (B.grid) {
        px(gx, gy, B.grid, T, 1);
        px(gx, gy, B.grid, 1, T);
      }
      for (let i = 0; i < 3; i++) px(gx + rng.int(0, 15), gy + rng.int(0, 15), B.speck);
      if (!B.grid && !B.court && rng.chance(0.35)) {
        // 第二世代风格的小草
        const bx = gx + rng.int(2, 10), by = gy + rng.int(3, 11);
        px(bx, by + 2, B.blade); px(bx + 1, by + 1, B.blade); px(bx + 2, by + 2, B.blade);
        px(bx + 3, by, B.blade); px(bx + 4, by + 2, B.blade);
      }
    }
  }

  if (B.court) court(px, ox, oy, w, h, B.court);
  // 小路：两条交错的弯曲道路
  const paths = B.court ? 0 : 2;
  for (let k = 0; k < paths; k++) {
    const horizontal = k === 0;
    let pos = horizontal ? rng.range(h * 0.3, h * 0.7) : rng.range(w * 0.3, w * 0.7);
    const len = horizontal ? w : h;
    for (let s = 0; s < len; s += 4) {
      pos += rng.range(-2.2, 2.2);
      pos = Math.max(60, Math.min((horizontal ? h : w) - 60, pos));
      const half = 11 + Math.sin(s * 0.03) * 3;
      for (let d = -half; d <= half; d++) {
        const col = Math.abs(d) > half - 1.5 ? B.pathEdge : B.path[(s + Math.round(d)) % 3 === 0 ? 1 : 0];
        if (horizontal) px(ox + s, oy + Math.round(pos + d), col, 4, 1);
        else px(ox + Math.round(pos + d), oy + s, col, 1, 4);
      }
      if (rng.chance(0.5)) {
        const pd = rng.range(-half + 3, half - 3);
        if (horizontal) px(ox + s + rng.int(0, 3), oy + Math.round(pos + pd), B.pathEdge);
        else px(ox + Math.round(pos + pd), oy + s + rng.int(0, 3), B.pathEdge);
      }
    }
  }

  // 草丛块与花
  for (let i = 0; i < (B.tall.length ? 22 : 0); i++) {
    const cx = ox + rng.int(1, w / T - 3) * T, cy = oy + rng.int(1, h / T - 3) * T;
    const tw = rng.int(1, 3), th = rng.int(1, 2);
    for (let a = 0; a < tw; a++) for (let b = 0; b < th; b++) tallGrass(px, cx + a * T, cy + b * T, B.tall);
  }
  for (let i = 0; i < (B.flowers.length ? 70 : 0); i++) {
    const fx = ox + rng.int(4, w - 8), fy = oy + rng.int(4, h - 8);
    const col = rng.pick(B.flowers);
    px(fx + 1, fy, col); px(fx, fy + 1, col); px(fx + 2, fy + 1, col); px(fx + 1, fy + 2, col);
    px(fx + 1, fy + 1, '#f8d030');
  }
  for (let i = 0; i < (B.rock.length ? 9 : 0); i++) boulder(px, ox + rng.int(10, w - 26), oy + rng.int(10, h - 26), B.rock);

  // 边框：树/岩壁/墓碑
  for (let yy = -T * 2; yy < H; yy += T * 2) {
    for (let xx = -T * 2; xx < W; xx += T * 2) {
      const inside = xx > ox - T * 2 && xx < ox + w && yy > oy - T * 2 && yy < oy + h;
      if (inside) continue;
      if (B.border === 'tree') tree(px, xx + (Math.floor(yy / 32) % 2 ? 8 : 0), yy, B.treeLeaf, B.treeTrunk);
      else if (B.border === 'rock') rockWall(px, xx, yy, B.treeLeaf, rng);
      else if (B.border === 'stand') stand(px, xx, yy, B.treeLeaf, rng);
      else grave(px, xx + 6, yy + 4, B.treeLeaf);
    }
  }
  // 场地边缘的描边
  x.fillStyle = 'rgba(0,0,0,.25)';
  x.fillRect(ox - 2, oy - 2, w + 4, 2);
  x.fillRect(ox - 2, oy + h, w + 4, 2);
  x.fillRect(ox - 2, oy, 2, h);
  x.fillRect(ox + w, oy, 2, h);

  cache.set(key, c);
  return c;
}

type Px = (x: number, y: number, c: string, w?: number, h?: number) => void;

function tallGrass(px: Px, x: number, y: number, col: string[]) {
  px(x, y, col[0], 16, 16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const bx = x + c * 4, by = y + r * 4;
      px(bx + 1, by, col[2], 1, 2);
      px(bx, by + 1, col[1], 1, 2);
      px(bx + 2, by + 1, col[1], 1, 2);
      px(bx + 1, by + 2, col[2]);
      px(bx + 3, by + 3, col[0]);
    }
  }
}

function boulder(px: Px, x: number, y: number, c: string[]) {
  px(x + 3, y + 2, c[0], 10, 10);
  px(x + 2, y + 4, c[0], 12, 7);
  px(x + 4, y + 3, c[1], 8, 7);
  px(x + 3, y + 5, c[1], 9, 4);
  px(x + 5, y + 4, c[2], 3, 2);
  px(x + 4, y + 12, 'rgba(0,0,0,.25)', 9, 2);
}

function tree(px: Px, x: number, y: number, leaf: string[], trunk: string) {
  // 32×32 的初代风格圆形树
  px(x + 13, y + 24, trunk, 6, 7);
  px(x + 12, y + 30, 'rgba(0,0,0,.3)', 9, 2);
  const rows = [
    [10, 12], [6, 20], [4, 24], [3, 26], [2, 28], [2, 28], [1, 30], [1, 30], [1, 30], [1, 30], [1, 30], [1, 30],
    [2, 28], [2, 28], [3, 26], [3, 26], [4, 24], [6, 20], [8, 16], [11, 10],
  ];
  rows.forEach(([ox, w], i) => {
    px(x + ox, y + 2 + i, leaf[1], w, 1);
    px(x + ox, y + 2 + i, leaf[0], 1, 1);
    px(x + ox + w - 1, y + 2 + i, leaf[0], 1, 1);
  });
  px(x + 1, y + 21, leaf[0], 30, 1);
  for (const [cx, cy] of [[9, 7], [18, 6], [7, 14], [16, 13], [23, 12], [12, 18], [21, 18]]) {
    px(x + cx, y + cy, leaf[2], 4, 2);
    px(x + cx + 1, y + cy - 1, leaf[3], 2, 1);
    px(x + cx - 1, y + cy + 2, leaf[0], 5, 1);
  }
}

function rockWall(px: Px, x: number, y: number, c: string[], rng: Rng) {
  px(x, y, c[1], 32, 32);
  for (let i = 0; i < 6; i++) {
    const bx = x + rng.int(0, 24), by = y + rng.int(0, 24), s = rng.int(5, 9);
    px(bx, by, c[2], s, s - 2);
    px(bx + 1, by, c[3], s - 3, 1);
    px(bx, by + s - 2, c[0], s, 1);
  }
}

/** 场地线：外框、中线、中圈和精灵球标志；两侧是蓝/红方的出场区 */
function court(px: Px, ox: number, oy: number, w: number, h: number, line: string) {
  const m = 14;
  px(ox + m, oy + m, line, w - m * 2, 2);
  px(ox + m, oy + h - m - 2, line, w - m * 2, 2);
  px(ox + m, oy + m, line, 2, h - m * 2);
  px(ox + w - m - 2, oy + m, line, 2, h - m * 2);
  px(ox + w / 2 - 1, oy + m, line, 2, h - m * 2);
  const cx = ox + w / 2, cy = oy + h / 2;
  for (let a = 0; a < 360; a += 2) {
    const r = (a * Math.PI) / 180;
    px(Math.round(cx + Math.cos(r) * 46), Math.round(cy + Math.sin(r) * 46), line, 2, 2);
  }
  for (let y = -14; y <= 14; y++) {
    for (let x = -14; x <= 14; x++) {
      const d = Math.hypot(x, y);
      if (d > 14) continue;
      const col = d > 12.5 || Math.abs(y) <= 1 || d < 4.5 ? (d < 3 ? '#f8f8f8' : '#383838') : y < 0 ? '#e04848' : '#f8f8f8';
      px(cx + x, cy + y, col);
    }
  }
  for (const [side, col] of [[0, 'rgba(56,120,248,.24)'], [1, 'rgba(248,80,80,.16)']] as const) {
    const bx = side === 0 ? ox + m + 2 : ox + w - m - 2 - 64;
    px(bx, oy + m + 2, col, 64, h - m * 2 - 4);
  }
}

/** 观众席 */
function stand(px: Px, x: number, y: number, c: string[], rng: Rng) {
  px(x, y, c[0], 32, 32);
  for (let row = 0; row < 4; row++) {
    px(x, y + row * 8 + 6, c[1], 32, 2);
    for (let i = 0; i < 4; i++) {
      const fx = x + i * 8 + rng.int(1, 3), fy = y + row * 8 + 1;
      px(fx, fy, rng.pick(['#f8c890', '#e0a070', '#a87048']), 3, 3);
      px(fx - 1, fy + 3, rng.pick(['#e04848', '#4878e0', '#f8d030', '#48b048', '#f8f8f8', c[3]]), 5, 2);
    }
  }
}

function grave(px: Px, x: number, y: number, c: string[]) {
  px(x + 2, y + 2, c[3], 16, 20);
  px(x + 4, y, c[3], 12, 2);
  px(x + 3, y + 3, c[2], 14, 18);
  px(x + 9, y + 6, c[0], 2, 9);
  px(x + 6, y + 9, c[0], 8, 2);
  px(x, y + 22, c[1], 20, 4);
  px(x + 1, y + 26, 'rgba(0,0,0,.35)', 19, 2);
}
