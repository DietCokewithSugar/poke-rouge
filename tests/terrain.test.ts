import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LineId } from '../src/shared/pokemon';
import { PROTOCOL_VERSION, decodeSnapshot, encodeSnapshot, type S2C } from '../src/shared/protocol';
import { PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { Room } from '../src/shared/room';
import { enemyDmgMod, enemyHitPlayer, hitEnemy } from '../src/shared/sim/combat';
import type { Enemy } from '../src/shared/sim/entities';
import { SKILLS } from '../src/shared/skills';
import { ARENA_H, ARENA_W, GameSim, type Ev } from '../src/shared/sim/game';
import {
  BURN_LINGER, BURN_PCT, CHILL_AMT, CHILL_DUR, LEECH_CAP, LEECH_PCT, TERRAINS, TERRAIN_CELL, TERRAIN_FROM_WAVE, TERRAIN_IDS, TERRAIN_MIN_CELLS,
  TERRAIN_SPAWN_CLEAR, TF_CHILL, genTerrain, inCircle, inTerrain, packCells, pickTerrain, terrainEvent, terrainFromEvent, terrainHitFlags,
  terrainPieces, unpackCells, type Terrain, type TerrainId,
} from '../src/shared/terrain';

const DT = 1 / 30;
const GW = Math.ceil(ARENA_W / TERRAIN_CELL), GH = Math.ceil(ARENA_H / TERRAIN_CELL);
const N = GW * GH;
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

type Pt = { x: number; y: number };

/** 测试用的矩形场地（像素坐标），能量圈默认在中间 */
function rect(kind: TerrainId, x0: number, y0: number, x1: number, y1: number, circle?: { cx: number; cy: number; cr: number }): Terrain {
  const cells = new Uint8Array(N);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const x = gx * TERRAIN_CELL, y = gy * TERRAIN_CELL;
      if (x >= x0 && x + TERRAIN_CELL <= x1 && y >= y0 && y + TERRAIN_CELL <= y1) cells[gy * GW + gx] = 1;
    }
  }
  return { kind, gw: GW, gh: GH, cells, count: cells.reduce((a, c) => a + c, 0), cx: circle?.cx ?? (x0 + x1) / 2, cy: circle?.cy ?? (y0 + y1) / 2, cr: circle?.cr ?? 40 };
}

/** 场地占地图左边 320 像素；IN 在场地里，OUT 在场地外 */
const left = (kind: TerrainId) => rect(kind, 0, 0, 320, ARENA_H, { cx: 160, cy: 288, cr: 40 });
const IN: Pt = { x: 160, y: 288 };
const OUT: Pt = { x: 600, y: 288 };

interface Solo { sim: GameSim; pin: () => void }

/** 一只钉在原地、不会受伤的宝可梦，只带指定的技能；技能伤害放大 20 倍（取整误差可以忽略），不暴击 */
function solo(line: LineId, skills: string[], at: Pt | null, terrain: Terrain | null, seed = 21): Solo {
  const sim = new GameSim([{ id: 1, name: 'A', line, meta: {} }], seed);
  const p = sim.players[0];
  p.skills = skills.map((id) => ({ id, lv: 1, cd: 0 }));
  sim.enemies = [];
  sim.pending = [];
  sim.terrain = terrain;
  const phys = p.d.physMult * 20, spec = p.d.specMult * 20;
  const pin = () => {
    if (at) { p.x = at.x; p.y = at.y; }
    p.d.crit = 0;
    p.d.physMult = phys;
    p.d.specMult = spec;
    p.invuln = 9;
  };
  pin();
  return { sim, pin };
}

/** 不刷怪：场上只留 keep 里的敌人 */
function run(s: Solo, sec: number, keep: Enemy[] = [], each?: () => void): Ev[] {
  const evs: Ev[] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.sim.pending = [];
    s.sim.enemies = s.sim.enemies.filter((e) => keep.includes(e));
    s.pin();
    each?.();
    s.sim.step(DT);
    evs.push(...s.sim.flushEvents());
  }
  return evs;
}

/** 打不死、站着不动、不会打人的敌人 */
function dummy(e: Enemy) {
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  e.dmg = 0;
  return e;
}

/** 技能第一次打中敌人时这一下的伤害（只算这个技能，不算持续伤害）；warm：先站一会儿（比如先烧起来） */
function firstHit(line: LineId, skill: string, at: Pt, terrain: Terrain | null, o: { enemy?: string; dx?: number; warm?: number } = {}): number {
  const s = solo(line, [skill], at, terrain);
  if (o.warm) run(s, o.warm);
  const dx = o.dx ?? 20;
  const e = dummy(s.sim.spawnEnemy(o.enemy ?? 'rattata', at.x + dx, at.y));
  const p = s.sim.players[0];
  for (let i = 0; i < 90; i++) {
    run(s, DT, [e], () => { e.x = at.x + dx; e.y = at.y; });
    const d = p.stats.skillDmg[skill] ?? 0;
    if (d > 0) return d;
  }
  return 0;
}

/** 把技能冷却设成 1 秒，没有敌人时站 0.5 秒，看还剩多少 */
function cdAfter(line: LineId, skill: string, at: Pt, terrain: Terrain | null): number {
  const s = solo(line, [skill], at, terrain);
  s.sim.players[0].skills[0].cd = 1;
  run(s, 0.5);
  return s.sim.players[0].skills[0].cd;
}

