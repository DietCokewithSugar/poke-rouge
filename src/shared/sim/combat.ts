import { abFieldBurns, abMoveMod, type AbilityDef, type Retaliate } from '../abilities';
import { BURN_PHYS, FIELD_CELL, FROST_SLOW, FROST_SLOW_DUR, GRASS_DRAIN_CAP, NO_MOVE_MOD, type FieldId, type MoveMod } from '../fields';
import { ITEMS } from '../items';
import { formOf } from '../pokemon';
import { SKILLS, skillLevelCd, skillLevelDmg, type SkillDef } from '../skills';
import { EFF_SUPER, TYPES, gameEffectiveness, type PType } from '../types';
import { abilityCd, abilityCrit, abilityDef, abilityDmgPct, abilityDodge, blocksStatus, findAb } from './abilityfx';
import type { Enemy, HitFx, SimPlayer, StatusApply } from './entities';
import type { GameSim } from './game';

export const PLAYER_R = 7;
/** 技能冷却的下限（秒）：无防守这类大幅缩短冷却的特性叠上道具时，每个技能每秒最多放 10 次，不会每帧都出招 */
export const MIN_CD = 0.1;

const TAU = Math.PI * 2;
function angDiff(a: number, b: number) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/** 技能对所有敌人通用的伤害部分（不含克制、首领加成、暴击和脚下的场地）。 */
export function baseDamage(p: SimPlayer, s: SkillDef, lv: number): number {
  const form = formOf(p.line, p.stage);
  const stat = s.cat === 'phys' ? p.d.physMult : p.d.specMult;
  const stab = form.types.includes(s.type) ? 1.5 : 1;
  const typeBonus = 1 + (p.typeMods[s.type] ?? 0) / 100;
  let dmg = s.power * skillLevelDmg(lv) * stat * stab * typeBonus * p.d.dmgMult * (1 + abilityDmgPct(p, s) / 100);
  if (s.speedScale) dmg *= 1 + Math.max(0, p.d.spe - 50) / 60;
  return dmg;
}

export interface HitOpts {
  crit?: number;
  status?: StatusApply;
  knock?: number;
  kx?: number;
  ky?: number;
  dot?: boolean;
  noEff?: boolean;
  heal?: number;
  skill?: SkillDef | null;
  /** 场地效果：命中回复造成伤害的这个比例、命中减速 */
  drain?: number;
  chill?: boolean;
  /** 已经算好的伤害（特性的反弹、引爆）：不算克制、暴击和加成，也不触发命中效果 */
  fixed?: boolean;
}

/** 攻击方的特性对属性相性的修正：避雷针+（阵雨里电系必定效果绝佳）、有色眼镜、胆量打幽灵系 */
export function abilityEff(p: SimPlayer, type: PType, target: readonly PType[], eff: number): { eff: number; mult: number } {
  let mult = 1;
  if (p.at.field === 'rain' && eff < EFF_SUPER && p.ab.some((a) => a.rainSE === type)) eff = EFF_SUPER;
  for (const a of p.ab) {
    if (a.eff) mult *= eff < 1 ? 1 + a.eff.weak / 100 : eff > 1 ? 1 + a.eff.strong / 100 : 1;
    if (a.scrappy && type === 'normal' && target.includes('ghost')) mult *= 1 + a.scrappy / 100;
  }
  return { eff, mult };
}

/** 这一下的暴击率（0~1）：能力、技能、场地，再加上特性（怪力钳、破格必定暴击） */
export function critChance(p: SimPlayer, o: HitOpts): number {
  return p.d.crit + ((o.crit ?? 0) + abilityCrit(p, o.skill)) / 100;
}

/** 对敌人造成伤害，返回实际伤害。 */
export function hitEnemy(sim: GameSim, e: Enemy, p: SimPlayer | null, raw: number, type: PType, o: HitOpts = {}): number {
  if (e.pvp) return sim.pvpHit(e, p, raw, type, o);
  if (e.hp <= 0) return 0;
  let dmg = raw;
  let flags = 0;
  if (!o.noEff && !o.fixed) {
    let eff = gameEffectiveness(type, e.def.types);
    if (p) { const r = abilityEff(p, type, e.def.types, eff); eff = r.eff; dmg *= r.mult; }
    dmg *= eff;
    if (eff > 1) {
      flags |= 2;
      if (p) { dmg *= p.d.superEffMult; p.stats.superEff++; }
    } else if (eff < 1) flags |= 4;
  }
  if (p && !o.fixed) {
    dmg *= e.def.rank === 'minion' ? p.d.minionMult : p.d.bossMult;
    if (!o.dot && sim.rng.chance(critChance(p, o))) { dmg *= 1.5; flags |= 1; p.stats.crits++; }
  }
  if (o.dot) flags |= 8;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  if (p) {
    e.lastHit = p.id;
    p.stats.damage += dmg;
    const key = o.dot ? '_dot' : o.skill?.id ?? '_other';
    p.stats.skillDmg[key] = (p.stats.skillDmg[key] ?? 0) + dmg;
    if (!o.dot && !o.fixed && p.d.lifesteal > 0 && sim.rng.chance(p.d.lifesteal)) healPlayer(sim, p, 1, true);
    if (!o.dot && !o.fixed && p.d.stun > 0 && sim.rng.chance(p.d.stun)) applyStatus(e, { kind: 'stun', chance: 1, dur: 0.5 }, dmg, p.id);
    if (o.skill?.payday && sim.rng.chance(0.12)) {
      const coin = Math.max(1, Math.round((1 + sim.wave * 0.15) * p.d.moneyMult));
      p.money += coin;
      p.stats.moneyEarned += coin;
      sim.dirty.add(p.id);
    }
  }
  sim.addHit(e, dmg, flags, TYPES.indexOf(type));
  if (o.drain && p) drainHeal(sim, p, dmg * o.drain);
  if (o.chill) applyStatus(e, { kind: 'slow', chance: 1, dur: FROST_SLOW_DUR, amount: FROST_SLOW }, dmg, p?.id ?? -1);
  if (o.status && sim.rng.chance(o.status.chance)) applyStatus(e, o.status, dmg, p?.id ?? -1, o.heal);
  if (p && !o.dot && !o.fixed) onHitAbility(sim, e, p, o, (flags & 1) !== 0);
  if (o.knock && e.def.knockResist !== 1) {
    const k = o.knock * (1 - (e.def.knockResist ?? 0));
    const len = Math.hypot(o.kx ?? 0, o.ky ?? 0) || 1;
    e.vx += ((o.kx ?? 0) / len) * k;
    e.vy += ((o.ky ?? 0) / len) * k;
  }
  if (e.hp <= 0) sim.killEnemy(e, p);
  return dmg;
}

