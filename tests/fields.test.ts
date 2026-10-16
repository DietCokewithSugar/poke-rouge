import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BURN_PHYS, FIELDS, FIELD_CELL, FIELD_FORM, FIELD_IDS, FIELD_MIN_FRAC, FIELD_SHAPES, FIELD_TOTAL_FRAC, FROST_SLOW, FROST_SLOW_DUR, GRASS_DRAIN, GRASS_DRAIN_CAP,
  LAVA_DPS, LAVA_LINGER, NO_MOVE_MOD, cellAt, components, decodeCells, fieldBurns, fieldGrid, fieldSpeed, fieldTarget, fieldVerdict, growField, moveMod,
  type FieldId,
} from '../src/shared/fields';
import { PROTOCOL_VERSION, type S2C } from '../src/shared/protocol';
import { buildOf } from '../src/shared/pvp/build';
import { PvpSim } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { Room } from '../src/shared/room';
import { enemyHurt, hitEnemy } from '../src/shared/sim/combat';
import type { Enemy } from '../src/shared/sim/entities';
import { GameSim, type Ev } from '../src/shared/sim/game';
import { SKILLS } from '../src/shared/skills';
import { skillLevelCd } from '../src/shared/skills';
import type { PType } from '../src/shared/types';

const DT = 1 / 30;
const { cols, rows } = fieldGrid(768, 576);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/** 以 (x, y) 所在的格子为中心、边长 2n+1 格的方块 */
function square(x: number, y: number, n = 5): number[] {
  const cx = Math.floor(x / FIELD_CELL), cy = Math.floor(y / FIELD_CELL);
  const out: number[] = [];
  for (let dy = -n; dy <= n; dy++) {
    for (let dx = -n; dx <= n; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) out.push(gy * cols + gx);
    }
  }
  return out;
}

/** 第 1 波（还没有场地）的单人冒险，玩家脚下放一块立刻生效的场地；不会暴击，方便比较伤害 */
function setup(line: string, kind: FieldId | null, seed = 1) {
  const sim = new GameSim([{ id: 1, name: 'A', line, meta: {} }], seed);
  const p = sim.players[0];
  p.levelMods.crit = -100;
  sim.recompute(p);
  sim.enemies = [];
  sim.pending = [];
  if (kind) sim.placeField(kind, square(p.x, p.y));
  return { sim, p };
}

/** 只留下 keep 里的敌人，往前走 sec 秒；玩家不会被别的东西打到 */
function run(sim: GameSim, sec: number, keep: Enemy[] = [], each?: () => void) {
  const evs: Ev[] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    sim.enemies = sim.enemies.filter((e) => keep.includes(e));
    sim.pending = [];
    each?.();
    sim.step(DT);
    evs.push(...sim.flushEvents());
  }
  return evs;
}

function tough(e: Enemy, speed = 0) {
  e.hp = e.maxHp = 1e6;
  e.speed = speed;
  e.dmg = 0;
  return e;
}

/** 用某个招式打一下站在身边的敌人，返回伤害（kind 为 null 时没有场地） */
function hitOnce(line: string, skill: string, kind: FieldId | null, enemy = 'rattata') {
  const { sim, p } = setup(line, kind);
  // 伤害数字大一些，取整的误差就可以忽略
  p.levelMods.atk += 600;
  p.levelMods.spa += 600;
  sim.recompute(p);
  p.skills = [{ id: skill, lv: 1, cd: 0 }];
  const e = tough(sim.spawnEnemy(enemy, p.x + 24, p.y));
  for (let i = 0; i < 90 && e.hp === e.maxHp; i++) run(sim, DT, [e], () => { p.invuln = 9; });
  return e.maxHp - e.hp;
}

/** 让某个招式放一次，返回放完之后的冷却时间 */
function castCd(line: string, skill: string, kind: FieldId | null) {
  const { sim, p } = setup(line, kind);
  p.skills = [{ id: skill, lv: 1, cd: 0 }];
  const e = tough(sim.spawnEnemy('rattata', p.x + 24, p.y));
  run(sim, DT, [e], () => { p.invuln = 9; });
  return { cd: p.skills[0].cd, base: SKILLS[skill].cd * skillLevelCd(1) * p.d.cdMult, sim, p };
}

function toWave(sim: GameSim, wave: number) {
  while (sim.wave < wave) {
    sim.waveT = sim.waveDur;
    sim.step(DT);
    for (const p of sim.players) p.ready = true;
    sim.step(DT);
  }
}