/** 敌人在 0.5 秒里走了多远（玩家站在右边，敌人朝玩家走）；setup 可以先给敌人加状态 */
function enemyTravel(id: string, at: Pt, terrain: Terrain | null, setup?: (e: Enemy) => void): number {
  const s = solo('squirtle', [], { x: 700, y: at.y }, terrain);
  const e = s.sim.spawnEnemy(id, at.x, at.y);
  e.hp = e.maxHp = 1e9;
  setup?.(e);
  run(s, 0.5, [e]);
  return Math.hypot(e.x - at.x, e.y - at.y);
}

/** 连续 1 秒每一刻都想往上走很远：服务器按移动预算放行的距离 */
function serverTravel(line: LineId, at: Pt, terrain: Terrain | null): number {
  const s = solo(line, [], null, terrain);
  const p = s.sim.players[0];
  p.x = at.x; p.y = at.y;
  for (let i = 0; i < 30; i++) {
    s.sim.step(DT);
    s.sim.flushEvents();
    s.sim.setPlayerPos(p.id, p.x, p.y - 50, true, -Math.PI / 2);
  }
  return at.y - p.y;
}

const sumBurn = (evs: Ev[], pid: number) => evs.filter((e) => e[0] === 'ph' && e[1] === pid && e[3] === 4).reduce((a, e) => a + (e[2] as number), 0);

// ---------------------------------------------------------------- 生成

test('场地生成：大量随机种子下都是连续的一整块，面积在下限和地图 1/3 之间，不盖住出生点，同一种子结果相同', () => {
  const max = Math.floor(N / 3);
  const sizes: number[] = [];
  const cx = ARENA_W / 2, cy = ARENA_H / 2;
  for (let seed = 1; seed <= 400; seed++) {
    const kind = TERRAIN_IDS[seed % TERRAIN_IDS.length];
    const opts = { w: ARENA_W, h: ARENA_H, clearX: cx, clearY: cy, clearR: TERRAIN_SPAWN_CLEAR };
    const t = genTerrain(new Rng(seed * 977), kind, opts);
    const again = genTerrain(new Rng(seed * 977), kind, opts);
    assert.deepEqual(again.cells, t.cells, '同一个种子生成同样的场地');
    assert.equal(t.gw * t.gh, N);
    assert.equal(t.count, t.cells.reduce((a, c) => a + c, 0));
    assert.equal(terrainPieces(t.cells, t.gw, t.gh), 1, `种子 ${seed} 不是一整块`);
    assert.ok(t.count >= TERRAIN_MIN_CELLS, `种子 ${seed} 太小：${t.count}`);
    assert.ok(t.count <= max, `种子 ${seed} 超过地图的 1/3：${t.count} > ${max}`);
    for (let i = 0; i < N; i++) {
      if (!t.cells[i]) continue;
      // 格子上离出生点最近的点也在留空的圆外面
      const x0 = (i % GW) * TERRAIN_CELL, y0 = Math.floor(i / GW) * TERRAIN_CELL;
      const nx = Math.max(x0, Math.min(x0 + TERRAIN_CELL, cx)), ny = Math.max(y0, Math.min(y0 + TERRAIN_CELL, cy));
      assert.ok(Math.hypot(nx - cx, ny - cy) > TERRAIN_SPAWN_CLEAR, `种子 ${seed} 盖住了出生点`);
    }
    assert.ok(inTerrain(t, t.cx, t.cy), '晶石在场地里');
    if (kind === 'crystal') {
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        assert.ok(inTerrain(t, t.cx + Math.cos(a) * t.cr, t.cy + Math.sin(a) * t.cr), `种子 ${seed}：能量圈要整个放在场地里`);
      }
      assert.ok(Math.PI * t.cr * t.cr < t.count * TERRAIN_CELL * TERRAIN_CELL * 0.5, '能量圈比整块场地小得多');
    }
    sizes.push(t.count);
  }
  sizes.sort((a, b) => a - b);
  assert.ok(sizes[0] < max * 0.35 && sizes[sizes.length - 1] > max * 0.75, `大小要有变化：${sizes[0]}~${sizes[sizes.length - 1]}`);
});

test('场地种类：按地区加权随机，不和上一波重复；格子位图压缩后能原样还原', () => {
  const rng = new Rng(5);
  let prev: TerrainId | null = null;
  const seen = new Set<TerrainId>();
  for (let i = 0; i < 400; i++) {
    const k = pickTerrain(rng, i % 4, prev);
    assert.notEqual(k, prev);
    seen.add(k);
    prev = k;
  }
  assert.equal(seen.size, TERRAIN_IDS.length, '每种场地都会出现');
  const t = genTerrain(new Rng(9), 'crystal', { w: ARENA_W, h: ARENA_H, clearX: ARENA_W / 2, clearY: ARENA_H / 2, clearR: TERRAIN_SPAWN_CLEAR });
  assert.deepEqual(unpackCells(packCells(t.cells), N), t.cells);
  const ev = terrainEvent(t);
  assert.ok(String(ev[4]).length <= 300, '位图大约 300 字节');
  const back = terrainFromEvent(JSON.parse(JSON.stringify(ev)))!;
  assert.deepEqual({ ...back, cells: [...back.cells] }, { ...t, cells: [...t.cells] });
  assert.equal(terrainFromEvent(terrainEvent(null)), null);
});

