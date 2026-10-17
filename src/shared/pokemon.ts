import { ABILITIES, type AbilityDef } from './abilities';
import { DEX, FAMILIES, type DexEntry, type FamilyDef } from './dex';
import { RANGED_PATTERNS, SIGNATURE, SKILLS, type SkillDef } from './skills';
import type { BaseStats } from './stats';
import type { PType } from './types';

export interface Form {
  dex: number;
  name: string;
  types: PType[];
  base: BaseStats;
  slots: number;
}

/** 解锁方式：初始伙伴 / 成就 / 星之沙购买 / 冒险中结交（recruit 为崇拜几率倍率，0 表示不会崇拜） */
export interface Unlock { start?: boolean; ach?: string; cost?: number; recruit: number }

export interface Line {
  id: LineId;
  name: string;
  forms: Form[];
  /** 可以进化的等级（波次结束后由玩家决定是否进化）；只有一种形态时为"觉醒"等级（自动：属性提升、换成下一个特性）。 */
  evoLevels: number[];
  /** 用进化石进化：道具 id → 进化后的形态序号（皮卡丘 → 雷丘，伊布 → 三种进化） */
  stones?: Record<string, number>;
  /** 主属性：技能表围绕它挑选，商店里这个属性的招式更容易刷到 */
  mainType: PType;
  /** 每个形态的特性（abilities.ts）；只有一种形态的依次是 Lv1、第一次觉醒、第二次觉醒的特性 */
  abilities: string[];
  /** 第几次觉醒时技能栏 +1 */
  awakenSlot?: number;
  /** 开局自带的技能 */
  start: string[];
  learnset: { lv: number; skill: string }[];
  unlock: Unlock;
  flavor: string;
  /** 传说的宝可梦 */
  legend?: boolean;
}

export type LineId = string;

const S = (hp: number, atk: number, def: number, spa: number, spd: number, spe: number): BaseStats => ({ hp, atk, def, spa, spd, spe });

