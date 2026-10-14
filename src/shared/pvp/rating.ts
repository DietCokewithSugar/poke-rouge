/** 对战积分（Elo）与段位。 */

export const START_RATING = 1000;

export interface Tier { id: string; name: string; min: number; color: string; icon: string }

export const TIERS: Tier[] = [
  { id: 'poke', name: '精灵球级', min: 0, color: '#f87070', icon: 'ball_poke' },
  { id: 'great', name: '超级球级', min: 1100, color: '#68a0ff', icon: 'ball_great' },
  { id: 'ultra', name: '高级球级', min: 1250, color: '#f0c020', icon: 'ball_ultra' },
  { id: 'master', name: '大师球级', min: 1400, color: '#c080f0', icon: 'masterball' },
  { id: 'champion', name: '冠军', min: 1600, color: '#ffd23f', icon: 'crown' },
];

export function tierOf(rating: number) {
  let i = 0;
  while (i + 1 < TIERS.length && rating >= TIERS[i + 1].min) i++;
  const tier = TIERS[i];
  const next = TIERS[i + 1] ?? null;
  const progress = next ? Math.max(0, Math.min(1, (rating - tier.min) / (next.min - tier.min))) : 1;
  return { tier, index: i, next, progress };
}

export function expectedScore(my: number, opp: number) {
  return 1 / (1 + 10 ** ((opp - my) / 400));
}

/** 新玩家的前 10 场积分变化更大；全是 AI 对手时减半 */
export function kFactor(games: number, mode: '1v1' | '4v4', vsBotsOnly: boolean) {
  let k = games < 10 ? 40 : 28;
  if (mode === '4v4') k *= 0.85;
  if (vsBotsOnly) k *= 0.6;
  return k;
}

/** score：胜 1、平 0.5、负 0 */
export function eloDelta(my: number, opp: number, score: number, k: number) {
  const d = Math.round(k * (score - expectedScore(my, opp)));
  // 赢了至少 +1，输了至少 -1，避免"打了等于没打"
  if (score === 1) return Math.max(1, d);
  if (score === 0) return Math.min(-1, d);
  return d;
}
