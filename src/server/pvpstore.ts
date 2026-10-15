/**
 * 对战数据的存储：训练家（积分、战绩、冒险榜与道馆榜成绩）和 AI 构筑池。
 * 服务器启动时全部读进内存，之后只把改动过的记录写回去（PvpService 每 5 秒最多写一次）。
 * 配置了 Supabase 时存在数据库里（重新部署也不会丢）；没有配置时存在 JSON 文件里（本地开发、测试）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PvpHistory } from '../shared/protocol';
import type { SavedBuild } from '../shared/pvp/build';
import type { PvpMode } from '../shared/pvp/sim';
import type { RunRecord } from '../shared/ranks';
import type { Supabase } from './supabase';

export interface ModeRec { rating: number; best: number; wins: number; losses: number; draws: number; streak: number; games: number; dex: number; shiny?: boolean }
/** 道馆：徽章数，at 为拿到最后一枚的时间 */
export interface GymRec { badges: number; at: number; dex: number; shiny?: boolean }
export interface StoredPlayer {
  pid: string; hash: string; name: string; created: number; last: number; modes: Partial<Record<PvpMode, ModeRec>>; history: PvpHistory[];
  /** 冒险的最好成绩与达成时间 */
  run?: RunRecord & { at: number };
  gym?: GymRec;
}
/** 玩家用过的队伍（AI 训练家会用它们补位）；power 为平均每只的强度 */
export interface Ghost { id: string; pid: string; name: string; team: SavedBuild[]; meta: Record<string, number>; trainer?: string; rating: number; power: number; at: number }

export interface PvpData { players: StoredPlayer[]; ghosts: Ghost[] }
/** 这次要写回的改动；all 是内存里的全部数据（文件存储整份写） */
export interface PvpChanges { players: StoredPlayer[]; ghosts: Ghost[]; removedGhosts: string[]; all: PvpData }

export interface PvpStore {
  readonly name: string;
  load(): PvpData | Promise<PvpData>;
  /** 失败时抛出异常（PvpService 会把这些改动留到下次再写） */
  save(changes: PvpChanges): void | Promise<void>;
}

/** 同一位玩家的同一支队伍只记一份 */
export function ghostId(pid: string, team: SavedBuild[]): string {
  return crypto.createHash('sha1').update(`${pid}|${JSON.stringify(team)}`).digest('hex').slice(0, 24);
}

export class FilePvpStore implements PvpStore {
  readonly name: string;
  constructor(private file: string) { this.name = `文件 ${file}`; }

  load(): PvpData {
    if (!fs.existsSync(this.file)) return { players: [], ghosts: [] };
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<PvpData>;
    return { players: data.players ?? [], ghosts: data.ghosts ?? [] };
  }

  save(c: PvpChanges) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, ...c.all }));
    fs.renameSync(tmp, this.file);
  }
}

const iso = (ms: number) => new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString();
const ms = (v: unknown) => { const t = Date.parse(String(v)); return Number.isFinite(t) ? t : Date.now(); };
type Row = Record<string, unknown>;

export const playerRow = (p: StoredPlayer): Row => ({
  pid: p.pid, hash: p.hash, name: p.name, created: iso(p.created), last: iso(p.last),
  modes: p.modes ?? {}, history: p.history ?? [], run: p.run ?? null, gym: p.gym ?? null,
});
export const rowPlayer = (r: Row): StoredPlayer => ({
  pid: String(r.pid), hash: String(r.hash), name: String(r.name), created: ms(r.created), last: ms(r.last),
  modes: (r.modes ?? {}) as StoredPlayer['modes'], history: (r.history ?? []) as PvpHistory[],
  ...(r.run ? { run: r.run as StoredPlayer['run'] } : {}), ...(r.gym ? { gym: r.gym as GymRec } : {}),
});
export const ghostRow = (g: Ghost): Row => ({
  id: g.id, pid: g.pid, name: g.name, team: g.team, meta: g.meta ?? {}, trainer: g.trainer ?? null, rating: g.rating, power: g.power, at: iso(g.at),
});
export const rowGhost = (r: Row): Ghost => ({
  id: String(r.id), pid: String(r.pid), name: String(r.name), team: (r.team ?? []) as SavedBuild[], meta: (r.meta ?? {}) as Record<string, number>,
  ...(r.trainer ? { trainer: String(r.trainer) } : {}), rating: Number(r.rating), power: Number(r.power), at: ms(r.at),
});

/** Supabase 的数据库默认一次最多返回 1000 行 */
const PAGE = 1000;
const BATCH = 200;

export class SupabasePvpStore implements PvpStore {
  readonly name = 'Supabase';
  constructor(private sb: Supabase) {}

  private async all(table: string, order: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const r = await this.sb.rest<Row[]>(`/${table}?select=*&order=${order}&limit=${PAGE}&offset=${offset}`);
      if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`读取 ${table} 失败（${r.status}）：${JSON.stringify(r.data)}`);
      out.push(...r.data);
      if (r.data.length < PAGE) return out;
    }
  }

  async load(): Promise<PvpData> {
    const [players, ghosts] = await Promise.all([this.all('pvp_players', 'pid'), this.all('pvp_ghosts', 'at')]);
    return { players: players.map(rowPlayer), ghosts: ghosts.map(rowGhost) };
  }

  private async upsert(table: string, key: string, rows: Row[]) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = await this.sb.rest(`/${table}?on_conflict=${key}`, { method: 'POST', body: rows.slice(i, i + BATCH), prefer: 'resolution=merge-duplicates,return=minimal' });
      if (r.status >= 300) throw new Error(`写入 ${table} 失败（${r.status}）：${JSON.stringify(r.data)}`);
    }
  }

  async save(c: PvpChanges) {
    if (c.players.length) await this.upsert('pvp_players', 'pid', c.players.map(playerRow));
    if (c.ghosts.length) await this.upsert('pvp_ghosts', 'id', c.ghosts.map(ghostRow));
    for (let i = 0; i < c.removedGhosts.length; i += 100) {
      const ids = c.removedGhosts.slice(i, i + 100).filter((id) => /^[0-9a-f]+$/.test(id));
      if (!ids.length) continue;
      const r = await this.sb.rest(`/pvp_ghosts?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
      if (r.status >= 300) throw new Error(`删除 AI 构筑失败（${r.status}）：${JSON.stringify(r.data)}`);
    }
  }
}