/** 最早设计的 5 条进化线：数值与技能表都是手工调过的 */
const HAND: Line[] = [
  {
    id: 'bulbasaur', name: '妙蛙种子',
    forms: [
      { dex: 1, name: '妙蛙种子', types: ['grass', 'poison'], base: S(45, 49, 49, 65, 65, 45), slots: 4 },
      { dex: 2, name: '妙蛙草', types: ['grass', 'poison'], base: S(60, 62, 63, 80, 80, 60), slots: 4 },
      { dex: 3, name: '妙蛙花', types: ['grass', 'poison'], base: S(80, 82, 83, 100, 100, 80), slots: 5 },
    ],
    evoLevels: [7, 14],
    mainType: 'grass',
    abilities: ['overgrow', 'overgrow_p', 'overgrow_pp'],
    start: ['vine_whip', 'tackle'],
    learnset: [
      { lv: 4, skill: 'leech_seed' }, { lv: 8, skill: 'razor_leaf' },
      { lv: 10, skill: 'poison_powder' }, { lv: 12, skill: 'seed_bomb' }, { lv: 14, skill: 'aromatherapy' },
      { lv: 16, skill: 'energy_ball' }, { lv: 18, skill: 'synthesis' }, { lv: 20, skill: 'petal_dance' },
      { lv: 23, skill: 'solar_beam' },
    ],
    unlock: { start: true, recruit: 0.6 },
    flavor: '背上的种子吸收阳光成长。续航与范围控制兼备，联机时还能治疗队友。',
  },
  {
    id: 'charmander', name: '小火龙',
    forms: [
      { dex: 4, name: '小火龙', types: ['fire'], base: S(39, 52, 43, 60, 50, 65), slots: 4 },
      { dex: 5, name: '火恐龙', types: ['fire'], base: S(58, 64, 58, 80, 65, 80), slots: 4 },
      { dex: 6, name: '喷火龙', types: ['fire', 'flying'], base: S(78, 84, 78, 109, 85, 100), slots: 5 },
    ],
    evoLevels: [7, 14],
    mainType: 'fire',
    abilities: ['blaze', 'blaze_p', 'blaze_pp'],
    start: ['ember', 'scratch'],
    learnset: [
      { lv: 4, skill: 'dragon_breath' }, { lv: 8, skill: 'fire_fang' },
      { lv: 10, skill: 'fire_spin' }, { lv: 12, skill: 'flamethrower' }, { lv: 15, skill: 'dragon_claw' },
      { lv: 17, skill: 'air_slash' }, { lv: 20, skill: 'flare_blitz' }, { lv: 23, skill: 'fire_blast' },
    ],
    unlock: { start: true, recruit: 0.6 },
    flavor: '尾巴上的火焰代表生命力。偏特攻的高爆发输出手。',
  },
  {
    id: 'squirtle', name: '杰尼龟',
    forms: [
      { dex: 7, name: '杰尼龟', types: ['water'], base: S(44, 48, 65, 50, 64, 43), slots: 4 },
      { dex: 8, name: '卡咪龟', types: ['water'], base: S(59, 63, 80, 65, 80, 58), slots: 4 },
      { dex: 9, name: '水箭龟', types: ['water'], base: S(79, 83, 100, 85, 105, 78), slots: 5 },
    ],
    evoLevels: [7, 14],
    mainType: 'water',
    abilities: ['torrent', 'torrent_p', 'torrent_pp'],
    start: ['water_gun', 'tackle'],
    learnset: [
      { lv: 4, skill: 'withdraw' }, { lv: 8, skill: 'bubble_beam' },
      { lv: 10, skill: 'water_pulse' }, { lv: 12, skill: 'aqua_tail' }, { lv: 15, skill: 'surf' },
      { lv: 17, skill: 'ice_beam' }, { lv: 21, skill: 'hydro_pump' },
    ],
    unlock: { start: true, recruit: 0.6 },
    flavor: '坚硬的甲壳能弹开攻击。高防御、带击退的稳健坦克，最终进化为水箭龟。',
  },
  {
    id: 'pikachu', name: '皮卡丘',
    forms: [
      { dex: 25, name: '皮卡丘', types: ['electric'], base: S(35, 55, 40, 50, 50, 90), slots: 5 },
      { dex: 26, name: '雷丘', types: ['electric'], base: S(60, 90, 55, 90, 80, 110), slots: 5 },
    ],
    evoLevels: [],
    stones: { thunder_stone: 1 },
    mainType: 'electric',
    abilities: ['static_pp', 'lightning_rod_p'],
    start: ['thunder_shock', 'quick_attack'],
    learnset: [
      { lv: 4, skill: 'electro_ball' }, { lv: 8, skill: 'spark' },
      { lv: 10, skill: 'agility' }, { lv: 12, skill: 'thunderbolt' }, { lv: 15, skill: 'iron_tail' },
      { lv: 17, skill: 'discharge' }, { lv: 20, skill: 'thunder' }, { lv: 23, skill: 'volt_tackle' },
    ],
    unlock: { ach: 'reach_wave_5', recruit: 0.5 },
    flavor: '速度极快但身板脆弱。技能栏多达 5 个，靠数量与麻痹取胜。',
  },
  {
    id: 'mewtwo', name: '超梦',
    forms: [
      { dex: 150, name: '超梦', types: ['psychic'], base: S(106, 110, 90, 154, 90, 130), slots: 3 },
    ],
    evoLevels: [10, 18],
    mainType: 'psychic',
    abilities: ['pressure', 'pressure', 'pressure'],
    awakenSlot: 2,
    start: ['confusion'],
    learnset: [
      { lv: 3, skill: 'swift' }, { lv: 5, skill: 'barrier' }, { lv: 7, skill: 'psycho_cut' },
      { lv: 9, skill: 'psybeam' }, { lv: 12, skill: 'recover' }, { lv: 14, skill: 'aura_sphere' },
      { lv: 16, skill: 'psychic' }, { lv: 19, skill: 'shadow_ball' }, { lv: 21, skill: 'future_sight' },
      { lv: 24, skill: 'psystrike' },
    ],
    unlock: { ach: 'victory_hard', recruit: 0 },
    flavor: '以基因改造诞生的最强宝可梦。属性碾压，但技能栏最少。',
    legend: true,
  },
];

// ---------------------------------------------------------------- 由图鉴数据生成的进化线

const LEGENDS = new Set([144, 145, 146, 151]);

