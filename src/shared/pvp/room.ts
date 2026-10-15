/**
 * 对战房间：运行一场 PvpSim，把快照/事件/状态发给场上的真人玩家。
 * 服务器的匹配对局与浏览器里的离线练习赛共用。
 */
import { formOf } from '../pokemon';
import { encodeSnapshot, type C2S, type PvpRatingChange, type PvpSeatInfo, type S2C } from '../protocol';
import { Room } from '../room';
import { PeerSync, cullEvents, type Conn } from '../netsync';
import { TICK_RATE } from '../sim/game';
import type { SavedBuild } from './build';
import { PVP_MODES, PvpSim, type PvpInit, type PvpMatchResult, type PvpMode } from './sim';

/** 一位训练家（真人或 AI）：派出 team 里的宝可梦，自己控制第一只 */
export interface PvpSeat {
  id: number;
  name: string;
  team: number;
  builds: SavedBuild[];
  meta: Record<string, number>;
  trainer: string;
  conn: Conn | null;
  bot: boolean;
  rating: number;
  /** 真人玩家的对战身份 */
  pid?: string;
  left?: boolean;
  sync?: PeerSync;
  /** 开局就交给 AI（斗蛐蛐） */
  auto?: boolean;
  /** 这位训练家控制的那只宝可梦（模拟里的玩家编号） */
  unit?: number;
}

const SNAPSHOT_EVERY = 2;
const STATE_EVERY = 6;

export class PvpRoom {
  readonly sim: PvpSim;
  readonly seats: PvpSeat[];
  ended = false;
  result: PvpMatchResult | null = null;
  private tick = 0;
  private lastPhase = '';
  /** 浏览器里的练习赛：不裁剪视野 */
  local = false;
  /** 对局结束时调用：返回每个座位的积分变化（练习赛返回 null） */
  onEnd?: (res: PvpMatchResult, room: PvpRoom) => Map<number, PvpRatingChange> | null;

  constructor(readonly code: string, readonly mode: PvpMode, seats: PvpSeat[], seed = (Math.random() * 2 ** 31) | 0) {
    this.seats = seats;
    const inits: PvpInit[] = [];
    let uid = 1;
    for (const s of seats) {
      s.sync = new PeerSync();
      s.builds.slice(0, PVP_MODES[mode].team).forEach((build, i) => {
        const id = uid++;
        if (i === 0) s.unit = id;
        inits.push({ id, name: s.name, team: s.team, build, meta: s.meta, trainer: s.trainer, bot: s.bot || (i === 0 && !!s.auto), owner: s.id, helper: i > 0 });
      });
    }
    this.sim = new PvpSim(mode, inits, seed);
  }

  /** 座位 ↔ 它控制的宝可梦 */
  private seatOf(unit: number) { return this.seats.find((s) => s.unit === unit); }

  private humans() { return this.seats.filter((s) => s.conn && !s.left); }

