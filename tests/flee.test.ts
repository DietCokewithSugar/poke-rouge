import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_RUN, stardustFor, type RunSummary } from '../src/shared/meta';
import { PROTOCOL_VERSION, type S2C } from '../src/shared/protocol';
import { Room } from '../src/shared/room';

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
const save = await import('../src/client/save');

function conn() {
  const msgs: S2C[] = [];
  return { msgs, send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d) as S2C); } };
}
const last = <T extends S2C['t']>(c: ReturnType<typeof conn>, t: T) =>
  [...c.msgs].reverse().find((m) => m.t === t) as Extract<S2C, { t: T }> | undefined;

function solo() {
  const room = new Room('单人', true);
  const c = conn();
  const id = room.join(c, '小赤', {}, PROTOCOL_VERSION, { line: 'charmander' });
  assert.equal(typeof id, 'number');
  room.handle(id as number, { t: 'start' });
  assert.equal(room.sim?.phase, 'wave');
  assert.equal(room.sim?.wave, 1);
  return { room, c, id: id as number };
}

/** 把当前波次打完，停在商店 */
function finishWave(room: Room) {
  const sim = room.sim!;
  sim.waveT = sim.waveDur;
  room.update();
  assert.equal(sim.phase, 'inter');
}

test('单人放弃：按已经打完的波次结算，进行中的波次不算，不算通关', () => {
  const { room, c, id } = solo();
  finishWave(room);
  const sim = room.sim!;
  sim.players[0].ready = true;
  room.update();
  assert.equal(sim.wave, 2);
  assert.equal(sim.phase, 'wave');
  const p = sim.players[0];
  p.stats.kills = 40;
  p.stats.recruits.push('pidgey');
  p.stats.shinyRecruits.push('rattata');
  room.paused = true;
  room.handle(id, { t: 'forfeit' });
  assert.equal(room.sim, null, '这一局已经结束');
  const end = last(c, 'end');
  assert.ok(end);
  assert.equal(end.fled, true);
  assert.equal(end.victory, false);
  assert.equal(end.summary?.victory, false);
  assert.equal(end.summary?.wavesCleared, 1, '第 2 波还没打完，只算第 1 波');
  assert.deepEqual(end.summary?.recruits, ['pidgey']);
  assert.deepEqual(end.summary?.shinyRecruits, ['rattata']);
  assert.ok(end.summary?.detail.waves.some((w) => w.w === 2), '没打完的这一波仍记进成绩');
  // 1 波 ×12 + 击倒 40/20 + 普通崇拜 15 + 闪光崇拜 30，没有通关的 150
  assert.equal(stardustFor(end.summary!), 59);
  assert.equal(stardustFor({ ...end.summary!, victory: true }) - 59, 150);
});

test('商店里放弃：刚刚打完的那一波要算进去', () => {
  const { room, c, id } = solo();
  finishWave(room);
  assert.equal(room.sim!.wave, 1);
  room.handle(id, { t: 'forfeit' });
  const end = last(c, 'end')!;
  assert.equal(end.fled, true);
  assert.equal(end.victory, false);
  assert.equal(end.summary?.wavesCleared, 1);
  assert.equal(end.summary?.victory, false);
});

test('第一波还没打完就放弃：击倒和崇拜仍算成绩，波次按 0', () => {
  const { room, c, id } = solo();
  const p = room.sim!.players[0];
  p.stats.kills = 25;
  p.stats.recruits.push('pidgey');
  room.handle(id, { t: 'forfeit' });
  const end = last(c, 'end')!;
  assert.equal(end.summary?.wavesCleared, 0);
  assert.equal(end.summary?.victory, false);
  assert.equal(stardustFor(end.summary!), Math.floor(25 / 20) + 15);
  assert.ok(stardustFor(end.summary!) < stardustFor({ ...end.summary!, victory: true }));
});

