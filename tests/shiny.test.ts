import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENT_BY_ID, NO_RUN, metaBonus, type LifetimeStats } from '../src/shared/meta';
import { decodeSnapshot, encodeSnapshot, type S2C } from '../src/shared/protocol';
import { buildOf, validateBuild } from '../src/shared/pvp/build';
import { Room } from '../src/shared/room';
import { SHINY_BASE, SHINY_MAX, shinyOdds, shinyRate } from '../src/shared/shiny';
import { GameSim } from '../src/shared/sim/game';
import { createPlayerFromBuild } from '../src/shared/sim/player';
import { emptyMods, derive } from '../src/shared/stats';
import { TRAINERS } from '../src/shared/trainers';

const MAX_LAB = { shiny: 5 };

test('闪光几率：基础 1/1000，研究所和训练家可以提高，最高 1/200', () => {
  assert.equal(shinyRate(0), SHINY_BASE);
  assert.equal(shinyOdds(0), '1/1000');
  assert.ok(shinyRate(60) > shinyRate(0));
  const lab = metaBonus(MAX_LAB).mods.shiny ?? 0;
  assert.equal(shinyOdds(lab), '1/250', '研究所满级');
  assert.equal(shinyRate(lab + (TRAINERS.rocket.mods.shiny ?? 0)), SHINY_MAX, '研究所满级 + 火箭队正好到上限');
  assert.equal(shinyRate(99999), SHINY_MAX, '不会超过 1/200');
  const ash = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {} }], 1);
  assert.equal(ash.shinyRate(), SHINY_BASE);
  const rocket = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: MAX_LAB, trainer: 'rocket' }], 1);
  assert.equal(rocket.shinyRate(), SHINY_MAX);
  const coop = new GameSim([
    { id: 1, name: 'a', line: 'squirtle', meta: {} },
    { id: 2, name: 'b', line: 'charmander', meta: {}, trainer: 'rocket' },
  ], 1);
  assert.equal(coop.shinyRate(), shinyRate(100), '联机时按队伍里最高的算');
});

test('每只宝可梦出现时按闪光几率判定（统计）', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: MAX_LAB, trainer: 'rocket' }], 77);
  let n = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    if (sim.spawnEnemy('rattata', 100, 100).shiny) n++;
    if (sim.enemies.length > 500) sim.enemies = [];
  }
  const want = N * SHINY_MAX;
  assert.ok(Math.abs(n - want) < want * 0.25, `1/200：${n} / ${N}`);
});

test('闪光宝可梦六项能力各 +1%，其它能力不变', () => {
  const base = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
  const m = emptyMods();
  m.maxHp = 40; m.atk = 30; m.crit = 10;
  const a = derive(base, m), b = derive(base, m, true);
  assert.equal(b.maxHp, Math.round(a.maxHp * 1.01));
  for (const k of ['atk', 'def', 'spa', 'spd', 'spe'] as const) assert.ok(Math.abs(b[k] / a[k] - 1.01) < 1e-9, k);
  assert.equal(b.crit, a.crit);
  assert.equal(b.cdMult, a.cdMult);
  const p = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {}, shiny: true }], 1).players[0];
  const q = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }], 1).players[0];
  assert.ok(p.shiny && !q.shiny);
  assert.ok(p.d.atk > q.d.atk && p.d.spe > q.d.spe);
});

test('闪光的野生宝可梦：出现时发事件，能力 +1%，快照里总是带着它', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }, { id: 2, name: 'b', line: 'squirtle', meta: {} }], 3);
  sim.flushEvents();
  const normal = sim.spawnEnemy('pidgey', 600, 500);
  sim.forceShiny = 1;
  const e = sim.spawnEnemy('pidgey', 700, 520);
  assert.ok(e.shiny && !normal.shiny);
  assert.equal(e.maxHp, Math.round(normal.maxHp * 1.01));
  assert.ok(e.dmg > normal.dmg && e.speed > normal.speed);
  const ev = sim.flushEvents().find((x) => x[0] === 'shiny');
  assert.deepEqual(ev, ['shiny', e.id, e.kind, 700, 520]);
  sim.players[0].x = 100; sim.players[0].y = 100;
  sim.players[0].shiny = true;
  const snap = decodeSnapshot(encodeSnapshot(sim, 2, { x0: 0, y0: 0, x1: 300, y1: 200 }));
  assert.deepEqual(snap.enemies.map((x) => x.id), [e.id], '视野外的普通敌人不发，闪光的照样发');
  assert.ok(snap.players.find((p) => p.id === 1)!.flags & 128, '玩家的闪光标记');
  assert.ok(!(snap.players.find((p) => p.id === 2)!.flags & 128));
});

