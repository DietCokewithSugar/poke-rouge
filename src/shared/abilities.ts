/**
 * 特性：每个形态一个（只有一种形态的宝可梦按觉醒换特性：Lv1、第一次觉醒、第二次觉醒）。
 * 同名特性在不同宝可梦身上可能是不同的实现（茂盛 / 茂盛+ / 茂盛++、两种叶绿素……），每一种都单独列出来。
 * 效果全部用下面的字段描述，模拟层按字段处理；距离以地图格为单位（1 格 = 场地的一个格子，16 像素）。
 */
import { FIELDS, FIELD_CELL, FIELD_IDS, NO_MOVE_MOD, fieldBurns, fieldSpeed, moveMod, type FieldId, type FieldVerdict, type MoveMod } from './fields';
import type { Mods } from './stats';
import type { PType } from './types';

/** 被对手的技能打中时让对手陷入的状态 */
export type Retaliate =
  | 'toxic'  // 中毒：连续三秒分别损失 5%、10%、15% 的 HP
  | 'para'   // 麻痹：移动速度只剩 25%
  | 'charm'  // 着迷：定身 2 秒，技能照常使用
  | 'spore'  // 孢子：70% 麻痹、30% 睡眠，持续 3 秒
  | 'burn'   // 烧伤：物理攻击伤害 -50%，持续 3 秒
  | 'curse'; // 诅咒：全部技能冷却时间 +200%

/** 站在场地里（fields 省略为任何场地）的效果 */
export interface InFieldFx {
  fields?: FieldId[];
  /** 全部技能伤害 +% */
  dmg?: number;
  /** 某些属性的技能伤害 +% */
  typeDmg?: Partial<Record<PType, number>>;
  /** 闪避对手全部攻击的几率 % */
  dodge?: number;
  /** 每秒回复最大 HP 的比例 */
  regen?: number;
  /** 移动速度 +% */
  move?: number;
  /** 技能范围 +% */
  range?: number;
  /** 物防、特防 +% */
  def?: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  /** 常驻的能力加成（和道具一样按点数，10 = 10%） */
  mods?: Partial<Mods>;
  /** 移动速度 +%（常驻） */
  move?: number;
  /** 某些属性的技能伤害 +% */
  typeDmg?: Partial<Record<PType, number>>;
  /** 全部技能伤害 +%（常驻） */
  dmg?: number;
  /** 全部技能的冷却时间倍率（常驻） */
  cd?: number;
  /** 指定技能：伤害 +%、冷却倍率、每次使用扣除自身最大 HP 的比例 */
  moves?: { ids: string[]; dmg?: number; cd?: number; cost?: number };
  /** 这些等级（1 初级 … 4 究极）的技能伤害 +% */
  tierDmg?: { tiers: number[]; dmg: number };
  /** 这些等级的技能必定暴击 */
  tierCrit?: number[];
  /** HP 低于 1/2 时：type 属性（省略为全部）的技能伤害 +%、全部技能暴击率 +%、移动速度 +%；field：每波第一次低于 1/2 时在身边生成的场地 */
  lowHp?: { type?: PType; dmg?: number; crit?: number; move?: number; field?: FieldId };
  /** HP 高于 1/2 时：全部技能伤害 +%、移动速度 +%、物防特防 +% */
  highHp?: { dmg?: number; move?: number; def?: number };
  /** 陷入异常状态或站在对自己不利的场地里时 */
  afflicted?: { dmg?: number; move?: number; def?: number };
  /** 属性相性：效果不好 / 效果绝佳时伤害额外 +% */
  eff?: { weak: number; strong: number };
  /** 局部阵雨里这个属性的技能对任何对手都效果绝佳 */
  rainSE?: PType;
  /** 只对物理技能的闪避 % */
  physDodge?: number;
  /** 受到的物理伤害倍率 */
  physTaken?: number;
  /** 这些属性的技能对自己无效 */
  immune?: PType[];
  /** 这些属性的技能对自己无效，应受的伤害变成回复 */
  absorb?: PType[];
  /** 受到这些属性的技能时，伤害变成应有伤害的 mult 倍 */
  resist?: { types: PType[]; mult: number };
  /** 受到这些属性的技能时，把应受伤害的 pct 反弹给对手 */
  reflect?: { types: PType[]; pct: number };
  /** 被对手的技能打中时（cat 省略为任何技能）有几率让对手陷入状态 */
  onHurt?: { cat?: 'phys' | 'spec'; chance: number; fx: Retaliate }[];
  /** 被对手的技能打中时回复最大 HP 的比例 */
  hurtHeal?: number;
  /** 被对手的技能暴击时：除 HP 外全能力 +100%，持续 dur 秒；结束后移动速度 -50%，持续 2 秒 */
  angerPoint?: number;
  /** 每秒回复最大 HP 的比例 */
  regen?: number;
  /** 脱战（全部技能都没有选中目标）时每秒回复最大 HP 的比例 */
  idleRegen?: number;
  /** 不会陷入异常状态（all）/ 不会睡着 / 不会麻痹 */
  noStatus?: 'all' | 'sleep' | 'para';
  /** 对手的技能想让自己陷入异常状态时，把它反弹给对手 */
  reflectStatus?: boolean;
  /** 不受技能附加效果与对手特性的影响 */
  clearBody?: boolean;
  /** 不受场地负面效果影响：任何场地（all）或列出的场地 */
  fieldSafe?: 'all' | FieldId[];
  /** 无论招式是什么属性，都享有场地的正面效果 */
  adapt?: boolean;
  inField?: InFieldFx[];
  /** 等级达到进化条件时自动强制进化 */
  forceEvo?: boolean;
  /** 释放任何技能后移动速度 +move%，持续 dur 秒（不叠加） */
  castMove?: { move: number; dur: number };
  /** 使用 type 属性的技能后，有 chance 的几率在 dur 秒内闪避对手全部攻击（不叠加） */
  castEvade?: { type: PType; chance: number; dur: number };
  /** 造成暴击时，被暴击的对手移动速度 -amount，持续 dur 秒 */
  critSlow?: { amount: number; dur: number };
  /** 物理技能打中对手时，对手接下来 dur 秒释放的全部技能伤害 ×mult（不叠加） */
  physWeaken?: { mult: number; dur: number };
  /** 站在 field 里时，技能打中对手有 chance 的几率定身 dur 秒 */
  fieldRoot?: { field: FieldId; chance: number; dur: number };
  /** 范围技能同时命中 3 个以上对手时伤害 +dmg%；对战里有别的队友也有斗争心时，全部技能再 +team% */
  rivalry?: { dmg: number; team: number };
  /** 技能对队友的回复效果 +heal%，被回复的队友物防特防 +def%（4 秒） */
  teamBoost?: { heal: number; def: number };
  /** 火焰旋涡命中的对手：每层减速 slow（最多 max），每秒损失最大 HP 的 dot，持续 dur 秒 */
  sunny?: { skill: string; slow: number; max: number; dot: number; dur: number };
  /** 弹体技能直线贯穿 n 个额外的对手（不够就一直飞到地图外） */
  pierce?: number;
  /** 地图道具（橙橙果、种子）的效果倍率 */
  pickupBoost?: number;
  /** 对战里己方在场的宝可梦比对手少时，物防特防 +% */
  outnumbered?: number;
  /** 携带吃剩的东西时每秒回复最大 HP 的比例；地图上的橙橙果回复量倍率 */
  gluttony?: { regen: number; berry: number };
  /** 每波一次：受到致命伤害时保留 1 HP，之后 armor 秒内不受对手的伤害与负面影响 */
  sturdy?: { armor: number };
  /** 光环（半径 cells 格）里所有电系宝可梦（包括对手）技能冷却倍率 cd；携带磁铁时自身电 / 钢系技能伤害 +item% */
  magnet?: { cells: number; cd: number; item: number };
  /** 离自己 cells 格以内的对手无法对自己使用技能 */
  stench?: number;
  /** 多发弹体的技能多发射几发 */
  skillLink?: number;
  /** 每波一次：被击倒时以自身为圆心（cells 格）爆炸，范围内所有宝可梦损失最大 HP 的 pct */
  aftermath?: { cells: number; pct: number };
  /** 每隔 every 秒（站在繁茂草丛里 grass 秒）在身边生成一个树果 */
  harvest?: { every: number; grass: number };
  /** 冒险开局得到一根粗骨头，刷新商店时有 shop 的几率刷到粗骨头；每根物攻 +atk%，最多 max 根 */
  club?: { atk: number; max: number; shop: number };
  /** 冒险开局得到金属粉或速度粉，刷新商店时有 shop 的几率刷到；每个 +20%，各最多 max 个 */
  powders?: { pct: number; max: number; shop: number };
  /** 不受技能反作用伤害 */
  rockHead?: boolean;
  /** 光环（cells 格）里的队友（含自己）每秒回复最大 HP 的 regen；share：替范围里的队友分担这个比例的伤害 */
  healer?: { cells: number; regen: number; share?: number };
  /** 一般系技能对幽灵系对手伤害 +%，并无视对手的闪避 */
  scrappy?: number;
  /** 野生 / AI 操作的宝可梦优先攻击自己 */
  aggro?: boolean;
  /** 造成伤害时无视对手的技能、场地、特性、道具带来的物防特防加成 */
  moldBreaker?: boolean;
  /** 复制离自己最近的 n 个对手的特性 */
  copy?: number;
  /** 光环（cells 格）里的对手技能冷却倍率 cd、移动速度 -slow */
  pressure?: { cells: number; cd: number; slow: number };
  /** 每隔 every 秒在身边生成 cells×cells 格的场地（life 秒后消失）；站在这种场地里时对手 immune 属性的技能对自己无效 */
  selfField?: { kind: FieldId; every: number; life: number; cells: number; immune: PType };
  /** 光环（cells 格）里对手的特性被暂时消去 */
  suppress?: { cells: number };
}

