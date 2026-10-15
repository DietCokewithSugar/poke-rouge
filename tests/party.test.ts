import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RunSummary } from '../src/shared/meta';
import { generateBuild } from '../src/shared/pvp/build';
import { Rng } from '../src/shared/rng';

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
