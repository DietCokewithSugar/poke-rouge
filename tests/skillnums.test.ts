import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIELDS } from '../src/shared/fields';
import { PeerSync } from '../src/shared/netsync';
import { buildFor } from '../src/shared/pvp/build';
import { PvpSim } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { baseDamage, fieldNums, skillNums } from '../src/shared/sim/combat';
import { GameSim } from '../src/shared/sim/game';
import { learnSkill } from '../src/shared/sim/player';
import { SKILLS, skillLevelCd } from '../src/shared/skills';

const solo = (line = 'charmander') => {
  const sim = new GameSim([{ id: 1, name: 'a', line, meta: {} }], 3);
  return { sim, p: sim.players[0] };
};

test('技能说明的数值就是实际的数值：冷却算上技能急速，伤害算上能力和道具', () => {
  const { sim, p } = solo();
  const s = p.skills[0];
  const n0 = skillNums(sim, p, s.id, s.lv)!;
  assert.equal(n0.cd, Math.round(SKILLS[s.id].cd * skillLevelCd(s.lv) * p.d.cdMult * 100) / 100);
  assert.equal(n0.dmg, Math.max(1, Math.round(baseDamage(p, SKILLS[s.id], s.lv))));
  // 买了加技能急速的道具：冷却马上变短，私有状态里的冷却圈总时长和说明一起变
  p.items.metronome = 2;
  sim.recompute(p);
  const n1 = skillNums(sim, p, s.id, s.lv)!;
  assert.ok(n1.cd < n0.cd, `${n0.cd} → ${n1.cd}`);
  const me = sim.privateState(p);
  assert.equal(me.skills[0].max, n1.cd);
  assert.deepEqual(me.nums[`${s.id}:${s.lv}`], n1);
  // 物攻 / 特攻提高，伤害跟着提高
  p.levelMods.spa += 40;
  sim.recompute(p);
  assert.ok(skillNums(sim, p, s.id, s.lv)!.dmg! > n1.dmg!);
  // 放出去以后的冷却正好是说明里写的
  for (const sk of p.skills) sk.cd = 0;
  sim.spawnEnemy('caterpie', p.x + 40, p.y);
  sim.step(1 / 30);
  const cast = p.skills.find((x) => x.cd > 0.2)!;
  assert.ok(cast, '放出了技能');
  assert.ok(Math.abs(cast.cd - skillNums(sim, p, cast.id, cast.lv)!.cd) < 0.01, `冷却 ${cast.cd}`);
});

test('站进场地，技能说明的数值跟着变；走出来恢复', () => {
  const { sim, p } = solo('squirtle');
  const id = 'water_gun';
  if (!p.skills.some((s) => s.id === id)) learnSkill(p, id);
  const lv = p.skills.find((s) => s.id === id)!.lv;
  const out = skillNums(sim, p, id, lv)!;
  sim.placeField('rain', [Math.floor(p.y / 16) * Math.ceil(sim.w / 16) + Math.floor(p.x / 16)]);
  const inside = skillNums(sim, p, id, lv)!;
  assert.ok(Math.abs(inside.cd - out.cd * 0.8) < 0.011, `局部阵雨：水系冷却 -20%（${out.cd} → ${inside.cd}）`);
  // 发给界面的不含场地，界面自己按脚下的场地补上，和模拟里算的一样
  const sent = sim.privateState(p).nums[`${id}:${lv}`];
  assert.deepEqual(sent, out, '私有状态里的数值不含场地');
  assert.deepEqual(fieldNums(id, sent, 'rain', ['water']), inside);
  sim.fields = [];
  sim.placeField('lava', [Math.floor(p.y / 16) * Math.ceil(sim.w / 16) + Math.floor(p.x / 16)]);
  const ember = skillNums(sim, p, 'ember', 1)!;
  const { sim: s2, p: p2 } = solo('squirtle');
  assert.ok(ember.dmg! > skillNums(s2, p2, 'ember', 1)!.dmg!, `熔岩池：火系伤害 +25%（${FIELDS.lava.good}）`);
  assert.ok(Math.abs(fieldNums('ember', skillNums(s2, p2, 'ember', 1)!, 'lava', ['water'])!.dmg! - ember.dmg!) <= 1);
  // 上升气流：飞行 / 虫招式的覆盖范围变大
  const { sim: s3, p: p3 } = solo('pidgey');
  const gust = p3.skills.find((s) => SKILLS[s.id].type === 'flying');
  if (gust) {
    const n = skillNums(s3, p3, gust.id, gust.lv)!;
    const up = fieldNums(gust.id, n, 'updraft', ['normal', 'flying'])!;
    if (n.radius) assert.ok(up.radius! > n.radius);
  }
});

test('私有状态里也有商店和升级卡上的技能（按学了 / 强化以后的等级）', () => {
  const { sim, p } = solo();
  p.shop.offers = [{ kind: 'skill', id: 'ember', price: 10, tier: 1 }, { kind: 'skill', id: 'flamethrower', price: 50, tier: 3 }, null];
  p.cards = [{ kind: 'skill', skill: 'dragon_dance', upgrade: false, tier: 3 }];
  const me = sim.privateState(p);
  const ember = p.skills.find((s) => s.id === 'ember');
  assert.ok(me.nums[`ember:${(ember?.lv ?? 0) + 1}`], '已经会的技能按强化后的等级');
  assert.ok(me.nums['flamethrower:1']);
  const dd = me.nums['dragon_dance:1'];
  assert.ok(dd && dd.haste === 25 && dd.spe === 30 && dd.dur === 5, '强化类技能写明效果');
  assert.equal(dd.dmg, undefined);
});

test('道具、能力变了，界面马上收到新的技能数值；站进场地只发冷却的增量', () => {
  const { sim, p } = solo('squirtle');
  if (!p.skills.some((s) => s.id === 'water_gun')) learnSkill(p, 'water_gun');
  const sync = new PeerSync();
  sim.phase = 'wave';
  assert.match(sync.privateMsg(sim, p)!, /"t":"me"/);
  assert.equal(sync.privateMsg(sim, p), null, '没变化不发');
  sim.placeField('rain', [Math.floor(p.y / 16) * Math.ceil(sim.w / 16) + Math.floor(p.x / 16)]);
  assert.equal(JSON.parse(sync.privateMsg(sim, p)!).t, 'md', '场地的修正界面自己算，只发冷却圈的总时长');
  p.items.quick_claw = 1;
  sim.recompute(p);
  const msg = JSON.parse(sync.privateMsg(sim, p)!);
  assert.equal(msg.t, 'me', '技能急速变了，整份私有状态重发');
  const wg = p.skills.find((s) => s.id === 'water_gun')!;
  assert.equal(msg.s.nums[`water_gun:${wg.lv}`].cd, skillNums(sim, p, 'water_gun', wg.lv, false)!.cd);
});

test('对战里的伤害按对战换算', () => {
  const b = buildFor(new Rng(1), 'charmander', 20);
  const sim = new PvpSim('1v1', [
    { id: 1, name: 'a', team: 0, build: b, meta: {} },
    { id: 2, name: 'b', team: 1, build: b, meta: {} },
  ], 1);
  const p = sim.players[0];
  const s = p.skills.find((x) => SKILLS[x.id].power > 0)!;
  const n = skillNums(sim, p, s.id, s.lv)!;
  assert.ok(n.dmg! < Math.round(baseDamage(p, SKILLS[s.id], s.lv)) / 3, `对战伤害 ${n.dmg}`);
});
