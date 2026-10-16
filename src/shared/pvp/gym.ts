/**
 * 道馆对战：馆主与道馆训练家的队伍。同一个道馆每次的队伍都一样（固定的随机种子），
 * 输了可以研究对策再来。对战本身就是单挑模式（三只同时上场）的练习赛。
 * 场上有道馆自己的局部属性场地：馆主那一半是馆主的主场，挑战者这一半是克制馆主的场地。
 */
import type { FieldId } from '../fields';
import { masterMeta, type GymDef } from '../gyms';
import { Rng } from '../rng';
import { buildFor, teamLevel, type SavedBuild } from './build';

const seedOf = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

/** junior 道馆训练家 · leader 馆主 · master 大师难度的馆主 */
export type GymStage = 'junior' | 'leader' | 'master';

/** 这一场的对手：名字、称号、立绘、等级和台词 */
export function gymFoe(g: GymDef, who: GymStage) {
  if (who !== 'master') return g[who];
  return { ...g.leader, ...g.master, title: `${g.leader.title}（大师）` };
}

export function gymTeam(g: GymDef, who: GymStage): SavedBuild[] {
  const t = gymFoe(g, who);
  const rng = new Rng(seedOf(`${g.id}:${who}`));
  return t.team.map((line) => buildFor(rng, line, t.level));
}

/** 对手宝可梦的研究所强化 */
export const gymMeta = (g: GymDef, who: GymStage) => (who === 'master' ? masterMeta(g) : g.meta);

/** 队伍平均等级比对手低 3 级以上（成就「以弱胜强」） */
export function isUnderdog(team: SavedBuild[], g: GymDef, who: GymStage = 'leader') {
  return teamLevel(team) <= gymFoe(g, who).level - 3;
}

/**
 * 道馆对战里的一块场地：side 长在哪一队的那一半（0 挑战者，1 馆主），size 占竞技场的比例。
 * 道馆训练家只有主场；大师难度的主场更大。
 */
export interface GymFieldPlan { kind: FieldId; side: 0 | 1; size: number }

export function gymFields(g: GymDef, who: GymStage): GymFieldPlan[] {
  const [home, counter] = g.fields;
  if (who === 'junior') return [{ kind: home, side: 1, size: 0.15 }];
  if (who === 'master') return [{ kind: home, side: 1, size: 0.26 }, { kind: counter, side: 0, size: 0.12 }];
  return [{ kind: home, side: 1, size: 0.2 }, { kind: counter, side: 0, size: 0.14 }];
}