test('八种局部属性场地：每种至少给两种属性优势，也都有明确的不利效果，数值和设计表一致', () => {
  assert.equal(FIELD_IDS.length, 8);
  const helps = (r: (typeof FIELDS)[FieldId]['moves'][number]) => (r.dmg ?? 1) > 1 || (r.cd ?? 1) < 1 || (r.area ?? 1) > 1 || !!r.crit || !!r.drain || !!r.chill;
  for (const id of FIELD_IDS) {
    const F = FIELDS[id];
    assert.ok(F.types.length >= 2, `${F.name}：获益属性 ${F.types}`);
    for (const t of F.types) assert.ok(F.moves.some((r) => r.types.includes(t) && helps(r)), `${F.name}：${t} 招式有加成`);
    assert.ok(F.moves.some((r) => (r.dmg ?? 1) < 1 || (r.cd ?? 1) > 1) || F.body, `${F.name}：有不利效果`);
    assert.ok(F.good && F.bad && F.short.every(Boolean));
  }
  const mm = (f: FieldId, t: PType) => moveMod(f, t);
  assert.equal(mm('lava', 'fire').dmg, 1.25);
  assert.equal(mm('lava', 'rock').dmg, 1.25);
  assert.ok(near(mm('smog', 'ghost').size ** 2, 2) && near(mm('smog', 'poison').size ** 2, 2) && near(mm('smog', 'dark').size ** 2, 2), '毒 / 幽灵 / 恶招式覆盖面积翻倍');
  assert.equal(mm('smog', 'grass').cd, 2);
  assert.equal(mm('smog', 'electric').cd, 2);
  assert.equal(mm('rain', 'water').cd, 0.8);
  assert.equal(mm('rain', 'electric').cd, 0.8);
  assert.equal(mm('grass', 'grass').drain, GRASS_DRAIN);
  assert.equal(mm('grass', 'bug').drain, GRASS_DRAIN);
  for (const t of ['psychic', 'fairy', 'dragon'] as const) assert.equal(mm('crystal', t).dmg, 1.25);
  assert.equal(mm('crystal', 'dark').dmg, 0.8);
  assert.equal(mm('crystal', 'ghost').dmg, 0.8);
  assert.ok(near(mm('updraft', 'flying').size ** 2, 1.5) && near(mm('updraft', 'bug').size ** 2, 1.5));
  assert.equal(mm('updraft', 'rock').cd, 1.35);
  assert.equal(mm('updraft', 'ground').cd, 1.35);
  for (const t of ['normal', 'ground', 'fighting'] as const) assert.equal(mm('clearing', t).crit, 15);
  assert.equal(mm('clearing', 'electric').dmg, 0.8);
  assert.equal(mm('clearing', 'ghost').dmg, 0.8);
  for (const t of ['ice', 'water', 'steel'] as const) assert.ok(mm('frost', t).chill);
  assert.equal(mm('frost', 'fire').cd, 1.35);
  assert.deepEqual({ ...mm('lava', 'water') }, { ...NO_MOVE_MOD }, '不相关的属性没有修正');
  assert.deepEqual({ ...moveMod(null, 'fire') }, { ...NO_MOVE_MOD });
  assert.ok(fieldBurns('lava', ['water']) && !fieldBurns('lava', ['fire']) && !fieldBurns('lava', ['rock', 'ground']) && !fieldBurns('lava', ['fire', 'flying']));
  assert.equal(fieldSpeed('rain', ['normal', 'flying']), 0.75);
  assert.equal(fieldSpeed('rain', ['water']), 1);
  assert.equal(fieldSpeed('grass', ['fire']), 0.8);
  assert.equal(fieldSpeed('grass', ['bug', 'flying']), 1);
  assert.equal(fieldSpeed('grass', ['grass', 'poison']), 1);
});

test('场地形状：大小和形状都随机，每块都是连续的一整块，最多占整张地图的 1/3', () => {
  const total = cols * rows, max = Math.floor(total / 3), min = Math.ceil(total * FIELD_MIN_FRAC);
  const sizes = new Set<number>();
  const ratios: number[] = [];
  for (let s = 1; s <= 300; s++) {
    const rng = new Rng(s * 977);
    const blocked = new Uint8Array(total);
    // 地图左边一条已经被别的场地占了
    for (let y = 0; y < rows; y++) for (let x = 0; x < 6; x++) blocked[y * cols + x] = 1;
    const cells = growField(rng, { cols, rows, blocked, target: fieldTarget(rng, total, max), min, max }, FIELD_SHAPES[s % FIELD_SHAPES.length]);
    assert.ok(cells, `第 ${s} 次没长出来`);
    assert.equal(new Set(cells).size, cells.length, '格子不重复');
    assert.ok(cells.length >= min && cells.length <= max, `${cells.length} 格（${min}~${max}）`);
    assert.ok(cells.length <= total / 3);
    assert.equal(components(cols, cells), 1, '连续的一整块，不是这一块那一块');
    assert.ok(cells.every((c) => !blocked[c]), '不占别人的格子');
    sizes.add(cells.length);
    const xs = cells.map((c) => c % cols), ys = cells.map((c) => Math.floor(c / cols));
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    ratios.push(Math.max(w, h) / Math.min(w, h));
  }
  assert.ok(sizes.size > 100, `大小各不相同：${sizes.size} 种`);
  assert.ok(Math.max(...ratios) > 1.8 && Math.min(...ratios) < 1.15, `有长条也有圆团：${Math.min(...ratios).toFixed(2)} ~ ${Math.max(...ratios).toFixed(2)}`);
});