test('冒险：第 2 波起每波一块场地，跟在 wave 事件后面发出；波次结束时清掉；同一个种子每波的场地相同', () => {
  type Waves = { startWave(): void; endWave(): void };
  const roll = (seed: number) => {
    const sim = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: {} }, { id: 2, name: 'B', line: 'charmander', meta: {} }], seed);
    const out: (Terrain | null)[] = [];
    let evs = sim.flushEvents();
    for (let w = 1; w <= 12; w++) {
      const i = evs.findIndex((e) => e[0] === 'wave');
      assert.ok(i >= 0);
      assert.equal(evs[i + 1]?.[0], 'terrain', 'wave 事件后面紧跟着场地');
      assert.equal(sim.wave, w);
      if (w < TERRAIN_FROM_WAVE) assert.equal(sim.terrain, null, '第 1 波没有场地');
      else {
        assert.ok(sim.terrain, `第 ${w} 波有场地`);
        assert.deepEqual(terrainFromEvent(evs[i + 1])!.cells, sim.terrain!.cells);
        for (const p of sim.players) assert.ok(!inTerrain(sim.terrain, p.x, p.y), '波次开始时没有人站在场地里');
      }
      out.push(sim.terrain);
      (sim as unknown as Waves).endWave();
      evs = sim.flushEvents();
      assert.equal(sim.terrain, null);
      assert.ok(evs.some((e) => e[0] === 'terrain' && e[1] === -1), '波次结束时告诉客户端清掉场地');
      (sim as unknown as Waves).startWave();
      evs = sim.flushEvents();
    }
    return out;
  };
  const a = roll(77), b = roll(77), c = roll(78);
  assert.deepEqual(a.map((t) => t && [t.kind, [...t.cells].join('')]), b.map((t) => t && [t.kind, [...t.cells].join('')]));
  assert.notDeepEqual(a.map((t) => t?.kind), c.map((t) => t?.kind), '换个种子就不一样');
  for (let i = 2; i < a.length; i++) assert.notEqual(a[i]!.kind, a[i - 1]!.kind, '不和上一波重复');
});

// ---------------------------------------------------------------- 熔岩池

test('熔岩池：站在里面施放火系招式伤害 +25%，站在外面没有加成；不受影响的属性不变', () => {
  const inside = firstHit('charmander', 'ember', IN, left('lava'));
  const outside = firstHit('charmander', 'ember', OUT, left('lava'));
  const none = firstHit('charmander', 'ember', OUT, null);
  assert.ok(inside > 0 && outside > 0);
  assert.ok(near(inside / outside, 1.25, 0.01), `火花：场地里 ${inside}，外面 ${outside}`);
  assert.equal(outside, none, '站在场地外和没有场地一样');
  const rock = firstHit('geodude', 'rock_throw', IN, left('lava')) / firstHit('geodude', 'rock_throw', OUT, left('lava'));
  assert.ok(near(rock, 1.25, 0.01), `岩石招式也 +25%：${rock}`);
  // 杰尼龟会被灼伤，但特殊招式不受影响，也没有加成
  assert.equal(firstHit('squirtle', 'water_gun', IN, left('lava'), { warm: 0.3 }), firstHit('squirtle', 'water_gun', OUT, left('lava')));
});

test('熔岩池：非火/岩石系站进去灼伤，每秒约 2% 最大 HP，离开后还会烧 1.5 秒；火、岩石系免疫；最多烧到剩 1 HP', () => {
  const s = solo('squirtle', [], IN, left('lava'));
  const p = s.sim.players[0];
  const evs = run(s, 3);
  const burned = sumBurn(evs, p.id);
  assert.ok(near(burned, p.d.maxHp * BURN_PCT.player * 3, Math.max(1.5, p.d.maxHp * 0.011)), `3 秒烧掉 ${burned}，最大 HP ${p.d.maxHp}`);
  assert.ok(p.tburn > 0);
  // 离开熔岩池：还会烧一会儿，然后停下
  const out = solo('squirtle', [], IN, left('lava'));
  run(out, 1);
  const q = out.sim.players[0];
  out.pin = () => { q.x = OUT.x; q.y = OUT.y; q.invuln = 9; };
  const after = run(out, BURN_LINGER - 0.1);
  assert.ok(sumBurn(after, q.id) > 0, '离开后还在烧');
  assert.ok(q.tburn > 0 && q.tburn < 0.2);
  assert.equal(sumBurn(run(out, 2), q.id), 0, `${BURN_LINGER} 秒后不再烧`);
  assert.equal(q.tburn <= 0, true);
  // 免疫：火系、岩石系
  for (const line of ['charmander', 'geodude', 'ponyta'] as LineId[]) {
    const im = solo(line, [], IN, left('lava'));
    assert.equal(sumBurn(run(im, 3), 1), 0, `${line} 不会灼伤`);
    assert.equal(im.sim.players[0].hp, im.sim.players[0].d.maxHp);
  }
  // 烧不死
  const low = solo('squirtle', [], IN, left('lava'));
  const lp = low.sim.players[0];
  lp.hp = 2;
  run(low, 6);
  assert.ok(lp.hp >= 1 && !lp.down, `剩 ${lp.hp} HP，没有倒下`);
});

