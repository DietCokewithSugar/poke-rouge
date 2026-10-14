import { ENEMIES, ENEMY_INDEX } from '../enemies';
import { ITEMS } from '../items';
import type { RunSummary } from '../meta';
import { LINES, formOf, type LineId } from '../pokemon';
import { Rng } from '../rng';
import { SKILLS } from '../skills';
import { TOTAL_WAVES, WAVES, enemyDmgMult, enemyHpMult, spawnRateMult, waveDuration } from '../waves';
import { updateEnemy } from './ai';
import { PLAYER_R, beamHit, healPlayer, hitEnemy, hurtPlayer, updateSkills } from './combat';
import type { Enemy, LevelCard, PendingSpawn, Pickup, Proj, ShopOffer, SimPlayer, Strike, Zone } from './entities';
import {
  addXp, cardRerollCost, crateSellValue, createPlayer, forgetSkill, nextCards, pickCard, recompute, rerollCards,
  rerollCost, resolveCrate, rollCrateItem, rollShop, shopBuy, shopLock, shopReroll, xpToNext,
} from './player';

export const ARENA_W = 768;
export const ARENA_H = 576;
export const TICK_RATE = 30;
export const INTERMISSION_TIMEOUT = 150;

export type SimPhase = 'wave' | 'inter' | 'over' | 'won';
export type Ev = (string | number | number[])[];

export interface PlayerInit { id: number; name: string; line: LineId; meta: Record<string, number> }

export type Command =
  | { t: 'level'; i: number; slot?: number }
  | { t: 'levelReroll' }
  | { t: 'buy'; i: number; slot?: number }
  | { t: 'reroll' }
  | { t: 'lock'; i: number }
  | { t: 'forget'; slot: number }
  | { t: 'crate'; take: boolean }
  | { t: 'waveReady'; on: boolean };

export interface MeState {
  id: number;
  line: LineId;
  stage: number;
  dex: number;
  form: string;
  level: number;
  xp: number;
  xpNext: number;
  money: number;
  hp: number;
  maxHp: number;
  speed: number;
  down: boolean;
  slots: number;
  skills: { id: string; lv: number; cd: number; max: number }[];
  items: [string, number][];
  stats: Record<string, number>;
  cards: LevelCard[] | null;
  cardRerollCost: number;
  levelsPending: number;
  crate: string | null;
  crateSell: number;
  cratesLeft: number;
  shop: { offers: (ShopOffer | null)[]; locked: boolean[]; rerollCost: number };
  ready: boolean;
  typeMods: Record<string, number>;
}

export interface PublicState {
  phase: SimPhase;
  wave: number;
  total: number;
  time: number;
  dur: number;
  biome: number;
  interLeft: number;
  boss: { name: string; hp: number; max: number } | null;
  players: { id: number; name: string; line: LineId; dex: number; level: number; hp: number; maxHp: number; down: boolean; ready: boolean; kills: number }[];
}

export class GameSim {
  readonly w = ARENA_W;
  readonly h = ARENA_H;
  rng: Rng;
  time = 0;
  phase: SimPhase = 'inter';
  wave = 0;
  waveT = 0;
  waveDur = 60;
  interT = 0;
  players: SimPlayer[] = [];
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  zones: Zone[] = [];
  strikes: Strike[] = [];
  pickups: Pickup[] = [];
  pending: PendingSpawn[] = [];
  boss: Enemy | null = null;
  bossKills: string[] = [];
  /** 每位玩家的私有状态是否需要重发 */
  dirty = new Set<number>();
  private events: Ev[] = [];
  private hits = new Map<number, { x: number; y: number; dmg: number; flags: number }>();
  private idSeq = 1;
  private spawnAcc = 0;
  private elitesDone = 0;
  private treasureAt = -1;
  private bossSpawned = false;
  private bossDown = false;
  private enraged = false;
  private readonly startPlayers: number;

  constructor(inits: PlayerInit[], seed: number) {
    this.rng = new Rng(seed);
    for (const i of inits) this.players.push(createPlayer(this, i.id, i.name, i.line, i.meta));
    this.startPlayers = inits.length;
    this.startWave();
  }

  // ------------------------------------------------------------ 工具

  newId() { this.idSeq = (this.idSeq + 1) & 0xffff || 1; return this.idSeq; }
  emit(ev: Ev) { this.events.push(ev); }
  emitCast(p: SimPlayer, anim: number) { this.emit(['cast', p.id, anim]); }
  recompute(p: SimPlayer) { recompute(p); this.dirty.add(p.id); }

