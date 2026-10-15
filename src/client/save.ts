import { ACHIEVEMENTS, META_UPGRADES, NO_RUN, metaCost, stardustFor, type GymOutcome, type LifetimeStats, type RunSummary } from '../shared/meta';
import { DIFFICULTIES, type DifficultyId } from '../shared/difficulty';
import { GYM_BY_ID, badgeKey } from '../shared/gyms';
import { LINES, LINE_IDS, STARTERS, isLine, type LineId } from '../shared/pokemon';
import { buildPower, validateBuild, type SavedBuild } from '../shared/pvp/build';
import { TIERS } from '../shared/pvp/rating';
import { betterRun, cleanRun, type RunRecord } from '../shared/ranks';
import type { PvpMode } from '../shared/pvp/sim';
import { TRAINERS, TRAINER_IDS } from '../shared/trainers';
import { defaultUiScale } from './ui/layout';

const KEY = 'poke-rouge-save-v1';

export interface Settings {
  volume: number; music: number; damageNumbers: boolean; gbFilter: boolean; shake: boolean;
  /** 界面大小：100% 时最大的界面占画面 90% */
  uiScale: number;
  fps: 30 | 60 | 120;
  /** 流畅：高分屏上按 1 倍像素渲染画面，减轻显卡负担 */
  quality: 'high' | 'smooth';
  /** 切换界面时的过场动画 */
  transitions: boolean;
}

/** 背包：12 格；在对战场达到超级球级（任意模式的最高分）后再多 6 格 */
export const PARTY_BASE = 12;
export const PARTY_BONUS = 6;
export const PARTY_BONUS_TIER = TIERS[1];
export const PARTY_LIMIT = PARTY_BASE + PARTY_BONUS;

export function partyMax(p: Profile): number {
  return PARTY_BASE + (p.pvpBest >= PARTY_BONUS_TIER.min ? PARTY_BONUS : 0);
}

/** 记下对战场的最高分；返回这次是不是刚刚解锁了背包的额外格子 */
export function notePvpBest(p: Profile, best: number | undefined): boolean {
  if (!best || best <= p.pvpBest) return false;
  const before = partyMax(p);
  p.pvpBest = Math.round(best);
  saveProfile(p);
  return partyMax(p) > before;
}

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
  /** 完成了开场（选训练家、初始伙伴、名字） */
  setup: boolean;
  trainer: string;
  /** 用星之沙招募的训练家（初始的与成就解锁的不在这里） */
  trainers: string[];
  /** 跟随的宝可梦：冒险与对战都直接用它 */
  partner: LineId;
  /** 跟随的是闪光宝可梦 */
  partnerShiny: boolean;
  /** 拥有的宝可梦（进化线）：初始伙伴、崇拜你的、买来的。成就解锁的另外判断 */
  owned: LineId[];
  /** 拥有的闪光宝可梦（进化线）：和普通的是两只宝可梦，冒险中打倒闪光宝可梦时得到 */
  shiny: LineId[];
  stardust: number;
  upgrades: Record<string, number>;
  achievements: Record<string, number>;
  stats: LifetimeStats;
  lastDifficulty: DifficultyId;
  settings: Settings;
  seenEnemies: string[];
  party: PartyMon[];
  /** 对战身份：服务器用它记录积分 */
  pvpId: { pid: string; secret: string } | null;
  /** 对战场的历史最高分（任意模式）：达到超级球级后背包多 6 格 */
  pvpBest: number;
  /** 冒险的最好成绩（报给服务器的冒险榜） */
  bestRun: RunRecord | null;
  pvpMode: PvpMode;
  pvpPick: string;
  /** 单挑时和队长一起上场的两只（背包里的 uid）；null 表示自动选最强的 */
  pvpTeam: string[] | null;
  /** 对战开局就交给 AI（斗蛐蛐） */
  pvpAuto: boolean;
  /** 冒险的 AI 辅助战斗（首次通关后解锁） */
  autoAssist: boolean;
  /** 道馆徽章：道馆 → 拿到的时间 */
  badges: Record<string, number>;
  /** 打败过的道馆训练家（再来时直接挑战馆主） */
  gymJunior: Record<string, number>;
  /** 看过的新手引导 */
  guide: Record<string, number>;
  /** 上次在真新镇里站的位置 */
  townPos: { x: number; y: number } | null;
}