test('冒险：第 2 波起开场出现一块场地，先闪烁预告再生效；第 6 波起中途再出现一块；波次结束时消失', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }], 21);
  const p = sim.players[0];
  assert.equal(sim.fields.length, 0, '第 1 波没有场地');
  toWave(sim, 2);
  sim.flushEvents();
  assert.equal(sim.fields.length, 1);
  const f = sim.fields[0];
  assert.ok(!f.cells.includes(cellAt(cols, rows, p.x, p.y)), '不会长在玩家脚下');
  assert.equal(components(cols, f.cells), 1);
  assert.ok(f.cells.length <= (cols * rows) / 3);
  assert.equal(sim.fieldAt(f.cx, f.cy), null, '刚出现时还在预告');
  assert.equal(sim.publicState().fields[0].on, false);
  const evs = run(sim, FIELD_FORM + 0.1, [], () => { p.invuln = 9; p.hp = p.d.maxHp; });
  assert.equal(sim.fieldAt(f.cx, f.cy), f.kind, '预告之后生效');
  assert.deepEqual(sim.publicState().fields, [{ id: f.id, kind: f.kind, on: true }]);
  assert.ok(evs.some((e) => e[0] === 'msg' && String(e[1]).startsWith(`${FIELDS[f.kind].name}出现了`)), '生效时提示');
  sim.waveT = sim.waveDur;
  sim.step(DT);
  assert.equal(sim.phase, 'inter');
  assert.equal(sim.fields.length, 0, '波次结束时消失');
  assert.ok(sim.flushEvents().some((e) => e[0] === 'fieldOff'));
  assert.equal(sim.fieldAt(f.cx, f.cy), null);

  toWave(sim, 6);
  assert.equal(sim.fields.length, 1);
  const first = sim.fields[0];
  run(sim, sim.waveDur * 0.55, [], () => { p.invuln = 9; p.hp = p.d.maxHp; });
  assert.equal(sim.fields.length, 2, '第 6 波中途又出现一块');
  const second = sim.fields[1];
  assert.notEqual(second.kind, first.kind, '同时出现的两块不是同一种');
  const taken = new Set(first.cells);
  for (const c of second.cells) {
    const x = c % cols;
    for (const nb of [c - cols - 1, c - cols, c - cols + 1, c - 1, c + 1, c + cols - 1, c + cols, c + cols + 1]) {
      if (Math.abs((nb % cols) - x) <= 1) assert.ok(!taken.has(nb), '两块场地不重叠，也不挨着');
    }
  }
  assert.ok(first.cells.length + second.cells.length <= cols * rows * FIELD_TOTAL_FRAC, '加起来不超过地图的 45%');
});

test('场地按地区和队伍的属性挑选，开场的场地不会连着两波一样', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'charmander', meta: {} }], 5);
  let last: FieldId | null = null;
  const seen = new Set<FieldId>();
  for (let w = 2; w <= 20; w++) {
    toWave(sim, w);
    const k = sim.fields[0]?.kind;
    assert.ok(k, `第 ${w} 波有场地`);
    assert.notEqual(k, last, `第 ${w} 波和上一波开场的场地不一样`);
    seen.add(k);
    last = k;
  }
  assert.ok(seen.size >= 5, `一局里能见到很多种场地：${[...seen]}`);
});

test('熔岩池：非火 / 岩石系的宝可梦进入后灼伤——持续掉血、物理伤害减半，离开后还要烧 2 秒', () => {
  const { sim, p } = setup('squirtle', 'lava');
  p.levelMods.regen = -99;
  sim.recompute(p);
  run(sim, DT);
  assert.equal(p.fieldBurn, LAVA_LINGER);
  assert.equal(sim.castMod(p, SKILLS.tackle).dmg, BURN_PHYS, '物理招式伤害减半');
  assert.equal(sim.castMod(p, SKILLS.water_gun).dmg, 1, '特殊招式不受影响');
  p.skills = [];
  p.invuln = 9;
  const hp0 = p.hp;
  const evs = run(sim, 2);
  const lost = hp0 - p.hp;
  assert.ok(near(lost, Math.round(p.d.maxHp * LAVA_DPS * 0.5) * 4, 1), `2 秒掉了 ${lost}（最大 HP ${p.d.maxHp}）`);
  assert.ok(evs.some((e) => e[0] === 'ph' && e[1] === p.id && e[4] === 32), '掉血显示成灼伤');
  p.x = 60; p.y = 60;
  run(sim, 1.5);
  assert.ok(p.fieldBurn > 0, '离开熔岩后还在烧');
  run(sim, 0.6);
  assert.equal(p.fieldBurn, 0);
  const hp1 = p.hp;
  run(sim, 1);
  assert.equal(p.hp, hp1, '烧完就不掉血了');
  const burned = hitOnce('squirtle', 'tackle', 'lava'), plain = hitOnce('squirtle', 'tackle', null);
  assert.ok(near(burned / plain, 0.5, 0.03), `撞击：灼伤 ${burned} / 平时 ${plain}`);
});

