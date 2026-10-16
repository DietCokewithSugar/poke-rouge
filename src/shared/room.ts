import { LINES, formOf, isLine, type LineId } from './pokemon';
import { DIFFICULTY_IDS, type DifficultyId } from './difficulty';
import { pickupCode } from './pickups';
import { MAX_PLAYERS, PROTOCOL_VERSION, encodeSnapshot, type C2S, type JoinIdentity, type LobbyPlayer, type RoomInfo, type S2C } from './protocol';
import { trainerOf } from './trainers';
import { PeerSync, cullEvents, type Conn } from './netsync';
import { GameSim, TICK_RATE, type Ev } from './sim/game';

export type { Conn } from './netsync';

interface Member {
  conn: Conn;
  name: string;
  meta: Record<string, number>;
  trainer: string;
  owned: string[];
  ownedShiny: string[];
  line: LineId | null;
  /** 带来的伙伴是闪光宝可梦 */
  shiny: boolean;
  ready: boolean;
  joinedAt: number;
  sync: PeerSync;
  /** 对局中离开或断线后，凭它回到这局冒险 */
  token: string;
}

const SNAPSHOT_EVERY = 2;
const STATE_EVERY = 6;
/** 对局中所有人都离开了：模拟暂停，这么久（毫秒）还没人回来就结束这局 */
export const AWAY_TTL = 5 * 60 * 1000;

function newToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
}

export function cleanName(name: unknown): string {
  const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return s || '训练家';
}

export function cleanMeta(meta: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && k.length < 24) out[k] = Math.max(0, Math.min(20, Math.floor(v)));
    }
  }
  return out;
}

export function cleanOwned(owned: unknown): string[] {
  if (!Array.isArray(owned)) return [];
  return [...new Set(owned.filter(isLine))].slice(0, 200);
}

/** 一个房间：大厅（选精灵/准备）+ 对局（权威模拟）。服务器与单人模式共用。 */
export class Room {
  static allowDebug = false;
  readonly code: string;
  readonly solo: boolean;
  members = new Map<number, Member>();
  sim: GameSim | null = null;
  paused = false;
  difficulty: DifficultyId = 'easy';
  /** 公开房间会出现在匹配大厅的列表里 */
  isPublic = true;
  private tick = 0;
  private lastPhase = '';
  private joinSeq = 0;
  /** 对局中离开房间的玩家：AI 替他继续战斗，凭 token 回来 */
  away = new Map<number, Member>();
  /** 所有人都离开的时间（期间模拟暂停） */
  private emptySince = 0;
  onEmpty?: () => void;
  /** 对局结束时还没回来的玩家：把结算消息交给服务器暂存，回来时再发给他 */
  onAwayEnd?: (token: string, msg: string) => void;

  constructor(code: string, solo = false) {
    this.code = code;
    this.solo = solo;
  }

  get hostId(): number {
    let best = -1, at = Infinity;
    for (const [id, m] of this.members) if (m.joinedAt < at) { at = m.joinedAt; best = id; }
    return best;
  }

  get inGame() { return !!this.sim; }

  private send(conn: Conn, msg: S2C) { conn.send(JSON.stringify(msg)); }
  private broadcast(msg: S2C) {
    const s = JSON.stringify(msg);
    for (const m of this.members.values()) m.conn.send(s);
  }

  /** 加入房间，返回房间内的玩家编号（1~4），失败时返回错误信息。 */
  join(conn: Conn, name: string, meta: unknown, v: number, ident: JoinIdentity = {}): number | string {
    if (v !== PROTOCOL_VERSION) return '客户端版本与服务器不一致，请刷新页面';
    if (this.members.size + this.away.size >= (this.solo ? 1 : MAX_PLAYERS)) return '房间已满（最多 4 人）';
    if (this.sim) return '该房间正在游戏中，请等待本局结束';
    let id = 1;
    while (this.members.has(id) || this.away.has(id)) id++;
    const line = isLine(ident.line) ? ident.line : null;
    const token = newToken();
    this.members.set(id, {
      conn, name: cleanName(name), meta: cleanMeta(meta), trainer: trainerOf(ident.trainer).id,
      owned: cleanOwned(ident.owned), ownedShiny: cleanOwned(ident.ownedShiny),
      line, shiny: !!line && ident.shiny === true, ready: false, joinedAt: ++this.joinSeq, sync: new PeerSync(), token,
    });
    this.send(conn, { t: 'joined', code: this.code, you: id, solo: this.solo, token });
    this.sendLobby();
    return id;
  }