test('熔岩池：灼伤时物理招式伤害 −50%，离开并烧完后恢复', () => {
  const burned = firstHit('squirtle', 'tackle', IN, left('lava'), { warm: 0.3 });
  const normal = firstHit('squirtle', 'tackle', OUT, left('lava'));
  assert.ok(near(burned / normal, 0.5, 0.01), `撞击：灼伤时 ${burned}，平时 ${normal}`);
  // 免疫灼伤的火系在熔岩池里用物理招式不会减半（火爪类招式还会 +25%，这里用一般系）
  assert.equal(firstHit('charmander', 'scratch', IN, left('lava'), { warm: 0.3 }), firstHit('charmander', 'scratch', OUT, left('lava')));
});

test('熔岩池：敌人同样会灼伤（火、岩石系敌人免疫），灼伤的敌人接触伤害减半，火系敌人伤害 +25%', () => {
  const s = solo('charmander', [], OUT, left('lava'));
  const rat = s.sim.spawnEnemy('rattata', 100, 100);
  const dog = s.sim.spawnEnemy('w58', 100, 200);
  const rock = s.sim.spawnEnemy('geodude', 100, 300);
  const outRat = s.sim.spawnEnemy('rattata', 500, 100);
  for (const e of [rat, dog, rock, outRat]) { e.hp = e.maxHp = 1000; e.speed = 0; }
  const evs = run(s, 3, [rat, dog, rock, outRat]);
  assert.ok(near(1000 - rat.hp, 1000 * BURN_PCT.minion * 3, 10.5), `小拉达 3 秒烧掉 ${1000 - rat.hp}`);
  assert.ok(evs.some((e) => e[0] === 'h' && e[1] === rat.id && ((e[5] as number) & 8) !== 0), '敌人身上飘出灼伤数字');
  assert.equal(dog.hp, 1000, '卡蒂狗（火系）不会灼伤');
  assert.equal(rock.hp, 1000, '小拳石（岩石系）不会灼伤');
  assert.equal(outRat.hp, 1000, '场地外的敌人不会灼伤');
  assert.equal(enemyDmgMod(s.sim, rat, 'phys'), 0.5, '灼伤的敌人物理攻击减半');
  assert.equal(enemyDmgMod(s.sim, rat, 'spec'), 1);
  assert.equal(enemyDmgMod(s.sim, dog, 'spec'), 1.25, '火系敌人在熔岩池里伤害 +25%');
  assert.equal(enemyDmgMod(s.sim, outRat, 'phys'), 1);

  // 实际的接触伤害：小火龙（免疫灼伤）被敌人撞一下，看这一下的伤害数字
  const contact = (enemy: string, at: Pt) => {
    const c = solo('charmander', [], at, left('lava'));
    const p = c.sim.players[0];
    const e = c.sim.spawnEnemy(enemy, at.x + 40, at.y);
    e.hp = e.maxHp = 1e6;
    e.dmg = 100;
    run(c, 0.5, [e], () => { e.x = at.x + 40; e.y = at.y; });
    const pin = c.pin;
    c.pin = () => { pin(); p.invuln = 0; };
    const hit = run(c, DT, [e], () => { e.x = at.x + 4; e.y = at.y; }).find((x) => x[0] === 'ph' && x[1] === p.id && x[3] === 0);
    return (hit?.[2] as number | undefined) ?? 0;
  };
  const ratIn = contact('rattata', IN), ratOut = contact('rattata', OUT);
  assert.ok(ratIn > 0 && ratOut > 0);
  assert.ok(near(ratIn / ratOut, 0.5, 0.04), `小拉达的撞击：熔岩池里 ${ratIn}，外面 ${ratOut}`);
  const dogIn = contact('w58', IN), dogOut = contact('w58', OUT);
  assert.ok(near(dogIn / dogOut, 1.25, 0.04), `卡蒂狗的撞击：熔岩池里 ${dogIn}，外面 ${dogOut}`);
});

// ---------------------------------------------------------------- 阴云毒雾

test('阴云毒雾：毒/幽灵/恶招式覆盖面积翻倍（远一点的敌人也打得到）；草、电招式冷却时间翻倍', () => {
  const reach = (at: Pt) => {
    const s = solo('rattata', ['bite'], at, left('miasma'));
    const a = dummy(s.sim.spawnEnemy('rattata', at.x + 15, at.y));
    const b = dummy(s.sim.spawnEnemy('rattata', at.x + 40, at.y));
    run(s, 0.3, [a, b], () => { a.x = at.x + 15; a.y = at.y; b.x = at.x + 40; b.y = at.y; });
    return { near: a.hp < a.maxHp, far: b.hp < b.maxHp };
  };
  assert.deepEqual(reach(IN), { near: true, far: true }, '毒雾里：咬住的范围半径 ×√2');
  assert.deepEqual(reach(OUT), { near: true, far: false }, '毒雾外：远处的打不到');
  assert.ok(near(cdAfter('bulbasaur', 'vine_whip', IN, left('miasma')), 0.75, 1e-6), '草系冷却翻倍：0.5 秒只走了 0.25 秒');
  assert.ok(near(cdAfter('pikachu', 'thunder_shock', IN, left('miasma')), 0.75, 1e-6), '电系冷却翻倍');
  assert.ok(near(cdAfter('bulbasaur', 'vine_whip', OUT, left('miasma')), 0.5, 1e-6), '场地外正常');
  assert.ok(near(cdAfter('rattata', 'bite', IN, left('miasma')), 0.5, 1e-6), '恶系冷却不受影响');
});

