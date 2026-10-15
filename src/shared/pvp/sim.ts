/**
 * 对战模拟：在冒险模式的同一套技能/道具/数值上，让两队玩家互相攻击。
 * 每位玩家有一个"替身目标"（Enemy），对手的技能瞄准、命中替身后把伤害转给玩家本人，
 * 这样所有技能形态（弹体、光束、连锁、区域……）都不需要为对战单独实现。
 */
import type { EnemyDef } from '../enemies';
import { formOf } from '../pokemon';
import { SKILLS } from '../skills';
import { gameEffectiveness, type PType } from '../types';
import { PLAYER_R, applyStatus, healMult, healPlayer, hurtPlayer, type HitOpts } from '../sim/combat';
import type { Enemy, SimPlayer } from '../sim/entities';
import { GameSim, REVIVE_RADIUS, type Command, type PublicState } from '../sim/game';
import { createPlayerFromBuild } from '../sim/player';
import type { SavedBuild } from './build';

export type PvpMode = '1v1' | '4v4';
export const PVP_MODE_IDS: PvpMode[] = ['1v1', '4v4'];

/**
 * size：每队几位训练家；team：每位训练家派几只宝可梦上场（自己控制第一只，其余由 AI 操作）。
 * 单挑是三只对三只：比的是构筑和阵容搭配，而不是谁的手更快。revive：倒下的宝可梦能不能被队友救起。
 */
export interface PvpModeDef { id: PvpMode; name: string; desc: string; size: number; team: number; revive: boolean; w: number; h: number; dur: number; ringMin: number }
export const PVP_MODES: Record<PvpMode, PvpModeDef> = {
  '1v1': { id: '1v1', name: '单挑 1v1', desc: '三只同时上场·60秒', size: 1, team: 3, revive: false, w: 600, h: 440, dur: 60, ringMin: 90 },
  '4v4': { id: '4v4', name: '团战 4v4', desc: '每人一只·可救援·60秒', size: 4, team: 1, revive: true, w: 704, h: 528, dur: 60, ringMin: 110 },
};

export const PVP_COUNTDOWN = 3;
/** 对战伤害倍率：冒险模式的技能是按成群的野生宝可梦设计的，直接打玩家太快 */
export const PVP_DMG = 0.155;
/**
 * 承伤上限：每只宝可梦每秒最多损失最大 HP 的 CAP_RATE（可以攒 CAP_BURST 的爆发），
 * 再强的构筑也要十几秒才能打倒一只，不会开场几秒就被秒掉；缩圈结束后的加时里逐渐放开。
 */
export const CAP_RATE = 0.055;
export const CAP_BURST = 0.14;
/** 伤害随冒险波次的增长比 HP 快得多；按受击方等级缩放，让各个阶段的对局时长接近。团战会被集火，额外降低伤害 */
export const pvpDamageScale = (level: number, mode: PvpMode) => (PVP_DMG / (1 + level / 8) ** 1.35) * (mode === '4v4' ? 0.7 : 1);
/** 加时：场地缩到最小后伤害逐渐提高，到时间结束时为 2.5 倍，避免回复型构筑互相拖到超时 */
export const OVERTIME_MAX = 2.5;
/** 对战里的回复效果（再生、吸血、回复招式、寄生种子）；加时里随伤害提高继续降低 */
export const PVP_HEAL = 0.5;
/** 圈外每秒损失最大 HP 的比例 */
export const RING_DPS = 0.08;
/** 缩圈从对战时长的 25% 开始，到 70% 缩到最小，之后是加时 */
export const RING_START = 0.25;
export const RING_END = 0.7;
/** 竞技场地面（tiles.ts 的第 5 种场地） */
export const PVP_BIOME = 4;

/** owner：这只宝可梦属于哪位训练家（座位）；helper：训练家派出的第二、三只，由 AI 操作 */
export interface PvpInit { id: number; name: string; team: number; build: SavedBuild; meta: Record<string, number>; trainer?: string; bot?: boolean; owner?: number; helper?: boolean }

export interface PvpPublic {
  mode: PvpMode;
  countdown: number;
  ring: { x: number; y: number; r: number; shrinking: boolean };
  alive: [number, number];
  kos: [number, number];
}

