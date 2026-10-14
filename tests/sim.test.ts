import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, metaBonus } from '../src/shared/meta';
import { LINES, LINE_IDS } from '../src/shared/pokemon';
import { decodeSnapshot, encodeSnapshot } from '../src/shared/protocol';
import { GameSim } from '../src/shared/sim/game';
import { learnSkill } from '../src/shared/sim/player';
import { SKILLS } from '../src/shared/skills';
import { gameEffectiveness, rawEffectiveness } from '../src/shared/types';
import { WAVES, waveDuration } from '../src/shared/waves';
import { ENEMIES } from '../src/shared/enemies';
import { ITEMS } from '../src/shared/items';
import { runBotGame } from './bot';

test('属性克制表', () => {
  assert.equal(rawEffectiveness('fire', ['grass']), 2);
  assert.equal(rawEffectiveness('water', ['fire']), 2);
  assert.equal(rawEffectiveness('electric', ['ground']), 0);
  assert.equal(rawEffectiveness('electric', ['rock', 'ground']), 0);
  assert.equal(rawEffectiveness('fire', ['bug', 'grass']), 4);
  assert.equal(rawEffectiveness('psychic', ['ghost', 'poison']), 2);
  assert.ok(gameEffectiveness('electric', ['ground']) > 0, '免疫在游戏里只是削弱');
  assert.equal(gameEffectiveness('fire', ['grass']), 1.1, '效果拔群只多 10%');
  assert.equal(gameEffectiveness('water', ['grass']), 0.9);
  assert.equal(gameEffectiveness('normal', ['normal']), 1);
});

test('数据引用完整', () => {
  for (const id of LINE_IDS) {
    const L = LINES[id];
    for (const s of L.start) assert.ok(SKILLS[s], `${id} 初始技能 ${s}`);
    for (const e of L.learnset) assert.ok(SKILLS[e.skill], `${id} 技能表 ${e.skill}`);
    if (L.evoItem) assert.ok(ITEMS[L.evoItem]);
  }
  for (const w of WAVES) {
    for (const e of Object.keys(w.pool)) assert.ok(ENEMIES[e], `敌人 ${e}`);
    for (const e of w.elites ?? []) assert.ok(ENEMIES[e]);
    if (w.boss) assert.ok(ENEMIES[w.boss]);
  }
  assert.equal(WAVES.length, 20);
  assert.equal(waveDuration(1), 30);
  assert.equal(waveDuration(19), 60);
  assert.equal(waveDuration(10), 90, '首领波 90 秒');
  assert.equal(waveDuration(20), 90, '首领波 90 秒');
  for (let w = 1; w <= 20; w++) {
    const d = waveDuration(w);
    assert.ok(WAVES[w - 1].boss ? d === 90 : d >= 30 && d <= 60, `第 ${w} 波 ${d} 秒`);
  }
});

test('每只精灵都能完整跑完若干波（不报错）', () => {
  for (const line of LINE_IDS) {
    const r = runBotGame([{ id: 1, name: 'bot', line, meta: {} }], 42, 6);
    assert.ok(r.wave >= 1, `${line} 到达波次 ${r.wave}`);
  }
});

test('四人联机整局模拟', () => {
  const inits = LINE_IDS.slice(0, 4).map((line, i) => ({ id: i + 1, name: `p${i}`, line, meta: { hp: 3, atk: 2 } }));
  const r = runBotGame(inits, 7);
  assert.ok(r.wave >= 3, `到达波次 ${r.wave}`);
  assert.equal(r.levels.length, 4);
});

test('快照编解码', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'pikachu', meta: {} }, { id: 2, name: 'b', line: 'mewtwo', meta: {} }], 3);
  for (let i = 0; i < 30 * 8; i++) {
    for (const p of sim.players) sim.setPlayerPos(p.id, p.x + 1, p.y, true, 0);
    sim.step(1 / 30);
  }
  const snap = decodeSnapshot(encodeSnapshot(sim, 123));
  assert.equal(snap.tick, 123);
  assert.equal(snap.players.length, 2);
  assert.equal(snap.enemies.length, sim.enemies.filter((e) => !e.dead).length);
  const p = sim.players[0];
  assert.ok(Math.abs(snap.players[0].x - p.x) < 0.3);
  assert.equal(snap.players[0].dex, 25);
});

