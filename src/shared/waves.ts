import type { PType } from './types';

export interface WaveDef {
  /** 敌人权重池 */
  pool: Record<string, number>;
  /** 基础刷怪速率（只/秒，单人） */
  rate: number;
  elites?: string[];
  boss?: string;
  /** 可能出现的宝藏怪 */
  treasure?: { id: string; chance: number };
  biome: number;
}

export const TOTAL_WAVES = 20;

export const WAVES: WaveDef[] = [
  { biome: 0, rate: 0.95, pool: { caterpie: 3, weedle: 2 } },
  { biome: 0, rate: 1.1, pool: { caterpie: 2, weedle: 2, rattata: 2 } },
  { biome: 0, rate: 1.25, pool: { caterpie: 1, weedle: 1, rattata: 2, pidgey: 2, metapod: 1 }, treasure: { id: 'meowth', chance: 0.35 } },
  { biome: 0, rate: 1.45, pool: { rattata: 2, pidgey: 2, spearow: 2, zubat: 2, kakuna: 1 } },
  { biome: 0, rate: 1.5, pool: { pidgey: 2, spearow: 2, zubat: 2, oddish: 2, metapod: 1 }, elites: ['beedrill'], treasure: { id: 'meowth', chance: 0.4 } },
  { biome: 1, rate: 1.65, pool: { zubat: 2, oddish: 2, paras: 2, ekans: 2, spearow: 1, kakuna: 1 } },
  { biome: 1, rate: 1.75, pool: { ekans: 2, paras: 2, geodude: 2, magnemite: 2, zubat: 2 }, treasure: { id: 'meowth', chance: 0.4 } },
  { biome: 1, rate: 1.85, pool: { geodude: 2, magnemite: 2, gastly: 2, voltorb: 2, rattata: 2 }, elites: ['beedrill'] },
  { biome: 1, rate: 2.0, pool: { raticate: 2, pidgeotto: 2, machop: 2, gastly: 2, voltorb: 1, mankey: 2 }, treasure: { id: 'chansey', chance: 0.3 } },
  { biome: 1, rate: 1.1, pool: { raticate: 2, pidgeotto: 2, machop: 2, geodude: 1 }, boss: 'snorlax' },
  { biome: 2, rate: 2.1, pool: { golbat: 2, gloom: 2, mankey: 2, machop: 2, koffing: 2 }, treasure: { id: 'meowth', chance: 0.45 } },
  { biome: 2, rate: 2.2, pool: { golbat: 2, parasect: 2, graveler: 1, magneton: 2, koffing: 2 }, elites: ['onix'] },
  { biome: 2, rate: 2.3, pool: { haunter: 2, magneton: 2, graveler: 1, fearow: 2, arbok: 2, electrode: 1 }, treasure: { id: 'chansey', chance: 0.35 } },
  { biome: 2, rate: 2.4, pool: { haunter: 2, arbok: 2, primeape: 2, machoke: 1, butterfree: 2 }, elites: ['beedrill', 'beedrill'] },
  { biome: 2, rate: 2.4, pool: { haunter: 2, primeape: 2, machoke: 2, electrode: 2, golbat: 2 }, elites: ['gengar'], treasure: { id: 'meowth', chance: 0.5 } },
  { biome: 3, rate: 2.55, pool: { machoke: 2, primeape: 2, kadabra: 2, weezing: 1, electrode: 2, golbat: 2 } },
  { biome: 3, rate: 2.65, pool: { kadabra: 2, graveler: 1, magneton: 2, haunter: 2, weezing: 1, fearow: 2 }, elites: ['beedrill', 'beedrill'], treasure: { id: 'chansey', chance: 0.4 } },
  { biome: 3, rate: 2.75, pool: { kadabra: 2, graveler: 2, machoke: 2, arbok: 2, butterfree: 2, electrode: 1 }, elites: ['onix'] },
  { biome: 3, rate: 2.85, pool: { kadabra: 2, haunter: 2, machoke: 2, primeape: 2, weezing: 1, golbat: 2 }, elites: ['gengar', 'onix'], treasure: { id: 'meowth', chance: 0.5 } },
  { biome: 3, rate: 1.7, pool: { kadabra: 2, haunter: 2, machoke: 2, golbat: 1 }, boss: 'mew' },
];

export const BOSS_WAVE_DURATION = 90;

/** 每波时长：普通波次从第 1 波 30 秒逐步增加到第 19 波 60 秒，首领波（第 10、20 波）90 秒。 */
export function waveDuration(wave: number): number {
  if (WAVES[wave - 1]?.boss) return BOSS_WAVE_DURATION;
  const normals = WAVES.filter((w) => !w.boss).length;
  const k = WAVES.slice(0, wave - 1).filter((w) => !w.boss).length;
  const t = 30 + (30 * k) / (normals - 1);
  return Math.round(t / 5) * 5;
}

/**
 * 糖果倍率：波次变短后，每只敌人掉落更多糖果，让每波的经验与金钱和原来的节奏一致
 *（以前的普通波次约为 60~88 秒）。
 */
export function candyMult(wave: number): number {
  if (WAVES[wave - 1]?.boss) return 1;
  const legacy = 60 + (30 * (wave - 1)) / (TOTAL_WAVES - 1);
  return legacy / waveDuration(wave) / 1.1;
}

export function enemyHpMult(wave: number): number {
  const w = wave - 1;
  const late = 1 + 0.1 * Math.max(0, wave - 10);
  return (1 + 0.3 * w + 0.012 * w * w) * late;
}

export function enemyDmgMult(wave: number): number {
  const w = wave - 1;
  return 1 + 0.1 * w + 0.004 * w * w;
}

/** 后期刷怪更密集 */
export function spawnRateMult(wave: number): number {
  return 1 + 0.035 * Math.max(0, wave - 10);
}

export function priceMult(wave: number): number {
  const w = wave - 1;
  return 1 + 0.09 * w + 0.003 * w * w;
}

export const BIOMES = [
  { name: '1号道路' },
  { name: '常磐森林' },
  { name: '月见山' },
  { name: '宝可梦之塔' },
] as const;

/** 乱入的野生宝可梦：各个地区常见的属性（权重） */
export const BIOME_TYPES: Partial<Record<PType, number>>[] = [
  { normal: 3, flying: 3, bug: 1.5, grass: 2, poison: 1, water: 1.5, fire: 1.5, electric: 1, fighting: 1, ground: 1, fairy: 1 },
  { bug: 3, grass: 3, poison: 2, electric: 1.5, normal: 1, flying: 1, water: 1.5, psychic: 1, fairy: 1 },
  { rock: 3, ground: 3, fighting: 2, fairy: 2, poison: 1.5, steel: 1.5, ice: 1.5, water: 1, fire: 1, dragon: 0.6 },
  { ghost: 3, psychic: 3, poison: 2, dark: 1, fire: 1.5, ice: 1.5, normal: 1, dragon: 1, electric: 1, water: 1 },
];

/** 每波乱入几只野生宝可梦（首领波没有） */
export function intruderCount(wave: number): number {
  return WAVES[wave - 1]?.boss ? 0 : 1 + Math.floor(wave / 6);
}