export interface PvpPlayerResult {
  id: number; name: string; team: number; bot: boolean; trainer: string; owner: number; helper: boolean;
  line: SavedBuild['line']; dex: number; shiny?: boolean; form: string; level: number;
  damage: number; taken: number; healed: number; kos: number; deaths: number; revives: number; crits: number; dodges: number; superEff: number;
  hp: number; maxHp: number; alive: boolean;
  skillDmg: [string, number][];
  skills: { id: string; lv: number }[];
  items: [string, number][];
}

export interface PvpMatchResult {
  mode: PvpMode;
  /** 获胜的队伍；-1 为平局 */
  winner: number;
  reason: 'ko' | 'time';
  time: number;
  players: PvpPlayerResult[];
  /** 每秒记录一次两队剩余 HP 百分比与累计伤害 */
  timeline: { t: number; hp: [number, number]; dmg: [number, number] }[];
  /** 击倒记录：[时间, 击倒者 id（-1 为缩圈）, 倒下者 id] */
  feed: [number, number, number][];
}

interface BotMem { strafe: number; flipT: number; pref: number; wander: number }

const ccFree = { burn: 0, burnDps: 0, burnSrc: -1, poison: 0, poisonDps: 0, poisonSrc: -1, leech: 0, leechDps: 0, leechSrc: -1, leechHeal: 0, para: 0, slow: 0, slowAmt: 0, freeze: 0, stun: 0, dotAcc: 0 };

export class PvpSim extends GameSim {
  readonly mode: PvpMode;
  readonly def: PvpModeDef;
  countdown = PVP_COUNTDOWN;
  matchT = 0;
  winner: number | null = null;
  reason: 'ko' | 'time' = 'ko';
  timeline: PvpMatchResult['timeline'] = [];
  feed: PvpMatchResult['feed'] = [];
  ring: { x: number; y: number; r: number; r0: number; t0: number; t1: number };
  private byId = new Map<number, SimPlayer>();
  private proxies = new Map<number, Enemy>();
  private teamProxies: [Enemy[], Enemy[]] = [[], []];
  private lastBy = new Map<number, { id: number; t: number }>();
  private ringAcc = 0;
  private logAcc = 0;
  private ringWarned = false;
  private overtimeWarned = false;
  private bots = new Map<number, BotMem>();
  /** 每只宝可梦还能承受多少伤害（承伤上限） */
  private hpBudget = new Map<number, number>();
  private owners = new Map<number, { owner: number; helper: boolean }>();

  constructor(mode: PvpMode, inits: PvpInit[], seed: number) {
    super([], seed, 'easy', false);
    this.mode = mode;
    this.def = PVP_MODES[mode];
    this.w = this.def.w;
    this.h = this.def.h;
    this.waveDur = this.def.dur;
    // 反伤这类随波次成长的效果按第 10 波计算
    this.wave = 10;
    this.reviveSpeed = 0.7;
    this.phase = 'inter';
    const r0 = Math.hypot(this.w, this.h) / 2 + 12;
    this.ring = { x: this.w / 2, y: this.h / 2, r: r0, r0, t0: this.def.dur * RING_START, t1: this.def.dur * RING_END };
    for (const i of inits) {
      const p = createPlayerFromBuild(this, i.id, i.name, i.build, i.meta, i.trainer);
      p.team = i.team ? 1 : 0;
      p.bot = !!i.bot || !!i.helper;
      this.owners.set(p.id, { owner: i.owner ?? i.id, helper: !!i.helper });
      this.hpBudget.set(p.id, p.d.maxHp * CAP_BURST);
      p.money = 0;
      p.invuln = 0;
      this.players.push(p);
      this.byId.set(p.id, p);
      const form = formOf(p.line, p.stage);
      const def: EnemyDef = { id: 'pvp', dex: form.dex, name: p.name, types: form.types, hp: 1, dmg: 0, speed: 0, r: PLAYER_R + 1, ai: 'chase', rank: 'elite', candy: 0, knockResist: 1 };
      const e: Enemy = {
        id: this.newId(), def, kind: 0, x: p.x, y: p.y, vx: 0, vy: 0, hp: p.hp, maxHp: p.d.maxHp, dmg: 0, speed: 0, r: def.r,
        st: { ...ccFree }, ai: { state: 0, t: 0, cd: 0, cd2: 0, tx: 0, ty: 0, ax: 0, ay: 0, n: 0, flag: 0 },
        dir: 0, hidden: false, lastHit: -1, age: 0, pvp: p,
      };
      this.proxies.set(p.id, e);
      this.teamProxies[p.team].push(e);
      if (p.bot) this.initBot(p);
    }
    this.place();
    this.syncProxies();
    this.emit(['msg', `${this.def.name} · 对战即将开始！`]);
  }