function fresh(): Profile {
  return {
    name: '',
    setup: false,
    trainer: 'ash',
    trainers: [],
    partner: 'charmander',
    partnerShiny: false,
    owned: [],
    shiny: [],
    stardust: 0,
    upgrades: {},
    achievements: {},
    stats: { runs: 0, wins: 0, kills: 0, bestWave: 0, coopRuns: 0, revives: 0, recruits: 0, owned: 0, badges: 0, shinies: 0 },
    lastDifficulty: 'easy',
    settings: { volume: 0.6, music: 0.4, damageNumbers: true, gbFilter: false, shake: true, uiScale: defaultUiScale(), fps: 60, quality: 'high', transitions: true },
    seenEnemies: [],
    party: [],
    pvpId: null,
    pvpBest: 0,
    bestRun: null,
    pvpMode: '1v1',
    pvpPick: '',
    pvpTeam: null,
    pvpAuto: false,
    autoAssist: false,
    badges: {},
    gymJunior: {},
    guide: {},
    townPos: null,
  };
}

/** 徽章：和研究所强化一起发给服务器（badge_<道馆> = 1） */
export function badgeMeta(p: Profile): Record<string, number> {
  return Object.fromEntries(Object.keys(p.badges).filter((id) => GYM_BY_ID[id]).map((id) => [badgeKey(id), 1]));
}

/** 冒险的 AI 辅助战斗：通关过一次才能用 */
export const autoAssistUnlocked = (p: Profile) => p.stats.wins > 0;

/** 一只宝可梦：进化线 + 是不是闪光的（普通的和闪光的是两只独立的宝可梦） */
export interface Mon { line: LineId; shiny: boolean }

export const monKey = (m: Mon) => (m.shiny ? `${m.line}*` : m.line);
export const sameMon = (a: Mon, b: Mon) => a.line === b.line && a.shiny === b.shiny;
export const partnerOf = (p: Profile): Mon => ({ line: p.partner, shiny: p.partnerShiny });
export const buildMon = (b: SavedBuild): Mon => ({ line: b.line, shiny: !!b.shiny });

export function ownsMon(p: Profile, m: Mon): boolean {
  return m.shiny ? p.shiny.includes(m.line) : isUnlocked(p, m.line);
}

/** 拥有的宝可梦（按图鉴顺序，闪光的排在普通的后面）；all 时没有的普通宝可梦也列出来 */
export function monList(p: Profile, all = false): Mon[] {
  return LINE_IDS.flatMap((line) => {
    const out: Mon[] = [];
    if (all || isUnlocked(p, line)) out.push({ line, shiny: false });
    if (p.shiny.includes(line)) out.push({ line, shiny: true });
    return out;
  });
}

/** 对战的队长：背包里跟随的伙伴的构筑（闪光的和普通的分开；优先上次选的，其次最强的） */
export function pvpLeader(p: Profile): PartyMon | null {
  const own = p.party.filter((m) => sameMon(buildMon(m.build), partnerOf(p)));
  return own.find((m) => m.uid === p.pvpPick) ?? own.sort((a, b) => buildPower(b.build) - buildPower(a.build))[0] ?? null;
}

