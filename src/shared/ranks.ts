/**
 * 冒险与道馆的排行榜：客户端上报自己的最好成绩，服务器只留每位训练家最好的一次。
 * 冒险按难度 → 完成波次 → 通关用时排名（难度要通关上一档才解锁，所以难度高的一定走得更远）；
 * 道馆按徽章数 → 拿到最后一枚的时间排名。
 */
import { DIFFICULTY_IDS, type DifficultyId } from './difficulty';
import { TOTAL_WAVES } from './waves';

export type RankKind = 'adventure' | 'gym';

/** 一局冒险的成绩：time 为通关用时（秒，包括商店），players 为参加的人数 */
export interface RunRecord { difficulty: DifficultyId; waves: number; victory: boolean; time: number; dex: number; shiny?: boolean; players: number }

const isInt = (v: unknown, a: number, b: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;

export function cleanRun(raw: unknown): RunRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!DIFFICULTY_IDS.includes(r.difficulty as DifficultyId)) return null;
  if (!isInt(r.waves, 0, TOTAL_WAVES) || !isInt(r.time, 0, 36000) || !isInt(r.dex, 1, 151) || !isInt(r.players, 1, 4)) return null;
  const victory = r.victory === true && r.waves === TOTAL_WAVES;
  return { difficulty: r.difficulty as DifficultyId, waves: r.waves, victory, time: r.time, dex: r.dex, ...(r.shiny === true ? { shiny: true } : {}), players: r.players };
}

/** 小于 0：a 比 b 好 */
export function compareRuns(a: RunRecord, b: RunRecord): number {
  return DIFFICULTY_IDS.indexOf(b.difficulty) - DIFFICULTY_IDS.indexOf(a.difficulty)
    || b.waves - a.waves
    || Number(b.victory) - Number(a.victory)
    || (a.victory ? a.time - b.time : 0);
}

export function betterRun(a: RunRecord | null | undefined, b: RunRecord | null | undefined): RunRecord | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareRuns(b, a) < 0 ? b : a;
}

/** 排行榜的一行：冒险用 run，道馆用 badges / at */
export interface RankRow {
  rank: number;
  name: string;
  dex: number;
  shiny?: boolean;
  you?: boolean;
  run?: RunRecord;
  badges?: number;
  /** 拿到最后一枚徽章的时间 */
  at?: number;
}
