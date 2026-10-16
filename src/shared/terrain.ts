/**
 * 局部属性场地：冒险第 2 波起，每波地图上随机出现一块连续的小范围环境，给几种属性带来优势，同时有明确的不利效果。
 *
 * - 招式加成（伤害、冷却、覆盖面积、暴击、命中后回复、命中后减速）按「施放者施放时是否站在场地里」判定，
 *   飞行中的弹幕、持续的区域沿用施放时的判定；冷却按每一刻是否站在场地里决定倒数的快慢。
 * - 移动速度和灼伤按「单位现在是否在场地里」判定，豁免看单位自身的属性（双属性任一符合即可）。
 * - 敌人遵守同样的规则：敌人的攻击没有招式属性，按敌人的主属性（第一属性）算。
 *
 * 场地用 16×16 的格子表示（和地面图块对齐），判定是一次查表。
 */
import type { Rng } from './rng';
import { TYPES, TYPE_NAME, type PType } from './types';

export const TERRAIN_CELL = 16;
/** 第几波开始出现场地 */
export const TERRAIN_FROM_WAVE = 2;
/** 面积下限（格子数）：约占地图的 5.6% */
export const TERRAIN_MIN_CELLS = 96;
/** 出生点（地图中央）周围这么远（像素）以内不会有场地 */
export const TERRAIN_SPAWN_CLEAR = 96;

/** 灼伤：离开熔岩池后还会持续这么久（秒），大约每 0.5 秒掉一次血，最多烧到剩 1 HP */
export const BURN_LINGER = 1.5;
export const BURN_TICK = 0.5;
/** 灼伤每秒掉的最大 HP 比例：宝可梦和普通敌人 2%，精英 1%，首领 0.5% */
export const BURN_PCT = { player: 0.02, minion: 0.02, elite: 0.01, boss: 0.005 };
/** 灼伤每一跳的伤害：平均每秒掉 pct 最大 HP，每跳至少 1 点（HP 少的单位跳得慢一些，间隔 = 每跳伤害 ÷ 每秒伤害） */
export function burnDmg(maxHp: number, pct: number): number {
  return Math.max(1, Math.round(maxHp * pct * BURN_TICK));
}
/** 灼伤时物理招式（敌人的接触、物理攻击）伤害倍率 */
export const BURN_PHYS = 0.5;
/** 寒霜区域：命中后减速 20%，持续 2 秒，重复命中刷新时间 */
export const CHILL_AMT = 0.2;
export const CHILL_DUR = 2;
/** 繁茂草丛：命中后回复造成伤害的 5%，每秒最多回复最大 HP 的 2% */
export const LEECH_PCT = 0.05;
export const LEECH_CAP = 0.02;
/** 开阔空地：暴击率 +15 个百分点 */
export const TERRAIN_CRIT = 0.15;

/** 命中时的场地效果（施放时判定，跟着弹幕、区域、延迟攻击走） */
export const TF_CRIT = 1;
export const TF_LEECH = 2;
export const TF_CHILL = 4;

export const TERRAIN_IDS = ['lava', 'miasma', 'rain', 'thicket', 'crystal', 'updraft', 'clearing', 'frost'] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** 获益属性 */
  types: PType[];
  /** 获益属性招式的伤害、冷却时间、覆盖面积倍率与暴击率加成 */
  dmg?: number;
  cd?: number;
  area?: number;
  crit?: boolean;
  /** 命中后回复 / 命中后减速 */
  leech?: boolean;
  chill?: boolean;
  /** 正面加成只在中心的晶石能量圈里生效 */
  circle?: boolean;
  /** 不利：受影响的招式属性，伤害与冷却时间倍率 */
  badMoves?: PType[];
  badDmg?: number;
  badCd?: number;
  /** 不利：移动减速（has：带有这些属性的单位；not：不带这些属性的单位） */
  slow?: { has?: PType[]; not?: PType[]; amt: number };
  /** 不利：不带这些属性的单位进入后灼伤 */
  burn?: PType[];
  /** 简短说明：正面、负面 */
  good: string;
  bad: string;
  /** 提示文字的颜色 */
  color: string;
}

