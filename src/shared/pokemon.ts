import type { BaseStats, Mods } from './stats';
import type { PType } from './types';

export interface Form {
  dex: number;
  name: string;
  types: PType[];
  base: BaseStats;
  slots: number;
}

export interface Passive { name: string; desc: string }

export interface Line {
  id: LineId;
  name: string;
  forms: Form[];
  /** 可以进化的等级（波次结束后由玩家决定是否进化）；超梦为"基因觉醒"等级（自动，只加属性）。 */
  evoLevels: number[];
  /** 需要进化道具时（皮卡丘 → 雷丘）为道具 id。 */
  evoItem?: string;
  bonusType: PType;
  bonusPct: number;
  passives: Passive[];
  mods: Partial<Mods>;
  /** 开局自带的技能 */
  start: string[];
  learnset: { lv: number; skill: string }[];
  unlock: string | null;
  unlockHint: string;
  flavor: string;
}

export type LineId = 'bulbasaur' | 'charmander' | 'squirtle' | 'pikachu' | 'mewtwo';

const S = (hp: number, atk: number, def: number, spa: number, spd: number, spe: number): BaseStats => ({ hp, atk, def, spa, spd, spe });

export const LINES: Record<LineId, Line> = {
  charmander: {
    id: 'charmander', name: '小火龙',
    forms: [
      { dex: 4, name: '小火龙', types: ['fire'], base: S(39, 52, 43, 60, 50, 65), slots: 4 },
      { dex: 5, name: '火恐龙', types: ['fire'], base: S(58, 64, 58, 80, 65, 80), slots: 4 },
      { dex: 6, name: '喷火龙', types: ['fire', 'flying'], base: S(78, 84, 78, 109, 85, 100), slots: 5 },
    ],
    evoLevels: [7, 14],
    bonusType: 'fire', bonusPct: 20,
    passives: [
      { name: '猛火', desc: '火系技能伤害 +20%；HP 低于 1/3 时火系伤害再 +50%。' },
      { name: '好战', desc: '暴击率 +5%。' },
    ],
    mods: { crit: 5 },
    start: ['ember', 'scratch'],
    learnset: [
      { lv: 4, skill: 'dragon_breath' }, { lv: 8, skill: 'fire_fang' },
      { lv: 10, skill: 'fire_spin' }, { lv: 12, skill: 'flamethrower' }, { lv: 15, skill: 'dragon_claw' },
      { lv: 17, skill: 'air_slash' }, { lv: 20, skill: 'flare_blitz' }, { lv: 23, skill: 'fire_blast' },
    ],
    unlock: null, unlockHint: '初始可用',
    flavor: '尾巴上的火焰代表生命力。偏特攻的高爆发输出手。',
  },
  squirtle: {
    id: 'squirtle', name: '杰尼龟',
    forms: [
      { dex: 7, name: '杰尼龟', types: ['water'], base: S(44, 48, 65, 50, 64, 43), slots: 4 },
      { dex: 8, name: '卡咪龟', types: ['water'], base: S(59, 63, 80, 65, 80, 58), slots: 4 },
      { dex: 9, name: '水箭龟', types: ['water'], base: S(79, 83, 100, 85, 105, 78), slots: 5 },
    ],
    evoLevels: [7, 14],
    bonusType: 'water', bonusPct: 20,
    passives: [
      { name: '激流', desc: '水系技能伤害 +20%；HP 低于 1/3 时水系伤害再 +50%。' },
      { name: '硬壳', desc: '物防、特防 +10%，护盾效果 +50%。' },
    ],
    mods: { defPct: 10, spdPct: 10 },
    start: ['water_gun', 'tackle'],
    learnset: [
      { lv: 4, skill: 'withdraw' }, { lv: 8, skill: 'bubble_beam' },
      { lv: 10, skill: 'water_pulse' }, { lv: 12, skill: 'aqua_tail' }, { lv: 15, skill: 'surf' },
      { lv: 17, skill: 'ice_beam' }, { lv: 21, skill: 'hydro_pump' },
    ],
    unlock: null, unlockHint: '初始可用',
    flavor: '坚硬的甲壳能弹开攻击。高防御、带击退的稳健坦克，最终进化为水箭龟。',
  },
  bulbasaur: {
    id: 'bulbasaur', name: '妙蛙种子',
    forms: [
      { dex: 1, name: '妙蛙种子', types: ['grass', 'poison'], base: S(45, 49, 49, 65, 65, 45), slots: 4 },
      { dex: 2, name: '妙蛙草', types: ['grass', 'poison'], base: S(60, 62, 63, 80, 80, 60), slots: 4 },
      { dex: 3, name: '妙蛙花', types: ['grass', 'poison'], base: S(80, 82, 83, 100, 100, 80), slots: 5 },
    ],
    evoLevels: [7, 14],
    bonusType: 'grass', bonusPct: 20,
    passives: [
      { name: '茂盛', desc: '草系技能伤害 +20%；HP 低于 1/3 时草系伤害再 +50%。' },
      { name: '叶绿素', desc: '生命回复 +4，回复类技能效果 +30%。毒系也享受本系加成。' },
    ],
    mods: { regen: 4 },
    start: ['vine_whip', 'tackle'],
    learnset: [
      { lv: 4, skill: 'leech_seed' }, { lv: 8, skill: 'razor_leaf' },
      { lv: 10, skill: 'poison_powder' }, { lv: 12, skill: 'seed_bomb' }, { lv: 14, skill: 'aromatherapy' },
      { lv: 16, skill: 'energy_ball' }, { lv: 18, skill: 'synthesis' }, { lv: 20, skill: 'petal_dance' },
      { lv: 23, skill: 'solar_beam' },
    ],
    unlock: null, unlockHint: '初始可用',
    flavor: '背上的种子吸收阳光成长。续航与范围控制兼备，联机时还能治疗队友。',
  },
  pikachu: {
    id: 'pikachu', name: '皮卡丘',
    forms: [
      { dex: 25, name: '皮卡丘', types: ['electric'], base: S(35, 55, 40, 50, 50, 90), slots: 5 },
      { dex: 26, name: '雷丘', types: ['electric'], base: S(60, 90, 55, 90, 80, 110), slots: 5 },
    ],
    evoLevels: [],
    evoItem: 'thunder_stone',
    bonusType: 'electric', bonusPct: 20,
    passives: [
      { name: '静电', desc: '电系技能伤害 +20%；接触到你的敌人有 30% 几率麻痹。' },
      { name: '电气球', desc: '未进化时物攻、特攻 +15%。使用商店里的雷之石进化为雷丘（种族值大幅提升）。' },
    ],
    mods: { atkPct: 15, spaPct: 15 },
    start: ['thunder_shock', 'quick_attack'],
    learnset: [
      { lv: 4, skill: 'electro_ball' }, { lv: 8, skill: 'spark' },
      { lv: 10, skill: 'agility' }, { lv: 12, skill: 'thunderbolt' }, { lv: 15, skill: 'iron_tail' },
      { lv: 17, skill: 'discharge' }, { lv: 20, skill: 'thunder' }, { lv: 23, skill: 'volt_tackle' },
    ],
    unlock: 'reach_wave_5', unlockHint: '成就「常磐森林的勇者」：任意精灵到达第 5 波',
    flavor: '速度极快但身板脆弱。技能栏多达 5 个，靠数量与麻痹取胜。',
  },
  mewtwo: {
    id: 'mewtwo', name: '超梦',
    forms: [
      { dex: 150, name: '超梦', types: ['psychic'], base: S(106, 110, 90, 154, 90, 130), slots: 3 },
    ],
    evoLevels: [10, 18],
    bonusType: 'psychic', bonusPct: 30,
    passives: [
      { name: '压迫感', desc: '超能力系技能伤害 +30%；周围 90 像素内的敌人移速 -20%。' },
      { name: '基因觉醒', desc: '无法进化，技能栏只有 3 个；Lv10、Lv18 觉醒时全属性 +10%，第二次觉醒技能栏 +1。' },
    ],
    mods: {},
    start: ['confusion'],
    learnset: [
      { lv: 3, skill: 'swift' }, { lv: 5, skill: 'barrier' }, { lv: 7, skill: 'psycho_cut' },
      { lv: 9, skill: 'psybeam' }, { lv: 12, skill: 'recover' }, { lv: 14, skill: 'aura_sphere' },
      { lv: 16, skill: 'psychic' }, { lv: 19, skill: 'shadow_ball' }, { lv: 21, skill: 'future_sight' },
      { lv: 24, skill: 'psystrike' },
    ],
    unlock: 'victory_hard', unlockHint: '成就「冠军之路」：通关困难模式',
    flavor: '以基因改造诞生的最强宝可梦。属性碾压，但技能栏最少。',
  },
};

export const LINE_IDS = Object.keys(LINES) as LineId[];

/** 按等级最多可以进化到第几阶段（皮卡丘靠雷之石，不按等级）。 */
export function maxStageByLevel(line: LineId, level: number): number {
  const L = LINES[line];
  if (line === 'mewtwo' || L.evoItem) return 0;
  return Math.min(L.forms.length - 1, L.evoLevels.filter((lv) => level >= lv).length);
}

export function formOf(line: LineId, stage: number): Form {
  const l = LINES[line];
  return l.forms[Math.min(stage, l.forms.length - 1)];
}

/** 超梦的觉醒次数：按等级算。 */
export function awakenings(line: LineId, level: number): number {
  if (line !== 'mewtwo') return 0;
  return LINES.mewtwo.evoLevels.filter((lv) => level >= lv).length;
}