  private place() {
    for (const team of [0, 1]) {
      const ps = this.players.filter((p) => p.team === team);
      // 三只同时上场：训练家自己操作的那只站中间
      if (ps.length === 3 && !this.ownerOf(ps[0].id).helper) ps.splice(1, 0, ps.shift()!);
      ps.forEach((p, i) => {
        const n = ps.length;
        p.x = team === 0 ? this.w * 0.18 : this.w * 0.82;
        p.y = n === 1 ? this.h / 2 : this.h * (0.2 + (0.6 * i) / (n - 1));
        p.dir = team === 0 ? 0 : Math.PI;
        for (const [j, s] of p.skills.entries()) s.cd = 0.3 + j * 0.2 + this.rng.range(0, 0.2);
      });
    }
  }

  // ------------------------------------------------------------ 队伍

  override targetsFor(owner: number): Enemy[] {
    const p = this.byId.get(owner);
    return p ? this.teamProxies[1 - p.team] : [];
  }

  override isAlly(p: SimPlayer, q: SimPlayer) { return p.team === q.team; }

  /** 倒下的玩家附近有敌人时，救援会被打断；单挑倒下就是退场 */
  override reviveBlocked(p: SimPlayer) {
    return !this.def.revive || this.players.some((q) => q.team !== p.team && q.alive && !q.down && Math.hypot(q.x - p.x, q.y - p.y) < REVIVE_RADIUS + 8);
  }

  proxyOf(id: number) { return this.proxies.get(id); }

  /** 这只宝可梦属于哪位训练家（座位编号），是不是训练家派出的 AI 帮手 */
  ownerOf(id: number) { return this.owners.get(id) ?? { owner: id, helper: false }; }

  override pvpHit(e: Enemy, p: SimPlayer | null, raw: number, type: PType, o: HitOpts): number {
    const t = e.pvp;
    if (!t || !t.alive || t.down || this.phase !== 'wave') return 0;
    if (p && p.team === t.team) return 0;
    let dmg = raw;
    let flags = 0;
    if (!o.noEff) {
      const eff = gameEffectiveness(type, formOf(t.line, t.stage).types);
      dmg *= eff;
      if (eff > 1) {
        flags |= 2;
        if (p) { dmg *= p.d.superEffMult; p.stats.superEff++; }
      } else if (eff < 1) flags |= 4;
    }
    if (p && !o.dot && this.rng.chance(p.d.crit + (o.crit ?? 0) / 100)) { dmg *= 1.5; flags |= 1; p.stats.crits++; }
    if (o.dot) flags |= 8;
    dmg *= pvpDamageScale(t.level, this.mode) * this.overtime();
    const cat = o.skill?.cat === 'phys' ? 'phys' : 'spec';
    // 只有近身的物理招式会触发对方的反伤与静电
    const contact = p && !o.noEff && cat === 'phys' ? this.proxies.get(p.id) : undefined;
    const dealt = this.hurt(t, dmg, cat, contact, { flags, by: p?.id ?? -1, dot: o.dot });
    if (p && dealt > 0) {
      this.credit(p, t, dealt, o.dot ? '_dot' : o.skill?.id ?? '_other');
      if (!o.dot && p.d.lifesteal > 0 && this.rng.chance(p.d.lifesteal)) healPlayer(this, p, 1, true);
      if (!o.dot && p.d.stun > 0 && this.rng.chance(p.d.stun)) applyStatus(e, { kind: 'stun', chance: 1, dur: 0.5 }, dealt, p.id);
    }
    if (o.status && dealt > 0 && this.rng.chance(o.status.chance)) {
      const s = t.items.safety_goggles && o.status.kind !== 'burn' && o.status.kind !== 'poison' && o.status.kind !== 'leech'
        ? { ...o.status, dur: (o.status.dur ?? 2) * 0.5 } : o.status;
      applyStatus(e, s, dealt, p?.id ?? -1, o.heal);
    }
    return dealt;
  }

  overtime() {
    const R = this.ring;
    if (this.matchT <= R.t1) return 1;
    return 1 + (OVERTIME_MAX - 1) * Math.min(1, (this.matchT - R.t1) / (this.def.dur - R.t1));
  }

