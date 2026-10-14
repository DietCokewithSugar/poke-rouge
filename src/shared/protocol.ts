import { FX_INDEX } from './skills';
import type { DifficultyId } from './difficulty';
import type { LineId } from './pokemon';
import type { RunSummary } from './meta';
import type { Command, Ev, GameSim, MeState, PublicState } from './sim/game';
import type { SavedBuild } from './pvp/build';
import type { PvpMatchResult, PvpMode } from './pvp/sim';
import { formOf } from './pokemon';

export const PROTOCOL_VERSION = 3;
export const MAX_PLAYERS = 4;

// ---------------------------------------------------------------- 对战

export interface PvpRecord { mode: PvpMode; rating: number; best: number; wins: number; losses: number; draws: number; streak: number; games: number; rank: number }
export interface PvpBoardRow { rank: number; name: string; rating: number; wins: number; losses: number; draws: number; streak: number; dex: number; you?: boolean }
export interface PvpHistory { at: number; mode: PvpMode; result: 'win' | 'loss' | 'draw'; delta: number; dex: number; opp: string }
export interface PvpRatingChange { mode: PvpMode; before: number; after: number; delta: number; record: PvpRecord }
export interface PvpSeatInfo { id: number; name: string; team: number; bot: boolean; rating: number; line: LineId; dex: number; level: number }

export interface LobbyPlayer { id: number; name: string; line: LineId | null; ready: boolean; host: boolean }

/** 匹配大厅里展示的房间信息 */
export interface RoomInfo {
  code: string;
  host: string;
  players: { name: string; line: LineId | null }[];
  max: number;
  inGame: boolean;
  wave: number;
  difficulty: DifficultyId;
}

export interface ServerStats { online: number; playing: number; rooms: number; pvpQueue?: number; pvpPlaying?: number }

export interface MeDyn { hp: number; maxHp: number; xp: number; money: number; down: boolean; speed: number; cds: number[] }

export interface BoardEntry { id: number; name: string; line: LineId; dex: number; level: number; kills: number; damage: number; taken: number; revives: number }

export type C2S =
  | { t: 'create'; name: string; meta: Record<string, number>; v: number; public?: boolean }
  | { t: 'join'; code: string; name: string; meta: Record<string, number>; v: number }
  | { t: 'pick'; line: LineId }
  | { t: 'ready'; on: boolean }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'pause'; on: boolean }
  | { t: 'difficulty'; id: DifficultyId }
  | { t: 'visibility'; public: boolean }
  | { t: 'browse'; on: boolean }
  | { t: 'stats' }
  | { t: 'debug'; cmd: 'down' | 'endWave' | 'xp' }
  | { t: 'pos'; x: number; y: number; m: 0 | 1; d: number }
  /** 客户端画面能看到的世界范围（宽高，世界像素），服务器据此裁剪快照 */
  | { t: 'view'; w: number; h: number }
  | { t: 'ping'; at: number }
  | { t: 'pvpQueue'; mode: PvpMode; build: SavedBuild; name: string; meta: Record<string, number>; v: number; pid: string; secret: string }
  | { t: 'pvpCancel' }
  | { t: 'pvpBoard'; mode: PvpMode; pid?: string; secret?: string }
  | Command;

export type S2C =
  | { t: 'joined'; code: string; you: number; solo: boolean }
  | { t: 'error'; msg: string; fatal?: boolean }
  | { t: 'lobby'; code: string; players: LobbyPlayer[]; inGame: boolean; difficulty: DifficultyId; public: boolean }
  | { t: 'rooms'; stats: ServerStats; rooms: RoomInfo[] }
  | { t: 'stats'; stats: ServerStats }
  | { t: 'left' }
  | { t: 'start'; w: number; h: number; players: { id: number; name: string; line: LineId }[]; pvp?: { mode: PvpMode; seats: PvpSeatInfo[] } }
  | { t: 'ev'; e: Ev[] }
  | { t: 'st'; s: PublicState }
  | { t: 'me'; s: MeState }
  /** 波次进行中只发变化频繁的字段（HP、经验、金钱、冷却……），其它没变就不重发整份状态 */
  | { t: 'md'; s: MeDyn }
  | { t: 'paused'; on: boolean }
  | { t: 'end'; victory: boolean; summary: RunSummary | null; board: BoardEntry[] }
  | { t: 'pong'; at: number }
  | { t: 'cmdErr'; msg: string }
  | { t: 'pvpQueued'; mode: PvpMode; wait: number; range: number; searching: number; botIn: number }
  | { t: 'pvpCancelled' }
  | { t: 'pvpBoard'; mode: PvpMode; rows: PvpBoardRow[]; me: PvpRecord | null; players: number; history: PvpHistory[] }
  | { t: 'pvpEnd'; result: PvpMatchResult; you: number; rating: PvpRatingChange | null };