test('全员倒下不是逃跑；联机放弃不会结束这一局', () => {
  const dead = solo();
  for (const p of dead.room.sim!.players) dead.room.sim!.downPlayer(p);
  dead.room.update();
  const end = last(dead.c, 'end');
  assert.ok(end);
  assert.equal(end.victory, false);
  assert.equal(end.fled, undefined);
  assert.equal(end.summary?.victory, false);

  const room = new Room('23456');
  const a = conn();
  const b = conn();
  const ia = room.join(a, 'A', {}, PROTOCOL_VERSION, { line: 'charmander' }) as number;
  const ib = room.join(b, 'B', {}, PROTOCOL_VERSION, { line: 'squirtle' }) as number;
  room.handle(ib, { t: 'ready', on: true });
  room.handle(ia, { t: 'start' });
  room.handle(ia, { t: 'forfeit' });
  assert.equal(room.sim?.phase, 'wave');
  assert.equal(last(a, 'end'), undefined);
  assert.equal(last(a, 'cmdErr'), undefined);
  room.leave(ib, b);
  assert.ok(room.sim?.players.find((p) => p.id === ib)?.away, '离开房间仍由 AI 接手');
});

function fleeSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    ...NO_RUN,
    line: 'charmander',
    difficulty: 'easy',
    wavesCleared: 3,
    victory: false,
    kills: 40,
    players: 1,
    recruits: ['pidgey'],
    shinyRecruits: ['rattata'],
    detail: { ...NO_RUN.detail, time: 90, dex: 4 },
    ...over,
  };
}

test('逃跑结算发放已经拿到的星之沙，不重复记崇拜，也不把最好成绩记成通关', () => {
  store.clear();
  const p = save.loadProfile();
  // 冒险里崇拜的瞬间就已经写入存档
  assert.equal(save.addOwned(p, 'pidgey', true), true);
  assert.equal(save.addOwned(p, 'rattata', true, true), true);
  const recruits = p.stats.recruits;
  const owned = [...p.owned];
  const shiny = [...p.shiny];
  p.bestRun = { difficulty: 'easy', waves: 20, victory: true, time: 500, dex: 4, players: 1 };
  p.stats.wins = 1;
  const s = fleeSummary();
  const before = p.stardust;
  const reward = save.applyRun(p, s);
  const ach = reward.newAchievements.reduce((n, a) => n + a.reward, 0);
  assert.equal(stardustFor(s), 3 * 12 + Math.floor(40 / 20) + 15 + 30);
  assert.equal(stardustFor({ ...s, victory: true }) - stardustFor(s), 150);
  assert.equal(reward.stardust, stardustFor(s) + ach);
  assert.equal(p.stardust, before + reward.stardust);
  assert.ok(reward.stardust >= stardustFor(s));
  assert.equal(p.stats.recruits, recruits, '崇拜次数不加第二次');
  assert.deepEqual(p.owned, owned);
  assert.deepEqual(p.shiny, shiny);
  assert.deepEqual(reward.recruits, ['pidgey']);
  assert.deepEqual(reward.shinyRecruits, ['rattata']);
  assert.equal(p.stats.wins, 1, '逃跑不加通关次数');
  assert.equal(p.bestRun?.victory, true);
  assert.equal(p.bestRun?.waves, 20);
  assert.ok(!reward.newAchievements.some((a) => a.id === 'victory' || a.id === 'victory_normal' || a.id === 'victory_hard' || a.id === 'no_evolve_win' || a.id === 'mewtwo_win'));
});

test('还没实时存过的崇拜，逃跑结算补记一次；再结算不会再加，也不算通关', () => {
  store.clear();
  const p = save.loadProfile();
  const s = fleeSummary();
  const reward = save.applyRun(p, s);
  assert.deepEqual(p.owned, ['pidgey']);
  assert.deepEqual(p.shiny, ['rattata']);
  assert.equal(p.stats.recruits, 2);
  assert.equal(p.stats.wins, 0);
  assert.equal(p.bestRun?.victory, false);
  assert.equal(p.bestRun?.waves, 3);
  assert.equal(reward.stardust, stardustFor(s) + reward.newAchievements.reduce((n, a) => n + a.reward, 0));
  const recruits = p.stats.recruits;
  const owned = [...p.owned];
  const shiny = [...p.shiny];
  const wins = p.stats.wins;
  save.applyRun(p, s);
  assert.equal(p.stats.recruits, recruits);
  assert.deepEqual(p.owned, owned);
  assert.deepEqual(p.shiny, shiny);
  assert.equal(p.stats.wins, wins);
  assert.equal(p.bestRun?.victory, false);
});
