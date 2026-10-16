import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RunSummary } from '../src/shared/meta';
import { generateBuild, type SavedBuild } from '../src/shared/pvp/build';
import { PvpRoom } from '../src/shared/pvp/room';
import { cleanMeta } from '../src/shared/room';
import { Rng } from '../src/shared/rng';
import type { GameSim } from '../src/shared/sim/game';
import { createPlayerFromBuild } from '../src/shared/sim/player';

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
const save = await import('../src/client/save');

const rng = new Rng(7);
const summary = (): RunSummary => ({ build: generateBuild(rng, 10), difficulty: 'easy', wavesCleared: 8, victory: false, players: 1 }) as unknown as RunSummary;

test('背包：一开始 12 格，对战场达到超级球级后多 6 格', () => {
  store.clear();
  const p = save.loadProfile();
  assert.equal(save.PARTY_BONUS_TIER.name, '超级球级');
  assert.equal(save.partyMax(p), 12);
  for (let i = 0; i < 12; i++) assert.ok(save.addToParty(p, summary()), `第 ${i + 1} 只`);
  assert.equal(save.addToParty(p, summary()), null, '满了放不进去');

  assert.equal(save.notePvpBest(p, save.PARTY_BONUS_TIER.min - 1), false);
  assert.equal(save.partyMax(p), 12);
  assert.equal(save.notePvpBest(p, save.PARTY_BONUS_TIER.min), true, '刚达到超级球级时提示解锁');
  assert.equal(save.partyMax(p), 18);
  assert.equal(save.notePvpBest(p, 1300), false, '已经解锁过了');
  assert.equal(save.notePvpBest(p, 900), false);
  assert.equal(p.pvpBest, 1300, '只记最高分，掉分也不会收回格子');
  assert.equal(save.partyMax(p), 18);
  for (let i = 0; i < 6; i++) assert.ok(save.addToParty(p, summary()));
  assert.equal(save.addToParty(p, summary()), null);
  assert.equal(p.party.length, save.PARTY_LIMIT);

  const again = save.loadProfile();
  assert.equal(again.party.length, 18, '存档读回来格子还在');
  assert.equal(save.partyMax(again), 18);
});

test('背包：读存档时清理异常数据', () => {
  store.clear();
  const party = Array.from({ length: 25 }, (_, i) => ({ uid: `m${i}`, build: generateBuild(rng, 8), savedAt: 0, from: { difficulty: 'easy', wavesCleared: 3, victory: false, players: 1 }, pvp: { wins: 0, losses: 0, draws: 0 } }));
  localStorage.setItem('poke-rouge-save-v1', JSON.stringify({ name: '小赤', setup: true, party, pvpBest: 'abc', bestRun: { difficulty: 'easy', waves: 50 }, gymLog: 3 }));
  const p = save.loadProfile();
  assert.equal(p.party.length, save.PARTY_LIMIT, '最多留 18 只');
  assert.equal(p.pvpBest, 0);
  assert.equal(save.partyMax(p), 12);
  assert.equal(p.bestRun, null);
  assert.deepEqual(p.gymLog, {});
});

test('背包面板的属性 = 开局后对战里的属性（研究所强化、道馆徽章、训练家都算上）', () => {
  store.clear();
  const p = save.loadProfile();
  p.trainer = 'brock';
  p.badges = { pewter: 1, cerulean: 1 };
  p.upgrades = { hp: 2, def: 1, atk: 3 };
  const team: SavedBuild[] = [
    { line: 'charmander', stage: 1, level: 16, skills: [{ id: 'ember', lv: 2 }, { id: 'scratch', lv: 1 }], items: [['charcoal', 1]], levelMods: { def: 5 } },
    { line: 'squirtle', stage: 1, level: 14, skills: [{ id: 'water_gun', lv: 1 }], items: [], levelMods: { maxHp: 8 } },
    generateBuild(rng, 12),
  ];
  // 浏览器里的练习赛直接用 runMeta；服务器匹配、道馆先 cleanMeta 再开局
  for (const meta of [save.runMeta(p), cleanMeta(save.runMeta(p))]) {
    const c = { send() {} };
    const room = new PvpRoom('测试', '1v1', [
      { id: 1, name: '小刚', team: 0, builds: team, meta, trainer: p.trainer, conn: c, bot: false, rating: 1000 },
      { id: 2, name: '小茂', team: 1, builds: team, meta: {}, trainer: 'gary', conn: null, bot: true, rating: 1000 },
    ], 3);
    room.begin();
    room.update();
    const mine = room.sim.players.filter((q) => room.sim.ownerOf(q.id).owner === 1);
    assert.equal(mine.length, 3);
    mine.forEach((q, i) => assert.deepEqual(save.partyStats(p, team[i]).d, q.d, `第 ${i + 1} 只`));
  }
  // 训练家和徽章确实算进去了：比只算研究所强化的数值高
  const bare = createPlayerFromBuild({ w: 0, h: 0 } as unknown as GameSim, 0, '', team[0], p.upgrades).d;
  const full = save.partyStats(p, team[0]).d;
  assert.ok(full.maxHp > bare.maxHp && full.def > bare.def && full.spd > bare.spd, `HP ${bare.maxHp}→${full.maxHp} 物防 ${bare.def}→${full.def}`);
});

test('大师徽章：第一次打败大师难度的馆主才给，加成翻倍，云存档里也有', async () => {
  store.clear();
  const p = save.loadProfile();
  assert.deepEqual(p.masterBadges, {});
  const dust0 = p.stardust;
  const normal = save.winGym(p, { gym: 'pewter', underdog: false, auto: false, flawless: false });
  assert.ok(normal.badge && p.badges.pewter && !p.masterBadges.pewter);
  const dust1 = p.stardust;
  assert.ok(dust1 > dust0);
  const master = save.winGym(p, { gym: 'pewter', underdog: false, auto: false, flawless: false, master: true });
  assert.ok(master.badge && p.masterBadges.pewter, '拿到大师徽章');
  assert.ok(master.newAchievements.some((a) => a.id === 'master_1'), '成就：第一枚大师徽章');
  assert.equal(save.masterCount(p), 1);
  assert.equal(p.stats.masters, 1);
  const again = save.winGym(p, { gym: 'pewter', underdog: false, auto: false, flawless: false, master: true });
  assert.ok(!again.badge, '再赢一次不会再给');
  const meta = save.runMeta(p);
  assert.equal(meta.badge_pewter, 1);
  assert.equal(meta.badge2_pewter, 1);
  const { CLOUD_KEYS } = await import('../src/shared/cloudsave');
  assert.ok((CLOUD_KEYS as readonly string[]).includes('masterBadges'));
  // 旧存档没有这个字段
  localStorage.setItem('poke-rouge-save-v1', JSON.stringify({ name: '小赤', setup: true, badges: { pewter: 1 } }));
  assert.deepEqual(save.loadProfile().masterBadges, {});
});