test('熔岩池：火 / 岩石招式伤害 +25%，火、岩石系的宝可梦不会被灼伤', () => {
  const { sim, p } = setup('charmander', 'lava');
  run(sim, 1, [], () => { p.invuln = 9; });
  assert.equal(p.fieldBurn, 0);
  assert.equal(p.hp, p.d.maxHp);
  assert.equal(sim.castMod(p, SKILLS.scratch).dmg, 1, '没被灼伤，物理招式照常');
  assert.equal(sim.castMod(p, SKILLS.rock_throw).dmg, 1.25);
  const fire = hitOnce('charmander', 'ember', 'lava'), plain = hitOnce('charmander', 'ember', null);
  assert.ok(near(fire / plain, 1.25, 0.03), `火花：熔岩池 ${fire} / 平时 ${plain}`);
  const rock = hitOnce('geodude', 'rock_throw', 'lava'), rock0 = hitOnce('geodude', 'rock_throw', null);
  assert.ok(near(rock / rock0, 1.25, 0.03), `落石：熔岩池 ${rock} / 平时 ${rock0}`);
});

test('熔岩池：野生宝可梦遵守同样的规则（被灼伤、接触伤害减半；岩石系的攻击 +25%；精英和首领掉血少一些）', () => {
  const { sim, p } = setup('charmander', 'lava');
  const rat = tough(sim.spawnEnemy('rattata', p.x + 40, p.y));
  rat.hp = rat.maxHp = 1000;
  const geo = tough(sim.spawnEnemy('geodude', p.x - 40, p.y));
  const dog = tough(sim.spawnEnemy('w58', p.x, p.y + 40));
  const bee = tough(sim.spawnEnemy('beedrill', p.x, p.y - 40));
  bee.hp = bee.maxHp = 1000;
  p.skills = [];
  run(sim, 1.1, [rat, geo, dog, bee], () => { p.invuln = 9; });
  assert.ok((rat.fieldBurn ?? 0) > 0 && (bee.fieldBurn ?? 0) > 0, '一般、虫系的被灼伤');
  assert.ok(!geo.fieldBurn && !dog.fieldBurn, '岩石、火系的不会');
  assert.ok(near(1000 - rat.hp, 1000 * LAVA_DPS, 1), `小拉达 1 秒掉了 ${1000 - rat.hp}`);
  assert.ok(near(1000 - bee.hp, (1000 * LAVA_DPS) / 3, 1), `精英只掉 1/3：${1000 - bee.hp}`);
  assert.equal(sim.enemyMod(rat, 'phys').dmg, BURN_PHYS, '灼伤时接触伤害减半');
  assert.equal(sim.enemyMod(rat, 'spec').dmg, 1);
  assert.equal(sim.enemyMod(geo, 'phys').dmg, 1.25, '岩石系的攻击 +25%');
  // 接触伤害真的减半：同一只小拉达贴在玩家身上
  const contact = (kind: FieldId | null) => {
    const s = setup('charmander', kind, 3);
    const e = s.sim.spawnEnemy('rattata', s.p.x, s.p.y);
    e.speed = 0;
    if (kind) run(s.sim, DT, [e], () => { s.p.invuln = 9; });
    s.p.invuln = 0;
    const hp = s.p.hp;
    run(s.sim, DT, [e]);
    return hp - s.p.hp;
  };
  const burnedHit = contact('lava'), normalHit = contact(null);
  assert.ok(burnedHit > 0 && near(burnedHit / normalHit, 0.5, 0.2), `接触伤害：灼伤 ${burnedHit} / 平时 ${normalHit}`);
});