  /** 对战里所有伤害都经过这里：受承伤上限约束 */
  private hurt(t: SimPlayer, raw: number, cat: 'phys' | 'spec', contact: Enemy | undefined, o: { flags: number; by: number; dot?: boolean }) {
    const room = this.hpBudget.get(t.id) ?? 0;
    const dealt = hurtPlayer(this, t, raw, cat, contact, { pvp: true, flags: o.flags, by: o.by, dot: o.dot, cap: room });
    this.hpBudget.set(t.id, Math.max(0, room - dealt));
    return dealt;
  }

  /** 承伤上限每秒恢复；加时里放开得越来越快，保证比赛能在时限内分出胜负 */
  private refillBudget(dt: number) {
    const k = this.overtime() ** 1.6;
    for (const p of this.players) {
      if (!p.alive || p.down) continue;
      const max = p.d.maxHp * CAP_BURST * k;
      this.hpBudget.set(p.id, Math.min(max, (this.hpBudget.get(p.id) ?? 0) + p.d.maxHp * CAP_RATE * k * dt));
    }
  }

  /** 自动战斗：交给 AI 操作（玩家随时可以切回手动）；训练家派出的帮手一直由 AI 操作 */
  override setAuto(id: number, on: boolean) {
    const p = this.byId.get(id);
    if (!p || this.owners.get(id)?.helper || p.bot === on) return;
    p.bot = on;
    if (on) this.initBot(p);
    else p.moving = false;
    this.dirty.add(id);
  }

  private credit(p: SimPlayer, t: SimPlayer, dealt: number, key: string) {
    p.stats.damage += dealt;
    p.stats.skillDmg[key] = (p.stats.skillDmg[key] ?? 0) + dealt;
    this.lastBy.set(t.id, { id: p.id, t: this.matchT });
  }

  override downPlayer(p: SimPlayer) {
    super.downPlayer(p);
    p.stats.deaths++;
    const last = this.lastBy.get(p.id);
    const k = last && this.matchT - last.t < 8 ? this.byId.get(last.id) : undefined;
    if (k && k.team !== p.team) k.stats.kos++;
    const e = this.proxies.get(p.id);
    if (e) Object.assign(e.st, ccFree);
    this.feed.push([Math.round(this.matchT * 10) / 10, k?.id ?? -1, p.id]);
    this.emit(['ko', k?.id ?? -1, p.id]);
  }

  // ------------------------------------------------------------ 主循环

  override step(dt: number) {
    this.time += dt;
    if (this.phase === 'inter') {
      this.countdown -= dt;
      this.syncProxies();
      if (this.countdown <= 0) {
        this.phase = 'wave';
        this.countdown = 0;
        this.emit(['msg', '对战开始！']);
        this.log();
      }
      return;
    }
    if (this.phase !== 'wave') return;
    this.matchT += dt;
    this.waveT = this.matchT;
    this.healScale = PVP_HEAL / this.overtime();
    this.refillBudget(dt);
    for (const p of this.players) {
      if (p.bot) this.updateBot(p, dt);
      this.updateStatus(p, dt);
      this.updatePlayer(p, dt);
    }
    this.syncProxies();
    this.updateProjs(dt);
    this.updateZones(dt);
    this.updateStrikes(dt);
    this.updateRing(dt);
    this.logAcc += dt;
    if (this.logAcc >= 1) { this.logAcc -= 1; this.log(); }
    this.checkEnd();
  }

  private syncProxies() {
    for (const p of this.players) {
      const e = this.proxies.get(p.id)!;
      const on = p.alive && !p.down;
      e.x = p.x;
      e.y = p.y;
      e.hidden = !on;
      e.hp = on ? Math.max(1, p.hp) : 0;
      e.maxHp = p.d.maxHp;
    }
  }

