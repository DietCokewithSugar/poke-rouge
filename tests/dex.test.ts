import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEX } from '../src/shared/dex';
import { ENEMIES } from '../src/shared/enemies';
import { ITEMS } from '../src/shared/items';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, unlockHint } from '../src/shared/meta';
import { LINES, LINE_IDS, LINE_OF_DEX, STARTERS, isFinal, maxStage } from '../src/shared/pokemon';
import { validateBuild } from '../src/shared/pvp/build';
import { FX_KINDS, SKILLS } from '../src/shared/skills';
import { GameSim, RECRUIT_BASE } from '../src/shared/sim/game';
import { giveItem } from '../src/shared/sim/player';
import { TRAINERS, TRAINER_LIST } from '../src/shared/trainers';

test('初代 151 只宝可梦都有所属的进化线，技能表引用有效', () => {
  for (let d = 1; d <= 151; d++) {
    assert.ok(DEX[d], `图鉴 #${d}`);
    assert.ok(LINE_OF_DEX[d], `#${d} ${DEX[d].name} 没有进化线`);
    assert.ok(ENEMIES[`w${d}`], `#${d} 没有野生版本`);
  }
  assert.equal(LINE_IDS.length, 79);
  for (const id of LINE_IDS) {
    const L = LINES[id];
    assert.ok(L.start.length >= 1 && L.start.length <= 2, `${id} 初始技能 ${L.start}`);
    for (const s of [...L.start, ...L.learnset.map((e) => e.skill)]) assert.ok(SKILLS[s], `${id} 技能 ${s}`);
    assert.equal(new Set(L.learnset.map((e) => e.lv)).size, L.learnset.length, `${id} 同一等级只领悟一个技能`);
    for (const f of L.forms) assert.ok(f.slots >= 3 && f.slots <= 5);
    if (L.unlock.ach) assert.ok(ACHIEVEMENT_BY_ID[L.unlock.ach], `${id} 解锁成就 ${L.unlock.ach}`);
    assert.ok(unlockHint(id).length > 0, `${id} 没有解锁说明`);
  }
  for (const s of STARTERS) assert.ok(LINES[s].unlock.start);
  for (const a of ACHIEVEMENTS) for (const l of a.unlocks ?? []) assert.ok(LINES[l], `成就 ${a.id} 解锁 ${l}`);
  for (const t of TRAINER_LIST) if (t.unlock.ach) assert.ok(ACHIEVEMENT_BY_ID[t.unlock.ach], `训练家 ${t.id}`);
  assert.ok(Object.keys(ENEMIES).length < 256, '敌人种类要能放进快照的 1 个字节');
  assert.ok(FX_KINDS.length < 256, '特效种类要能放进快照的 1 个字节');
  for (const e of Object.values(ENEMIES)) if (e.shot) assert.ok(FX_KINDS.includes(e.shot.fx), `${e.id} 弹体 ${e.shot.fx}`);
});

test('击败乱入的野生宝可梦有几率崇拜你：解锁整条进化线，已有的不会再崇拜', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {}, owned: ['charmander', 'pidgey'] }], 5);
  const p = sim.players[0];
  p.levelMods.recruit += 100000;
  sim.recompute(p);
  sim.flushEvents();
  sim.killEnemy(sim.spawnEnemy('w17', 100, 100), p);
  assert.ok(!sim.flushEvents().some((e) => e[0] === 'recruit'), '已经有波波了');
  sim.killEnemy(sim.spawnEnemy('w26', 100, 100), p);
  const ev = sim.flushEvents().find((e) => e[0] === 'recruit');
  assert.ok(ev, '雷丘崇拜了你');
  assert.equal(ev[3], 'pikachu', '解锁的是整条皮卡丘进化线');
  assert.ok(p.owned.has('pikachu'));
  assert.deepEqual(sim.summary(p).recruits, ['pikachu']);
  sim.killEnemy(sim.spawnEnemy('mew', 100, 100), p);
  assert.ok(!sim.flushEvents().some((e) => e[0] === 'recruit'), '首领不会崇拜');
});

