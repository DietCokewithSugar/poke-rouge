import type { PType } from './types';

export type EnemyAI =
  | 'chase'    // 直线追击最近的玩家
  | 'swarm'    // 快速蛇形追击
  | 'tank'     // 缓慢、高血量
  | 'charge'   // 接近后蓄力冲撞
  | 'shooter'  // 保持距离射击
  | 'bomber'   // 贴近后自爆
  | 'flee'     // 逃跑的宝藏怪（喵喵 / 吉利蛋）
  | 'elite_beedrill'
  | 'elite_onix'
  | 'elite_gengar'
  | 'boss_snorlax'
  | 'boss_mew';

export type Rank = 'minion' | 'elite' | 'boss';

export interface EnemyShot {
  power: number;
  speed: number;
  cd: number;
  range: number;
  count?: number;
  spread?: number;
  size?: number;
  fx: string;
  slow?: number;
}

export interface EnemyDef {
  id: string;
  dex: number;
  name: string;
  types: PType[];
  hp: number;
  dmg: number;
  speed: number;
  r: number;
  ai: EnemyAI;
  rank: Rank;
  candy: number;
  shot?: EnemyShot;
  /** 自爆半径与伤害 */
  blast?: { radius: number; power: number; cloud?: boolean };
  knockResist?: number;
  scale?: number;
  flying?: boolean;
}

const E = (d: EnemyDef) => d;

