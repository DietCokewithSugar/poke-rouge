import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { GYMS, badgeKey, counters, gymOpen, nextGym } from '../src/shared/gyms';
import { ACHIEVEMENT_BY_ID, NO_RUN, metaBonus, trainerHint, type LifetimeStats } from '../src/shared/meta';
import { LINES } from '../src/shared/pokemon';
import { buildFor, generateBuild, validateBuild } from '../src/shared/pvp/build';
import { gymTeam, isUnderdog } from '../src/shared/pvp/gym';
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
  const s = (badges: number): LifetimeStats => ({ runs: 1, wins: 0, kills: 0, bestWave: 0, coopRuns: 0, revives: 0, recruits: 0, owned: 3, badges });
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
