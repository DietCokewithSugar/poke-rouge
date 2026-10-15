import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROTOCOL_VERSION, type S2C } from '../src/shared/protocol';
import { AWAY_TTL, Room } from '../src/shared/room';

function conn() {
  const msgs: S2C[] = [];
  return { msgs, send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d)); } };
}
const last = <T extends S2C['t']>(c: ReturnType<typeof conn>, t: T) => [...c.msgs].reverse().find((m) => m.t === t) as Extract<S2C, { t: T }> | undefined;

function startRoom() {
  const room = new Room('23456');
  const a = conn(), b = conn();
  const ia = room.join(a, 'A', {}, PROTOCOL_VERSION, { line: 'charmander' }) as number;
  const ib = room.join(b, 'B', {}, PROTOCOL_VERSION, { line: 'squirtle' }) as number;
  room.handle(ib, { t: 'ready', on: true });
  room.handle(ia, { t: 'start' });
  assert.ok(room.sim);
  return { room, a, b, ia, ib, tokenB: last(b, 'joined')!.token! };
}

test('联机对局中有人离开：AI 接手（走位和商店都由 AI 来），其他人继续玩', () => {
  const { room, b, ib } = startRoom();
  const sim = room.sim!;
  room.leave(ib, b);
  const p = sim.players.find((q) => q.id === ib)!;
  assert.ok(p.away && p.bot, '离开的玩家由 AI 接手');
  assert.ok(room.away.has(ib) && !room.members.has(ib));
  assert.ok(sim.publicState().players.find((q) => q.id === ib)!.away);
  // 波次结束后，AI 替他选升级、逛商店并准备出发
  sim.waveT = sim.waveDur;
  for (let i = 0; i < 10; i++) room.update();
  assert.equal(sim.phase, 'inter');
  for (let i = 0; i < 40; i++) room.update();
  assert.ok(p.ready, 'AI 准备好了');
  assert.ok(!p.cards && !p.crates.length, '升级和道具球都处理了');
  assert.ok(!sim.players.find((q) => q.id !== ib)!.ready, '留下的玩家照常自己选');
});

test('离开的玩家凭 token 回到对局：收到开局信息与现在的状态，AI 交还操作', () => {
  const { room, b, ib, tokenB } = startRoom();
  const sim = room.sim!;
  room.leave(ib, b);
  assert.equal(typeof room.rejoin(conn(), 'wrong', PROTOCOL_VERSION), 'string', 'token 不对');
  const b2 = conn();
  assert.equal(room.rejoin(b2, tokenB, PROTOCOL_VERSION), ib);
  const p = sim.players.find((q) => q.id === ib)!;
  assert.ok(!p.away && !p.bot);
  assert.ok(room.members.has(ib) && !room.away.size);
  assert.deepEqual(b2.msgs.slice(0, 2).map((m) => m.t), ['joined', 'start']);
  assert.equal(last(b2, 'joined')!.you, ib);
  assert.ok(last(b2, 'st') && last(b2, 'me'), '公开状态和私有状态都补发了');
  assert.equal(last(b2, 'start')!.players.length, 2);
});

test('断线后服务器还没发现就重连：换成新连接，旧连接后来断开也不影响', () => {
  const { room, b, ib, tokenB } = startRoom();
  const b2 = conn();
  assert.equal(room.rejoin(b2, tokenB, PROTOCOL_VERSION), ib);
  room.leave(ib, b);
  assert.ok(room.members.has(ib), '旧连接的离开被忽略');
  assert.ok(!room.sim!.players.find((q) => q.id === ib)!.away);
});

test('所有人都离开：模拟暂停等人回来，太久没人回来就结束，结算留给回来的人', () => {
  const { room, a, b, ia, ib } = startRoom();
  const sim = room.sim!;
  const ended: string[] = [];
  let empty = false;
  room.onAwayEnd = (token, msg) => ended.push(`${token}:${JSON.parse(msg).t}`);
  room.onEmpty = () => { empty = true; };
  room.leave(ia, a);
  room.leave(ib, b);
  assert.ok(room.sim, '房间还在');
  const t = sim.time;
  for (let i = 0; i < 30; i++) room.update();
  assert.equal(sim.time, t, '没人的时候不跑模拟');
  (room as unknown as { emptySince: number }).emptySince = performance.now() - AWAY_TTL - 1;
  room.update();
  assert.equal(room.sim, null);
  assert.equal(ended.length, 2, '两个人的结算都留着');
  assert.ok(ended.every((e) => e.endsWith(':end')));
  assert.ok(empty, '房间关闭');
});

test('对局结束时还没回来的玩家：结算交给服务器暂存', () => {
  const { room, a, b, ib, tokenB } = startRoom();
  const sim = room.sim!;
  const ended: string[] = [];
  room.onAwayEnd = (token) => ended.push(token);
  room.leave(ib, b);
  for (const p of sim.players) sim.downPlayer(p);
  room.update();
  assert.deepEqual(ended, [tokenB]);
  assert.ok(last(a, 'end'), '留下的人照常收到结算');
  assert.equal(room.away.size, 0);
  assert.ok(room.members.size === 1 && !room.sim, '回到大厅');
});

test('大厅里离开就是真的离开；单人模式不保留座位', () => {
  const room = new Room('34567');
  const a = conn(), b = conn();
  room.join(a, 'A', {}, PROTOCOL_VERSION, { line: 'charmander' });
  const ib = room.join(b, 'B', {}, PROTOCOL_VERSION, { line: 'squirtle' }) as number;
  room.leave(ib, b);
  assert.equal(room.members.size, 1);
  assert.equal(room.away.size, 0);
  const solo = new Room('单人', true);
  const s = conn();
  const id = solo.join(s, 'S', {}, PROTOCOL_VERSION, { line: 'pikachu' }) as number;
  solo.handle(id, { t: 'start' });
  solo.leave(id, s);
  assert.equal(solo.sim, null);
  assert.equal(solo.away.size, 0);
});