/** 半径（像素）：「N×N 格」的光环直径是 N 格 */
export const auraRadius = (cells: number) => (cells * FIELD_CELL) / 2;

const PUNCHES = ['brick_break', 'close_combat', 'karate_chop', 'cross_chop', 'meteor_mash', 'bullet_punch', 'fire_punch', 'thunder_punch', 'ice_punch'];
const RECKLESS = ['double_edge', 'close_combat', 'seismic_toss', 'high_jump_kick'];
const CHLORO = ['synthesis', 'giga_drain', 'leech_seed'];
const WEATHER: FieldId[] = ['smog', 'rain', 'updraft', 'frost'];
const FILTER: PType[] = ['normal', 'psychic', 'fighting', 'ghost', 'fairy'];
const FAT: PType[] = ['fire', 'water', 'ice', 'fighting'];

const NO_EVO = '等级达到进化条件时会自动强制进化。';
const SPLASH = '每波一次（对战中一场一次），HP 第一次低于 1/2 时，在自己周围小范围内（约 3×3 格）生成';
const SHED = '不会陷入异常状态；不受任何场地负面效果影响';
const PRESS = (n: number) => `以自身为圆心的范围内（约 ${n}×${n} 格，淡白色圈为视觉提示）的所有对手宝可梦，技能冷却时间 +100%，且移动速度 -50%。`;
const BIRD = (field: string, type: string) => `每隔 5 秒，以自身为圆心（约 4×4 格）生成一块${field}场地，3 秒后消失；自身处于${field}场地时，对手的所有${type}属性技能无法对自身造成伤害。`;
const IMPOSTER = '进入冒险模式时，背包自动放入商店道具金属粉 ×1 或速度粉 ×1，每次刷新商店有 10% 几率刷出这两种道具之一；每携带一个金属粉，自身最大 HP +20%、物防特防 +20%（最多 5 个）；每携带一个速度粉，自身物攻特攻 +20%、移动速度 +20%（最多 5 个）。';