// ---------------------------------------------------------------- 二进制快照

export const PHASES = ['wave', 'inter', 'over', 'won'] as const;

export interface SnapPlayer { id: number; x: number; y: number; hp: number; maxHp: number; flags: number; dex: number; dir: number; revive: number; shield: number }
export interface SnapEnemy { id: number; kind: number; x: number; y: number; hp: number; flags: number; dir: number }
export interface SnapProj { id: number; fx: number; x: number; y: number; ang: number; r: number; enemy: boolean }
export interface SnapZone { id: number; fx: number; x: number; y: number; r: number; life: number }
export interface Snapshot { tick: number; phase: number; players: SnapPlayer[]; enemies: SnapEnemy[]; projs: SnapProj[]; zones: SnapZone[] }

const TAU = Math.PI * 2;
const angToByte = (a: number) => ((Math.round((a / TAU) * 256) % 256) + 256) % 256;
export const byteToAng = (b: number) => (b / 256) * TAU;
const q = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));

/** 某位玩家视野附近的矩形（世界坐标）；快照和特效事件只发这个范围里的东西 */
export interface ViewBox { x0: number; y0: number; x1: number; y1: number }

export const inBox = (b: ViewBox | null | undefined, x: number, y: number, pad = 0) =>
  !b || (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad);