test('崇拜几率：乱入的 1/30、宝藏 1/25、精英 1/150、普通小怪 1/1200，再乘以稀有度与崇拜加成', () => {
  assert.deepEqual(RECRUIT_BASE, { wild: 1 / 30, treasure: 1 / 25, minion: 1 / 1200, elite: 1 / 150 });
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {}, owned: ['charmander'] }], 17);
  const p = sim.players[0];
  const N = 30000;
  let n = 0;
  for (let i = 0; i < N; i++) {
    sim.killEnemy(sim.spawnEnemy('w19', 100, 100), p);
    if (p.owned.delete('rattata')) n++;
    if (sim.enemies.length > 300) sim.enemies = [];
    sim.flushEvents();
  }
  const want = N * RECRUIT_BASE.wild * LINES.rattata.unlock.recruit * p.d.recruitMult;
  assert.ok(Math.abs(n - want) < want * 0.2, `乱入的小拉达：${n} 次崇拜，期望约 ${Math.round(want)}`);
});

test('联机：击败者已经有了，就让给附近还没有的队友', () => {
  const sim = new GameSim([
    { id: 1, name: 'a', line: 'charmander', meta: {}, owned: ['charmander', 'rattata'] },
    { id: 2, name: 'b', line: 'squirtle', meta: {}, owned: ['squirtle'] },
  ], 5);
  const [a, b] = sim.players;
  b.levelMods.recruit += 100000;
  sim.recompute(b);
  sim.killEnemy(sim.spawnEnemy('w19', b.x, b.y), a);
  assert.ok(b.owned.has('rattata'));
  assert.equal(a.stats.recruits.length, 0);
});

test('每波都有野生宝可梦乱入（首领波除外）', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'mewtwo', meta: {}, owned: [] }], 9);
  const p = sim.players[0];
  p.levelMods.maxHp += 99999;
  sim.recompute(p);
  const seen = new Set<string>();
  const orig = sim.spawnEnemy.bind(sim);
  sim.spawnEnemy = (id, x, y) => { if (ENEMIES[id].wild) seen.add(id); return orig(id, x, y); };
  for (let i = 0; i < 30 * 40; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); }
  assert.ok(seen.size >= 1, `第 1 波乱入 ${[...seen]}`);
  for (const id of seen) assert.ok(LINES[LINE_OF_DEX[ENEMIES[id].dex]].unlock.recruit > 0, `${id} 应该是可以结交的宝可梦`);
});

test('训练家的加成在冒险与对战中生效', () => {
  const misty = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {}, trainer: 'misty' }], 1).players[0];
  const ash = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {}, trainer: 'ash' }], 1).players[0];
  assert.equal(misty.trainer, 'misty');
  assert.ok((misty.typeMods.water ?? 0) >= TRAINERS.misty.typeMods!.water!, '小霞：水系技能伤害提升');
  assert.ok(misty.d.maxHp > ash.d.maxHp);
  assert.ok(ash.d.recruitMult > misty.d.recruitMult, '小智：崇拜几率更高');
  const rocket = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {}, trainer: 'rocket' }], 1).players[0];
  assert.ok(rocket.d.moneyMult > ash.d.moneyMult && rocket.d.recruitMult < 1);
});

test('伊布用不同的进化石进化成不同的样子', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'eevee', meta: {} }], 1);
  const p = sim.players[0];
  assert.equal(maxStage('eevee', 1), 3);
  giveItem(sim, p, 'fire_stone');
  assert.equal(p.stage, 3);
  assert.equal(LINES.eevee.forms[p.stage].name, '火伊布');
  assert.ok(isFinal('eevee', p.stage));
  giveItem(sim, p, 'water_stone');
  assert.equal(p.stage, 3, '已经进化了就不能再用进化石');
  assert.equal(typeof validateBuild({ line: 'eevee', stage: 2, level: 3, skills: [{ id: 'tackle', lv: 1 }], items: [], levelMods: {} }), 'object');
  assert.equal(typeof validateBuild({ line: 'rattata', stage: 1, level: 3, skills: [{ id: 'tackle', lv: 1 }], items: [], levelMods: {} }), 'string', '等级不够不能进化');
  for (const id of ['water_stone', 'fire_stone', 'thunder_stone']) assert.ok(ITEMS[id].only?.includes('eevee'));
});

test('特性：结实保留 1 HP、坚硬脑袋不受反作用伤害', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'geodude', meta: {} }], 3);
  const p = sim.players[0];
  p.invuln = 0;
  p.hp = 5;
  sim.step(1 / 30);
  p.invuln = 0;
  const e = sim.spawnEnemy('machop', p.x, p.y);
  e.dmg = 9999;
  for (let i = 0; i < 3 && !p.down; i++) { p.invuln = 0; sim.step(1 / 30); }
  assert.ok(p.sturdyUsed, '结实触发了');
  assert.ok(LINES.geodude.flags.rockHead);
});