const N = (ts: PType[]) => ts.map((t) => TYPE_NAME[t]).join('/');

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  lava: {
    id: 'lava', name: '熔岩池', types: ['fire', 'rock'], dmg: 1.25, burn: ['fire', 'rock'],
    good: `${N(['fire', 'rock'])}招式伤害 +25%`, bad: '非火/岩石系进入后灼伤：持续掉血，物理伤害 −50%', color: '#ff8a3c',
  },
  miasma: {
    id: 'miasma', name: '阴云毒雾', types: ['poison', 'ghost', 'dark'], area: 2, badMoves: ['grass', 'electric'], badCd: 2,
    good: `${N(['poison', 'ghost', 'dark'])}招式覆盖面积翻倍`, bad: `${N(['grass', 'electric'])}招式冷却时间翻倍`, color: '#c890f8',
  },
  rain: {
    id: 'rain', name: '局部阵雨', types: ['water', 'electric'], cd: 0.8, slow: { has: ['flying'], amt: 0.25 },
    good: `${N(['water', 'electric'])}招式冷却时间 −20%`, bad: '飞行系移动速度 −25%', color: '#78b8ff',
  },
  thicket: {
    id: 'thicket', name: '繁茂草丛', types: ['grass', 'bug'], leech: true, slow: { not: ['grass', 'bug'], amt: 0.2 },
    good: `${N(['grass', 'bug'])}招式命中后回复伤害的 5%（每秒最多 2% 最大 HP）`, bad: '非草/虫系移动速度 −20%', color: '#78e060',
  },
  crystal: {
    id: 'crystal', name: '共鸣晶石', types: ['psychic', 'fairy', 'dragon'], dmg: 1.25, circle: true, badMoves: ['dark', 'ghost'], badDmg: 0.8,
    good: `晶石能量圈内，${N(['psychic', 'fairy', 'dragon'])}招式伤害 +25%`, bad: `${N(['dark', 'ghost'])}招式伤害 −20%`, color: '#ff9ce8',
  },
  updraft: {
    id: 'updraft', name: '上升气流', types: ['flying', 'bug'], area: 1.5, badMoves: ['rock', 'ground'], badCd: 1.35,
    good: `${N(['flying', 'bug'])}招式覆盖面积 +50%`, bad: `${N(['rock', 'ground'])}招式冷却时间 +35%`, color: '#eef6ff',
  },
  clearing: {
    id: 'clearing', name: '开阔空地', types: ['normal', 'ground', 'fighting'], crit: true, badMoves: ['electric', 'ghost'], badDmg: 0.8,
    good: `${N(['normal', 'ground', 'fighting'])}招式暴击率 +15%`, bad: `${N(['electric', 'ghost'])}招式伤害 −20%`, color: '#f0cc70',
  },
  frost: {
    id: 'frost', name: '寒霜区域', types: ['ice', 'water', 'steel'], chill: true, badMoves: ['fire'], badCd: 1.35,
    good: `${N(['ice', 'water', 'steel'])}招式命中后使目标减速 20%（2 秒）`, bad: '火系招式冷却时间 +35%', color: '#bfefff',
  },
};

/** 场地的完整规则（说明页、悬停提示） */
export function terrainRules(id: TerrainId): string[] {
  const D = TERRAINS[id];
  const out = [`获益属性：${D.types.map((t) => TYPE_NAME[t]).join('、')}`, `有利：${D.good}`, `不利：${D.bad}`];
  if (id === 'lava') out.push(`灼伤每秒掉 2% 最大 HP（精英 1%、首领 0.5%），最多烧到剩 1 HP；离开后还会持续 ${BURN_LINGER} 秒。`);
  if (id === 'crystal') out.push('能量圈是场地中心晶石周围的小圈，比整个场地小；不利效果在整个场地里都生效。');
  if (id === 'frost') out.push('重复命中会刷新减速时间，不会叠加。');
  return out;
}

