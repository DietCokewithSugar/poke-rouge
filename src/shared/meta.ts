import { DIFFICULTIES, type DifficultyId } from './difficulty';
import { GYMS, badgeKey } from './gyms';
import { LINES, type LineId } from './pokemon';
import { addTypeMods, type Mods, type TypeMods } from './stats';
import type { SavedBuild } from './pvp/build';
import { TRAINERS } from './trainers';

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
  { id: 'recruit', name: '友情缎带', desc: '野生宝可梦的崇拜几率 +10%', max: 5, base: 35, per: { recruit: 10 }, icon: 'bow' },
  { id: 'shiny', name: '闪光研究', desc: '闪光宝可梦出现的几率 +60%', max: 5, base: 40, per: { shiny: 60 }, icon: 'shiny' },
];

export function metaCost(u: MetaUpgrade, lv: number): number {
  return Math.round(u.base * Math.pow(lv + 1, 1.45));
}

export interface MetaBonus { mods: Partial<Mods>; startMoney: number; typeMods: TypeMods }

/** 局外加成：大木研究所的强化 + 道馆徽章（levels 里的 badge_<道馆> 键） */
export function metaBonus(levels: Record<string, number> | undefined): MetaBonus {
  const mods: Partial<Mods> = {};
  const add = (per: Partial<Mods>, n: number) => {
    for (const k in per) {
      const key = k as keyof Mods;
      mods[key] = (mods[key] ?? 0) + (per[key] ?? 0) * n;
    }
  };
  let startMoney = 0;
  for (const u of META_UPGRADES) {
    const lv = Math.max(0, Math.min(u.max, Math.floor(levels?.[u.id] ?? 0)));
    if (!lv) continue;
    add(u.per, lv);
    startMoney += (u.startMoney ?? 0) * lv;
  }
  const typeMods: TypeMods = {};
  for (const g of GYMS) {
    if (!levels?.[badgeKey(g.id)]) continue;
    add(g.badge.mods, 1);
    addTypeMods(typeMods, g.badge.typeMods);
  }
  return { mods, startMoney, typeMods };
}

/** 一局结束后服务器发给每位玩家的战绩，用于成就判定与星之沙结算。 */
export interface RunSummary {
  line: LineId;
  /** 这一局用的是闪光宝可梦 */
  shiny: boolean;
  trainer: string;
  difficulty: DifficultyId;
  /** 有进化型的精灵全程没有进化 */
  neverEvolved: boolean;
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
  /** 本局结交的伙伴（进化线 id） */
  recruits: string[];
  /** 本局结交的闪光宝可梦（进化线 id） */
  shinyRecruits: string[];
  /** 各属性技能造成的伤害 */
  typeDmg: Record<string, number>;
  /** 结算界面的详细统计 */
  detail: RunDetail;
  /** 本局结束时的构筑，可以放进背包用来对战 */
  build?: SavedBuild;
}

export interface RunDetail {
  /** 本局总时长（秒，包括商店，不含暂停） */
  time: number;
  dex: number;
  form: string;
  kills: { minion: number; elite: number; boss: number };
  topKills: [string, number][];
  damageTaken: number;
  healed: number;
  crits: number;
  dodges: number;
  moneySpent: number;
  /** 各技能造成的伤害；_dot 为灼伤/中毒等持续伤害，_other 为反伤等 */
  skillDmg: [string, number][];
  skills: { id: string; lv: number }[];
  items: [string, number][];
  waves: { w: number; kills: number; dmg: number; taken: number; time: number }[];
  forms: number[];
}

export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  bestWave: number;
  coopRuns: number;
  revives: number;
  /** 累计结交的伙伴次数 */
  recruits: number;
  /** 已经拥有的宝可梦种类（进化线） */
  owned: number;
  /** 拿到的道馆徽章数 */
  badges: number;
  /** 拥有的闪光宝可梦种类（进化线） */
  shinies: number;
}

