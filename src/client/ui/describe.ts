import { GROUP_NAME, ITEMS } from '../../shared/items';
import { isNative, type LineId } from '../../shared/pokemon';
import { SHINY_MAX, SHINY_MAX_ODDS } from '../../shared/shiny';
import { CAT_NAME, SKILLS, TIER_COLOR, TIER_NAME, skillLevelCd, skillLevelDmg } from '../../shared/skills';
import type { SkillNums } from '../../shared/sim/combat';
import { MOD_LABEL, fmtMod, type ModKey } from '../../shared/stats';
import { TYPE_COLOR, TYPE_NAME, type PType } from '../../shared/types';
import { iconImg } from '../gfx/icons';
import { skillIconImg } from '../gfx/skillicons';
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

/** 技能图标：像素徽章，右下角是强化等级，右上角的小宝石表示技能等级（中级/高级/究极） */
export function skillIcon(id: string, lv = 1, small = false) {
  const s = SKILLS[id];
  return h('div', { class: `skill-ico tier${s?.tier ?? 1}${small ? ' small' : ''}` },
    skillIconImg(id, small ? 2 : 3),
    lv > 1 ? h('i', null, `+${lv - 1}`) : null,
  );
}

const sec = (v: number) => `${Number(v.toFixed(v < 10 ? 2 : 1))}`;

/** 技能的主要数值：有实际数值（局内）时用实际数值，没有时用技能本身的威力和冷却 */
export function skillHeadline(id: string, lv: number, n?: SkillNums): string {
  const s = SKILLS[id];
  const cd = n ? n.cd : s.cd * skillLevelCd(lv);
  if (n?.heal) return `回复 ${n.heal} HP · 冷却 ${sec(cd)} 秒`;
  if (n?.shield) return `护盾 ${n.shield} HP · 冷却 ${sec(cd)} 秒`;
  if (n?.dmg) return `伤害 ${n.dmg}${s.pattern === 'zone' ? ` / ${s.tick ?? 0.5} 秒` : ''} · 冷却 ${sec(cd)} 秒`;
  return s.power > 0 ? `威力 ${Math.round(s.power * skillLevelDmg(lv))} · 冷却 ${sec(cd)} 秒` : `冷却 ${sec(cd)} 秒`;
}

/** 射程、范围、数量、持续时间、暴击率这些次要的数值 */
function details(id: string, n: SkillNums): string {
  const s = SKILLS[id];
  const out: string[] = [];
  if (s.pattern === 'beam') out.push(`长度 ${n.range} · 宽度 ${n.width}`);
  else if (s.pattern !== 'melee' && s.pattern !== 'nova' && s.pattern !== 'heal') out.push(`射程 ${n.range}`);
  if (n.radius) out.push(`范围 ${n.radius}`);
  if (n.count && n.count > 1) out.push(s.pattern === 'proj' ? `${n.count} 发` : s.pattern === 'strike' ? `打击 ${n.count} 次` : s.pattern === 'orbit' ? `环绕 ${n.count} 个` : `连锁 ${n.count} 次`);
  if (n.dur) out.push(`持续 ${sec(n.dur)} 秒`);
  if (n.haste) out.push(`技能急速 +${n.haste}%`);
  if (n.spe) out.push(`速度 +${n.spe}`);
  if (n.crit !== undefined) out.push(`暴击率 ${n.crit}%`);
  return out.join(' · ');
}

/** 技能卡片的内容：图标、名字与等级、属性与级别、伤害与冷却（局内是实际数值）、简介 */
export function skillCardBody(id: string, lv: number, line?: LineId, nums?: SkillNums) {
  const s = SKILLS[id];
  const native = line ? isNative(line, id) : true;
  return h('div', { class: 'sk-card' },
    skillIcon(id, lv),
    h('div', { class: 'sk-card-body' },
      h('div', { class: 'sk-card-name' }, s.name, lv > 1 ? h('span', { class: 'gold' }, ` +${lv - 1}`) : null),
      h('div', { class: 'sk-card-tags' }, typeBadge(s.type), ' ', tierBadge(s.tier), !native ? h('span', { class: 'muted small' }, ' 外来') : null),
      h('div', { class: `small ${nums ? 'live' : 'muted'}` }, skillHeadline(id, lv, nums)),
      h('div', { class: 'small sk-card-desc' }, s.desc),
    ),
  );
}

/**
 * 技能说明；nums 是局内的实际数值（能力、道具、技能等级和脚下的场地都算进去），
 * 和基础数值不一样时把基础数值写在后面
 */
export function skillInfo(id: string, lv = 1, line?: LineId, nums?: SkillNums) {
  const s = SKILLS[id];
  const native = line ? isNative(line, id) : true;
  const baseCd = s.cd * skillLevelCd(lv);
  const base = nums && (Math.abs(nums.cd - baseCd) > 0.005 || s.power > 0)
    ? `基础${s.power > 0 ? `威力 ${Math.round(s.power * skillLevelDmg(lv))} · ` : ''}冷却 ${sec(baseCd)} 秒` : '';
  return h('div', { class: 'info' },
    h('div', { class: 'info-head' }, h('b', null, s.name, lv > 1 ? ` +${lv - 1}` : ''), typeBadge(s.type), tierBadge(s.tier)),
    h('div', { class: 'muted small' }, `${CAT_NAME[s.cat]} · ${PATTERN_NAME[s.pattern]}${!native ? ' · 外来技能' : ''}`),
    h('div', { class: nums ? 'live' : 'small' }, skillHeadline(id, lv, nums)),
    nums ? h('div', { class: 'small' }, details(id, nums)) : s.range ? h('div', { class: 'small' }, `射程 ${s.range}`) : null,
    h('div', { class: 'desc' }, s.desc),
    s.cat === 'phys' ? h('div', { class: 'muted small' }, '受「物攻」加成') : s.cat === 'spec' ? h('div', { class: 'muted small' }, '受「特攻」加成') : null,
    nums ? h('div', { class: 'muted small' }, `按你现在的能力、道具、技能等级和脚下的场地计算${base ? `（${base}）` : ''}`) : null,
  );
}

/** 局内某个技能（某个等级）现在的实际数值（不含脚下的场地，要算上时用 fieldNums） */
export const numsOf = (me: { nums?: Record<string, SkillNums> } | null | undefined, id: string, lv: number) => me?.nums?.[`${id}:${lv}`];

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
    it.mods?.shiny ? h('div', { class: 'muted small' }, `和研究所、训练家的加成加在一起，闪光宝可梦出现的几率最高 ${SHINY_MAX_ODDS}`) : null,
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
  // 全队的闪光几率：1/N（所有加成合计最高 1/800）
  ['shiny', '闪光几率', (v) => `1/${v}`],
];

/** 属性页上闪光几率那一格的说明；到上限时数值标成金色 */
export function shinyStatTip(v: number) {
  const max = v <= Math.round(1 / SHINY_MAX);
  return { max, text: `闪光宝可梦出现的几率：研究所、训练家和闪耀护符的加成加在一起，最高 ${SHINY_MAX_ODDS}${max ? '（已经到上限）' : ''}` };
}

export function statCardText(stat: ModKey, amount: number) {
  return fmtMod(stat, amount).replace(MOD_LABEL[stat], `${MOD_LABEL[stat]}`);
}

export const STAT_LABEL_6 = ['HP', '物攻', '物防', '特攻', '特防', '速度'];