/** 攻击方的特性在技能打中对手时的效果：狙击手的暴击减速、威吓、沙穴的定身、日照 */
export function onHitAbility(sim: GameSim, e: Enemy, p: SimPlayer, o: HitOpts, crit: boolean) {
  const s = o.skill;
  for (const a of p.ab) {
    if (a.critSlow && crit) inflict(sim, e, { kind: 'slow', chance: 1, dur: a.critSlow.dur, amount: a.critSlow.amount }, 0, p);
    if (a.physWeaken && s?.cat === 'phys') inflict(sim, e, { kind: 'weak', chance: 1, dur: a.physWeaken.dur, amount: 1 - a.physWeaken.mult }, 0, p);
    if (a.fieldRoot && p.at.field === a.fieldRoot.field && sim.rng.chance(a.fieldRoot.chance)) inflict(sim, e, { kind: 'root', chance: 1, dur: a.fieldRoot.dur }, 0, p);
    if (a.sunny && s?.id === a.sunny.skill) {
      inflict(sim, e, { kind: 'sun', chance: 1, dur: a.sunny.dur, amount: a.sunny.slow, stacks: Math.round(a.sunny.max / a.sunny.slow), dot: a.sunny.dot }, 0, p);
    }
  }
}

export function applyStatus(e: Enemy, s: StatusApply, dmg: number, src: number, heal = 0) {
  const st = e.st;
  const boss = e.def.rank !== 'minion';
  const dur = s.dur ?? 2;
  switch (s.kind) {
    case 'burn': st.burn = dur; st.burnDps = Math.max(st.burnDps * 0.6, dmg * 0.25); st.burnSrc = src; break;
    case 'poison': st.poison = dur; st.poisonDps = Math.max(st.poisonDps * 0.7, dmg * 0.22); st.poisonSrc = src; break;
    case 'leech': st.leech = dur; st.leechDps = Math.max(st.leechDps, dmg); st.leechSrc = src; st.leechHeal = heal; break;
    case 'para': st.para = Math.max(st.para, boss ? dur * 0.4 : dur); st.paraAmt = Math.max(st.paraAmt, s.amount ?? 0); break;
    case 'slow': st.slow = Math.max(st.slow, dur); st.slowAmt = Math.max(st.slowAmt, s.amount ?? 0.3); break;
    case 'freeze': st.freeze = Math.max(st.freeze, boss ? dur * 0.25 : dur); break;
    case 'stun': st.stun = Math.max(st.stun, boss ? dur * 0.25 : dur); break;
    case 'sleep': st.sleep = Math.max(st.sleep, boss ? dur * 0.25 : dur); break;
    case 'root': st.root = Math.max(st.root, boss ? dur * 0.4 : dur); break;
    case 'toxic':
      // 正在中毒时不会重新开始计算
      if (st.toxic <= 0) { st.toxic = dur; st.toxicN = 0; st.toxicT = 0; st.toxicSrc = src; }
      break;
    case 'weak': st.weak = Math.max(st.weak, dur); st.weakAmt = s.amount ?? 0.5; break;
    case 'burnPhys': st.burnPhys = Math.max(st.burnPhys, dur); break;
    case 'cdUp': st.cdUp = Math.max(st.cdUp, dur); break;
    case 'sun':
      if (st.sun <= 0) st.sunN = 0;
      st.sun = dur;
      st.sunN = Math.min(s.stacks ?? 3, st.sunN + 1);
      st.sunSlow = s.amount ?? 0.3;
      st.sunDot = s.dot ?? 0.1;
      st.sunSrc = src;
      break;
  }
}

/**
 * 让目标陷入状态。对战里目标是玩家的替身时，先看那位玩家的特性挡不挡得住；
 * 魔法防守++ 挡下后把状态反弹给出手的一方。返回是否生效。
 */
export function inflict(sim: GameSim, e: Enemy, s: StatusApply, dmg: number, by: SimPlayer | null, heal = 0): boolean {
  const t = e.pvp;
  if (t) {
    if (!t.alive || t.down) return false;
    if (blocksStatus(t, s.kind)) {
      if (by && t.at.armor <= 0 && t.ab.some((a) => a.reflectStatus)) {
        const back = sim.playerProxy(by.id);
        if (back && back !== e) inflict(sim, back, s, dmg, null, heal);
      }
      return false;
    }
  }
  applyStatus(e, s, dmg, by?.id ?? -1, heal);
  return true;
}

