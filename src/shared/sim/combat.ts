import { BURN_PHYS, FROST_SLOW, FROST_SLOW_DUR, GRASS_DRAIN_CAP, NO_MOVE_MOD, fieldBurns, moveMod, type FieldId, type MoveMod } from '../fields';
import { ITEMS } from '../items';
import { LINES, formOf } from '../pokemon';
import { SKILLS, skillLevelCd, skillLevelDmg, type SkillDef } from '../skills';
import { TYPES, gameEffectiveness, type PType } from '../types';
import type { Enemy, HitFx, SimPlayer, StatusApply } from './entities';
import type { GameSim } from './game';

export const PLAYER_R = 7;

const TAU = Math.PI * 2;
function angDiff(a: number, b: number) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/** 技能对所有敌人通用的伤害部分（不含克制、首领加成、暴击）。 */
export function baseDamage(p: SimPlayer, s: SkillDef, lv: number): number {
  const L = LINES[p.line];
  const F = L.flags;
  const form = formOf(p.line, p.stage);
  const stat = s.cat === 'phys' ? p.d.physMult : p.d.specMult;
  const stab = F.imposter || form.types.includes(s.type) ? (F.adaptability ? 2 : 1.5) : 1;
  let typeBonus = 1 + (p.typeMods[s.type] ?? 0) / 100;
  if (L.bonusType === s.type) {
    typeBonus += L.bonusPct / 100;
    if (F.lowHp && p.hp < p.d.maxHp / 3) typeBonus += 0.5;
  }
  let dmg = s.power * skillLevelDmg(lv) * stat * stab * typeBonus * p.d.dmgMult;
  if (F.technician && s.power <= 15) dmg *= 1.4;
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
}