  /** 替身身上的异常状态作用到玩家本人：灼伤/中毒/寄生掉血，麻痹/减速/冰冻/畏缩影响移动和技能冷却 */
  private updateStatus(p: SimPlayer, dt: number) {
    const e = this.proxies.get(p.id)!;
    const st = e.st;
    if (!p.alive || p.down) return;
    st.para = Math.max(0, st.para - dt);
    st.slow = Math.max(0, st.slow - dt);
    st.freeze = Math.max(0, st.freeze - dt);
    st.stun = Math.max(0, st.stun - dt);
    if (st.slow <= 0) st.slowAmt = 0;
    const rooted = st.freeze > 0 || st.stun > 0;
    let slow = 0;
    if (st.para > 0) slow = 0.3;
    if (st.slow > 0) slow = Math.max(slow, st.slowAmt);
    if (rooted) slow = Math.max(slow, 0.7);
    if (slow > 0) {
      p.slowT = Math.max(p.slowT, 0.12);
      p.slowAmt = slow;
      this.dirty.add(p.id);
    }
    // 冰冻/畏缩时技能冷却暂停，麻痹时变慢（updateSkills 会再减去 dt）
    const tick = rooted ? 0 : st.para > 0 ? 0.75 : 1;
    if (tick < 1) for (const s of p.skills) s.cd += dt * (1 - tick);
    if (st.burn > 0 || st.poison > 0 || st.leech > 0) {
      st.dotAcc += dt;
      if (st.dotAcc >= 0.5) {
        st.dotAcc -= 0.5;
        const parts: [number, number][] = [];
        if (st.burn > 0) { st.burn -= 0.5; parts.push([st.burnDps * 0.5, st.burnSrc]); }
        if (st.poison > 0) { st.poison -= 0.5; parts.push([st.poisonDps * 0.5, st.poisonSrc]); }
        if (st.leech > 0) {
          st.leech -= 0.5;
          parts.push([st.leechDps * 0.5, st.leechSrc]);
          const src = this.byId.get(st.leechSrc);
          if (src) healPlayer(this, src, st.leechDps * 0.5 * st.leechHeal * healMult(src), true);
        }
        for (const [d, sid] of parts) {
          if (p.down || d <= 0) continue;
          const src = this.byId.get(sid);
          const dealt = this.hurt(p, d, 'spec', undefined, { dot: true, flags: 8, by: sid });
          if (src && dealt > 0) this.credit(src, p, dealt, '_dot');
        }
        if (st.burn <= 0) st.burnDps = 0;
        if (st.poison <= 0) st.poisonDps = 0;
      }
    }
  }

  private updateRing(dt: number) {
    const R = this.ring;
    const k = Math.max(0, Math.min(1, (this.matchT - R.t0) / (R.t1 - R.t0)));
    R.r = R.r0 + (this.def.ringMin - R.r0) * k;
    if (!this.ringWarned && this.matchT >= R.t0 - 5) {
      this.ringWarned = true;
      this.emit(['msg', '5 秒后场地开始缩小！留在圈内！']);
    }
    if (!this.overtimeWarned && this.matchT > R.t1) {
      this.overtimeWarned = true;
      this.emit(['msg', '加时！伤害逐渐提高！']);
    }
    this.ringAcc += dt;
    if (this.ringAcc < 0.5) return;
    this.ringAcc -= 0.5;
    for (const p of this.players) {
      if (!p.alive || p.down || Math.hypot(p.x - R.x, p.y - R.y) <= R.r) continue;
      const dmg = Math.max(1, Math.round(p.d.maxHp * RING_DPS * 0.5));
      p.hp -= dmg;
      p.stats.taken += dmg;
      this.emit(['ph', p.id, dmg, 0, 16, -1]);
      if (p.hp <= 0) {
        this.lastBy.delete(p.id);
        this.downPlayer(p);
      }
      this.dirty.add(p.id);
    }
  }

  private teamHp(team: number) {
    let hp = 0, max = 0;
    for (const p of this.players) {
      if (p.team !== team) continue;
      max += p.d.maxHp;
      if (p.alive && !p.down) hp += Math.max(0, p.hp);
    }
    return max ? hp / max : 0;
  }

  private log() {
    const dmg: [number, number] = [0, 0];
    for (const p of this.players) dmg[p.team] += p.stats.damage;
    this.timeline.push({ t: Math.round(this.matchT), hp: [Math.round(this.teamHp(0) * 100), Math.round(this.teamHp(1) * 100)], dmg: [Math.round(dmg[0]), Math.round(dmg[1])] });
  }

  aliveCount(team: number) {
    return this.players.filter((p) => p.team === team && p.alive && !p.down).length;
  }

  private checkEnd() {
    const a = this.aliveCount(0), b = this.aliveCount(1);
    if (a === 0 || b === 0) {
      this.finish(a === b ? -1 : a > 0 ? 0 : 1, 'ko');
    } else if (this.matchT >= this.def.dur) {
      let w = a === b ? -1 : a > b ? 0 : 1;
      if (w < 0) {
        const ha = this.teamHp(0), hb = this.teamHp(1);
        if (Math.abs(ha - hb) > 0.01) w = ha > hb ? 0 : 1;
      }
      this.finish(w, 'time');
    }
  }

