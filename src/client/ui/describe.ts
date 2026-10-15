import { GROUP_NAME, ITEMS } from '../../shared/items';
import { isNative, type LineId } from '../../shared/pokemon';
import { SHINY_MAX } from '../../shared/shiny';
import { CAT_NAME, SKILLS, TIER_COLOR, TIER_NAME, skillLevelCd, skillLevelDmg } from '../../shared/skills';
import { MOD_LABEL, fmtMod, type ModKey } from '../../shared/stats';
import { TYPE_COLOR, TYPE_NAME, type PType } from '../../shared/types';
import { iconImg } from '../gfx/icons';
import { skillIconImg } from '../gfx/skillicons';
import { h } from './dom';

/** 闪光几率的上限：「1/200」 */
const SHINY_ODDS_MAX = `1/${Math.round(1 / SHINY_MAX)}`;

export function typeBadge(t: PType) {
  return h('span', { class: 'type', style: `background:${TYPE_COLOR[t]}` }, TYPE_NAME[t]);
}

export function tierBadge(tier: number) {
  return h('span', { class: 'tier', style: `color:${TIER_COLOR[tier]}` }, TIER_NAME[tier]);
}

const PATTERN_NAME: Record<string, string> = {
  proj: '弹体', melee: '近身', beam: '光束', nova: '范围', chain: '连锁', strike: '定点', orbit: '环绕', zone: '区域', heal: '回复', shield: '护盾', buff: '强化',
};

/** 技能图标：像素徽章，右下角是强化等级，右上角的小宝石表示技能等级（中级/高级/究极） */
export function skillIcon(id: string, lv = 1, small = false) {
  const s = SKILLS[id];
  return h('div', { class: `skill-ico tier${s?.tier ?? 1}${small ? ' small' : ''}` },
    skillIconImg(id, small ? 2 : 3),
    lv > 1 ? h('i', null, `+${lv - 1}`) : null,
  );
}

/** 技能卡片的内容：图标、名字与等级、属性与级别、威力与冷却、简介 */
export function skillCardBody(id: string, lv: number, line?: LineId) {
  const s = SKILLS[id];
  const native = line ? isNative(line, id) : true;
  return h('div', { class: 'sk-card' },
    skillIcon(id, lv),
    h('div', { class: 'sk-card-body' },
      h('div', { class: 'sk-card-name' }, s.name, lv > 1 ? h('span', { class: 'gold' }, ` +${lv - 1}`) : null),
      h('div', { class: 'sk-card-tags' }, typeBadge(s.type), ' ', tierBadge(s.tier), !native ? h('span', { class: 'muted small' }, ' 外来') : null),
      h('div', { class: 'small muted' }, s.power > 0 ? `威力 ${Math.round(s.power * skillLevelDmg(lv))} · 冷却 ${(s.cd * skillLevelCd(lv)).toFixed(1)}s` : `${CAT_NAME[s.cat]} · 冷却 ${(s.cd * skillLevelCd(lv)).toFixed(1)}s`),
      h('div', { class: 'small sk-card-desc' }, s.desc),
    ),
  );
}

export function skillInfo(id: string, lv = 1, line?: LineId) {
  const s = SKILLS[id];
  const native = line ? isNative(line, id) : true;
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
  const add = (s: string) => { if (s && !out.includes(s)) out.push(s); };
  if (it.mods) for (const [k, v] of Object.entries(it.mods)) if (k !== 'slots' && v) add(fmtMod(k as ModKey, v));
  if (it.mods?.slots) add(`技能栏位 ${it.mods.slots > 0 ? '+' : ''}${it.mods.slots}`);
  if (it.typeMods) for (const [t, v] of Object.entries(it.typeMods)) add(`${TYPE_NAME[t as PType]}系技能伤害 +${v}%`);
  if (it.desc) add(it.desc);
  if (it.max) add(`最多持有 ${it.max} 个`);
  return out;
}

export function itemInfo(id: string, count = 0) {
  const it = ITEMS[id];
  return h('div', { class: 'info' },
    h('div', { class: 'info-head' }, iconImg(it.icon, 2), h('b', null, it.name, count > 1 ? ` ×${count}` : ''), tierBadge(it.tier)),
    h('div', { class: 'muted small' }, GROUP_NAME[it.group]),
    ...itemLines(id).map((l) => h('div', { class: /-\d/.test(l) ? 'neg' : 'pos' }, l)),
    it.mods?.shiny ? h('div', { class: 'muted small' }, `和研究所、训练家的加成加在一起，闪光宝可梦出现的几率最高 ${SHINY_ODDS_MAX}`) : null,
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
  ['recruit', '崇拜几率', (v) => `${v >= 0 ? '+' : ''}${v}%`],
  // 全队的闪光几率：1/N（所有加成合计最高 1/200）
  ['shiny', '闪光几率', (v) => `1/${v}`],
];

/** 属性页上闪光几率那一格的说明；到上限时数值标成金色 */
export function shinyStatTip(v: number) {
  const max = v <= Math.round(1 / SHINY_MAX);
  return { max, text: `闪光宝可梦出现的几率：研究所、训练家和闪耀护符的加成加在一起，最高 ${SHINY_ODDS_MAX}${max ? '（已经到上限）' : ''}` };
}

export function statCardText(stat: ModKey, amount: number) {
  return fmtMod(stat, amount).replace(MOD_LABEL[stat], `${MOD_LABEL[stat]}`);
}

export const STAT_LABEL_6 = ['HP', '物攻', '物防', '特攻', '特防', '速度'];
