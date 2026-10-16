/**
 * 局部属性场地：冒险的地图上随机出现一块连续的小范围环境，给至少两种属性带来优势，也带来明确的不利效果。
 * 玩家和野生宝可梦遵守同一套规则：
 *  - 招式修正看招式的属性，以及出招那一刻站在哪块场地里（伤害、冷却、覆盖面积、暴击、命中回复、命中减速）
 *  - 站在场地里会不会被灼伤、减速，看宝可梦自己的属性
 * 野生宝可梦的攻击（接触、弹幕、自爆、落石……）按它的第一属性算。
 * 场地由 16×16 的格子拼成，每块都是 4 邻接连续的一整块，最多占整张地图的 1/3。
 */
import type { Rng } from './rng';
import { TYPE_NAME, type PType } from './types';

export type FieldId = 'lava' | 'smog' | 'rain' | 'grass' | 'crystal' | 'updraft' | 'clearing' | 'frost';
export const FIELD_IDS: FieldId[] = ['lava', 'smog', 'rain', 'grass', 'crystal', 'updraft', 'clearing', 'frost'];

/** 在场地里放出的招式（按招式的属性）受到的修正 */
export interface MoveRule {
  types: PType[];
  /** 伤害倍率 */
  dmg?: number;
  /** 冷却时间倍率 */
  cd?: number;
  /** 覆盖面积倍率（半径、宽度按平方根放大） */
  area?: number;
  /** 暴击率（百分点） */
  crit?: number;
  /** 命中后回复造成伤害的这个比例 */
  drain?: number;
  /** 命中后让目标减速 */
  chill?: boolean;
}

/** 站在场地里的宝可梦（按自己的属性）受到的影响：has 有其中一种属性的受影响，lacks 一种都没有的受影响 */
export interface BodyRule {
  has?: PType[];
  lacks?: PType[];
  /** 移动速度倍率 */
  speed?: number;
  /** 灼伤：持续掉血，物理伤害降低 */
  burn?: boolean;
}

export interface FieldDef {
  id: FieldId;
  name: string;
  /** 获益的属性 */
  types: PType[];
  moves: MoveRule[];
  body?: BodyRule;
  /** 正面加成、负面效果的完整说明 */
  good: string;
  bad: string;
  /** HUD 上的短说明：[正面, 负面] */
  short: [string, string];
  color: string;
}

export const FIELD_CELL = 16;
/** 每块场地最多占整张地图的 1/3，最少 5% */
export const FIELD_MAX_FRAC = 1 / 3;
export const FIELD_MIN_FRAC = 0.05;
/** 同时出现的场地加起来最多占地图的比例 */
export const FIELD_TOTAL_FRAC = 0.45;
/** 场地出现后先闪烁预告这么多秒才生效 */
export const FIELD_FORM = 2;
/** 第几波开始出现场地；第几波开始，波次中途还会再出现一块 */
export const FIELD_FROM = 2;
export const FIELD_SECOND_FROM = 6;

/** 熔岩池的灼伤：每秒损失最大 HP 的 3%（精英和首领只有 1/3），离开后还会持续 2 秒；灼伤期间物理伤害减半 */
export const LAVA_DPS = 0.03;
export const LAVA_BIG = 1 / 3;
export const LAVA_LINGER = 2;
export const BURN_PHYS = 0.5;
/** 繁茂草丛：命中回复伤害的 5%，每秒最多回复最大 HP 的 2% */
export const GRASS_DRAIN = 0.05;
export const GRASS_DRAIN_CAP = 0.02;
/** 寒霜区域：命中后减速 20%，持续 2 秒 */
export const FROST_SLOW = 0.2;
export const FROST_SLOW_DUR = 2;

