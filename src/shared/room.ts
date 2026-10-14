import { LINES, LINE_IDS, formOf, type LineId } from './pokemon';
import { DIFFICULTY_IDS, type DifficultyId } from './difficulty';
import { MAX_PLAYERS, PROTOCOL_VERSION, encodeSnapshot, type C2S, type LobbyPlayer, type RoomInfo, type S2C } from './protocol';
import { GameSim, TICK_RATE } from './sim/game';

export interface Conn {
  send(data: string | ArrayBuffer): void;
}

interface Member {
  conn: Conn;
  name: string;
  meta: Record<string, number>;
  line: LineId | null;
  ready: boolean;
  joinedAt: number;
}

const SNAPSHOT_EVERY = 2;
const STATE_EVERY = 6;

export function cleanName(name: unknown): string {
  const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return s || '训练家';
}

function cleanMeta(meta: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && k.length < 24) out[k] = Math.max(0, Math.min(20, Math.floor(v)));
    }
  }
  return out;
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
  onEmpty?: () => void;

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
  join(conn: Conn, name: string, meta: unknown, v: number): number | string {
    if (v !== PROTOCOL_VERSION) return '客户端版本与服务器不一致，请刷新页面';
    if (this.members.size >= (this.solo ? 1 : MAX_PLAYERS)) return '房间已满（最多 4 人）';
    if (this.sim) return '该房间正在游戏中，请等待本局结束';
    let id = 1;
    while (this.members.has(id)) id++;
    this.members.set(id, { conn, name: cleanName(name), meta: cleanMeta(meta), line: null, ready: false, joinedAt: ++this.joinSeq });
    this.send(conn, { t: 'joined', code: this.code, you: id, solo: this.solo });
    this.sendLobby();
    return id;
  }

  leave(id: number) {
    if (!this.members.delete(id)) return;
    if (this.sim) {
      this.sim.removePlayer(id);
      if (!this.members.size) this.sim = null;
    }
    if (!this.members.size) { this.onEmpty?.(); return; }
    this.sendLobby();
  }

  lobbyPlayers(): LobbyPlayer[] {
    const host = this.hostId;
    return [...this.members.entries()].map(([id, m]) => ({ id, name: m.name, line: m.line, ready: m.ready, host: id === host }));
  }

  sendLobby() {
    this.broadcast({ t: 'lobby', code: this.code, players: this.lobbyPlayers(), inGame: this.inGame, difficulty: this.difficulty, public: this.isPublic });
  }

  info(): RoomInfo {
    const host = this.members.get(this.hostId);
    return {
      code: this.code,
      host: host?.name ?? '',
      players: [...this.members.values()].map((m) => ({ name: m.name, line: m.line })),
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
        if (this.sim || !LINE_IDS.includes(msg.line)) return;
        m.line = msg.line;
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
        else if (msg.cmd === 'endWave') sim.waveT = sim.waveDur;
        else if (msg.cmd === 'xp') sim.debugXp(p, 400);
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
      case 'pos':
        if (this.sim && !this.paused) this.sim.setPlayerPos(id, +msg.x, +msg.y, !!msg.m, +msg.d);
        return;
      case 'create':
      case 'join':
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
    const inits = [...this.members.entries()].map(([id, m]) => ({ id, name: m.name, line: m.line!, meta: m.meta }));
    this.sim = new GameSim(inits, (Math.random() * 2 ** 31) | 0, this.difficulty);
    this.tick = 0;
    this.paused = false;
    this.lastPhase = '';
    this.broadcast({ t: 'start', w: this.sim.w, h: this.sim.h, players: inits.map((i) => ({ id: i.id, name: i.name, line: i.line })) });
    this.broadcast({ t: 'ev', e: this.sim.flushEvents() });
    this.sendPublic();
    for (const p of this.sim.players) this.sim.dirty.add(p.id);
    this.flushPrivate();
  }

  /** 以 TICK_RATE 调用一次。 */
  update() {
    const sim = this.sim;
    if (!sim || this.paused) return;
    sim.step(1 / TICK_RATE);
    this.tick++;
    if (this.tick % SNAPSHOT_EVERY === 0 || sim.phase !== this.lastPhase) {
      const snap = encodeSnapshot(sim, this.tick);
      for (const m of this.members.values()) m.conn.send(snap);
      const ev = sim.flushEvents();
      if (ev.length) this.broadcast({ t: 'ev', e: ev });
    }
    if (sim.phase !== this.lastPhase || this.tick % STATE_EVERY === 0) {
      this.lastPhase = sim.phase;
      this.sendPublic();
    }
    if (sim.phase === 'wave' && this.tick % STATE_EVERY === 3) for (const p of sim.players) sim.dirty.add(p.id);
    this.flushPrivate();
    if (sim.phase === 'over' || sim.phase === 'won') this.endGame();
  }

  private sendPublic() {
    if (this.sim) this.broadcast({ t: 'st', s: this.sim.publicState() });
  }

  private flushPrivate() {
    const sim = this.sim;
    if (!sim) return;
    for (const id of sim.dirty) {
      const p = sim.players.find((q) => q.id === id);
      const m = this.members.get(id);
      if (p && m) this.send(m.conn, { t: 'me', s: sim.privateState(p) });
    }
    sim.dirty.clear();
  }

  private endGame() {
    const sim = this.sim!;
    const board = sim.players.map((p) => ({ id: p.id, name: p.name, line: p.line, dex: formOf(p.line, p.stage).dex, level: p.level, kills: p.stats.kills, damage: Math.round(p.stats.damage), taken: Math.round(p.stats.taken), revives: p.stats.revives }));
    for (const [id, m] of this.members) {
      const p = sim.players.find((q) => q.id === id);
      this.send(m.conn, { t: 'end', victory: sim.phase === 'won', summary: p ? sim.summary(p) : null, board });
    }
    this.sim = null;
    for (const m of this.members.values()) m.ready = false;
    this.sendLobby();
  }
}

export function lineName(id: LineId) { return LINES[id].name; }