// ---------------------------------------------------------------- 属性位

const TYPE_BIT = Object.fromEntries(TYPES.map((t, i) => [t, 1 << i])) as Record<PType, number>;
const maskCache = new WeakMap<readonly PType[], number>();

/** 单位属性的位掩码（属性数组是图鉴里的固定对象，按数组缓存） */
export function typeMask(types: readonly PType[]): number {
  let m = maskCache.get(types);
  if (m === undefined) {
    m = 0;
    for (const t of types) m |= TYPE_BIT[t];
    maskCache.set(types, m);
  }
  return m;
}

interface Masks { good: number; bad: number; slowHas: number; slowNot: number; burnNot: number }
const MASKS = Object.fromEntries(TERRAIN_IDS.map((id) => {
  const D = TERRAINS[id];
  const m = (ts?: PType[]) => (ts ? ts.reduce((a, t) => a | TYPE_BIT[t], 0) : 0);
  return [id, { good: m(D.types), bad: m(D.badMoves), slowHas: m(D.slow?.has), slowNot: m(D.slow?.not), burnNot: m(D.burn) }];
})) as Record<TerrainId, Masks>;

// ---------------------------------------------------------------- 场地与判定

export interface Terrain {
  kind: TerrainId;
  gw: number;
  gh: number;
  /** 每个格子是否属于场地（gw × gh，按行） */
  cells: Uint8Array;
  /** 格子数 */
  count: number;
  /** 场地最靠里的点（共鸣晶石的位置）与能量圈半径（像素） */
  cx: number;
  cy: number;
  cr: number;
}

export function inTerrain(t: Terrain | null, x: number, y: number): boolean {
  if (!t || x < 0 || y < 0) return false;
  const gx = (x / TERRAIN_CELL) | 0, gy = (y / TERRAIN_CELL) | 0;
  return gx < t.gw && gy < t.gh && t.cells[gy * t.gw + gx] === 1;
}

/** 共鸣晶石的能量圈 */
export function inCircle(t: Terrain | null, x: number, y: number): boolean {
  return !!t && (x - t.cx) ** 2 + (y - t.cy) ** 2 <= t.cr * t.cr;
}

/** 正面加成是否生效：共鸣晶石看能量圈，其它看整个场地 */
function goodHere(t: Terrain, x: number, y: number) {
  return inTerrain(t, x, y) && (!TERRAINS[t.kind].circle || inCircle(t, x, y));
}

/** 站在 (x, y) 施放 type 属性的招式：伤害倍率 */
export function terrainDmg(t: Terrain | null, x: number, y: number, type: PType): number {
  if (!t) return 1;
  const D = TERRAINS[t.kind], M = MASKS[t.kind], b = TYPE_BIT[type];
  let m = 1;
  if (D.dmg && M.good & b && goodHere(t, x, y)) m *= D.dmg;
  if (D.badDmg && M.bad & b && inTerrain(t, x, y)) m *= D.badDmg;
  return m;
}

/** 冷却时间倍率（2 = 冷却时间翻倍） */
export function terrainCd(t: Terrain | null, x: number, y: number, type: PType): number {
  if (!t) return 1;
  const D = TERRAINS[t.kind], M = MASKS[t.kind], b = TYPE_BIT[type];
  if (!(b & (M.good | M.bad)) || !inTerrain(t, x, y)) return 1;
  let m = 1;
  if (D.cd && M.good & b) m *= D.cd;
  if (D.badCd && M.bad & b) m *= D.badCd;
  return m;
}

