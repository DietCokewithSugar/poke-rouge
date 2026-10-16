import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { FIELDS, components, fieldGrid } from '../src/shared/fields';
import { GYMS, badgeKey, counters, gymOpen, masterKey, masterMeta, masterOpen, nextGym } from '../src/shared/gyms';
import { ACHIEVEMENT_BY_ID, NO_RUN, metaBonus, trainerHint, type LifetimeStats } from '../src/shared/meta';
import { LINES, formOf } from '../src/shared/pokemon';
import { buildFor, generateBuild, validateBuild } from '../src/shared/pvp/build';
import { gymFields, gymFoe, gymMeta, gymTeam, isUnderdog } from '../src/shared/pvp/gym';
import { PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { cleanMeta } from '../src/shared/room';
import { GameSim } from '../src/shared/sim/game';
import { TRAINERS } from '../src/shared/trainers';

test('道馆数据：八个道馆按顺序排列，队伍里的宝可梦都存在，等级越来越高，立绘都导入了', () => {
  assert.equal(GYMS.length, 8);
  GYMS.forEach((g, i) => {
    assert.equal(g.no, i + 1);
    for (const t of [g.leader, g.junior]) {
      for (const l of t.team) assert.ok(LINES[l], `${g.id} 的 ${l}`);
      assert.ok(fs.existsSync(`public/trainers/${t.art}.png`), `${t.art} 的立绘`);
      assert.ok(t.intro && t.win && t.lose, '每个人都有开战、输了、赢了的台词');
    }
    assert.equal(g.leader.team.length, 3);
    assert.ok(g.junior.level < g.leader.level, '道馆训练家比馆主弱');
    if (i > 0) assert.ok(g.leader.level > GYMS[i - 1].leader.level, '后面的道馆更难');
    assert.ok(Object.keys(g.badge.mods).length && g.badge.typeMods[g.type], '徽章加成：一项能力 + 馆主擅长的属性');
    assert.ok(counters(g.type).length > 0);
  });
  assert.ok(fs.existsSync('public/trainers/oak.png') && fs.existsSync('public/trainers/npc_guide_ow.png'));
});

test('道馆的队伍每次都一样，并且是合法的构筑', () => {
  for (const g of GYMS) {
    const a = gymTeam(g, 'leader'), b = gymTeam(g, 'leader');
    assert.deepEqual(a, b, `${g.name} 的队伍固定`);
    for (const x of [...a, ...gymTeam(g, 'junior')]) assert.notEqual(typeof validateBuild(x), 'string', JSON.stringify(x));
    assert.ok(a.every((x) => x.level === g.leader.level));
  }
  // 普通 AI 训练家仍然最高 40 级，道馆可以更高
  assert.equal(generateBuild(new Rng(1), 55).level, 40);
  assert.equal(buildFor(new Rng(1), 'rhyhorn', 46).level, 46);
});

test('按顺序挑战道馆', () => {
  assert.ok(gymOpen({}, GYMS[0]));
  assert.ok(!gymOpen({}, GYMS[1]));
  assert.ok(gymOpen({ pewter: 1 }, GYMS[1]));
  assert.equal(nextGym({})!.id, 'pewter');
  assert.equal(nextGym({ pewter: 1, cerulean: 1 })!.id, 'vermilion');
  assert.equal(nextGym(Object.fromEntries(GYMS.map((g) => [g.id, 1]))), null);
});

test('徽章加成：随研究所强化一起发给服务器，开局时加到宝可梦身上', () => {
  const meta = cleanMeta({ atk: 2, [badgeKey('pewter')]: 1, [badgeKey('cerulean')]: 1, bogus_key_that_is_far_too_long_xx: 1 });
  assert.equal(meta[badgeKey('pewter')], 1, '徽章键能通过服务器的清洗');
  const mb = metaBonus(meta);
  assert.equal(mb.mods.defPct, 6);
  assert.equal(mb.mods.regen, 2);
  assert.equal(mb.typeMods.rock, 8);
  assert.equal(mb.typeMods.water, 8);
  const plain = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta: { atk: 2 } }], 1).players[0];
  const badged = new GameSim([{ id: 1, name: 'A', line: 'squirtle', meta }], 1).players[0];
  assert.ok(badged.d.def > plain.d.def, '灰色徽章提高物防');
  assert.equal(badged.trainerTypeMods.water, (plain.trainerTypeMods.water ?? 0) + 8, '蓝色徽章提高水系技能');
});

