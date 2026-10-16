import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PeerSync } from '../src/shared/netsync';
import {
  BOOST_CRIT, BOOST_DODGE, BOOST_DUR, BOOST_SPEED, MAX_BERRIES, MAX_SEEDS, PICKUP_KINDS, berryHeal, isSeed, pickupCode, type PickupKind,
} from '../src/shared/pickups';
import { buildOf } from '../src/shared/pvp/build';
import { PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import { GameSim, boostsOf, type Ev } from '../src/shared/sim/game';
import type { SimPlayer } from '../src/shared/sim/entities';
import { recompute } from '../src/shared/sim/player';
import { MOVE_SPEED_MAX } from '../src/shared/stats';
import { botMove } from './bot';

const DT = 1 / 30;
const MAP_ITEMS = new Set(PICKUP_KINDS.filter((k) => k === 'berry' || isSeed(k)).map(pickupCode));

/** 一只站着不动、不会倒下的伙伴；身边没有敌人 */
function calm(sim: GameSim, sec: number, each?: (p: SimPlayer) => void) {
  const evs: Ev[] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    sim.enemies = [];
    sim.pending = [];
    for (const p of sim.players) { p.invuln = 9; each?.(p); }
    sim.step(DT);
    evs.push(...sim.flushEvents());
  }
  return evs;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('橙橙果：受伤时踩到回复 5 + 8% 最大 HP，满血时不捡、留在地上', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }], 3);
  const p = sim.players[0];
  const berry = sim.placeItem('berry', p.x + 5, p.y)!;
  assert.ok(berry, '冒险里可以放地图道具');
  calm(sim, 1);
  assert.equal(p.hp, p.d.maxHp);
  assert.ok(sim.pickups.includes(berry), '满血时橙橙果留在地上');

  p.hp = 1;
  const evs = calm(sim, DT);
  assert.ok(!sim.pickups.includes(berry), '受伤时踩到就吃掉');
  const heal = berryHeal(p.d.maxHp);
  assert.ok(near(p.hp, 1 + heal, 0.01), `回复 ${p.hp - 1}，应为 ${heal}`);
  assert.ok(heal < p.d.maxHp * 0.25, '回复量不比现有的回复手段夸张');
  assert.ok(evs.some((e) => e[0] === 'pick' && e[1] === berry.id && e[2] === p.id));
  assert.ok(evs.some((e) => e[0] === 'heal' && e[1] === p.id && e[2] === Math.round(heal)), '有绿色回复数字');
});

test('增幅种子：效果持续 5 秒，重复踩刷新时间不叠加，不同种子可以同时生效', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }], 4);
  const p = sim.players[0];
  const crit0 = p.d.crit, dodge0 = p.d.dodge, speed0 = p.d.moveSpeed;

  const s1 = sim.placeItem('seed_crit', p.x, p.y + 4)!;
  const evs = calm(sim, DT);
  assert.ok(evs.some((e) => e[0] === 'pick' && e[1] === s1.id));
  assert.equal(p.boosts.crit, BOOST_DUR);
  assert.ok(near(p.d.crit, crit0 + BOOST_CRIT / 100), `暴击 ${crit0} → ${p.d.crit}`);
  assert.deepEqual(sim.privateState(p).boosts, [['crit', BOOST_DUR]]);

  calm(sim, 2.5);
  assert.ok(near(p.boosts.crit, BOOST_DUR - 2.5, 0.05));
  sim.placeItem('seed_crit', p.x, p.y);
  calm(sim, DT);
  assert.equal(p.boosts.crit, BOOST_DUR, '重复踩刷新为 5 秒');
  assert.ok(near(p.d.crit, crit0 + BOOST_CRIT / 100), '数值不叠加');

  sim.placeItem('seed_dodge', p.x, p.y);
  sim.placeItem('seed_speed', p.x, p.y);
  calm(sim, DT);
  assert.ok(near(p.d.dodge, dodge0 + BOOST_DODGE / 100));
  assert.ok(near(p.d.moveSpeed, Math.min(MOVE_SPEED_MAX, speed0 * (1 + BOOST_SPEED))));
  assert.ok(near(p.d.crit, crit0 + BOOST_CRIT / 100), '不同种子同时生效');
  assert.deepEqual(boostsOf(p).map(([id]) => id), ['crit', 'dodge', 'speed']);

  calm(sim, BOOST_DUR - 0.2);
  assert.equal(boostsOf(p).length, 3, '5 秒内还在');
  calm(sim, 0.3);
  assert.deepEqual(boostsOf(p), [], '5 秒后消失');
  assert.ok(near(p.d.crit, crit0) && near(p.d.dodge, dodge0) && near(p.d.moveSpeed, speed0), '数值恢复原样');
  assert.equal(sim.pickups.length, 0);
});

test('增幅种子：遵守闪避与移速上限，倒下或波次结束时清空', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }, { id: 2, name: 'B', line: 'pikachu', meta: {} }], 5);
  const [a, b] = sim.players;
  a.levelMods.dodge = 50;
  a.levelMods.spe = 999;
  recompute(a);
  assert.ok(near(a.d.dodge, 0.5));
  assert.equal(a.d.moveSpeed, MOVE_SPEED_MAX);
  sim.placeItem('seed_dodge', a.x, a.y);
  sim.placeItem('seed_speed', a.x, a.y);
  calm(sim, DT);
  assert.equal(a.d.dodge, 0.6, '闪避最多 60%');
  assert.equal(a.d.moveSpeed, MOVE_SPEED_MAX, '移速不超过上限');

  sim.placeItem('seed_crit', b.x, b.y);
  calm(sim, DT);
  assert.equal(b.boosts.crit, BOOST_DUR);
  sim.downPlayer(b);
  assert.deepEqual(boostsOf(b), [], '倒下时清空');

  calm(sim, sim.waveDur - sim.waveT - 1);
  sim.placeItem('seed_crit', a.x, a.y);
  calm(sim, DT);
  assert.equal(a.boosts.crit, BOOST_DUR);
  while (sim.phase === 'wave') calm(sim, DT);
  assert.equal(sim.phase, 'inter');
  assert.deepEqual(boostsOf(a), [], '波次结束时清空');
  assert.ok(near(a.d.dodge, 0.5));
  assert.equal(sim.pickups.length, 0, '剩下的橙橙果和种子不会留到下一波');
});

