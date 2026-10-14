import { ACHIEVEMENTS, META_UPGRADES, metaCost, stardustFor, type LifetimeStats, type RunSummary } from '../shared/meta';
import { DIFFICULTIES, type DifficultyId } from '../shared/difficulty';
import { LINES, LINE_IDS, type LineId } from '../shared/pokemon';
import { validateBuild, type SavedBuild } from '../shared/pvp/build';
import type { PvpMode } from '../shared/pvp/sim';

const KEY = 'poke-rouge-save-v1';

export interface Settings { volume: number; music: number; damageNumbers: boolean; gbFilter: boolean; shake: boolean }

export const PARTY_MAX = 6;

/** 背包里的宝可梦：保存一局冒险结束时的构筑 */
export interface PartyMon {
  uid: string;
  build: SavedBuild;
  savedAt: number;
  from: { difficulty: DifficultyId; wavesCleared: number; victory: boolean; players: number };
  pvp: { wins: number; losses: number; draws: number };
}

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
  party: PartyMon[];
  /** 对战身份：服务器用它记录积分 */
  pvpId: { pid: string; secret: string } | null;
  pvpMode: PvpMode;
  pvpPick: string;
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
    party: [],
    pvpId: null,
    pvpMode: '1v1',
    pvpPick: '',
  };
}

function randomId(len: number) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export function pvpIdentity(p: Profile) {
  if (!p.pvpId) {
    p.pvpId = { pid: randomId(20), secret: randomId(32) };
    saveProfile(p);
  }
  return p.pvpId;
}

/** 放进背包；满了返回 false（需要先放生） */
export function addToParty(p: Profile, s: RunSummary): PartyMon | null {
  if (!s.build || p.party.length >= PARTY_MAX || typeof validateBuild(s.build) === 'string') return null;
  const mon: PartyMon = {
    uid: randomId(10), build: s.build, savedAt: Date.now(),
    from: { difficulty: s.difficulty, wavesCleared: s.wavesCleared, victory: s.victory, players: s.players },
    pvp: { wins: 0, losses: 0, draws: 0 },
  };
  p.party.push(mon);
  p.pvpPick = mon.uid;
  saveProfile(p);
  return mon;
}

export function releaseFromParty(p: Profile, uid: string) {
  p.party = p.party.filter((m) => m.uid !== uid);
  if (p.pvpPick === uid) p.pvpPick = p.party[0]?.uid ?? '';
  saveProfile(p);
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Profile>;
    const f = fresh();
    const party = Array.isArray(p.party) ? p.party.filter((m) => m && typeof validateBuild(m.build) !== 'string').slice(0, PARTY_MAX) : [];
    return { ...f, ...p, party, stats: { ...f.stats, ...p.stats }, settings: { ...f.settings, ...p.settings } };
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
