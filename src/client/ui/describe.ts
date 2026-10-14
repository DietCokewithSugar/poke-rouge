import { GROUP_NAME, ITEMS } from '../../shared/items';
import { LINES, type LineId } from '../../shared/pokemon';
import { CAT_NAME, SKILLS, TIER_COLOR, TIER_NAME, skillLevelCd, skillLevelDmg } from '../../shared/skills';
import { MOD_LABEL, fmtMod, type ModKey } from '../../shared/stats';
import { TYPE_COLOR, TYPE_NAME, type PType } from '../../shared/types';
import { iconImg } from '../gfx/icons';
import { h } from './dom';

export function typeBadge(t: PType) {
  return h('span', { class: 'type', style: `background:${TYPE_COLOR[t]}` }, TYPE_NAME[t]);
}

export function tierBadge(tier: number) {
  return h('span', { class: 'tier', style: `color:${TIER_COLOR[tier]}` }, TIER_NAME[tier]);
}

const PATTERN_NAME: Record<string, string> = {
  proj: '弹体', melee: '近身', beam: '光束', nova: '范围', chain: '连锁', strike: '定点', orbit: '环绕', zone: '区域', heal: '回复', shield: '护盾', buff: '强化',
};

export function skillIcon(id: string, lv = 1, small = false) {
  const s = SKILLS[id];
  return h('div', { class: `skill-ico${small ? ' small' : ''}`, style: `--tc:${TYPE_COLOR[s.type]}` },
    h('span', null, s.name.slice(0, small ? 1 : 2)),
    lv > 1 ? h('i', null, `+${lv - 1}`) : null,
  );
}

export function skillInfo(id: string, lv = 1, line?: LineId) {
  const s = SKILLS[id];
  const native = line ? LINES[line].start.includes(id) || LINES[line].learnset.some((e) => e.skill === id) : true;
  return h('div', { class: 'info' },
    h('div', { class: 'info-head' }, h('b', null, s.name, lv > 1 ? ` +${lv - 1}` : ''), typeBadge(s.type), tierBadge(s.tier)),
    h('div', { class: 'muted small' }, `${CAT_NAME[s.cat]} · ${PATTERN_NAME[s.pattern]}${!native ? ' · 外来技能' : ''}`),
    s.power > 0 ? h('div', { class: 'small' }, `威力 ${Math.round(s.power * skillLevelDmg(lv))}`, ` · 冷却 ${(s.cd * skillLevelCd(lv)).toFixed(1)} 秒`, s.range ? ` · 射程 ${s.range}` : '') : h('div', { class: 'small' }, `冷却 ${(s.cd * skillLevelCd(lv)).toFixed(1)} 秒`),
    h('div', { class: 'desc' }, s.desc),
    s.cat === 'phys' ? h('div', { class: 'muted small' }, '受「物攻」加成') : s.cat === 'spec' ? h('div', { class: 'muted small' }, '受「特攻」加成') : null,
  );
}

export function itemLines(id: string): string[] {
  const it = ITEMS[id];
  const out: string[] = [];
  if (it.mods) for (const [k, v] of Object.entries(it.mods)) if (k !== 'slots' && v) out.push(fmtMod(k as ModKey, v));
  if (it.mods?.slots) out.push(`技能栏 ${it.mods.slots > 0 ? '+' : ''}${it.mods.slots}`);
  if (it.typeMods) for (const [t, v] of Object.entries(it.typeMods)) out.push(`${TYPE_NAME[t as PType]}系技能伤害 +${v}%`);
  if (it.desc) out.push(it.desc);
  if (it.max) out.push(`最多持有 ${it.max} 个`);
  return out;
}

export function itemInfo(id: string, count = 0) {
  const it = ITEMS[id];
  return h('div', { class: 'info' },
    h('div', { class: 'info-head' }, iconImg(it.icon, 2), h('b', null, it.name, count > 1 ? ` ×${count}` : ''), tierBadge(it.tier)),
    h('div', { class: 'muted small' }, GROUP_NAME[it.group]),
    ...itemLines(id).map((l) => h('div', { class: l.includes('-') && !l.includes('技能栏') ? 'neg' : 'pos' }, l)),
  );
}

export const STAT_ROWS: [string, string, (v: number) => string][] = [
  ['maxHp', '最大HP', (v) => String(v)],
  ['atk', '物攻', (v) => String(v)],
  ['def', '物防', (v) => String(v)],
  ['spa', '特攻', (v) => String(v)],
  ['spd', '特防', (v) => String(v)],
  ['spe', '速度', (v) => String(v)],
  ['haste', '技能急速', (v) => `${v}%`],
  ['crit', '暴击率', (v) => `${v}%`],
  ['range', '技能范围', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['dodge', '闪避', (v) => `${v}%`],
  ['regen', '生命回复', (v) => String(v)],
  ['lifesteal', '吸血', (v) => `${v}%`],
  ['dmg', '全伤害', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['dmgMinion', '对小怪', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['dmgBoss', '对精英/首领', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['thorns', '反伤', (v) => String(v)],
  ['luck', '幸运', (v) => String(v)],
  ['harvest', '收获', (v) => String(v)],
  ['xp', '经验获取', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['money', '金钱获取', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  ['physTaken', '物理承伤', (v) => `${v}%`],
  ['specTaken', '特殊承伤', (v) => `${v}%`],
  ['moveSpeed', '移动速度', (v) => String(v)],
  ['enemies', '敌人数量', (v) => `${v >= 0 ? '+' : ''}${v}%`],
];

export function statCardText(stat: ModKey, amount: number) {
  return fmtMod(stat, amount).replace(MOD_LABEL[stat], `${MOD_LABEL[stat]}`);
}

export const STAT_LABEL_6 = ['HP', '物攻', '物防', '特攻', '特防', '速度'];