export function encodeSnapshot(sim: GameSim, tick: number, box?: ViewBox | null): ArrayBuffer {
  const ps = sim.players;
  const es = sim.enemies.filter((e) => !e.dead && inBox(box, e.x, e.y, e.r));
  const pAll = box ? sim.projs.filter((p) => inBox(box, p.x, p.y, 8)) : sim.projs;
  const prs = pAll.length > 700 ? pAll.slice(-700) : pAll;
  const zs = box ? sim.zones.filter((z) => inBox(box, z.x, z.y, z.r)) : sim.zones;
  const size = 1 + 4 + 1 + 1 + 2 + 2 + 2 + ps.length * 15 + es.length * 10 + prs.length * 10 + zs.length * 9;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, 1); o += 1;
  v.setUint32(o, tick, true); o += 4;
  v.setUint8(o, PHASES.indexOf(sim.phase)); o += 1;
  v.setUint8(o, ps.length); o += 1;
  v.setUint16(o, es.length, true); o += 2;
  v.setUint16(o, prs.length, true); o += 2;
  v.setUint16(o, zs.length, true); o += 2;
  for (const p of ps) {
    let f = 0;
    if (p.down) f |= 1;
    if (p.invuln > 0) f |= 2;
    if (p.shield > 0) f |= 4;
    if (p.moving) f |= 8;
    if (p.buffT > 0) f |= 16;
    if (p.slowT > 0) f |= 32;
    v.setUint8(o, p.id); o += 1;
    v.setInt16(o, q(p.x), true); o += 2;
    v.setInt16(o, q(p.y), true); o += 2;
    v.setUint16(o, Math.max(0, Math.ceil(p.hp)), true); o += 2;
    v.setUint16(o, p.d.maxHp, true); o += 2;
    v.setUint8(o, f); o += 1;
    v.setUint8(o, formOf(p.line, p.stage).dex); o += 1;
    v.setUint8(o, angToByte(p.dir)); o += 1;
    v.setUint8(o, Math.min(255, Math.round(p.revive * 255))); o += 1;
    v.setUint16(o, Math.min(65535, Math.round(p.shield)), true); o += 2;
  }
  for (const e of es) {
    let f = 0;
    const st = e.st;
    if (e.hidden) f |= 1;
    if (st.burn > 0) f |= 2;
    if (st.poison > 0 || st.leech > 0) f |= 4;
    if (st.para > 0) f |= 8;
    if (st.freeze > 0 || st.stun > 0) f |= 16;
    if (st.slow > 0) f |= 32;
    if ((e.def.ai === 'charge' || e.def.ai === 'elite_beedrill' || e.def.ai === 'bomber') && e.ai.state === 1) f |= 64;
    if (e.def.ai === 'boss_snorlax' && e.ai.state === 3) f |= 128;
    v.setUint16(o, e.id, true); o += 2;
    v.setUint8(o, e.kind); o += 1;
    v.setInt16(o, q(e.x), true); o += 2;
    v.setInt16(o, q(e.y), true); o += 2;
    v.setUint8(o, Math.max(0, Math.min(255, Math.ceil((e.hp / e.maxHp) * 255)))); o += 1;
    v.setUint8(o, f); o += 1;
    v.setUint8(o, angToByte(e.dir)); o += 1;
  }
  for (const p of prs) {
    v.setUint16(o, p.id, true); o += 2;
    v.setUint8(o, FX_INDEX[p.fx] ?? 0); o += 1;
    v.setInt16(o, q(p.x), true); o += 2;
    v.setInt16(o, q(p.y), true); o += 2;
    v.setUint8(o, angToByte(p.orbit ? p.orbit.ang : Math.atan2(p.vy, p.vx))); o += 1;
    v.setUint8(o, Math.min(255, Math.round(p.r))); o += 1;
    v.setUint8(o, p.owner < 0 ? 1 : 0); o += 1;
  }
  for (const z of zs) {
    v.setUint16(o, z.id, true); o += 2;
    v.setUint8(o, FX_INDEX[z.fx] ?? 0); o += 1;
    v.setInt16(o, Math.round(z.x), true); o += 2;
    v.setInt16(o, Math.round(z.y), true); o += 2;
    v.setUint8(o, Math.min(255, Math.round(z.r))); o += 1;
    v.setUint8(o, Math.max(0, Math.min(255, Math.round((z.life / z.maxLife) * 255)))); o += 1;
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  let o = 1;
  const tick = v.getUint32(o, true); o += 4;
  const phase = v.getUint8(o); o += 1;
  const np = v.getUint8(o); o += 1;
  const ne = v.getUint16(o, true); o += 2;
  const npr = v.getUint16(o, true); o += 2;
  const nz = v.getUint16(o, true); o += 2;
  const players: SnapPlayer[] = [];
  for (let i = 0; i < np; i++) {
    players.push({
      id: v.getUint8(o),
      x: v.getInt16(o + 1, true) / 4,
      y: v.getInt16(o + 3, true) / 4,
      hp: v.getUint16(o + 5, true),
      maxHp: v.getUint16(o + 7, true),
      flags: v.getUint8(o + 9),
      dex: v.getUint8(o + 10),
      dir: byteToAng(v.getUint8(o + 11)),
      revive: v.getUint8(o + 12) / 255,
      shield: v.getUint16(o + 13, true),
    });
    o += 15;
  }
  const enemies: SnapEnemy[] = [];
  for (let i = 0; i < ne; i++) {
    enemies.push({
      id: v.getUint16(o, true),
      kind: v.getUint8(o + 2),
      x: v.getInt16(o + 3, true) / 4,
      y: v.getInt16(o + 5, true) / 4,
      hp: v.getUint8(o + 7) / 255,
      flags: v.getUint8(o + 8),
      dir: byteToAng(v.getUint8(o + 9)),
    });
    o += 10;
  }
  const projs: SnapProj[] = [];
  for (let i = 0; i < npr; i++) {
    projs.push({
      id: v.getUint16(o, true),
      fx: v.getUint8(o + 2),
      x: v.getInt16(o + 3, true) / 4,
      y: v.getInt16(o + 5, true) / 4,
      ang: byteToAng(v.getUint8(o + 7)),
      r: v.getUint8(o + 8),
      enemy: v.getUint8(o + 9) === 1,
    });
    o += 10;
  }
  const zones: SnapZone[] = [];
  for (let i = 0; i < nz; i++) {
    zones.push({
      id: v.getUint16(o, true),
      fx: v.getUint8(o + 2),
      x: v.getInt16(o + 3, true),
      y: v.getInt16(o + 5, true),
      r: v.getUint8(o + 7),
      life: v.getUint8(o + 8) / 255,
    });
    o += 9;
  }
  return { tick, phase, players, enemies, projs, zones };
}
