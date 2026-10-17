/**
 * 地图道具：踩到就生效，只在冒险里出现（对战场里只有特性「收获」生成的树果）。
 * 线上用 PICKUP_KINDS 的下标表示种类：糖果 0、橙橙果 1、道具球 2，之后是三种增幅种子、爆炸之种和星桃果。
 */
export const PICKUP_KINDS = ['candy', 'berry', 'ball', 'seed_crit', 'seed_dodge', 'seed_speed', 'seed_blast', 'starf'] as const;
export type PickupKind = (typeof PICKUP_KINDS)[number];
export const pickupCode = (k: PickupKind) => PICKUP_KINDS.indexOf(k);

/** 橙橙果：回复 5 + 最大 HP 的 8%；满血时不会捡，留在地上 */
export const BERRY_FLAT = 5;
export const BERRY_PCT = 0.08;
export const berryHeal = (maxHp: number) => BERRY_FLAT + maxHp * BERRY_PCT;
/** 星桃果（特性「收获」生成）：治好任何异常状态；没有异常状态时不会捡，留在地上 */
export const STARF_NAME = '星桃果';
/** 「收获」生成的树果在场上最多这么多颗 */
export const MAX_HARVEST = 4;

export type BoostId = 'crit' | 'dodge' | 'speed';
export const BOOST_IDS: BoostId[] = ['crit', 'dodge', 'speed'];
/** 增幅持续的秒数：再踩到同一种刷新为 5 秒，数值不叠加；不同的种子可以同时生效 */
export const BOOST_DUR = 5;
/** 暴击率 +20%、闪避 +20%（闪避仍受 60% 上限约束）、移动速度 ×1.25（仍受移速上限约束） */
export const BOOST_CRIT = 20;
export const BOOST_DODGE = 20;
export const BOOST_SPEED = 0.25;

export interface BoostDef { id: BoostId; seed: PickupKind; name: string; label: string; text: string; color: string; desc: string }
export const BOOSTS: Record<BoostId, BoostDef> = {
  crit: { id: 'crit', seed: 'seed_crit', name: '暴击之种', label: '暴击', text: '暴击率提升！', color: '#ff8a5a', desc: `暴击率 +${BOOST_CRIT}%` },
  dodge: { id: 'dodge', seed: 'seed_dodge', name: '闪避之种', label: '闪避', text: '闪避提升！', color: '#d0a8ff', desc: `闪避 +${BOOST_DODGE}%` },
  speed: { id: 'speed', seed: 'seed_speed', name: '加速之种', label: '加速', text: '速度提升！', color: '#ffe45a', desc: `移动速度 +${Math.round(BOOST_SPEED * 100)}%` },
};

export const boostOfSeed = (k: PickupKind): BoostId | null => BOOST_IDS.find((id) => BOOSTS[id].seed === k) ?? null;
export const isSeed = (k: PickupKind) => boostOfSeed(k) !== null;

/** 场上同时最多这么多颗橙橙果 / 种子，避免刷屏 */
export const MAX_BERRIES = 6;
export const MAX_SEEDS = 4;
/** 击倒小怪掉种子的几率（再乘以幸运）；精英和首领 */
export const SEED_DROP_MINION = 0.003;
export const SEED_DROP_ELITE = 0.3;

/**
 * 爆炸之种：踩到就在脚下爆炸，半径内的普通小怪全部被炸飞。
 * 首领、精英、闪光宝可梦、乱入的野生宝可梦和宝藏宝可梦不受影响；被炸飞的小怪什么都不掉（没有糖果，也就没有经验和金钱）。
 */
export const BLAST_NAME = '爆炸之种';
export const BLAST_COLOR = '#ff7040';
export const BLAST_RADIUS = 110;
export const MAX_BLASTS = 2;
/** 从第几波开始出现 */
export const BLAST_FROM = 5;
/** 身边这么近的普通小怪有这么多只，就算被围住了：下一颗爆炸之种提前出现在跑的方向上 */
export const BLAST_CROWD = 16;
export const BLAST_CROWD_R = 110;

/** 每波场上刷出几颗爆炸之种：第 5 波起 1 颗，第 11 波起 2 颗，群聚波和三人以上联机各多 1 颗 */
export function blastSeedCount(wave: number, players: number, horde: boolean): number {
  if (wave < BLAST_FROM) return 0;
  return (wave >= 11 ? 2 : 1) + (horde ? 1 : 0) + (players >= 3 ? 1 : 0);
}
