/**
 * 道馆对战：馆主与道馆训练家的队伍。同一个道馆每次的队伍都一样（固定的随机种子），
 * 输了可以研究对策再来。对战本身就是单挑模式（三只同时上场）的练习赛。
 */
import type { GymDef } from '../gyms';
import { Rng } from '../rng';
import { buildFor, teamLevel, type SavedBuild } from './build';

const seedOf = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

export type GymStage = 'junior' | 'leader';

export function gymTeam(g: GymDef, who: GymStage): SavedBuild[] {
  const t = g[who];
  const rng = new Rng(seedOf(`${g.id}:${who}`));
  return t.team.map((line) => buildFor(rng, line, t.level));
}

/** 队伍平均等级比馆主低 3 级以上（成就「以弱胜强」） */
export function isUnderdog(team: SavedBuild[], g: GymDef) {
  return teamLevel(team) <= g.leader.level - 3;
}
