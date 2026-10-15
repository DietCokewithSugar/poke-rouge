import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOf, fillTeam, generateBuild, generateTeam, validateBuild, validateTeam, type SavedBuild } from '../src/shared/pvp/build';
import { eloDelta, tierOf } from '../src/shared/pvp/rating';
import { PvpRoom, type PvpSeat } from '../src/shared/pvp/room';
import { CAP_BURST, CAP_RATE, PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import type { S2C } from '../src/shared/protocol';
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

test('承伤上限：再强的构筑也要十几秒才能打倒一只宝可梦', () => {
  const strong = generateBuild(new Rng(3), 40);
  const weak = build({ level: 6, stage: 0, items: [], levelMods: {} });
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build: strong, meta: { atk: 10, spa: 10, crit: 10 }, bot: true },
    { id: 2, name: 'B', team: 1, build: weak, meta: {}, bot: true },
  ], 5);
  const [a, b] = sim.players;
  run(sim, 3.1);
  b.x = a.x + 30; b.y = a.y;
  run(sim, 60);
  assert.equal(sim.phase, 'over');
  const ko = sim.result().feed[0];
  assert.ok(ko, '强者最终能打倒弱者');
  const minTime = (1 - CAP_BURST) / CAP_RATE;
  assert.ok(ko[0] >= minTime * 0.9, `第一次击倒在 ${ko[0]} 秒，不能早于约 ${minTime.toFixed(1)} 秒`);
});

test('对战里的回复减半，加时里继续降低', () => {
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build: build(), meta: {} },
    { id: 2, name: 'B', team: 1, build: build(), meta: {} },
  ], 1);
  for (const p of sim.players) p.skills = [];
  run(sim, 3.2);
  assert.equal(sim.healScale, 0.5);
  sim.matchT = sim.def.dur - 0.5;
  run(sim, 0.1);
  assert.ok(sim.healScale < 0.25);
});

test('队伍：校验、借用补位与 AI 队伍', () => {
  const rng = new Rng(11);
  const a = generateBuild(rng, 12);
  assert.equal(typeof validateTeam([a, a], 3), 'string', '同一个构筑不能上场两次');
  assert.equal(typeof validateTeam([], 3), 'string');
  assert.equal(typeof validateTeam([a, generateBuild(rng, 8)], 1), 'string', '团战只能派一只');
  const team = validateTeam([a], 3) as SavedBuild[];
  const full = fillTeam(rng, team, 3);
  assert.equal(full.length, 3);
  assert.deepEqual(full[0], a);
  assert.ok(full.slice(1).every((b) => b.level === a.level - 2), '借来的比队伍平均低 2 级');
  const bots = generateTeam(rng, 15, 3);
  assert.equal(new Set(bots.map((b) => b.line)).size, 3, 'AI 队伍是三只不同的宝可梦');
  for (const b of [...full, ...bots]) assert.notEqual(typeof validateBuild(b), 'string');
});

/** 收集发给某个座位的消息 */
function conn() {
  const msgs: S2C[] = [];
  return { msgs, send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d)); } };
}

test('单挑三对三：每位训练家派出三只，自己操作队长，另外两只由 AI 操作，倒下就退场', () => {
  const rng = new Rng(21);
  const c = conn();
  const seats: PvpSeat[] = [
    { id: 1, name: '小智', team: 0, builds: generateTeam(rng, 12, 3), meta: {}, trainer: 'ash', conn: c, bot: false, rating: 1000 },
    { id: 2, name: '小霞', team: 1, builds: generateTeam(rng, 12, 3), meta: {}, trainer: 'misty', conn: null, bot: true, rating: 1000 },
  ];
  const room = new PvpRoom('测试', '1v1', seats, 9);
  room.local = true;
  room.begin();
  const sim = room.sim;
  assert.equal(sim.players.length, 6);
  const me = seats[0].unit!;
  const joined = c.msgs.find((m) => m.t === 'joined') as Extract<S2C, { t: 'joined' }>;
  assert.equal(joined.you, me, '客户端控制的是自己的队长');
  const start = c.msgs.find((m) => m.t === 'start') as Extract<S2C, { t: 'start' }>;
  const info = start.pvp!.seats;
  assert.equal(info.filter((s) => s.owner === 1).length, 3);
  assert.deepEqual(info.filter((s) => s.owner === 1 && !s.helper).map((s) => s.id), [me]);
  const mine = sim.players.filter((p) => sim.ownerOf(p.id).owner === 1);
  assert.ok(mine.every((p) => p.bot === (p.id !== me)), '帮手由 AI 操作，队长由玩家操作');
  // 队长可以切换自动战斗，帮手不能切成手动
  room.handle(me, { t: 'auto', on: true });
  assert.ok(sim.players.find((p) => p.id === me)!.bot);
  room.handle(me, { t: 'auto', on: false });
  assert.ok(!sim.players.find((p) => p.id === me)!.bot);
  const helper = mine.find((p) => p.id !== me)!;
  sim.setAuto(helper.id, false);
  assert.ok(helper.bot, '帮手一直由 AI 操作');
  // 打起来以后：倒下的宝可梦没法被救起
  for (let i = 0; i < 30 * 3.2; i++) room.update();
  for (const p of sim.players) { p.skills = []; p.bot = false; }
  const lead = sim.players.find((p) => p.id === me)!;
  sim.downPlayer(lead);
  helper.x = lead.x + 4; helper.y = lead.y;
  for (const p of sim.players) if (p.team === 1) { p.x = lead.x + 300; p.y = lead.y; }
  for (let i = 0; i < 30 * 6; i++) sim.step(1 / 30);
  assert.ok(lead.down, '单挑倒下就退场');
  assert.equal(sim.aliveCount(0), 2);
});

test('自动走位：开启后服务器替玩家走位，忽略客户端上报的位置', () => {
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build: build(), meta: {} },
    { id: 2, name: 'B', team: 1, build: build(), meta: {}, bot: true },
  ], 4);
  run(sim, 3.2);
  const [a] = sim.players;
  sim.setAuto(1, true);
  const x0 = a.x, y0 = a.y;
  sim.setPlayerPos(1, x0 + 50, y0, true, 0);
  assert.equal(a.x, x0, '自动时忽略上报的位置');
  run(sim, 2);
  assert.ok(Math.hypot(a.x - x0, a.y - y0) > 5, 'AI 在走位');
  sim.setAuto(1, false);
  const x1 = a.x;
  for (let i = 0; i < 10; i++) { sim.setPlayerPos(1, a.x + 3, a.y, true, 0); sim.step(1 / 30); }
  assert.ok(a.x > x1, '切回手动后按上报的位置移动');
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