const LIST: EnemyDef[] = [
  E({ id: 'caterpie', dex: 10, name: '绿毛虫', types: ['bug'], hp: 8, dmg: 3, speed: 38, r: 7, ai: 'chase', rank: 'minion', candy: 1 }),
  E({ id: 'weedle', dex: 13, name: '独角虫', types: ['bug', 'poison'], hp: 8, dmg: 4, speed: 42, r: 7, ai: 'chase', rank: 'minion', candy: 1 }),
  E({ id: 'metapod', dex: 11, name: '铁甲蛹', types: ['bug'], hp: 26, dmg: 3, speed: 18, r: 8, ai: 'tank', rank: 'minion', candy: 2, knockResist: 0.6 }),
  E({ id: 'kakuna', dex: 14, name: '铁壳蛹', types: ['bug', 'poison'], hp: 26, dmg: 4, speed: 18, r: 8, ai: 'tank', rank: 'minion', candy: 2, knockResist: 0.6 }),
  E({ id: 'rattata', dex: 19, name: '小拉达', types: ['normal'], hp: 10, dmg: 4, speed: 62, r: 7, ai: 'swarm', rank: 'minion', candy: 1 }),
  E({ id: 'pidgey', dex: 16, name: '波波', types: ['normal', 'flying'], hp: 12, dmg: 4, speed: 50, r: 7, ai: 'chase', rank: 'minion', candy: 1, flying: true }),
  E({ id: 'spearow', dex: 21, name: '烈雀', types: ['normal', 'flying'], hp: 14, dmg: 6, speed: 46, r: 7, ai: 'charge', rank: 'minion', candy: 1, flying: true }),
  E({ id: 'zubat', dex: 41, name: '超音蝠', types: ['poison', 'flying'], hp: 8, dmg: 3, speed: 76, r: 6, ai: 'swarm', rank: 'minion', candy: 1, flying: true }),
  E({ id: 'oddish', dex: 43, name: '走路草', types: ['grass', 'poison'], hp: 14, dmg: 3, speed: 30, r: 7, ai: 'shooter', rank: 'minion', candy: 1,
    shot: { power: 4, speed: 95, cd: 2.6, range: 150, fx: 'e_acid' } }),
  E({ id: 'paras', dex: 46, name: '派拉斯', types: ['bug', 'grass'], hp: 16, dmg: 4, speed: 34, r: 8, ai: 'shooter', rank: 'minion', candy: 1,
    shot: { power: 4, speed: 80, cd: 3.0, range: 140, fx: 'e_spore', slow: 0.4 } }),
  E({ id: 'ekans', dex: 23, name: '阿柏蛇', types: ['poison'], hp: 18, dmg: 6, speed: 46, r: 8, ai: 'charge', rank: 'minion', candy: 1 }),
  E({ id: 'geodude', dex: 74, name: '小拳石', types: ['rock', 'ground'], hp: 42, dmg: 7, speed: 30, r: 9, ai: 'tank', rank: 'minion', candy: 2, knockResist: 0.7 }),
  E({ id: 'magnemite', dex: 81, name: '小磁怪', types: ['electric', 'steel'], hp: 18, dmg: 4, speed: 36, r: 7, ai: 'shooter', rank: 'minion', candy: 1, flying: true,
    shot: { power: 5, speed: 125, cd: 2.4, range: 160, fx: 'e_shock' } }),
  E({ id: 'gastly', dex: 92, name: '鬼斯', types: ['ghost', 'poison'], hp: 16, dmg: 5, speed: 44, r: 8, ai: 'shooter', rank: 'minion', candy: 1, flying: true,
    shot: { power: 5, speed: 110, cd: 2.6, range: 150, fx: 'e_shadow' } }),
  E({ id: 'voltorb', dex: 100, name: '霹雳电球', types: ['electric'], hp: 14, dmg: 2, speed: 68, r: 7, ai: 'bomber', rank: 'minion', candy: 1,
    blast: { radius: 34, power: 13 } }),
  E({ id: 'koffing', dex: 109, name: '瓦斯弹', types: ['poison'], hp: 26, dmg: 4, speed: 30, r: 9, ai: 'bomber', rank: 'minion', candy: 2, flying: true,
    blast: { radius: 36, power: 9, cloud: true } }),
  E({ id: 'mankey', dex: 56, name: '猴怪', types: ['fighting'], hp: 22, dmg: 7, speed: 54, r: 8, ai: 'charge', rank: 'minion', candy: 1 }),
  E({ id: 'machop', dex: 66, name: '腕力', types: ['fighting'], hp: 32, dmg: 8, speed: 40, r: 8, ai: 'chase', rank: 'minion', candy: 2 }),
  E({ id: 'raticate', dex: 20, name: '拉达', types: ['normal'], hp: 26, dmg: 7, speed: 64, r: 8, ai: 'swarm', rank: 'minion', candy: 2 }),
  E({ id: 'pidgeotto', dex: 17, name: '比比鸟', types: ['normal', 'flying'], hp: 30, dmg: 7, speed: 52, r: 9, ai: 'charge', rank: 'minion', candy: 2, flying: true }),
  E({ id: 'fearow', dex: 22, name: '大嘴雀', types: ['normal', 'flying'], hp: 36, dmg: 9, speed: 50, r: 9, ai: 'charge', rank: 'minion', candy: 2, flying: true }),
  E({ id: 'arbok', dex: 24, name: '阿柏怪', types: ['poison'], hp: 42, dmg: 9, speed: 42, r: 9, ai: 'shooter', rank: 'minion', candy: 2,
    shot: { power: 6, speed: 120, cd: 2.6, range: 160, count: 3, spread: 0.5, fx: 'e_acid' } }),
  E({ id: 'golbat', dex: 42, name: '大嘴蝠', types: ['poison', 'flying'], hp: 24, dmg: 6, speed: 82, r: 8, ai: 'swarm', rank: 'minion', candy: 2, flying: true }),
  E({ id: 'gloom', dex: 44, name: '臭臭花', types: ['grass', 'poison'], hp: 36, dmg: 5, speed: 28, r: 8, ai: 'shooter', rank: 'minion', candy: 2,
    shot: { power: 5, speed: 90, cd: 2.8, range: 150, count: 3, spread: 0.6, fx: 'e_spore', slow: 0.3 } }),
  E({ id: 'parasect', dex: 47, name: '派拉斯特', types: ['bug', 'grass'], hp: 46, dmg: 6, speed: 30, r: 9, ai: 'shooter', rank: 'minion', candy: 2,
    shot: { power: 6, speed: 85, cd: 2.8, range: 150, count: 2, spread: 0.4, fx: 'e_spore', slow: 0.45 } }),
  E({ id: 'graveler', dex: 75, name: '隆隆石', types: ['rock', 'ground'], hp: 95, dmg: 12, speed: 26, r: 10, ai: 'tank', rank: 'minion', candy: 3, knockResist: 0.8 }),
  E({ id: 'magneton', dex: 82, name: '三合一磁怪', types: ['electric', 'steel'], hp: 44, dmg: 6, speed: 34, r: 9, ai: 'shooter', rank: 'minion', candy: 2, flying: true,
    shot: { power: 6, speed: 130, cd: 2.6, range: 170, count: 3, spread: 0.45, fx: 'e_shock' } }),
  E({ id: 'haunter', dex: 93, name: '鬼斯通', types: ['ghost', 'poison'], hp: 40, dmg: 8, speed: 46, r: 9, ai: 'shooter', rank: 'minion', candy: 2, flying: true,
    shot: { power: 7, speed: 120, cd: 2.2, range: 160, fx: 'e_shadow' } }),
  E({ id: 'electrode', dex: 101, name: '顽皮雷弹', types: ['electric'], hp: 32, dmg: 3, speed: 88, r: 9, ai: 'bomber', rank: 'minion', candy: 2,
    blast: { radius: 46, power: 24 } }),
  E({ id: 'weezing', dex: 110, name: '双弹瓦斯', types: ['poison'], hp: 62, dmg: 6, speed: 30, r: 11, ai: 'bomber', rank: 'minion', candy: 3, flying: true,
    blast: { radius: 46, power: 14, cloud: true } }),
  E({ id: 'machoke', dex: 67, name: '豪力', types: ['fighting'], hp: 72, dmg: 12, speed: 42, r: 9, ai: 'chase', rank: 'minion', candy: 3, knockResist: 0.4 }),
  E({ id: 'primeape', dex: 57, name: '火爆猴', types: ['fighting'], hp: 56, dmg: 12, speed: 58, r: 9, ai: 'charge', rank: 'minion', candy: 3 }),
  E({ id: 'kadabra', dex: 64, name: '勇基拉', types: ['psychic'], hp: 42, dmg: 6, speed: 40, r: 9, ai: 'shooter', rank: 'minion', candy: 3,
    shot: { power: 8, speed: 130, cd: 2.2, range: 170, fx: 'e_psy' } }),
  E({ id: 'butterfree', dex: 12, name: '巴大蝶', types: ['bug', 'flying'], hp: 38, dmg: 5, speed: 44, r: 9, ai: 'shooter', rank: 'minion', candy: 2, flying: true,
    shot: { power: 5, speed: 90, cd: 3.2, range: 150, count: 6, spread: Math.PI * 2, fx: 'e_spore', slow: 0.35 } }),

  // 宝藏怪：会逃跑，击败后掉落大量金钱 / 道具球
  E({ id: 'meowth', dex: 52, name: '喵喵', types: ['normal'], hp: 40, dmg: 0, speed: 70, r: 8, ai: 'flee', rank: 'minion', candy: 14 }),
  E({ id: 'chansey', dex: 113, name: '吉利蛋', types: ['normal'], hp: 110, dmg: 0, speed: 56, r: 10, ai: 'flee', rank: 'elite', candy: 10 }),

  // 精英
  E({ id: 'beedrill', dex: 15, name: '大针蜂', types: ['bug', 'poison'], hp: 210, dmg: 10, speed: 56, r: 10, ai: 'elite_beedrill', rank: 'elite', candy: 16, flying: true, knockResist: 0.7,
    shot: { power: 7, speed: 170, cd: 2.0, range: 180, count: 3, spread: 0.3, fx: 'e_sting' } }),
  E({ id: 'onix', dex: 95, name: '大岩蛇', types: ['rock', 'ground'], hp: 440, dmg: 16, speed: 30, r: 15, ai: 'elite_onix', rank: 'elite', candy: 26, knockResist: 0.95,
    shot: { power: 14, speed: 0, cd: 3.0, range: 220, fx: 'e_rock' } }),
  E({ id: 'gengar', dex: 94, name: '耿鬼', types: ['ghost', 'poison'], hp: 430, dmg: 12, speed: 50, r: 11, ai: 'elite_gengar', rank: 'elite', candy: 26, knockResist: 0.9,
    shot: { power: 10, speed: 130, cd: 1.6, range: 200, size: 6, fx: 'e_shadow' } }),

  // 首领
  E({ id: 'snorlax', dex: 143, name: '卡比兽', types: ['normal'], hp: 500, dmg: 18, speed: 26, r: 18, ai: 'boss_snorlax', rank: 'boss', candy: 70, knockResist: 1, scale: 2,
    shot: { power: 9, speed: 80, cd: 4, range: 300, count: 8, spread: Math.PI * 2, fx: 'e_bubble', slow: 0.4 } }),
  E({ id: 'mew', dex: 151, name: '梦幻', types: ['psychic'], hp: 1900, dmg: 16, speed: 60, r: 14, ai: 'boss_mew', rank: 'boss', candy: 150, knockResist: 1, scale: 2, flying: true,
    shot: { power: 11, speed: 110, cd: 2, range: 400, size: 5, fx: 'e_psy' } }),
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
export const ENEMY_IDS = LIST.map((e) => e.id);
export const ENEMY_INDEX: Record<string, number> = Object.fromEntries(ENEMY_IDS.map((id, i) => [id, i]));
