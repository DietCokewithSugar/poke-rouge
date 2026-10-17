/**
 * 特性在模拟里的计算：只读玩家现在的状态（生效的特性、HP、异常状态、脚下的场地），不改动任何东西。
 * 场地相关的招式修正在 abilities.ts 的 abMoveMod 里（客户端也要用）。
 */
import { inFieldFx, type AbilityDef } from '../abilities';
import type { SkillDef, StatusKind } from '../skills';
import { hasStatus, type SimPlayer } from './entities';

export const isLowHp = (p: SimPlayer) => p.hp < p.d.maxHp / 2;
export const isHighHp = (p: SimPlayer) => p.hp > p.d.maxHp / 2;

/** 第一个满足条件的特性 */
export function findAb(p: SimPlayer, pred: (a: AbilityDef) => unknown): AbilityDef | undefined {
  return p.ab.find(pred);
}

/** 陷入异常状态（含熔岩的灼伤、被减速），或者站在对自己不利的场地里 */
export function afflicted(p: SimPlayer): boolean {
  return p.at.bad || p.fieldBurn > 0 || p.slowT > 0 || hasStatus(p.st);
}

/** 特性带来的技能伤害 +%（场地里的加成在 castMod 里算） */
export function abilityDmgPct(p: SimPlayer, s: SkillDef): number {
  let pct = 0;
  const low = isLowHp(p), high = isHighHp(p);
  let aff: boolean | undefined;
  for (const a of p.ab) {
    pct += (a.typeDmg?.[s.type] ?? 0) + (a.dmg ?? 0);
    if (a.moves?.dmg && a.moves.ids.includes(s.id)) pct += a.moves.dmg;
    if (a.tierDmg?.tiers.includes(s.tier)) pct += a.tierDmg.dmg;
    if (a.lowHp?.dmg && low && (!a.lowHp.type || a.lowHp.type === s.type)) pct += a.lowHp.dmg;
    if (a.highHp?.dmg && high) pct += a.highHp.dmg;
    if (a.afflicted?.dmg && (aff ??= afflicted(p))) pct += a.afflicted.dmg;
    if (a.magnet && p.items.magnet && (s.type === 'electric' || s.type === 'steel')) pct += a.magnet.item;
    if (a.rivalry && p.at.rivalAlly) pct += a.rivalry.team;
  }
  return pct;
}

/** 特性带来的暴击率（百分点）；必定暴击时返回 Infinity */
export function abilityCrit(p: SimPlayer, s: SkillDef | null | undefined): number {
  let c = 0;
  for (const a of p.ab) {
    if (s && a.tierCrit?.includes(s.tier)) return Infinity;
    if (a.lowHp?.crit && isLowHp(p)) c += a.lowHp.crit;
  }
  return c;
}

/** 特性带来的冷却倍率（常驻的部分，和场地、光环无关） */
export function abilityCd(p: SimPlayer, s: SkillDef): number {
  let k = 1;
  for (const a of p.ab) {
    if (a.cd) k *= a.cd;
    if (a.moves?.cd && a.moves.ids.includes(s.id)) k *= a.moves.cd;
  }
  return k;
}

/** 特性带来的移动速度倍率（不含场地） */
export function abilityMove(p: SimPlayer): number {
  let pct = 0;
  const low = isLowHp(p), high = isHighHp(p);
  let aff: boolean | undefined;
  for (const a of p.ab) {
    pct += a.move ?? 0;
    if (a.powders) pct += a.powders.pct * Math.min(a.powders.max, p.items.quick_powder ?? 0);
    if (a.lowHp?.move && low) pct += a.lowHp.move;
    if (a.highHp?.move && high) pct += a.highHp.move;
    if (a.afflicted?.move && (aff ??= afflicted(p))) pct += a.afflicted.move;
  }
  if (p.at.moveT > 0) pct += p.at.moveAmt;
  return Math.max(0.1, 1 + pct / 100) * (p.at.angerSlow > 0 ? 0.5 : 1);
}

/** 特性带来的物防特防倍率（随 HP、异常状态、场地、队友变化的部分；常驻的在 mods 里） */
export function abilityDef(p: SimPlayer): number {
  let pct = 0;
  const high = isHighHp(p);
  let aff: boolean | undefined;
  for (const a of p.ab) {
    if (a.highHp?.def && high) pct += a.highHp.def;
    if (a.afflicted?.def && (aff ??= afflicted(p))) pct += a.afflicted.def;
    if (a.outnumbered && p.at.outnumbered) pct += a.outnumbered;
  }
  for (const x of inFieldFx(p.ab, p.at.field)) pct += x.def ?? 0;
  if (p.at.guard > 0) pct += p.at.guardAmt;
  return Math.max(0.1, 1 + pct / 100);
}

/** 特性带来的闪避几率（随场地、计时变化的部分；常驻的在 mods 里）；phys：这一下是物理攻击 */
export function abilityDodge(p: SimPlayer, phys: boolean): number {
  if (p.at.evade > 0) return 1;
  let d = 0;
  for (const a of p.ab) if (phys && a.physDodge) d += a.physDodge;
  for (const x of inFieldFx(p.ab, p.at.field)) d += x.dodge ?? 0;
  return d / 100;
}

/** 特性的持续回复：每秒回复最大 HP 的比例 */
export function abilityRegen(p: SimPlayer, sim: { time: number }): number {
  let r = 0;
  for (const a of p.ab) {
    r += a.regen ?? 0;
    if (a.gluttony && p.items.leftovers) r += a.gluttony.regen;
    if (a.idleRegen && sim.time - p.at.combat > 1) r += a.idleRegen;
  }
  for (const x of inFieldFx(p.ab, p.at.field)) r += x.regen ?? 0;
  return r;
}

/** 算「异常状态」的状态：不会陷入异常状态的特性挡得住（威吓、诅咒是特性的削弱，不算） */
const STATUS: ReadonlySet<StatusKind> = new Set<StatusKind>(['burn', 'poison', 'toxic', 'leech', 'para', 'slow', 'freeze', 'stun', 'sleep', 'root', 'burnPhys', 'sun']);

/** 对手让自己陷入的状态会不会被挡掉：结实的霸体、恒净之躯（技能附加效果和对手的特性都不受影响）、不会陷入异常状态 */
export function blocksStatus(p: SimPlayer, kind: StatusKind): boolean {
  if (p.at.armor > 0) return true;
  for (const a of p.ab) {
    if (a.clearBody) return true;
    if (a.noStatus === 'all' && STATUS.has(kind)) return true;
    if (a.noStatus === kind) return true;
  }
  return false;
}

/** 不受对手特性的影响（恒净之躯、化学变化气体；结实的霸体期间也一样） */
export function ignoresFoeAbility(p: SimPlayer): boolean {
  return p.at.armor > 0 || p.ab.some((a) => a.clearBody);
}
