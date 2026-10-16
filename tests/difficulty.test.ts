import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, DIFFICULTY_IDS, atLeast } from '../src/shared/difficulty';
import { ENEMIES, ENEMY_IDS, EVOLVES } from '../src/shared/enemies';
import { ACHIEVEMENT_BY_ID, NO_RUN, stardustFor, type LifetimeStats, type RunSummary } from '../src/shared/meta';
import { cleanRun, compareRuns } from '../src/shared/ranks';
import { GameSim } from '../src/shared/sim/game';
import { TOTAL_WAVES, WAVES } from '../src/shared/waves';

const solo = (d: (typeof DIFFICULTY_IDS)[number], seed = 3) => new GameSim([{ id: 1, name: 'a', line: 'pikachu', meta: {} }], seed, d);

test('难度从易到难排好：地狱、噩梦在困难之后，每一档的敌人都更强、星之沙更多', () => {
  assert.deepEqual(DIFFICULTY_IDS, ['easy', 'normal', 'hard', 'hell', 'nightmare']);
  for (let i = 1; i < DIFFICULTY_IDS.length; i++) {
    const a = DIFFICULTIES[DIFFICULTY_IDS[i - 1]], b = DIFFICULTIES[DIFFICULTY_IDS[i]];
    for (const k of ['count', 'hp', 'dmg', 'speed', 'bossHp', 'stardust'] as const) assert.ok(b[k] > a[k], `${b.name}的 ${k} 比${a.name}高`);
    assert.ok(b.candy >= a.candy && b.evolve >= a.evolve);
    assert.ok(b.unlock, `${b.name}需要解锁`);
    assert.equal(ACHIEVEMENT_BY_ID[b.unlock!].unlocksDifficulty, b.id, `成就「${ACHIEVEMENT_BY_ID[b.unlock!].name}」解锁${b.name}`);
  }
  assert.ok(DIFFICULTIES.hell.candy > 1 && DIFFICULTIES.nightmare.candy > DIFFICULTIES.hell.candy, '地狱、噩梦的糖果更多');
  assert.ok(atLeast('nightmare', 'hard') && !atLeast('hard', 'hell'));
  const hard = solo('hard').spawnEnemy('machop', 100, 100), hell = solo('hell').spawnEnemy('machop', 100, 100), nm = solo('nightmare').spawnEnemy('machop', 100, 100);
  assert.ok(hell.maxHp > hard.maxHp && nm.maxHp > hell.maxHp);
  assert.ok(hell.dmg > hard.dmg && nm.dmg > hell.dmg);
});

test('进化表只在普通小怪之间，进化后的宝可梦更强', () => {
  for (const [from, to] of Object.entries(EVOLVES)) {
    const a = ENEMIES[from], b = ENEMIES[to];
    assert.ok(a && b, `${from} → ${to}`);
    assert.equal(a.rank, 'minion');
    assert.equal(b.rank, 'minion', `${b.name}也是小怪`);
    assert.ok(b.hp > a.hp, `${b.name}比${a.name}耐打`);
    assert.ok(b.candy >= a.candy);
    assert.notEqual(a.dex, b.dex);
  }
  assert.ok(ENEMY_IDS.length < 256, '快照里的敌人种类是一个字节');
  // 每一波的小怪池里至少有一种能进化
  for (const W of WAVES) assert.ok(Object.keys(W.pool).some((id) => EVOLVES[id]) || W.boss, JSON.stringify(W.pool));
});

/** 跑几波，统计刷出来的普通小怪里有多少是进化形态 */
function spawnStats(d: (typeof DIFFICULTY_IDS)[number], waves: number[]) {
  let total = 0, evolved = 0, twice = 0;
  for (const w of waves) {
    const sim = solo(d, 7 + w);
    const p = sim.players[0];
    p.levelMods.maxHp += 99999;
    sim.recompute(p);
    sim.wave = w - 1;
    (sim as unknown as { startWave(): void }).startWave();
    const pool = new Set(Object.keys(WAVES[w - 1].pool));
    const orig = sim.spawnEnemy.bind(sim);
    sim.spawnEnemy = (id: string, x: number, y: number, candy?: number) => {
      const e = orig(id, x, y, candy);
      if (e.def.rank === 'minion' && !e.def.wild && e.def.ai !== 'flee') {
        total++;
        if (!pool.has(id)) {
          evolved++;
          assert.ok(candy !== undefined && candy < e.def.candy + 1, '进化出来的小怪按进化前掉糖果');
          if (!Object.keys(WAVES[w - 1].pool).some((b) => EVOLVES[b] === id)) twice++;
        }
      }
      return e;
    };
    for (let i = 0; i < 30 * 20; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); sim.flushEvents(); }
  }
  return { total, evolved, twice };
}

