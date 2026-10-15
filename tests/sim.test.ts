import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, metaBonus } from '../src/shared/meta';
import { LINES, LINE_IDS, formOf } from '../src/shared/pokemon';
import { decodeSnapshot, encodeSnapshot } from '../src/shared/protocol';
import { GameSim } from '../src/shared/sim/game';
import { learnSkill, levelUp } from '../src/shared/sim/player';
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
    for (const st of Object.keys(L.stones ?? {})) assert.ok(ITEMS[st], `${id} 进化石 ${st}`);
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
  const pika = ACHIEVEMENTS.find((a) => a.unlocks?.includes('pikachu'))!;
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

function shopSim(seed = 9) {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }], seed);
  const p = sim.players[0];
  sim.waveT = sim.waveDur;
  sim.step(1 / 30);
  p.money = 5000;
  while (p.cards) sim.command(1, { t: 'level', i: 0, slot: 0 });
  while (p.crates.length) sim.command(1, { t: 'crate', take: true });
  return { sim, p };
}

test('限持一个的道具：拥有后商店与道具球都不会再出现，已在商店里的同款会被换掉', () => {
  const { sim, p } = shopSim();
  const uniques = Object.values(ITEMS).filter((it) => it.max === 1 && !it.only && it.special !== 'revive').map((it) => it.id);
  // 商店里摆着气势披带，同时道具球也开出了气势披带
  p.shop.offers[2] = { kind: 'item', id: 'focus_sash', tier: 3, price: 10 };
  p.shop.locked[2] = true;
  p.crates.push('focus_sash', 'focus_sash');
  assert.equal(sim.command(1, { t: 'crate', take: true }), null);
  assert.equal(p.items.focus_sash, 1);
  assert.ok(p.shop.offers.every((o) => o?.id !== 'focus_sash'), '商店里的同款被换掉了');
  assert.ok(p.crates.every((id) => id !== 'focus_sash'), '剩下的道具球不会再开出同款');
  for (const id of uniques) p.items[id] = 1;
  sim.recompute(p);
  for (let i = 0; i < 300; i++) {
    p.shop.freeRerolls = 1;
    sim.command(1, { t: 'reroll' });
    for (const o of p.shop.offers) assert.ok(!o || !uniques.includes(o.id), `刷新出了已拥有的 ${o?.id}`);
  }
});

test('商店：只能撤销上一次购买', () => {
  const { sim, p } = shopSim(21);
  p.shop.offers = [
    { kind: 'item', id: 'charcoal', tier: 1, price: 20 },
    { kind: 'item', id: 'focus_sash', tier: 3, price: 80 },
    { kind: 'skill', id: 'flamethrower', tier: 3, price: 90 },
    { kind: 'item', id: 'leftovers', tier: 2, price: 40 },
  ];
  const money = p.money;
  assert.equal(sim.command(1, { t: 'undo' }), '没有可以撤销的购买');
  assert.equal(sim.command(1, { t: 'buy', i: 0 }), null);
  assert.equal(sim.command(1, { t: 'buy', i: 1 }), null);
  assert.equal(sim.privateState(p).undo, '气势披带');
  assert.equal(sim.command(1, { t: 'undo' }), null);
  assert.equal(p.items.focus_sash ?? 0, 0, '收回了气势披带');
  assert.equal(p.items.charcoal, 1, '更早的购买不受影响');
  assert.equal(p.money, money - 20);
  assert.equal(p.shop.offers[1]?.id, 'focus_sash', '商品放回原位');
  assert.equal(sim.command(1, { t: 'undo' }), '没有可以撤销的购买', '不能连续撤销');
  // 学技能也能撤销
  const skills = p.skills.map((s) => s.id).join();
  assert.equal(sim.command(1, { t: 'buy', i: 2, slot: 0 }), null);
  assert.ok(p.skills.some((s) => s.id === 'flamethrower'));
  assert.equal(sim.command(1, { t: 'undo' }), null);
  assert.equal(p.skills.map((s) => s.id).join(), skills);
  // 买完再刷新就不能撤销了
  assert.equal(sim.command(1, { t: 'buy', i: 3 }), null);
  sim.command(1, { t: 'reroll' });
  assert.equal(sim.command(1, { t: 'undo' }), '没有可以撤销的购买');
  assert.equal(p.items.leftovers, 1);
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

function toIntermission(sim: GameSim) {
  sim.waveT = sim.waveDur;
  sim.step(1 / 30);
  assert.equal(sim.phase, 'inter');
}

test('进化可以选择：取消后保持形态，之后还能再进化', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }], 11);
  const p = sim.players[0];
  for (let i = 0; i < 8; i++) levelUp(sim, p);
  assert.equal(p.stage, 0, '战斗中不会自动进化');
  toIntermission(sim);
  assert.ok(sim.privateState(p).evo?.prompt, '波次结束后询问进化');
  assert.ok(sim.command(1, { t: 'waveReady', on: true }), '不回答就不能出发');
  assert.equal(sim.command(1, { t: 'evolve', yes: false }), null);
  assert.equal(p.stage, 0);
  assert.equal(sim.privateState(p).evo?.prompt, false);
  assert.ok(sim.privateState(p).evo, '之后仍然可以进化');
  assert.equal(sim.command(1, { t: 'evolve', yes: true }), null);
  assert.equal(p.stage, 1);
  assert.equal(formOf('charmander', p.stage).name, '火恐龙');
});

