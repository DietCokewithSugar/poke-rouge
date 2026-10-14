import type { C2S, S2C } from '../shared/protocol';
import { Room } from '../shared/room';
import { TICK_RATE } from '../shared/sim/game';

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

  constructor() {
    this.ws = new WebSocket(serverUrl());
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      for (const q of this.queue) this.ws.send(q);
      this.queue = [];
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
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __room: Room }).__room = this.room;
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