  /** 离开房间。conn：只有当前连接才算数（重连后旧连接才断开时不影响新连接） */
  leave(id: number, conn?: Conn) {
    const m = this.members.get(id);
    if (!m || (conn && m.conn !== conn)) return;
    this.members.delete(id);
    const sim = this.sim;
    if (sim && !this.solo && sim.phase !== 'over' && sim.phase !== 'won' && sim.players.some((p) => p.id === id)) {
      // 对局中离开：AI 先替他战斗，可以凭 token 回来
      this.away.set(id, m);
      sim.setAway(id, true);
      if (!this.members.size) this.emptySince = performance.now();
      return;
    }
    if (sim) {
      sim.removePlayer(id);
      if (!this.members.size) this.sim = null;
    }
    if (!this.members.size) { this.onEmpty?.(); return; }
    this.sendLobby();
  }

  /** 回到正在进行的冒险：返回玩家编号，失败时返回原因 */
  rejoin(conn: Conn, token: string, v: number): number | string {
    if (v !== PROTOCOL_VERSION) return '客户端版本与服务器不一致，请刷新页面';
    if (!token) return '这局冒险已经结束了';
    // 断线后服务器还没发现：旧连接还挂着，直接换成新连接
    for (const [id, m] of this.members) {
      if (m.token !== token) continue;
      m.conn = conn;
      m.sync = new PeerSync();
      this.resync(id, m);
      return id;
    }
    const sim = this.sim;
    for (const [id, m] of this.away) {
      if (m.token !== token || !sim) continue;
      this.away.delete(id);
      m.conn = conn;
      m.sync = new PeerSync();
      this.members.set(id, m);
      sim.setAway(id, false);
      this.resync(id, m);
      return id;
    }
    return '这局冒险已经结束了';
  }

  /** 回到对局：重新发开局信息和现在的状态（地上的掉落物、场上的闪光宝可梦） */
  private resync(id: number, m: Member) {
    this.send(m.conn, { t: 'joined', code: this.code, you: id, solo: this.solo, token: m.token });
    const sim = this.sim;
    if (!sim) { this.sendLobby(); return; }
    this.send(m.conn, { t: 'start', w: sim.w, h: sim.h, players: this.startPlayers() });
    const ev: Ev[] = [];
    for (const pk of sim.pickups) ev.push(['drop', pk.id, pickupCode(pk.kind), Math.round(pk.x), Math.round(pk.y), Math.round(pk.value * 10) / 10]);
    for (const e of sim.enemies) if (e.shiny && !e.dead) ev.push(['shiny', e.id, e.kind, Math.round(e.x), Math.round(e.y)]);
    if (ev.length) this.send(m.conn, { t: 'ev', e: ev });
    this.send(m.conn, { t: 'st', s: sim.publicState() });
    if (this.paused) this.send(m.conn, { t: 'paused', on: true });
    sim.dirty.add(id);
    this.flushPrivate();
  }

  private startPlayers() {
    return this.sim!.players.map((p) => ({ id: p.id, name: p.name, trainer: p.trainer, line: p.line, shiny: p.shiny || undefined }));
  }

  lobbyPlayers(): LobbyPlayer[] {
    const host = this.hostId;
    return [...this.members.entries()].map(([id, m]) => ({ id, name: m.name, trainer: m.trainer, line: m.line, shiny: m.shiny || undefined, ready: m.ready, host: id === host }));
  }

  sendLobby() {
    this.broadcast({ t: 'lobby', code: this.code, players: this.lobbyPlayers(), inGame: this.inGame, difficulty: this.difficulty, public: this.isPublic });
  }

  info(): RoomInfo {
    const host = this.members.get(this.hostId);
    return {
      code: this.code,
      host: host?.name ?? '',
      players: [...this.members.values(), ...this.away.values()].map((m) => ({ name: m.name, trainer: m.trainer, line: m.line, shiny: m.shiny || undefined })),
      max: MAX_PLAYERS,
      inGame: this.inGame,
      wave: this.sim?.wave ?? 0,
      difficulty: this.difficulty,
    };
  }