test('地狱：大约一半的小怪以进化形态出现；噩梦：全部进化，一部分是最终形态', () => {
  const easy = spawnStats('hard', [2, 4, 7]);
  assert.equal(easy.evolved, 0, '困难以下不会进化');
  const hell = spawnStats('hell', [2, 4, 7]);
  const k = hell.evolved / hell.total;
  assert.ok(k > 0.25 && k < 0.75, `地狱进化了 ${Math.round(k * 100)}%`);
  assert.equal(hell.twice, 0, '地狱只进化一阶');
  const nm = spawnStats('nightmare', [2, 4, 7]);
  const evolvable = nm.total;
  assert.ok(nm.evolved / evolvable > 0.6, `噩梦进化了 ${Math.round((nm.evolved / evolvable) * 100)}%`);
  assert.ok(nm.twice > 0, '噩梦里有直接进化到最终形态的');
});

test('地狱、噩梦掉的糖果更多：经验和金钱都变多', () => {
  const drop = (d: (typeof DIFFICULTY_IDS)[number]) => {
    const sim = solo(d);
    sim.wave = 4;
    const e = sim.spawnEnemy('rattata', 200, 200);
    const before = sim.pickups.filter((x) => x.kind === 'candy').reduce((a, x) => a + x.value, 0);
    sim.killEnemy(e, sim.players[0]);
    return (sim.pickups.filter((x) => x.kind === 'candy').reduce((a, x) => a + x.value, 0) - before) * DIFFICULTIES[d].count;
  };
  const hard = drop('hard'), hell = drop('hell'), nm = drop('nightmare');
  // 每波的糖果总量 = 每只的糖果 × 敌人数量
  assert.ok(Math.abs(hard - drop('easy')) < 1e-6, '困难的糖果总量和简单一样');
  assert.ok(Math.abs(hell / hard - DIFFICULTIES.hell.candy) < 1e-6);
  assert.ok(Math.abs(nm / hard - DIFFICULTIES.nightmare.candy) < 1e-6);
});

test('首领波的精英助阵：困难的最终波有耿鬼，地狱、噩梦的第 10 波也有精英', () => {
  const elitesOf = (d: (typeof DIFFICULTY_IDS)[number], wave: number) => {
    const sim = solo(d);
    sim.wave = wave - 1;
    (sim as unknown as { startWave(): void }).startWave();
    return (sim as unknown as { extraElites: string[] }).extraElites;
  };
  assert.deepEqual(elitesOf('hard', TOTAL_WAVES), ['gengar', 'gengar']);
  assert.deepEqual(elitesOf('hard', 10), []);
  assert.ok(elitesOf('hell', 10).length >= 1);
  assert.ok(elitesOf('nightmare', TOTAL_WAVES).length > elitesOf('hell', TOTAL_WAVES).length);
});

test('通关成就按难度往上解锁；排行榜上地狱、噩梦排在困难前面', () => {
  const s: LifetimeStats = { runs: 1, wins: 1, kills: 0, bestWave: 20, coopRuns: 0, revives: 0, recruits: 0, owned: 3, badges: 0, masters: 0, shinies: 0 };
  const win = (difficulty: (typeof DIFFICULTY_IDS)[number]): RunSummary => ({ ...NO_RUN, difficulty, victory: true, wavesCleared: 20 });
  const A = ACHIEVEMENT_BY_ID;
  assert.ok(A.victory_hard.check(win('hell'), s), '通关地狱也算通关了困难');
  assert.ok(!A.victory_hell.check(win('hard'), s));
  assert.ok(A.victory_hell.check(win('hell'), s) && A.victory_hell.check(win('nightmare'), s));
  assert.ok(A.victory_nightmare.check(win('nightmare'), s) && !A.victory_nightmare.check(win('hell'), s));
  assert.ok(stardustFor(win('nightmare')) > stardustFor(win('hell')) && stardustFor(win('hell')) > stardustFor(win('hard')));
  const run = (difficulty: string, waves: number) => cleanRun({ difficulty, waves, victory: waves >= 20, time: 1000, dex: 25, players: 1 })!;
  assert.ok(run('nightmare', 5) && run('hell', 5));
  assert.ok(compareRuns(run('hell', 3), run('hard', 20)) < 0, '地狱第 3 波排在困难通关前面');
  assert.ok(compareRuns(run('nightmare', 1), run('hell', 20)) < 0);
});