/** 击败道馆馆主时的情况（判定道馆成就用） */
export interface GymOutcome {
  gym: string;
  /** 队伍平均等级比馆主低 3 级以上 */
  underdog: boolean;
  /** 结束时队长由 AI 操作 */
  auto: boolean;
  /** 自己的宝可梦一只都没有退场 */
  flawless: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  /** 解锁的宝可梦（进化线） */
  unlocks?: LineId[];
  /** 解锁的训练家 */
  trainer?: string;
  /** 解锁的难度（仅用于展示） */
  unlocksDifficulty?: DifficultyId;
  /** g：刚刚击败道馆馆主时才有 */
  check: (r: RunSummary, s: LifetimeStats, g?: GymOutcome | null) => boolean;
}

/** 不在冒险结算时判定成就（例如赢了道馆之后）用的空战绩：只有累计统计和道馆成就可能达成 */
export const NO_RUN: RunSummary = {
  line: 'charmander', shiny: false, trainer: '', difficulty: 'easy', neverEvolved: false, wavesCleared: 0, victory: false, kills: 0, level: 0, stage: 0,
  finalForm: false, evolved: false, skillsFull: false, foreignSkill: false, items: 0, moneyEarned: 0, superEff: 0, players: 0, revives: 0,
  bossKills: [], damage: 0, recruits: [], shinyRecruits: [], typeDmg: {},
  detail: { time: 0, dex: 0, form: '', kills: { minion: 0, elite: 0, boss: 0 }, topKills: [], damageTaken: 0, healed: 0, crits: 0, dodges: 0, moneySpent: 0, skillDmg: [], skills: [], items: [], waves: [], forms: [] },
};