/** 对敌人造成伤害，返回实际伤害。 */
export function hitEnemy(sim: GameSim, e: Enemy, p: SimPlayer | null, raw: number, type: PType, o: HitOpts = {}): number {
  if (e.pvp) return sim.pvpHit(e, p, raw, type, o);
  if (e.hp <= 0) return 0;
  let dmg = raw;
  let flags = 0;
  if (!o.noEff) {
    const eff = gameEffectiveness(type, e.def.types);
    dmg *= eff;
    if (eff > 1) {
      flags |= 2;
      if (p) { dmg *= p.d.superEffMult; p.stats.superEff++; }
    } else if (eff < 1) flags |= 4;
  }
  if (p) {
    dmg *= e.def.rank === 'minion' ? p.d.minionMult : p.d.bossMult;
    if (!o.dot && sim.rng.chance(p.d.crit + (o.crit ?? 0) / 100)) { dmg *= 1.5; flags |= 1; p.stats.crits++; }
  }
  if (o.dot) flags |= 8;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  if (p) {
    e.lastHit = p.id;
    p.stats.damage += dmg;
    const key = o.dot ? '_dot' : o.skill?.id ?? '_other';
    p.stats.skillDmg[key] = (p.stats.skillDmg[key] ?? 0) + dmg;
    if (!o.dot && p.d.lifesteal > 0 && sim.rng.chance(p.d.lifesteal)) healPlayer(sim, p, 1, true);
    if (!o.dot && p.d.stun > 0 && sim.rng.chance(p.d.stun)) applyStatus(e, { kind: 'stun', chance: 1, dur: 0.5 }, dmg, p.id);
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
  if (o.knock && e.def.knockResist !== 1) {
    const k = o.knock * (1 - (e.def.knockResist ?? 0));
    const len = Math.hypot(o.kx ?? 0, o.ky ?? 0) || 1;
    e.vx += ((o.kx ?? 0) / len) * k;
    e.vy += ((o.ky ?? 0) / len) * k;
  }
  if (e.hp <= 0) sim.killEnemy(e, p);
  return dmg;
}

export function applyStatus(e: Enemy, s: StatusApply, dmg: number, src: number, heal = 0) {
  const st = e.st;
  const boss = e.def.rank !== 'minion';
  const dur = s.dur ?? 2;
  switch (s.kind) {
    case 'burn': st.burn = dur; st.burnDps = Math.max(st.burnDps * 0.6, dmg * 0.25); st.burnSrc = src; break;
    case 'poison': st.poison = dur; st.poisonDps = Math.max(st.poisonDps * 0.7, dmg * 0.22); st.poisonSrc = src; break;
    case 'leech': st.leech = dur; st.leechDps = Math.max(st.leechDps, dmg); st.leechSrc = src; st.leechHeal = heal; break;
    case 'para': st.para = Math.max(st.para, boss ? dur * 0.4 : dur); break;
    case 'slow': st.slow = Math.max(st.slow, dur); st.slowAmt = Math.max(st.slowAmt, s.amount ?? 0.3); break;
    case 'freeze': st.freeze = Math.max(st.freeze, boss ? dur * 0.25 : dur); break;
    case 'stun': st.stun = Math.max(st.stun, boss ? dur * 0.25 : dur); break;
  }
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

/** 寒霜区域的命中减速：20%，持续 2 秒，重复命中刷新时间 */
export function chillPlayer(sim: GameSim, p: SimPlayer) {
  p.slowAmt = p.slowT > 0 ? Math.max(p.slowAmt, FROST_SLOW) : FROST_SLOW;
  p.slowT = Math.max(p.slowT, FROST_SLOW_DUR);
  sim.dirty.add(p.id);
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
}

/** 'ph' 事件的标记：熔岩池的灼伤（客户端用橙色的小数字显示，不闪红） */
export const PH_BURN = 32;

/** 玩家受到伤害。cat：phys 接触伤害（物防减免），spec 弹幕/爆炸（特防减免）。 */
export function hurtPlayer(sim: GameSim, p: SimPlayer, raw: number, cat: 'phys' | 'spec', src?: Enemy, o: HurtOpts = {}): number {
  if (!p.alive || p.down || (p.invuln > 0 && !o.field) || raw <= 0) return 0;
  const tail = o.pvp ? [o.flags ?? 0, o.by ?? -1] : o.field ? [PH_BURN, -1] : [];
  const frames = !o.pvp && !o.field;
  if (!o.dot && !o.field && sim.rng.chance(p.d.dodge)) {
    if (!o.pvp) p.invuln = 0.2;
    p.stats.dodges++;
    sim.emit(['ph', p.id, 0, 1, ...tail]);
    return 0;
  }
  let dmg = Math.max(1, Math.round(o.field ? raw : raw * (cat === 'phys' ? p.d.physTaken : p.d.specTaken)));
  if (o.cap !== undefined) {
    dmg = Math.min(dmg, Math.floor(o.cap));
    if (dmg <= 0) return 0;
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
  const F = LINES[p.line].flags;
  if (src && src.hp > 0) {
    if (p.d.thorns > 0) hitEnemy(sim, src, p, p.d.thorns * (1 + sim.wave * 0.1), 'normal', { noEff: true });
    if (F.contact && sim.rng.chance(F.contact[1])) {
      const kind = F.contact[0];
      // 中毒、灼伤的持续伤害按波次成长，和反伤一样
      applyStatus(src, { kind, chance: 1, dur: kind === 'stun' ? 0.8 : kind === 'para' ? 2 : 3 }, 6 + sim.wave * 2, p.id);
    }
  }
  if (p.hp <= 0) {
    const reviveItem = Object.keys(p.items).find((id) => ITEMS[id]?.special === 'revive' && p.items[id] > 0);
    if (F.sturdy && !p.sturdyUsed) {
      p.hp = 1;
      p.sturdyUsed = true;
      p.invuln = 1;
      sim.emit(['txt', p.x, p.y - 26, '结实！', '#ffd23f']);
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

/**
 * 野生宝可梦打到玩家：场地的伤害倍率已经算进 raw，这里结算场地的暴击、命中回复（回到出招的敌人身上）和命中减速。
 * contact：接触伤害，会触发反伤、静电这类特性
 */
export function enemyHurt(sim: GameSim, p: SimPlayer, raw: number, cat: 'phys' | 'spec', fx: HitFx, src: Enemy | null | undefined, contact = false): number {
  if (fx.crit && sim.rng.chance(fx.crit / 100)) raw *= 1.5;
  const dealt = hurtPlayer(sim, p, raw, cat, contact ? src ?? undefined : undefined);
  if (dealt <= 0) return dealt;
  if (fx.chill) chillPlayer(sim, p);
  if (fx.drain && src) enemyDrain(sim, src, dealt * fx.drain);
  return dealt;
}

// ---------------------------------------------------------------- 技能释放

function nearest(sim: GameSim, p: SimPlayer, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bd = range * range;
  for (const e of sim.targetsFor(p.id)) {
    if (e.hidden || e.hp <= 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = dx * dx + dy * dy - e.r * e.r;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
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

export function updateSkills(sim: GameSim, p: SimPlayer, dt: number) {
  for (const s of p.skills) {
    s.cd -= dt;
    if (s.cd > 0) continue;
    const def = SKILLS[s.id];
    if (!def) continue;
    const fm = sim.castMod(p, def);
    if (cast(sim, p, def, s.lv, fm)) s.cd = def.cd * skillLevelCd(s.lv) * p.d.cdMult * fm.cd;
    else s.cd = 0.1;
  }
}

/** fm：出招时脚下场地的修正（伤害、范围、暴击、命中回复与减速在出招时就定下来，弹体飞出场地也照样算） */
function cast(sim: GameSim, p: SimPlayer, s: SkillDef, lv: number, fm: Readonly<MoveMod>): boolean {
  const rm = p.d.rangeMult;
  const range = s.range * rm;
  const k = fm.size;
  const drain = fm.drain || undefined, chill = fm.chill || undefined;
  switch (s.pattern) {
    case 'heal': return castHeal(sim, p, s);
    case 'shield': {
      if (!nearest(sim, p, range)) return false;
      const mult = (LINES[p.line].flags.shieldMult ?? 1) * (p.items.light_clay ? 1.6 : 1);
      p.shield = Math.max(p.shield, p.d.maxHp * (s.shield ?? 0.15) * mult);
      p.shieldT = s.duration ?? 4;
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      return true;
    }
    case 'buff': {
      if (!nearest(sim, p, range) || !s.buff) return false;
      p.buffT = s.buff.dur;
      p.buff = { haste: s.buff.haste ?? 0, spe: s.buff.spe ?? 0 };
      sim.recompute(p);
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      return true;
    }
  }

  const t = nearest(sim, p, range);
  if (!t) return false;
  const base = baseDamage(p, s, lv) * fm.dmg;
  const crit = (s.crit ?? 0) + fm.crit;
  const ang = Math.atan2(t.y - p.y, t.x - p.x);
  const opts: HitOpts = { crit, status: s.status, knock: s.knock, heal: s.heal, skill: s, drain, chill };

  switch (s.pattern) {
    case 'proj': {
      const n = (s.count ?? 1) + ((s.count ?? 1) > 1 && LINES[p.line].flags.skillLink ? 1 : 0);
      const spd = s.speed ?? 200;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? ang + (s.spread ?? 0) * (i / (n - 1) - 0.5) : ang;
        sim.spawnProj({
          fx: s.fx, owner: p.id, skill: s, type: s.type,
          x: p.x, y: p.y - 6, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: (s.size ?? 3) * k, dmg: base, pierce: s.pierce ?? 0, life: (range * 1.25) / spd,
          homing: s.homing ?? 0, crit, knock: s.knock ?? 0, status: s.status, drain, chill,
        });
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'melee': {
      const rad = (s.radius ?? 34) * rm * k;
      const arc = s.arc ?? Math.PI / 2;
      let total = 0;
      for (const e of enemiesInRange(sim, p, p.x, p.y, rad)) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const slack = d > 0 ? Math.atan2(e.r, d) : Math.PI;
        if (arc < TAU - 0.01 && angDiff(Math.atan2(e.y - p.y, e.x - p.x), ang) > arc / 2 + slack) continue;
        total += hitEnemy(sim, e, p, base, s.type, { ...opts, kx: e.x - p.x, ky: e.y - p.y });
      }
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
      let total = 0;
      for (const e of enemiesInRange(sim, p, p.x, p.y, rad)) {
        total += hitEnemy(sim, e, p, base, s.type, { ...opts, kx: e.x - p.x, ky: e.y - p.y });
      }
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
  return true;
}

function castHeal(sim: GameSim, p: SimPlayer, s: SkillDef): boolean {
  const mult = healMult(p);
  const targets = s.team
    ? sim.players.filter((q) => q.alive && !q.down && sim.isAlly(p, q) && Math.hypot(q.x - p.x, q.y - p.y) <= (s.radius ?? 120))
    : [p];
  if (!targets.some((q) => q.hp < q.d.maxHp * 0.75)) return false;
  for (const q of targets) healPlayer(sim, q, q.d.maxHp * (s.heal ?? 0.2) * mult);
  sim.emit(['fx', s.fx, p.x, p.y, 0, s.team ? s.radius ?? 120 : 16, 0, p.id]);
  sim.emitCast(p, 1);
  return true;
}

/**
 * 技能现在的实际数值：按现在的能力、道具、技能等级和脚下的场地计算，和真正放出去的一样（界面上的技能说明都用它）。
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
  const rm = p.d.rangeMult, k = fm.size;
  const out: SkillNums = { cd: Math.round(s.cd * skillLevelCd(lv) * p.d.cdMult * fm.cd * 100) / 100, range: Math.round(s.range * rm) };
  switch (s.pattern) {
    case 'heal': return { ...out, heal: Math.round(p.d.maxHp * (s.heal ?? 0.2) * healMult(p)), radius: s.team ? s.radius ?? 120 : undefined };
    case 'shield': return { ...out, shield: Math.round(p.d.maxHp * (s.shield ?? 0.15) * (LINES[p.line].flags.shieldMult ?? 1) * (p.items.light_clay ? 1.6 : 1)), dur: s.duration ?? 4 };
    case 'buff': return { ...out, dur: s.buff?.dur, haste: s.buff?.haste, spe: s.buff?.spe };
  }
  out.dmg = Math.max(1, Math.round(baseDamage(p, s, lv) * fm.dmg * sim.readoutScale(p)));
  out.crit = Math.round(Math.min(1, p.d.crit + ((s.crit ?? 0) + fm.crit) / 100) * 100);
  switch (s.pattern) {
    case 'proj': out.count = (s.count ?? 1) + ((s.count ?? 1) > 1 && LINES[p.line].flags.skillLink ? 1 : 0); break;
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
 * 不含场地的实际数值再算上脚下的场地 field（和出招时的修正一样：伤害、冷却、覆盖范围、暴击，熔岩灼伤时物理招式伤害减半）。
 * 界面用它：服务器发的数值不含场地，站进、走出场地时不用重发整份私有状态
 */
export function fieldNums(id: string, n: SkillNums | undefined, field: FieldId | null, types: readonly PType[]): SkillNums | undefined {
  const s = SKILLS[id];
  if (!n || !field || !s) return n;
  const fm = moveMod(field, s.type);
  const burn = s.cat === 'phys' && fieldBurns(field, types) ? BURN_PHYS : 1;
  const out: SkillNums = { ...n, cd: Math.round(n.cd * fm.cd * 100) / 100 };
  if (n.dmg !== undefined) out.dmg = Math.max(1, Math.round(n.dmg * fm.dmg * burn));
  if (n.crit !== undefined) out.crit = Math.min(100, n.crit + fm.crit);
  if (fm.size !== 1 && s.pattern !== 'heal') {
    if (n.radius) out.radius = Math.round(n.radius * fm.size);
    if (s.pattern === 'beam') { out.range = Math.round(n.range * fm.size); out.width = Math.round((n.width ?? 0) * fm.size); }
  }
  return out;
}

/** 回复类技能、寄生种子吸取的倍率 */
export function healMult(p: SimPlayer) {
  return (LINES[p.line].flags.healMult ?? 1) * (p.items.big_root ? 1.3 : 1);
}

function recoil(p: SimPlayer, s: SkillDef, total: number) {
  if (!s.recoil || total <= 0 || LINES[p.line].flags.rockHead) return;
  const r = Math.min(total * s.recoil, p.d.maxHp * 0.06);
  p.hp = Math.max(1, p.hp - r);
}

export function beamHit(sim: GameSim, p: SimPlayer | null, s: SkillDef, x: number, y: number, ang: number, len: number, width: number, dmg: number, fx: HitFx = {}) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  for (const e of sim.targetsFor(p ? p.id : -1).slice()) {
    if (e.hp <= 0 || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * cx + dy * cy;
    if (along < -e.r || along > len + e.r) continue;
    const perp = Math.abs(-dx * cy + dy * cx);
    if (perp > width / 2 + e.r) continue;
    hitEnemy(sim, e, p, dmg, s.type, { crit: fx.crit ?? s.crit, status: s.status, knock: s.knock, kx: cx, ky: cy, skill: s, drain: fx.drain, chill: fx.chill });
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