// ---------------------------------------------------------------- 局部阵雨

test('局部阵雨：水/电招式冷却 −20%；飞行系移动 −25%（服务器的移动校验也按这个算），敌人一样', () => {
  assert.ok(near(cdAfter('squirtle', 'water_gun', IN, left('rain')), 1 - 0.5 / 0.8, 1e-6), '水系冷却倒数快 1.25 倍');
  assert.ok(near(cdAfter('pikachu', 'thunder_shock', IN, left('rain')), 1 - 0.5 / 0.8, 1e-6));
  assert.ok(near(cdAfter('squirtle', 'water_gun', OUT, left('rain')), 0.5, 1e-6));
  assert.ok(near(cdAfter('charmander', 'ember', IN, left('rain')), 0.5, 1e-6), '火系不受影响');

  const fly = solo('pidgey', [], IN, left('rain'));
  const bird = fly.sim.players[0];
  assert.ok(near(fly.sim.moveSpeed(bird), fly.sim.baseSpeed(bird) * 0.75, 1e-9), '波波在雨里慢 25%');
  assert.equal(fly.sim.privateState(bird).speed, fly.sim.baseSpeed(bird), '发给客户端的是不含场地的基础速度，客户端按自己的位置再乘');
  bird.x = OUT.x;
  assert.equal(fly.sim.moveSpeed(bird), fly.sim.baseSpeed(bird));
  const turtle = solo('squirtle', [], IN, left('rain')).sim;
  assert.equal(turtle.moveSpeed(turtle.players[0]), turtle.baseSpeed(turtle.players[0]), '不会飞的不受影响');
  const inRain = serverTravel('pidgey', IN, left('rain')), dry = serverTravel('pidgey', IN, null);
  assert.ok(near(inRain / dry, 0.75, 0.03), `服务器放行的距离：雨里 ${inRain.toFixed(1)}，平时 ${dry.toFixed(1)}`);

  const e1 = enemyTravel('pidgey', IN, left('rain')), e0 = enemyTravel('pidgey', IN, null);
  assert.ok(e0 > 5 && near(e1 / e0, 0.75, 0.04), `野生波波在雨里走得慢：${e1.toFixed(1)} / ${e0.toFixed(1)}`);
  const r1 = enemyTravel('rattata', IN, left('rain')), r0 = enemyTravel('rattata', IN, null);
  assert.ok(near(r1, r0, 0.01), '小拉达不受影响');
});

// ---------------------------------------------------------------- 繁茂草丛

test('繁茂草丛：草/虫招式命中后回复伤害的 5%，每秒最多 2% 最大 HP；场地外没有', () => {
  const heal = (at: Pt, maxHp?: number) => {
    const s = solo('bulbasaur', ['vine_whip'], at, left('thicket'));
    const p = s.sim.players[0];
    const hp0 = maxHp ?? p.d.maxHp;
    const e = dummy(s.sim.spawnEnemy('rattata', at.x + 20, at.y));
    const pin = s.pin;
    s.pin = () => { pin(); p.d.maxHp = hp0; p.d.regenPerSec = 0; };
    s.pin();
    p.hp = 1;
    run(s, 3, [e], () => { e.x = at.x + 20; e.y = at.y; });
    return { healed: p.hp - 1, dmg: p.stats.skillDmg.vine_whip ?? 0, max: hp0, p };
  };
  const capped = heal(IN);
  assert.ok(capped.dmg * LEECH_PCT > capped.max * LEECH_CAP * 4, '伤害够高，会碰到上限');
  assert.ok(capped.healed > 0, '回复了');
  assert.ok(capped.healed <= capped.max * LEECH_CAP * 4 + 1e-6, `3 秒最多回复 4 个窗口的上限：${capped.healed.toFixed(2)} / 最大 HP ${capped.max}`);
  assert.ok(capped.healed >= capped.max * LEECH_CAP * 2 - 1e-6, '每秒都在回复');
  const uncapped = heal(IN, 1e7);
  assert.ok(near(uncapped.healed, uncapped.dmg * LEECH_PCT, 1e-6), `没碰到上限时正好是 5%：${uncapped.healed} / ${uncapped.dmg}`);
  assert.equal(heal(OUT).healed, 0, '场地外不回复');
  // 一秒里打很多下也超不过上限
  const s = solo('bulbasaur', [], IN, left('thicket'));
  const p = s.sim.players[0];
  const e = dummy(s.sim.spawnEnemy('rattata', IN.x + 20, IN.y));
  p.hp = 1;
  for (let i = 0; i < 50; i++) hitEnemy(s.sim, e, p, 1000, 'grass', { tf: terrainHitFlags(s.sim.terrain, p.x, p.y, 'grass'), noEff: true });
  assert.ok(near(p.hp - 1, p.d.maxHp * LEECH_CAP, 1e-6), `同一秒里 50 下只回复 2%：${p.hp - 1}`);
});

