import { ACHIEVEMENTS, META_UPGRADES, metaCost, stardustFor, type LifetimeStats, type RunSummary } from '../shared/meta';
import { DIFFICULTIES, type DifficultyId } from '../shared/difficulty';
import { LINES, LINE_IDS, type LineId } from '../shared/pokemon';

const KEY = 'poke-rouge-save-v1';

export interface Settings { volume: number; music: number; damageNumbers: boolean; gbFilter: boolean; shake: boolean }

export interface Profile {
  name: string;
  stardust: number;
  upgrades: Record<string, number>;
  achievements: Record<string, number>;
  stats: LifetimeStats;
  lastLine: LineId;
  lastDifficulty: DifficultyId;
  settings: Settings;
  seenEnemies: string[];
}

function fresh(): Profile {
  return {
    name: '',
    stardust: 0,
    upgrades: {},
    achievements: {},
    stats: { runs: 0, wins: 0, kills: 0, bestWave: 0, coopRuns: 0, revives: 0 },
    lastLine: 'charmander',
    lastDifficulty: 'easy',
    settings: { volume: 0.6, music: 0.4, damageNumbers: true, gbFilter: false, shake: true },
    seenEnemies: [],
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Profile>;
    const f = fresh();
    return { ...f, ...p, stats: { ...f.stats, ...p.stats }, settings: { ...f.settings, ...p.settings } };
  } catch {
    return fresh();
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 隐私模式等情况下无法保存 */ }
}

export function isUnlocked(p: Profile, line: LineId): boolean {
  const u = LINES[line].unlock;
  return !u || !!p.achievements[u];
}

export function isDifficultyUnlocked(p: Profile, id: DifficultyId): boolean {
  const u = DIFFICULTIES[id].unlock;
  return !u || !!p.achievements[u];
}

export function unlockedLines(p: Profile): LineId[] {
  return LINE_IDS.filter((l) => isUnlocked(p, l));
}

export function buyUpgrade(p: Profile, id: string): boolean {
  const u = META_UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  const lv = p.upgrades[id] ?? 0;
  if (lv >= u.max) return false;
  const cost = metaCost(u, lv);
  if (p.stardust < cost) return false;
  p.stardust -= cost;
  p.upgrades[id] = lv + 1;
  saveProfile(p);
  return true;
}

export function refundUpgrades(p: Profile) {
  let back = 0;
  for (const u of META_UPGRADES) {
    const lv = p.upgrades[u.id] ?? 0;
    for (let i = 0; i < lv; i++) back += metaCost(u, i);
  }
  p.stardust += back;
  p.upgrades = {};
  saveProfile(p);
}

export interface RunReward { stardust: number; newAchievements: { id: string; name: string; reward: number; unlocks?: LineId }[] }

/** 结算一局：更新统计、判定成就、发放星之沙。 */
export function applyRun(p: Profile, r: RunSummary): RunReward {
  p.stats.runs++;
  if (r.victory) p.stats.wins++;
  p.stats.kills += r.kills;
  p.stats.bestWave = Math.max(p.stats.bestWave, r.wavesCleared);
  if (r.players > 1) p.stats.coopRuns++;
  p.stats.revives += r.revives;
  let dust = stardustFor(r);
  const fresh: RunReward['newAchievements'] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (a.check(r, p.stats)) {
      p.achievements[a.id] = Date.now();
      dust += a.reward;
      fresh.push({ id: a.id, name: a.name, reward: a.reward, unlocks: a.unlocks });
    }
  }
  p.stardust += dust;
  saveProfile(p);
  return { stardust: dust, newAchievements: fresh };
}