/** 属性成就：一局中用这个属性的技能造成的伤害 */
export const TYPE_DMG_GOAL = 200000;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_wave', name: '初出茅庐', desc: '完成第 1 波', reward: 20, check: (r) => r.wavesCleared >= 1 },
  { id: 'first_recruit', name: '新的伙伴', desc: '在冒险中第一次让野生宝可梦崇拜你', reward: 30, check: (_r, s) => s.recruits >= 1 },
  { id: 'reach_wave_5', name: '常磐森林的勇者', desc: '任意宝可梦到达第 5 波', reward: 50, unlocks: ['pikachu'], check: (r) => r.wavesCleared >= 4 },
  { id: 'evolve', name: '咦？进化了！', desc: '在一局中进化', reward: 30, check: (r) => r.evolved },
  { id: 'final_form', name: '最终形态', desc: '进化到最终形态', reward: 60, check: (r) => r.finalForm },
  { id: 'beat_snorlax', name: '叫醒卡比兽', desc: '击败第 10 波首领卡比兽', reward: 100, unlocks: ['snorlax'], trainer: 'gary', check: (r) => r.bossKills.includes('snorlax') },
  { id: 'recruit_run_3', name: '人见人爱', desc: '一局中结交 3 位新伙伴', reward: 60, check: (r) => r.recruits.length >= 3 },
  { id: 'recruit_10', name: '广交朋友', desc: '累计结交 10 位伙伴', reward: 80, unlocks: ['eevee'], check: (_r, s) => s.recruits >= 10 },
  { id: 'dex_20', name: '图鉴收集家', desc: '拥有 20 种宝可梦', reward: 100, check: (_r, s) => s.owned >= 20 },
  { id: 'dex_40', name: '图鉴博士', desc: '拥有 40 种宝可梦', reward: 200, unlocks: ['mew'], check: (_r, s) => s.owned >= 40 },
  { id: 'reach_wave_15', name: '月见山探险家', desc: '完成第 15 波', reward: 150, unlocks: ['omanyte', 'kabuto'], check: (r) => r.wavesCleared >= 15 },
  { id: 'victory', name: '宝可梦大师', desc: '击败梦幻，通关任意难度（解锁普通难度）', reward: 300, unlocks: ['dratini'], trainer: 'giovanni', unlocksDifficulty: 'normal', check: (r) => r.victory },
  { id: 'victory_normal', name: '道馆馆主', desc: '通关普通模式（解锁困难难度）', reward: 400, trainer: 'lance', unlocksDifficulty: 'hard', check: (r) => r.victory && r.difficulty !== 'easy' },
  { id: 'victory_hard', name: '冠军之路', desc: '通关困难模式', reward: 600, unlocks: ['mewtwo'], check: (r) => r.victory && r.difficulty === 'hard' },
  { id: 'no_evolve_win', name: '坚持自我', desc: '用会进化的宝可梦不进化通关', reward: 150, check: (r) => r.victory && r.neverEvolved },
  { id: 'full_slots', name: '技能大师', desc: '技能栏全部填满', reward: 30, check: (r) => r.skillsFull },
  { id: 'foreign', name: '博采众长', desc: '学会一个不在自身技能表中的技能', reward: 30, check: (r) => r.foreignSkill },
  { id: 'collector', name: '道具收藏家', desc: '一局中持有 12 件道具', reward: 50, check: (r) => r.items >= 12 },
  { id: 'rich', name: '暴发户', desc: '一局中累计获得 1500 ₽', reward: 60, unlocks: ['porygon'], check: (r) => r.moneyEarned >= 1500 },
  { id: 'kills_400', name: '百战百胜', desc: '一局中击败 400 只宝可梦', reward: 50, check: (r) => r.kills >= 400 },
  { id: 'kills_total', name: '千锤百炼', desc: '累计击败 5000 只宝可梦', reward: 120, unlocks: ['aerodactyl'], check: (_r, s) => s.kills >= 5000 },
  { id: 'super_eff', name: '效果拔群！', desc: '一局中打出 300 次效果拔群', reward: 40, check: (r) => r.superEff >= 300 },
  { id: 'ice_age', name: '冰河时代', desc: `一局中用冰系技能造成 ${TYPE_DMG_GOAL / 10000} 万点伤害`, reward: 120, unlocks: ['articuno'], check: (r) => (r.typeDmg.ice ?? 0) >= TYPE_DMG_GOAL },
  { id: 'thunder_storm', name: '雷霆万钧', desc: `一局中用电系技能造成 ${TYPE_DMG_GOAL / 10000} 万点伤害`, reward: 120, unlocks: ['zapdos'], check: (r) => (r.typeDmg.electric ?? 0) >= TYPE_DMG_GOAL },
  { id: 'inferno', name: '燎原烈火', desc: `一局中用火系技能造成 ${TYPE_DMG_GOAL / 10000} 万点伤害`, reward: 120, unlocks: ['moltres'], check: (r) => (r.typeDmg.fire ?? 0) >= TYPE_DMG_GOAL },
  { id: 'coop', name: '并肩作战', desc: '与队友联机完成第 3 波', reward: 50, check: (r) => r.players >= 2 && r.wavesCleared >= 3 },
  { id: 'squad', name: '四人小队', desc: '4 人联机完成第 5 波', reward: 80, check: (r) => r.players >= 4 && r.wavesCleared >= 5 },
  { id: 'rescue', name: '救援队', desc: '联机中救起倒下的队友', reward: 40, check: (r) => r.revives >= 1 },
  { id: 'fire_heart', name: '火焰之心', desc: '用小火龙完成第 10 波', reward: 60, check: (r) => r.line === 'charmander' && r.wavesCleared >= 10 },
  { id: 'water_heart', name: '激流之心', desc: '用杰尼龟完成第 10 波', reward: 60, check: (r) => r.line === 'squirtle' && r.wavesCleared >= 10 },
  { id: 'grass_heart', name: '森林之心', desc: '用妙蛙种子完成第 10 波', reward: 60, check: (r) => r.line === 'bulbasaur' && r.wavesCleared >= 10 },
  { id: 'electric_heart', name: '雷电之心', desc: '用皮卡丘完成第 10 波', reward: 60, check: (r) => r.line === 'pikachu' && r.wavesCleared >= 10 },
  { id: 'pikachu_purist', name: '我的皮卡丘不进化', desc: '皮卡丘不进化完成第 15 波', reward: 120, check: (r) => r.line === 'pikachu' && r.stage === 0 && r.wavesCleared >= 15 },
  { id: 'magikarp_power', name: '鲤鱼跃龙门', desc: '用鲤鱼王完成第 10 波', reward: 100, check: (r) => r.line === 'magikarp' && r.wavesCleared >= 10 },
  { id: 'eevee_master', name: '伊布进化家', desc: '让伊布进化并完成第 10 波', reward: 80, check: (r) => r.line === 'eevee' && r.stage > 0 && r.wavesCleared >= 10 },
  { id: 'mewtwo_win', name: '最强的宝可梦', desc: '用超梦通关', reward: 200, check: (r) => r.line === 'mewtwo' && r.victory },
  // 道馆：按顺序挑战，所以拿到第 N 枚徽章就说明打败了第 N 个道馆的馆主
  { id: 'badge_1', name: '坚如磐石', desc: '击败深灰道馆馆主小刚，获得灰色徽章', reward: 40, trainer: 'brock', check: (_r, s) => s.badges >= 1 },
  { id: 'badge_4', name: '半程冠军', desc: '集齐 4 枚道馆徽章', reward: 100, check: (_r, s) => s.badges >= 4 },
  { id: 'badge_6', name: '预知未来', desc: '击败金黄道馆馆主娜姿，获得金色徽章', reward: 120, trainer: 'sabrina', check: (_r, s) => s.badges >= 6 },
  { id: 'badge_8', name: '宝可梦联盟的资格', desc: '集齐全部 8 枚道馆徽章', reward: 300, check: (_r, s) => s.badges >= 8 },
  { id: 'gym_underdog', name: '以弱胜强', desc: '用平均等级比馆主低 3 级以上的队伍击败道馆馆主', reward: 80, check: (_r, _s, g) => !!g?.underdog },
  { id: 'gym_auto', name: '斗蛐蛐大师', desc: '开着自动战斗击败道馆馆主', reward: 40, check: (_r, _s, g) => !!g?.auto },
  { id: 'gym_flawless', name: '一只都没少', desc: '自己的三只宝可梦都没有退场，击败道馆馆主', reward: 80, check: (_r, _s, g) => !!g?.flawless },
  // 闪光宝可梦
  { id: 'shiny_1', name: '闪闪发光', desc: '得到第一只闪光宝可梦', reward: 60, check: (_r, s) => s.shinies >= 1 },
  { id: 'shiny_5', name: '闪光收藏家', desc: '拥有 5 种闪光宝可梦', reward: 150, check: (_r, s) => s.shinies >= 5 },
  { id: 'shiny_15', name: '异色猎人', desc: '拥有 15 种闪光宝可梦', reward: 400, check: (_r, s) => s.shinies >= 15 },
  { id: 'shiny_partner', name: '闪耀登场', desc: '带着闪光宝可梦完成第 10 波', reward: 80, check: (r) => r.shiny && r.wavesCleared >= 10 },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function stardustFor(r: RunSummary): number {
  let s = r.wavesCleared * 12 + Math.floor(r.kills / 20) + r.recruits.length * 15 + r.shinyRecruits.length * 30;
  if (r.bossKills.includes('snorlax')) s += 40;
  if (r.bossKills.includes('mew')) s += 120;
  if (r.victory) s += 150;
  if (r.players > 1) s *= 1.2;
  return Math.round(s * DIFFICULTIES[r.difficulty].stardust);
}

/** 宝可梦的解锁条件（给界面显示） */
export function unlockHint(line: LineId): string {
  const u = LINES[line]?.unlock;
  if (!u) return '';
  const parts: string[] = [];
  if (u.start) parts.push('冒险开始时可以选为初始伙伴');
  if (u.ach) {
    const a = ACHIEVEMENT_BY_ID[u.ach];
    if (a) parts.push(`成就「${a.name}」：${a.desc}`);
  }
  if (u.cost) parts.push(`在真新镇向鲤鱼王推销员购买（${u.cost} 星之沙）`);
  if (u.recruit > 0) parts.push('在冒险中击败它，有几率让它崇拜你');
  return parts.join('；或');
}

/** 训练家的解锁条件 */
export function trainerHint(id: string): string {
  const t = TRAINERS[id];
  if (!t) return '';
  if (t.unlock.start) return '初始可用';
  const a = t.unlock.ach ? ACHIEVEMENT_BY_ID[t.unlock.ach] : null;
  const parts = [t.unlock.cost ? `在我的家用 ${t.unlock.cost} 星之沙招募` : '', a ? `成就「${a.name}」：${a.desc}` : ''].filter(Boolean);
  return parts.join('；或');
}
