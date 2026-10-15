/**
 * 道馆挑战：围绕挑战前关心的三件事组织——① 对手是谁 ② 我的队伍能不能应对 ③ 现在能不能开始。
 * 左边是八个道馆（按顺序解锁）；馆主的完整台词点气泡用对话框看，徽章的详细加成和挑战记录放在提示里。
 */
import { GUIDE, GYMS, GYM_BY_ID, counters, gymOpen, nextGym, type GymDef } from '../../shared/gyms';
import { LINES, formOf } from '../../shared/pokemon';
import { teamLevel } from '../../shared/pvp/build';
import { gymTeam } from '../../shared/pvp/gym';
import { shinyName } from '../../shared/shiny';
import { fmtMod, type ModKey } from '../../shared/stats';
import { TYPE_NAME, rawEffectiveness, type PType } from '../../shared/types';
import { sfx } from '../audio';
import { artFull } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { pvpTeamOf, saveProfile, type PartyMon, type Profile } from '../save';
import { h, tip } from './dom';
import { typeBadge } from './describe';
import { talk } from './guide';
import { iconBtn } from './layout';
import { mount, portraitSlot } from './screens';

export interface GymActions {
  challenge(g: GymDef, team: PartyMon[]): void;
  /** 去对战场的背包调整出战的三只（调整完回到这个道馆） */
  team(g: GymDef): void;
  adventure(): void;
  back(): void;
}

/** 徽章的加成（一行一条） */
export function badgeBonus(g: GymDef): string[] {
  return [
    ...Object.entries(g.badge.mods).map(([k, v]) => fmtMod(k as ModKey, v ?? 0)),
    ...Object.entries(g.badge.typeMods).map(([t, v]) => `${TYPE_NAME[t as PType]}系技能伤害 +${v}%`),
  ];
}

export const badgeCount = (p: Profile) => Object.keys(p.badges).filter((id) => GYM_BY_ID[id]).length;

function badgeIcon(g: GymDef, got: boolean, scale: number) {
  return uiIcon(g.badge.icon, scale, `uico badge-ico ${got ? '' : 'unearned'}`);
}

/** 台词的第一句（气泡里只放一句，完整的点开看） */
function firstLine(text: string) {
  const m = text.match(/^.+?[！？。…!?]+/);
  return m && m[0].length < text.length ? `${m[0]}……` : text;
}

/** 这只宝可梦对道馆属性：本系属性克制馆主，或者被馆主的属性克制 */
function matchup(m: PartyMon, gymType: PType): 'good' | 'bad' | '' {
  const types = formOf(m.build.line, m.build.stage).types;
  if (types.some((t) => rawEffectiveness(t, [gymType]) > 1)) return 'good';
  if (rawEffectiveness(gymType, types) > 1) return 'bad';
  return '';
}