test('阴云毒雾：毒 / 幽灵 / 恶招式覆盖面积翻倍，草 / 电招式冷却翻倍；野生宝可梦的毒系自爆范围也变大', () => {
  const g = castCd('bulbasaur', 'vine_whip', 'smog');
  assert.ok(near(g.cd, g.base * 2, 1e-6), `藤鞭冷却 ${g.cd}（平时 ${g.base}）`);
  const e = castCd('pikachu', 'thunder_shock', 'smog');
  assert.ok(near(e.cd, e.base * 2, 1e-6), '电击冷却翻倍');
  const ghost = setup('gastly', 'smog');
  ghost.p.skills = [{ id: 'night_shade', lv: 1, cd: 0 }];
  const t = tough(ghost.sim.spawnEnemy('rattata', ghost.p.x + 60, ghost.p.y));
  run(ghost.sim, DT, [t], () => { ghost.p.invuln = 9; });
  const pr = ghost.sim.projs.find((x) => x.owner === ghost.p.id)!;
  assert.ok(pr && near(pr.r, (SKILLS.night_shade.size ?? 3) * Math.SQRT2, 1e-6), `黑夜魔影的弹体半径 ${pr?.r}`);
  const zone = setup('bulbasaur', 'smog');
  zone.p.skills = [{ id: 'poison_powder', lv: 1, cd: 0 }];
  const z0 = tough(zone.sim.spawnEnemy('rattata', zone.p.x + 50, zone.p.y));
  run(zone.sim, DT, [z0], () => { zone.p.invuln = 9; });
  const zz = zone.sim.zones.find((x) => x.owner === zone.p.id)!;
  assert.ok(zz && near(zz.r ** 2, ((SKILLS.poison_powder.radius ?? 30) ** 2) * 2, 1e-6), `毒粉的面积翻倍：半径 ${zz?.r}`);
  // 野生的瓦斯弹（毒系）在毒雾里自爆，范围也翻倍
  const k = setup('charmander', 'smog');
  const koffing = k.sim.spawnEnemy('koffing', k.p.x + 12, k.p.y);
  koffing.hp = koffing.maxHp = 1e6;
  k.p.skills = [];
  const evs = run(k.sim, 1.2, [koffing], () => { k.p.invuln = 9; });
  const boom = evs.find((x) => x[0] === 'boom' && x[4] === 'e_cloud');
  assert.ok(boom, '瓦斯弹自爆了');
  assert.equal(boom[3], Math.round(36 * Math.SQRT2), '自爆半径按面积翻倍');
});

test('局部阵雨：水 / 电招式冷却减少 20%；飞行系宝可梦（玩家和野生的都一样）移动速度降低 25%', () => {
  const w = castCd('squirtle', 'water_gun', 'rain');
  assert.ok(near(w.cd, w.base * 0.8, 1e-6), `水枪冷却 ${w.cd}（平时 ${w.base}）`);
  const fly = setup('pidgey', 'rain');
  run(fly.sim, DT, [], () => { fly.p.invuln = 9; });
  assert.ok(near(fly.sim.moveSpeed(fly.p), fly.sim.baseMoveSpeed(fly.p) * 0.75), '波波在雨里慢了 25%');
  assert.equal(fly.sim.privateState(fly.p).speed, fly.sim.baseMoveSpeed(fly.p), '发给客户端的是不算场地的速度（客户端自己按场地再乘）');
  const wet = setup('squirtle', 'rain');
  assert.equal(wet.sim.moveSpeed(wet.p), wet.sim.baseMoveSpeed(wet.p), '不是飞行系就不受影响');
  const pid = wet.sim.spawnEnemy('pidgey', wet.p.x + 20, wet.p.y), rat = wet.sim.spawnEnemy('rattata', wet.p.x - 20, wet.p.y);
  assert.equal(wet.sim.enemyFieldSpeed(pid), 0.75);
  assert.equal(wet.sim.enemyFieldSpeed(rat), 1);
  const mag = wet.sim.spawnEnemy('magnemite', wet.p.x, wet.p.y + 30);
  assert.equal(wet.sim.enemyMod(mag, 'spec').cd, 0.8, '电系的小磁怪射得更快');
});

test('繁茂草丛：草 / 虫招式命中后回复造成伤害的 5%（每秒最多 2% 最大 HP）；其他属性的宝可梦移动速度降低 20%', () => {
  const { sim, p } = setup('bulbasaur', 'grass');
  p.levelMods.regen = -99;
  sim.recompute(p);
  p.hp = 1;
  p.skills = [{ id: 'vine_whip', lv: 1, cd: 0 }];
  const e = tough(sim.spawnEnemy('rattata', p.x + 24, p.y));
  run(sim, DT, [e], () => { p.invuln = 9; });
  const dmg = e.maxHp - e.hp;
  assert.ok(dmg > 0);
  assert.ok(near(p.hp - 1, Math.min(dmg * GRASS_DRAIN, p.d.maxHp * GRASS_DRAIN_CAP), 1e-6), `打了 ${dmg}，回复 ${p.hp - 1}`);
  // 很快的招式连着打 1 秒，回复不超过上限
  p.skills = [{ id: 'quick_attack', lv: 1, cd: 0 }];
  p.levelMods.atk = 999;
  sim.recompute(p);
  p.hp = 1;
  sim.time = Math.ceil(sim.time + 1);
  run(sim, 0.95, [e], () => { p.invuln = 9; p.skills[0].cd = Math.min(p.skills[0].cd, 0.05); });
  assert.equal(sim.castMod(p, SKILLS.quick_attack).drain, 0, '一般系的招式没有回复');
  p.skills = [{ id: 'razor_leaf', lv: 1, cd: 0 }];
  p.hp = 1;
  sim.time = Math.ceil(sim.time + 1);
  const t0 = sim.time;
  run(sim, 0.9, [e], () => { p.invuln = 9; p.skills[0].cd = Math.min(p.skills[0].cd, 0.05); });
  assert.ok(sim.time - t0 < 1);
  assert.ok(p.hp - 1 <= p.d.maxHp * GRASS_DRAIN_CAP + 1e-6, `1 秒内最多回复 2%：${p.hp - 1} / ${p.d.maxHp}`);
  assert.ok(p.hp - 1 > 0);
  assert.equal(sim.moveSpeed(p), sim.baseMoveSpeed(p), '草系不减速');
  const fire = setup('charmander', 'grass');
  run(fire.sim, DT, [], () => { fire.p.invuln = 9; });
  assert.ok(near(fire.sim.moveSpeed(fire.p), fire.sim.baseMoveSpeed(fire.p) * 0.8), '火系在草丛里慢 20%');
  assert.equal(fire.sim.enemyFieldSpeed(fire.sim.spawnEnemy('caterpie', fire.p.x, fire.p.y + 20)), 1);
  assert.equal(fire.sim.enemyFieldSpeed(fire.sim.spawnEnemy('rattata', fire.p.x, fire.p.y - 20)), 0.8);
  // 野生的绿毛虫（虫系）在草丛里撞到玩家也会回复
  const cat = fire.sim.spawnEnemy('caterpie', fire.p.x, fire.p.y);
  cat.speed = 0;
  cat.maxHp = 1000;
  cat.hp = 500;
  fire.p.skills = [];
  fire.p.invuln = 0;
  run(fire.sim, DT, [cat]);
  assert.ok(cat.hp > 500, `绿毛虫回复了 ${cat.hp - 500}`);
});

