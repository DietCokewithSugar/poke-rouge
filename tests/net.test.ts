import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PeerSync, cullEvents } from '../src/shared/netsync';
import { decodeSnapshot, encodeSnapshot } from '../src/shared/protocol';
import { GameSim } from '../src/shared/sim/game';

test('视野裁剪：视野外的视觉事件不发，关键事件照常发；拥堵时只发关键事件', () => {
  const box = { x0: 0, y0: 0, x1: 300, y1: 200 };
  const evs = [
    ['h', 1, 100, 100, 12, 0, 0],
    ['h', 2, 700, 500, 12, 0, 0],
    ['boom', 650, 450, 30, 'fire'],
    ['msg', '第 1 波 完成！'],
    ['wave', 2, 30, 0],
    ['down', 3],
  ];
  const near = cullEvents(evs, box, false);
  assert.deepEqual(near.map((e) => e[0]), ['h', 'msg', 'wave', 'down']);
  assert.equal(near[0][1], 1);
  const jam = cullEvents(evs, box, true);
  assert.deepEqual(jam.map((e) => e[0]), ['msg', 'wave', 'down']);
  assert.equal(cullEvents(evs, null, false).length, evs.length, '单人模式不裁剪');
});

test('快照只包含视野附近的敌人，玩家总是全部包含', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }, { id: 2, name: 'b', line: 'squirtle', meta: {} }], 3);
  sim.players[0].x = 100; sim.players[0].y = 100;
  sim.players[1].x = 700; sim.players[1].y = 500;
  sim.spawnEnemy('caterpie', 120, 120);
  sim.spawnEnemy('caterpie', 700, 520);
  const sync = new PeerSync();
  sync.setView(300, 200);
  const snap = decodeSnapshot(encodeSnapshot(sim, 2, sync.box(sim.players[0])));
  assert.equal(snap.players.length, 2);
  assert.equal(snap.enemies.length, 1);
  assert.equal(decodeSnapshot(encodeSnapshot(sim, 2)).enemies.length, 2);
});

test('波次中私有状态只发变化的字段', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }], 3);
  const p = sim.players[0];
  const sync = new PeerSync();
  const first = JSON.parse(sync.privateMsg(sim, p)!);
  assert.equal(first.t, 'me');
  assert.equal(sync.privateMsg(sim, p), null, '没变化就不发');
  p.hp -= 3;
  const dyn = JSON.parse(sync.privateMsg(sim, p)!);
  assert.equal(dyn.t, 'md');
  assert.equal(dyn.s.hp, Math.ceil(p.hp));
  assert.ok(JSON.stringify(dyn).length < 200);
  sim.debugGive(1, 'charcoal');
  assert.equal(JSON.parse(sync.privateMsg(sim, p)!).t, 'me', '持有道具变化时重发整份状态');
});

test('流量控制：确认来得越来越晚时判定拥堵，恢复后回到正常', () => {
  const sync = new PeerSync();
  let now = 0;
  // 正常：发出 80ms 后收到确认
  for (let k = 0; k < 30; k += 2) {
    sync.markSent(k, now);
    sync.ack(k, now + 80);
    now += 66;
  }
  assert.equal(sync.congestion(now, 0), 0);
  // 线路排队：确认越来越晚
  for (let k = 30; k < 90; k += 2) {
    sync.markSent(k, now);
    sync.ack(k - 10, now);
    now += 66;
  }
  assert.ok(sync.queueMs(now) > 200, `排队 ${Math.round(sync.queueMs(now))}ms`);
  assert.ok(sync.congestion(now, 0) >= 1);
  assert.equal(sync.shouldSend(91, 2), false);
  assert.equal(sync.shouldSend(100, 2), true);
  // 收到最新的确认后恢复
  sync.markSent(92, now);
  sync.ack(92, now + 80);
  assert.equal(sync.congestion(now + 80, 0), 0);
  // 旧版客户端从不确认：不做流量控制
  const legacy = new PeerSync();
  legacy.markSent(1, 0);
  assert.equal(legacy.congestion(5000, 0), 0);
});