export const FIELDS: Record<FieldId, FieldDef> = {
  lava: {
    id: 'lava', name: '熔岩池', types: ['fire', 'rock'], color: '#ff7a2a',
    moves: [{ types: ['fire', 'rock'], dmg: 1.25 }],
    body: { lacks: ['fire', 'rock'], burn: true },
    good: '火 / 岩石招式伤害 +25%',
    bad: '非火 / 岩石系宝可梦进入后灼伤：持续掉血，物理伤害降低 50%',
    short: ['火 / 岩石招式伤害 +25%', '其他属性进入会灼伤：掉血、物理伤害减半'],
  },
  smog: {
    id: 'smog', name: '阴云毒雾', types: ['poison', 'ghost', 'dark'], color: '#c070f0',
    moves: [{ types: ['poison', 'ghost', 'dark'], area: 2 }, { types: ['grass', 'electric'], cd: 2 }],
    good: '毒 / 幽灵 / 恶招式的覆盖面积翻倍',
    bad: '草 / 电招式冷却时间翻倍',
    short: ['毒 / 幽灵 / 恶招式范围翻倍', '草 / 电招式冷却翻倍'],
  },
  rain: {
    id: 'rain', name: '局部阵雨', types: ['water', 'electric'], color: '#6ab0ff',
    moves: [{ types: ['water', 'electric'], cd: 0.8 }],
    body: { has: ['flying'], speed: 0.75 },
    good: '水 / 电招式冷却时间减少 20%',
    bad: '飞行系宝可梦移动速度降低 25%',
    short: ['水 / 电招式冷却 -20%', '飞行系移动速度 -25%'],
  },
  grass: {
    id: 'grass', name: '繁茂草丛', types: ['grass', 'bug'], color: '#6ad050',
    moves: [{ types: ['grass', 'bug'], drain: GRASS_DRAIN }],
    body: { lacks: ['grass', 'bug'], speed: 0.8 },
    good: '草 / 虫招式命中后，回复造成伤害的 5%；每秒回复上限为最大生命值的 2%',
    bad: '非草 / 虫系宝可梦移动速度降低 20%',
    short: ['草 / 虫招式命中回复伤害的 5%', '其他属性移动速度 -20%'],
  },
  crystal: {
    id: 'crystal', name: '共鸣晶石', types: ['psychic', 'fairy', 'dragon'], color: '#ff8ad8',
    moves: [{ types: ['psychic', 'fairy', 'dragon'], dmg: 1.25 }, { types: ['dark', 'ghost'], dmg: 0.8 }],
    good: '晶石周围的能量圈内，超能力 / 妖精 / 龙招式伤害 +25%',
    bad: '恶 / 幽灵招式伤害降低 20%',
    short: ['超能力 / 妖精 / 龙招式伤害 +25%', '恶 / 幽灵招式伤害 -20%'],
  },
  updraft: {
    id: 'updraft', name: '上升气流', types: ['flying', 'bug'], color: '#a8e4ff',
    moves: [{ types: ['flying', 'bug'], area: 1.5 }, { types: ['rock', 'ground'], cd: 1.35 }],
    good: '飞行 / 虫招式的覆盖面积增加 50%',
    bad: '岩石 / 地面招式冷却时间增加 35%',
    short: ['飞行 / 虫招式范围 +50%', '岩石 / 地面招式冷却 +35%'],
  },
  clearing: {
    id: 'clearing', name: '开阔空地', types: ['normal', 'ground', 'fighting'], color: '#e8c870',
    moves: [{ types: ['normal', 'ground', 'fighting'], crit: 15 }, { types: ['electric', 'ghost'], dmg: 0.8 }],
    good: '一般 / 地面 / 格斗招式的暴击率增加 15 个百分点',
    bad: '电 / 幽灵招式伤害降低 20%',
    short: ['一般 / 地面 / 格斗招式暴击率 +15%', '电 / 幽灵招式伤害 -20%'],
  },
  frost: {
    id: 'frost', name: '寒霜区域', types: ['ice', 'water', 'steel'], color: '#c8f4ff',
    moves: [{ types: ['ice', 'water', 'steel'], chill: true }, { types: ['fire'], cd: 1.35 }],
    good: '冰 / 水 / 钢招式命中后，使目标减速 20%，持续 2 秒，重复命中刷新时间',
    bad: '火系招式冷却时间增加 35%',
    short: ['冰 / 水 / 钢招式命中减速 20%', '火系招式冷却 +35%'],
  },
};