test('共鸣晶石：超能力 / 妖精 / 龙招式伤害 +25%，恶 / 幽灵招式伤害 -20%；野生的超能力系也一样', () => {
  const psy = hitOnce('abra', 'confusion', 'crystal'), psy0 = hitOnce('abra', 'confusion', null);
  assert.ok(near(psy / psy0, 1.25, 0.03), `念力：${psy} / ${psy0}`);
  const fairy = hitOnce('clefairy', 'fairy_wind', 'crystal'), fairy0 = hitOnce('clefairy', 'fairy_wind', null);
  assert.ok(near(fairy / fairy0, 1.25, 0.05), `妖精之风：${fairy} / ${fairy0}`);
  const ghost = hitOnce('gastly', 'night_shade', 'crystal'), ghost0 = hitOnce('gastly', 'night_shade', null);
  assert.ok(near(ghost / ghost0, 0.8, 0.03), `黑夜魔影：${ghost} / ${ghost0}`);
  const shot = (kind: FieldId | null) => {
    const s = setup('charmander', kind);
    const k = s.sim.spawnEnemy('kadabra', s.p.x + 30, s.p.y);
    k.ai.cd = 0;
    run(s.sim, DT, [k], () => { s.p.invuln = 9; });
    return s.sim.projs.find((x) => x.owner < 0)!.dmg;
  };
  assert.ok(near(shot('crystal') / shot(null), 1.25, 1e-6), '勇基拉的念力弹在晶石旁边也更痛');
});

test('上升气流：飞行 / 虫招式覆盖面积 +50%，岩石 / 地面招式冷却 +35%', () => {
  const s = setup('pidgey', 'updraft');
  s.p.skills = [{ id: 'gust', lv: 1, cd: 0 }];
  const t = tough(s.sim.spawnEnemy('rattata', s.p.x + 60, s.p.y));
  run(s.sim, DT, [t], () => { s.p.invuln = 9; });
  const pr = s.sim.projs.find((x) => x.owner === s.p.id)!;
  assert.ok(near(pr.r ** 2, (SKILLS.gust.size ?? 3) ** 2 * 1.5, 1e-6), `起风的弹体 ${pr.r}`);
  const r = castCd('geodude', 'rock_throw', 'updraft');
  assert.ok(near(r.cd, r.base * 1.35, 1e-6), `落石冷却 ${r.cd}（平时 ${r.base}）`);
  const m = castCd('geodude', 'mud_slap', 'updraft');
  assert.ok(near(m.cd, m.base * 1.35, 1e-6), '掷泥（地面）冷却 +35%');
});

test('开阔空地：一般 / 地面 / 格斗招式暴击率 +15 个百分点，电 / 幽灵招式伤害 -20%；野生的一般系也会暴击', () => {
  const { sim, p } = setup('machop', 'clearing');
  run(sim, DT, [], () => { p.invuln = 9; });
  p.levelMods.crit = 0;
  sim.recompute(p);
  const count = (crit: number) => {
    const before = p.stats.crits;
    const e = tough(sim.spawnEnemy('rattata', 100, 100));
    for (let i = 0; i < 6000; i++) hitEnemy(sim, e, p, 10, 'fighting', { crit });
    sim.flushEvents();
    return (p.stats.crits - before) / 6000;
  };
  const inField = count(sim.castMod(p, SKILLS.vacuum_wave).crit), base = count(0);
  assert.ok(near(base, p.d.crit, 0.02), `平时暴击率 ${base}`);
  assert.ok(near(inField - base, 0.15, 0.025), `空地里暴击率多了 ${(inField - base).toFixed(3)}`);
  const elec = hitOnce('pikachu', 'thunder_shock', 'clearing'), elec0 = hitOnce('pikachu', 'thunder_shock', null);
  assert.ok(near(elec / elec0, 0.8, 0.05), `电击：${elec} / ${elec0}`);
  const rat = sim.spawnEnemy('rattata', p.x + 10, p.y);
  const m = sim.enemyMod(rat, 'phys');
  assert.equal(m.crit, 15, '野生的小拉达（一般系）在空地里也会暴击');
  p.levelMods.maxHp += 5000;
  sim.recompute(p);
  let crits = 0;
  for (let i = 0; i < 4000; i++) {
    p.invuln = 0;
    p.hp = p.d.maxHp;
    const dealt = enemyHurt(sim, p, 40, 'phys', m, rat);
    if (dealt > Math.round(40 * p.d.physTaken)) crits++;
  }
  assert.ok(near(crits / 4000, 0.15, 0.025), `野生的暴击率 ${crits / 4000}`);
});

