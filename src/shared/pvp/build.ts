/**
 * 构筑：一局结束时宝可梦的状态（形态、等级、技能与技能等级、道具、升级强化），
 * 可以放进背包，用来和其他玩家对战。
 */
import { ITEMS, ITEM_IDS } from '../items';
import { LINES, LINE_IDS, formOf, maxStageByLevel, type LineId } from '../pokemon';
import type { Rng } from '../rng';
import { SKILLS, SKILL_MAX_LV } from '../skills';
import type { Mods } from '../stats';
import type { SimPlayer } from '../sim/entities';

export interface SavedBuild {
  line: LineId;
  stage: number;
  level: number;
  skills: { id: string; lv: number }[];
  items: [string, number][];
  levelMods: Partial<Record<keyof Mods, number>>;
}

/** 升级卡每级的数值（与 sim/player.ts 的升级卡一致），用来校验构筑是否合理 */
export const STAT_CARD_PER: Partial<Record<keyof Mods, number>> = {
  maxHp: 4, atk: 5, spa: 5, def: 5, spd: 5, spe: 5, crit: 3, haste: 5, dodge: 2, regen: 2, lifesteal: 2, range: 8, luck: 5, harvest: 4,
};

export const MAX_BUILD_LEVEL = 60;

/** AI 训练家的名字 */
export const NPC_NAMES = ['小智', '小霞', '小刚', '小茂', '娜姿', '夏伯', '阿桔', '阿柳', '科拿', '希巴', '菊子', '阿渡', '小遥', '小胜', '小光', '小建', '莉佳', '马志士', '坂木', '大吾'];

const isInt = (v: unknown, a: number, b: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;

/** 校验并清洗客户端提交的构筑；不合理时返回错误信息。 */
export function validateBuild(raw: unknown): SavedBuild | string {
  if (!raw || typeof raw !== 'object') return '构筑数据无效';
  const b = raw as Record<string, unknown>;
  const line = b.line as LineId;
  if (!LINE_IDS.includes(line)) return '未知的宝可梦';
  if (!isInt(b.level, 1, MAX_BUILD_LEVEL)) return '等级不合法';
  const level = b.level;
  const L = LINES[line];
  const maxStage = line === 'pikachu' ? 1 : maxStageByLevel(line, level);
  if (!isInt(b.stage, 0, Math.min(maxStage, L.forms.length - 1))) return '形态不合法';
  const skills: SavedBuild['skills'] = [];
  if (!Array.isArray(b.skills) || b.skills.length < 1 || b.skills.length > 6) return '技能数量不合法';
  for (const s of b.skills as { id?: unknown; lv?: unknown }[]) {
    if (!s || typeof s.id !== 'string' || !SKILLS[s.id] || !isInt(s.lv, 1, SKILL_MAX_LV)) return '技能不合法';
    if (skills.some((x) => x.id === s.id)) return '技能重复';
    skills.push({ id: s.id, lv: s.lv });
  }
  const items: [string, number][] = [];
  let total = 0;
  if (!Array.isArray(b.items) || b.items.length > 130) return '道具不合法';
  for (const e of b.items as unknown[]) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !ITEMS[e[0]] || !isInt(e[1], 1, ITEMS[e[0]].max ?? 40)) return '道具不合法';
    if (items.some(([id]) => id === e[0])) return '道具重复';
    total += e[1];
    items.push([e[0], e[1]]);
  }
  if (total > 200) return '道具太多';
  const levelMods: SavedBuild['levelMods'] = {};
  const lm = (b.levelMods ?? {}) as Record<string, unknown>;
  if (typeof lm !== 'object') return '强化数据不合法';
  for (const [k, v] of Object.entries(lm)) {
    const per = STAT_CARD_PER[k as keyof Mods];
    if (per === undefined || typeof v !== 'number' || v < 0 || v > per * 4 * Math.max(0, level - 1)) return '强化数值不合法';
    if (v > 0) levelMods[k as keyof Mods] = v;
  }
  return { line, stage: b.stage, level, skills, items, levelMods };
}

/** 从一局结束时的玩家状态生成构筑 */
export function buildOf(p: SimPlayer): SavedBuild {
  const levelMods: SavedBuild['levelMods'] = {};
  for (const k of Object.keys(STAT_CARD_PER) as (keyof Mods)[]) if (p.levelMods[k] > 0) levelMods[k] = p.levelMods[k];
  return {
    line: p.line,
    stage: p.stage,
    level: Math.min(MAX_BUILD_LEVEL, p.level),
    skills: p.skills.map((s) => ({ id: s.id, lv: s.lv })),
    items: Object.entries(p.items).filter(([, n]) => n > 0),
    levelMods,
  };
}

/** 构筑的大致强度（显示与机器人匹配用） */
export function buildPower(b: SavedBuild): number {
  const sk = b.skills.reduce((a, s) => a + SKILLS[s.id].tier * (1 + 0.35 * (s.lv - 1)), 0);
  const it = b.items.reduce((a, [id, n]) => a + ITEMS[id].tier * n, 0);
  return Math.round(b.level * 10 + sk * 12 + it * 5 + b.stage * 25);
}

export function buildDex(b: SavedBuild) {
  return formOf(b.line, b.stage).dex;
}

/** 生成一个指定等级附近的构筑（AI 训练家用） */
export function generateBuild(rng: Rng, level: number): SavedBuild {
  const lines: LineId[] = ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'charmander', 'squirtle', 'bulbasaur', 'mewtwo'];
  const line = rng.pick(lines);
  const L = LINES[line];
  level = Math.max(2, Math.min(40, Math.round(level)));
  const stage = line === 'pikachu' ? (level >= 12 ? 1 : 0) : maxStageByLevel(line, level);
  const form = formOf(line, stage);
  const pool = [...L.start, ...L.learnset.filter((e) => e.lv <= level).map((e) => e.skill)];
  const skills = pool.slice(-form.slots).map((id) => ({ id, lv: Math.min(SKILL_MAX_LV, 1 + Math.floor(rng.range(0, level / 9))) }));
  const items: [string, number][] = [];
  const nItems = Math.round(level * 0.9);
  const maxTier = level >= 18 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : 1;
  const candidates = ITEM_IDS.filter((id) => {
    const it = ITEMS[id];
    return it.tier <= maxTier && !it.special && !(it.mods?.slots) && (!it.only || it.only === line) && !((it.mods?.enemies ?? 0) !== 0);
  });
  for (let i = 0; i < nItems; i++) {
    const id = rng.pick(candidates);
    const cur = items.find((x) => x[0] === id);
    const max = ITEMS[id].max ?? 30;
    if (cur) { if (cur[1] < max) cur[1]++; } else items.push([id, 1]);
  }
  const keys = Object.keys(STAT_CARD_PER) as (keyof Mods)[];
  const levelMods: SavedBuild['levelMods'] = {};
  for (let i = 1; i < level; i++) {
    const k = rng.pick(keys.filter((x) => x !== 'luck' && x !== 'harvest'));
    const tier = 1 + Math.floor(rng.range(0, Math.min(3, 1 + level / 8)));
    levelMods[k] = (levelMods[k] ?? 0) + (STAT_CARD_PER[k] ?? 0) * tier;
  }
  return { line, stage, level, skills, items, levelMods };
}
