/**
 * 对战服务：匹配队列（优先匹配分数接近的玩家，等得越久范围越大，超时由 AI 训练家补位）、
 * Elo 积分与段位、排行榜，以及 JSON 文件持久化。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formOf } from '../shared/pokemon';
import type { PvpBoardRow, PvpHistory, PvpRatingChange, PvpRecord, S2C } from '../shared/protocol';
import { PROTOCOL_VERSION } from '../shared/protocol';
import { Rng } from '../shared/rng';
import { cleanMeta, cleanName, type Conn } from '../shared/room';
import { NPC_NAMES, buildDex, buildPower, generateBuild, npcTrainer, validateBuild, type SavedBuild } from '../shared/pvp/build';
import { trainerOf } from '../shared/trainers';
import { START_RATING, eloDelta, kFactor } from '../shared/pvp/rating';
import { PvpRoom, type PvpSeat } from '../shared/pvp/room';
import { PVP_MODES, PVP_MODE_IDS, type PvpMatchResult, type PvpMode } from '../shared/pvp/sim';

export interface PvpClient {
  conn: Conn;
  pvp: PvpRoom | null;
  pvpId: number;
  send(msg: S2C): void;
}

interface ModeRec { rating: number; best: number; wins: number; losses: number; draws: number; streak: number; games: number; dex: number }
interface StoredPlayer { pid: string; hash: string; name: string; created: number; last: number; modes: Partial<Record<PvpMode, ModeRec>>; history: PvpHistory[] }
interface Ghost { pid: string; name: string; build: SavedBuild; meta: Record<string, number>; trainer?: string; rating: number; power: number; at: number }
interface Entry { c: PvpClient; pid: string; name: string; build: SavedBuild; meta: Record<string, number>; trainer: string; rating: number; power: number; mode: PvpMode; at: number }

const MAX_GHOSTS = 400;

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const freshRec = (): ModeRec => ({ rating: START_RATING, best: START_RATING, wins: 0, losses: 0, draws: 0, streak: 0, games: 0, dex: 0 });

export class PvpService {
  players = new Map<string, StoredPlayer>();
  ghosts: Ghost[] = [];
  queue: Entry[] = [];
  rooms = new Set<PvpRoom>();
  private rng = new Rng(Date.now() & 0x7fffffff);
  private dirty = false;
  private lastSave = 0;
  private seq = 0;
  private boards = new Map<PvpMode, StoredPlayer[]>();

  constructor(private file: string, private botAfter: Record<PvpMode, number>) {
    this.load();
  }

  // ------------------------------------------------------------ 持久化

  private load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { players?: StoredPlayer[]; ghosts?: Ghost[] };
      for (const p of data.players ?? []) this.players.set(p.pid, p);
      this.ghosts = (data.ghosts ?? []).filter((g) => typeof validateBuild(g.build) !== 'string');
      console.log(`对战数据已载入：${this.players.size} 位训练家，${this.ghosts.length} 个 AI 构筑`);
    } catch (err) {
      console.error('对战数据读取失败', err);
    }
  }

  saveNow() {
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSave = Date.now();
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, players: [...this.players.values()], ghosts: this.ghosts }));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('对战数据保存失败', err);
    }
  }

  private touch() {
    this.dirty = true;
    this.boards.clear();
  }

  // ------------------------------------------------------------ 身份与战绩

  private auth(pid: unknown, secret: unknown, name?: string, create = false): StoredPlayer | string | null {
    if (typeof pid !== 'string' || !/^[a-z0-9]{12,32}$/.test(pid) || typeof secret !== 'string' || secret.length < 16 || secret.length > 64) return '对战身份无效';
    const p = this.players.get(pid);
    if (!p) {
      if (!create) return null;
      const np: StoredPlayer = { pid, hash: hash(secret), name: cleanName(name), created: Date.now(), last: Date.now(), modes: {}, history: [] };
      this.players.set(pid, np);
      this.touch();
      return np;
    }
    if (p.hash !== hash(secret)) return '对战身份校验失败';
    if (name && cleanName(name) !== p.name) { p.name = cleanName(name); this.touch(); }
    return p;
  }

  private rec(p: StoredPlayer, mode: PvpMode) { return (p.modes[mode] ??= freshRec()); }

  private sorted(mode: PvpMode) {
    let list = this.boards.get(mode);
    if (!list) {
      list = [...this.players.values()].filter((p) => (p.modes[mode]?.games ?? 0) > 0)
        .sort((a, b) => b.modes[mode]!.rating - a.modes[mode]!.rating || b.modes[mode]!.wins - a.modes[mode]!.wins || a.created - b.created);
      this.boards.set(mode, list);
    }
    return list;
  }

  private record(p: StoredPlayer, mode: PvpMode): PvpRecord {
    const r = this.rec(p, mode);
    const rank = r.games ? this.sorted(mode).indexOf(p) + 1 : 0;
    return { mode, rating: Math.round(r.rating), best: Math.round(r.best), wins: r.wins, losses: r.losses, draws: r.draws, streak: r.streak, games: r.games, rank };
  }

  board(mode: PvpMode, pid?: unknown, secret?: unknown): Extract<S2C, { t: 'pvpBoard' }> {
    if (!PVP_MODE_IDS.includes(mode)) mode = '1v1';
    const list = this.sorted(mode);
    const me = pid ? this.auth(pid, secret) : null;
    const meP = me && typeof me !== 'string' ? me : null;
    const rows: PvpBoardRow[] = list.slice(0, 50).map((p, i) => {
      const r = p.modes[mode]!;
      return { rank: i + 1, name: p.name, rating: Math.round(r.rating), wins: r.wins, losses: r.losses, draws: r.draws, streak: r.streak, dex: r.dex, you: p === meP || undefined };
    });
    return { t: 'pvpBoard', mode, rows, me: meP ? this.record(meP, mode) : null, players: list.length, history: meP ? meP.history.slice(0, 10) : [] };
  }

  // ------------------------------------------------------------ 队列

  queued(c: PvpClient) { return this.queue.some((e) => e.c === c); }

  enqueue(c: PvpClient, msg: { mode: unknown; build: unknown; name: unknown; meta: unknown; v: unknown; pid: unknown; secret: unknown; trainer?: unknown }): string | null {
    if (msg.v !== PROTOCOL_VERSION) return '客户端版本与服务器不一致，请刷新页面';
    const mode = msg.mode as PvpMode;
    if (!PVP_MODE_IDS.includes(mode)) return '未知的对战模式';
    if (c.pvp && !c.pvp.ended) return '你已经在对战中';
    const b = validateBuild(msg.build);
    if (typeof b === 'string') return b;
    const p = this.auth(msg.pid, msg.secret, String(msg.name ?? ''), true);
    if (!p || typeof p === 'string') return p ?? '对战身份无效';
    if (this.queue.some((e) => e.pid === p.pid && e.c !== c)) return '这个对战身份已经在匹配中（是不是开了两个页面？）';
    for (const r of this.rooms) if (!r.ended && r.seats.some((s) => s.pid === p.pid && s.conn && !s.left)) return '这个对战身份正在对战中';
    this.cancel(c);
    const meta = cleanMeta(msg.meta);
    const e: Entry = { c, pid: p.pid, name: p.name, build: b, meta, trainer: trainerOf(msg.trainer).id, rating: this.rec(p, mode).rating, power: buildPower(b), mode, at: Date.now() };
    this.queue.push(e);
    p.last = Date.now();
    this.addGhost(e);
    this.status(e, Date.now());
    return null;
  }

  cancel(c: PvpClient) {
    const n = this.queue.length;
    this.queue = this.queue.filter((e) => e.c !== c);
    return this.queue.length !== n;
  }

  private addGhost(e: Entry) {
    const key = JSON.stringify(e.build);
    this.ghosts = this.ghosts.filter((g) => !(g.pid === e.pid && JSON.stringify(g.build) === key));
    this.ghosts.push({ pid: e.pid, name: e.name, build: e.build, meta: e.meta, trainer: e.trainer, rating: e.rating, power: e.power, at: Date.now() });
    if (this.ghosts.length > MAX_GHOSTS) this.ghosts.splice(0, this.ghosts.length - MAX_GHOSTS);
    this.touch();
  }

  /** 匹配范围：起步 ±100 分，每等 1 秒放宽 25 分 */
  static range(waitSec: number) { return Math.round(Math.min(1000, 100 + 25 * waitSec)); }

  private status(e: Entry, now: number) {
    const wait = (now - e.at) / 1000;
    e.c.send({
      t: 'pvpQueued', mode: e.mode, wait: Math.floor(wait), range: PvpService.range(wait),
      searching: this.queue.filter((q) => q.mode === e.mode).length, botIn: Math.max(0, Math.ceil(this.botAfter[e.mode] - wait)),
    });
  }

  /** 每 0.5 秒调用：尝试组成对局 */
  tick(now = Date.now()) {
    for (const mode of PVP_MODE_IDS) {
      const need = PVP_MODES[mode].size * 2;
      const q = this.queue.filter((e) => e.mode === mode).sort((a, b) => a.at - b.at);
      const used = new Set<Entry>();
      for (const a of q) {
        if (used.has(a)) continue;
        const wait = (now - a.at) / 1000;
        const range = PvpService.range(wait);
        const others = q.filter((b) => b !== a && !used.has(b) && b.pid !== a.pid && Math.abs(b.rating - a.rating) <= range)
          .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
        if (others.length >= need - 1 || wait >= this.botAfter[mode]) {
          const group = [a, ...others.slice(0, need - 1)];
          for (const g of group) used.add(g);
          this.startMatch(mode, group);
        }
      }
      if (used.size) this.queue = this.queue.filter((e) => !used.has(e));
    }
    if (Math.floor(now / 1000) !== Math.floor((now - 500) / 1000)) for (const e of this.queue) this.status(e, now);
    for (const r of this.rooms) if (r.ended) this.rooms.delete(r);
    if (this.dirty && now - this.lastSave > 5000) this.saveNow();
  }

  /** 选一个 AI 对手：优先用其他玩家放进队列过的构筑（强度接近），没有就现场生成 */
  private botSeat(id: number, near: Entry, exclude: Set<string>, rating: number, names: Set<string>): PvpSeat {
    const cands = this.ghosts.filter((g) => !exclude.has(g.pid))
      .map((g) => ({ g, d: Math.abs(g.power - near.power) / Math.max(50, near.power) + Math.abs(g.rating - near.rating) / 2000 }))
      .sort((a, b) => a.d - b.d);
    const top = cands.filter((c) => c.d < 0.35 && !names.has(c.g.name)).slice(0, 6);
    if (top.length) {
      const g = this.rng.pick(top).g;
      exclude.add(g.pid);
      names.add(g.name);
      return { id, name: g.name, team: 0, build: g.build, meta: g.meta, trainer: trainerOf(g.trainer).id, conn: null, bot: true, rating };
    }
    const build = generateBuild(this.rng, near.build.level + this.rng.int(-1, 1));
    const free = NPC_NAMES.filter((n) => !names.has(n));
    const name = free.length ? this.rng.pick(free) : `训练家${id}`;
    names.add(name);
    return { id, name, team: 0, build, meta: near.meta, trainer: npcTrainer(this.rng, name), conn: null, bot: true, rating };
  }

  private startMatch(mode: PvpMode, group: Entry[]) {
    const need = PVP_MODES[mode].size * 2;
    const exclude = new Set(group.map((e) => e.pid));
    const avg = group.reduce((a, e) => a + e.rating, 0) / group.length;
    let id = 1;
    const seats: PvpSeat[] = group.map((e) => ({ id: id++, name: e.name, team: 0, build: e.build, meta: e.meta, trainer: e.trainer, conn: e.c.conn, bot: false, rating: e.rating, pid: e.pid }));
    const names = new Set(group.map((e) => e.name));
    while (seats.length < need) seats.push(this.botSeat(id++, this.rng.pick(group), exclude, avg, names));
    // 按构筑强度蛇形分队，让两队实力接近
    const order = seats.slice().sort((a, b) => buildPower(b.build) - buildPower(a.build));
    const snake = [0, 1, 1, 0, 0, 1, 1, 0];
    order.forEach((s, i) => { s.team = snake[i % 8]; });
    if (mode === '1v1' && seats[0].team === seats[1].team) seats[1].team = 1 - seats[0].team;
    const room = new PvpRoom(`对战${++this.seq}`, mode, seats);
    room.onEnd = (res) => this.settle(room, res);
    this.rooms.add(room);
    for (const e of group) { e.c.pvp = room; e.c.pvpId = seats.find((s) => s.pid === e.pid)!.id; }
    room.begin();
    console.log(`[${new Date().toISOString()}] ${PVP_MODES[mode].name} 开始：${seats.map((s) => `${s.name}${s.bot ? '(AI)' : ''}/${s.team}`).join('，')}`);
  }

  // ------------------------------------------------------------ 结算

  private settle(room: PvpRoom, res: PvpMatchResult): Map<number, PvpRatingChange> {
    const out = new Map<number, PvpRatingChange>();
    const mode = room.mode;
    const teamRating = [0, 1].map((t) => {
      const ss = room.seats.filter((s) => s.team === t);
      return ss.reduce((a, s) => a + s.rating, 0) / Math.max(1, ss.length);
    });
    const at = Date.now();
    for (const s of room.seats) {
      if (s.bot || !s.pid) continue;
      const p = this.players.get(s.pid);
      if (!p) continue;
      const r = this.rec(p, mode);
      const score = s.left ? 0 : res.winner < 0 ? 0.5 : res.winner === s.team ? 1 : 0;
      const vsBots = room.seats.filter((x) => x.team !== s.team).every((x) => x.bot);
      const delta = eloDelta(mode === '1v1' ? s.rating : teamRating[s.team], teamRating[1 - s.team], score, kFactor(r.games, mode, vsBots));
      const before = Math.round(r.rating);
      r.rating = Math.max(0, r.rating + delta);
      r.best = Math.max(r.best, r.rating);
      r.games++;
      if (score === 1) { r.wins++; r.streak = r.streak > 0 ? r.streak + 1 : 1; }
      else if (score === 0) { r.losses++; r.streak = r.streak < 0 ? r.streak - 1 : -1; }
      else { r.draws++; r.streak = 0; }
      r.dex = buildDex(s.build);
      p.last = at;
      const opp = room.seats.filter((x) => x.team !== s.team).map((x) => x.name).join('、');
      p.history.unshift({ at, mode, result: score === 1 ? 'win' : score === 0 ? 'loss' : 'draw', delta, dex: formOf(s.build.line, s.build.stage).dex, opp });
      p.history.length = Math.min(p.history.length, 12);
      for (const g of this.ghosts) if (g.pid === p.pid) g.rating = r.rating;
      this.touch();
      out.set(s.id, { mode, before, after: Math.round(r.rating), delta, record: this.record(p, mode) });
    }
    return out;
  }

  stats() {
    let playing = 0;
    for (const r of this.rooms) if (!r.ended) playing += r.seats.filter((s) => s.conn && !s.left).length;
    return { queue: this.queue.length, playing };
  }
}
