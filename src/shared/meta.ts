import type { LineId } from './pokemon';
import type { Mods } from './stats';

/** 局外成长（大木研究所）：用星之沙永久提升所有精灵的基础属性。 */
export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number;
  per: Partial<Mods>;
  startMoney?: number;
  icon: string;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'hp', name: 'HP 强化', desc: '最大HP +3', max: 10, base: 20, per: { maxHp: 3 }, icon: 'vitamin_hp' },
  { id: 'atk', name: '物攻强化', desc: '物攻 +3（物理技能伤害，类似近战）', max: 10, base: 20, per: { atk: 3 }, icon: 'vitamin_r' },
  { id: 'spa', name: '特攻强化', desc: '特攻 +3（特殊技能伤害，类似远程）', max: 10, base: 20, per: { spa: 3 }, icon: 'vitamin_b' },
  { id: 'def', name: '物防强化', desc: '物防 +3（减少接触/近身伤害）', max: 10, base: 18, per: { def: 3 }, icon: 'vitamin_g' },
  { id: 'spd', name: '特防强化', desc: '特防 +3（减少弹幕/远程伤害）', max: 10, base: 18, per: { spd: 3 }, icon: 'vitamin_y' },
  { id: 'spe', name: '速度强化', desc: '速度 +3', max: 8, base: 18, per: { spe: 3 }, icon: 'vitamin_spe' },
  { id: 'crit', name: '聚气', desc: '暴击率 +1%', max: 5, base: 30, per: { crit: 1 }, icon: 'lens' },
  { id: 'haste', name: 'PP 提升', desc: '技能急速 +2%', max: 5, base: 30, per: { haste: 2 }, icon: 'claw' },
  { id: 'regen', name: '树果园', desc: '生命回复 +1', max: 5, base: 25, per: { regen: 1 }, icon: 'berry' },
  { id: 'luck', name: '幸运草', desc: '幸运 +3', max: 5, base: 25, per: { luck: 3 }, icon: 'clover' },
  { id: 'xp', name: '学习机', desc: '经验获取 +4%', max: 5, base: 25, per: { xp: 4 }, icon: 'expshare' },
  { id: 'pickup', name: '吸铁石', desc: '拾取范围 +10%', max: 5, base: 15, per: { pickup: 10 }, icon: 'pull' },
  { id: 'money', name: '零花钱', desc: '开局金钱 +10', max: 5, base: 25, per: {}, startMoney: 10, icon: 'coin' },
  { id: 'reroll', name: '商店会员卡', desc: '每波商店免费刷新 +1 次', max: 2, base: 80, per: { rerolls: 1 }, icon: 'card' },
];

export function metaCost(u: MetaUpgrade, lv: number): number {
  return Math.round(u.base * Math.pow(lv + 1, 1.45));
}

export interface MetaBonus { mods: Partial<Mods>; startMoney: number }

export function metaBonus(levels: Record<string, number> | undefined): MetaBonus {
  const mods: Partial<Mods> = {};
  let startMoney = 0;
  for (const u of META_UPGRADES) {
    const lv = Math.max(0, Math.min(u.max, Math.floor(levels?.[u.id] ?? 0)));
    if (!lv) continue;
    for (const k in u.per) {
      const key = k as keyof Mods;
      mods[key] = (mods[key] ?? 0) + (u.per[key] ?? 0) * lv;
    }
    startMoney += (u.startMoney ?? 0) * lv;
  }
  return { mods, startMoney };
}

/** 一局结束后服务器发给每位玩家的战绩，用于成就判定与星之沙结算。 */
export interface RunSummary {
  line: LineId;
  wavesCleared: number;
  victory: boolean;
  kills: number;
  level: number;
  stage: number;
  finalForm: boolean;
  evolved: boolean;
  skillsFull: boolean;
  foreignSkill: boolean;
  items: number;
  moneyEarned: number;
  superEff: number;
  players: number;
  revives: number;
  bossKills: string[];
  damage: number;
}