/** 出战队伍：队长 + 一起上场的（单挑共 3 只；没有手动选过时自动挑最强的） */
export function pvpTeamOf(p: Profile, size: number): PartyMon[] {
  const leader = pvpLeader(p);
  if (!leader) return [];
  const others = p.party.filter((m) => m !== leader);
  const picked = p.pvpTeam
    ? p.pvpTeam.map((u) => others.find((m) => m.uid === u)).filter((m): m is PartyMon => !!m)
    : others.sort((a, b) => buildPower(b.build) - buildPower(a.build));
  return [leader, ...picked].slice(0, size);
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
  if (!s.build || p.party.length >= partyMax(p) || typeof validateBuild(s.build) === 'string') return null;
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
  if (p.pvpTeam) p.pvpTeam = p.pvpTeam.filter((u) => u !== uid);
  saveProfile(p);
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Profile> & { lastLine?: string };
    const f = fresh();
    const party = Array.isArray(p.party) ? p.party.filter((m) => m && typeof validateBuild(m.build) !== 'string').slice(0, PARTY_LIMIT) : [];
    const out: Profile = { ...f, ...p, party, stats: { ...f.stats, ...p.stats }, settings: { ...f.settings, ...p.settings } };
    // 旧存档：以前御三家一开始就能用，保留下来；需要重新走一遍开场选训练家
    if (!Array.isArray(p.owned)) out.owned = (p.stats?.runs ?? 0) > 0 ? [...STARTERS] : [];
    out.owned = out.owned.filter(isLine);
    out.shiny = [...new Set((Array.isArray(out.shiny) ? out.shiny : []).filter(isLine))];
    out.trainers = (Array.isArray(out.trainers) ? out.trainers : []).filter((t) => TRAINERS[t]);
    if (!TRAINERS[out.trainer]) out.trainer = 'ash';
    if (!isLine(out.partner)) out.partner = isLine(p.lastLine) ? p.lastLine : 'charmander';
    out.partnerShiny = out.partnerShiny === true;
    if (out.setup && !ownsMon(out, partnerOf(out))) { out.partner = unlockedLines(out)[0] ?? 'charmander'; out.partnerShiny = false; }
    out.stats.owned = unlockedLines(out).length;
    out.stats.shinies = out.shiny.length;
    out.pvpBest = Number.isFinite(out.pvpBest) ? out.pvpBest : 0;
    out.bestRun = cleanRun(out.bestRun);
    return out;
  } catch {
    return fresh();
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 隐私模式等情况下无法保存 */ }
}

export function isUnlocked(p: Profile, line: LineId): boolean {
  const L = LINES[line];
  if (!L) return false;
  return p.owned.includes(line) || (!!L.unlock.ach && !!p.achievements[L.unlock.ach]);
}

export function isDifficultyUnlocked(p: Profile, id: DifficultyId): boolean {
  const u = DIFFICULTIES[id].unlock;
  return !u || !!p.achievements[u];
}

export function unlockedLines(p: Profile): LineId[] {
  return LINE_IDS.filter((l) => isUnlocked(p, l));
}

export function isTrainerUnlocked(p: Profile, id: string): boolean {
  const t = TRAINERS[id];
  if (!t) return false;
  return !!t.unlock.start || p.trainers.includes(id) || (!!t.unlock.ach && !!p.achievements[t.unlock.ach]);
}

export function unlockedTrainers(p: Profile): string[] {
  return TRAINER_IDS.filter((t) => isTrainerUnlocked(p, t));
}

/** 用星之沙招募训练家 */
export function buyTrainer(p: Profile, id: string): boolean {
  const t = TRAINERS[id];
  if (!t?.unlock.cost || isTrainerUnlocked(p, id) || p.stardust < t.unlock.cost) return false;
  p.stardust -= t.unlock.cost;
  p.trainers.push(id);
  saveProfile(p);
  return true;
}

/** 用星之沙买宝可梦（鲤鱼王推销员） */
export function buyLine(p: Profile, id: LineId): boolean {
  const cost = LINES[id]?.unlock.cost;
  if (!cost || isUnlocked(p, id) || p.stardust < cost) return false;
  p.stardust -= cost;
  addOwned(p, id);
  return true;
}

