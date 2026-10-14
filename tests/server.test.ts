import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, decodeSnapshot, type S2C } from '../src/shared/protocol';
import { generateBuild } from '../src/shared/pvp/build';
import { Rng } from '../src/shared/rng';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const PVP_DATA = path.join(os.tmpdir(), `pvp-test-${PORT}.json`);
let server: ChildProcess;

before(async () => {
  fs.rmSync(PVP_DATA, { force: true });
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), PVP_DATA, PVP_BOT_AFTER: '1.5', POKE_DEBUG: '1' }, stdio: 'pipe',
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
    server.stdout!.on('data', (d) => { if (String(d).includes('已启动')) { clearTimeout(t); resolve(); } });
    server.stderr!.on('data', (d) => process.stderr.write(d));
  });
});

after(() => { server.kill(); fs.rmSync(PVP_DATA, { force: true }); });

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

const ident = (n: string) => ({ pid: `test${n}${'x'.repeat(12)}`.slice(0, 20), secret: `secret-${n}-0123456789abcdef` });

test('对战 1v1：真人匹配、结算积分、排行榜', async () => {
  const a = new Client(), b = new Client();
  await Promise.all([a.open(), b.open()]);
  const rng = new Rng(5);
  const A = ident('a'), B = ident('b');
  a.send({ t: 'pvpQueue', mode: '1v1', build: { line: 'nope' }, name: '小智', meta: {}, v: PROTOCOL_VERSION, ...A });
  assert.match((await a.wait('error')).msg, /未知的宝可梦/);
  a.send({ t: 'pvpQueue', mode: '1v1', build: generateBuild(rng, 12), name: '小智', meta: { atk: 3 }, v: PROTOCOL_VERSION, ...A });
  b.send({ t: 'pvpQueue', mode: '1v1', build: generateBuild(rng, 12), name: '小霞', meta: {}, v: PROTOCOL_VERSION, ...B });
  await a.wait('pvpQueued');
  const ja = await a.wait('joined'), jb = await b.wait('joined');
  const sa = await a.wait('start');
  await b.wait('start');
  assert.equal(sa.pvp?.mode, '1v1');
  assert.equal(sa.pvp!.seats.length, 2);
  assert.ok(sa.pvp!.seats.every((s) => !s.bot), '两位真人互相匹配');
  const teamA = sa.pvp!.seats.find((s) => s.id === ja.you)!.team;
  const teamB = sa.pvp!.seats.find((s) => s.id === jb.you)!.team;
  assert.notEqual(teamA, teamB);
  // 倒计时结束后开打
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const st = await a.wait('st');
    if (st.s.phase === 'wave') break;
  }
  assert.ok(a.lastSnap && a.lastSnap.players.length === 2);
  a.send({ t: 'debug', cmd: 'down' });
  const ea = await a.wait('pvpEnd'), eb = await b.wait('pvpEnd');
  assert.equal(ea.result.winner, teamB);
  assert.ok(ea.rating!.delta < 0 && eb.rating!.delta > 0, `积分变化 ${ea.rating!.delta} / ${eb.rating!.delta}`);
  assert.equal(eb.rating!.record.wins, 1);
  assert.equal(eb.rating!.record.rank, 1);
  b.send({ t: 'pvpBoard', mode: '1v1', ...B });
  const board = await b.wait('pvpBoard');
  assert.equal(board.rows[0].name, '小霞');
  assert.ok(board.rows[0].you);
  assert.equal(board.me!.rating, eb.rating!.after);
  assert.equal(board.history[0].result, 'win');
  const res = await fetch(`http://localhost:${PORT}/api/pvp/leaderboard?mode=1v1`);
  const api = await res.json() as { rows: { name: string }[] };
  assert.deepEqual(api.rows.map((r) => r.name), ['小霞', '小智']);
  // 同一身份用错误的密钥会被拒绝
  a.send({ t: 'pvpQueue', mode: '1v1', build: generateBuild(rng, 5), name: '冒充', meta: {}, v: PROTOCOL_VERSION, pid: B.pid, secret: 'wrong-secret-0123456789' });
  assert.match((await a.wait('error')).msg, /校验失败/);
  a.ws.close(); b.ws.close();
});

test('对战 4v4：等不到人时 AI 补位，可以取消匹配', async () => {
  const c = new Client(), d = new Client();
  await Promise.all([c.open(), d.open()]);
  const rng = new Rng(9);
  d.send({ t: 'pvpQueue', mode: '4v4', build: generateBuild(rng, 8), name: '小刚', meta: {}, v: PROTOCOL_VERSION, ...ident('d') });
  await d.wait('pvpQueued');
  d.send({ t: 'pvpCancel' });
  await d.wait('pvpCancelled');
  c.send({ t: 'pvpQueue', mode: '4v4', build: generateBuild(rng, 15), name: '小遥', meta: {}, v: PROTOCOL_VERSION, ...ident('c') });
  const st = await c.wait('start', 6000);
  const seats = st.pvp!.seats;
  assert.equal(seats.length, 8);
  assert.equal(seats.filter((s) => s.bot).length, 7);
  assert.equal(seats.filter((s) => s.team === 0).length, 4);
  // 用过的构筑会进入 AI 构筑池，被其他人匹配到
  d.send({ t: 'pvpQueue', mode: '1v1', build: generateBuild(rng, 15), name: '小刚', meta: {}, v: PROTOCOL_VERSION, ...ident('d') });
  const sd = await d.wait('start', 6000);
  assert.ok(sd.pvp!.seats.some((s) => s.bot));
  c.send({ t: 'leave' });
  await c.wait('left');
  c.ws.close(); d.ws.close();
});