test('道馆成就：徽章数量与击败馆主时的情况；冒险成就不会在道馆里误判', () => {
  const s = (badges: number, masters = 0): LifetimeStats => ({ runs: 1, wins: 0, kills: 0, bestWave: 0, coopRuns: 0, revives: 0, recruits: 0, owned: 3, badges, masters, shinies: 0 });
  const A = ACHIEVEMENT_BY_ID;
  assert.ok(A.badge_1.check(NO_RUN, s(1)));
  assert.ok(!A.badge_4.check(NO_RUN, s(3)));
  assert.ok(A.badge_8.check(NO_RUN, s(8)));
  const g = { gym: 'pewter', underdog: true, auto: false, flawless: true };
  assert.ok(A.gym_underdog.check(NO_RUN, s(1), g));
  assert.ok(A.gym_flawless.check(NO_RUN, s(1), g));
  assert.ok(!A.gym_auto.check(NO_RUN, s(1), g));
  assert.ok(!A.gym_underdog.check(NO_RUN, s(1)), '不在道馆里时不判定');
  for (const id of ['first_wave', 'victory', 'fire_heart', 'no_evolve_win', 'kills_400', 'coop']) assert.ok(!A[id].check(NO_RUN, s(8), g), id);
  assert.ok(!A.master_1.check(NO_RUN, s(8, 0)) && A.master_1.check(NO_RUN, s(8, 1)));
  assert.ok(A.master_4.check(NO_RUN, s(8, 4)) && !A.master_8.check(NO_RUN, s(8, 7)) && A.master_8.check(NO_RUN, s(8, 8)));
  // 打败小刚 / 娜姿可以解锁这两位训练家（也可以用星之沙招募）
  assert.equal(TRAINERS.brock.unlock.ach, 'badge_1');
  assert.equal(TRAINERS.sabrina.unlock.ach, 'badge_6');
  assert.match(trainerHint('brock'), /星之沙.*或.*小刚/);
});

function fight(mine: ReturnType<typeof gymTeam>, meta: Record<string, number>, g: (typeof GYMS)[number], seed: number) {
  const inits: PvpInit[] = [
    ...mine.map((build, i) => ({ id: i + 1, name: '我', team: 0, build, meta, bot: true, owner: 1, helper: i > 0 })),
    ...gymTeam(g, 'leader').map((build, i) => ({ id: 10 + i, name: g.leader.name, team: 1, build, meta: g.meta, trainer: g.leader.art, bot: true, owner: 2, helper: i > 0 })),
  ];
  const sim = new PvpSim('1v1', inits, seed);
  for (let i = 0; i < 30 * 90 && sim.phase !== 'over'; i++) { sim.step(1 / 30); sim.flushEvents(); }
  return sim.result();
}