const LIST: AbilityDef[] = [
  // ---------- 御三家 ----------
  { id: 'overgrow', name: '茂盛', desc: 'HP 低于 1/2 时，自身使用草系技能伤害 +30%。', lowHp: { type: 'grass', dmg: 30 } },
  { id: 'overgrow_p', name: '茂盛+', desc: 'HP 低于 1/2 时，自身使用草系技能伤害 +40%。', lowHp: { type: 'grass', dmg: 40 } },
  { id: 'overgrow_pp', name: '茂盛++', desc: `HP 低于 1/2 时，自身使用草系技能伤害 +50%；${SPLASH}繁茂草丛场地。`, lowHp: { type: 'grass', dmg: 50, field: 'grass' } },
  { id: 'blaze', name: '猛火', desc: 'HP 低于 1/2 时，自身使用火系技能伤害 +30%。', lowHp: { type: 'fire', dmg: 30 } },
  { id: 'blaze_p', name: '猛火+', desc: 'HP 低于 1/2 时，自身使用火系技能伤害 +40%。', lowHp: { type: 'fire', dmg: 40 } },
  { id: 'blaze_pp', name: '猛火++', desc: `HP 低于 1/2 时，自身使用火系技能伤害 +50%；${SPLASH}熔岩池场地。`, lowHp: { type: 'fire', dmg: 50, field: 'lava' } },
  { id: 'torrent', name: '激流', desc: 'HP 低于 1/2 时，自身使用水系技能伤害 +30%。', lowHp: { type: 'water', dmg: 30 } },
  { id: 'torrent_p', name: '激流+', desc: 'HP 低于 1/2 时，自身使用水系技能伤害 +40%。', lowHp: { type: 'water', dmg: 40 } },
  { id: 'torrent_pp', name: '激流++', desc: `HP 低于 1/2 时，自身使用水系技能伤害 +50%；${SPLASH}局部阵雨场地。`, lowHp: { type: 'water', dmg: 50, field: 'rain' } },

  // ---------- 虫 ----------
  { id: 'shield_dust', name: '鳞粉', desc: `40% 几率闪避对手的任何技能；${NO_EVO}`, mods: { dodge: 40 }, forceEvo: true },
  { id: 'shed_skin_p', name: '蜕皮+', desc: `每秒回复自身 20% 的最大 HP；${SHED}；${NO_EVO}`, regen: 0.2, noStatus: 'all', fieldSafe: 'all', forceEvo: true },
  { id: 'tinted_lens', name: '有色眼镜', desc: '自身使用的技能若属性对对手效果不佳，伤害额外 +100%；若效果绝佳，伤害额外 +150%。', eff: { weak: 100, strong: 150 } },
  {
    id: 'poison_point', name: '毒刺', desc: `受到物理攻击时，对手的技能伤害 -50%，并有 50% 几率令对手中毒（连续三秒，分别扣除对手 5%、10%、15% 的 HP）；${NO_EVO}`,
    physTaken: 0.5, onHurt: [{ cat: 'phys', chance: 0.5, fx: 'toxic' }], forceEvo: true,
  },
  { id: 'swarm', name: '虫之预感', desc: 'HP 低于 1/2 时，自身使用虫系技能伤害 +30%，且全部技能暴击率 +30%。', lowHp: { type: 'bug', dmg: 30, crit: 30 } },
  { id: 'swarm_pp', name: '虫之预感++', desc: 'HP 低于 1/2 时，自身使用虫系技能伤害 +50%，且全部技能暴击率 +50%。', lowHp: { type: 'bug', dmg: 50, crit: 50 } },

  // ---------- 鸟、鼠 ----------
  { id: 'keen_eye', name: '锐利目光', desc: '自身技能范围 +30%。', mods: { range: 30 } },
  { id: 'keen_eye_p', name: '锐利目光+', desc: '自身技能范围 +40%。', mods: { range: 40 } },
  { id: 'keen_eye_pp', name: '锐利目光++', desc: '自身技能范围 +50%，自身移动速度 +15%。', mods: { range: 50 }, move: 15 },
  { id: 'run_away', name: '逃跑', desc: '释放任何技能后，自身移动速度 +50%（持续 2 秒），效果不可叠加。', castMove: { move: 50, dur: 2 } },
  { id: 'run_away_p', name: '逃跑+', desc: '释放任何技能后，自身移动速度 +100%（持续 2 秒），效果不可叠加。', castMove: { move: 100, dur: 2 } },
  { id: 'guts', name: '毅力', desc: '陷入异常状态或自身处在不利的场地时，自身技能伤害 +150%。', afflicted: { dmg: 150 } },
  { id: 'sniper', name: '狙击手', desc: '自身技能范围 -20%，暴击率 +30%；造成暴击时，被暴击的对手移动速度 -50%，持续 2 秒。', mods: { range: -20, crit: 30 }, critSlow: { amount: 0.5, dur: 2 } },
  { id: 'shed_skin', name: '蜕皮', desc: `${SHED}。`, noStatus: 'all', fieldSafe: 'all' },
  { id: 'intimidate', name: '威吓', desc: '自身的物理攻击击中对手时，被击中的对手接下来 3 秒内释放的全部技能伤害 -50%，该效果不可叠加。', physWeaken: { mult: 0.5, dur: 3 } },

  // ---------- 电 ----------
  { id: 'static_pp', name: '静电++', desc: '自身使用电系技能时伤害 +50%；被对手的物理攻击命中时，50% 几率令对手麻痹（移动速度变为最大移动速度的 25%）。', typeDmg: { electric: 50 }, onHurt: [{ cat: 'phys', chance: 0.5, fx: 'para' }] },
  { id: 'static', name: '静电', desc: '自身使用电系技能时伤害 +30%；被对手的物理攻击命中时，30% 几率令对手麻痹（移动速度变为最大移动速度的 25%）。', typeDmg: { electric: 30 }, onHurt: [{ cat: 'phys', chance: 0.3, fx: 'para' }] },
  { id: 'lightning_rod_p', name: '避雷针+', desc: '自身使用电系技能时伤害 +20%；自身处于局部阵雨场地时，电系技能无论对手是什么属性都效果绝佳。', typeDmg: { electric: 20 }, rainSE: 'electric' },

  // ---------- 地面 ----------
  {
    id: 'sand_veil', name: '沙隐', desc: '自身使用地面系技能后，20% 几率在 1 秒内闪避对手的全部攻击（不可叠加）；自身处于开阔空地场地时，有 10% 几率闪避对手的全部攻击。',
    castEvade: { type: 'ground', chance: 0.2, dur: 1 }, inField: [{ fields: ['clearing'], dodge: 10 }],
  },
  {
    id: 'sand_rush', name: '拨沙', desc: '自身使用地面系技能后，20% 几率在 1 秒内闪避对手的全部攻击（不可叠加）；自身处于开阔空地场地时，自身移动速度 +30%。',
    castEvade: { type: 'ground', chance: 0.2, dur: 1 }, inField: [{ fields: ['clearing'], move: 30 }],
  },
  { id: 'arena_trap', name: '沙穴', desc: '自身移动速度 +20%，闪避 +10%；自身处于开阔空地场地时，使用任何技能附带 30% 几率定身对手。', mods: { dodge: 10 }, move: 20, fieldRoot: { field: 'clearing', chance: 0.3, dur: 1.5 } },

  // ---------- 尼多 ----------
  ...([['rivalry', '斗争心', 30], ['rivalry_p', '斗争心+', 40], ['rivalry_pp', '斗争心++', 50]] as const).map(([id, name, dmg]): AbilityDef => ({
    id, name, rivalry: { dmg, team: 25 },
    desc: `自身的范围技能同时命中 3 个以上对手时，对命中的对手伤害 +${dmg}%；对战中若除自身外的队友也有斗争心（斗争心、斗争心+、斗争心++），自身技能伤害再 +25%。`,
  })),

  // ---------- 妖精、火狐、胖丁、蝙蝠 ----------
  { id: 'friend_guard', name: '友情防守', desc: '脱战（自身全部技能都没有选中目标）时，每秒回复自身 20% 的最大 HP；自身技能对队友的增益效果提升 30%，被施加效果的队友物防特防 +30%。', idleRegen: 0.2, teamBoost: { heal: 30, def: 30 } },
  { id: 'friend_guard_p', name: '友情防守+', desc: '脱战（自身全部技能都没有选中目标）时，每秒回复自身 10% 的最大 HP；自身技能对队友的增益效果提升 40%，被施加效果的队友物防特防 +40%。', idleRegen: 0.1, teamBoost: { heal: 40, def: 40 } },
  { id: 'flash_fire', name: '引火', desc: '火系技能伤害 +20%；自身处于熔岩池场地时，火系技能伤害再 +50%。', typeDmg: { fire: 20 }, inField: [{ fields: ['lava'], typeDmg: { fire: 50 } }] },
  { id: 'drought', name: '日照', desc: '使用火焰旋涡时，被击中的对手移动速度 -30%，并每秒损失最大 HP 的 10%，持续 3 秒；连续命中同一对手可叠加减速效果，最多 -90%。', sunny: { skill: 'fire_spin', slow: 0.3, max: 0.9, dot: 0.1, dur: 3 } },
  { id: 'cute_charm', name: '迷人之躯', desc: '自身遭受任何攻击时，有 20% 几率令对手着迷（定身 2 秒，对手范围内的技能可照常使用）。', onHurt: [{ chance: 0.2, fx: 'charm' }] },
  { id: 'cute_charm_p', name: '迷人之躯+', desc: '自身遭受任何攻击时，有 30% 几率令对手着迷（定身 2 秒，对手范围内的技能可照常使用）。', onHurt: [{ chance: 0.3, fx: 'charm' }] },
  { id: 'infiltrator', name: '穿透', desc: '自身技能范围 +20%；弹体技能锁定最近的对手直线发射，穿透额外 2 个对手后才会停止，不足 2 个则一直飞到地图外。', mods: { range: 20 }, pierce: 2 },
  { id: 'infiltrator_p', name: '穿透+', desc: '自身技能范围 +30%；弹体技能锁定最近的对手直线发射，穿透额外 4 个对手后才会停止，不足 4 个则一直飞到地图外。', mods: { range: 30 }, pierce: 4 },

  // ---------- 草 ----------
  { id: 'chlorophyll', name: '叶绿素', desc: '自身处于繁茂草丛场地时，有 30% 几率闪避对手的全部攻击；不受阴云毒雾场地的负面效果影响。', inField: [{ fields: ['grass'], dodge: 30 }], fieldSafe: ['smog'] },
  { id: 'chlorophyll_p', name: '叶绿素+', desc: '自身使用光合作用、终极吸取与寄生种子时，技能冷却时间 -40%；不受阴云毒雾场地的负面效果影响。', moves: { ids: CHLORO, cd: 0.6 }, fieldSafe: ['smog'] },
  { id: 'chlorophyll_pp', name: '叶绿素++', desc: '自身使用光合作用、终极吸取与寄生种子时，技能冷却时间 -50%；不受阴云毒雾场地的负面效果影响。', moves: { ids: CHLORO, cd: 0.5 }, fieldSafe: ['smog'] },
  { id: 'chloro_toxin', name: '叶绿毒', desc: '自身处于繁茂草丛场地时，有 30% 几率闪避对手的全部攻击；不受阴云毒雾场地的负面效果影响。', inField: [{ fields: ['grass'], dodge: 30 }], fieldSafe: ['smog'] },
  { id: 'effect_spore', name: '孢子', desc: '受到特殊攻击时，70% 几率令对手麻痹（移动速度变为最大移动速度的 25%），30% 几率令对手睡眠（定身且无法释放技能），持续 3 秒。', onHurt: [{ cat: 'spec', chance: 1, fx: 'spore' }] },
  { id: 'wonder_skin', name: '奇迹皮肤', desc: '自身处于任何场地时，不受场地的负面影响，且自身技能伤害 +30%。', fieldSafe: 'all', inField: [{ dmg: 30 }] },
  { id: 'gluttony', name: '贪吃鬼', desc: '携带吃剩的东西时，每秒回复最大 HP 的 1%；吃到地图上的橙橙果时，回复量是普通回复量的 100%。', gluttony: { regen: 0.01, berry: 1 } },
  { id: 'gluttony_p', name: '贪吃鬼+', desc: '携带吃剩的东西时，每秒回复最大 HP 的 2%；吃到地图上的橙橙果时，回复量是普通回复量的 200%。', gluttony: { regen: 0.02, berry: 2 } },
  { id: 'gluttony_pp', name: '贪吃鬼++', desc: '携带吃剩的东西时，每秒回复最大 HP 的 3%；吃到地图上的橙橙果时，回复量是普通回复量的 300%。', gluttony: { regen: 0.03, berry: 3 } },
  { id: 'harvest', name: '收获', desc: '每隔 5 秒在身边（约 1 格内）随机生成一个树果（50% 橙橙果，50% 能治好任何异常状态的星桃果）；自身处于繁茂草丛场地时每 3 秒生成一个。', harvest: { every: 5, grass: 3 } },
  { id: 'regenerator', name: '再生力', desc: '自身物防特防 +20%；每次遭受对手的技能攻击时，立刻回复自身 5% 的最大 HP。', mods: { defPct: 20, spdPct: 20 }, hurtHeal: 0.05 },
  { id: 'regenerator_p', name: '再生力+', desc: '自身物防特防 +30%；每次遭受对手的技能攻击时，立刻回复自身 5% 的最大 HP。', mods: { defPct: 30, spdPct: 30 }, hurtHeal: 0.05 },

  // ---------- 喵喵、可达鸭、猴怪、卡蒂狗 ----------
  { id: 'pickup', name: '捡拾', desc: '金钱获取 +20%；地图上生成的道具（橙橙果、各种种子）的增益效果翻倍。', mods: { money: 20 }, pickupBoost: 2 },
  { id: 'technician', name: '技术高手', desc: '自身使用初级或中级的技能时，对对手造成的伤害 +150%。', tierDmg: { tiers: [1, 2], dmg: 150 } },
  { id: 'technician_p', name: '技术高手+', desc: '自身使用初级或中级的技能时，对对手造成的伤害 +200%。', tierDmg: { tiers: [1, 2], dmg: 200 } },
  { id: 'cloud_nine', name: '无关天气', desc: '自身处于阴云毒雾、局部阵雨、上升气流与寒霜区域场地时，不受场地负面效果的影响，且自身技能伤害 +20%。', fieldSafe: WEATHER, inField: [{ fields: WEATHER, dmg: 20 }] },
  { id: 'cloud_nine_p', name: '无关天气+', desc: '自身处于阴云毒雾、局部阵雨、上升气流与寒霜区域场地时，不受场地负面效果的影响，且自身技能伤害 +30%。', fieldSafe: WEATHER, inField: [{ fields: WEATHER, dmg: 30 }] },
  { id: 'anger_point', name: '愤怒穴位', desc: '自身遭受对手的技能暴击时，除 HP 外全能力 +100%，持续 2 秒；效果结束后，自身移动速度 -50%，持续 2 秒。', angerPoint: 2 },
  { id: 'anger_point_p', name: '愤怒穴位+', desc: '自身遭受对手的技能暴击时，除 HP 外全能力 +100%，持续 4 秒；效果结束后，自身移动速度 -50%，持续 2 秒。', angerPoint: 4 },
  { id: 'justified', name: '正义之心', desc: '火系技能伤害 +20%；对战中若己方在场的宝可梦比对手少，自身物防特防 +50%。', typeDmg: { fire: 20 }, outnumbered: 50 },
  { id: 'justified_p', name: '正义之心+', desc: '火系技能伤害 +30%；对战中若己方在场的宝可梦比对手少，自身物防特防 +70%。', typeDmg: { fire: 30 }, outnumbered: 70 },

  // ---------- 水 ----------
  { id: 'swift_swim', name: '悠游自如', desc: '水系技能伤害 +10%；自身处于局部阵雨场地时，移动速度 +50%。', typeDmg: { water: 10 }, inField: [{ fields: ['rain'], move: 50 }] },
  { id: 'swift_swim_p', name: '悠游自如+', desc: '水系技能伤害 +20%；自身处于局部阵雨场地时，移动速度 +60%。', typeDmg: { water: 20 }, inField: [{ fields: ['rain'], move: 60 }] },
  { id: 'swift_swim_pp', name: '悠游自如++', desc: '水系技能伤害 +30%；自身处于局部阵雨场地时，移动速度 +70%。', typeDmg: { water: 30 }, inField: [{ fields: ['rain'], move: 70 }] },
  { id: 'clear_body', name: '恒净之躯', desc: '不受任何技能附加效果与对手特性的影响。', clearBody: true },
  { id: 'clear_body_p', name: '恒净之躯+', desc: '不受任何技能附加效果与对手特性的影响；自身闪避 +10%。', clearBody: true, mods: { dodge: 10 } },
  { id: 'thick_fat', name: '厚脂肪', desc: '遭受火系、水系、冰系与格斗系技能攻击时，受到的伤害变为应有伤害的 70%。', resist: { types: FAT, mult: 0.7 } },
  { id: 'thick_fat_p', name: '厚脂肪+', desc: '遭受火系、水系、冰系与格斗系技能攻击时，受到的伤害变为应有伤害的 50%。', resist: { types: FAT, mult: 0.5 } },
  { id: 'thick_fat_pp', name: '厚脂肪++', desc: '遭受火系、水系、冰系与格斗系技能攻击时，受到的伤害变为应有伤害的 25%。', resist: { types: FAT, mult: 0.25 } },
  { id: 'shell_armor', name: '硬壳盔甲', desc: '自身物防特防 +30%。', mods: { defPct: 30, spdPct: 30 } },
  { id: 'skill_link', name: '连续攻击', desc: '多发弹体的技能多发射 5 发。', skillLink: 5 },
  { id: 'water_veil', name: '水幕', desc: '自身处于局部阵雨场地时，有 40% 几率闪避对手的任何技能，且每秒回复最大 HP 的 5%。', inField: [{ fields: ['rain'], dodge: 40, regen: 0.05 }] },
  { id: 'water_veil_p', name: '水幕+', desc: '自身处于局部阵雨场地时，有 50% 几率闪避对手的任何技能，且每秒回复最大 HP 的 10%。', inField: [{ fields: ['rain'], dodge: 50, regen: 0.1 }] },
  { id: 'illuminate', name: '发光', desc: '自身有 30% 几率闪避对手的任何技能；野生 / AI 操作的宝可梦会把自身当作首要目标优先攻击（对战与联机冒险时有效）。', mods: { dodge: 30 }, aggro: true },
  { id: 'hydration', name: '湿润之躯', desc: '自身不会陷入任何异常状态；自身处于局部阵雨场地时，每秒回复最大 HP 的 5%。', noStatus: 'all', inField: [{ fields: ['rain'], regen: 0.05 }] },

  // ---------- 超能力 ----------
  { id: 'magic_guard', name: '魔法防守', desc: '20% 几率闪避对手的任何技能；自身不会陷入任何异常状态。', mods: { dodge: 20 }, noStatus: 'all' },
  { id: 'magic_guard_p', name: '魔法防守+', desc: '自身不会陷入任何异常状态；自身处于任何场地时，不受场地的负面影响。', noStatus: 'all', fieldSafe: 'all' },
  { id: 'magic_guard_pp', name: '魔法防守++', desc: '自身不会陷入任何异常状态，对手的技能企图让自身陷入异常状态时，异常状态会反弹给对手；自身处于任何场地时，不受场地的负面影响。', noStatus: 'all', reflectStatus: true, fieldSafe: 'all' },
  { id: 'oblivious', name: '迟钝', desc: '技能冷却时间 +200%；任何技能造成的伤害 +200%，且技能范围 +50%。', cd: 3, dmg: 200, mods: { range: 50 } },
  { id: 'oblivious_p', name: '迟钝+', desc: '技能冷却时间 +250%；任何技能造成的伤害 +200%，且技能范围 +80%。', cd: 3.5, dmg: 200, mods: { range: 80 } },
  { id: 'insomnia', name: '不眠', desc: '不会陷入睡眠状态；自身处于共鸣晶石场地时，物防特防 +50%。', noStatus: 'sleep', inField: [{ fields: ['crystal'], def: 50 }] },
  { id: 'forewarn', name: '预知梦', desc: '不会陷入睡眠状态；有 20% 几率闪避对手的任何技能。', noStatus: 'sleep', mods: { dodge: 20 } },
  { id: 'filter', name: '过滤', desc: '对手的一般系、超能力系、格斗系、幽灵系、妖精系技能无法对自身造成伤害。', immune: FILTER },
  { id: 'filter_p', name: '过滤+', desc: '对手的一般系、超能力系、格斗系、幽灵系、妖精系技能无法对自身造成伤害；受到这些属性的技能攻击时，把应受伤害的 20% 反弹给对手。', immune: FILTER, reflect: { types: FILTER, pct: 0.2 } },
  { id: 'dry_skin', name: '干燥皮肤', desc: '对手的水系技能无法对自身造成伤害，受到水系技能攻击时，把应受的伤害变为 HP 回复自身。', absorb: ['water'] },
  { id: 'synchronize', name: '同步', desc: '不会陷入异常状态；不受任何场地负面效果影响；以自身为圆心的范围内（约 3×3 格，淡紫色圈为视觉提示）的所有对手宝可梦，特性会被暂时消去，直至离开范围。', noStatus: 'all', fieldSafe: 'all', suppress: { cells: 3 } },

  // ---------- 格斗 ----------
  { id: 'no_guard', name: '无防守', desc: '自身技能冷却时间 -70%，技能范围 +10%，但自身物防特防 -10%。', cd: 0.3, mods: { range: 10, defPct: -10, spdPct: -10 } },
  { id: 'no_guard_p', name: '无防守+', desc: '自身技能冷却时间 -80%，技能范围 +20%，但自身物防特防 -20%。', cd: 0.2, mods: { range: 20, defPct: -20, spdPct: -20 } },
  { id: 'no_guard_pp', name: '无防守++', desc: '自身技能冷却时间 -90%，技能范围 +30%，但自身物防特防 -30%。', cd: 0.1, mods: { range: 30, defPct: -30, spdPct: -30 } },
  { id: 'inner_focus', name: '精神力', desc: '陷入异常状态或自身处在不利的场地时，自身技能伤害 +100%，移动速度 +20%。', afflicted: { dmg: 100, move: 20 } },
  { id: 'inner_focus_p', name: '精神力+', desc: '陷入异常状态或自身处在不利的场地时，自身技能伤害 +100%，移动速度 +30%。', afflicted: { dmg: 100, move: 30 } },
  { id: 'limber', name: '柔软', desc: '遭受物理攻击时受到的伤害 -30%；不会陷入麻痹状态。', physTaken: 0.7, noStatus: 'para' },
  { id: 'reckless', name: '舍身', desc: '使用舍身冲撞、近身战、地球上投或飞膝踢时，技能伤害 +80%，但每次使用额外扣除自身 2% 的最大 HP。', moves: { ids: RECKLESS, dmg: 80, cost: 0.02 } },
  { id: 'reckless_p', name: '舍身+', desc: '使用舍身冲撞、近身战、地球上投或飞膝踢时，技能伤害 +100%，但每次使用额外扣除自身 3% 的最大 HP。', moves: { ids: RECKLESS, dmg: 100, cost: 0.03 } },
  { id: 'iron_fist', name: '铁拳', desc: '使用劈瓦、近身战、空手劈、十字劈、彗星拳、子弹拳、火焰拳、雷电拳、冰冻拳时，技能伤害 +40%，且冷却时间 -20%。', moves: { ids: PUNCHES, dmg: 40, cd: 0.8 } },
  { id: 'iron_fist_p', name: '铁拳+', desc: '使用劈瓦、近身战、空手劈、十字劈、彗星拳、子弹拳、火焰拳、雷电拳、冰冻拳时，技能伤害 +50%，且冷却时间 -30%。', moves: { ids: PUNCHES, dmg: 50, cd: 0.7 } },
  { id: 'vital_spirit', name: '干劲', desc: 'HP 高于 1/2 时，自身使用的全部技能伤害 +30%，且移动速度 +20%。', highHp: { dmg: 30, move: 20 } },
  { id: 'vital_spirit_p', name: '干劲+', desc: 'HP 高于 1/2 时，自身使用的全部技能伤害 +40%，且移动速度 +20%。', highHp: { dmg: 40, move: 20 } },

  // ---------- 岩石、钢 ----------
  { id: 'sturdy', name: '结实', desc: '每波一次（对战中一场一次），受到致命伤害时保留 1 点 HP。', sturdy: { armor: 0 } },
  { id: 'sturdy_p', name: '结实+', desc: '每波一次（对战中一场一次），受到致命伤害时保留 1 点 HP，且霸体 2 秒，不受对手的任何攻击伤害与负面影响。', sturdy: { armor: 2 } },
  { id: 'sturdy_pp', name: '结实++', desc: '每波一次（对战中一场一次），受到致命伤害时保留 1 点 HP，且霸体 3 秒，不受对手的任何攻击伤害与负面影响。', sturdy: { armor: 3 } },
  { id: 'weak_armor', name: '碎裂铠甲', desc: 'HP 低于 1/2 时，自身使用岩石系技能伤害 +20%，且移动速度 +30%。', lowHp: { type: 'rock', dmg: 20, move: 30 } },
  { id: 'weak_armor_p', name: '碎裂铠甲+', desc: `HP 低于 1/2 时，自身使用岩石系技能伤害 +20%，且移动速度 +30%；${SPLASH}开阔空地场地。`, lowHp: { type: 'rock', dmg: 20, move: 30, field: 'clearing' } },
  { id: 'rock_head', name: '坚硬脑袋', desc: '不受技能的反作用伤害，物防特防 +30%。', rockHead: true, mods: { defPct: 30, spdPct: 30 } },
  { id: 'rock_head_p', name: '坚硬脑袋+', desc: '不受技能的反作用伤害，物防特防 +50%。', rockHead: true, mods: { defPct: 50, spdPct: 50 } },
  { id: 'magnet_pull', name: '磁力', desc: '以自身为圆心的范围内（约 2×2 格，淡黄色圈为视觉提示）的所有电系宝可梦（包括自身、队友与对手），技能冷却时间 -30%；携带道具磁铁时，自身电系或钢系技能伤害再 +20%。', magnet: { cells: 2, cd: 0.7, item: 20 } },
  { id: 'magnet_pull_p', name: '磁力+', desc: '以自身为圆心的范围内（约 3×3 格，淡黄色圈为视觉提示）的所有电系宝可梦（包括自身、队友与对手），技能冷却时间 -60%；携带道具磁铁时，自身电系或钢系技能伤害再 +30%。', magnet: { cells: 3, cd: 0.4, item: 30 } },
  { id: 'hyper_cutter', name: '怪力钳', desc: '使用高级或究极的技能时，技能必定暴击。', tierCrit: [3, 4] },
  { id: 'mold_breaker', name: '破格', desc: '使用高级或究极的技能时，技能必定暴击；自身使用技能造成伤害时，无视对手的技能、场地、特性、道具带来的物防特防加成。', tierCrit: [3, 4], moldBreaker: true },

  // ---------- 火 ----------
  { id: 'flame_body', name: '火焰之躯', desc: '火系技能伤害 +20%；自身处于熔岩池场地时，每秒回复最大 HP 的 10%。', typeDmg: { fire: 20 }, inField: [{ fields: ['lava'], regen: 0.1 }] },
  {
    id: 'flame_body_p', name: '火焰之躯+', desc: '火系技能伤害 +30%；自身处于熔岩池场地时，每秒回复最大 HP 的 10%；遭受物理攻击时，50% 几率令对手烧伤（物理攻击伤害 -50%），持续 3 秒。',
    typeDmg: { fire: 30 }, inField: [{ fields: ['lava'], regen: 0.1 }], onHurt: [{ cat: 'phys', chance: 0.5, fx: 'burn' }],
  },

  // ---------- 毒、幽灵 ----------
  { id: 'stench', name: '恶臭', desc: '离自身很近（约 0.5 格）的对手无法对自身使用技能。', stench: 0.5 },
  { id: 'stench_p', name: '恶臭+', desc: '离自身很近（约 1 格）的对手无法对自身使用技能。', stench: 1 },
  { id: 'levitate', name: '飘浮', desc: '20% 几率闪避对手的物理技能；对手的地面系技能对自身无效。', physDodge: 20, immune: ['ground'] },
  { id: 'cursed_body', name: '诅咒之躯', desc: '20% 几率闪避对手的物理技能；自身遭到任何技能攻击时，40% 几率令对手全部技能的冷却时间 +200%（持续 3 秒）。', physDodge: 20, onHurt: [{ chance: 0.4, fx: 'curse' }] },
  { id: 'neutralizing_gas', name: '化学变化气体', desc: '自身处于任何场地时，不受场地的负面影响；不受任何技能附加效果与对手特性的影响。', fieldSafe: 'all', clearBody: true },
  { id: 'aftermath', name: '引爆', desc: '自身遭受火系技能攻击时，把承受伤害的 20% 反弹给对手。', reflect: { types: ['fire'], pct: 0.2 } },
  {
    id: 'aftermath_p', name: '引爆+', desc: '自身遭受火系技能攻击时，把承受伤害的 20% 反弹给对手；每波一次（对战中一场一次），自身被击倒时以自身为圆心（约 3×3 格）释放爆炸，被波及的全部宝可梦（队友与对手）立刻损失 40% 的 HP。',
    reflect: { types: ['fire'], pct: 0.2 }, aftermath: { cells: 3, pct: 0.4 },
  },

  // ---------- 一般 ----------
  { id: 'battle_armor', name: '战斗盔甲', desc: '进入冒险模式时，背包自动放入商店道具粗骨头 ×1，且每次刷新商店有 10% 几率刷出粗骨头；每携带一根粗骨头，自身物攻 +20%，最多叠加 5 次。', club: { atk: 20, max: 5, shop: 0.1 } },
  { id: 'natural_cure', name: '自然回复', desc: '不会陷入异常状态；每秒回复自身 5% 的最大 HP。', noStatus: 'all', regen: 0.05 },
  { id: 'healer', name: '治愈之心', desc: '以自身为圆心的范围内（约 2×2 格，淡粉色圈为视觉提示）包括自身在内的所有队友宝可梦，每秒回复最大 HP 的 5%。', healer: { cells: 2, regen: 0.05 } },
  { id: 'healer_p', name: '治愈之心+', desc: '以自身为圆心的范围内（约 3×3 格，淡粉色圈为视觉提示）包括自身在内的所有队友宝可梦，每秒回复最大 HP 的 5%；范围里的队友受到技能伤害时，自身替队友分担 20% 的伤害。', healer: { cells: 3, regen: 0.05, share: 0.2 } },
  { id: 'scrappy', name: '胆量', desc: '陷入异常状态或自身处在不利的场地时，自身物防特防 +40%，移动速度 -10%；使用一般系技能对幽灵系对手造成的伤害 +150%，且无视对手的闪避。', afflicted: { def: 40, move: -10 }, scrappy: 150 },
  { id: 'scrappy_p', name: '胆量+', desc: '陷入异常状态或自身处在不利的场地时，自身物防特防 +50%，移动速度 -10%；使用一般系技能对幽灵系对手造成的伤害 +200%，且无视对手的闪避。', afflicted: { def: 50, move: -10 }, scrappy: 200 },
  { id: 'imposter', name: '变身者', desc: IMPOSTER, powders: { pct: 20, max: 5, shop: 0.1 } },
  { id: 'adaptability', name: '适应力', desc: '自身处于任何场地时，不受场地的负面影响，且无论招式是什么属性都享有场地的正面加成（例如在熔岩池里使用一般系招式也伤害 +25%，在繁茂草丛里即使不是草 / 虫属性也有命中回复）。', fieldSafe: 'all', adapt: true },
  { id: 'trace', name: '复制', desc: '复制离自身最近的对手的特性效果。', copy: 1 },
  { id: 'download', name: '下载', desc: '自身移动速度 +10%；同时复制离自身最近的 2 个对手的特性效果。', move: 10, copy: 2 },
  { id: 'download_p', name: '下载+', desc: '自身移动速度 +20%；同时复制离自身最近的 3 个对手的特性效果。', move: 20, copy: 3 },
  { id: 'multiscale', name: '多重鳞片', desc: 'HP 高于 1/2 时，自身物防特防 +50%，但移动速度 -10%。', highHp: { def: 50, move: -10 } },

  // ---------- 伊布 ----------
  { id: 'water_absorb', name: '储水', desc: '对手的水系技能无法对自身造成伤害，受到水系技能攻击时，把应受的伤害变为 HP 回复自身；自身处于局部阵雨场地时，每秒回复最大 HP 的 10%。', absorb: ['water'], inField: [{ fields: ['rain'], regen: 0.1 }] },
  { id: 'volt_absorb', name: '蓄电', desc: '对手的电系技能无法对自身造成伤害，受到电系技能攻击时，把应受的伤害变为 HP 回复自身；自身处于局部阵雨场地时，技能范围 +50%。', absorb: ['electric'], inField: [{ fields: ['rain'], range: 50 }] },
  { id: 'flash_fire_p', name: '引火+', desc: '对手的火系技能无法对自身造成伤害，受到火系技能攻击时，把应受的伤害变为 HP 回复自身；自身处于熔岩池场地时，火系技能伤害 +50%。', absorb: ['fire'], inField: [{ fields: ['lava'], typeDmg: { fire: 50 } }] },

  // ---------- 传说 ----------
  { id: 'pressure', name: '压迫感', desc: PRESS(3), pressure: { cells: 3, cd: 2, slow: 0.5 } },
  { id: 'pressure_p', name: '压迫感+', desc: PRESS(4), pressure: { cells: 4, cd: 2, slow: 0.5 } },
  { id: 'snow_cloak_x', name: '雪隐++++', desc: BIRD('寒霜区域', '冰'), selfField: { kind: 'frost', every: 5, life: 3, cells: 4, immune: 'ice' } },
  { id: 'static_x', name: '静电++++', desc: BIRD('局部阵雨', '电'), selfField: { kind: 'rain', every: 5, life: 3, cells: 4, immune: 'electric' } },
  { id: 'flame_body_x', name: '火焰之躯++++', desc: BIRD('熔岩池', '火'), selfField: { kind: 'lava', every: 5, life: 3, cells: 4, immune: 'fire' } },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ABILITY_IDS = LIST.map((a) => a.id);

export function abilitiesOf(ids: readonly string[]): AbilityDef[] {
  return ids.map((id) => ABILITIES[id]).filter(Boolean);
}

// ---------------------------------------------------------------- 场地

/** 带着这些特性的宝可梦在场地 f 里不受负面效果影响 */
export function fieldSafe(ab: readonly AbilityDef[], f: FieldId | null): boolean {
  if (!f) return false;
  return ab.some((a) => a.fieldSafe === 'all' || (Array.isArray(a.fieldSafe) && a.fieldSafe.includes(f)));
}

/** 站在场地 f 里生效的 inField 效果 */
export function inFieldFx(ab: readonly AbilityDef[], f: FieldId | null): InFieldFx[] {
  if (!f) return [];
  const out: InFieldFx[] = [];
  for (const a of ab) for (const x of a.inField ?? []) if (!x.fields || x.fields.includes(f)) out.push(x);
  return out;
}

/** 每种场地的正面招式修正（适应力：任何属性的招式都享有） */
const POSITIVE = {} as Record<FieldId, MoveMod>;
for (const id of FIELD_IDS) {
  const m = { ...NO_MOVE_MOD };
  for (const r of FIELDS[id].moves) {
    if (r.dmg && r.dmg > 1) m.dmg *= r.dmg;
    if (r.cd && r.cd < 1) m.cd *= r.cd;
    if (r.area && r.area > 1) m.size *= Math.sqrt(r.area);
    if (r.crit && r.crit > 0) m.crit += r.crit;
    if (r.drain) m.drain += r.drain;
    if (r.chill) m.chill = true;
  }
  POSITIVE[id] = m;
}

/** 带着这些特性、在场地 f 里放出 type 属性的招式受到的修正（含免疫负面效果、适应力和场地里的特性加成） */
export function abMoveMod(f: FieldId | null, type: PType, ab: readonly AbilityDef[]): MoveMod {
  if (!f) return { ...NO_MOVE_MOD };
  const m = ab.some((a) => a.adapt) ? { ...POSITIVE[f] } : { ...moveMod(f, type) };
  if (fieldSafe(ab, f)) { m.dmg = Math.max(1, m.dmg); m.cd = Math.min(1, m.cd); }
  let dmg = 0, range = 0;
  for (const x of inFieldFx(ab, f)) {
    dmg += (x.dmg ?? 0) + (x.typeDmg?.[type] ?? 0);
    range += x.range ?? 0;
  }
  m.dmg *= 1 + dmg / 100;
  m.range *= 1 + range / 100;
  return m;
}

/** 站在场地里的移动速度倍率（属性带来的减速、免疫负面效果、场地里的特性加速） */
export function abFieldSpeed(f: FieldId | null, types: readonly PType[], ab: readonly AbilityDef[]): number {
  if (!f) return 1;
  let v = fieldSpeed(f, types);
  if (v < 1 && fieldSafe(ab, f)) v = 1;
  let move = 0;
  for (const x of inFieldFx(ab, f)) move += x.move ?? 0;
  return v * (1 + move / 100);
}

/** 站在场地里会不会被灼伤（免疫场地负面效果、不会陷入异常状态的都不会） */
export function abFieldBurns(f: FieldId | null, types: readonly PType[], ab: readonly AbilityDef[]): boolean {
  return fieldBurns(f, types) && !fieldSafe(ab, f) && !ab.some((a) => a.noStatus === 'all');
}

/**
 * 场地对这只宝可梦（属性、招式、特性）是好是坏：HUD 上的「对你有利 / 不利」、AI 走位、「处在不利的场地」都用它。
 * score > 0 有利，< 0 不利。
 */
export function abFieldVerdict(f: FieldId, types: readonly PType[], moves: readonly { type: PType; damaging: boolean; phys: boolean }[], ab: readonly AbilityDef[]): { verdict: FieldVerdict; score: number } {
  let pro = 0, con = 0;
  const add = (v: number) => { if (v > 0) pro += v; else con -= v; };
  const burn = abFieldBurns(f, types, ab);
  for (const mv of moves) {
    const m = abMoveMod(f, mv.type, ab);
    add((1 / m.cd - 1) * 3);
    if (!mv.damaging) continue;
    add((m.dmg - 1) * 4);
    add((m.size * m.size - 1) * 0.8);
    add((m.range - 1) * 1.5);
    add(m.crit / 15);
    if (m.drain) add(0.8);
    if (m.chill) add(0.6);
    if (burn && mv.phys) add(-1);
  }
  if (burn) add(-3);
  add((abFieldSpeed(f, types, ab) - 1) * 6);
  for (const x of inFieldFx(ab, f)) {
    if (x.dodge) add(x.dodge / 10);
    if (x.regen) add(x.regen * 40);
    if (x.def) add(x.def / 20);
  }
  for (const a of ab) if (a.selfField?.kind === f) add(2);
  const verdict: FieldVerdict = pro < 0.05 && con < 0.05 ? 'none' : con < 0.05 || pro > con * 2.5 ? 'good' : pro < 0.05 || con > pro * 2.5 ? 'bad' : 'mixed';
  return { verdict, score: pro - con };
}

/** 生成在 (x, y) 周围、边长 n 格的正方形场地占的格子（地图外的不算） */
export function squareCells(cols: number, rows: number, x: number, y: number, n: number): number[] {
  const gx0 = Math.floor(x / FIELD_CELL - n / 2 + 0.5), gy0 = Math.floor(y / FIELD_CELL - n / 2 + 0.5);
  const out: number[] = [];
  for (let gy = gy0; gy < gy0 + n; gy++) {
    for (let gx = gx0; gx < gx0 + n; gx++) if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) out.push(gy * cols + gx);
  }
  return out;
}