test('寒霜区域：冰 / 水 / 钢招式命中后让目标减速 20%、持续 2 秒，重复命中刷新；火系招式冷却 +35%；野生的水系打到玩家也会减速', () => {
  const { sim, p } = setup('squirtle', 'frost');
  p.skills = [{ id: 'water_gun', lv: 1, cd: 0 }];
  const e = tough(sim.spawnEnemy('rattata', p.x + 30, p.y));
  for (let i = 0; i < 60 && e.hp === e.maxHp; i++) run(sim, DT, [e], () => { p.invuln = 9; });
  assert.ok(e.hp < e.maxHp);
  assert.ok(e.st.slow > FROST_SLOW_DUR - 0.2 && near(e.st.slowAmt, FROST_SLOW), `减速 ${e.st.slowAmt}，还剩 ${e.st.slow} 秒`);
  p.skills = [];
  run(sim, 1, [e], () => { p.invuln = 9; });
  assert.ok(e.st.slow < FROST_SLOW_DUR - 0.8);
  p.skills = [{ id: 'water_gun', lv: 1, cd: 0 }];
  const hp = e.hp;
  for (let i = 0; i < 60 && e.hp === hp; i++) run(sim, DT, [e], () => { p.invuln = 9; });
  assert.ok(e.st.slow > FROST_SLOW_DUR - 0.2, '重复命中刷新时间');
  p.skills = [];
  run(sim, FROST_SLOW_DUR + 0.1, [e], () => { p.invuln = 9; });
  assert.equal(e.st.slowAmt, 0, '时间到了就不减速了');
  const f = castCd('charmander', 'ember', 'frost');
  assert.ok(near(f.cd, f.base * 1.35, 1e-6), `火花冷却 ${f.cd}（平时 ${f.base}）`);
  // 野生的杰尼龟（水系）在寒霜区域撞到玩家
  const s = setup('charmander', 'frost');
  const w = s.sim.spawnEnemy('w7', s.p.x, s.p.y);
  w.speed = 0;
  s.p.skills = [];
  s.p.invuln = 0;
  run(s.sim, DT, [w]);
  assert.ok(s.p.slowT > FROST_SLOW_DUR - 0.1 && near(s.p.slowAmt, FROST_SLOW), '玩家被减速 20%');
  assert.ok(near(s.sim.moveSpeed(s.p), s.p.d.moveSpeed * (1 - FROST_SLOW)));
});

test('场地还在预告时没有任何效果；预告结束才生效', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }], 2);
  const p = sim.players[0];
  const f = sim.placeField('lava', square(p.x, p.y), FIELD_FORM);
  run(sim, FIELD_FORM - 0.2, [], () => { p.invuln = 9; });
  assert.equal(sim.fieldAt(p.x, p.y), null);
  assert.equal(p.fieldBurn, 0);
  assert.equal(p.hp, p.d.maxHp);
  run(sim, 0.4, [], () => { p.invuln = 9; });
  assert.equal(sim.fieldAt(p.x, p.y), 'lava');
  assert.ok(p.fieldBurn > 0);
  assert.equal(sim.fieldAt(f.cx, f.cy), 'lava');
});

test('对你有利还是不利：按宝可梦的属性和会的招式判断', () => {
  const mv = (id: string) => ({ type: SKILLS[id].type, damaging: SKILLS[id].cat !== 'status', phys: SKILLS[id].cat === 'phys' });
  assert.equal(fieldVerdict('lava', ['fire'], [mv('ember'), mv('scratch')]).verdict, 'good');
  assert.equal(fieldVerdict('lava', ['water'], [mv('water_gun'), mv('tackle')]).verdict, 'bad');
  assert.equal(fieldVerdict('rain', ['water'], [mv('water_gun')]).verdict, 'good');
  assert.equal(fieldVerdict('rain', ['normal', 'flying'], [mv('gust')]).verdict, 'bad');
  assert.equal(fieldVerdict('smog', ['water'], [mv('water_gun'), mv('tackle')]).verdict, 'none');
  assert.equal(fieldVerdict('smog', ['grass', 'poison'], [mv('vine_whip'), mv('poison_powder')]).verdict, 'mixed');
  assert.ok(fieldVerdict('lava', ['water'], [mv('water_gun')]).score < 0);
  assert.ok(fieldVerdict('crystal', ['psychic'], [mv('confusion')]).score > 0);
});

