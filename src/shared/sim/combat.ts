import { LINES, formOf } from '../pokemon';
import { SKILLS, skillLevelCd, skillLevelDmg, type SkillDef } from '../skills';
import { gameEffectiveness, type PType } from '../types';
import type { Enemy, SimPlayer, StatusApply } from './entities';
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
  const form = formOf(p.line, p.stage);
  const stat = s.cat === 'phys' ? p.d.physMult : p.d.specMult;
  const stab = form.types.includes(s.type) ? 1.5 : 1;
  let typeBonus = 1 + (p.typeMods[s.type] ?? 0) / 100;
  if (L.bonusType === s.type) {
    typeBonus += L.bonusPct / 100;
    if (p.line !== 'pikachu' && p.line !== 'mewtwo' && p.hp < p.d.maxHp / 3) typeBonus += 0.5;
  }
  let dmg = s.power * skillLevelDmg(lv) * stat * stab * typeBonus * p.d.dmgMult;
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
}

/** 对敌人造成伤害，返回实际伤害。 */
export function hitEnemy(sim: GameSim, e: Enemy, p: SimPlayer | null, raw: number, type: PType, o: HitOpts = {}): number {
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
    if (!o.dot && sim.rng.chance(p.d.crit + (o.crit ?? 0) / 100)) { dmg *= 1.5; flags |= 1; }
  }
  if (o.dot) flags |= 8;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  if (p) {
    e.lastHit = p.id;
    p.stats.damage += dmg;
    if (!o.dot && p.d.lifesteal > 0 && sim.rng.chance(p.d.lifesteal)) healPlayer(sim, p, 1, true);
    if (!o.dot && p.d.stun > 0 && sim.rng.chance(p.d.stun)) applyStatus(e, { kind: 'stun', chance: 1, dur: 0.5 }, dmg, p.id);
  }
  sim.addHit(e, dmg, flags);
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

export function healPlayer(sim: GameSim, p: SimPlayer, amount: number, lifesteal = false) {
  if (!p.alive || p.down) return;
  if (lifesteal) {
    if (p.lsCount >= 10) return;
    p.lsCount++;
  }
  const before = p.hp;
  p.hp = Math.min(p.d.maxHp, p.hp + amount);
  const gained = p.hp - before;
  if (gained >= 1 && !lifesteal) sim.emit(['heal', p.id, Math.round(gained)]);
}

/** 玩家受到伤害。cat：phys 接触伤害（物防减免），spec 弹幕/爆炸（特防减免）。 */
export function hurtPlayer(sim: GameSim, p: SimPlayer, raw: number, cat: 'phys' | 'spec', src?: Enemy): number {
  if (!p.alive || p.down || p.invuln > 0 || raw <= 0) return 0;
  if (sim.rng.chance(p.d.dodge)) {
    p.invuln = 0.2;
    sim.emit(['ph', p.id, 0, 1]);
    return 0;
  }
  let dmg = Math.max(1, Math.round(raw * (cat === 'phys' ? p.d.physTaken : p.d.specTaken)));
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) {
      p.invuln = 0.3;
      sim.emit(['ph', p.id, absorbed, 2]);
      return 0;
    }
  }
  p.hp -= dmg;
  p.invuln = 0.45;
  sim.emit(['ph', p.id, dmg, 0]);
  if (src && src.hp > 0) {
    if (p.d.thorns > 0) hitEnemy(sim, src, p, p.d.thorns * (1 + sim.wave * 0.1), 'normal', { noEff: true });
    if (p.line === 'pikachu' && sim.rng.chance(0.3)) applyStatus(src, { kind: 'para', chance: 1, dur: 2 }, 0, p.id);
  }
  if (p.hp <= 0) {
    if (p.items.focus_sash && !p.sashUsed) {
      p.hp = 1;
      p.sashUsed = true;
      p.invuln = 1;
      sim.emit(['txt', p.x, p.y - 26, '气势披带！', '#ffd23f']);
    } else if (p.items.max_revive) {
      delete p.items.max_revive;
      p.hp = p.d.maxHp;
      p.invuln = 2.5;
      sim.emit(['rev', p.id]);
      sim.emit(['txt', p.x, p.y - 26, '活力块！', '#ffd23f']);
    } else {
      sim.downPlayer(p);
    }
  }
  return dmg;
}