/** 成就 / 星之沙 / 崇拜几率：没写的默认可以在冒险中结交（倍率 1） */
const UNLOCKS: Record<string, Partial<Unlock>> = {
  snorlax: { ach: 'beat_snorlax', recruit: 0 },
  eevee: { ach: 'recruit_10', recruit: 0.3 },
  dratini: { ach: 'victory', recruit: 0.15 },
  omanyte: { ach: 'reach_wave_15', recruit: 0 },
  kabuto: { ach: 'reach_wave_15', recruit: 0 },
  aerodactyl: { ach: 'kills_total', recruit: 0 },
  porygon: { ach: 'rich', recruit: 0 },
  magikarp: { cost: 300, recruit: 0.8 },
  articuno: { ach: 'ice_age', recruit: 0 },
  zapdos: { ach: 'thunder_storm', recruit: 0 },
  moltres: { ach: 'inferno', recruit: 0 },
  mew: { ach: 'dex_40', recruit: 0 },
  lapras: { recruit: 0.35 }, ditto: { recruit: 0.6 }, chansey: { recruit: 1.4 }, meowth: { recruit: 1.2 },
  scyther: { recruit: 0.5 }, pinsir: { recruit: 0.5 }, kangaskhan: { recruit: 0.5 }, tauros: { recruit: 0.5 },
  electabuzz: { recruit: 0.6 }, magmar: { recruit: 0.6 }, jynx: { recruit: 0.6 }, mr_mime: { recruit: 0.6 },
  hitmonlee: { recruit: 0.5 }, hitmonchan: { recruit: 0.5 }, farfetchd: { recruit: 0.7 }, lickitung: { recruit: 0.7 },
  abra: { recruit: 0.7 }, onix: { recruit: 0.7 },
};

/** 部分归一化后的种族值总和目标：弱小的宝可梦补强、强大的削弱，但仍保留各自的特点 */
function targets(f: FamilyDef): number[] {
  if (f.stones) return [330, ...f.dex.slice(1).map(() => 500)];
  if (f.dex.length === 3) return [315, 410, 530];
  if (f.dex.length === 2) return [330, 500];
  return [LEGENDS.has(f.dex[0]) ? 560 : 470];
}

function normalize(e: DexEntry, target: number, k = 0.7): BaseStats {
  const f = Math.pow(target / e.bst, k);
  const c = (v: number, lo = 12, hi = 165) => Math.max(lo, Math.min(hi, Math.round(v * f)));
  return { hp: c(e.hp, 18, 170), atk: c(e.atk), def: c(e.def), spa: c(e.spa), spd: c(e.spd), spe: c(e.spe) };
}

function slotsOf(f: FamilyDef, i: number): number {
  if (f.dex.length === 1) return LEGENDS.has(f.dex[0]) ? 3 : 4;
  if (f.stones) return i === 0 ? 4 : 5;
  return i === f.dex.length - 1 ? 5 : 4;
}

/** 主属性：最终形态的第一属性（一般 + 飞行之类取飞行） */
function mainTypeOf(f: FamilyDef): PType {
  if (f.stones) return DEX[f.dex[0]].types[0];
  const t = DEX[f.dex[f.dex.length - 1]].types;
  return t[0] === 'normal' && t[1] ? t[1] : t[0];
}

/** 技能表的补充属性 */
const COVER: Record<PType, PType[]> = {
  normal: ['dark', 'fighting', 'ground'], fire: ['normal', 'fighting', 'dragon'], water: ['ice', 'normal', 'dark'],
  grass: ['poison', 'normal', 'ground'], electric: ['normal', 'steel', 'ice'], ice: ['water', 'normal', 'psychic'],
  fighting: ['rock', 'dark', 'normal'], poison: ['dark', 'ground', 'normal'], ground: ['rock', 'normal', 'steel'],
  flying: ['normal', 'steel', 'dark'], psychic: ['ghost', 'fighting', 'fairy'], bug: ['fighting', 'normal', 'rock'],
  rock: ['ground', 'steel', 'fighting'], ghost: ['dark', 'poison', 'psychic'], dragon: ['fire', 'water', 'electric'],
  dark: ['ghost', 'fighting', 'normal'], steel: ['electric', 'rock', 'normal'], fairy: ['psychic', 'normal', 'fire'],
};

/** 辅助技能（回复 / 护盾 / 强化）按属性 */
const UTILITY: Partial<Record<PType, string>> = {
  grass: 'synthesis', normal: 'recover', psychic: 'barrier', water: 'withdraw', steel: 'iron_defense', dragon: 'dragon_dance', fairy: 'moonlight',
};

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const ATTACKS = Object.values(SKILLS).filter((s) => s.cat !== 'status');

function allowed(s: SkillDef, fam: string) {
  const sig = SIGNATURE[s.id];
  return !sig || sig.includes(fam);
}