export const fieldTypesText = (f: FieldDef) => f.types.map((t) => TYPE_NAME[t]).join(' · ');

// ---------------------------------------------------------------- 修正

/** 一次出招受到的场地修正；size 是半径和宽度的倍率（覆盖面积开平方） */
export interface MoveMod { dmg: number; cd: number; size: number; crit: number; drain: number; chill: boolean }
export const NO_MOVE_MOD: Readonly<MoveMod> = Object.freeze({ dmg: 1, cd: 1, size: 1, crit: 0, drain: 0, chill: false });

const MOVE_TABLE = {} as Record<FieldId, Partial<Record<PType, MoveMod>>>;
for (const id of FIELD_IDS) {
  const row: Partial<Record<PType, MoveMod>> = {};
  for (const r of FIELDS[id].moves) {
    for (const t of r.types) {
      const m = (row[t] ??= { ...NO_MOVE_MOD });
      if (r.dmg) m.dmg *= r.dmg;
      if (r.cd) m.cd *= r.cd;
      if (r.area) m.size *= Math.sqrt(r.area);
      if (r.crit) m.crit += r.crit;
      if (r.drain) m.drain += r.drain;
      if (r.chill) m.chill = true;
    }
  }
  MOVE_TABLE[id] = row;
}

/** 在场地 f 里放出 type 属性的招式（不在场地里时没有修正） */
export function moveMod(f: FieldId | null, type: PType): Readonly<MoveMod> {
  return (f && MOVE_TABLE[f][type]) || NO_MOVE_MOD;
}

/** 属性为 types 的宝可梦站在场地 f 里会不会受到场地的影响（灼伤、减速） */
export function bodyHit(f: FieldId | null, types: readonly PType[]): boolean {
  const b = f ? FIELDS[f].body : undefined;
  if (!b) return false;
  if (b.has) return types.some((t) => b.has!.includes(t));
  if (b.lacks) return !types.some((t) => b.lacks!.includes(t));
  return true;
}

/** 站在场地里的移动速度倍率 */
export function fieldSpeed(f: FieldId | null, types: readonly PType[]): number {
  return f && FIELDS[f].body?.speed && bodyHit(f, types) ? FIELDS[f].body!.speed! : 1;
}

/** 站在场地里会不会被灼伤 */
export function fieldBurns(f: FieldId | null, types: readonly PType[]): boolean {
  return !!f && !!FIELDS[f].body?.burn && bodyHit(f, types);
}

export type FieldVerdict = 'good' | 'bad' | 'mixed' | 'none';

/**
 * 这块场地对一只宝可梦（自己的属性 + 会的招式）是好是坏：HUD 上的「对你有利 / 不利」和 AI 走位都用它。
 * score > 0 有利，< 0 不利。
 */
export function fieldVerdict(f: FieldId, types: readonly PType[], moves: readonly { type: PType; damaging: boolean; phys: boolean }[]): { verdict: FieldVerdict; score: number } {
  let pro = 0, con = 0;
  const add = (v: number) => { if (v > 0) pro += v; else con -= v; };
  const burn = fieldBurns(f, types);
  for (const mv of moves) {
    const m = moveMod(f, mv.type);
    add((1 / m.cd - 1) * 3);
    if (!mv.damaging) continue;
    add((m.dmg - 1) * 4);
    add((m.size * m.size - 1) * 0.8);
    add(m.crit / 15);
    if (m.drain) add(0.8);
    if (m.chill) add(0.6);
    if (burn && mv.phys) add(-1);
  }
  if (burn) add(-3);
  add((fieldSpeed(f, types) - 1) * 6);
  const verdict: FieldVerdict = pro < 0.05 && con < 0.05 ? 'none' : con < 0.05 || pro > con * 2.5 ? 'good' : pro < 0.05 || con > pro * 2.5 ? 'bad' : 'mixed';
  return { verdict, score: pro - con };
}