test('大师难度：进化后的王牌队伍、等级更高，按顺序解锁', () => {
  GYMS.forEach((g, i) => {
    const m = g.master;
    assert.equal(m.team.length, 3);
    for (const l of m.team) assert.ok(LINES[l], `${g.id} 的 ${l}`);
    assert.ok(m.level >= g.leader.level + 8, `${g.name}的大师难度比普通难度高很多`);
    if (i > 0) assert.ok(m.level > GYMS[i - 1].master.level, '后面的道馆更难');
    assert.ok(m.intro && m.win && m.lose);
    const team = gymTeam(g, 'master');
    assert.deepEqual(team, gymTeam(g, 'master'), '队伍固定');
    for (const b of team) {
      assert.notEqual(typeof validateBuild(b), 'string', JSON.stringify(b));
      assert.equal(b.level, m.level);
      const L = LINES[b.line];
      assert.equal(b.stage, L.forms.length - 1, `${g.name}大师难度的${L.name}是最终形态`);
      assert.ok(formOf(b.line, b.stage).types.includes(g.type), `${formOf(b.line, b.stage).name}是${g.type}系`);
    }
    assert.ok(gymMeta(g, 'master').hp! > g.meta.hp!, '研究所强化更高');
    assert.equal(gymFoe(g, 'master').name, g.leader.name);
    assert.ok(isUnderdog(gymTeam(g, 'leader'), g, 'master'), '拿普通难度馆主的队伍打大师难度算以弱胜强');
  });
  assert.ok(masterMeta(GYMS[7]).hp! <= 10);
  const all = Object.fromEntries(GYMS.map((g) => [g.id, 1]));
  assert.ok(!masterOpen({}, {}, GYMS[0]), '先拿普通徽章');
  assert.ok(masterOpen({ pewter: 1 }, {}, GYMS[0]));
  assert.ok(!masterOpen(all, {}, GYMS[1]), '再按顺序拿大师徽章');
  assert.ok(masterOpen(all, { pewter: 1 }, GYMS[1]));
  assert.ok(!masterOpen({ pewter: 1 }, { pewter: 1 }, GYMS[1]), '没有华蓝道馆的普通徽章');
});

test('大师徽章：这枚徽章的加成再算一次', () => {
  const one = metaBonus(cleanMeta({ [badgeKey('pewter')]: 1 }));
  const two = metaBonus(cleanMeta({ [badgeKey('pewter')]: 1, [masterKey('pewter')]: 1 }));
  assert.equal(two.mods.defPct, one.mods.defPct! * 2);
  assert.equal(two.typeMods.rock, one.typeMods.rock! * 2);
  assert.equal(metaBonus(cleanMeta({ [masterKey('pewter')]: 1 })).mods.defPct, undefined, '没有普通徽章时大师徽章不生效');
  for (const g of GYMS) assert.ok(masterKey(g.id).length < 24, '能通过服务器的清洗');
});

function gymSim(g: (typeof GYMS)[number], stage: 'junior' | 'leader' | 'master', mine = [buildFor(new Rng(2), 'squirtle', 30), buildFor(new Rng(3), 'bulbasaur', 30), buildFor(new Rng(4), 'machop', 30)], seed = 5) {
  const T = gymFoe(g, stage);
  const inits: PvpInit[] = [
    ...mine.map((build, i) => ({ id: i + 1, name: '我', team: 0, build, meta: {}, bot: true, owner: 1, helper: i > 0 })),
    ...gymTeam(g, stage).map((build, i) => ({ id: 10 + i, name: T.name, team: 1, build, meta: gymMeta(g, stage), trainer: T.art, bot: true, owner: 2, helper: i > 0 })),
  ];
  return new PvpSim('1v1', inits, seed, { fields: gymFields(g, stage) });
}

test('道馆的场地：主场在馆主那一半，克制馆主的场地在挑战者这一半，开场就生效', () => {
  for (const g of GYMS) {
    const [home, counter] = g.fields;
    assert.ok(FIELDS[home].types.some((t) => gymTeam(g, 'leader').some((b) => formOf(b.line, b.stage).types.includes(t))), `${g.name}的主场对馆主的宝可梦有利`);
    assert.notEqual(home, counter);
    for (const stage of ['junior', 'leader', 'master'] as const) {
      const sim = gymSim(g, stage, undefined, 3 + g.no);
      const plan = gymFields(g, stage);
      assert.equal(sim.fields.length, plan.length, `${g.name} ${stage} 的场地都长出来了`);
      const { cols } = fieldGrid(sim.w, sim.h);
      sim.fields.forEach((f, i) => {
        assert.equal(f.kind, plan[i].kind);
        assert.equal(components(cols, f.cells), 1, '连续的一整块');
        const xs = f.cells.map((c) => c % cols);
        if (plan[i].side === 1) assert.ok(Math.min(...xs) >= cols * 0.5, '主场在馆主那一半');
        else assert.ok(Math.max(...xs) < cols * 0.5, '克制馆主的场地在挑战者这一半');
        assert.equal(f.activeAt, 0, '开场就生效');
        for (const p of sim.players) assert.notEqual(sim.fieldAt(p.x, p.y), f.kind, '不长在宝可梦脚下');
      });
      const ev = sim.flushEvents().filter((e) => e[0] === 'field');
      assert.equal(ev.length, plan.length, '场地的形状发给客户端');
      assert.equal(sim.publicState().fields.length, plan.length);
    }
  }
  const master = gymSim(GYMS[6], 'master'), leader = gymSim(GYMS[6], 'leader');
  assert.ok(master.fields[0].cells.length > leader.fields[0].cells.length, '大师难度的主场更大');
});