// ---------------------------------------------------------------- 技能释放

function nearest(sim: GameSim, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bd = range * range;
  for (const e of sim.enemies) {
    if (e.hidden || e.hp <= 0) continue;
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy - e.r * e.r;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function enemiesInRange(sim: GameSim, x: number, y: number, range: number): Enemy[] {
  const out: Enemy[] = [];
  for (const e of sim.enemies) {
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
    if (cast(sim, p, def, s.lv)) s.cd = def.cd * skillLevelCd(s.lv) * p.d.cdMult;
    else s.cd = 0.1;
  }
}

function cast(sim: GameSim, p: SimPlayer, s: SkillDef, lv: number): boolean {
  const rm = p.d.rangeMult;
  const range = s.range * rm;
  switch (s.pattern) {
    case 'heal': return castHeal(sim, p, s);
    case 'shield': {
      if (!nearest(sim, p.x, p.y, range)) return false;
      const mult = p.line === 'squirtle' ? 1.5 : 1;
      p.shield = Math.max(p.shield, p.d.maxHp * (s.shield ?? 0.15) * mult);
      p.shieldT = s.duration ?? 4;
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      return true;
    }
    case 'buff': {
      if (!nearest(sim, p.x, p.y, range) || !s.buff) return false;
      p.buffT = s.buff.dur;
      p.buff = { haste: s.buff.haste ?? 0, spe: s.buff.spe ?? 0 };
      sim.recompute(p);
      sim.emit(['fx', s.fx, p.x, p.y, 0, 16, 0, p.id]);
      sim.emitCast(p, 1);
      return true;
    }
  }

  const t = nearest(sim, p.x, p.y, range);
  if (!t) return false;
  const base = baseDamage(p, s, lv);
  const ang = Math.atan2(t.y - p.y, t.x - p.x);
  const opts: HitOpts = { crit: s.crit, status: s.status, knock: s.knock, heal: s.heal, skill: s };

  switch (s.pattern) {
    case 'proj': {
      const n = s.count ?? 1;
      const spd = s.speed ?? 200;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? ang + (s.spread ?? 0) * (i / (n - 1) - 0.5) : ang;
        sim.spawnProj({
          fx: s.fx, owner: p.id, skill: s, type: s.type,
          x: p.x, y: p.y - 6, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: s.size ?? 3, dmg: base, pierce: s.pierce ?? 0, life: (range * 1.25) / spd,
          homing: s.homing ?? 0, crit: s.crit ?? 0, knock: s.knock ?? 0, status: s.status,
        });
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'melee': {
      const rad = (s.radius ?? 34) * rm;
      const arc = s.arc ?? Math.PI / 2;
      let total = 0;
      for (const e of enemiesInRange(sim, p.x, p.y, rad)) {
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
      const len = range;
      const width = s.width ?? 10;
      if (s.delay) {
        sim.strikes.push({ owner: p.id, skill: s, x: p.x, y: p.y - 4, r: width, t: s.delay, dmg: base, type: s.type, fx: s.fx, cat: s.cat === 'phys' ? 'phys' : 'spec', line: { ang, len } });
        sim.emit(['fx', s.fx + '_charge', p.x, p.y - 4, round2(ang), Math.round(len), width, p.id, Math.round(s.delay * 1000)]);
      } else {
        beamHit(sim, p, s, p.x, p.y - 4, ang, len, width, base);
        sim.emit(['fx', s.fx, p.x, p.y - 4, round2(ang), Math.round(len), width, p.id]);
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'nova': {
      const rad = (s.radius ?? 60) * rm;
      let total = 0;
      for (const e of enemiesInRange(sim, p.x, p.y, rad)) {
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
        let bd = 95 * 95;
        for (const e of sim.enemies) {
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
        const pool = enemiesInRange(sim, p.x, p.y, range).filter((e) => e !== t);
        sim.rng.shuffle(pool);
        for (const e of pool) { if (targets.length >= n) break; targets.push(e); }
      }
      const rad = (s.radius ?? 30) * Math.sqrt(rm);
      for (let i = 0; i < n; i++) {
        let x: number, y: number;
        if (i < targets.length) { x = targets[i].x; y = targets[i].y; }
        else {
          // 目标不够时，多出来的打击随机落在附近，不会全部叠在同一个敌人身上
          const a = sim.rng.range(0, Math.PI * 2), d = sim.rng.range(rad * 1.6, rad * 3);
          x = t.x + Math.cos(a) * d; y = t.y + Math.sin(a) * d;
        }
        const delay = (s.delay ?? 0.3) + i * 0.08;
        sim.strikes.push({ owner: p.id, skill: s, x, y, r: rad, t: delay, dmg: base, type: s.type, fx: s.fx, cat: s.cat === 'phys' ? 'phys' : 'spec' });
        sim.emit(['fx', s.fx + '_pre', Math.round(x), Math.round(y), 0, Math.round(rad), Math.round(delay * 1000), p.id]);
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'orbit': {
      const n = s.count ?? 4;
      const rad = (s.radius ?? 40) * rm;
      for (let i = 0; i < n; i++) {
        sim.spawnProj({
          fx: s.fx, owner: p.id, skill: s, type: s.type, x: p.x, y: p.y, vx: 0, vy: 0,
          r: s.size ?? 4, dmg: base, pierce: 9999, life: s.duration ?? 4, homing: 0, crit: s.crit ?? 0,
          knock: s.knock ?? 20, status: s.status, orbit: { ang: (i / n) * TAU, rad, spd: 4.2 },
        });
      }
      sim.emitCast(p, 1);
      break;
    }
    case 'zone': {
      const rad = (s.radius ?? 30) * Math.sqrt(rm);
      sim.zones.push({
        id: sim.newId(), fx: s.fx, owner: p.id, skill: s, type: s.type, x: t.x, y: t.y, r: rad,
        life: s.duration ?? 3, maxLife: s.duration ?? 3, tick: s.tick ?? 0.5, t: 0, dmg: base,
      });
      sim.emitCast(p, 1);
      break;
    }
  }
  return true;
}

function castHeal(sim: GameSim, p: SimPlayer, s: SkillDef): boolean {
  const mult = p.line === 'bulbasaur' ? 1.3 : 1;
  const targets = s.team
    ? sim.players.filter((q) => q.alive && !q.down && Math.hypot(q.x - p.x, q.y - p.y) <= (s.radius ?? 120))
    : [p];
  if (!targets.some((q) => q.hp < q.d.maxHp * 0.75)) return false;
  for (const q of targets) healPlayer(sim, q, q.d.maxHp * (s.heal ?? 0.2) * mult);
  sim.emit(['fx', s.fx, p.x, p.y, 0, s.team ? s.radius ?? 120 : 16, 0, p.id]);
  sim.emitCast(p, 1);
  return true;
}

function recoil(p: SimPlayer, s: SkillDef, total: number) {
  if (!s.recoil || total <= 0) return;
  const r = Math.min(total * s.recoil, p.d.maxHp * 0.06);
  p.hp = Math.max(1, p.hp - r);
}

export function beamHit(sim: GameSim, p: SimPlayer | null, s: SkillDef, x: number, y: number, ang: number, len: number, width: number, dmg: number) {
  const cx = Math.cos(ang), cy = Math.sin(ang);
  for (const e of sim.enemies.slice()) {
    if (e.hp <= 0 || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * cx + dy * cy;
    if (along < -e.r || along > len + e.r) continue;
    const perp = Math.abs(-dx * cy + dy * cx);
    if (perp > width / 2 + e.r) continue;
    hitEnemy(sim, e, p, dmg, s.type, { crit: s.crit, status: s.status, knock: s.knock, kx: cx, ky: cy, skill: s });
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