// ---------------------------------------------------------------- 场地实例与格子

export interface Field {
  id: number;
  kind: FieldId;
  /** 占据的格子（按行优先的编号）：4 邻接连续的一整块 */
  cells: number[];
  /** 中心（晶石的位置、名字显示的位置），一定在场地里 */
  cx: number;
  cy: number;
  /** 波次时间：这之前是闪烁的预告，还不生效 */
  activeAt: number;
}

export function fieldGrid(w: number, h: number) {
  return { cols: Math.ceil(w / FIELD_CELL), rows: Math.ceil(h / FIELD_CELL) };
}

/** 世界坐标所在的格子编号；在地图外时为 -1 */
export function cellAt(cols: number, rows: number, x: number, y: number): number {
  const cx = Math.floor(x / FIELD_CELL), cy = Math.floor(y / FIELD_CELL);
  return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx;
}

/** 线上传格子：[起点, 长度, 起点, 长度, ...]（按行优先编号的连续段） */
export function encodeCells(cells: readonly number[]): number[] {
  const s = cells.slice().sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(s[i], j - i + 1);
    i = j + 1;
  }
  return out;
}

export function decodeCells(runs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < runs.length; i += 2) for (let k = 0; k < runs[i + 1]; k++) out.push(runs[i] + k);
  return out;
}