/** 覆盖面积倍率（圆形范围的半径按平方根放大，光束按宽度放大） */
export function terrainArea(t: Terrain | null, x: number, y: number, type: PType): number {
  if (!t) return 1;
  const D = TERRAINS[t.kind];
  return D.area && MASKS[t.kind].good & TYPE_BIT[type] && inTerrain(t, x, y) ? D.area : 1;
}

/** 命中时的场地效果：TF_CRIT / TF_LEECH / TF_CHILL */
export function terrainHitFlags(t: Terrain | null, x: number, y: number, type: PType): number {
  if (!t) return 0;
  const D = TERRAINS[t.kind];
  if (!(D.crit || D.leech || D.chill) || !(MASKS[t.kind].good & TYPE_BIT[type]) || !inTerrain(t, x, y)) return 0;
  return (D.crit ? TF_CRIT : 0) | (D.leech ? TF_LEECH : 0) | (D.chill ? TF_CHILL : 0);
}

/** 移动速度倍率：unit 为单位自身属性的位掩码 */
export function terrainMove(t: Terrain | null, x: number, y: number, unit: number): number {
  if (!t) return 1;
  const S = TERRAINS[t.kind].slow;
  if (!S) return 1;
  const M = MASKS[t.kind];
  const hit = S.has ? (unit & M.slowHas) !== 0 : (unit & M.slowNot) === 0;
  return hit && inTerrain(t, x, y) ? 1 - S.amt : 1;
}

/** 站在这里会不会灼伤 */
export function terrainBurns(t: Terrain | null, x: number, y: number, unit: number): boolean {
  return !!t && t.kind === 'lava' && (unit & MASKS.lava.burnNot) === 0 && inTerrain(t, x, y);
}

/** 这种场地会不会让这个单位减速 / 灼伤（不看位置，界面提示用） */
export function terrainHurtsUnit(id: TerrainId, unit: number): { slow: number; burn: boolean } {
  const D = TERRAINS[id], M = MASKS[id];
  const slow = D.slow ? ((D.slow.has ? (unit & M.slowHas) !== 0 : (unit & M.slowNot) === 0) ? D.slow.amt : 0) : 0;
  return { slow, burn: !!D.burn && (unit & M.burnNot) === 0 };
}

/** 招式属性在这种场地里是获益（1）、受损（-1）还是不受影响（0） */
export function terrainMoveSide(id: TerrainId, type: PType): number {
  const b = TYPE_BIT[type], M = MASKS[id];
  return M.good & b ? 1 : M.bad & b ? -1 : 0;
}

/**
 * 这块场地对一只宝可梦值不值得站进去（自动走位用）：招式获益 +1、受损 −1（按招式个数平均），
 * 会灼伤再 −1.5，会减速再 −减速比例×3。
 */
export function terrainValue(id: TerrainId, unit: number, moves: readonly PType[]): number {
  let v = 0;
  for (const t of moves) v += terrainMoveSide(id, t);
  v /= Math.max(1, moves.length);
  const h = terrainHurtsUnit(id, unit);
  if (h.burn) v -= 1.5;
  return v - h.slow * 3;
}

// ---------------------------------------------------------------- 生成

export interface TerrainGenOpts {
  w: number;
  h: number;
  /** 不能有场地的圆（出生点） */
  clearX: number;
  clearY: number;
  clearR: number;
  /** 指定格子数（测试用） */
  size?: number;
}

/** 各个地区更容易出现的场地 */
const BIOME_WEIGHTS: Record<TerrainId, number>[] = [
  { clearing: 3, thicket: 3, rain: 2, updraft: 2, lava: 1, miasma: 1, crystal: 1, frost: 1 },
  { thicket: 3, miasma: 2.5, rain: 2, updraft: 2, clearing: 1, lava: 1, crystal: 1, frost: 1 },
  { lava: 3, crystal: 2.5, frost: 2, clearing: 2, miasma: 1, updraft: 1, rain: 1, thicket: 1 },
  { miasma: 3, crystal: 3, frost: 2, lava: 1.5, rain: 1, updraft: 1, clearing: 1, thicket: 1 },
];