  handle(id: number, msg: C2S) {
    const m = this.members.get(id);
    if (!m || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'pick':
        if (this.sim || !isLine(msg.line)) return;
        m.line = msg.line;
        m.shiny = msg.shiny === true;
        this.sendLobby();
        return;
      case 'ready':
        if (this.sim) return;
        m.ready = !!msg.on;
        this.sendLobby();
        return;
      case 'start': {
        if (this.sim) return;
        if (id !== this.hostId) return this.send(m.conn, { t: 'error', msg: '只有房主可以开始游戏' });
        const err = this.startError();
        if (err) return this.send(m.conn, { t: 'error', msg: err });
        this.startGame();
        return;
      }
      case 'leave':
        this.leave(id);
        return;
      case 'difficulty':
        if (this.sim || id !== this.hostId || !DIFFICULTY_IDS.includes(msg.id)) return;
        this.difficulty = msg.id;
        this.sendLobby();
        return;
      case 'visibility':
        if (id !== this.hostId) return;
        this.isPublic = !!msg.public;
        this.sendLobby();
        return;
      case 'browse':
      case 'stats':
        return;
      case 'debug': {
        // 仅在服务器以 POKE_DEBUG=1 启动（或本地单人调试）时可用，方便测试
        const sim = this.sim;
        const p = sim?.players.find((q) => q.id === id);
        if (!Room.allowDebug || !sim || !p) return;
        if (msg.cmd === 'down') sim.downPlayer(p);
        else if (msg.cmd === 'downAll') for (const q of sim.players) sim.downPlayer(q);
        else if (msg.cmd === 'endWave') sim.waveT = sim.waveDur;
        else if (msg.cmd === 'xp') sim.debugXp(p, 400);
        else if (msg.cmd === 'shiny') sim.forceShiny += 3;
        else if (msg.cmd === 'items') sim.debugItems(p);
        return;
      }
      case 'pause':
        if (this.solo && this.sim) {
          this.paused = !!msg.on;
          this.broadcast({ t: 'paused', on: this.paused });
        }
        return;
      case 'ping':
        this.send(m.conn, { t: 'pong', at: msg.at });
        return;
      case 'auto':
        this.sim?.setAuto(id, !!msg.on);
        return;
      case 'pos':
        if (this.sim && !this.paused) this.sim.setPlayerPos(id, +msg.x, +msg.y, !!msg.m, +msg.d);
        if (msg.k !== undefined) m.sync.ack(+msg.k, performance.now());
        return;
      case 'ack':
        m.sync.ack(+msg.k, performance.now());
        return;
      case 'view':
        m.sync.setView(+msg.w, +msg.h);
        return;
      case 'create':
      case 'join':
      case 'rejoin':
      case 'pvpQueue':
      case 'pvpCancel':
      case 'pvpBoard':
      case 'runReport':
      case 'gymReport':
      case 'rankBoard':
      case 'presence':
      case 'tpos':
        return;
      default:
        if (!this.sim) return;
        {
          const err = this.sim.command(id, msg);
          if (err) this.send(m.conn, { t: 'cmdErr', msg: err });
          this.flushPrivate();
          if (this.sim.phase === 'inter') this.sendPublic();
        }
    }
  }

  startError(): string | null {
    const ms = [...this.members.values()];
    if (ms.some((x) => !x.line)) return '还有玩家没有选择宝可梦';
    const host = this.hostId;
    if (!this.solo && [...this.members.entries()].some(([mid, x]) => mid !== host && !x.ready)) return '还有玩家没有准备';
    return null;
  }

  private startGame() {
    const inits = [...this.members.entries()].map(([id, m]) => ({ id, name: m.name, line: m.line!, shiny: m.shiny, meta: m.meta, trainer: m.trainer, owned: m.owned, ownedShiny: m.ownedShiny }));
    this.sim = new GameSim(inits, (Math.random() * 2 ** 31) | 0, this.difficulty);
    this.tick = 0;
    this.paused = false;
    this.lastPhase = '';
    this.broadcast({ t: 'start', w: this.sim.w, h: this.sim.h, players: inits.map((i) => ({ id: i.id, name: i.name, trainer: i.trainer, line: i.line, shiny: i.shiny || undefined })) });
    this.broadcast({ t: 'ev', e: this.sim.flushEvents() });
    this.sendPublic();
    for (const m of this.members.values()) m.sync.reset();
    for (const p of this.sim.players) this.sim.dirty.add(p.id);
    this.flushPrivate();
  }