test('道馆的场地在对战里生效：草丛命中回复、寒霜命中减速、熔岩灼伤', () => {
  const g = GYMS[3];
  const sim = gymSim(g, 'leader');
  sim.step(4);
  const me = sim.players[0], foe = sim.players.find((p) => p.team === 1)!;
  const proxy = sim.proxyOf(foe.id)!;
  const grass = sim.fields.find((f) => f.kind === 'grass')!;
  me.hp = me.d.maxHp * 0.5;
  const before = me.hp;
  sim.pvpHit(proxy, me, 4000, 'grass', { drain: 0.05, skill: null });
  assert.ok(me.hp > before, '繁茂草丛：草系招式命中回复');
  // 承伤上限恢复一点再打
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  sim.pvpHit(proxy, me, 400, 'water', { chill: true, skill: null });
  assert.ok(proxy.st.slow > 0 && proxy.st.slowAmt >= 0.2, '寒霜区域：命中减速');
  // 站进熔岩（克制莉佳的场地）的草系宝可梦会被灼伤
  const lava = sim.fields.find((f) => f.kind === 'lava')!;
  const cols = fieldGrid(sim.w, sim.h).cols;
  const c = lava.cells[Math.floor(lava.cells.length / 2)];
  foe.x = (c % cols) * 16 + 8; foe.y = Math.floor(c / cols) * 16 + 8;
  foe.bot = false;
  const hp0 = foe.hp;
  for (let i = 0; i < 30; i++) { foe.x = (c % cols) * 16 + 8; foe.y = Math.floor(c / cols) * 16 + 8; sim.step(1 / 30); }
  assert.ok(foe.fieldBurn > 0 && foe.hp < hp0, '草系宝可梦在熔岩里被灼伤');
  assert.ok(grass.cells.length > 0);
});

test('道馆的 AI 会守在自己的主场里', () => {
  const g = GYMS[4];
  let inside = 0, total = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const sim = gymSim(g, 'leader', undefined, seed);
    for (let i = 0; i < 30 * 40 && sim.phase !== 'over'; i++) {
      sim.step(1 / 30);
      sim.flushEvents();
      if (i % 15) continue;
      for (const p of sim.players) {
        if (p.team !== 1 || p.down || !p.alive) continue;
        total++;
        if (sim.fieldAt(p.x, p.y) === 'smog') inside++;
      }
    }
  }
  assert.ok(inside / total > 0.25, `阿桔的毒系宝可梦在阴云毒雾里的时间 ${Math.round((inside / total) * 100)}%`);
});

test('道馆对战：强的队伍能打败小刚，太弱的队伍打不过坂木', () => {
  const strong = [buildFor(new Rng(2), 'squirtle', 18), buildFor(new Rng(3), 'bulbasaur', 18), buildFor(new Rng(4), 'machop', 18)];
  const weak = [buildFor(new Rng(5), 'caterpie', 6), buildFor(new Rng(6), 'rattata', 6), buildFor(new Rng(7), 'pidgey', 6)];
  let wins = 0;
  for (let i = 0; i < 3; i++) if (fight(strong, { def: 3 }, GYMS[0], 10 + i).winner === 0) wins++;
  assert.ok(wins >= 2, `Lv18 的队伍打小刚赢了 ${wins}/3 场`);
  assert.equal(fight(weak, {}, GYMS[7], 99).winner, 1, 'Lv6 的队伍打不过坂木');
  assert.ok(isUnderdog(weak, GYMS[0]));
  assert.ok(!isUnderdog(strong, GYMS[0]));
});