/** 按地区挑一种场地，不和上一波重复 */
export function pickTerrain(rng: Rng, biome: number, prev: TerrainId | null): TerrainId {
  const w: Partial<Record<TerrainId, number>> = { ...(BIOME_WEIGHTS[biome] ?? BIOME_WEIGHTS[0]) };
  if (prev) delete w[prev];
  return rng.weighted(w);
}

/**
 * 4 邻接的洪水填充：从 starts 出发，把 pass(j) 为真的格子都标进 mark（mark 里已标的不再走），返回走到的格子数。
 * 生成时每波要做好几次，用定长的栈、直接算邻格下标，免得拖慢模拟。
 */
function flood(n: number, gw: number, mark: Uint8Array, stack: Int32Array, top: number, pass: (j: number) => boolean): number {
  let seen = top;
  while (top > 0) {
    const c = stack[--top];
    const x = c % gw;
    if (x > 0 && !mark[c - 1] && pass(c - 1)) { mark[c - 1] = 1; stack[top++] = c - 1; seen++; }
    if (x < gw - 1 && !mark[c + 1] && pass(c + 1)) { mark[c + 1] = 1; stack[top++] = c + 1; seen++; }
    if (c >= gw && !mark[c - gw] && pass(c - gw)) { mark[c - gw] = 1; stack[top++] = c - gw; seen++; }
    if (c + gw < n && !mark[c + gw] && pass(c + gw)) { mark[c + gw] = 1; stack[top++] = c + gw; seen++; }
  }
  return seen;
}

function countCells(cells: Uint8Array): number {
  let k = 0;
  for (let i = 0; i < cells.length; i++) k += cells[i];
  return k;
}

/** 生成时用的临时数组：全部复用同一批（每个用到的地方自己清零），不给模拟添垃圾 */
const scratch = { n: 0, allowed: new Uint8Array(0), front: new Uint8Array(0), mark: new Uint8Array(0), stack: new Int32Array(0), weight: new Float32Array(0), dist: new Int16Array(0) };
function buf(n: number) {
  if (scratch.n !== n) {
    scratch.n = n;
    scratch.allowed = new Uint8Array(n);
    scratch.front = new Uint8Array(n);
    scratch.mark = new Uint8Array(n);
    scratch.stack = new Int32Array(n);
    scratch.weight = new Float32Array(n);
    scratch.dist = new Int16Array(n);
  }
  return scratch;
}

/** 4 邻接的连通块数（测试与生成时的检查） */
export function terrainPieces(cells: Uint8Array, gw: number, _gh?: number): number {
  const n = cells.length;
  const { mark: seen, stack } = buf(n);
  seen.fill(0);
  const pass = (j: number) => cells[j] === 1;
  let pieces = 0;
  for (let i = 0; i < n; i++) {
    if (!cells[i] || seen[i]) continue;
    pieces++;
    seen[i] = 1;
    stack[0] = i;
    flood(n, gw, seen, stack, 1, pass);
  }
  return pieces;
}

/** 是否连成一整块（共 count 格）：从任意一格出发能走遍所有格子 */
function connected(cells: Uint8Array, gw: number, count: number, seen: Uint8Array, stack: Int32Array): boolean {
  const n = cells.length;
  let start = -1;
  for (let i = 0; i < n && start < 0; i++) if (cells[i]) start = i;
  if (start < 0) return count === 0;
  seen.fill(0);
  seen[start] = 1;
  stack[0] = start;
  return flood(n, gw, seen, stack, 1, (j) => cells[j] === 1) === count;
}

/**
 * 生成一块场地：从一个格子出发向相邻的格子随机生长（天然连通），生长时偏向一条随机折线附近，
 * 形状有圆团、长条和弯折的；再填平小缺口、去掉细小的突起、补上中间的空洞，面积在下限与地图的 1/3 之间。
 */