test('联机同步：场地的形状随事件发送，公共状态带上场地，回到房间时补发', () => {
  const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }], 9);
  toWave(sim, 2);
  const evs = sim.flushEvents();
  const f = sim.fields[0];
  const ev = evs.find((e) => e[0] === 'field')!;
  assert.ok(ev, '出现时发事件');
  assert.equal(ev[1], f.id);
  assert.equal(FIELD_IDS[ev[2] as number], f.kind);
  assert.deepEqual(decodeCells(ev[6] as number[]).sort((a, b) => a - b), f.cells.slice().sort((a, b) => a - b), '格子原样还原');
  assert.ok((ev[6] as number[]).length < f.cells.length, '按连续段压缩');
  assert.ok(JSON.stringify(ev).length < 1200, `事件不大：${JSON.stringify(ev).length} 字节`);
  assert.equal(evs.findIndex((e) => e[0] === 'wave') < evs.findIndex((e) => e[0] === 'field'), true, '先清掉上一波的，再画新的');

  const conn = () => {
    const msgs: S2C[] = [];
    return { msgs, send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d)); } };
  };
  const room = new Room('34567');
  const a = conn(), b = conn();
  const ia = room.join(a, 'A', {}, PROTOCOL_VERSION, { line: 'charmander' }) as number;
  const ib = room.join(b, 'B', {}, PROTOCOL_VERSION, { line: 'squirtle' }) as number;
  room.handle(ib, { t: 'ready', on: true });
  room.handle(ia, { t: 'start' });
  toWave(room.sim!, 2);
  const token = [...b.msgs].reverse().find((m) => m.t === 'joined' && m.token) as Extract<S2C, { t: 'joined' }>;
  room.leave(ib, b);
  const b2 = conn();
  assert.equal(room.rejoin(b2, token.token!, PROTOCOL_VERSION), ib);
  const re = b2.msgs.filter((m) => m.t === 'ev').flatMap((m) => (m as Extract<S2C, { t: 'ev' }>).e);
  assert.ok(re.some((e) => e[0] === 'field' && e[1] === room.sim!.fields[0].id), '回来时补发场地');
  const st = [...b2.msgs].reverse().find((m) => m.t === 'st') as Extract<S2C, { t: 'st' }>;
  assert.equal(st.s.fields.length, 1);
});

test('对战里没有局部属性场地', () => {
  const build = buildOf(new GameSim([{ id: 1, name: 'x', line: 'charmander', meta: {} }], 1).players[0]);
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'A', team: 0, build, meta: {}, bot: true },
    { id: 2, name: 'B', team: 1, build: { ...build, line: 'squirtle', skills: [{ id: 'water_gun', lv: 1 }] }, meta: {}, bot: true },
  ], 4);
  for (let i = 0; i < 30 * 40 && sim.phase !== 'over'; i++) {
    sim.step(DT);
    assert.ok(!sim.flushEvents().some((e) => e[0] === 'field'));
    assert.equal(sim.fields.length, 0);
  }
  assert.deepEqual(sim.publicState().fields, []);
});

test('AI 辅助战斗：站进不利的场地会马上找出口，有利的场地尽量待在里面', () => {
  const { sim, p } = setup('squirtle', 'lava');
  sim.setAuto(p.id, true);
  run(sim, 2.5, [], () => { p.invuln = 9; });
  assert.equal(sim.fieldAt(p.x, p.y), null, '杰尼龟走出了熔岩池');
  const c = setup('charmander', 'lava');
  c.sim.setAuto(c.p.id, true);
  const foes = [tough(c.sim.spawnEnemy('rattata', c.p.x + 150, c.p.y), 30), tough(c.sim.spawnEnemy('rattata', c.p.x - 150, c.p.y + 30), 30)];
  let t = 0;
  run(c.sim, 6, foes, () => { c.p.invuln = 9; if (c.sim.fieldAt(c.p.x, c.p.y)) t++; });
  assert.ok(t / 180 > 0.6, `小火龙待在熔岩池里的时间 ${Math.round((t / 180) * 100)}%`);
  // 旁边就是对自己不利的场地：绕着走，不踩进去
  const d = setup('pidgey', null);
  d.sim.placeField('rain', square(d.p.x + 90, d.p.y, 3));
  d.sim.setAuto(d.p.id, true);
  d.sim.placeItem('candy', d.p.x + 220, d.p.y);
  let wet = 0;
  run(d.sim, 4, [], () => { d.p.invuln = 9; if (d.sim.fieldAt(d.p.x, d.p.y)) wet++; });
  assert.ok(wet < 10, `波波绕开了阵雨：在雨里 ${wet} 帧`);
});
