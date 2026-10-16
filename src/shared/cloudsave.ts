/**
 * 云存档里有什么、两份进度要不要让玩家选。
 * 画面设置（音量、界面缩放、帧率、画质、滤镜）不在这里，每台设备各自保存。
 * 比较时按字段名排序，避免数据库把 JSON 的字段顺序打乱后被当成两份不同的进度。
 */

/** 会同步到云端的字段（不含 settings） */
export const CLOUD_KEYS = [
  'name', 'setup', 'trainer', 'trainers', 'partner', 'partnerShiny', 'owned', 'shiny',
  'stardust', 'upgrades', 'achievements', 'stats', 'lastDifficulty', 'seenEnemies',
  'party', 'pvpId', 'pvpBest', 'bestRun', 'pvpMode', 'pvpPick', 'pvpTeam', 'pvpAuto',
  'autoAssist', 'badges', 'masterBadges', 'gymJunior', 'gymLog', 'guide', 'townPos',
] as const;

export interface SaveSummary {
  name: string;
  trainer: string;
  stardust: number;
  badges: number;
  party: number;
  owned: number;
  shinies: number;
  runs: number;
  pvpBest: number;
}

export interface SyncMeta { userId: string; rev: number; key: string }

export type SyncPlan =
  | { do: 'keep'; rev: number }
  | { do: 'upload'; baseRev: number }
  /** 云端是空的，但这台设备上的进度属于另一个账号：先问要不要传上去 */
  | { do: 'ask-upload' }
  | { do: 'download' }
  | { do: 'ask' };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** 从存档里取出要上传的部分 */
export function cloudBlob(data: unknown): Record<string, unknown> {
  const p = obj(data);
  const out: Record<string, unknown> = {};
  for (const k of CLOUD_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

/** 字段顺序固定的 JSON，用来判断两份进度是不是同一份 */
export function fingerprint(data: unknown): string {
  return stable(cloudBlob(data));
}

function stable(v: unknown): string {
  if (v === undefined || v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => stable(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

/** 这台设备上有没有值得保留的进度（只改过音量不算） */
export function hasProgress(data: unknown): boolean {
  const p = obj(data);
  const stats = obj(p.stats);
  const gym = obj(p.gymLog);
  const tried = Object.values(gym).some((g) => num(obj(g).tries) > 0);
  return p.setup === true || num(stats.runs) > 0 || num(p.stardust) > 0 || arr(p.party).length > 0
    || arr(p.owned).length > 0 || arr(p.shiny).length > 0 || arr(p.trainers).length > 0
    || Object.keys(obj(p.upgrades)).length > 0 || Object.keys(obj(p.achievements)).length > 0
    || Object.keys(obj(p.badges)).length > 0 || num(p.pvpBest) > 0
    || (p.bestRun != null && typeof p.bestRun === 'object') || tried;
}

/** 给冲突选择用的几行摘要 */
export function summarize(data: unknown): SaveSummary {
  const p = obj(data);
  const stats = obj(p.stats);
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '训练家',
    trainer: typeof p.trainer === 'string' ? p.trainer : '',
    stardust: Math.max(0, Math.floor(num(p.stardust))),
    badges: Object.keys(obj(p.badges)).length,
    party: arr(p.party).length,
    owned: arr(p.owned).length,
    shinies: arr(p.shiny).length,
    runs: Math.max(0, Math.floor(num(stats.runs))),
    pvpBest: Math.max(0, Math.floor(num(p.pvpBest))),
  };
}

/**
 * 登录后或打开游戏时，决定本机和云端谁说了算。
 * 云端是空的：有本机进度就传上去（属于另一个账号的原样副本要先问）。
 * 两边一样：什么都不用做。
 * 这台设备从上次同步后没改过：直接用云端（别的设备保存了更新的进度）。
 * 两边都改过：让玩家选。
 */
export function planSync(o: { userId: string; local: unknown; cloud: { rev: number; data: unknown } | null; synced: SyncMeta | null }): SyncPlan {
  const localKey = fingerprint(o.local);
  const localHas = hasProgress(o.local);
  if (!o.cloud) {
    if (!localHas) return { do: 'keep', rev: 0 };
    if (o.synced && o.synced.userId !== o.userId && o.synced.key === localKey) return { do: 'ask-upload' };
    return { do: 'upload', baseRev: 0 };
  }
  const cloudKey = fingerprint(o.cloud.data);
  if (cloudKey === localKey) return { do: 'keep', rev: o.cloud.rev };
  // 和上次记下的进度一模一样（包括上一个账号留在这台设备上的副本）：这台设备没有新改动，用云端
  const dirty = !o.synced || o.synced.key !== localKey;
  if (!localHas || !dirty) return { do: 'download' };
  return { do: 'ask' };
}