/** 繁茂草丛的命中回复：每秒最多回复最大 HP 的 2% */
export function drainHeal(sim: GameSim, p: SimPlayer, amount: number) {
  if (sim.time - p.drainAt >= 1) { p.drainAt = sim.time; p.drained = 0; }
  const amt = Math.min(amount, p.d.maxHp * GRASS_DRAIN_CAP - p.drained);
  if (amt <= 0) return;
  p.drained += amt;
  healPlayer(sim, p, amt);
}

/** 野生宝可梦在繁茂草丛里的命中回复，规则和玩家一样 */
function enemyDrain(sim: GameSim, e: Enemy, amount: number) {
  if (e.dead || e.hp <= 0) return;
  if (sim.time - (e.drainAt ?? -9) >= 1) { e.drainAt = sim.time; e.drained = 0; }
  const amt = Math.min(amount, e.maxHp * GRASS_DRAIN_CAP - (e.drained ?? 0));
  if (amt <= 0) return;
  e.drained = (e.drained ?? 0) + amt;
  e.hp = Math.min(e.maxHp, e.hp + amt);
}

/** 减速玩家（野生宝可梦的弹体、寒霜区域的命中减速）：不会陷入异常状态的特性挡得住，魔法防守++ 反弹给出手的野生宝可梦 */
export function slowPlayer(sim: GameSim, p: SimPlayer, amount: number, dur: number, src?: Enemy | null) {
  if (blocksStatus(p, 'slow')) {
    if (src && !src.dead && p.ab.some((a) => a.reflectStatus)) applyStatus(src, { kind: 'slow', chance: 1, dur, amount }, 0, p.id);
    return;
  }
  p.slowAmt = p.slowT > 0 ? Math.max(p.slowAmt, amount) : amount;
  p.slowT = Math.max(p.slowT, dur);
  sim.dirty.add(p.id);
}

/** 寒霜区域的命中减速：20%，持续 2 秒，重复命中刷新时间 */
export function chillPlayer(sim: GameSim, p: SimPlayer, src?: Enemy | null) {
  slowPlayer(sim, p, FROST_SLOW, FROST_SLOW_DUR, src);
}

export function healPlayer(sim: GameSim, p: SimPlayer, amount: number, lifesteal = false) {
  if (!p.alive || p.down) return;
  if (lifesteal) {
    if (p.lsCount >= 10) return;
    p.lsCount++;
  }
  const before = p.hp;
  p.hp = Math.min(p.d.maxHp, p.hp + amount * sim.healScale);
  const gained = p.hp - before;
  p.stats.healed += gained;
  if (gained >= 1 && !lifesteal) sim.emit(['heal', p.id, Math.round(gained)]);
}

export interface HurtOpts {
  /** 对战：受击后没有无敌时间，伤害数字带上暴击/克制标记与攻击者 */
  pvp?: boolean;
  flags?: number;
  by?: number;
  /** 持续伤害不会被闪避 */
  dot?: boolean;
  /** 对战：这一下最多扣多少 HP（按受击方的承伤上限） */
  cap?: number;
  /** 熔岩池的灼伤：按最大 HP 的比例掉血，不看无敌时间和防御，不能闪避，也不会带来无敌时间 */
  field?: boolean;
  /** 攻击的属性：特性的免疫、吸收、减伤、反弹看它 */
  type?: PType;
  /** 出手的一方：野生宝可梦，或者对战里对手的替身（反伤、特性的反击作用在它身上） */
  from?: Enemy;
  /** 接触攻击：会触发反伤 */
  contact?: boolean;
  /** 这一下是暴击（愤怒穴位） */
  crit?: boolean;
  /** 出手方有破格：无视物防特防的加成 */
  moldBreaker?: boolean;
  /** 出手方有胆量、用一般系打幽灵系：不能闪避 */
  sure?: boolean;
  /** 已经算好的伤害（队友分担、引爆、反弹）：不闪避、不看防御，也不触发特性 */
  pure?: boolean;
}

/** 'ph' 事件的标记：熔岩池的灼伤（客户端用橙色的小数字显示，不闪红） */
export const PH_BURN = 32;
/** 'ph' 事件的第 4 位：1 闪避，2 护盾挡下，4 特性让这一下无效 */
export const PH_IMMUNE = 4;
/** 闪避几率的上限（不算沙隐、拨沙那 1 秒的完全闪避） */
const DODGE_CAP = 0.8;

/** 受到 cat 类伤害的承伤倍率：物防特防算上特性的动态加成；对手有破格时只看不带加成的数值 */
export function takenMult(p: SimPlayer, cat: 'phys' | 'spec', moldBreaker = false): number {
  if (moldBreaker) return cat === 'phys' ? p.baseTaken.phys : p.baseTaken.spec;
  const k = abilityDef(p);
  return 100 / (50 + (cat === 'phys' ? p.d.def : p.d.spd) * k);
}

/** 站在自己的特性生成的那种场地里，这个属性的技能对自己无效（三圣鸟的第二次觉醒） */
function fieldImmune(p: SimPlayer, type: PType): boolean {
  return !!p.at.field && p.ab.some((a) => a.selfField && a.selfField.kind === p.at.field && a.selfField.immune === type);
}

/**
 * 玩家受到伤害。cat：phys 接触伤害（物防减免），spec 弹幕/爆炸（特防减免）。
 * 对手的攻击依次经过：结实的霸体 → 恶臭 → 属性免疫 / 吸收 → 闪避 → 防御与减伤 → 队友分担 → 护盾，打中后再结算受击方特性的反击。
 */