  private finish(winner: number, reason: 'ko' | 'time') {
    this.winner = winner;
    this.reason = reason;
    this.phase = 'over';
    this.log();
    this.emit(['msg', winner < 0 ? '平局！' : reason === 'time' ? '时间到！' : '对战结束！']);
  }

  /** 玩家断线：交给 AI 继续操作，保证对局能打完 */
  setBot(id: number) {
    const p = this.byId.get(id);
    if (!p || p.bot) return;
    p.bot = true;
    this.initBot(p);
  }

  override setPlayerPos(id: number, x: number, y: number, moving: boolean, dir: number) {
    if (this.byId.get(id)?.bot) return;
    super.setPlayerPos(id, x, y, moving, dir);
  }

  override command(_id: number, _c: Command): string | null { return '对战中不能使用商店'; }

  override removePlayer(id: number) { this.setBot(id); }

  // ------------------------------------------------------------ AI 训练家

  private initBot(p: SimPlayer) {
    const ranges: number[] = [];
    for (const s of p.skills) {
      const d = SKILLS[s.id];
      if (!d || d.cat === 'status' || d.pattern === 'heal' || d.pattern === 'shield' || d.pattern === 'buff') continue;
      const r = d.pattern === 'melee' || d.pattern === 'nova' || d.pattern === 'orbit' ? (d.radius ?? 34) * p.d.rangeMult : d.range * p.d.rangeMult;
      ranges.push(r);
    }
    ranges.sort((a, b) => a - b);
    const close = ranges.filter((r) => r < 90).length;
    const pref = !ranges.length ? 80 : close * 2 >= ranges.length ? Math.max(16, ranges[0] * 0.6) : Math.min(150, ranges[Math.floor(ranges.length / 2)] * 0.7);
    this.bots.set(p.id, { strafe: this.rng.chance(0.5) ? 1 : -1, flipT: this.rng.range(1, 2.5), pref, wander: this.rng.range(0, Math.PI * 2) });
  }

