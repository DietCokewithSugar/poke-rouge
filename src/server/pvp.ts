/**
 * 对战服务：匹配队列（优先匹配分数接近的玩家，等得越久范围越大，超时由 AI 训练家补位）、
 * Elo 积分与段位、排行榜。数据全部放在内存里，改动过的记录定时写进存储（Supabase 或 JSON 文件）。
 */
import crypto from 'node:crypto';
import type { PvpBoardRow, PvpRatingChange, PvpRecord, S2C } from '../shared/protocol';
import { PROTOCOL_VERSION } from '../shared/protocol';
import { GYMS } from '../shared/gyms';
import { cleanRun, compareRuns, type RankKind, type RankRow } from '../shared/ranks';
import { Rng } from '../shared/rng';
import { cleanMeta, cleanName, type Conn } from '../shared/room';
import { NPC_NAMES, buildDex, fillTeam, generateTeam, npcTrainer, teamLevel, teamPower, validateBuild, validateTeam, type SavedBuild } from '../shared/pvp/build';
import { trainerOf } from '../shared/trainers';
import { START_RATING, eloDelta, kFactor } from '../shared/pvp/rating';
import { PvpRoom, type PvpSeat } from '../shared/pvp/room';
import { PVP_MODES, PVP_MODE_IDS, type PvpMatchResult, type PvpMode } from '../shared/pvp/sim';
import { FilePvpStore, ghostId, type Ghost, type ModeRec, type PvpData, type PvpStore, type StoredPlayer } from './pvpstore';

export interface PvpClient {
  conn: Conn;
  pvp: PvpRoom | null;
  pvpId: number;
  send(msg: S2C): void;
}

interface Entry { c: PvpClient; pid: string; name: string; team: SavedBuild[]; own: SavedBuild[]; auto: boolean; meta: Record<string, number>; trainer: string; rating: number; power: number; mode: PvpMode; at: number }

const MAX_GHOSTS = 400;

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const freshRec = (): ModeRec => ({ rating: START_RATING, best: START_RATING, wins: 0, losses: 0, draws: 0, streak: 0, games: 0, dex: 0 });
const avgPower = (team: SavedBuild[]) => teamPower(team) / Math.max(1, team.length);

export class PvpService {
  players = new Map<string, StoredPlayer>();
  ghosts: Ghost[] = [];
  queue: Entry[] = [];
  rooms = new Set<PvpRoom>();
  /** 读完存储里的数据后完成（文件存储是立刻完成的；读 Supabase 失败时每 30 秒重试） */
  readonly ready: Promise<void>;
  /** 数据读完之前不接受会写入的操作：否则写回去会覆盖数据库里原有的积分 */
  private loaded = false;
  private store: PvpStore;
  private rng = new Rng(Date.now() & 0x7fffffff);
  /** 改动过、还没写回存储的训练家（pid）和 AI 构筑（id） */
  private dirtyPlayers = new Set<string>();
  private dirtyGhosts = new Set<string>();
  private removedGhosts = new Set<string>();
  private saving: Promise<void> | null = null;
  private lastSave = 0;
  private seq = 0;
  private boards = new Map<PvpMode, StoredPlayer[]>();
  /** 冒险与道馆排行榜的排序缓存（数据变化时清空） */
  private ranks = new Map<string, StoredPlayer[]>();

  /** store：存储；传文件路径时存在 JSON 文件里 */
  constructor(store: PvpStore | string, private botAfter: Record<PvpMode, number>) {
    this.store = typeof store === 'string' ? new FilePvpStore(store) : store;
    this.ready = this.load();
  }

  // ------------------------------------------------------------ 持久化

  private load(): Promise<void> {
    let data: PvpData | Promise<PvpData>;
    try {
      data = this.store.load();
    } catch (err) {
      // 文件坏了：从空的开始（和以前一样）
      console.error('对战数据读取失败', err);
      data = { players: [], ghosts: [] };
    }
    if (!(data instanceof Promise)) {
      this.apply(data);
      return Promise.resolve();
    }
    return data.then((d) => this.apply(d), (err) => {
      console.error('对战数据读取失败（建好数据表了吗？），30 秒后重试：', err instanceof Error ? err.message : err);
      return new Promise<void>((r) => setTimeout(r, 30_000).unref()).then(() => this.load());
    });
  }