export function hurtPlayer(sim: GameSim, p: SimPlayer, raw: number, cat: 'phys' | 'spec', o: HurtOpts = {}): number {
  if (!p.alive || p.down || (p.invuln > 0 && !o.field) || raw <= 0) return 0;
  const tail = o.pvp ? [o.flags ?? 0, o.by ?? -1] : o.field ? [PH_BURN, -1] : [];
  const frames = !o.pvp && !o.field;
  const attack = !o.field && !o.dot && !o.pure;
  const from = o.from;
  if (attack) {
    const stench = findAb(p, (a) => a.stench)?.stench;
    if (stench && from && !from.dead && Math.hypot(from.x - p.x, from.y - p.y) - from.r - PLAYER_R <= stench * FIELD_CELL) {
      sim.emit(['ph', p.id, 0, PH_IMMUNE, ...tail]);
      return 0;
    }
    const t = o.type;
    if (t && (fieldImmune(p, t) || p.ab.some((a) => a.immune?.includes(t) || a.absorb?.includes(t)))) {
      const would = raw * takenMult(p, cat, o.moldBreaker);
      if (p.ab.some((a) => a.absorb?.includes(t))) healPlayer(sim, p, would);
      for (const a of p.ab) if (a.reflect?.types.includes(t)) reflectTo(sim, p, from, would * a.reflect.pct);
      if (frames) p.invuln = 0.2;
      sim.emit(['ph', p.id, 0, PH_IMMUNE, ...tail]);
      return 0;
    }
    if (!o.sure && sim.rng.chance(p.at.evade > 0 ? 1 : Math.min(DODGE_CAP, p.d.dodge + abilityDodge(p, cat === 'phys')))) {
      if (!o.pvp) p.invuln = 0.2;
      p.stats.dodges++;
      sim.emit(['ph', p.id, 0, 1, ...tail]);
      return 0;
    }
  }
  let dmg = o.field || o.pure ? raw : raw * takenMult(p, cat, o.moldBreaker);
  if (attack) {
    for (const a of p.ab) {
      if (cat === 'phys' && a.physTaken) dmg *= a.physTaken;
      if (o.type && a.resist?.types.includes(o.type)) dmg *= a.resist.mult;
    }
  }
  dmg = Math.max(1, Math.round(dmg));
  if (o.cap !== undefined) {
    dmg = Math.min(dmg, Math.floor(o.cap));
    if (dmg <= 0) return 0;
  }
  if ((attack || o.dot) && !o.pure) {
    const q = sim.sharerOf(p);
    const share = q ? findAb(q, (a) => a.healer?.share)?.healer?.share ?? 0 : 0;
    if (q && share > 0) {
      const part = Math.floor(dmg * share);
      if (part > 0) {
        dmg -= part;
        hurtPlayer(sim, q, part, cat, { pure: true, pvp: o.pvp, flags: o.flags, by: o.by });
      }
    }
  }
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) {
      if (frames) p.invuln = 0.3;
      sim.emit(['ph', p.id, absorbed, 2, ...tail]);
      return 0;
    }
  }
  p.hp -= dmg;
  p.stats.taken += dmg;
  if (frames) p.invuln = 0.45;
  sim.emit(['ph', p.id, dmg, 0, ...tail]);
  if (attack) afterHurt(sim, p, dmg, cat, o);
  if (o.contact && from && from.hp > 0 && !from.dead && p.d.thorns > 0) hitEnemy(sim, from, p, p.d.thorns * (1 + sim.wave * 0.1), 'normal', { noEff: true });
  if (p.hp <= 0) {
    const reviveItem = Object.keys(p.items).find((id) => ITEMS[id]?.special === 'revive' && p.items[id] > 0);
    const sturdy = findAb(p, (a) => a.sturdy)?.sturdy;
    if (sturdy && !p.sturdyUsed) {
      p.hp = 1;
      p.sturdyUsed = true;
      p.invuln = Math.max(1, sturdy.armor);
      p.at.armor = sturdy.armor;
      sim.emit(['txt', p.x, p.y - 26, sturdy.armor ? '结实！霸体！' : '结实！', '#ffd23f']);
    } else if (p.items.focus_sash && !p.sashUsed) {
      p.hp = 1;
      p.sashUsed = true;
      p.invuln = 1;
      sim.emit(['txt', p.x, p.y - 26, '气势披带！', '#ffd23f']);
    } else if (p.items.focus_band && sim.rng.chance(0.15)) {
      p.hp = 1;
      p.invuln = 1;
      sim.emit(['txt', p.x, p.y - 26, '气势头带！', '#ffd23f']);
    } else if (reviveItem) {
      delete p.items[reviveItem];
      p.hp = Math.max(1, Math.round(p.d.maxHp * (ITEMS[reviveItem].reviveHp ?? 1)));
      p.invuln = 2.5;
      sim.emit(['rev', p.id]);
      sim.emit(['txt', p.x, p.y - 26, `${ITEMS[reviveItem].name}！`, '#ffd23f']);
      sim.recompute(p);
    } else {
      sim.downPlayer(p);
    }
  }
  return dmg;
}

/** 把伤害原样反弹给出手的一方（引爆、过滤+） */
function reflectTo(sim: GameSim, p: SimPlayer, from: Enemy | undefined, amount: number) {
  if (!from || from.dead || from.hp <= 0 || amount < 0.5) return;
  hitEnemy(sim, from, p, amount, 'normal', { fixed: true });
}