test('繁茂草丛：非草/虫系移动 −20%（敌人一样）；草系敌人打中人也会回血', () => {
  const t = solo('squirtle', [], IN, left('thicket')).sim;
  assert.ok(near(t.moveSpeed(t.players[0]), t.baseSpeed(t.players[0]) * 0.8, 1e-9), '杰尼龟在草丛里慢 20%');
  for (const line of ['bulbasaur', 'caterpie'] as LineId[]) {
    const g = solo(line, [], IN, left('thicket')).sim;
    assert.equal(g.moveSpeed(g.players[0]), g.baseSpeed(g.players[0]), `${line} 不受影响`);
  }
  const r1 = enemyTravel('rattata', IN, left('thicket')), r0 = enemyTravel('rattata', IN, null);
  assert.ok(near(r1 / r0, 0.8, 0.04), `小拉达在草丛里走得慢：${r1.toFixed(1)} / ${r0.toFixed(1)}`);
  const c1 = enemyTravel('caterpie', IN, left('thicket')), c0 = enemyTravel('caterpie', IN, null);
  assert.ok(near(c1, c0, 0.01), '绿毛虫不受影响');

  const s = solo('squirtle', [], OUT, left('thicket'));
  const p = s.sim.players[0];
  p.invuln = 0;
  const odd = s.sim.spawnEnemy('oddish', IN.x, IN.y);
  odd.hp = odd.maxHp * 0.5;
  const before = odd.hp;
  const tf = terrainHitFlags(s.sim.terrain, odd.x, odd.y, odd.def.types[0]);
  const dealt = enemyHitPlayer(s.sim, p, 10, 'spec', odd, tf);
  assert.ok(dealt > 0);
  assert.ok(near(odd.hp - before, Math.min(dealt * LEECH_PCT, odd.maxHp * LEECH_CAP), 1e-6), '走路草站在草丛里打中人回血');
  assert.equal(terrainHitFlags(s.sim.terrain, OUT.x, OUT.y, 'grass'), 0, '场地外没有');
});

// ---------------------------------------------------------------- 共鸣晶石

test('共鸣晶石：只有站在能量圈里超能/妖精/龙招式才 +25%；恶、幽灵招式在整块场地里都 −20%', () => {
  const T = left('crystal');
  const edge: Pt = { x: 160, y: 100 };
  assert.ok(inTerrain(T, edge.x, edge.y) && !inCircle(T, edge.x, edge.y));
  const circle = firstHit('abra', 'confusion', IN, T);
  const field = firstHit('abra', 'confusion', edge, T);
  const outside = firstHit('abra', 'confusion', OUT, T);
  assert.ok(near(circle / outside, 1.25, 0.01), `能量圈里 ${circle}，外面 ${outside}`);
  assert.equal(field, outside, '在场地里但不在能量圈里：没有加成');
  assert.ok(near(firstHit('dratini', 'dragon_breath', IN, T) / firstHit('dratini', 'dragon_breath', OUT, T), 1.25, 0.01), '龙系也有');
  const bite = (at: Pt) => firstHit('rattata', 'bite', at, T);
  assert.ok(near(bite(edge) / bite(OUT), 0.8, 0.01), '恶系招式在场地里 −20%');
  assert.ok(near(bite(IN) / bite(OUT), 0.8, 0.01), '能量圈里也一样 −20%');
  // 敌人：按主属性
  const s = solo('squirtle', [], OUT, T);
  const kad = s.sim.spawnEnemy('kadabra', IN.x, IN.y), kad2 = s.sim.spawnEnemy('kadabra', edge.x, edge.y), ghost = s.sim.spawnEnemy('gastly', edge.x, edge.y);
  assert.equal(enemyDmgMod(s.sim, kad, 'spec'), 1.25, '能力圈里的勇基拉 +25%');
  assert.equal(enemyDmgMod(s.sim, kad2, 'spec'), 1, '能量圈外没有');
  assert.equal(enemyDmgMod(s.sim, ghost, 'spec'), 0.8, '鬼斯在场地里 −20%');
});

// ---------------------------------------------------------------- 上升气流

test('上升气流：飞行/虫招式覆盖面积 +50%；岩石、地面招式冷却 +35%（敌人的攻击冷却一样）', () => {
  const reach = (at: Pt) => {
    const s = solo('caterpie', ['bug_bite'], at, left('updraft'));
    const a = dummy(s.sim.spawnEnemy('rattata', at.x + 15, at.y));
    // 平时刚好够不着：虫咬半径（含绿毛虫自带的范围加成）再加上敌人的半径，往外 4 像素
    const far = SKILLS.bug_bite.radius! * s.sim.players[0].d.rangeMult + a.r + 4;
    const b = dummy(s.sim.spawnEnemy('rattata', at.x + far, at.y));
    run(s, 0.3, [a, b], () => { a.x = at.x + 15; a.y = at.y; b.x = at.x + far; b.y = at.y; });
    assert.ok(a.hp < a.maxHp, '近处的总能打到');
    return b.hp < b.maxHp;
  };
  assert.equal(reach(IN), true, '气流里：虫咬的半径 ×√1.5');
  assert.equal(reach(OUT), false);
  assert.ok(near(cdAfter('geodude', 'rock_throw', IN, left('updraft')), 1 - 0.5 / 1.35, 1e-6), '岩石招式冷却 +35%');
  assert.ok(near(cdAfter('geodude', 'mud_slap', IN, left('updraft')), 1 - 0.5 / 1.35, 1e-6), '地面招式冷却 +35%');
  assert.ok(near(cdAfter('geodude', 'rock_throw', OUT, left('updraft')), 0.5, 1e-6));
  // 敌人：小拳石的攻击冷却倒数变慢
  const cd = (terrain: Terrain | null) => {
    const s = solo('squirtle', [], { x: 700, y: 100 }, terrain);
    const e = s.sim.spawnEnemy('geodude', IN.x, IN.y);
    e.hp = e.maxHp = 1e9;
    e.ai.cd = 5;
    run(s, 0.5, [e]);
    return 5 - e.ai.cd;
  };
  assert.ok(near(cd(left('updraft')) / cd(null), 1 / 1.35, 0.01), '小拳石在气流里攻击冷却慢 35%');
});

