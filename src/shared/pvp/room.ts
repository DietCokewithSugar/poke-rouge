/**
 * 对战房间：运行一场 PvpSim，把快照/事件/状态发给场上的真人玩家。
 * 服务器的匹配对局与浏览器里的离线练习赛共用。
 */
import { formOf } from '../pokemon';
import { encodeSnapshot, type C2S, type PvpRatingChange, type PvpSeatInfo, type S2C } from '../protocol';
import { Room, type Conn } from '../room';
import { TICK_RATE } from '../sim/game';
import type { SavedBuild } from './build';
import { PvpSim, type PvpMatchResult, type PvpMode } from './sim';

export interface PvpSeat {
  id: number;
  name: string;
  team: number;
  build: SavedBuild;
  meta: Record<string, number>;
  conn: Conn | null;
  bot: boolean;
  rating: number;
  /** 真人玩家的对战身份 */
  pid?: string;
  left?: boolean;
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
  /** 对局结束时调用：返回每个座位的积分变化（练习赛返回 null） */
  onEnd?: (res: PvpMatchResult, room: PvpRoom) => Map<number, PvpRatingChange> | null;

  constructor(readonly code: string, readonly mode: PvpMode, seats: PvpSeat[], seed = (Math.random() * 2 ** 31) | 0) {
    this.seats = seats;
    this.sim = new PvpSim(mode, seats.map((s) => ({ id: s.id, name: s.name, team: s.team, build: s.build, meta: s.meta, bot: s.bot })), seed);
  }

  private humans() { return this.seats.filter((s) => s.conn && !s.left); }

  private send(conn: Conn, msg: S2C) { conn.send(JSON.stringify(msg)); }
  private broadcast(msg: S2C | string | ArrayBuffer) {
    const data = typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg);
    for (const s of this.humans()) s.conn!.send(data);
  }

  seatInfo(): PvpSeatInfo[] {
    return this.seats.map((s) => {
      const p = this.sim.players.find((q) => q.id === s.id)!;
      return { id: s.id, name: s.name, team: s.team, bot: s.bot, rating: Math.round(s.rating), line: p.line, dex: formOf(p.line, p.stage).dex, level: p.level };
    });
  }

  begin() {
    const sim = this.sim;
    const players = sim.players.map((p) => ({ id: p.id, name: p.name, line: p.line }));
    const seats = this.seatInfo();
    for (const s of this.humans()) {
      this.send(s.conn!, { t: 'joined', code: this.code, you: s.id, solo: false });
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
    if (this.tick % SNAPSHOT_EVERY === 0 || sim.phase !== this.lastPhase) {
      this.broadcast(encodeSnapshot(sim, this.tick));
      const ev = sim.flushEvents();
      if (ev.length) this.broadcast({ t: 'ev', e: ev });
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
      const s = this.seats.find((x) => x.id === id);
      if (p && s?.conn && !s.left) this.send(s.conn, { t: 'me', s: sim.privateState(p) });
    }
    sim.dirty.clear();
  }

  handle(id: number, msg: C2S) {
    const s = this.seats.find((x) => x.id === id);
    if (!s || !s.conn || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'pos':
        this.sim.setPlayerPos(id, +msg.x, +msg.y, !!msg.m, +msg.d);
        return;
      case 'ping':
        this.send(s.conn, { t: 'pong', at: msg.at });
        return;
      case 'leave':
        this.leave(id);
        return;
      case 'debug': {
        const p = this.sim.players.find((q) => q.id === id);
        if (Room.allowDebug && p && msg.cmd === 'down' && this.sim.phase === 'wave') this.sim.downPlayer(p);
        return;
      }
    }
  }

  /** 中途离开：按失败结算，宝可梦交给 AI 继续打完 */
  leave(id: number) {
    const s = this.seats.find((x) => x.id === id);
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
      this.send(s.conn, { t: 'pvpEnd', result: res, you: s.id, rating: changes?.get(s.id) ?? null });
    }
  }
}