  private updateBot(p: SimPlayer, dt: number) {
    const m = this.bots.get(p.id);
    if (!m || !p.alive || p.down) { p.moving = false; return; }
    m.flipT -= dt;
    if (m.flipT <= 0) { m.flipT = this.rng.range(1, 2.8); m.strafe = -m.strafe; }
    let vx = 0, vy = 0;
    let foe: SimPlayer | null = null, fd = Infinity;
    for (const q of this.players) {
      if (q.team === p.team || !q.alive || q.down) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < fd) { fd = d; foe = q; }
    }
    // 救援倒下的队友（附近没有敌人时）
    let rescue: SimPlayer | null = null, rd = Infinity;
    for (const q of this.players) {
      if (!this.def.revive || q === p || q.team !== p.team || !q.down || !q.alive) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < rd) { rd = d; rescue = q; }
    }
    const lowHp = p.hp < p.d.maxHp * 0.3;
    if (rescue && (p.hp > p.d.maxHp * 0.35 || rd < 120)) {
      if (rd > REVIVE_RADIUS * 0.5) { vx += ((rescue.x - p.x) / rd) * 1.4; vy += ((rescue.y - p.y) / rd) * 1.4; }
    } else if (foe) {
      const dx = (foe.x - p.x) / fd, dy = (foe.y - p.y) / fd;
      const pref = lowHp ? m.pref * 1.4 + 20 : m.pref;
      const want = Math.max(-1, Math.min(1, (fd - pref) / 30));
      vx += dx * want - dy * m.strafe * 0.55;
      vy += dy * want + dx * m.strafe * 0.55;
    } else {
      m.wander += this.rng.range(-1, 1) * dt;
      vx += Math.cos(m.wander) * 0.3;
      vy += Math.sin(m.wander) * 0.3;
    }
    // 躲避飞来的弹体与即将落下的打击
    for (const pr of this.projs) {
      if (pr.owner < 0 || pr.orbit) continue;
      const o = this.byId.get(pr.owner);
      if (!o || o.team === p.team) continue;
      const rx = p.x - pr.x, ry = p.y - 6 - pr.y;
      const d2 = rx * rx + ry * ry;
      if (d2 > 70 * 70) continue;
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      if ((pr.vx * rx + pr.vy * ry) / sp < 0) continue;
      const cross = (pr.vx * ry - pr.vy * rx) / sp;
      const side = cross >= 0 ? 1 : -1;
      const w = 0.9 * (1 - Math.sqrt(d2) / 70);
      vx += (-pr.vy / sp) * side * w;
      vy += (pr.vx / sp) * side * w;
    }
    for (const s of this.strikes) {
      const o = this.byId.get(s.owner);
      if (!o || o.team === p.team || s.line) continue;
      const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < s.r + 14) { vx += (dx / d) * 1.5; vy += (dy / d) * 1.5; }
    }
    for (const z of this.zones) {
      const o = this.byId.get(z.owner);
      if (!o || o.team === p.team) continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (d < z.r + 10) { vx += (dx / d) * 1.1; vy += (dy / d) * 1.1; }
    }
    // 留在圈内、远离墙边
    const R = this.ring;
    const cd = Math.hypot(p.x - R.x, p.y - R.y);
    if (cd > R.r - 26 && cd > 1) { const k = cd > R.r ? 2.5 : 1.2; vx += ((R.x - p.x) / cd) * k; vy += ((R.y - p.y) / cd) * k; }
    const edge = 26;
    if (p.x < edge) vx += 0.8; else if (p.x > this.w - edge) vx -= 0.8;
    if (p.y < edge + 6) vy += 0.8; else if (p.y > this.h - edge) vy -= 0.8;
    const mag = Math.hypot(vx, vy);
    if (mag < 0.12) { p.moving = false; return; }
    const step = this.moveSpeed(p) * dt * Math.min(1, mag);
    p.x = Math.max(8, Math.min(this.w - 8, p.x + (vx / mag) * step));
    p.y = Math.max(14, Math.min(this.h - 6, p.y + (vy / mag) * step));
    p.dir = Math.atan2(vy, vx);
    p.moving = true;
  }

  // ------------------------------------------------------------ 状态导出

  override publicState(): PublicState {
    const s = super.publicState();
    return {
      ...s,
      biome: PVP_BIOME,
      wave: 0,
      total: 0,
      time: Math.round(this.matchT * 10) / 10,
      dur: this.def.dur,
      interLeft: -1,
      boss: null,
      players: s.players.map((x) => ({ ...x, team: this.byId.get(x.id)?.team ?? 0, bot: !!this.byId.get(x.id)?.bot, kills: this.byId.get(x.id)?.stats.kos ?? 0 })),
      pvp: {
        mode: this.mode,
        countdown: Math.ceil(this.countdown),
        ring: { x: Math.round(this.ring.x), y: Math.round(this.ring.y), r: Math.round(this.ring.r), shrinking: this.matchT >= this.ring.t0 && this.matchT < this.ring.t1 },
        alive: [this.aliveCount(0), this.aliveCount(1)],
        kos: [0, 1].map((t) => this.players.filter((p) => p.team === t).reduce((a, p) => a + p.stats.kos, 0)) as [number, number],
      },
    };
  }

  result(): PvpMatchResult {
    return {
      mode: this.mode,
      winner: this.winner ?? -1,
      reason: this.reason,
      time: Math.round(this.matchT),
      players: this.players.map((p) => {
        const form = formOf(p.line, p.stage);
        return {
          id: p.id, name: p.name, team: p.team, bot: p.bot, trainer: p.trainer, line: p.line, dex: form.dex, shiny: p.shiny || undefined, form: form.name, level: p.level,
          ...this.ownerOf(p.id),
          damage: Math.round(p.stats.damage), taken: Math.round(p.stats.taken), healed: Math.round(p.stats.healed),
          kos: p.stats.kos, deaths: p.stats.deaths, revives: p.stats.revives, crits: p.stats.crits, dodges: p.stats.dodges, superEff: p.stats.superEff,
          hp: Math.max(0, Math.ceil(p.hp)), maxHp: p.d.maxHp, alive: p.alive && !p.down,
          skillDmg: Object.entries(p.stats.skillDmg).map(([k, v]) => [k, Math.round(v)] as [string, number]).sort((a, b) => b[1] - a[1]),
          skills: p.skills.map((s) => ({ id: s.id, lv: s.lv })),
          items: Object.entries(p.items).filter(([, n]) => n > 0),
        };
      }),
      timeline: this.timeline,
      feed: this.feed,
    };
  }
}