/** 按属性、等级段和物理/特殊偏好生成技能表（结果固定，服务器与客户端一致） */
function genMoves(f: FamilyDef, types: PType[], pref: 'phys' | 'spec' | 'mix') {
  const used = new Set<string>();
  const primary = mainTypeOf(f);
  const others = types.filter((t) => t !== primary);
  const cover = [...(f.cover ?? []), ...COVER[primary].filter((t) => !types.includes(t))];
  let n = 0;
  const catOrder = (): ('phys' | 'spec')[] => {
    const c = pref === 'mix' ? (n++ % 2 ? 'spec' : 'phys') : pref;
    return c === 'phys' ? ['phys', 'spec'] : ['spec', 'phys'];
  };
  /** ranged：尽量挑不用贴身的招式（物攻型的宝可梦也要有几招远程） */
  const pick = (type: PType, tier: number, ranged = false): string | null => {
    const cats = catOrder();
    for (const needRanged of ranged ? [true, false] : [false]) {
      for (const t of needRanged ? [tier, tier - 1] : [tier, tier - 1, tier + 1]) {
        for (const c of cats) {
          const list = ATTACKS.filter((s) => s.type === type && s.tier === t && s.cat === c && !used.has(s.id) && allowed(s, f.id) && (!needRanged || RANGED_PATTERNS.has(s.pattern)));
          if (!list.length) continue;
          const id = list[hashStr(`${f.id}:${type}:${t}`) % list.length].id;
          used.add(id);
          return id;
        }
      }
    }
    return null;
  };
  const rot = others.length ? others : cover.slice(0, 2);
  const B = (i: number) => rot[i % rot.length];
  const C = (i: number) => cover[i % cover.length];
  const sigs = Object.entries(SIGNATURE).filter(([, fams]) => fams.includes(f.id)).map(([id]) => SKILLS[id]);
  for (const s of sigs) used.add(s.id);

  const start = [pick(primary, 1, true) ?? 'tackle'];
  start.push(pick(others[0] ?? 'normal', 1) ?? pick(primary, 1) ?? (start[0] === 'tackle' ? 'scratch' : 'tackle'));
  const plan: [number, () => string | null][] = [
    [4, () => pick(B(0), 1, true) ?? pick(C(0), 1, true)],
    [7, () => pick(primary, 2)],
    [9, () => pick(B(1), 2, true) ?? pick(C(0), 2, true)],
    [11, () => {
      const u = UTILITY[primary] ?? others.map((t) => UTILITY[t]).find(Boolean);
      if (u && !used.has(u)) { used.add(u); return u; }
      return pick(primary, 2);
    }],
    [13, () => pick(primary, 3, true)],
    [15, () => pick(B(2), 3) ?? pick(C(1), 3)],
    [17, () => pick(C(2), 3) ?? pick(C(0), 3)],
    [20, () => pick(primary, 4)],
    [23, () => pick(B(3), 4) ?? pick(C(1), 4) ?? pick(primary, 4)],
  ];
  const learnset: { lv: number; skill: string }[] = [];
  for (const [lv, fn] of plan) {
    const id = fn();
    if (id) learnset.push({ lv, skill: id });
  }
  // 专属招式按威力替换对应等级段的技能
  for (const s of sigs) {
    if (s.tier === 1) { start[1] = s.id; continue; }
    const lv = s.tier === 2 ? 7 : s.tier === 3 ? 13 : 20;
    const at = learnset.findIndex((e) => e.lv === lv);
    if (at >= 0) learnset[at] = { lv, skill: s.id };
    else learnset.push({ lv, skill: s.id });
  }
  learnset.sort((a, b) => a.lv - b.lv);
  // 鲤鱼王只会跳来跳去，进化成暴鲤龙以后才学得会像样的招式
  if (f.id === 'magikarp') return { start: ['splash', 'tackle'], learnset: [{ lv: 5, skill: 'bite' }, { lv: 9, skill: 'dragon_rage' }, ...learnset.filter((e) => e.lv > 9)] };
  return { start: [...new Set(start)], learnset };
}