/** 受击方的特性在被对手的技能打中后的反应：反弹、回复、让对手陷入状态、愤怒穴位 */
function afterHurt(sim: GameSim, p: SimPlayer, dealt: number, cat: 'phys' | 'spec', o: HurtOpts) {
  const from = o.from;
  for (const a of p.ab) {
    if (a.reflect && o.type && a.reflect.types.includes(o.type)) reflectTo(sim, p, from, dealt * a.reflect.pct);
    if (a.hurtHeal) healPlayer(sim, p, p.d.maxHp * a.hurtHeal);
    if (from && !from.dead) {
      for (const r of a.onHurt ?? []) if ((!r.cat || r.cat === cat) && sim.rng.chance(r.chance)) retaliate(sim, from, p, r.fx);
    }
    if (a.angerPoint && o.crit) {
      if (p.at.anger <= 0) sim.emit(['txt', p.x, p.y - 30, '愤怒穴位！', '#ff6a3a']);
      p.at.anger = a.angerPoint;
      p.at.angerSlow = 0;
      sim.recompute(p);
    }
  }
}

function retaliate(sim: GameSim, from: Enemy, p: SimPlayer, fx: Retaliate) {
  switch (fx) {
    case 'toxic': inflict(sim, from, { kind: 'toxic', chance: 1, dur: 3 }, 0, p); break;
    case 'para': inflict(sim, from, { kind: 'para', chance: 1, dur: 2, amount: 0.75 }, 0, p); break;
    case 'charm': inflict(sim, from, { kind: 'root', chance: 1, dur: 2 }, 0, p); break;
    case 'spore':
      inflict(sim, from, sim.rng.chance(0.7) ? { kind: 'para', chance: 1, dur: 3, amount: 0.75 } : { kind: 'sleep', chance: 1, dur: 3 }, 0, p);
      break;
    case 'burn': inflict(sim, from, { kind: 'burnPhys', chance: 1, dur: 3 }, 0, p); break;
    case 'curse': inflict(sim, from, { kind: 'cdUp', chance: 1, dur: 3 }, 0, p); break;
  }
}

/**
 * 野生宝可梦打到玩家：场地的伤害倍率已经算进 raw，这里结算场地的暴击、命中回复（回到出招的敌人身上）和命中减速。
 * src 是出手的敌人（特性的反击作用在它身上）；contact：接触伤害，会触发反伤；type 省略时按出手敌人的第一属性
 */
export function enemyHurt(sim: GameSim, p: SimPlayer, raw: number, cat: 'phys' | 'spec', fx: HitFx, src: Enemy | null | undefined, contact = false, type?: PType): number {
  let crit = false;
  if (fx.crit && sim.rng.chance(fx.crit / 100)) { raw *= 1.5; crit = true; }
  const dealt = hurtPlayer(sim, p, raw, cat, { from: src ?? undefined, contact, type: type ?? src?.def.types[0], crit });
  if (dealt <= 0) return dealt;
  if (fx.chill) chillPlayer(sim, p, src);
  if (fx.drain && src) enemyDrain(sim, src, dealt * fx.drain);
  return dealt;
}

// ---------------------------------------------------------------- 技能释放