  private apply(data: PvpData) {
    this.loaded = true;
    for (const p of data.players) this.players.set(p.pid, p);
    // 旧数据每个 AI 构筑只有一只宝可梦，也没有 id
    this.ghosts = (data.ghosts as (Ghost & { build?: SavedBuild })[]).map(({ build, ...g }) => {
      const team = Array.isArray(g.team) ? g.team : build ? [build] : [];
      return { ...g, team, id: g.id || ghostId(g.pid, team) };
    }).filter((g) => g.team.length > 0 && g.team.every((b) => typeof validateBuild(b) !== 'string'));
    console.log(`对战数据已从${this.store.name}载入：${this.players.size} 位训练家，${this.ghosts.length} 个 AI 构筑`);
  }

  get unsaved() { return this.dirtyPlayers.size + this.dirtyGhosts.size + this.removedGhosts.size > 0; }

  /** 把改动写回存储；写入 Supabase 时返回 Promise，失败的改动留到下次再写 */
  saveNow(): void | Promise<void> {
    if (this.saving) return this.saving;
    if (!this.unsaved || !this.loaded) return;
    const pids = [...this.dirtyPlayers], gids = [...this.dirtyGhosts], removed = [...this.removedGhosts];
    this.dirtyPlayers.clear(); this.dirtyGhosts.clear(); this.removedGhosts.clear();
    this.lastSave = Date.now();
    const keep = new Set(gids);
    const restore = (err: unknown) => {
      console.error('对战数据保存失败，稍后再试', err);
      for (const pid of pids) this.dirtyPlayers.add(pid);
      for (const id of gids) if (!this.removedGhosts.has(id)) this.dirtyGhosts.add(id);
      for (const id of removed) if (!this.dirtyGhosts.has(id)) this.removedGhosts.add(id);
    };
    try {
      const r = this.store.save({
        players: pids.map((pid) => this.players.get(pid)).filter((p): p is StoredPlayer => !!p),
        ghosts: this.ghosts.filter((g) => keep.has(g.id)), removedGhosts: removed,
        all: { players: [...this.players.values()], ghosts: this.ghosts },
      });
      if (r instanceof Promise) {
        this.saving = r.catch(restore).finally(() => { this.saving = null; });
        return this.saving;
      }
    } catch (err) {
      restore(err);
    }
  }

  /** 数据变了：排行榜缓存作废；p 为需要写回的训练家 */
  private touch(p?: StoredPlayer) {
    if (p) this.dirtyPlayers.add(p.pid);
    this.boards.clear();
    this.ranks.clear();
  }

  private touchGhost(g: Ghost) {
    this.dirtyGhosts.add(g.id);
    this.removedGhosts.delete(g.id);
  }

  private dropGhost(g: Ghost) {
    this.dirtyGhosts.delete(g.id);
    this.removedGhosts.add(g.id);
  }

  // ------------------------------------------------------------ 身份与战绩