function familyLine(f: FamilyDef): Line {
  const tg = targets(f);
  const forms: Form[] = f.dex.map((d, i) => ({ dex: d, name: DEX[d].name, types: DEX[d].types, base: normalize(DEX[d], tg[i]), slots: slotsOf(f, i) }));
  const types = [...new Set(f.dex.flatMap((d) => DEX[d].types))];
  const last = DEX[f.dex[f.dex.length - 1]];
  const pref = last.atk >= last.spa * 1.15 ? 'phys' : last.spa >= last.atk * 1.15 ? 'spec' : 'mix';
  const legend = LEGENDS.has(f.dex[0]);
  const { start, learnset } = genMoves(f, types, pref);
  const u = UNLOCKS[f.id] ?? {};
  return {
    id: f.id, name: DEX[f.dex[0]].name, forms,
    evoLevels: f.stones ? [] : f.lv,
    stones: f.stones,
    mainType: mainTypeOf(f), abilities: f.abilities,
    awakenSlot: f.dex.length === 1 ? 2 : undefined,
    start, learnset,
    unlock: { recruit: legend ? 0 : 1, ...u },
    flavor: f.flavor,
    legend: legend || undefined,
  };
}

export const STONE_NAME: Record<string, string> = { thunder_stone: '雷之石', water_stone: '水之石', fire_stone: '火之石' };

const ALL: Line[] = [...HAND, ...FAMILIES.map(familyLine)].sort((a, b) => a.forms[0].dex - b.forms[0].dex);

export const LINES: Record<LineId, Line> = Object.fromEntries(ALL.map((l) => [l.id, l]));

/** 按图鉴顺序 */
export const LINE_IDS: LineId[] = ALL.map((l) => l.id);

/** 图鉴编号 → 所属进化线 */
export const LINE_OF_DEX: Record<number, LineId> = Object.fromEntries(ALL.flatMap((l) => l.forms.map((f) => [f.dex, l.id])));

/** 冒险开始时可以选的初始伙伴（御三家） */
export const STARTERS: LineId[] = ['bulbasaur', 'charmander', 'squirtle'];

export function isLine(id: unknown): id is LineId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LINES, id);
}

/** 按等级最多可以进化到第几阶段（用进化石的宝可梦不按等级）。 */
export function maxStageByLevel(line: LineId, level: number): number {
  const L = LINES[line];
  if (L.stones || L.forms.length === 1) return 0;
  return Math.min(L.forms.length - 1, L.evoLevels.filter((lv) => level >= lv).length);
}

/** 构筑里允许的最高形态（进化石可以随时使用） */
export function maxStage(line: LineId, level: number): number {
  const L = LINES[line];
  return L.stones ? L.forms.length - 1 : maxStageByLevel(line, level);
}

export function formOf(line: LineId, stage: number): Form {
  const l = LINES[line] ?? LINES.charmander;
  return l.forms[Math.max(0, Math.min(stage, l.forms.length - 1))];
}

/** 已经是最终形态（伊布用进化石进化后就是最终形态） */
export function isFinal(line: LineId, stage: number): boolean {
  const L = LINES[line];
  return L.stones ? stage > 0 : stage >= L.forms.length - 1;
}

/** 只有一种形态的宝可梦（超梦、卡比兽、传说的鸟……）按等级觉醒的次数 */
export function awakenings(line: LineId, level: number): number {
  const L = LINES[line];
  if (!L || L.forms.length > 1) return 0;
  return L.evoLevels.filter((lv) => level >= lv).length;
}

/** 这个技能是不是这条进化线自己会的 */
export function isNative(line: LineId, skill: string): boolean {
  const L = LINES[line];
  return !!L && (L.start.includes(skill) || L.learnset.some((e) => e.skill === skill));
}

/** 这个形态 / 等级用的是第几个特性：有进化的按形态，只有一种形态的按觉醒次数 */
export function abilityIndex(line: LineId, stage: number, level: number): number {
  const L = LINES[line];
  if (!L) return 0;
  const i = L.forms.length === 1 ? awakenings(line, level) : stage;
  return Math.max(0, Math.min(L.abilities.length - 1, i));
}

export function abilityIdAt(line: LineId, stage: number, level: number): string {
  return LINES[line]?.abilities[abilityIndex(line, stage, level)] ?? '';
}

export function abilityAt(line: LineId, stage: number, level: number): AbilityDef | undefined {
  return ABILITIES[abilityIdAt(line, stage, level)];
}

/** 野生宝可梦（图鉴编号）的特性：复制、下载用（只有一种形态的按没有觉醒算） */
export function abilityOfDex(dex: number): AbilityDef | undefined {
  const line = LINE_OF_DEX[dex];
  const L = line ? LINES[line] : undefined;
  if (!L) return undefined;
  const stage = Math.max(0, L.forms.findIndex((f) => f.dex === dex));
  return abilityAt(line, stage, 1);
}