  /** 以 TICK_RATE 调用一次。 */
  update() {
    const sim = this.sim;
    if (!sim || this.paused) return;
    if (!this.members.size) {
      // 所有人都离开了：暂停等人回来，太久没人回来就结束这局（结算照样留给他们）
      if (performance.now() - this.emptySince > AWAY_TTL) this.endGame();
      return;
    }
    sim.step(1 / TICK_RATE);
    this.tick++;
    const phaseChanged = sim.phase !== this.lastPhase;
    if (this.tick % SNAPSHOT_EVERY === 0 || phaseChanged) {
      const ev = sim.flushEvents();
      if (this.solo) {
        const snap = encodeSnapshot(sim, this.tick);
        for (const m of this.members.values()) {
          m.conn.send(snap);
          if (ev.length) m.conn.send(JSON.stringify({ t: 'ev', e: ev } satisfies S2C));
        }
      } else {
        for (const [id, m] of this.members) this.sendFrame(sim, id, m, ev, phaseChanged);
      }
    }
    if (sim.phase !== this.lastPhase || this.tick % STATE_EVERY === 0) {
      const force = sim.phase !== this.lastPhase;
      this.lastPhase = sim.phase;
      this.sendPublic(force);
    }
    if (sim.phase === 'wave' && this.tick % STATE_EVERY === 3) for (const p of sim.players) sim.dirty.add(p.id);
    this.flushPrivate();
    if (sim.phase === 'over' || sim.phase === 'won') this.endGame();
  }

  /** 联机：按这位玩家的视野裁剪快照与特效；网络拥堵时降低快照频率、只发关键事件 */
  private sendFrame(sim: GameSim, id: number, m: Member, ev: ReturnType<GameSim['flushEvents']>, force: boolean) {
    const box = m.sync.box(sim.players.find((p) => p.id === id));
    const now = performance.now();
    const level = m.sync.congestion(now, m.conn.buffered?.() ?? 0);
    if (force || m.sync.shouldSend(this.tick, level)) {
      m.conn.send(encodeSnapshot(sim, this.tick, box), !force);
      m.sync.markSent(this.tick, now);
    }
    const list = cullEvents(ev, box, level > 0);
    if (list.length) m.conn.send(JSON.stringify({ t: 'ev', e: list } satisfies S2C));
  }

  /** force：阶段变化等必须马上发的情况；平时堵塞的连接只发三分之一 */
  private sendPublic(force = true) {
    if (!this.sim) return;
    const msg = JSON.stringify({ t: 'st', s: this.sim.publicState() } satisfies S2C);
    for (const m of this.members.values()) if (force || m.sync.level < 2 || this.tick % (STATE_EVERY * 3) === 0) m.conn.send(msg);
  }

  private flushPrivate() {
    const sim = this.sim;
    if (!sim) return;
    for (const id of sim.dirty) {
      const p = sim.players.find((q) => q.id === id);
      const m = this.members.get(id);
      if (!p || !m) continue;
      const msg = m.sync.privateMsg(sim, p);
      if (msg) m.conn.send(msg);
    }
    sim.dirty.clear();
  }

  private endGame() {
    const sim = this.sim!;
    const board = sim.players.map((p) => ({
      id: p.id, name: p.name, trainer: p.trainer, line: p.line, dex: formOf(p.line, p.stage).dex, shiny: p.shiny || undefined, level: p.level,
      kills: p.stats.kills, damage: Math.round(p.stats.damage), taken: Math.round(p.stats.taken), revives: p.stats.revives,
    }));
    const end = (id: number) => {
      const p = sim.players.find((q) => q.id === id);
      return JSON.stringify({ t: 'end', victory: sim.phase === 'won', summary: p ? sim.summary(p) : null, board } satisfies S2C);
    };
    for (const [id, m] of this.members) {
      const p = sim.players.find((q) => q.id === id);
      if (p) { m.owned = [...p.owned]; m.ownedShiny = [...p.ownedShiny]; }
      m.conn.send(end(id));
    }
    for (const [id, m] of this.away) this.onAwayEnd?.(m.token, end(id));
    this.away.clear();
    this.sim = null;
    for (const m of this.members.values()) m.ready = false;
    if (!this.members.size) { this.onEmpty?.(); return; }
    this.sendLobby();
  }
}

export function lineName(id: LineId) { return LINES[id].name; }