  addHit(e: Enemy, dmg: number, flags: number) {
    const h = this.hits.get(e.id);
    if (h) { h.dmg += dmg; h.flags |= flags; h.x = e.x; h.y = e.y; }
    else this.hits.set(e.id, { x: e.x, y: e.y, dmg, flags });
  }

  flushEvents(): Ev[] {
    const out = this.events;
    for (const [id, h] of this.hits) out.push(['h', id, Math.round(h.x), Math.round(h.y), h.dmg, h.flags]);
    this.hits.clear();
    this.events = [];
    return out;
  }

  activePlayers() { return this.players.filter((p) => p.alive && !p.down); }

  nearestPlayer(x: number, y: number): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (!p.alive || p.down) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pressureAt(x: number, y: number) {
    for (const p of this.players) {
      if (p.line === 'mewtwo' && p.alive && !p.down && (p.x - x) ** 2 + (p.y - y) ** 2 < 90 * 90) return true;
    }
    return false;
  }

  spawnProj(p: Omit<Proj, 'id' | 'hit'>) {
    if (this.projs.length > 900) return;
    this.projs.push({ ...p, id: this.newId(), hit: new Set() });
  }

  queueSpawn(id: string, x: number, y: number, delay = 1) {
    x = Math.max(20, Math.min(this.w - 20, x));
    y = Math.max(26, Math.min(this.h - 20, y));
    this.pending.push({ t: delay, id, x, y });
    this.emit(['mark', Math.round(x), Math.round(y)]);
  }

  spawnEnemy(id: string, x: number, y: number): Enemy {
    const def = ENEMIES[id];
    const n = this.players.length;
    const hpMult = enemyHpMult(this.wave) * (def.rank === 'boss' ? 1 + 0.75 * (n - 1) : def.rank === 'elite' ? 1 + 0.5 * (n - 1) : 1 + 0.25 * (n - 1));
    const hp = Math.round(def.hp * hpMult);
    const e: Enemy = {
      id: this.newId(), def, kind: ENEMY_INDEX[id], x, y, vx: 0, vy: 0, hp, maxHp: hp,
      dmg: def.dmg * enemyDmgMult(this.wave), speed: def.speed * (1 + Math.min(0.25, this.wave * 0.012)), r: def.r,
      st: { burn: 0, burnDps: 0, burnSrc: -1, poison: 0, poisonDps: 0, poisonSrc: -1, leech: 0, leechDps: 0, leechSrc: -1, leechHeal: 0, para: 0, slow: 0, slowAmt: 0, freeze: 0, stun: 0, dotAcc: 0 },
      ai: { state: 0, t: 0, cd: this.rng.range(0.6, 1.8), cd2: this.rng.range(1.5, 3), tx: 0, ty: 0, ax: 0, ay: 0, n: 0, flag: 0 },
      dir: Math.PI / 2, hidden: false, lastHit: -1, age: 0,
    };
    this.enemies.push(e);
    if (def.rank === 'boss') {
      this.boss = e;
      this.emit(['boss', e.id, def.name]);
    }
    return e;
  }