export function genTerrain(rng: Rng, kind: TerrainId, o: TerrainGenOpts): Terrain {
  const gw = Math.ceil(o.w / TERRAIN_CELL), gh = Math.ceil(o.h / TERRAIN_CELL), n = gw * gh;
  const max = Math.floor(n / 3), min = Math.min(TERRAIN_MIN_CELLS, max);
  const allowed = buf(n).allowed;
  const clear2 = (o.clearR + TERRAIN_CELL * 0.75) ** 2;
  for (let i = 0; i < n; i++) {
    const x = ((i % gw) + 0.5) * TERRAIN_CELL, y = (((i / gw) | 0) + 0.5) * TERRAIN_CELL;
    allowed[i] = (x - o.clearX) ** 2 + (y - o.clearY) ** 2 > clear2 ? 1 : 0;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const cells = grow(rng, kind, gw, gh, allowed, o, min, max);
    if (!cells) continue;
    smooth(cells, gw, gh, allowed);
    let count = countCells(cells);
    if (count > max) count = trim(cells, gw, gh, count - max);
    if (count < min || count > max || terrainPieces(cells, gw, gh) !== 1) continue;
    return finish(kind, cells, gw, gh, count);
  }
  // 几乎不会走到这里：在离出生点最远的角落放一块圆形的场地
  const cells = new Uint8Array(n);
  const cx = o.clearX < o.w / 2 ? gw - 7 : 6, cy = o.clearY < o.h / 2 ? gh - 6 : 5;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 30 && allowed[y * gw + x]) cells[y * gw + x] = 1;
  return finish(kind, cells, gw, gh, countCells(cells));
}

function grow(rng: Rng, kind: TerrainId, gw: number, gh: number, allowed: Uint8Array, o: TerrainGenOpts, min: number, max: number): Uint8Array | null {
  const n = gw * gh;
  const target = o.size ?? Math.round(min + 16 + (max * 0.88 - min - 16) * rng.next() ** 1.25);
  // 种子：离出生点留出一段距离，离地图边缘至少 2 格
  const far2 = (o.clearR + TERRAIN_CELL * 3) ** 2;
  let seed = -1;
  for (let tries = 0; tries < 60 && seed < 0; tries++) {
    const x = rng.int(2, gw - 3), y = rng.int(2, gh - 3);
    const px = (x + 0.5) * TERRAIN_CELL, py = (y + 0.5) * TERRAIN_CELL;
    if ((px - o.clearX) ** 2 + (py - o.clearY) ** 2 > far2) seed = y * gw + x;
  }
  if (seed < 0) return null;
  const sx = seed % gw, sy = (seed / gw) | 0;
  // 生长偏向的折线：0 段是圆团，1 段是长条，2 段是弯折的；晶石要圆一些，中间才放得下能量圈
  const R = Math.sqrt(target / Math.PI);
  const segs = kind === 'crystal' ? 0 : rng.int(0, 2);
  const pts: [number, number][] = [[sx, sy]];
  let ang = rng.range(0, Math.PI * 2);
  for (let i = 0; i < segs; i++) {
    const [lx, ly] = pts[pts.length - 1];
    const len = R * rng.range(0.7, 1.3);
    pts.push([lx + Math.cos(ang) * len, ly + Math.sin(ang) * len]);
    ang += rng.range(-1.5, 1.5);
  }
  const sigma = R * (segs ? rng.range(0.5, 0.75) : rng.range(0.7, 1));
  // 每个格子的生长权重：离折线越近越大，再乘上一点随机（只给碰到的格子算）
  const { weight, front: inFront } = buf(n);
  inFront.fill(0);
  const weigh = (i: number) => {
    const x = i % gw, y = (i / gw) | 0;
    let d2 = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[Math.min(pts.length - 1, k + 1)];
      const vx = bx - ax, vy = by - ay;
      const L = vx * vx + vy * vy;
      const f = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
      d2 = Math.min(d2, (x - ax - vx * f) ** 2 + (y - ay - vy * f) ** 2);
    }
    return (weight[i] = rng.range(0.4, 1.6) * (Math.exp(-d2 / (sigma * sigma)) + 0.004));
  };
  const cells = new Uint8Array(n);
  const front: number[] = [];
  let total = 0;
  const touch = (j: number) => {
    if (!cells[j] && !inFront[j] && allowed[j]) { inFront[j] = 1; front.push(j); total += weigh(j); }
  };
  const add = (i: number) => {
    cells[i] = 1;
    const x = i % gw;
    if (x < gw - 1) touch(i + 1);
    if (x > 0) touch(i - 1);
    if (i + gw < n) touch(i + gw);
    if (i >= gw) touch(i - gw);
  };
  add(seed);
  let count = 1;
  while (count < target && front.length) {
    let r = rng.next() * total, k = 0;
    for (; k < front.length - 1; k++) { r -= weight[front[k]]; if (r <= 0) break; }
    const j = front[k];
    front[k] = front[front.length - 1];
    front.pop();
    inFront[j] = 0;
    total -= weight[j];
    add(j);
    count++;
  }
  return count >= min ? cells : null;
}

