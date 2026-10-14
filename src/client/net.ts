import type { C2S, S2C } from '../shared/protocol';
import { NPC_NAMES, generateBuild, type SavedBuild } from '../shared/pvp/build';
import { PvpRoom, type PvpSeat } from '../shared/pvp/room';
import { PVP_MODES, type PvpMode } from '../shared/pvp/sim';
import { Rng } from '../shared/rng';
import { Room } from '../shared/room';
import { TICK_RATE } from '../shared/sim/game';
import { SKILLS } from '../shared/skills';

export type Incoming = S2C | ArrayBuffer;

export interface Transport {
  readonly online: boolean;
  send(msg: C2S): void;
  close(): void;
  onMessage: (m: Incoming) => void;
  onClose: (reason: string) => void;
}

function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/^http/, 'ws').replace(/\/?$/, '/ws').replace(/\/ws\/ws$/, '/ws');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** 联机：连接服务器的 WebSocket。 */
export class WsTransport implements Transport {
  readonly online = true;
  private ws: WebSocket;
  private queue: string[] = [];
  private closed = false;
  onMessage: (m: Incoming) => void = () => {};
  onClose: (reason: string) => void = () => {};
  onOpen: () => void = () => {};
  get connected() { return this.ws.readyState === WebSocket.OPEN; }

  constructor() {
    this.ws = new WebSocket(serverUrl());
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      for (const q of this.queue) this.ws.send(q);
      this.queue = [];
      this.onOpen();
    };
    this.ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try { this.onMessage(JSON.parse(ev.data)); } catch (e) { console.error(e); }
      } else this.onMessage(ev.data as ArrayBuffer);
    };
    this.ws.onclose = () => {
      if (!this.closed) this.onClose('与服务器的连接断开了');
      this.closed = true;
    };
    this.ws.onerror = () => {
      if (!this.closed) this.onClose('无法连接到联机服务器');
      this.closed = true;
    };
  }

  send(msg: C2S) {
    const s = JSON.stringify(msg);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.ws.readyState === WebSocket.CONNECTING) this.queue.push(s);
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}

/** 单人：在浏览器里直接运行同一套房间与模拟代码，不需要服务器。 */
export class LocalTransport implements Transport {
  readonly online = false;
  private room = new Room('单人', true);
  private id = 0;
  private timer: number;
  private acc = 0;
  private last = performance.now();
  onMessage: (m: Incoming) => void = () => {};
  onClose: (reason: string) => void = () => {};

  constructor() {
    const params = new URLSearchParams(location.search);
    if (params.has('debug')) {
      Room.allowDebug = true;
      (window as unknown as { __room: Room }).__room = this.room;
      // 调试：?debug=1&skills=ember,surf,... 开局直接装备这些技能，方便查看特效
      const skills = (params.get('skills') ?? '').split(',').filter((id) => SKILLS[id]);
      if (skills.length) {
        const t = window.setInterval(() => {
          const p = this.room.sim?.players[0];
          if (!p) return;
          p.skills = skills.map((id, i) => ({ id, lv: 1, cd: 0.4 + i * 0.15 }));
          window.clearInterval(t);
        }, 100);
      }
    }
    const step = 1000 / TICK_RATE;
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.acc += Math.min(250, now - this.last);
      this.last = now;
      let n = 0;
      while (this.acc >= step && n < 4) {
        this.acc -= step;
        n++;
        this.room.update();
      }
    }, step / 2);
  }

  private deliver = (data: string | ArrayBuffer) => {
    const m = typeof data === 'string' ? (JSON.parse(data) as S2C) : data;
    queueMicrotask(() => this.onMessage(m));
  };

  send(msg: C2S) {
    if (msg.t === 'create' || msg.t === 'join') {
      const res = this.room.join({ send: this.deliver }, msg.name, msg.meta, msg.v);
      if (typeof res === 'number') this.id = res;
      return;
    }
    this.room.handle(this.id, msg);
  }

  close() {
    window.clearInterval(this.timer);
    this.room.leave(this.id);
  }
}

/** 离线练习赛：在浏览器里和 AI 训练家对战，不计分。团战时队友优先用背包里的其他宝可梦。 */
export class LocalPvpTransport implements Transport {
  readonly online = false;
  private room: PvpRoom;
  private timer: number;
  private acc = 0;
  private last = performance.now();
  onMessage: (m: Incoming) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private deliver = (data: string | ArrayBuffer) => {
    const m = typeof data === 'string' ? (JSON.parse(data) as S2C) : data;
    queueMicrotask(() => this.onMessage(m));
  };

  constructor(mode: PvpMode, me: { name: string; build: SavedBuild; meta: Record<string, number> }, allies: SavedBuild[]) {
    const rng = new Rng((Math.random() * 2 ** 31) | 0);
    const size = PVP_MODES[mode].size;
    const names = rng.shuffle(NPC_NAMES.filter((n) => n !== me.name));
    const lv = me.build.level;
    const seats: PvpSeat[] = [{ id: 1, name: me.name, team: 0, build: me.build, meta: me.meta, conn: { send: this.deliver }, bot: false, rating: 1000 }];
    let id = 2;
    // 队友用背包里等级相近的宝可梦；每个对手按对应队友的等级生成，两队实力接近
    const near = allies.filter((b) => Math.abs(b.level - lv) <= 6).sort((a, b) => Math.abs(a.level - lv) - Math.abs(b.level - lv));
    const team: SavedBuild[] = [me.build];
    for (let i = 1; i < size; i++) team.push(near[i - 1] ?? generateBuild(rng, lv + rng.int(-1, 1)));
    for (const b of team.slice(1)) seats.push({ id: id++, name: names.pop()!, team: 0, build: b, meta: me.meta, conn: null, bot: true, rating: 1000 });
    for (const b of team) seats.push({ id: id++, name: names.pop()!, team: 1, build: generateBuild(rng, b.level + rng.int(-1, 1)), meta: me.meta, conn: null, bot: true, rating: 1000 });
    this.room = new PvpRoom('练习赛', mode, seats);
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __pvpRoom: PvpRoom }).__pvpRoom = this.room;
    this.room.begin();
    const step = 1000 / TICK_RATE;
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.acc += Math.min(250, now - this.last);
      this.last = now;
      let n = 0;
      while (this.acc >= step && n < 4) {
        this.acc -= step;
        n++;
        this.room.update();
      }
      if (this.room.ended) window.clearInterval(this.timer);
    }, step / 2);
  }

  send(msg: C2S) { this.room.handle(1, msg); }

  close() {
    window.clearInterval(this.timer);
    this.room.leave(1);
  }
}