  killEnemy(e: Enemy, killer: SimPlayer | null, silent = false) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.emit(['die', e.id, Math.round(e.x), Math.round(e.y), e.kind]);
    const credit = killer ?? this.players.find((p) => p.id === e.lastHit) ?? null;
    if (credit) credit.stats.kills++;
    if (e.def.rank === 'boss') {
      this.bossDown = true;
      this.bossKills.push(e.def.id);
      for (const p of this.players) p.stats.bossKills.push(e.def.id);
      this.emit(['msg', `${e.def.name}被打倒了！`]);
      if (this.boss === e) this.boss = null;
    }
    if (silent && e.def.ai === 'bomber') {
      this.dropCandy(e.x, e.y, Math.max(1, Math.floor(e.def.candy / 2)));
      return;
    }
    this.dropCandy(e.x, e.y, e.def.candy);
    const luck = 1 + Math.max(0, this.players.reduce((a, p) => a + p.d.luck, 0) / Math.max(1, this.players.length)) / 100;
    if (e.def.rank !== 'minion' || this.rng.chance(0.004 * luck)) this.dropPickup('ball', e.x + this.rng.range(-8, 8), e.y + this.rng.range(-8, 8), 1);
    if (e.def.id === 'chansey' || this.rng.chance(0.012 * luck)) this.dropPickup('berry', e.x + this.rng.range(-6, 6), e.y + this.rng.range(-6, 6), 1);
  }

  private dropCandy(x: number, y: number, value: number) {
    const pieces = Math.min(value, value > 20 ? 10 : 5);
    const each = value / pieces;
    for (let i = 0; i < pieces; i++) {
      const a = this.rng.range(0, Math.PI * 2), r = pieces > 1 ? this.rng.range(3, 6 + pieces * 2) : 0;
      this.dropPickup('candy', x + Math.cos(a) * r, y + Math.sin(a) * r, each);
    }
  }

  private dropPickup(kind: Pickup['kind'], x: number, y: number, value: number) {
    if (this.pickups.length > 600) {
      // 掉落物太多时合并到最老的糖果上，避免无限增长
      const old = this.pickups.find((p) => p.kind === 'candy');
      if (old && kind === 'candy') { old.value += value; return; }
    }
    const p: Pickup = { id: this.newId(), kind, x: Math.max(8, Math.min(this.w - 8, x)), y: Math.max(12, Math.min(this.h - 8, y)), value };
    this.pickups.push(p);
    this.emit(['drop', p.id, kind === 'candy' ? 0 : kind === 'berry' ? 1 : 2, Math.round(p.x), Math.round(p.y), Math.round(value * 10) / 10]);
  }

  downPlayer(p: SimPlayer) {
    p.down = true;
    p.hp = 0;
    p.revive = 0;
    p.downT = 0;
    p.shield = 0;
    this.emit(['down', p.id]);
    this.dirty.add(p.id);
  }

  // ------------------------------------------------------------ 波次

  private startWave() {
    this.wave++;
    this.phase = 'wave';
    this.waveT = 0;
    this.waveDur = waveDuration(this.wave);
    this.spawnAcc = 0;
    this.elitesDone = 0;
    this.bossSpawned = false;
    this.bossDown = false;
    this.enraged = false;
    this.enemies = [];
    this.projs = [];
    this.zones = [];
    this.strikes = [];
    this.pending = [];
    this.boss = null;
    const W = WAVES[this.wave - 1];
    this.treasureAt = -1;
    if (W.treasure) {
      const luck = this.players.reduce((a, p) => a + p.d.luck, 0) / this.players.length;
      if (this.rng.chance(W.treasure.chance * (1 + Math.max(0, luck) / 100))) this.treasureAt = this.rng.range(0.25, 0.7) * this.waveDur;
    }
    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.down = false;
      p.alive = true;
      p.revive = 0;
      p.hp = p.d.maxHp;
      p.invuln = 1.5;
      p.shield = 0;
      p.buffT = 0;
      p.slowT = 0;
      p.sashUsed = false;
      p.ready = false;
      p.cards = null;
      for (const s of p.skills) s.cd = 0.4 + i * 0.05;
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      p.x = this.w / 2 + (n > 1 ? Math.cos(a) * 36 : 0);
      p.y = this.h / 2 + (n > 1 ? Math.sin(a) * 36 : 0);
      recompute(p);
      this.dirty.add(p.id);
    });
    this.emit(['wave', this.wave, this.waveDur, W.biome]);
  }

  private endWave() {
    const victory = this.wave >= TOTAL_WAVES;
    for (const e of this.enemies) this.emit(['die', e.id, Math.round(e.x), Math.round(e.y), e.kind]);
    if (this.boss && !this.boss.dead) this.emit(['msg', `${this.boss.def.name}逃走了……`]);
    this.enemies = [];
    this.projs = [];
    this.zones = [];
    this.strikes = [];
    this.pending = [];
    this.boss = null;
    // 场上剩余掉落物自动归最近的玩家
    for (const pk of this.pickups) {
      let best = this.players[0], bd = Infinity;
      for (const p of this.players) {
        const d = (p.x - pk.x) ** 2 + (p.y - pk.y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) this.collect(best, pk, false);
    }
    this.pickups = [];
    this.emit(['clrp']);
    if (victory) {
      this.phase = 'won';
      this.emit(['msg', '恭喜通关！你们是真正的宝可梦大师！']);
      return;
    }
    this.phase = 'inter';
    this.interT = 0;
    this.emit(['msg', `第 ${this.wave} 波 完成！`]);
    for (const p of this.players) {
      if (p.down) { p.down = false; p.hp = p.d.maxHp; this.emit(['rev', p.id]); }
      if (p.d.harvest > 0) { p.money += p.d.harvest; p.stats.moneyEarned += p.d.harvest; }
      p.ready = false;
      p.cardRerolls = 0;
      p.shop.rerolls = 0;
      p.shop.freeRerolls = p.d.rerolls;
      rollShop(this, p);
      nextCards(this, p);
      this.dirty.add(p.id);
    }
  }

  private collect(p: SimPlayer, pk: Pickup, emit = true) {
    if (emit) this.emit(['pick', pk.id, p.id]);
    if (pk.kind === 'candy') {
      // 联机时糖果全队共享（类似学习装置），每人分到的份额让收入与单人大致相当
      const n = this.players.length;
      const share = n === 1 ? 1 : 1.05 / (1 + 0.6 * (n - 1));
      for (const q of this.players) {
        const v = pk.value * share;
        const money = v * q.d.moneyMult;
        q.money += money;
        q.stats.moneyEarned += money;
        addXp(this, q, v * q.d.xpMult);
        this.dirty.add(q.id);
      }
    } else if (pk.kind === 'berry') {
      healPlayer(this, p, 4 + p.d.maxHp * 0.06);
    } else {
      p.crates.push(rollCrateItem(this, p));
      this.emit(['txt', Math.round(p.x), Math.round(p.y) - 26, '获得道具球！', '#ffd23f']);
    }
    this.dirty.add(p.id);
  }

  // ------------------------------------------------------------ 主循环

  step(dt: number) {
    this.time += dt;
    if (this.phase === 'inter') {
      this.interT += dt;
      const allReady = this.players.every((p) => p.ready);
      if (allReady || (this.players.length > 1 && this.interT > INTERMISSION_TIMEOUT)) this.startWave();
      return;
    }
    if (this.phase !== 'wave') return;
    this.waveT += dt;
    this.updateSpawning(dt);
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateEnemies(dt);
    this.updateProjs(dt);
    this.updateZones(dt);
    this.updateStrikes(dt);
    this.updatePickups();
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.players.every((p) => p.down || !p.alive)) {
      this.phase = 'over';
      this.emit(['msg', '全员倒下了……']);
      return;
    }
    const W = WAVES[this.wave - 1];
    const finalBoss = this.wave === TOTAL_WAVES && !!W.boss;
    if (finalBoss && this.bossDown) {
      this.endWave();
    } else if (this.waveT >= this.waveDur) {
      if (finalBoss) {
        if (!this.enraged) { this.enraged = true; this.emit(['msg', '梦幻发怒了！击败它才能通关！']); }
      } else {
        this.endWave();
      }
    }
  }

  private updateSpawning(dt: number) {
    const W = WAVES[this.wave - 1];
    const n = this.players.length;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.pending.splice(i, 1);
        this.spawnEnemy(s.id, s.x, s.y);
      }
    }
    if (W.boss && !this.bossSpawned && this.waveT >= 2) {
      this.bossSpawned = true;
      this.emit(['msg', `野生的${ENEMIES[W.boss].name}出现了！`]);
      const { x, y } = this.spawnPoint(160);
      this.queueSpawn(W.boss, x, y, 1.5);
    }
    if (W.elites && this.elitesDone < W.elites.length) {
      const at = this.waveDur * (0.2 + 0.3 * this.elitesDone);
      if (this.waveT >= at) {
        const id = W.elites[this.elitesDone++];
        this.emit(['msg', `${ENEMIES[id].name}出现了！`]);
        const { x, y } = this.spawnPoint(140);
        this.queueSpawn(id, x, y, 1.2);
      }
    }
    if (this.treasureAt >= 0 && this.waveT >= this.treasureAt && W.treasure) {
      this.treasureAt = -1;
      this.emit(['msg', `${ENEMIES[W.treasure.id].name}出现了！快抓住它！`]);
      const { x, y } = this.spawnPoint(120);
      this.queueSpawn(W.treasure.id, x, y, 0.8);
    }
    if (this.waveT > this.waveDur - 1.5) return;
    const progress = this.waveT / this.waveDur;
    let rate = W.rate * spawnRateMult(this.wave) * (0.7 + 0.6 * progress) * (1 + 0.6 * (n - 1));
    if (this.boss) rate *= 0.6;
    this.spawnAcc += rate * dt;
    const maxAlive = 100 + 30 * (n - 1);
    while (this.spawnAcc >= 1) {
      if (this.enemies.length + this.pending.length >= maxAlive) { this.spawnAcc = 0; break; }
      const id = this.rng.weighted(W.pool);
      const big = ENEMIES[id].hp >= 40 || ENEMIES[id].ai === 'shooter';
      const g = Math.max(1, Math.min(Math.floor(this.spawnAcc), big ? this.rng.int(1, 2) : this.rng.int(1, 2 + Math.floor(this.wave / 4))));
      const { x, y } = this.spawnPoint(100);
      for (let i = 0; i < g; i++) {
        const a = this.rng.range(0, Math.PI * 2), r = i === 0 ? 0 : this.rng.range(10, 22);
        this.queueSpawn(id, x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      this.spawnAcc -= g;
    }
  }

  private spawnPoint(minDist: number) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 16; tries++) {
      x = this.rng.range(32, this.w - 32);
      y = this.rng.range(36, this.h - 32);
      if (this.players.every((p) => p.down || Math.hypot(p.x - x, p.y - y) >= minDist)) break;
    }
    return { x, y };
  }

  private updatePlayer(p: SimPlayer, dt: number) {
    if (!p.alive) return;
    p.moveBudget = Math.min(p.moveBudget + this.moveSpeed(p) * 1.5 * dt, this.moveSpeed(p) * 0.5 + 10);
    if (p.down) {
      p.downT += dt;
      let helpers = 0;
      for (const q of this.players) {
        if (q !== p && q.alive && !q.down && Math.hypot(q.x - p.x, q.y - p.y) < 30) helpers++;
      }
      if (helpers) {
        p.revive += (dt / 3) * helpers;
        if (p.revive >= 1) {
          p.down = false;
          p.hp = Math.max(1, Math.round(p.d.maxHp * 0.35));
          p.invuln = 2;
          p.revive = 0;
          this.emit(['rev', p.id]);
          for (const q of this.players) if (q !== p && q.alive && !q.down && Math.hypot(q.x - p.x, q.y - p.y) < 30) q.stats.revives++;
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.15);
      return;
    }
    if (p.invuln > 0) p.invuln -= dt;
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
    if (p.slowT > 0) p.slowT -= dt;
    if (p.buffT > 0) { p.buffT -= dt; if (p.buffT <= 0) this.recompute(p); }
    p.lsWindow += dt;
    if (p.lsWindow >= 1) { p.lsWindow = 0; p.lsCount = 0; }
    if (p.d.regenPerSec > 0 && p.hp < p.d.maxHp) {
      p.regenAcc += p.d.regenPerSec * dt;
      if (p.regenAcc >= 1) {
        const n = Math.floor(p.regenAcc);
        p.regenAcc -= n;
        p.hp = Math.min(p.d.maxHp, p.hp + n);
      }
    }
    updateSkills(this, p, dt);
  }

  moveSpeed(p: SimPlayer) {
    return p.d.moveSpeed * (p.slowT > 0 ? 1 - p.slowAmt : 1);
  }

  private updateEnemies(dt: number) {
    const grid = new Map<number, Enemy[]>();
    const CELL = 24;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!updateEnemy(this, e, dt)) { e.dead = true; e.hp = 0; continue; }
      // 持续伤害
      const st = e.st;
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
            const src = this.players.find((p) => p.id === st.leechSrc);
            if (src) healPlayer(this, src, st.leechDps * 0.5 * st.leechHeal * (src.line === 'bulbasaur' ? 1.3 : 1), true);
          }
          for (const [d, src] of parts) {
            if (e.dead) break;
            hitEnemy(this, e, this.players.find((p) => p.id === src) ?? null, d, 'normal', { dot: true, noEff: true });
          }
          if (st.burn <= 0) st.burnDps = 0;
          if (st.poison <= 0) st.poisonDps = 0;
        }
      }
      if (e.dead) continue;
      // 接触伤害
      if (!e.hidden && e.dmg > 0) {
        for (const p of this.players) {
          if (p.down || !p.alive || p.invuln > 0) continue;
          const rr = e.r + PLAYER_R - 1;
          if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) hurtPlayer(this, p, e.dmg, 'phys', e);
        }
      }
      const key = Math.floor(e.x / CELL) + Math.floor(e.y / CELL) * 1000;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(e);
    }
    // 互相推挤
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx + gy * 1000);
          if (!cell) continue;
          for (const o of cell) {
            if (o.id <= e.id || o.dead || o.hidden) continue;
            const dx = o.x - e.x, dy = o.y - e.y;
            const rr = (e.r + o.r) * 0.85;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const push = ((rr - d) / d) * 0.5;
            const we = e.def.rank === 'minion' ? 1 : 0.1, wo = o.def.rank === 'minion' ? 1 : 0.1;
            e.x -= dx * push * we; e.y -= dy * push * we;
            o.x += dx * push * wo; o.y += dy * push * wo;
          }
        }
      }
    }
  }

  private updateProjs(dt: number) {
    const keep: Proj[] = [];
    for (const pr of this.projs) {
      pr.life -= dt;
      if (pr.life <= 0) continue;
      const owner = pr.owner >= 0 ? this.players.find((p) => p.id === pr.owner) : null;
      if (pr.orbit) {
        if (!owner || owner.down) continue;
        pr.orbit.ang += pr.orbit.spd * dt;
        pr.x = owner.x + Math.cos(pr.orbit.ang) * pr.orbit.rad;
        pr.y = owner.y - 6 + Math.sin(pr.orbit.ang) * pr.orbit.rad * 0.8;
      } else {
        if (pr.homing > 0) {
          const tgt = pr.owner >= 0 ? this.nearestEnemyTo(pr.x, pr.y, 140) : this.nearestPlayer(pr.x, pr.y);
          if (tgt) {
            const want = Math.atan2(tgt.y - pr.y, tgt.x - pr.x);
            const cur = Math.atan2(pr.vy, pr.vx);
            let diff = want - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turn = Math.max(-pr.homing * dt, Math.min(pr.homing * dt, diff));
            const sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(cur + turn) * sp;
            pr.vy = Math.sin(cur + turn) * sp;
          }
        }
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.x < -10 || pr.y < -10 || pr.x > this.w + 10 || pr.y > this.h + 10) continue;
      }
      let alive = true;
      if (pr.owner >= 0) {
        for (const e of this.enemies) {
          if (e.dead || e.hidden) continue;
          const rr = e.r + pr.r;
          if ((e.x - pr.x) ** 2 + (e.y - 6 - pr.y) ** 2 > rr * rr) continue;
          if (pr.orbit) {
            const m = (e.orbitHit ??= new Map());
            const next = m.get(pr.id) ?? 0;
            if (this.time < next) continue;
            m.set(pr.id, this.time + 0.45);
          } else if (pr.hit.has(e.id)) continue;
          pr.hit.add(e.id);
          const dirx = pr.orbit ? e.x - (owner?.x ?? pr.x) : pr.vx;
          const diry = pr.orbit ? e.y - (owner?.y ?? pr.y) : pr.vy;
          hitEnemy(this, e, owner ?? null, pr.dmg, pr.type, { crit: pr.crit, status: pr.status, knock: pr.knock, kx: dirx, ky: diry, heal: pr.skill?.heal, skill: pr.skill });
          if (!pr.orbit) {
            if (pr.pierce <= 0) { alive = false; break; }
            pr.pierce--;
            pr.dmg *= 0.9;
          }
        }
      } else {
        for (const p of this.players) {
          if (p.down || !p.alive) continue;
          const rr = PLAYER_R + pr.r - 1;
          if ((p.x - pr.x) ** 2 + (p.y - 6 - pr.y) ** 2 > rr * rr) continue;
          if (p.invuln <= 0) {
            hurtPlayer(this, p, pr.dmg, 'spec');
            if (pr.slow) { p.slowT = 1.6; p.slowAmt = pr.slow; this.dirty.add(p.id); }
          }
          alive = false;
          break;
        }
      }
      if (alive) keep.push(pr);
    }
    this.projs = keep;
  }

  nearestEnemyTo(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private updateZones(dt: number) {
    const keep: Zone[] = [];
    for (const z of this.zones) {
      z.life -= dt;
      z.t += dt;
      if (z.t >= z.tick) {
        z.t -= z.tick;
        if (z.owner >= 0) {
          const owner = this.players.find((p) => p.id === z.owner) ?? null;
          for (const e of this.enemies) {
            if (e.dead || e.hidden) continue;
            if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= (z.r + e.r) ** 2) {
              hitEnemy(this, e, owner, z.dmg, z.type, { status: z.skill?.status, skill: z.skill });
            }
          }
        } else {
          for (const p of this.players) {
            if (!p.down && p.alive && (p.x - z.x) ** 2 + (p.y - z.y) ** 2 <= (z.r + PLAYER_R) ** 2) {
              const inv = p.invuln;
              p.invuln = 0;
              hurtPlayer(this, p, z.dmg, 'spec');
              p.invuln = Math.max(p.invuln > 0 ? 0.1 : 0, inv);
            }
          }
        }
      }
      if (z.life > 0) keep.push(z);
    }
    this.zones = keep;
  }

  private updateStrikes(dt: number) {
    const keep: Strike[] = [];
    for (const s of this.strikes) {
      s.t -= dt;
      if (s.t > 0) { keep.push(s); continue; }
      if (s.enemy) {
        this.emit(['boom', Math.round(s.x), Math.round(s.y), s.r, s.fx]);
        for (const p of this.players) {
          if (!p.down && p.alive && Math.hypot(p.x - s.x, p.y - s.y) <= s.r + PLAYER_R) hurtPlayer(this, p, s.dmg, s.cat);
        }
        continue;
      }
      const owner = this.players.find((p) => p.id === s.owner) ?? null;
      if (s.line && s.skill) {
        beamHit(this, owner, s.skill, s.x, s.y, s.line.ang, s.line.len, s.r, s.dmg);
        this.emit(['fx', s.fx, Math.round(s.x), Math.round(s.y), Math.round(s.line.ang * 100) / 100, Math.round(s.line.len), s.r, s.owner]);
        continue;
      }
      this.emit(['boom', Math.round(s.x), Math.round(s.y), Math.round(s.r), s.fx]);
      for (const e of this.enemies.slice()) {
        if (e.dead || e.hidden) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) <= s.r + e.r) {
          hitEnemy(this, e, owner, s.dmg, s.type, { crit: s.skill?.crit, status: s.skill?.status, knock: s.skill?.knock, kx: e.x - s.x, ky: e.y - s.y, skill: s.skill });
        }
      }
    }
    this.strikes = keep;
  }

  private updatePickups() {
    if (!this.pickups.length) return;
    const keep: Pickup[] = [];
    for (const pk of this.pickups) {
      let taken = false;
      for (const p of this.players) {
        if (p.down || !p.alive) continue;
        const r = pk.kind === 'candy' ? p.d.pickupRadius : 18;
        if ((p.x - pk.x) ** 2 + (p.y - pk.y) ** 2 <= r * r) {
          if (pk.kind === 'berry' && p.hp >= p.d.maxHp) continue;
          this.collect(p, pk);
          taken = true;
          break;
        }
      }
      if (!taken) keep.push(pk);
    }
    this.pickups = keep;
  }

  // ------------------------------------------------------------ 玩家输入

  setPlayerPos(id: number, x: number, y: number, moving: boolean, dir: number) {
    const p = this.players.find((q) => q.id === id);
    if (!p || p.down || this.phase !== 'wave') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x = Math.max(8, Math.min(this.w - 8, x));
    y = Math.max(14, Math.min(this.h - 6, y));
    let dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    const budget = p.moveBudget;
    if (d > budget) {
      const k = budget / d;
      dx *= k; dy *= k;
    }
    p.moveBudget = Math.max(0, budget - Math.hypot(dx, dy));
    p.x += dx;
    p.y += dy;
    p.moving = moving;
    if (Number.isFinite(dir)) p.dir = dir;
  }

  command(id: number, c: Command): string | null {
    const p = this.players.find((q) => q.id === id);
    if (!p) return '玩家不存在';
    if (this.phase !== 'inter') return '只能在波次之间操作';
    this.dirty.add(p.id);
    switch (c.t) {
      case 'level': return pickCard(this, p, c.i | 0, c.slot);
      case 'levelReroll': return rerollCards(this, p);
      case 'buy': {
        const err = shopBuy(this, p, c.i | 0, c.slot);
        if (!err) this.emit(['buy', p.id]);
        return err;
      }
      case 'reroll': return shopReroll(this, p);
      case 'lock': shopLock(p, c.i | 0); return null;
      case 'forget': return forgetSkill(this, p, c.slot | 0);
      case 'crate': resolveCrate(this, p, !!c.take); return null;
      case 'waveReady':
        if (c.on && (p.cards || p.crates.length)) return '请先完成升级选择';
        p.ready = !!c.on;
        return null;
    }
    return '未知指令';
  }

  removePlayer(id: number) {
    const p = this.players.find((q) => q.id === id);
    if (!p) return;
    this.players = this.players.filter((q) => q !== p);
    for (const pr of this.projs) if (pr.owner === id) pr.life = 0;
    if (!this.players.length) this.phase = 'over';
  }

  // ------------------------------------------------------------ 状态导出

  privateState(p: SimPlayer): MeState {
    const form = formOf(p.line, p.stage);
    const crate = p.cards ? null : p.crates[0] ?? null;
    return {
      id: p.id, line: p.line, stage: p.stage, dex: form.dex, form: form.name, level: p.level,
      xp: Math.floor(p.xp), xpNext: xpToNext(p.level), money: Math.floor(p.money),
      hp: Math.ceil(p.hp), maxHp: p.d.maxHp, speed: this.moveSpeed(p), down: p.down,
      slots: p.slots,
      skills: p.skills.map((s) => ({ id: s.id, lv: s.lv, cd: Math.max(0, Math.round(s.cd * 10) / 10), max: Math.round(SKILLS[s.id].cd * 10) / 10 })),
      items: Object.entries(p.items).filter(([, n]) => n > 0),
      stats: {
        maxHp: p.d.maxHp, atk: Math.round(p.d.atk), spa: Math.round(p.d.spa), def: Math.round(p.d.def), spd: Math.round(p.d.spd), spe: Math.round(p.d.spe),
        haste: Math.round((1 / p.d.cdMult - 1) * 100), crit: Math.round(p.d.crit * 100), range: Math.round((p.d.rangeMult - 1) * 100),
        dodge: Math.round(p.d.dodge * 100), regen: Math.round(p.d.regenPerSec * 10), lifesteal: Math.round(p.d.lifesteal * 100),
        luck: Math.round(p.d.luck), harvest: Math.round(p.d.harvest), xp: Math.round((p.d.xpMult - 1) * 100), money: Math.round((p.d.moneyMult - 1) * 100),
        dmg: Math.round((p.d.dmgMult - 1) * 100), dmgMinion: Math.round((p.d.minionMult - 1) * 100), dmgBoss: Math.round((p.d.bossMult - 1) * 100),
        thorns: Math.round(p.d.thorns), pickup: Math.round(p.d.pickupRadius), physTaken: Math.round(p.d.physTaken * 100), specTaken: Math.round(p.d.specTaken * 100),
        moveSpeed: Math.round(this.moveSpeed(p)),
      },
      cards: p.cards,
      cardRerollCost: cardRerollCost(this, p),
      levelsPending: p.levelQueue.length,
      crate,
      crateSell: crate ? crateSellValue(this, crate) : 0,
      cratesLeft: p.crates.length,
      shop: { offers: p.shop.offers, locked: p.shop.locked, rerollCost: rerollCost(this, p) },
      ready: p.ready,
      typeMods: p.typeMods as Record<string, number>,
    };
  }

  publicState(): PublicState {
    return {
      phase: this.phase,
      wave: this.wave,
      total: TOTAL_WAVES,
      time: Math.round(this.waveT * 10) / 10,
      dur: this.waveDur,
      biome: WAVES[Math.max(0, this.wave - 1)].biome,
      interLeft: this.players.length > 1 ? Math.max(0, Math.round(INTERMISSION_TIMEOUT - this.interT)) : -1,
      boss: this.boss && !this.boss.dead ? { name: this.boss.def.name, hp: Math.max(0, Math.round(this.boss.hp)), max: this.boss.maxHp } : null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, line: p.line, dex: formOf(p.line, p.stage).dex, level: p.level,
        hp: Math.ceil(p.hp), maxHp: p.d.maxHp, down: p.down, ready: p.ready, kills: p.stats.kills,
      })),
    };
  }

  summary(p: SimPlayer): RunSummary {
    const wavesCleared = this.phase === 'won' ? TOTAL_WAVES : Math.max(0, this.wave - 1);
    const L = LINES[p.line];
    return {
      line: p.line,
      wavesCleared,
      victory: this.phase === 'won',
      kills: p.stats.kills,
      level: p.level,
      stage: p.stage,
      finalForm: L.forms.length > 1 && p.stage >= L.forms.length - 1,
      evolved: p.stats.evolved,
      skillsFull: p.stats.skillsFull,
      foreignSkill: p.stats.foreignSkill,
      items: p.stats.maxItems,
      moneyEarned: Math.floor(p.stats.moneyEarned),
      superEff: p.stats.superEff,
      players: this.startPlayers,
      revives: p.stats.revives,
      bossKills: p.stats.bossKills,
      damage: Math.round(p.stats.damage),
    };
  }

  /** 供无头测试：直接给予道具 */
  debugGive(id: number, item: string) {
    const p = this.players.find((q) => q.id === id);
    if (p && ITEMS[item]) { p.items[item] = (p.items[item] ?? 0) + 1; recompute(p); }
  }
}