/** 新的伙伴：冒险中崇拜你的宝可梦（shiny：闪光宝可梦；返回是不是第一次得到） */
export function addOwned(p: Profile, id: LineId, recruited = false, shiny = false): boolean {
  if (!isLine(id)) return false;
  const isNew = !ownsMon(p, { line: id, shiny });
  if (shiny) {
    if (!p.shiny.includes(id)) p.shiny.push(id);
  } else if (!p.owned.includes(id)) p.owned.push(id);
  if (recruited) p.stats.recruits++;
  p.stats.owned = unlockedLines(p).length;
  p.stats.shinies = p.shiny.length;
  saveProfile(p);
  return isNew;
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

export interface RunReward {
  stardust: number;
  newAchievements: { id: string; name: string; reward: number; unlocks?: LineId[]; trainer?: string }[];
  /** 本局崇拜你的新伙伴 */
  recruits: LineId[];
  /** 本局崇拜你的闪光宝可梦 */
  shinyRecruits: LineId[];
}

/** 结算一局：更新统计、判定成就、发放星之沙。 */
export function applyRun(p: Profile, r: RunSummary): RunReward {
  p.stats.runs++;
  if (r.victory) p.stats.wins++;
  p.stats.kills += r.kills;
  p.stats.bestWave = Math.max(p.stats.bestWave, r.wavesCleared);
  if (r.players > 1) p.stats.coopRuns++;
  p.stats.revives += r.revives;
  // 冒险中已经实时解锁过了；断线等情况下漏掉的在这里补上
  for (const id of r.recruits) if (!p.owned.includes(id)) addOwned(p, id, true);
  for (const id of r.shinyRecruits) if (!p.shiny.includes(id)) addOwned(p, id, true, true);
  const run = cleanRun({ difficulty: r.difficulty, waves: r.wavesCleared, victory: r.victory, time: r.detail.time, dex: r.detail.dex, shiny: r.shiny, players: r.players });
  p.bestRun = betterRun(p.bestRun, run);
  const got = evalAchievements(p, r);
  const dust = stardustFor(r) + got.dust;
  p.stardust += stardustFor(r);
  saveProfile(p);
  return { stardust: dust, newAchievements: got.fresh, recruits: r.recruits.slice(), shinyRecruits: r.shinyRecruits.slice() };
}

/** 判定成就并发放奖励（星之沙直接加到存档里）。冒险结算、赢了道馆之后都会调用 */
export function evalAchievements(p: Profile, r: RunSummary = NO_RUN, g: GymOutcome | null = null) {
  const fresh: RunReward['newAchievements'] = [];
  let dust = 0;
  p.stats.badges = Object.keys(p.badges).filter((id) => GYM_BY_ID[id]).length;
  p.stats.owned = unlockedLines(p).length;
  p.stats.shinies = p.shiny.length;
  // 成就可能会连锁（解锁新宝可梦让图鉴数达标），多判定几轮
  for (let round = 0; round < 3; round++) {
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (p.achievements[a.id]) continue;
      if (a.check(r, p.stats, g)) {
        p.achievements[a.id] = Date.now();
        dust += a.reward;
        fresh.push({ id: a.id, name: a.name, reward: a.reward, unlocks: a.unlocks, trainer: a.trainer });
        any = true;
      }
    }
    p.stats.owned = unlockedLines(p).length;
    if (!any) break;
  }
  p.stardust += dust;
  saveProfile(p);
  return { dust, fresh };
}

export interface GymReward { badge: boolean; stardust: number; newAchievements: RunReward['newAchievements'] }

/** 击败道馆馆主：第一次给徽章和星之沙，每次都判定道馆成就 */
export function winGym(p: Profile, outcome: GymOutcome): GymReward {
  const g = GYM_BY_ID[outcome.gym];
  const first = !!g && !p.badges[g.id];
  let dust = 0;
  if (g && first) {
    p.badges[g.id] = Date.now();
    dust += g.reward;
    p.stardust += g.reward;
  }
  const got = evalAchievements(p, NO_RUN, outcome);
  return { badge: first, stardust: dust + got.dust, newAchievements: got.fresh };
}
