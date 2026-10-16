import { SHINY_STAT } from './shiny';
import type { PType } from './types';

/** 宝可梦式六维（种族值）。 */
export interface BaseStats { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }

/**
 * 所有可叠加的属性加成。六维是对种族值的平加；其余为土豆兄弟式的副属性。
 * 百分比属性均以"点"为单位（10 = 10%）。
 */
export interface Mods {
  maxHp: number;     // 最大生命（平加）
  atk: number; def: number; spa: number; spd: number; spe: number;
  atkPct: number; spaPct: number; defPct: number; spdPct: number; spePct: number;
  haste: number;     // 技能急速 %（冷却缩短）
  crit: number;      // 暴击率 %
  range: number;     // 技能范围 %
  dodge: number;     // 闪避 %
  regen: number;     // 生命回复（每 10 点 ≈ 每秒 1 HP）
  lifesteal: number; // 吸血 %：命中时有该几率回复 1 HP
  pickup: number;    // 拾取范围 %
  luck: number;      // 幸运
  harvest: number;   // 收获：每波结束直接获得的金钱
  xp: number;        // 经验获取 %
  money: number;     // 金钱获取 %
  dmg: number;       // 全伤害 %
  dmgMinion: number; // 对小怪伤害 %
  dmgBoss: number;   // 对精英/首领伤害 %
  thorns: number;    // 被接触时反伤（平加）
  superEff: number;  // 效果拔群时额外伤害 %
  discount: number;  // 商店折扣 %
  slots: number;     // 技能栏增减
  stun: number;      // 命中时畏缩（短暂定身）几率 %
  rerolls: number;   // 每波免费刷新次数
  enemies: number;   // 敌人数量 %（香水增加、喷雾减少；联机时全队叠加）
  recruit: number;   // 崇拜几率 %：击败野生宝可梦时它想成为你的伙伴的几率
  shiny: number;     // 闪光几率 %：野生宝可梦是闪光宝可梦的几率（联机时按全队最高的算）
}

export type ModKey = keyof Mods;
export type TypeMods = Partial<Record<PType, number>>;

export function emptyMods(): Mods {
  return {
    maxHp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
    atkPct: 0, spaPct: 0, defPct: 0, spdPct: 0, spePct: 0,
    haste: 0, crit: 0, range: 0, dodge: 0, regen: 0, lifesteal: 0, pickup: 0, luck: 0,
    harvest: 0, xp: 0, money: 0, dmg: 0, dmgMinion: 0, dmgBoss: 0, thorns: 0, superEff: 0,
    discount: 0, slots: 0, stun: 0, rerolls: 0, enemies: 0, recruit: 0, shiny: 0,
  };
}

export function addMods(into: Mods, add: Partial<Mods>, times = 1): Mods {
  for (const k in add) {
    const key = k as ModKey;
    into[key] += (add[key] ?? 0) * times;
  }
  return into;
}

export function addTypeMods(into: TypeMods, add: TypeMods | undefined, times = 1): TypeMods {
  if (!add) return into;
  for (const k in add) {
    const t = k as PType;
    into[t] = (into[t] ?? 0) + (add[t] ?? 0) * times;
  }
  return into;
}