test('地图道具：drop 事件区分种类，私有状态和增量消息都带上增幅', () => {
  assert.deepEqual(PICKUP_KINDS.map(pickupCode), [0, 1, 2, 3, 4, 5]);
  const sim = new GameSim([{ id: 1, name: 'A', line: 'charmander', meta: {} }], 6);
  const p = sim.players[0];
  sim.flushEvents();
  const kinds: PickupKind[] = ['berry', 'seed_crit', 'seed_dodge', 'seed_speed'];
  for (const k of kinds) sim.placeItem(k, 100, 100);
  const drops = sim.flushEvents().filter((e) => e[0] === 'drop');
  assert.deepEqual(drops.map((e) => e[2]), [1, 3, 4, 5]);

  const sync = new PeerSync();
  assert.equal(JSON.parse(sync.privateMsg(sim, p)!).t, 'me');
  sim.placeItem('seed_dodge', p.x, p.y);
  calm(sim, 0.5);
  const msg = JSON.parse(sync.privateMsg(sim, p)!);
  assert.deepEqual(msg.s.boosts, [['dodge', BOOST_DUR - 0.4]], `消息：${JSON.stringify(msg)}`);
});

test('地图道具：每波都会在场上刷出几个，场上数量有上限', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'bulbasaur', meta: {} }], 11);
  const perWave = new Map<number, { berry: number; seed: number }>();
  while (sim.wave <= 6 && sim.phase !== 'over' && sim.phase !== 'won') {
    if (sim.phase === 'inter') {
      for (const p of sim.players) p.ready = true;
    } else {
      for (const p of sim.players) { p.invuln = 9; botMove(sim, p, DT); }
    }
    sim.step(DT);
    const c = perWave.get(sim.wave) ?? { berry: 0, seed: 0 };
    for (const e of sim.flushEvents()) {
      if (e[0] !== 'drop') continue;
      if (e[2] === 1) c.berry++;
      else if (MAP_ITEMS.has(e[2] as number)) c.seed++;
    }
    perWave.set(sim.wave, c);
    assert.ok(sim.pickups.filter((k) => k.kind === 'berry').length <= MAX_BERRIES);
    assert.ok(sim.pickups.filter((k) => isSeed(k.kind)).length <= MAX_SEEDS);
  }
  for (let w = 1; w <= 6; w++) {
    const c = perWave.get(w)!;
    assert.ok(c.berry >= 1 && c.seed >= 1, `第 ${w} 波：${JSON.stringify(c)}`);
    assert.ok(c.berry <= 8 && c.seed <= 6, `第 ${w} 波不要刷屏：${JSON.stringify(c)}`);
  }
});

test('AI 辅助战斗和离开的玩家也会去踩种子、血少时去吃橙橙果', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }, { id: 2, name: 'B', line: 'charmander', meta: {} }], 8);
  const [a, b] = sim.players;
  sim.setAuto(a.id, true);
  sim.setAway(b.id, true);
  b.x = a.x + 200;
  sim.placeItem('seed_crit', a.x + 60, a.y);
  sim.placeItem('seed_speed', b.x, b.y - 60);
  a.hp = Math.round(a.d.maxHp * 0.3);
  const hp0 = a.hp;
  sim.placeItem('berry', a.x - 80, a.y + 20);
  calm(sim, 3);
  assert.ok(a.boosts.crit > 0, 'AI 辅助战斗会去踩种子');
  assert.ok(b.boosts.speed > 0, '离开的玩家由 AI 代打，也会去踩');
  assert.ok(a.hp > hp0, '血少时会去吃橙橙果');
  assert.ok(!sim.pickups.some((k) => k.kind === 'berry'));
});

test('对战：不会出现橙橙果和种子，也放不了', () => {
  const build = buildOf(new GameSim([{ id: 1, name: 'x', line: 'charmander', meta: {} }], 1).players[0]);
  const inits: PvpInit[] = [
    { id: 1, name: 'A', team: 0, build, meta: {}, bot: true },
    { id: 2, name: 'B', team: 1, build: { ...build, line: 'squirtle', skills: [{ id: 'water_gun', lv: 1 }] }, meta: {}, bot: true },
  ];
  const sim = new PvpSim('1v1', inits, 21);
  assert.equal(sim.placeItem('berry', 100, 100), null);
  assert.equal(sim.placeItem('seed_crit', 100, 100), null);
  for (let i = 0; i < 30 * 60 && sim.phase !== 'over'; i++) {
    sim.step(DT);
    for (const e of sim.flushEvents()) assert.ok(!(e[0] === 'drop' && MAP_ITEMS.has(e[2] as number)), `对战里出现了地图道具：${JSON.stringify(e)}`);
    assert.ok(!sim.pickups.some((k) => k.kind === 'berry' || isSeed(k.kind)));
    for (const p of sim.players) assert.deepEqual(boostsOf(p), []);
  }
});