  private auth(pid: unknown, secret: unknown, name?: string, create = false): StoredPlayer | string | null {
    if (typeof pid !== 'string' || !/^[a-z0-9]{12,32}$/.test(pid) || typeof secret !== 'string' || secret.length < 16 || secret.length > 64) return '对战身份无效';
    const p = this.players.get(pid);
    if (!p) {
      if (!create) return null;
      if (!this.loaded) return '对战服务正在准备中，请稍后再试';
      const np: StoredPlayer = { pid, hash: hash(secret), name: cleanName(name), created: Date.now(), last: Date.now(), modes: {}, history: [] };
      this.players.set(pid, np);
      this.touch(np);
      return np;
    }
    if (p.hash !== hash(secret)) return '对战身份校验失败';
    if (name && cleanName(name) !== p.name) { p.name = cleanName(name); this.touch(p); }
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
      return {
        rank: i + 1, name: p.name, rating: Math.round(r.rating), wins: r.wins, losses: r.losses, draws: r.draws, streak: r.streak, dex: r.dex,
        shiny: r.shiny || undefined, you: p === meP || undefined,
      };
    });
    return { t: 'pvpBoard', mode, rows, me: meP ? this.record(meP, mode) : null, players: list.length, history: meP ? meP.history.slice(0, 10) : [] };
  }

  // ------------------------------------------------------------ 冒险与道馆排行榜

  /** 冒险结束后上报：只留最好的一次 */
  reportRun(msg: { pid: unknown; secret: unknown; name: unknown; run: unknown }): string | null {
    const run = cleanRun(msg.run);
    if (!run) return '成绩数据无效';
    const p = this.auth(msg.pid, msg.secret, String(msg.name ?? ''), true);
    if (!p || typeof p === 'string') return p ?? '对战身份无效';
    if (p.run && compareRuns(run, p.run) >= 0) return null;
    p.run = { ...run, at: Date.now() };
    p.last = Date.now();
    this.touch(p);
    return null;
  }

  /** 拿到新徽章后上报：徽章变多才更新时间 */
  reportGym(msg: { pid: unknown; secret: unknown; name: unknown; badges: unknown; dex: unknown; shiny?: unknown }): string | null {
    const badges = Number(msg.badges);
    if (!Number.isInteger(badges) || badges < 1 || badges > GYMS.length) return '徽章数据无效';
    const p = this.auth(msg.pid, msg.secret, String(msg.name ?? ''), true);
    if (!p || typeof p === 'string') return p ?? '对战身份无效';
    const dex = Number.isInteger(msg.dex) && (msg.dex as number) >= 1 && (msg.dex as number) <= 151 ? (msg.dex as number) : 25;
    const shiny = msg.shiny === true || undefined;
    if (p.gym && badges <= p.gym.badges) {
      if (p.gym.dex !== dex || p.gym.shiny !== shiny) {
        p.gym.dex = dex;
        p.gym.shiny = shiny;
        this.touch(p);
      }
      return null;
    }
    p.gym = { badges, at: Date.now(), dex, shiny };
    p.last = Date.now();
    this.touch(p);
    return null;
  }

  private rankList(kind: RankKind) {
    const key = `rank:${kind}`;
    let list = this.ranks.get(key);
    if (!list) {
      list = kind === 'adventure'
        ? [...this.players.values()].filter((p) => p.run).sort((a, b) => compareRuns(a.run!, b.run!) || a.run!.at - b.run!.at)
        : [...this.players.values()].filter((p) => p.gym).sort((a, b) => b.gym!.badges - a.gym!.badges || a.gym!.at - b.gym!.at);
      this.ranks.set(key, list);
    }
    return list;
  }

  rankBoard(kind: RankKind, pid?: unknown, secret?: unknown): Extract<S2C, { t: 'rankBoard' }> {
    if (kind !== 'adventure' && kind !== 'gym') kind = 'adventure';
    const list = this.rankList(kind);
    const me = pid ? this.auth(pid, secret) : null;
    const meP = me && typeof me !== 'string' ? me : null;
    const row = (p: StoredPlayer, i: number): RankRow => {
      if (kind === 'adventure') {
        const { at: _at, ...run } = p.run!;
        return { rank: i + 1, name: p.name, dex: run.dex, shiny: run.shiny, run, you: p === meP || undefined };
      }
      return { rank: i + 1, name: p.name, dex: p.gym!.dex, shiny: p.gym!.shiny, badges: p.gym!.badges, at: p.gym!.at, you: p === meP || undefined };
    };
    const rows = list.slice(0, 50).map(row);
    const mi = meP ? list.indexOf(meP) : -1;
    return { t: 'rankBoard', kind, rows, me: mi >= 0 ? row(meP!, mi) : null, players: list.length };
  }

  // ------------------------------------------------------------ 队列

  queued(c: PvpClient) { return this.queue.some((e) => e.c === c); }

  enqueue(c: PvpClient, msg: { mode: unknown; team: unknown; name: unknown; meta: unknown; v: unknown; pid: unknown; secret: unknown; trainer?: unknown; auto?: unknown }): string | null {
    if (msg.v !== PROTOCOL_VERSION) return '客户端版本与服务器不一致，请刷新页面';
    const mode = msg.mode as PvpMode;
    if (!PVP_MODE_IDS.includes(mode)) return '未知的对战模式';
    if (c.pvp && !c.pvp.ended) return '你已经在对战中';
    const own = validateTeam(msg.team, PVP_MODES[mode].team);
    if (typeof own === 'string') return own;
    const p = this.auth(msg.pid, msg.secret, String(msg.name ?? ''), true);
    if (!p || typeof p === 'string') return p ?? '对战身份无效';
    if (this.queue.some((e) => e.pid === p.pid && e.c !== c)) return '这个对战身份已经在匹配中（是不是开了两个页面？）';
    for (const r of this.rooms) if (!r.ended && r.seats.some((s) => s.pid === p.pid && s.conn && !s.left)) return '这个对战身份正在对战中';
    this.cancel(c);
    const meta = cleanMeta(msg.meta);
    const team = fillTeam(this.rng, own, PVP_MODES[mode].team);
    const e: Entry = { c, pid: p.pid, name: p.name, team, own, auto: msg.auto === true, meta, trainer: trainerOf(msg.trainer).id, rating: this.rec(p, mode).rating, power: avgPower(team), mode, at: Date.now() };
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

  /** 只记下玩家自己的宝可梦（不含借来的） */
  private addGhost(e: Entry) {
    const id = ghostId(e.pid, e.own);
    this.ghosts = this.ghosts.filter((g) => g.id !== id);
    const g: Ghost = { id, pid: e.pid, name: e.name, team: e.own, meta: e.meta, trainer: e.trainer, rating: e.rating, power: avgPower(e.own), at: Date.now() };
    this.ghosts.push(g);
    this.touchGhost(g);
    if (this.ghosts.length > MAX_GHOSTS) for (const old of this.ghosts.splice(0, this.ghosts.length - MAX_GHOSTS)) this.dropGhost(old);
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
    if (this.unsaved && now - this.lastSave > 5000) void this.saveNow();
  }

  /** 选一个 AI 对手：优先用其他玩家放进队列过的队伍（强度接近），没有就现场生成 */
  private botSeat(id: number, mode: PvpMode, near: Entry, exclude: Set<string>, rating: number, names: Set<string>): PvpSeat {
    const size = PVP_MODES[mode].team;
    const cands = this.ghosts.filter((g) => !exclude.has(g.pid))
      .map((g) => ({ g, d: Math.abs(g.power - near.power) / Math.max(50, near.power) + Math.abs(g.rating - near.rating) / 2000 }))
      .sort((a, b) => a.d - b.d);
    const top = cands.filter((c) => c.d < 0.35 && !names.has(c.g.name)).slice(0, 6);
    if (top.length) {
      const g = this.rng.pick(top).g;
      exclude.add(g.pid);
      names.add(g.name);
      return { id, name: g.name, team: 0, builds: fillTeam(this.rng, g.team, size), meta: g.meta, trainer: trainerOf(g.trainer).id, conn: null, bot: true, rating };
    }
    const builds = generateTeam(this.rng, teamLevel(near.team), size);
    const free = NPC_NAMES.filter((n) => !names.has(n));
    const name = free.length ? this.rng.pick(free) : `训练家${id}`;
    names.add(name);
    return { id, name, team: 0, builds, meta: near.meta, trainer: npcTrainer(this.rng, name), conn: null, bot: true, rating };
  }

  private startMatch(mode: PvpMode, group: Entry[]) {
    const need = PVP_MODES[mode].size * 2;
    const exclude = new Set(group.map((e) => e.pid));
    const avg = group.reduce((a, e) => a + e.rating, 0) / group.length;
    let id = 1;
    const seats: PvpSeat[] = group.map((e) => ({ id: id++, name: e.name, team: 0, builds: e.team, meta: e.meta, trainer: e.trainer, conn: e.c.conn, bot: false, rating: e.rating, pid: e.pid, auto: e.auto }));
    const names = new Set(group.map((e) => e.name));
    while (seats.length < need) seats.push(this.botSeat(id++, mode, this.rng.pick(group), exclude, avg, names));
    // 按队伍强度蛇形分队，让两队实力接近
    const order = seats.slice().sort((a, b) => teamPower(b.builds) - teamPower(a.builds));
    const snake = [0, 1, 1, 0, 0, 1, 1, 0];
    order.forEach((s, i) => { s.team = snake[i % 8]; });
    if (mode === '1v1' && seats[0].team === seats[1].team) seats[1].team = 1 - seats[0].team;
    const room = new PvpRoom(`对战${++this.seq}`, mode, seats);
    room.onEnd = (res) => this.settle(room, res);
    this.rooms.add(room);
    for (const e of group) { e.c.pvp = room; e.c.pvpId = seats.find((s) => s.pid === e.pid)!.unit!; }
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
      r.dex = buildDex(s.builds[0]);
      r.shiny = s.builds[0].shiny || undefined;
      p.last = at;
      const opp = room.seats.filter((x) => x.team !== s.team).map((x) => x.name).join('、');
      p.history.unshift({ at, mode, result: score === 1 ? 'win' : score === 0 ? 'loss' : 'draw', delta, dex: r.dex, shiny: r.shiny, opp });
      p.history.length = Math.min(p.history.length, 12);
      for (const g of this.ghosts) if (g.pid === p.pid) { g.rating = r.rating; this.touchGhost(g); }
      this.touch(p);
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