// ---------------------------------------------------------------- 开阔空地

test('开阔空地：一般/地面/格斗招式暴击率 +15 个百分点；电、幽灵招式伤害 −20%（敌人一样）', () => {
  const crits = (at: Pt) => {
    const s = solo('rattata', [], at, left('clearing'));
    const p = s.sim.players[0];
    const e = dummy(s.sim.spawnEnemy('rattata', at.x + 20, at.y));
    for (let i = 0; i < 4000; i++) hitEnemy(s.sim, e, p, 10, 'normal', { tf: terrainHitFlags(s.sim.terrain, p.x, p.y, 'normal') });
    return p.stats.crits / 4000;
  };
  const rate = crits(IN);
  assert.ok(near(rate, 0.15, 0.02), `空地里暴击率 ${rate}`);
  assert.equal(crits(OUT), 0, '场地外不暴击（测试里基础暴击率是 0）');
  // 整个流程：招式施放时带上暴击加成
  const real = (at: Pt) => {
    const s = solo('rattata', ['scratch'], at, left('clearing'));
    const e = dummy(s.sim.spawnEnemy('rattata', at.x + 20, at.y));
    run(s, 20, [e], () => { e.x = at.x + 20; e.y = at.y; });
    return s.sim.players[0].stats.crits;
  };
  assert.ok(real(IN) > 0, '抓在空地里会暴击');
  assert.equal(real(OUT), 0);
  const shock = firstHit('pikachu', 'thunder_shock', IN, left('clearing')) / firstHit('pikachu', 'thunder_shock', OUT, left('clearing'));
  assert.ok(near(shock, 0.8, 0.01), `电击 −20%：${shock}`);
  const lick = firstHit('gastly', 'lick', IN, left('clearing')) / firstHit('gastly', 'lick', OUT, left('clearing'));
  assert.ok(near(lick, 0.8, 0.01), `舌舔 −20%：${lick}`);
  const s = solo('squirtle', [], OUT, left('clearing'));
  assert.equal(enemyDmgMod(s.sim, s.sim.spawnEnemy('voltorb', IN.x, IN.y), 'spec'), 0.8, '霹雳电球在空地里 −20%');
  assert.equal(enemyDmgMod(s.sim, s.sim.spawnEnemy('voltorb', OUT.x, OUT.y), 'spec'), 1);
});

// ---------------------------------------------------------------- 寒霜区域

test('寒霜区域：冰/水/钢招式命中后目标减速 20%，持续 2 秒，重复命中刷新不叠加；火系招式冷却 +35%', () => {
  const s = solo('squirtle', ['water_gun'], IN, left('frost'));
  const p = s.sim.players[0];
  const e = dummy(s.sim.spawnEnemy('rattata', IN.x + 20, IN.y));
  const after: number[] = [];
  let last = 0;
  run(s, 2.6, [e], () => {
    e.x = IN.x + 20; e.y = IN.y;
    const d = p.stats.skillDmg.water_gun ?? 0;
    if (d > last) { last = d; after.push(e.st.chill); }
  });
  assert.ok(after.length >= 3, `命中了 ${after.length} 次`);
  for (const c of after) assert.ok(c <= CHILL_DUR && c > CHILL_DUR - 0.1, `每次命中都刷新成 2 秒，不叠加：${c}`);
  // 停手后 2 秒恢复
  p.skills = [];
  run(s, CHILL_DUR + 0.1, [e]);
  assert.ok(e.st.chill <= 0, '2 秒后减速结束');
  // 场地外命中没有减速
  const o = solo('squirtle', ['water_gun'], OUT, left('frost'));
  const oe = dummy(o.sim.spawnEnemy('rattata', OUT.x + 20, OUT.y));
  run(o, 1.5, [oe], () => { oe.x = OUT.x + 20; oe.y = OUT.y; });
  assert.ok((o.sim.players[0].stats.skillDmg.water_gun ?? 0) > 0);
  assert.equal(oe.st.chill, 0);
  // 被减速的敌人走得慢 20%
  const slow = enemyTravel('rattata', OUT, null, (en) => { en.st.chill = CHILL_DUR; });
  const fast = enemyTravel('rattata', OUT, null);
  assert.ok(near(slow / fast, 1 - CHILL_AMT, 0.04), `减速 ${slow.toFixed(1)} / ${fast.toFixed(1)}`);
  assert.ok(near(cdAfter('charmander', 'ember', IN, left('frost')), 1 - 0.5 / 1.35, 1e-6), '火系冷却 +35%');
  assert.ok(near(cdAfter('squirtle', 'water_gun', IN, left('frost')), 0.5, 1e-6), '水系冷却不受影响');
});