/** 射程内最近的目标；AI 操作的宝可梦优先打有「发光」的对手 */
function nearest(sim: GameSim, p: SimPlayer, range: number): Enemy | null {
  let best: Enemy | null = null, lure: Enemy | null = null;
  let bd = range * range, ld = bd;
  for (const e of sim.targetsFor(p.id)) {
    if (e.hidden || e.hp <= 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = dx * dx + dy * dy - e.r * e.r;
    if (d < bd) { bd = d; best = e; }
    if (p.bot && d < ld && e.pvp?.ab.some((a) => a.aggro)) { ld = d; lure = e; }
  }
  return lure ?? best;
}

function enemiesInRange(sim: GameSim, p: SimPlayer, x: number, y: number, range: number): Enemy[] {
  const out: Enemy[] = [];
  for (const e of sim.targetsFor(p.id)) {
    if (e.hidden || e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= range + e.r) out.push(e);
  }
  return out;
}

/** 斗争心：范围技能同时命中 3 个以上对手时的伤害倍率 */
export function rivalryMult(p: SimPlayer | null | undefined, hits: number): number {
  if (!p || hits < 3) return 1;
  const r = findAb(p, (a) => a.rivalry)?.rivalry;
  return r ? 1 + r.dmg / 100 : 1;
}

export function updateSkills(sim: GameSim, p: SimPlayer, dt: number) {
  const rate = sim.cdRate(p);
  for (const s of p.skills) {
    s.cd -= dt * rate;
    if (s.cd > 0) continue;
    const def = SKILLS[s.id];
    if (!def) continue;
    const fm = sim.castMod(p, def);
    if (cast(sim, p, def, s.lv, fm)) s.cd = Math.max(MIN_CD, def.cd * skillLevelCd(s.lv) * p.d.cdMult * fm.cd * abilityCd(p, def));
    else s.cd = 0.1;
  }
}

/** 放出技能以后：逃跑的加速、沙隐的闪避、舍身的代价 */
function afterCast(sim: GameSim, p: SimPlayer, s: SkillDef) {
  for (const a of p.ab) {
    if (a.castMove) { p.at.moveT = a.castMove.dur; p.at.moveAmt = a.castMove.move; }
    if (a.castEvade && s.type === a.castEvade.type && p.at.evade <= 0 && sim.rng.chance(a.castEvade.chance)) {
      p.at.evade = a.castEvade.dur;
      sim.emit(['txt', p.x, p.y - 30, a.name, '#e8c870']);
    }
    if (a.moves?.cost && a.moves.ids.includes(s.id)) p.hp = Math.max(1, p.hp - p.d.maxHp * a.moves.cost);
  }
}

/** fm：出招时脚下场地的修正（伤害、范围、暴击、命中回复与减速在出招时就定下来，弹体飞出场地也照样算） */
function cast(sim: GameSim, p: SimPlayer, s: SkillDef, lv: number, fm: Readonly<MoveMod>): boolean {
  const rm = p.d.rangeMult * fm.range;
  const range = s.range * rm;
  const k = fm.size;
  const drain = fm.drain || undefined, chill = fm.chill || undefined;
  switch (s.pattern) {
    case 'heal':
      if (!castHeal(sim, p, s)) return false;
      afterCast(sim, p, s);
      return true;
    case 'shield': {
      if (!nearest(sim, p, range)) return false;
      p.at.combat = sim.time;
      const mult = p.items.light_clay ? 1.6 : 1;
      p.shield = Math.max(p.shield, p.d.maxHp * (s.shield ?? 0.15) * mult);
      p.shieldT = s.duration ?? 4;
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      afterCast(sim, p, s);
      return true;
    }
    case 'buff': {
      if (!nearest(sim, p, range) || !s.buff) return false;
      p.at.combat = sim.time;
      p.buffT = s.buff.dur;
      p.buff = { haste: s.buff.haste ?? 0, spe: s.buff.spe ?? 0 };
      sim.recompute(p);
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      afterCast(sim, p, s);
      return true;
    }
  }

  const t = nearest(sim, p, range);
  if (!t) return false;
  p.at.combat = sim.time;
  const base = baseDamage(p, s, lv) * fm.dmg;
  const crit = (s.crit ?? 0) + fm.crit;
  const ang = Math.atan2(t.y - p.y, t.x - p.x);
  const opts: HitOpts = { crit, status: s.status, knock: s.knock, heal: s.heal, skill: s, drain, chill };

  switch (s.pattern) {
    case 'proj': {
      const n = projCount(p, s);
      const spd = s.speed ?? 200;
      // 穿透：直线飞行不追踪，穿过几个额外的对手才停下，不够就一直飞到地图外
      const pierce = findAb(p, (a) => a.pierce)?.pierce;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? ang + (s.spread ?? 0) * (i / (n - 1) - 0.5) : ang;
        sim.spawnProj({
          fx: s.fx, owner: p.id, skill: s, type: s.type,
          x: p.x, y: p.y - 6, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: (s.size ?? 3) * k, dmg: base, pierce: pierce ? Math.max(s.pierce ?? 0, pierce) : s.pierce ?? 0,
          life: pierce ? Math.hypot(sim.w, sim.h) / spd : (range * 1.25) / spd,
          homing: pierce ? 0 : s.homing ?? 0, crit, knock: s.knock ?? 0, status: s.status, drain, chill,
        });
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'melee': {
      const rad = (s.radius ?? 34) * rm * k;
      const arc = s.arc ?? Math.PI / 2;
      const hits = enemiesInRange(sim, p, p.x, p.y, rad).filter((e) => {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const slack = d > 0 ? Math.atan2(e.r, d) : Math.PI;
        return arc >= TAU - 0.01 || angDiff(Math.atan2(e.y - p.y, e.x - p.x), ang) <= arc / 2 + slack;
      });
      const dmg = base * rivalryMult(p, hits.length);
      let total = 0;
      for (const e of hits) total += hitEnemy(sim, e, p, dmg, s.type, { ...opts, kx: e.x - p.x, ky: e.y - p.y });
      recoil(p, s, total);
      sim.emit(['fx', s.fx, p.x, p.y - 4, round2(ang), Math.round(rad), Math.round((arc * 180) / Math.PI), p.id]);
      sim.emitCast(p, 0);
      break;
    }
    case 'beam': {
      const len = range * k;
      const width = (s.width ?? 10) * k;
      if (s.delay) {
        sim.strikes.push({ owner: p.id, skill: s, x: p.x, y: p.y - 4, r: width, t: s.delay, dmg: base, type: s.type, fx: s.fx, cat: s.cat === 'phys' ? 'phys' : 'spec', line: { ang, len }, crit, drain, chill });
        sim.emit(['fx', s.fx + '_charge', p.x, p.y - 4, round2(ang), Math.round(len), Math.round(width), p.id, Math.round(s.delay * 1000)]);
      } else {
        beamHit(sim, p, s, p.x, p.y - 4, ang, len, width, base, { crit, drain, chill });
        sim.emit(['fx', s.fx, p.x, p.y - 4, round2(ang), Math.round(len), Math.round(width), p.id]);
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'nova': {
      const rad = (s.radius ?? 60) * rm * k;
      const hits = enemiesInRange(sim, p, p.x, p.y, rad);
      const dmg = base * rivalryMult(p, hits.length);
      let total = 0;
      for (const e of hits) total += hitEnemy(sim, e, p, dmg, s.type, { ...opts, kx: e.x - p.x, ky: e.y - p.y });
      recoil(p, s, total);
      sim.emit(['fx', s.fx, p.x, p.y, 0, Math.round(rad), 0, p.id]);
      sim.emitCast(p, 0);
      break;
    }
    case 'chain': {
      const pts: number[] = [Math.round(p.x), Math.round(p.y - 8)];
      const hit = new Set<number>();
      let cur: Enemy | null = t;
      let dmg = base;
      for (let i = 0; i < (s.chains ?? 3) && cur; i++) {
        hit.add(cur.id);
        pts.push(Math.round(cur.x), Math.round(cur.y - 6));
        const from: Enemy = cur;
        hitEnemy(sim, from, p, dmg, s.type, { ...opts, kx: from.x - p.x, ky: from.y - p.y });
        dmg *= 0.88;
        let next: Enemy | null = null;
        let bd = (95 * k) ** 2;
        for (const e of sim.targetsFor(p.id)) {
          if (e.hp <= 0 || e.hidden || hit.has(e.id)) continue;
          const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
          if (d < bd) { bd = d; next = e; }
        }
        cur = next;
      }
      sim.emit(['chain', s.fx, pts]);
      sim.emitCast(p, 1);
      break;
    }
    case 'strike': {
      const n = s.strikes ?? 1;
      const targets: Enemy[] = [t];
      if (n > 1) {
        const pool = enemiesInRange(sim, p, p.x, p.y, range).filter((e) => e !== t);
        sim.rng.shuffle(pool);
        for (const e of pool) { if (targets.length >= n) break; targets.push(e); }
      }
      const rad = (s.radius ?? 30) * Math.sqrt(rm) * k;
      for (let i = 0; i < n; i++) {
        let x: number, y: number;
        if (i < targets.length) { x = targets[i].x; y = targets[i].y; }
        else {
          // 目标不够时，多出来的打击随机落在附近，不会全部叠在同一个敌人身上
          const a = sim.rng.range(0, Math.PI * 2), d = sim.rng.range(rad * 1.6, rad * 3);
          x = t.x + Math.cos(a) * d; y = t.y + Math.sin(a) * d;
        }
        const delay = (s.delay ?? 0.3) + i * 0.08;
        sim.strikes.push({ owner: p.id, skill: s, x, y, r: rad, t: delay, dmg: base, type: s.type, fx: s.fx, cat: s.cat === 'phys' ? 'phys' : 'spec', crit, drain, chill });
        sim.emit(['fx', s.fx + '_pre', Math.round(x), Math.round(y), 0, Math.round(rad), Math.round(delay * 1000), p.id]);
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'orbit': {
      const n = s.count ?? 4;
      const rad = (s.radius ?? 40) * rm * k;
      for (let i = 0; i < n; i++) {
        sim.spawnProj({
          fx: s.fx, owner: p.id, skill: s, type: s.type, x: p.x, y: p.y, vx: 0, vy: 0,
          r: (s.size ?? 4) * k, dmg: base, pierce: 9999, life: s.duration ?? 4, homing: 0, crit,
          knock: s.knock ?? 20, status: s.status, orbit: { ang: (i / n) * TAU, rad, spd: 4.2 }, drain, chill,
        });
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'zone': {
      const rad = (s.radius ?? 30) * Math.sqrt(rm) * k;
      sim.zones.push({
        id: sim.newId(), fx: s.fx, owner: p.id, skill: s, type: s.type, x: t.x, y: t.y, r: rad,
        life: s.duration ?? 3, maxLife: s.duration ?? 3, tick: s.tick ?? 0.5, t: 0, dmg: base, crit, drain, chill,
      });
      sim.emitCast(p, 1);
      break;
    }
  }
  afterCast(sim, p, s);
  return true;
}

/** 弹体技能一次发射几发：多发的技能吃连续攻击的加成 */
function projCount(p: SimPlayer, s: SkillDef): number {
  const n = s.count ?? 1;
  return n > 1 ? n + (findAb(p, (a) => a.skillLink)?.skillLink ?? 0) : n;
}

function castHeal(sim: GameSim, p: SimPlayer, s: SkillDef): boolean {
  const mult = healMult(p);
  const targets = s.team
    ? sim.players.filter((q) => q.alive && !q.down && sim.isAlly(p, q) && Math.hypot(q.x - p.x, q.y - p.y) <= (s.radius ?? 120))
    : [p];
  if (!targets.some((q) => q.hp < q.d.maxHp * 0.75)) return false;
  // 友情防守：给队友的回复更多，被回复的队友物防特防提升
  const boost = findAb(p, (a) => a.teamBoost)?.teamBoost;
  for (const q of targets) {
    const ally = q !== p && boost;
    healPlayer(sim, q, q.d.maxHp * (s.heal ?? 0.2) * mult * (ally ? 1 + boost.heal / 100 : 1));
    if (ally) { q.at.guard = 4; q.at.guardAmt = boost.def; }
  }
  sim.emit(['fx', s.fx, p.x, p.y, 0, s.team ? s.radius ?? 120 : 16, 0, p.id]);
  sim.emitCast(p, 1);
  return true;
}

/**
 * 技能现在的实际数值：按现在的能力、道具、技能等级、特性和脚下的场地计算，和真正放出去的一样（界面上的技能说明都用它）。
 * dmg 是每次命中的伤害，不算属性克制、暴击和对小怪 / 首领的加成；对战里按自己的等级换算成对战伤害。
 */
export interface SkillNums {
  /** 冷却（秒） */
  cd: number;
  dmg?: number;
  /** 暴击率（%） */
  crit?: number;
  /** 射程（多远的敌人会让它出手）；光束是长度 */
  range: number;
  /** 覆盖半径（近身、范围、环绕、定点、区域） */
  radius?: number;
  /** 光束宽度 */
  width?: number;
  /** 弹体数 / 打击次数 / 环绕个数 / 连锁次数 */
  count?: number;
  /** 持续时间（区域、环绕、护盾、强化） */
  dur?: number;
  /** 回复量、护盾量（HP） */
  heal?: number;
  shield?: number;
  /** 强化：技能急速（%）、速度 */
  haste?: number;
  spe?: number;
}

/** field：算不算脚下的场地（发给界面的不算，界面自己按脚下的场地修正，站进、走出场地时不用重发整份状态） */
export function skillNums(sim: GameSim, p: SimPlayer, id: string, lv: number, field = true): SkillNums | null {
  const s = SKILLS[id];
  if (!s) return null;
  const fm = field ? sim.castMod(p, s) : NO_MOVE_MOD;
  const rm = p.d.rangeMult * fm.range, k = fm.size;
  const cd = Math.max(MIN_CD, s.cd * skillLevelCd(lv) * p.d.cdMult * fm.cd * abilityCd(p, s));
  const out: SkillNums = { cd: Math.round(cd * 100) / 100, range: Math.round(s.range * rm) };
  switch (s.pattern) {
    case 'heal': return { ...out, heal: Math.round(p.d.maxHp * (s.heal ?? 0.2) * healMult(p)), radius: s.team ? s.radius ?? 120 : undefined };
    case 'shield': return { ...out, shield: Math.round(p.d.maxHp * (s.shield ?? 0.15) * (p.items.light_clay ? 1.6 : 1)), dur: s.duration ?? 4 };
    case 'buff': return { ...out, dur: s.buff?.dur, haste: s.buff?.haste, spe: s.buff?.spe };
  }
  out.dmg = Math.max(1, Math.round(baseDamage(p, s, lv) * fm.dmg * sim.readoutScale(p)));
  out.crit = Math.round(Math.min(1, critChance(p, { crit: (s.crit ?? 0) + fm.crit, skill: s })) * 100);
  switch (s.pattern) {
    case 'proj': out.count = projCount(p, s); break;
    case 'melee': out.radius = Math.round((s.radius ?? 34) * rm * k); break;
    case 'beam': out.range = Math.round(s.range * rm * k); out.width = Math.round((s.width ?? 10) * k); break;
    case 'nova': out.radius = Math.round((s.radius ?? 60) * rm * k); break;
    case 'chain': out.count = s.chains ?? 3; break;
    case 'strike': out.count = s.strikes ?? 1; out.radius = Math.round((s.radius ?? 30) * Math.sqrt(rm) * k); break;
    case 'orbit': out.count = s.count ?? 4; out.radius = Math.round((s.radius ?? 40) * rm * k); out.dur = s.duration ?? 4; break;
    case 'zone': out.radius = Math.round((s.radius ?? 30) * Math.sqrt(rm) * k); out.dur = s.duration ?? 3; break;
  }
  return out;
}

/**
 * 不含场地的实际数值再算上脚下的场地 field（和出招时的修正一样：伤害、冷却、覆盖范围、射程、暴击，熔岩灼伤时物理招式伤害减半；
 * 特性带来的免疫负面效果、适应力和场地里的加成也算进去）。界面用它：服务器发的数值不含场地，站进、走出场地时不用重发整份私有状态
 */
export function fieldNums(id: string, n: SkillNums | undefined, field: FieldId | null, types: readonly PType[], ab: readonly AbilityDef[] = []): SkillNums | undefined {
  const s = SKILLS[id];
  if (!n || !field || !s) return n;
  const fm = abMoveMod(field, s.type, ab);
  const burn = s.cat === 'phys' && abFieldBurns(field, types, ab) ? BURN_PHYS : 1;
  const out: SkillNums = { ...n, cd: Math.round(Math.max(MIN_CD, n.cd * fm.cd) * 100) / 100 };
  if (n.dmg !== undefined) out.dmg = Math.max(1, Math.round(n.dmg * fm.dmg * burn));
  if (n.crit !== undefined) out.crit = Math.min(100, n.crit + fm.crit);
  if (s.pattern === 'heal') return out;
  const r = fm.range, area = s.pattern === 'strike' || s.pattern === 'zone' ? Math.sqrt(r) : r;
  if (n.radius) out.radius = Math.round(n.radius * fm.size * area);
  if (s.pattern === 'beam') { out.range = Math.round(n.range * fm.size * r); out.width = Math.round((n.width ?? 0) * fm.size); }
  else if (r !== 1) out.range = Math.round(n.range * r);
  return out;
}

/** 回复类技能、寄生种子吸取的倍率 */
export function healMult(p: SimPlayer) {
  return p.items.big_root ? 1.3 : 1;
}

function recoil(p: SimPlayer, s: SkillDef, total: number) {
  if (!s.recoil || total <= 0 || p.ab.some((a) => a.rockHead)) return;
  const r = Math.min(total * s.recoil, p.d.maxHp * 0.06);
  p.hp = Math.max(1, p.hp - r);
}

export function beamHit(sim: GameSim, p: SimPlayer | null, s: SkillDef, x: number, y: number, ang: number, len: number, width: number, dmg: number, fx: HitFx = {}) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  const hits = sim.targetsFor(p ? p.id : -1).filter((e) => {
    if (e.hp <= 0 || e.hidden) return false;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * cx + dy * cy;
    if (along < -e.r || along > len + e.r) return false;
    return Math.abs(-dx * cy + dy * cx) <= width / 2 + e.r;
  });
  const d = dmg * rivalryMult(p, hits.length);
  for (const e of hits) {
    hitEnemy(sim, e, p, d, s.type, { crit: fx.crit ?? s.crit, status: s.status, knock: s.knock, kx: cx, ky: cy, skill: s, drain: fx.drain, chill: fx.chill });
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