export function gymScreen(root: HTMLElement, p: Profile, a: GymActions, sel?: string) {
  const g = (sel && GYM_BY_ID[sel]) || nextGym(p.badges) || GYMS[GYMS.length - 1];
  const re = (id: string) => { sfx('click'); gymScreen(root, p, a, id); };
  const count = badgeCount(p);
  const got = !!p.badges[g.id];
  const open = gymOpen(p.badges, g);
  const leaderTeam = gymTeam(g, 'leader');
  const juniorTeam = gymTeam(g, 'junior');
  const team = pvpTeamOf(p, 3);
  const beatJunior = !!p.gymJunior[g.id] || got;
  const prev = GYMS[g.no - 2];
  const log = p.gymLog[g.id];
  const step = (n: number, title: string, tools: Node | null = null) =>
    h('div', { class: 'pvp-step-head' }, h('i', { class: 'step-no' }, n), h('b', null, title), tools);

  const list = h('div', { class: 'gym-list' }, GYMS.map((x) => {
    const xgot = !!p.badges[x.id];
    const xopen = gymOpen(p.badges, x);
    return h('button', { class: `gym-row ${x === g ? 'on' : ''} ${xgot ? 'got' : xopen ? 'open' : 'locked'}`, onclick: () => re(x.id) },
      h('span', { class: 'gym-no' }, x.no),
      xopen || xgot ? badgeIcon(x, xgot, 2) : uiIcon('lock', 2),
      h('span', { class: 'gym-row-name' }, h('b', null, x.name), h('small', { class: 'muted' }, ` ${x.leader.name}`)),
      typeBadge(x.type),
      h('span', { class: `gym-row-state small ${xgot ? 'ok' : xopen ? 'gold' : 'muted'}` }, xgot ? '已获得' : xopen ? '可挑战' : `Lv${x.leader.level}`),
    );
  }));

  // ① 对手是谁：馆主、属性、推荐等级、队伍；台词只放一句，点气泡看完整的对话
  const quote = got ? g.leader.rematch : g.leader.intro;
  const dialog = () => talk(root, {
    name: `${g.leader.title} · ${g.leader.name}`, art: g.leader.art, text: quote,
    buttons: [['好的', () => gymScreen(root, p, a, g.id), 'gold']],
  });
  const monChip = (b: ReturnType<typeof gymTeam>[number]) => {
    const f = formOf(b.line, b.stage);
    const el = h('div', { class: 'gym-mon' }, portraitSlot(f.dex, 1, 'gym-mon-portrait'), h('span', { class: 'small' }, f.name), h('small', { class: 'muted' }, `Lv${b.level}`));
    tip(el, () => h('div', { class: 'info' }, h('b', null, `${f.name} Lv${b.level}`), h('div', null, ...f.types.map(typeBadge))));
    return el;
  };
  const recordTip = h('span', { class: 'set-info', tabindex: 0, 'data-pad': '1' }, uiIcon('info', 1));
  tip(recordTip, () => h('div', { class: 'info small' },
    h('b', null, `${g.name}的挑战记录`),
    h('div', null, log ? `挑战 ${log.tries} 次 · 赢了 ${log.wins} 次` : '还没有挑战过'),
    h('div', null, `道馆训练家 ${g.junior.title} ${g.junior.name}（Lv${g.junior.level} · ${juniorTeam.map((b) => formOf(b.line, b.stage).name).join('、')}）：${beatJunior ? '已经打败' : '还没打败'}`),
    got ? h('div', { class: 'ok' }, `${new Date(p.badges[g.id]).toLocaleDateString('zh-CN')} 拿到了${g.badge.name}`) : null,
  ));
  const opponent = h('section', { class: 'pvp-step gym-opp' },
    step(1, '对手是谁', h('span', { class: 'small muted gym-step-sub' }, `${g.name}`, recordTip)),
    h('div', { class: 'gym-opp-body' },
      h('div', { class: 'gym-leader-art' }, artFull(g.leader.art, 2)),
      h('div', { class: 'gym-opp-info' },
        h('div', { class: 'gym-hero-name' }, h('b', null, g.leader.name), h('span', { class: 'small muted' }, ` ${g.leader.title}`)),
        h('div', { class: 'small' }, typeBadge(g.type), ` 擅长${TYPE_NAME[g.type]}系 · 推荐 Lv${g.leader.level}`),
        h('button', { class: 'gym-quote', title: '点一下看馆主说了什么', onclick: () => { sfx('click'); dialog(); } }, `“${firstLine(quote)}”`, h('span', { class: 'gym-quote-more' }, '▶')),
        h('div', { class: 'gym-team-row' }, leaderTeam.map(monChip)),
      ),
    ),
  );

  // ② 我的队伍能不能应对：等级够不够、属性克不克制
  const lv = team.length ? teamLevel(team.map((m) => m.build)) : 0;
  const gap = lv - g.leader.level;
  // 队长是背包里和跟随的伙伴同一只的构筑：背包里有宝可梦但没有它时，要先去背包设队长
  const noLeader = !team.length && p.party.length > 0;
  const partnerName = shinyName(LINES[p.partner]?.name ?? '伙伴', p.partnerShiny);
  const verdict = !team.length ? ['bad', noLeader ? `跟随的${partnerName}还没有对战构筑` : '背包里还没有宝可梦'] : gap >= 0 ? ['good', `等级足够（比推荐高 ${gap} 级）`] : gap >= -6 ? ['warn', `低了 ${-gap} 级，有点吃力`] : ['bad', `低了 ${-gap} 级，建议先去冒险练级`];
  const slots = Array.from({ length: 3 }, (_, i) => team[i] ?? null);
  const autoBtn = h('button', {
    class: `btn small pvp-auto ${p.pvpAuto ? 'on' : ''}`, role: 'switch', 'aria-checked': p.pvpAuto ? 'true' : 'false',
    onclick: () => { sfx('click'); p.pvpAuto = !p.pvpAuto; saveProfile(p); gymScreen(root, p, a, g.id); },
  }, uiIcon('robot', 2), h('span', null, p.pvpAuto ? '全自动：开' : '全自动：关'));
  tip(autoBtn, () => h('div', { class: 'info small' }, '开启后队长也交给 AI，整场观战；对战中按 T 随时切换。'));
  const yours = h('section', { class: 'pvp-step gym-yours' },
    step(2, '我的队伍能不能应对', h('div', { class: 'row tight pvp-step-tools' },
      p.party.length ? iconBtn('swap', '在对战场的背包里调整出战的三只', () => { sfx('click'); a.team(g); }, { cls: 'small', text: '调整队伍' }) : null,
      autoBtn)),
    h('div', { class: 'gym-yours-body' },
      h('div', { class: 'gym-slots' }, slots.map((m, i) => {
        if (!m) return h('div', { class: 'gym-slot rental', title: '背包不够三只时，AI 会借你一只比队伍平均低 2 级的宝可梦' }, h('div', { class: 'pvp-slot-q' }, '?'), h('small', { class: 'muted' }, team.length ? '借用' : '空'));
        const f = formOf(m.build.line, m.build.stage);
        const mu = matchup(m, g.type);
        return h('div', { class: `gym-slot ${i === 0 ? 'lead' : ''}`, title: `${shinyName(f.name, m.build.shiny)} Lv${m.build.level}` },
          portraitSlot(f.dex, 1, 'pvp-slot-portrait', m.build.shiny),
          h('small', null, i === 0 ? `队长 Lv${m.build.level}` : `Lv${m.build.level}`),
          h('i', { class: `gym-mu ${mu}` }, mu === 'good' ? '克制' : mu === 'bad' ? '被克制' : '普通'));
      })),
      h('div', { class: 'gym-verdict' },
        h('div', { class: `gym-level ${verdict[0]}` }, team.length ? `队伍平均 Lv${lv} · 推荐 Lv${g.leader.level}` : '还没有队伍', h('small', null, verdict[1])),
        h('div', { class: 'small gym-advice' }, h('b', null, `${GUIDE.name}：`), '带上', ...counters(g.type).map(typeBadge), '系的宝可梦会轻松很多'),
      ),
    ),
  );

  // ③ 现在能不能开始
  const reward = h('span', { class: 'gym-reward-line', tabindex: 0, 'data-pad': '1' }, badgeIcon(g, got, 3),
    h('span', { class: 'gym-reward-text' }, h('b', { style: `color:${g.badge.color}` }, g.badge.name, ' ', uiIcon('info', 1)), h('small', null, got ? '已获得 · 加成生效中' : `首次获得 · 星之沙 +${g.reward}`)));
  tip(reward, () => h('div', { class: 'info' },
    h('b', { style: `color:${g.badge.color}` }, g.badge.name), h('div', { class: 'small muted' }, '在冒险和对战中永久生效'),
    ...badgeBonus(g).map((s) => h('div', { class: 'small pos' }, s)),
  ));
  const target = beatJunior ? `馆主 ${g.leader.name}（Lv${g.leader.level}）` : `道馆训练家 ${g.junior.name}（Lv${g.junior.level}），赢了再挑战馆主`;
  const start = h('section', { class: 'pvp-step gym-start' },
    step(3, '开始挑战'),
    h('div', { class: 'gym-start-body' },
      team.length || !open
        ? h('button', {
          class: 'btn gold big go gym-go', 'data-key': 'y', disabled: !open || !team.length,
          onclick: () => { if (open && team.length) { sfx('click'); a.challenge(g, team); } },
        }, got ? '再战馆主' : beatJunior ? '挑战馆主' : '挑战道馆', h('small', null, open ? `对手：${target}` : `先拿到${prev?.badge.name ?? ''}才能挑战`))
        : noLeader
          ? h('button', { class: 'btn gold big go gym-go', 'data-key': 'y', onclick: () => { sfx('click'); a.team(g); } }, '先设一只队长', h('small', null, '在背包里把一只宝可梦设为队长，它会变成跟随的伙伴'))
          : h('button', { class: 'btn gold big go gym-go', 'data-key': 'y', onclick: () => { sfx('click'); a.adventure(); } }, '先去冒险', h('small', null, '冒险结束后把宝可梦放进背包，就能组队挑战道馆')),
      reward,
    ),
  );

  mount(root, h('div', { class: 'box panel gym' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, uiIcon('badge_boulder', 3), h('h2', null, '道馆挑战'), h('span', { class: 'sub small' }, `徽章 ${count} / ${GYMS.length}`)),
      iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' }),
    ),
    h('div', { class: 'gym-grid' },
      list,
      h('div', { class: `gym-detail ${open ? '' : 'locked'}` }, opponent, yours, start),
    ),
  ), 'gym');
}