/** 4 邻接连通的块数（测试与校验用） */
export function components(cols: number, cells: readonly number[]): number {
  const set = new Set(cells);
  const seen = new Set<number>();
  let n = 0;
  for (const c of cells) {
    if (seen.has(c)) continue;
    n++;
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % cols;
      for (const nb of [k - cols, k + cols, x > 0 ? k - 1 : -1, x < cols - 1 ? k + 1 : -1]) {
        if (nb >= 0 && set.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------- 随机生成

/** 每个地区更常见的场地 */
export const BIOME_FIELDS: Partial<Record<FieldId, number>>[] = [
  { clearing: 1.6, rain: 1.3, grass: 1.3, updraft: 1.2 },
  { grass: 1.8, updraft: 1.3, rain: 1.2, smog: 1.2 },
  { crystal: 1.8, lava: 1.4, frost: 1.3, clearing: 1.2 },
  { smog: 1.8, crystal: 1.4, frost: 1.2, lava: 1.1 },
];

/** 随机挑一种场地：按地区加权，和队伍里宝可梦的属性对得上的更常出现；exclude 里的不选 */
export function pickFieldKind(rng: Rng, biome: number, team: readonly (readonly PType[])[], exclude: readonly FieldId[]): FieldId {
  const w: Partial<Record<FieldId, number>> = {};
  for (const id of FIELD_IDS) {
    if (exclude.includes(id)) continue;
    let k = BIOME_FIELDS[biome]?.[id] ?? 1;
    for (const types of team) if (FIELDS[id].types.some((t) => types.includes(t))) k *= 1.25;
    w[id] = k;
  }
  return Object.keys(w).length ? rng.weighted(w) : rng.pick(FIELD_IDS);
}

/** 这次场地的大小（格子数）：大多是小块，偶尔接近上限 */
export function fieldTarget(rng: Rng, total: number, max: number): number {
  const frac = FIELD_MIN_FRAC + (FIELD_MAX_FRAC - FIELD_MIN_FRAC) * rng.next() ** 1.7;
  return Math.max(Math.ceil(total * FIELD_MIN_FRAC), Math.min(max, Math.round(total * frac)));
}

export interface GrowOpts {
  cols: number;
  rows: number;
  /** 不能占的格子：其他场地和它们周围一圈、玩家脚下 */
  blocked: Uint8Array;
  target: number;
  min: number;
  max: number;
}

/** 平滑的格子噪声（0~1）：让边缘和凹凸看起来自然 */
function noiseAt(seed: number, x: number, y: number, scale: number): number {
  const h = (ix: number, iy: number) => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 场地的形状：圆团、长条、葫芦（两瓣）、多瓣、月牙（被咬掉一口） */
export const FIELD_SHAPES = ['blob', 'band', 'twin', 'cluster', 'crescent'] as const;
export type FieldShape = (typeof FIELD_SHAPES)[number];

interface Lobe { x: number; y: number; r: number; q: number; th: number }

function lobesOf(rng: Rng, shape: FieldShape, sx: number, sy: number, R: number): { lobes: Lobe[]; bite: Lobe | null } {
  const lobe = (d: number, r: number, q: number, a = rng.range(0, Math.PI * 2)): Lobe =>
    ({ x: sx + Math.cos(a) * d, y: sy + Math.sin(a) * d, r: r / Math.sqrt(q), q, th: rng.range(0, Math.PI) });
  switch (shape) {
    case 'blob': return { lobes: [lobe(0, R * rng.range(0.9, 1.05), rng.range(0.7, 1))], bite: null };
    case 'band': return { lobes: [lobe(0, R * rng.range(0.95, 1.1), rng.range(0.22, 0.4))], bite: null };
    case 'twin': {
      const a = rng.range(0, Math.PI * 2);
      return { lobes: [lobe(R * rng.range(0.75, 0.9), R * rng.range(0.5, 0.6), rng.range(0.75, 1), a), lobe(R * rng.range(0.75, 0.9), R * rng.range(0.5, 0.6), rng.range(0.75, 1), a + Math.PI)], bite: null };
    }
    case 'cluster': return { lobes: [lobe(0, R * 0.55, rng.range(0.6, 1)), lobe(R * rng.range(0.9, 1.3), R * 0.5, rng.range(0.35, 1)), lobe(R * rng.range(0.9, 1.3), R * 0.45, rng.range(0.35, 1))], bite: null };
    case 'crescent': {
      const a = rng.range(0, Math.PI * 2);
      const bite = lobe(R * 0.7, R * 0.75, 1, a);
      return { lobes: [lobe(R * 0.35, R * 1.15, rng.range(0.85, 1), a + Math.PI)], bite };
    }
  }
}

/**
 * 长出一块连续的场地：从一个格子开始，每次在边上挑一个相邻的格子并进来，所以一定是连在一起的一整块。
 * 形状由几个随机的椭圆「瓣」和噪声决定（见 FIELD_SHAPES），每次都不一样。
 */
export function growField(rng: Rng, o: GrowOpts, shape: FieldShape = rng.pick(FIELD_SHAPES)): number[] | null {
  const { cols, rows, blocked } = o;
  const N = cols * rows;
  const R = Math.sqrt(o.target / Math.PI);
  // 起点离地图边留一点距离，形状不会被边缘切掉一大半
  const m = Math.min(Math.floor(R * 0.6), Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1);
  let best: number[] | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    let seed = -1;
    for (let k = 0; k < 80; k++) {
      const c = k < 60 ? rng.int(m, rows - 1 - m) * cols + rng.int(m, cols - 1 - m) : rng.int(0, N - 1);
      if (!blocked[c]) { seed = c; break; }
    }
    if (seed < 0) return best;
    const sx = seed % cols, sy = Math.floor(seed / cols);
    const { lobes, bite } = lobesOf(rng, shape, sx, sy, R);
    const nseed = rng.int(1, 1 << 30);
    const nscale = rng.range(2.2, 4.5);
    const pot = new Float32Array(N).fill(-1);
    const shapeAt = (l: Lobe, x: number, y: number) => {
      const dx = x - l.x, dy = y - l.y;
      const u = dx * Math.cos(l.th) + dy * Math.sin(l.th), w = (-dx * Math.sin(l.th) + dy * Math.cos(l.th)) / l.q;
      return Math.exp(-((u * u + w * w) / (l.r * l.r)));
    };
    const potential = (c: number) => {
      if (pot[c] >= 0) return pot[c];
      const x = c % cols, y = Math.floor(c / cols);
      let v = 0;
      for (const l of lobes) v = Math.max(v, shapeAt(l, x, y));
      if (bite) v *= 1 - 0.95 * shapeAt(bite, x, y);
      return (pot[c] = (v + 0.02) * (0.45 + 1.1 * noiseAt(nseed, x, y, nscale)));
    };
    const inside = new Uint8Array(N);
    const inFront = new Uint8Array(N);
    const front: number[] = [];
    const cells: number[] = [];
    const neighbors = (c: number) => {
      const x = c % cols;
      return [c >= cols ? c - cols : -1, c < N - cols ? c + cols : -1, x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1];
    };
    const take = (c: number) => {
      inside[c] = 1;
      cells.push(c);
      for (const nb of neighbors(c)) if (nb >= 0 && !inside[nb] && !inFront[nb] && !blocked[nb]) { inFront[nb] = 1; front.push(nb); }
    };
    take(seed);
    while (cells.length < o.target && front.length) {
      let total = 0;
      const ws = front.map((c) => {
        let n = 0;
        for (const nb of neighbors(c)) if (nb >= 0 && inside[nb]) n++;
        const v = potential(c);
        const w = v * v * v * (1 + 0.7 * (n - 1));
        total += w;
        return w;
      });
      let r = rng.next() * total, pick = front.length - 1;
      for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) { pick = i; break; } }
      const c = front[pick];
      front[pick] = front[front.length - 1];
      front.pop();
      inFront[c] = 0;
      take(c);
    }
    // 剪掉一格宽的尖刺：只连着一个格子的格子去掉不会把场地断开
    for (let pass = 0; pass < 2; pass++) {
      for (const c of cells.slice()) {
        if (cells.length <= o.min) break;
        let n = 0;
        for (const nb of neighbors(c)) if (nb >= 0 && inside[nb]) n++;
        if (n <= 1 && c !== seed) { inside[c] = 0; cells.splice(cells.indexOf(c), 1); }
      }
    }
    // 一格宽的细腰加宽一格：看上去也是连在一起的一整块，不像两块
    for (let pass = 0; pass < 2; pass++) {
      for (const c of cells.slice()) {
        if (cells.length >= o.max) break;
        const [n, s, w, e] = neighbors(c).map((nb) => nb >= 0 && !!inside[nb]);
        const side = n && s && !w && !e ? [c - 1, c + 1] : w && e && !n && !s ? [c - cols, c + cols] : null;
        if (!side) continue;
        const x = c % cols;
        const ok = (k: number) => k >= 0 && k < N && Math.abs((k % cols) - x) <= 1 && !inside[k] && !blocked[k];
        const add = side.find(ok);
        if (add !== undefined) take(add);
      }
    }
    // 填平一格宽的缺口和小洞（只往里加相邻的格子，也不会断开）
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < front.length && cells.length < o.max; i++) {
        const c = front[i];
        if (inside[c] || blocked[c]) continue;
        let n = 0;
        for (const nb of neighbors(c)) if (nb >= 0 && inside[nb]) n++;
        if (n >= 3) take(c);
      }
    }
    if (cells.length >= o.min) return cells;
    if (!best || cells.length > best.length) best = cells;
  }
  return best && best.length >= o.min ? best : null;
}

/** 场地的中心：离所有格子平均位置最近的那个格子（世界坐标） */
export function fieldCenter(cols: number, cells: readonly number[]): { x: number; y: number } {
  let mx = 0, my = 0;
  for (const c of cells) { mx += c % cols; my += Math.floor(c / cols); }
  mx /= cells.length; my /= cells.length;
  let best = cells[0], bd = Infinity;
  for (const c of cells) {
    const d = (c % cols - mx) ** 2 + (Math.floor(c / cols) - my) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return { x: (best % cols + 0.5) * FIELD_CELL, y: (Math.floor(best / cols) + 0.5) * FIELD_CELL };
}
