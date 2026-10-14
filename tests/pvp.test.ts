import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOf, generateBuild, validateBuild, type SavedBuild } from '../src/shared/pvp/build';
import { eloDelta, tierOf } from '../src/shared/pvp/rating';
import { PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { REVIVE_RADIUS } from '../src/shared/sim/game';
import { runBotGame } from './bot';

const build = (over: Partial<SavedBuild> = {}): SavedBuild => ({
  line: 'charmander', stage: 1, level: 12, skills: [{ id: 'ember', lv: 2 }, { id: 'scratch', lv: 1 }], items: [['charcoal', 2]], levelMods: { atk: 20 }, ...over,
});

function run(sim: PvpSim, sec: number) {
  for (let i = 0; i < sec * 30 && sim.phase !== 'over'; i++) { sim.step(1 / 30); sim.flushEvents(); }
}

test('构筑：一局冒险结束后的构筑可以通过校验，异常构筑被拒绝', () => {
  const r = runBotGame([{ id: 1, name: 'bot', line: 'squirtle', meta: {} }], 3, 6);
  const v = validateBuild(JSON.parse(JSON.stringify(r.builds[0])));
  assert.notEqual(typeof v, 'string', String(v));
  assert.equal((v as SavedBuild).line, 'squirtle');
  assert.equal(typeof validateBuild(build({ level: 99 })), 'string');
  assert.equal(typeof validateBuild(build({ stage: 2, level: 8 })), 'string', '等级不够时不能是最终形态');
  assert.equal(typeof validateBuild(build({ skills: [{ id: 'ember', lv: 9 }] })), 'string');
  assert.equal(typeof validateBuild(build({ items: [['charcoal', 999]] })), 'string');
  assert.equal(typeof validateBuild(build({ levelMods: { atk: 99999 } })), 'string');
  for (let i = 0; i < 30; i++) {
    const g = generateBuild(new Rng(i), 3 + i);
    assert.notEqual(typeof validateBuild(g), 'string', `生成的构筑也要合法：${JSON.stringify(g)}`);
  }
});

test('对战 1v1：只会打到对手，最终分出胜负并给出统计', () => {
  const inits: PvpInit[] = [
    { id: 1, name: 'A', team: 0, build: build(), meta: {}, bot: true },
    { id: 2, name: 'B', team: 1, build: build({ line: 'bulbasaur', skills: [{ id: 'vine_whip', lv: 2 }, { id: 'tackle', lv: 1 }], items: [] }), meta: {}, bot: true },
  ];
  const sim = new PvpSim('1v1', inits, 42);
  assert.equal(sim.phase, 'inter', '先倒计时');
  run(sim, 2);
  assert.equal(sim.players[0].stats.damage, 0, '倒计时期间不能攻击');
  run(sim, 120);
  assert.equal(sim.phase, 'over');
  const res = sim.result();
  assert.ok(res.winner === 0 || res.winner === 1 || res.winner === -1);
  assert.ok(res.players.every((p) => p.damage > 0), '双方都造成了伤害');
  assert.ok(res.timeline.length > 5);
  if (res.reason === 'ko') {
    const loser = res.players.find((p) => p.team !== res.winner)!;
    assert.equal(loser.deaths, 1);
    assert.equal(res.feed.length, 1);
  }
});

test('对战 4v4：队友之间没有伤害；救援需要附近没有敌人', () => {
  const inits: PvpInit[] = [];
  for (let i = 0; i < 8; i++) inits.push({ id: i + 1, name: `P${i}`, team: i < 4 ? 0 : 1, build: build(), meta: {}, bot: true });
  const sim = new PvpSim('4v4', inits, 7);
  const [a, b] = sim.players;
  assert.equal(sim.targetsFor(a.id).length, 4);
  assert.ok(sim.targetsFor(a.id).every((e) => e.pvp!.team === 1));
  run(sim, 3.2);
  assert.equal(sim.phase, 'wave');
  // 让 a 倒下，b 站在旁边：附近有敌人时救援被打断
  for (const p of sim.players) p.bot = false;
  sim.downPlayer(a);
  b.x = a.x + 5; b.y = a.y;
  const foe = sim.players.find((p) => p.team === 1)!;
  foe.x = a.x - 10; foe.y = a.y;
  for (const p of sim.players) p.skills = [];
  for (let i = 0; i < 30 * 5; i++) sim.step(1 / 30);
  assert.ok(a.down, '敌人在旁边时救不起来');
  foe.x = a.x + REVIVE_RADIUS * 4;
  for (let i = 0; i < 30 * 4; i++) sim.step(1 / 30);
  assert.ok(!a.down, '敌人离开后可以救起');
  assert.equal(b.stats.revives, 1);
});

test('对战：缩圈会伤害圈外的玩家', () => {
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build: build(), meta: {} },
    { id: 2, name: 'B', team: 1, build: build(), meta: {} },
  ], 1);
  for (const p of sim.players) p.skills = [];
  run(sim, 3.1);
  sim.matchT = sim.ring.t1;
  const [a] = sim.players;
  a.x = 10; a.y = 20;
  const hp = a.hp;
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  assert.ok(a.hp < hp, '圈外掉血');
  assert.ok(sim.ring.r < 100);
});

test('积分：赢了加分输了扣分，段位随分数提升', () => {
  assert.ok(eloDelta(1000, 1000, 1, 32) > 0);
  assert.ok(eloDelta(1000, 1000, 0, 32) < 0);
  assert.ok(eloDelta(1000, 1400, 1, 32) > eloDelta(1400, 1000, 1, 32), '以弱胜强加分更多');
  assert.equal(tierOf(1000).tier.id, 'poke');
  assert.equal(tierOf(1260).tier.id, 'ultra');
  assert.equal(tierOf(2000).next, null);
});

test('从玩家状态导出构筑再导入，数值一致（含大木研究所强化）', () => {
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build: build(), meta: { atk: 5 } },
    { id: 2, name: 'B', team: 1, build: build(), meta: {} },
  ], 1);
  const [a, b] = sim.players;
  assert.ok(a.d.atk > b.d.atk, '大木研究所的物攻强化生效');
  const again = buildOf(a);
  assert.deepEqual(again.skills, build().skills);
  assert.deepEqual(again.items, build().items);
  assert.equal(again.levelMods.atk, 20);
});
