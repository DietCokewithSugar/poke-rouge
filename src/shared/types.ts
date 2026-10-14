/** 宝可梦 18 种属性与第六世代起的克制表。 */
export const TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PType = (typeof TYPES)[number];

export const TYPE_NAME: Record<PType, string> = {
  normal: '一般', fire: '火', water: '水', grass: '草', electric: '电', ice: '冰',
  fighting: '格斗', poison: '毒', ground: '地面', flying: '飞行', psychic: '超能力',
  bug: '虫', rock: '岩石', ghost: '幽灵', dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精',
};

export const TYPE_COLOR: Record<PType, string> = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030',
  ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0',
  psychic: '#f85888', bug: '#a8b820', rock: '#b8a038', ghost: '#705898', dragon: '#7038f8',
  dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
};

type Row = { x2?: PType[]; x05?: PType[]; x0?: PType[] };
const CHART: Record<PType, Row> = {
  normal: { x05: ['rock', 'steel'], x0: ['ghost'] },
  fire: { x2: ['grass', 'ice', 'bug', 'steel'], x05: ['fire', 'water', 'rock', 'dragon'] },
  water: { x2: ['fire', 'ground', 'rock'], x05: ['water', 'grass', 'dragon'] },
  electric: { x2: ['water', 'flying'], x05: ['electric', 'grass', 'dragon'], x0: ['ground'] },
  grass: { x2: ['water', 'ground', 'rock'], x05: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice: { x2: ['grass', 'ground', 'flying', 'dragon'], x05: ['fire', 'water', 'ice', 'steel'] },
  fighting: { x2: ['normal', 'ice', 'rock', 'dark', 'steel'], x05: ['poison', 'flying', 'psychic', 'bug', 'fairy'], x0: ['ghost'] },
  poison: { x2: ['grass', 'fairy'], x05: ['poison', 'ground', 'rock', 'ghost'], x0: ['steel'] },
  ground: { x2: ['fire', 'electric', 'poison', 'rock', 'steel'], x05: ['grass', 'bug'], x0: ['flying'] },
  flying: { x2: ['grass', 'fighting', 'bug'], x05: ['electric', 'rock', 'steel'] },
  psychic: { x2: ['fighting', 'poison'], x05: ['psychic', 'steel'], x0: ['dark'] },
  bug: { x2: ['grass', 'psychic', 'dark'], x05: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { x2: ['fire', 'ice', 'flying', 'bug'], x05: ['fighting', 'ground', 'steel'] },
  ghost: { x2: ['psychic', 'ghost'], x05: ['dark'], x0: ['normal'] },
  dragon: { x2: ['dragon'], x05: ['steel'], x0: ['fairy'] },
  dark: { x2: ['psychic', 'ghost'], x05: ['fighting', 'dark', 'fairy'] },
  steel: { x2: ['ice', 'rock', 'fairy'], x05: ['fire', 'water', 'electric', 'steel'] },
  fairy: { x2: ['fighting', 'dragon', 'dark'], x05: ['fire', 'poison', 'steel'] },
};

/** 原作倍率（0 / 0.25 / 0.5 / 1 / 2 / 4）。 */
export function rawEffectiveness(atk: PType, def: readonly PType[]): number {
  const row = CHART[atk];
  let m = 1;
  for (const t of def) {
    if (row.x0?.includes(t)) m *= 0;
    else if (row.x2?.includes(t)) m *= 2;
    else if (row.x05?.includes(t)) m *= 0.5;
  }
  return m;
}

/**
 * 游戏内倍率：大幅弱化原作的克制，效果拔群只比普通伤害多 10%（双重克制 20%），
 * 效果不好少 10%，免疫与双重抵抗少 20%。属性只是锦上添花，不会逼着玩家换技能。
 */
export const EFF_SUPER = 1.1;
export const EFF_WEAK = 0.9;

export function gameEffectiveness(atk: PType, def: readonly PType[]): number {
  const m = rawEffectiveness(atk, def);
  if (m === 0) return 0.8;
  if (m >= 4) return 1.2;
  if (m >= 2) return EFF_SUPER;
  if (m <= 0.25) return 0.8;
  if (m <= 0.5) return EFF_WEAK;
  return 1;
}
