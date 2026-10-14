import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, decodeSnapshot, type S2C } from '../src/shared/protocol';

const PORT = 18000 + Math.floor(Math.random() * 1000);
let server: ChildProcess;

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
    server.stdout!.on('data', (d) => { if (String(d).includes('已启动')) { clearTimeout(t); resolve(); } });
    server.stderr!.on('data', (d) => process.stderr.write(d));
  });
});

after(() => { server.kill(); });

class Client {
  ws: WebSocket;
  msgs: S2C[] = [];
  snaps = 0;
  lastSnap: ReturnType<typeof decodeSnapshot> | null = null;
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        this.lastSnap = decodeSnapshot(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        this.snaps++;
      } else this.msgs.push(JSON.parse(String(data)));
    });
  }
  open() { return new Promise<void>((r) => this.ws.once('open', () => r())); }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }
  async wait<T extends S2C['t']>(t: T, ms = 4000): Promise<Extract<S2C, { t: T }>> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const i = this.msgs.findIndex((m) => m.t === t);
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<S2C, { t: T }>;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout waiting for ${t}; got ${this.msgs.map((m) => m.t).join(',')}`);
  }
}

test('房间号联机：创建、加入、开局、同步', async () => {
  const a = new Client(), b = new Client();
  await Promise.all([a.open(), b.open()]);
  a.send({ t: 'create', name: '小智', meta: {}, v: PROTOCOL_VERSION });
  const ja = await a.wait('joined');
  assert.match(ja.code, /^\d{5}$/);
  b.send({ t: 'join', code: '00000', name: 'x', meta: {}, v: PROTOCOL_VERSION });
  const bad = await b.wait('error');
  assert.match(bad.msg, /找不到/);
  b.send({ t: 'join', code: ja.code, name: '小霞', meta: {}, v: PROTOCOL_VERSION });
  const jb = await b.wait('joined');
  assert.notEqual(jb.you, ja.you);
  a.send({ t: 'pick', line: 'charmander' });
  b.send({ t: 'pick', line: 'squirtle' });
  await new Promise((r) => setTimeout(r, 100));
  a.send({ t: 'start' });
  const e1 = await a.wait('error');
  assert.match(e1.msg, /准备/);
  b.send({ t: 'ready', on: true });
  await new Promise((r) => setTimeout(r, 100));
  a.send({ t: 'start' });
  const st = await a.wait('start');
  assert.equal(st.players.length, 2);
  await b.wait('start');
  await a.wait('me');
  for (let i = 0; i < 20; i++) {
    a.send({ t: 'pos', x: 384 + i * 2, y: 288, m: 1, d: 0 });
    await new Promise((r) => setTimeout(r, 33));
  }
  assert.ok(a.snaps > 5, `收到快照 ${a.snaps}`);
  const snap = b.lastSnap!;
  assert.equal(snap.players.length, 2);
  const pa = snap.players.find((p) => p.id === ja.you)!;
  assert.ok(pa.x > 384, '另一位玩家能看到移动');
  // 第三人无法加入进行中的房间
  const c = new Client();
  await c.open();
  c.send({ t: 'join', code: ja.code, name: 'c', meta: {}, v: PROTOCOL_VERSION });
  const busy = await c.wait('error');
  assert.match(busy.msg, /游戏中/);
  a.ws.close(); b.ws.close(); c.ws.close();
});

test('联机大厅：房间列表、私密房间、在线人数', async () => {
  const host = new Client(), priv = new Client(), viewer = new Client();
  await Promise.all([host.open(), priv.open(), viewer.open()]);
  host.send({ t: 'create', name: '小刚', meta: {}, v: PROTOCOL_VERSION });
  const j = await host.wait('joined');
  priv.send({ t: 'create', name: '小遥', meta: {}, v: PROTOCOL_VERSION, public: false });
  const jp = await priv.wait('joined');
  host.send({ t: 'difficulty', id: 'normal' });
  await new Promise((r) => setTimeout(r, 100));
  viewer.send({ t: 'browse', on: true });
  const list = await viewer.wait('rooms');
  const mine = list.rooms.find((r) => r.code === j.code);
  assert.ok(mine, '公开房间出现在列表');
  assert.equal(mine!.host, '小刚');
  assert.equal(mine!.difficulty, 'normal');
  assert.ok(!list.rooms.some((r) => r.code === jp.code), '私密房间不出现');
  assert.ok(list.stats.online >= 3, `在线 ${list.stats.online}`);
  // 离开房间后连接还在，房间被删除
  priv.send({ t: 'leave' });
  await priv.wait('left');
  viewer.send({ t: 'stats' });
  const st = await viewer.wait('stats');
  assert.ok(st.stats.online >= 3);
  const res = await fetch(`http://localhost:${PORT}/api/stats`);
  const body = await res.json() as { online: number };
  assert.ok(body.online >= 3);
  host.ws.close(); priv.ws.close(); viewer.ws.close();
});