function neighbors(cells: Uint8Array, gw: number, gh: number, i: number) {
  const x = i % gw, y = (i / gw) | 0;
  let k = 0;
  if (x > 0 && cells[i - 1]) k++;
  if (x < gw - 1 && cells[i + 1]) k++;
  if (y > 0 && cells[i - gw]) k++;
  if (y < gh - 1 && cells[i + gw]) k++;
  return k;
}

/** 平滑边缘：填平三面被包住的缺口、去掉只连着一格的突起，再补上被包在中间的空洞（都不会让场地断开） */
function smooth(cells: Uint8Array, gw: number, gh: number, allowed: Uint8Array) {
  const n = gw * gh;
  for (let pass = 0; pass < 2; pass++) {
    const fill: number[] = [], cut: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = neighbors(cells, gw, gh, i);
      if (!cells[i] && allowed[i] && k >= 3) fill.push(i);
      else if (cells[i] && k <= 1) cut.push(i);
    }
    for (const i of fill) cells[i] = 1;
    for (const i of cut) if (neighbors(cells, gw, gh, i) <= 1) cells[i] = 0;
  }
  // 从地图边缘出发能走到的空地是外面，走不到的就是空洞
  const { mark: outside, stack } = buf(n);
  outside.fill(0);
  let top = 0;
  for (let i = 0; i < n; i++) {
    const x = i % gw, y = (i / gw) | 0;
    if ((x === 0 || y === 0 || x === gw - 1 || y === gh - 1) && !cells[i]) { outside[i] = 1; stack[top++] = i; }
  }
  flood(n, gw, outside, stack, top, (j) => !cells[j]);
  for (let i = 0; i < n; i++) if (!cells[i] && !outside[i] && allowed[i]) cells[i] = 1;
}

/** 面积超过上限时，从离中心最远的边缘开始去掉格子（去掉后仍然连通才去） */
function trim(cells: Uint8Array, gw: number, gh: number, over: number): number {
  let count = countCells(cells);
  const { mark: seen, stack } = buf(cells.length);
  let sx = 0, sy = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i]) { sx += i % gw; sy += (i / gw) | 0; }
  sx /= count; sy /= count;
  for (let guard = 0; over > 0 && guard < 4; guard++) {
    const edge: [number, number][] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] && neighbors(cells, gw, gh, i) < 4) edge.push([i, ((i % gw) - sx) ** 2 + (((i / gw) | 0) - sy) ** 2]);
    }
    edge.sort((a, b) => b[1] - a[1]);
    for (const [i] of edge) {
      if (over <= 0) break;
      cells[i] = 0;
      if (connected(cells, gw, count - 1, seen, stack)) { over--; count--; } else cells[i] = 1;
    }
  }
  return count;
}