test('打倒闪光宝可梦：一定会崇拜你，和普通的分开算', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {}, owned: ['charmander', 'pidgey'] }], 5);
  const p = sim.players[0];
  sim.flushEvents();
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('pidgey', 100, 100), p);
  const ev = sim.flushEvents().find((x) => x[0] === 'recruit');
  assert.ok(ev, '已经有普通的波波，闪光的照样崇拜');
  assert.equal(ev[3], 'pidgey');
  assert.equal(ev[6], 1, '闪光标记');
  assert.ok(p.ownedShiny.has('pidgey'));
  assert.deepEqual(sim.summary(p).shinyRecruits, ['pidgey']);
  assert.deepEqual(sim.summary(p).recruits, [], '普通的没有重复解锁');
  // 已经有闪光的了：和普通的野生宝可梦一样判定（已有普通的 → 不会崇拜）
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('pidgey', 100, 100), p);
  assert.ok(!sim.flushEvents().some((x) => x[0] === 'recruit'));
  // 普通的没有、闪光的有：只能按普通的几率崇拜
  p.levelMods.recruit += 100000;
  sim.recompute(p);
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('rattata', 100, 100), p);
  const r = sim.flushEvents().find((x) => x[0] === 'recruit');
  assert.ok(r && r[3] === 'rattata' && r[6] === 1, '没有闪光拉达：先给闪光的');
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('rattata', 100, 100), p);
  const r2 = sim.flushEvents().find((x) => x[0] === 'recruit');
  assert.ok(r2 && r2[3] === 'rattata' && r2[6] === undefined, '闪光的已经有了，按普通的崇拜');
  assert.ok(p.owned.has('rattata'));
});

test('闪光宝可梦：击败者已经有了就让给队友；首领要先拥有普通的才会崇拜', () => {
  const sim = new GameSim([
    { id: 1, name: 'a', line: 'charmander', meta: {}, ownedShiny: ['rattata'] },
    { id: 2, name: 'b', line: 'squirtle', meta: {} },
  ], 5);
  const [a, b] = sim.players;
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('rattata', b.x, b.y), a);
  assert.ok(b.ownedShiny.has('rattata'));
  assert.equal(a.stats.shinyRecruits.length, 0);
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('mew', 100, 100), a);
  assert.ok(!a.ownedShiny.has('mew') && !b.ownedShiny.has('mew'), '没有梦幻的不会得到闪光梦幻');
  a.owned.add('mew');
  sim.forceShiny = 1;
  sim.killEnemy(sim.spawnEnemy('mew', 100, 100), a);
  assert.ok(a.ownedShiny.has('mew'), '已经有梦幻了：闪光的首领也会崇拜');
});

test('闪光宝可梦的构筑：分别保存，对战里也是 +1%', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {}, shiny: true }], 1);
  const b = buildOf(sim.players[0]);
  assert.equal(b.shiny, true);
  const v = validateBuild(b);
  assert.ok(typeof v !== 'string' && v.shiny === true);
  const plain = validateBuild({ ...b, shiny: 'yes' });
  assert.ok(typeof plain !== 'string' && !('shiny' in plain), '只认 true');
  const normal = buildOf(new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }], 1).players[0]);
  assert.ok(!('shiny' in normal));
  const ps = createPlayerFromBuild(sim, 1, 'a', b, {}), pn = createPlayerFromBuild(sim, 2, 'b', normal, {});
  assert.ok(ps.shiny && !pn.shiny);
  assert.ok(ps.d.spa > pn.d.spa);
});

test('闪光宝可梦的成就', () => {
  const s = (shinies: number): LifetimeStats => ({ runs: 1, wins: 0, kills: 0, bestWave: 0, coopRuns: 0, revives: 0, recruits: 0, owned: 3, badges: 0, shinies });
  const A = ACHIEVEMENT_BY_ID;
  assert.ok(!A.shiny_1.check(NO_RUN, s(0)));
  assert.ok(A.shiny_1.check(NO_RUN, s(1)));
  assert.ok(A.shiny_5.check(NO_RUN, s(5)) && !A.shiny_5.check(NO_RUN, s(4)));
  assert.ok(A.shiny_partner.check({ ...NO_RUN, shiny: true, wavesCleared: 10 }, s(1)));
  assert.ok(!A.shiny_partner.check({ ...NO_RUN, shiny: false, wavesCleared: 20 }, s(1)));
});

function conn() {
  const msgs: S2C[] = [];
  return { msgs, send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d)); } };
}

test('联机房间：带着闪光伙伴加入、换成闪光的、开局时传给模拟', () => {
  const room = new Room('12345');
  const c1 = conn(), c2 = conn();
  const a = room.join(c1, 'A', {}, 7, { line: 'pikachu', shiny: true, ownedShiny: ['pikachu', 'nope'] }) as number;
  const b = room.join(c2, 'B', {}, 7, { line: 'squirtle' }) as number;
  assert.ok(room.lobbyPlayers().find((p) => p.id === a)!.shiny);
  assert.ok(!room.lobbyPlayers().find((p) => p.id === b)!.shiny);
  room.handle(b, { t: 'pick', line: 'charmander', shiny: true });
  assert.ok(room.info().players.every((p) => p.shiny));
  room.handle(b, { t: 'ready', on: true });
  room.handle(a, { t: 'start' });
  const sim = room.sim!;
  assert.ok(sim.players.every((p) => p.shiny));
  assert.deepEqual([...sim.players.find((p) => p.id === a)!.ownedShiny], ['pikachu'], '不认识的进化线会被过滤掉');
  const start = c2.msgs.find((m) => m.t === 'start') as Extract<S2C, { t: 'start' }>;
  assert.ok(start.players.every((p) => p.shiny));
  assert.ok(sim.publicState().players.every((p) => p.shiny));
});