/** 由种族值 + 加成算出的最终数值，模拟层直接使用。 */
export interface Derived {
  maxHp: number;
  atk: number; def: number; spa: number; spd: number; spe: number;
  physMult: number; specMult: number;
  physTaken: number; specTaken: number;
  moveSpeed: number;
  cdMult: number;
  crit: number;
  rangeMult: number;
  dodge: number;
  regenPerSec: number;
  lifesteal: number;
  pickupRadius: number;
  luck: number;
  harvest: number;
  xpMult: number;
  moneyMult: number;
  dmgMult: number;
  minionMult: number;
  bossMult: number;
  thorns: number;
  superEffMult: number;
  discount: number;
  stun: number;
  rerolls: number;
  enemies: number;
  recruitMult: number;
  /** 闪光几率加成 % */
  shiny: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const MOVE_SPEED_MAX = 220;

/** shiny：闪光宝可梦，六项能力各 +1% */
export function derive(base: BaseStats, m: Mods, shiny = false): Derived {
  const k = shiny ? SHINY_STAT : 1;
  const pct = (v: number, p: number) => Math.max(1, v * (1 + p / 100) * k);
  const atk = pct(base.atk + m.atk, m.atkPct);
  const spa = pct(base.spa + m.spa, m.spaPct);
  const def = pct(base.def + m.def, m.defPct);
  const spd = pct(base.spd + m.spd, m.spdPct);
  const spe = pct(base.spe + m.spe, m.spePct);
  return {
    maxHp: Math.max(1, Math.round((base.hp * 0.6 + 10 + m.maxHp) * k)),
    atk, def, spa, spd, spe,
    physMult: atk / 50,
    specMult: spa / 50,
    physTaken: 100 / (50 + def),
    specTaken: 100 / (50 + spd),
    moveSpeed: clamp(80 + spe * 0.5, 50, MOVE_SPEED_MAX),
    cdMult: m.haste >= 0 ? Math.max(0.5, 1 / (1 + m.haste / 100)) : 1 + -m.haste / 100,
    crit: clamp(0.05 + m.crit / 100, 0, 1),
    rangeMult: clamp(1 + m.range / 100, 0.5, 3),
    dodge: clamp(m.dodge / 100, 0, 0.6),
    regenPerSec: Math.max(0, m.regen) / 10,
    lifesteal: clamp(m.lifesteal / 100, 0, 1),
    pickupRadius: 42 * clamp(1 + m.pickup / 100, 0.5, 5),
    luck: m.luck,
    harvest: Math.max(0, m.harvest),
    xpMult: Math.max(0, 1 + m.xp / 100),
    moneyMult: Math.max(0, 1 + m.money / 100),
    dmgMult: Math.max(0.1, 1 + m.dmg / 100),
    minionMult: Math.max(0.1, 1 + m.dmgMinion / 100),
    bossMult: Math.max(0.1, 1 + m.dmgBoss / 100),
    thorns: Math.max(0, m.thorns),
    superEffMult: 1 + m.superEff / 100,
    discount: clamp(m.discount / 100, 0, 0.6),
    stun: clamp(m.stun / 100, 0, 0.5),
    rerolls: Math.max(0, m.rerolls),
    enemies: m.enemies,
    recruitMult: Math.max(0, 1 + m.recruit / 100),
    shiny: Math.max(0, m.shiny),
  };
}

/** UI 用：属性名称与展示格式。 */
export const MOD_LABEL: Record<ModKey, string> = {
  maxHp: '最大HP', atk: '物攻', def: '物防', spa: '特攻', spd: '特防', spe: '速度',
  atkPct: '物攻', spaPct: '特攻', defPct: '物防', spdPct: '特防', spePct: '速度',
  haste: '技能急速', crit: '暴击率', range: '技能范围', dodge: '闪避', regen: '生命回复',
  lifesteal: '吸血', pickup: '拾取范围', luck: '幸运', harvest: '收获', xp: '经验获取',
  money: '金钱获取', dmg: '全伤害', dmgMinion: '对小怪伤害', dmgBoss: '对精英/首领伤害',
  thorns: '反伤', superEff: '效果拔群伤害', discount: '商店折扣', slots: '技能栏', stun: '畏缩几率',
  rerolls: '免费刷新', enemies: '敌人数量', recruit: '崇拜几率', shiny: '闪光几率',
};

const PCT_KEYS = new Set<ModKey>([
  'atkPct', 'spaPct', 'defPct', 'spdPct', 'spePct', 'haste', 'crit', 'range', 'dodge', 'lifesteal',
  'pickup', 'xp', 'money', 'dmg', 'dmgMinion', 'dmgBoss', 'superEff', 'discount', 'stun', 'enemies', 'recruit', 'shiny',
]);

export function fmtMod(k: ModKey, v: number): string {
  const sign = v > 0 ? '+' : '';
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${MOD_LABEL[k]} ${sign}${n}${PCT_KEYS.has(k) ? '%' : ''}`;
}

/** 飘字用的整数。20.00000000001 这种浮点误差显示成 20 */
export function shownAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n);
  if (r === 0 && n > 0) return '1';
  if (r === 0 && n < 0) return '-1';
  return String(r);
}