/** 算出最靠里的格子（离场地外面最远，一样远时取离重心近的）作为晶石的位置，能量圈放得进场地 */
function finish(kind: TerrainId, cells: Uint8Array, gw: number, gh: number, count: number): Terrain {
  const n = gw * gh;
  // 到最近的场地外格子（地图外也算）的棋盘距离：正反各扫一遍
  const dist = buf(n).dist;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!cells[i]) { dist[i] = 0; continue; }
      if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) { dist[i] = 1; continue; }
      dist[i] = Math.min(dist[i - 1], dist[i - gw - 1], dist[i - gw], dist[i - gw + 1]) + 1;
    }
  }
  for (let y = gh - 2; y > 0; y--) {
    for (let x = gw - 2; x > 0; x--) {
      const i = y * gw + x;
      if (dist[i] > 1) dist[i] = Math.min(dist[i], Math.min(dist[i + 1], dist[i + gw + 1], dist[i + gw], dist[i + gw - 1]) + 1);
    }
  }
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) if (cells[i]) { mx += i % gw; my += (i / gw) | 0; }
  mx /= Math.max(1, count); my /= Math.max(1, count);
  let best = -1, bd = -1, bc = Infinity;
  for (let i = 0; i < n; i++) {
    if (!cells[i]) continue;
    const c = ((i % gw) - mx) ** 2 + (((i / gw) | 0) - my) ** 2;
    if (dist[i] > bd || (dist[i] === bd && c < bc)) { best = i; bd = dist[i]; bc = c; }
  }
  const cx = ((best % gw) + 0.5) * TERRAIN_CELL, cy = (((best / gw) | 0) + 0.5) * TERRAIN_CELL;
  // 能量圈：放得进场地，而且明显比整个场地小（半径不超过同面积圆的 60%）
  const cr = Math.round(Math.max(28, Math.min(72, (bd - 0.75) * TERRAIN_CELL, Math.sqrt(count / Math.PI) * 0.6 * TERRAIN_CELL)));
  return { kind, gw, gh, cells, count, cx: Math.round(cx), cy: Math.round(cy), cr };
}

// ---------------------------------------------------------------- 网络：格子压成位图，再转成 base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function packCells(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 24) * 3);
  for (let i = 0; i < cells.length; i++) if (cells[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
  }
  return s;
}

export function unpackCells(s: string, n: number): Uint8Array {
  const cells = new Uint8Array(n);
  for (let i = 0, b = 0; i + 3 < s.length; i += 4, b += 3) {
    const v = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | (B64.indexOf(s[i + 2]) << 6) | B64.indexOf(s[i + 3]);
    for (let k = 0; k < 3; k++) {
      const byte = (v >> (16 - k * 8)) & 255;
      for (let bit = 0; bit < 8; bit++) {
        const idx = (b + k) * 8 + bit;
        if (idx < n && byte & (1 << bit)) cells[idx] = 1;
      }
    }
  }
  return cells;
}

/** 波次开始时发给客户端的事件：['terrain', 种类序号, 宽格数, 高格数, 位图, 晶石 x, y, 能量圈半径]；没有场地时种类为 -1 */
export function terrainEvent(t: Terrain | null): (string | number)[] {
  if (!t) return ['terrain', -1];
  return ['terrain', TERRAIN_IDS.indexOf(t.kind), t.gw, t.gh, packCells(t.cells), t.cx, t.cy, t.cr];
}

export function terrainFromEvent(ev: readonly unknown[]): Terrain | null {
  const k = ev[1] as number;
  const kind = TERRAIN_IDS[k];
  if (!kind) return null;
  const gw = ev[2] as number, gh = ev[3] as number;
  const cells = unpackCells(ev[4] as string, gw * gh);
  return { kind, gw, gh, cells, count: cells.reduce((a, c) => a + c, 0), cx: ev[5] as number, cy: ev[6] as number, cr: ev[7] as number };
}