export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  bestWave: number;
  coopRuns: number;
  revives: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  unlocks?: LineId;
  check: (r: RunSummary, s: LifetimeStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_wave', name: '初出茅庐', desc: '完成第 1 波', reward: 20, check: (r) => r.wavesCleared >= 1 },
  { id: 'reach_wave_5', name: '常磐森林的勇者', desc: '任意精灵到达第 5 波（解锁皮卡丘）', reward: 50, unlocks: 'pikachu', check: (r) => r.wavesCleared >= 4 },
  { id: 'evolve', name: '咦？进化了！', desc: '在一局中进化', reward: 30, check: (r) => r.evolved },
  { id: 'final_form', name: '最终形态', desc: '进化到最终形态', reward: 60, check: (r) => r.finalForm },
  { id: 'beat_snorlax', name: '叫醒卡比兽', desc: '击败第 10 波首领卡比兽', reward: 100, check: (r) => r.bossKills.includes('snorlax') },
  { id: 'reach_wave_15', name: '月见山探险家', desc: '完成第 15 波', reward: 150, check: (r) => r.wavesCleared >= 15 },
  { id: 'victory', name: '宝可梦大师', desc: '击败梦幻，通关第 20 波（解锁超梦）', reward: 300, unlocks: 'mewtwo', check: (r) => r.victory },
  { id: 'full_slots', name: '技能大师', desc: '技能栏全部填满', reward: 30, check: (r) => r.skillsFull },
  { id: 'foreign', name: '博采众长', desc: '学会一个不在自身技能表中的技能', reward: 30, check: (r) => r.foreignSkill },
  { id: 'collector', name: '道具收藏家', desc: '一局中持有 12 件道具', reward: 50, check: (r) => r.items >= 12 },
  { id: 'rich', name: '暴发户', desc: '一局中累计获得 1500 ₽', reward: 60, check: (r) => r.moneyEarned >= 1500 },
  { id: 'kills_400', name: '百战百胜', desc: '一局中击败 400 只宝可梦', reward: 50, check: (r) => r.kills >= 400 },
  { id: 'kills_total', name: '千锤百炼', desc: '累计击败 5000 只宝可梦', reward: 120, check: (_r, s) => s.kills >= 5000 },
  { id: 'super_eff', name: '效果拔群！', desc: '一局中打出 300 次效果拔群', reward: 40, check: (r) => r.superEff >= 300 },
  { id: 'coop', name: '并肩作战', desc: '与队友联机完成第 3 波', reward: 50, check: (r) => r.players >= 2 && r.wavesCleared >= 3 },
  { id: 'squad', name: '四人小队', desc: '4 人联机完成第 5 波', reward: 80, check: (r) => r.players >= 4 && r.wavesCleared >= 5 },
  { id: 'rescue', name: '救援队', desc: '联机中救起倒下的队友', reward: 40, check: (r) => r.revives >= 1 },
  { id: 'fire_heart', name: '火焰之心', desc: '用小火龙完成第 10 波', reward: 60, check: (r) => r.line === 'charmander' && r.wavesCleared >= 10 },
  { id: 'water_heart', name: '激流之心', desc: '用杰尼龟完成第 10 波', reward: 60, check: (r) => r.line === 'squirtle' && r.wavesCleared >= 10 },
  { id: 'grass_heart', name: '森林之心', desc: '用妙蛙种子完成第 10 波', reward: 60, check: (r) => r.line === 'bulbasaur' && r.wavesCleared >= 10 },
  { id: 'electric_heart', name: '雷电之心', desc: '用皮卡丘完成第 10 波', reward: 60, check: (r) => r.line === 'pikachu' && r.wavesCleared >= 10 },
  { id: 'pikachu_purist', name: '我的皮卡丘不进化', desc: '皮卡丘不进化完成第 15 波', reward: 120, check: (r) => r.line === 'pikachu' && r.stage === 0 && r.wavesCleared >= 15 },
  { id: 'mewtwo_win', name: '最强的宝可梦', desc: '用超梦通关', reward: 200, check: (r) => r.line === 'mewtwo' && r.victory },
];

export function stardustFor(r: RunSummary): number {
  let s = r.wavesCleared * 12 + Math.floor(r.kills / 20);
  if (r.bossKills.includes('snorlax')) s += 40;
  if (r.bossKills.includes('mew')) s += 120;
  if (r.victory) s += 150;
  if (r.players > 1) s = Math.round(s * 1.2);
  return s;
}