test('寒霜区域：站在里面的水/冰系敌人打中玩家，玩家减速 20%（2 秒）；场地外的不会', () => {
  const hitBy = (at: Pt) => {
    const s = solo('charmander', [], OUT, left('frost'));
    const p = s.sim.players[0];
    const e = s.sim.spawnEnemy('w87', at.x, at.y);
    p.invuln = 0;
    enemyHitPlayer(s.sim, p, 10, 'phys', e, terrainHitFlags(s.sim.terrain, e.x, e.y, e.def.types[0]), true);
    return { chill: p.chillT, speed: s.sim.baseSpeed(p), base: p.d.moveSpeed };
  };
  const a = hitBy(IN);
  assert.equal(a.chill, CHILL_DUR);
  assert.ok(near(a.speed, a.base * (1 - CHILL_AMT), 1e-9));
  assert.equal(hitBy(OUT).chill, 0);
  // 整个流程：玩家站在场地外也会被场地里的敌人减速，并同步到快照
  const s = solo('charmander', [], { x: 330, y: IN.y }, left('frost'));
  const p = s.sim.players[0];
  const e = s.sim.spawnEnemy('w87', 318, IN.y);
  e.hp = e.maxHp = 1e9;
  assert.ok(inTerrain(s.sim.terrain, e.x, e.y) && !inTerrain(s.sim.terrain, 330, IN.y));
  s.pin = () => { p.x = 330; p.y = IN.y; };
  p.invuln = 0;
  run(s, 1, [e], () => { e.x = 318; e.y = IN.y; if (p.chillT > 0) p.invuln = 9; });
  assert.ok(p.chillT > 0, '被撞到后减速');
  const snap = decodeSnapshot(encodeSnapshot(s.sim, 1));
  assert.ok((snap.players[0].tst & 2) !== 0, '快照里带着寒霜减速');
  assert.ok(s.sim.privateState(p).speed < p.d.moveSpeed, '发给客户端的速度含寒霜减速');
  assert.ok(TF_CHILL > 0);
});

// ---------------------------------------------------------------- 联网与对战

test('快照：玩家的灼伤 / 被场地减速，敌人的灼伤 / 减速都带在标志位里', () => {
  const s = solo('squirtle', [], IN, left('lava'));
  const e = s.sim.spawnEnemy('rattata', 100, 100);
  e.hp = e.maxHp = 1000;
  run(s, 0.6, [e]);
  let snap = decodeSnapshot(encodeSnapshot(s.sim, 1));
  assert.ok((snap.players[0].tst & 1) !== 0, '玩家灼伤');
  assert.ok((snap.enemies.find((x) => x.id === e.id)!.flags & 2) !== 0, '敌人灼伤（和招式灼伤共用火星标志）');
  s.sim.terrain = left('thicket');
  run(s, 0.1, [e]);
  snap = decodeSnapshot(encodeSnapshot(s.sim, 2));
  assert.ok((snap.players[0].tst & 4) !== 0, '玩家被草丛减速');
  assert.ok((snap.enemies.find((x) => x.id === e.id)!.flags & 32) !== 0, '敌人被草丛减速');
});

test('联机：断线重连时补发本波的场地；调试命令可以换场地', () => {
  const msgs: S2C[] = [];
  const conn = () => ({ send: (d: string | ArrayBuffer) => { if (typeof d === 'string') msgs.push(JSON.parse(d)); } });
  const room = new Room('45678');
  const a = conn(), b = conn();
  const ia = room.join(a, 'A', {}, PROTOCOL_VERSION, { line: 'charmander' }) as number;
  const ib = room.join(b, 'B', {}, PROTOCOL_VERSION, { line: 'squirtle' }) as number;
  room.handle(ib, { t: 'ready', on: true });
  room.handle(ia, { t: 'start' });
  const sim = room.sim!;
  const t = sim.debugTerrain('frost')!;
  assert.equal(t.kind, 'frost');
  assert.equal(sim.terrain, t);
  const token = [...msgs].reverse().find((m) => m.t === 'joined' && m.you === ib) as Extract<S2C, { t: 'joined' }>;
  room.leave(ib, b);
  msgs.length = 0;
  assert.equal(room.rejoin(conn(), token.token!, PROTOCOL_VERSION), ib);
  const ev = msgs.find((m) => m.t === 'ev') as Extract<S2C, { t: 'ev' }>;
  const tev = ev.e.find((x) => x[0] === 'terrain')!;
  assert.deepEqual([...terrainFromEvent(tev)!.cells], [...t.cells]);
  assert.equal(TERRAINS[terrainFromEvent(tev)!.kind].name, '寒霜区域');
});

test('对战（和道馆）没有局部属性场地', () => {
  const build = { line: 'charmander' as LineId, stage: 1, level: 12, skills: [{ id: 'ember', lv: 2 }], items: [] as [string, number][], levelMods: {} };
  const inits: PvpInit[] = [
    { id: 1, name: 'A', team: 0, build, meta: {}, bot: true },
    { id: 2, name: 'B', team: 1, build: { ...build, line: 'squirtle', skills: [{ id: 'water_gun', lv: 1 }] }, meta: {}, bot: true },
  ];
  const sim = new PvpSim('1v1', inits, 9);
  const evs: Ev[] = [];
  for (let i = 0; i < 30 * 15; i++) { sim.step(DT); evs.push(...sim.flushEvents()); assert.equal(sim.terrain, null); }
  assert.ok(!evs.some((e) => e[0] === 'terrain' && (e[1] as number) >= 0), '不会发出场地');
  assert.equal(sim.debugTerrain('lava'), null, '调试命令也换不出场地');
});