test('不变之石：不会再进化，并给予加成', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'squirtle', meta: {} }], 12);
  const p = sim.players[0];
  const dmg0 = p.d.dmgMult;
  sim.debugGive(1, 'everstone');
  assert.ok(p.d.dmgMult > dmg0);
  for (let i = 0; i < 20; i++) levelUp(sim, p);
  toIntermission(sim);
  assert.equal(sim.privateState(p).evo, null);
  assert.ok(sim.command(1, { t: 'evolve', yes: true }));
  assert.equal(p.stage, 0);
});

test('香水增加敌人、喷雾减少敌人', () => {
  const count = (item?: string) => {
    const sim = new GameSim([{ id: 1, name: 'a', line: 'mewtwo', meta: {} }], 21);
    const p = sim.players[0];
    if (item) sim.debugGive(1, item);
    p.levelMods.maxHp += 99999;
    sim.recompute(p);
    let spawned = 0;
    const orig = sim.spawnEnemy.bind(sim);
    sim.spawnEnemy = (id: string, x: number, y: number) => { spawned++; return orig(id, x, y); };
    for (let i = 0; i < 30 * 25; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); }
    return spawned;
  };
  const base = count(), lure = count('max_lure'), repel = count('max_repel');
  assert.ok(lure > base * 1.15, `香水 ${lure} vs ${base}`);
  assert.ok(repel < base * 0.9, `喷雾 ${repel} vs ${base}`);
});

test('难度：困难模式的敌人更强', () => {
  const easy = new GameSim([{ id: 1, name: 'a', line: 'pikachu', meta: {} }], 3, 'easy');
  const hard = new GameSim([{ id: 1, name: 'a', line: 'pikachu', meta: {} }], 3, 'hard');
  const a = easy.spawnEnemy('machop', 100, 100), b = hard.spawnEnemy('machop', 100, 100);
  assert.ok(b.maxHp > a.maxHp * 1.4);
  assert.ok(b.dmg > a.dmg * 1.4);
  assert.ok(b.speed > a.speed);
  assert.equal(hard.publicState().difficulty, 'hard');
});

test('联机救援：站在倒下的队友身边把它救起来', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'charmander', meta: {} }, { id: 2, name: 'b', line: 'squirtle', meta: {} }], 4);
  const [a, b] = sim.players;
  for (const p of sim.players) { p.levelMods.maxHp += 99999; sim.recompute(p); }
  sim.downPlayer(b);
  sim.step(1 / 30);
  assert.ok(b.down);
  for (let i = 0; i < 40; i++) { sim.setPlayerPos(1, b.x + 10, b.y, true, 0); sim.step(1 / 30); }
  for (let i = 0; i < 30 * 3; i++) { a.hp = a.d.maxHp; sim.step(1 / 30); }
  assert.equal(b.down, false, '被救起');
  assert.ok(b.hp > 0);
  assert.equal(a.stats.revives, 1);
});
