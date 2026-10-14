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
  { biome: 0, rate: 0.85, pool: { caterpie: 3, weedle: 2 } },
  { biome: 0, rate: 1.0, pool: { caterpie: 2, weedle: 2, rattata: 2 } },
  { biome: 0, rate: 1.15, pool: { caterpie: 1, weedle: 1, rattata: 2, pidgey: 2, metapod: 1 }, treasure: { id: 'meowth', chance: 0.35 } },
  { biome: 0, rate: 1.3, pool: { rattata: 2, pidgey: 2, spearow: 2, zubat: 2, kakuna: 1 } },
  { biome: 0, rate: 1.35, pool: { pidgey: 2, spearow: 2, zubat: 2, oddish: 2, metapod: 1 }, elites: ['beedrill'], treasure: { id: 'meowth', chance: 0.4 } },
  { biome: 1, rate: 1.5, pool: { zubat: 2, oddish: 2, paras: 2, ekans: 2, spearow: 1, kakuna: 1 } },
  { biome: 1, rate: 1.6, pool: { ekans: 2, paras: 2, geodude: 2, magnemite: 2, zubat: 2 }, treasure: { id: 'meowth', chance: 0.4 } },
  { biome: 1, rate: 1.7, pool: { geodude: 2, magnemite: 2, gastly: 2, voltorb: 2, rattata: 2 }, elites: ['beedrill'] },
  { biome: 1, rate: 1.8, pool: { raticate: 2, pidgeotto: 2, machop: 2, gastly: 2, voltorb: 1, mankey: 2 }, treasure: { id: 'chansey', chance: 0.3 } },
  { biome: 1, rate: 1.3, pool: { raticate: 2, pidgeotto: 2, machop: 2, geodude: 1 }, boss: 'snorlax' },
  { biome: 2, rate: 1.9, pool: { golbat: 2, gloom: 2, mankey: 2, machop: 2, koffing: 2 }, treasure: { id: 'meowth', chance: 0.45 } },
  { biome: 2, rate: 2.0, pool: { golbat: 2, parasect: 2, graveler: 1, magneton: 2, koffing: 2 }, elites: ['onix'] },
  { biome: 2, rate: 2.1, pool: { haunter: 2, magneton: 2, graveler: 1, fearow: 2, arbok: 2, electrode: 1 }, treasure: { id: 'chansey', chance: 0.35 } },
  { biome: 2, rate: 2.2, pool: { haunter: 2, arbok: 2, primeape: 2, machoke: 1, butterfree: 2 }, elites: ['beedrill', 'beedrill'] },
  { biome: 2, rate: 2.2, pool: { haunter: 2, primeape: 2, machoke: 2, electrode: 2, golbat: 2 }, elites: ['gengar'], treasure: { id: 'meowth', chance: 0.5 } },
  { biome: 3, rate: 2.3, pool: { machoke: 2, primeape: 2, kadabra: 2, weezing: 1, electrode: 2, golbat: 2 } },
  { biome: 3, rate: 2.4, pool: { kadabra: 2, graveler: 1, magneton: 2, haunter: 2, weezing: 1, fearow: 2 }, elites: ['beedrill', 'beedrill'], treasure: { id: 'chansey', chance: 0.4 } },
  { biome: 3, rate: 2.5, pool: { kadabra: 2, graveler: 2, machoke: 2, arbok: 2, butterfree: 2, electrode: 1 }, elites: ['onix'] },
  { biome: 3, rate: 2.6, pool: { kadabra: 2, haunter: 2, machoke: 2, primeape: 2, weezing: 1, golbat: 2 }, elites: ['gengar', 'onix'], treasure: { id: 'meowth', chance: 0.5 } },
  { biome: 3, rate: 1.7, pool: { kadabra: 2, haunter: 2, machoke: 2, golbat: 1 }, boss: 'mew' },
];

/** 每波时长：第 1 波 60 秒，逐步增加到第 20 波 90 秒。 */
export function waveDuration(wave: number): number {
  const t = 60 + (30 * (wave - 1)) / (TOTAL_WAVES - 1);
  return Math.round(t / 5) * 5;
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