test('技能栏满时必须指定替换的格子', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'mewtwo', meta: {} }], 1);
  const p = sim.players[0];
  assert.equal(p.slots, 3);
  assert.equal(learnSkill(p, 'swift'), null);
  assert.equal(learnSkill(p, 'psybeam'), null);
  assert.ok(learnSkill(p, 'flamethrower'));
  assert.equal(learnSkill(p, 'flamethrower', 0), null);
  assert.equal(p.skills[0].id, 'flamethrower');
  assert.equal(learnSkill(p, 'swift'), null, '已拥有的技能会被强化');
  assert.equal(p.skills.find((s) => s.id === 'swift')!.lv, 2);
  assert.ok(p.stats.foreignSkill);
});

test('客户端位置上报不能超速', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {} }], 1);
  const p = sim.players[0];
  sim.step(1 / 30);
  const x0 = p.x;
  sim.setPlayerPos(1, x0 + 500, p.y, true, 0);
  assert.ok(p.x - x0 < 80, `移动了 ${p.x - x0}`);
});

test('局外成长与成就', () => {
  const b = metaBonus({ hp: 3, atk: 2, money: 2, reroll: 9 });
  assert.equal(b.mods.maxHp, 9);
  assert.equal(b.mods.atk, 6);
  assert.equal(b.startMoney, 20);
  assert.equal(b.mods.rerolls, 2, '超出上限会被截断');
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: { hp: 10 } }], 1);
  assert.ok(sim.players[0].d.maxHp >= 30 + 30);
  const pika = ACHIEVEMENTS.find((a) => a.unlocks === 'pikachu')!;
  assert.ok(pika.check({ line: 'charmander', wavesCleared: 4 } as never, {} as never));
});

test('商店：购买、锁定、刷新', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'bulbasaur', meta: {} }], 9);
  const p = sim.players[0];
  sim.waveT = sim.waveDur;
  sim.step(1 / 30);
  assert.equal(sim.phase, 'inter');
  p.money = 1000;
  while (p.cards) sim.command(1, { t: 'level', i: 0, slot: 0 });
  const first = p.shop.offers[0]!;
  sim.command(1, { t: 'lock', i: 0 });
  assert.equal(sim.command(1, { t: 'reroll' }), null);
  assert.equal(p.shop.offers[0], first, '锁定的商品刷新后保留');
  const before = p.money;
  const err = sim.command(1, { t: 'buy', i: 1, slot: 0 });
  assert.equal(err, null);
  assert.ok(p.money < before);
  assert.equal(sim.command(1, { t: 'waveReady', on: true }), null);
  sim.step(1 / 30);
  assert.equal(sim.phase, 'wave');
  assert.equal(sim.wave, 2);
});

test('最终波：必须击败梦幻才能通关', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'mewtwo', meta: {} }], 5);
  const p = sim.players[0];
  p.levelMods.maxHp += 5000;
  sim.recompute(p);
  sim.wave = 19;
  sim.waveT = sim.waveDur;
  sim.step(1 / 30);
  assert.equal(sim.phase, 'inter');
  while (p.cards) sim.command(1, { t: 'level', i: 0, slot: 0 });
  p.crates = [];
  sim.command(1, { t: 'waveReady', on: true });
  sim.step(1 / 30);
  assert.equal(sim.wave, 20);
  for (let i = 0; i < 30 * 8; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); }
  assert.equal(sim.phase, 'wave', '梦幻出场前后都不应提前通关');
  assert.ok(sim.boss && sim.boss.def.id === 'mew');
  sim.waveT = sim.waveDur + 1;
  for (let i = 0; i < 30; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); }
  assert.equal(sim.phase, 'wave', '倒计时结束后梦幻发怒，战斗继续');
  sim.killEnemy(sim.boss!, p);
  sim.step(1 / 30);
  assert.equal(sim.phase, 'won');
  assert.ok(sim.summary(p).victory);
});