  private send(conn: Conn, msg: S2C) { conn.send(JSON.stringify(msg)); }
  private broadcast(msg: S2C | string | ArrayBuffer) {
    const data = typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg);
    for (const s of this.humans()) s.conn!.send(data);
  }

  /** 场上每只宝可梦的信息（客户端按这个分队、显示名字） */
  seatInfo(): PvpSeatInfo[] {
    return this.sim.players.map((p) => {
      const { owner, helper } = this.sim.ownerOf(p.id);
      const s = this.seats.find((x) => x.id === owner)!;
      return { id: p.id, name: s.name, team: p.team, bot: s.bot, rating: Math.round(s.rating), trainer: p.trainer, line: p.line, dex: formOf(p.line, p.stage).dex, level: p.level, owner, helper };
    });
  }

  begin() {
    const sim = this.sim;
    const players = sim.players.map((p) => ({ id: p.id, name: p.name, trainer: p.trainer, line: p.line }));
    const seats = this.seatInfo();
    for (const s of this.humans()) {
      this.send(s.conn!, { t: 'joined', code: this.code, you: s.unit!, solo: false });
      this.send(s.conn!, { t: 'start', w: sim.w, h: sim.h, players, pvp: { mode: this.mode, seats } });
    }
    this.broadcast({ t: 'ev', e: sim.flushEvents() });
    this.broadcast({ t: 'st', s: sim.publicState() });
    for (const p of sim.players) sim.dirty.add(p.id);
    this.flushPrivate();
  }

  /** 以 TICK_RATE 调用一次 */
  update() {
    if (this.ended) return;
    const sim = this.sim;
    // 真人都离开了：快进打完，尽快释放资源
    const steps = this.humans().length ? 1 : 12;
    for (let i = 0; i < steps && sim.phase !== 'over'; i++) sim.step(1 / TICK_RATE);
    this.tick++;
    const phaseChanged = sim.phase !== this.lastPhase;
    if (this.tick % SNAPSHOT_EVERY === 0 || phaseChanged) {
      const ev = sim.flushEvents();
      const now = performance.now();
      for (const s of this.humans()) {
        const box = this.local ? null : s.sync!.box(sim.players.find((p) => p.id === s.unit));
        const level = this.local ? 0 : s.sync!.congestion(now, s.conn!.buffered?.() ?? 0);
        if (phaseChanged || s.sync!.shouldSend(this.tick, level)) {
          s.conn!.send(encodeSnapshot(sim, this.tick, box), !phaseChanged);
          s.sync!.markSent(this.tick, now);
        }
        const list = cullEvents(ev, box, level > 0);
        if (list.length) s.conn!.send(JSON.stringify({ t: 'ev', e: list } satisfies S2C));
      }
    }
    if (sim.phase !== this.lastPhase || this.tick % STATE_EVERY === 0) {
      this.lastPhase = sim.phase;
      this.broadcast({ t: 'st', s: sim.publicState() });
    }
    if (this.tick % STATE_EVERY === 3) for (const p of sim.players) sim.dirty.add(p.id);
    this.flushPrivate();
    if (sim.phase === 'over') this.end();
  }

  private flushPrivate() {
    const sim = this.sim;
    for (const id of sim.dirty) {
      const p = sim.players.find((q) => q.id === id);
      const s = this.seatOf(id);
      if (!p || !s?.conn || s.left) continue;
      const msg = s.sync!.privateMsg(sim, p);
      if (msg) s.conn.send(msg);
    }
    sim.dirty.clear();
  }

  /** id：这位玩家控制的宝可梦 */
  handle(id: number, msg: C2S) {
    const s = this.seatOf(id);
    if (!s || !s.conn || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'auto':
        this.sim.setAuto(id, !!msg.on);
        return;
      case 'pos':
        this.sim.setPlayerPos(id, +msg.x, +msg.y, !!msg.m, +msg.d);
        if (msg.k !== undefined) s.sync?.ack(+msg.k, performance.now());
        return;
      case 'ack':
        s.sync?.ack(+msg.k, performance.now());
        return;
      case 'ping':
        this.send(s.conn, { t: 'pong', at: msg.at });
        return;
      case 'view':
        s.sync?.setView(+msg.w, +msg.h);
        return;
      case 'leave':
        this.leave(id);
        return;
      case 'debug':
        // 调试：这位训练家派出的宝可梦全部倒下
        if (!Room.allowDebug || msg.cmd !== 'down' || this.sim.phase !== 'wave') return;
        for (const p of this.sim.players) if (this.sim.ownerOf(p.id).owner === s.id && !p.down) this.sim.downPlayer(p);
        return;
    }
  }

  /** 中途离开：按失败结算，宝可梦交给 AI 继续打完 */
  leave(id: number) {
    const s = this.seatOf(id);
    if (!s || s.left) return;
    s.left = !this.ended;
    s.conn = null;
    this.sim.setBot(id);
  }

  private end() {
    this.ended = true;
    const res = this.sim.result();
    this.result = res;
    const changes = this.onEnd?.(res, this) ?? null;
    for (const s of this.seats) {
      if (!s.conn || s.left) continue;
      this.send(s.conn, { t: 'pvpEnd', result: res, you: s.unit!, rating: changes?.get(s.id) ?? null });
    }
  }
}
