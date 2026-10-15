/**
 * 道馆挑战：左边是徽章盒和八个道馆（按顺序解锁），右边是选中道馆的馆主与台词、馆主的队伍、
 * 徽章奖励、道馆向导的建议，以及你的出战队伍（和对战场单挑的队伍是同一支）。
 */
import { GUIDE, GYMS, GYM_BY_ID, counters, gymOpen, nextGym, type GymDef } from '../../shared/gyms';
import { formOf } from '../../shared/pokemon';
import { teamLevel } from '../../shared/pvp/build';
import { gymTeam } from '../../shared/pvp/gym';
import { shinyName } from '../../shared/shiny';
import { fmtMod, type ModKey } from '../../shared/stats';
import { TYPE_NAME, type PType } from '../../shared/types';
import { sfx } from '../audio';
import { artFull } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { pvpTeamOf, saveProfile, type PartyMon, type Profile } from '../save';
import { h, tip } from './dom';
import { typeBadge } from './describe';
import { iconBtn } from './layout';
import { mount, portraitSlot } from './screens';

export interface GymActions {
  challenge(g: GymDef, team: PartyMon[]): void;
  /** 去对战场（调整队伍、排位） */
  pvp(): void;
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
  const el = uiIcon(g.badge.icon, scale, `uico badge-ico ${got ? '' : 'unearned'}`);
  return el;
}

export function gymScreen(root: HTMLElement, p: Profile, a: GymActions, sel?: string) {
  const g = (sel && GYM_BY_ID[sel]) || nextGym(p.badges) || GYMS[GYMS.length - 1];
  const re = (id: string) => { sfx('click'); gymScreen(root, p, a, id); };
  const count = badgeCount(p);

  const badgeCase = h('div', { class: 'gym-case', title: '徽章盒：点徽章查看道馆' }, GYMS.map((x) => {
    const got = !!p.badges[x.id];
    const el = h('button', { class: `gym-case-slot ${x === g ? 'on' : ''}`, onclick: () => re(x.id) }, badgeIcon(x, got, 2));
    tip(el, () => h('div', { class: 'info' }, h('b', null, `${x.badge.name}${got ? '' : '（未获得）'}`), h('div', { class: 'small muted' }, `${x.name} · 馆主${x.leader.name}`), ...badgeBonus(x).map((s) => h('div', { class: 'small pos' }, s))));
    return el;
  }));

  const list = h('div', { class: 'gym-list' }, GYMS.map((x) => {
    const got = !!p.badges[x.id];
    const open = gymOpen(p.badges, x);
    return h('button', { class: `gym-row ${x === g ? 'on' : ''} ${got ? 'got' : open ? 'open' : 'locked'}`, onclick: () => re(x.id) },
      h('span', { class: 'gym-no' }, x.no),
      open || got ? badgeIcon(x, got, 2) : uiIcon('lock', 2),
      h('span', { class: 'gym-row-name' }, h('b', null, x.name), h('small', { class: 'muted' }, ` 馆主${x.leader.name}`)),
      typeBadge(x.type),
      h('span', { class: 'gym-row-lv small' }, `Lv${x.leader.level}`),
      h('span', { class: `gym-row-state small ${got ? 'ok' : open ? 'gold' : 'muted'}` }, got ? '已获得' : open ? '可挑战' : '未解锁'),
    );
  }));

  const got = !!p.badges[g.id];
  const open = gymOpen(p.badges, g);
  const leaderTeam = gymTeam(g, 'leader');
  const juniorTeam = gymTeam(g, 'junior');
  const team = pvpTeamOf(p, 3);
  const beatJunior = !!p.gymJunior[g.id] || got;
  const prev = GYMS[g.no - 2];

  const hero = h('div', { class: 'gym-hero' },
    h('div', { class: 'gym-leader-art' }, artFull(g.leader.art, 2)),
    h('div', { class: 'gym-hero-body' },
      h('div', { class: 'gym-hero-name' }, h('b', null, g.leader.name), h('span', { class: 'small muted' }, ` ${g.leader.title}`)),
      h('div', { class: 'small' }, typeBadge(g.type), ` 擅长${TYPE_NAME[g.type]}系 · 推荐 Lv${g.leader.level}`),
      h('div', { class: 'gym-quote' }, `“${got ? g.leader.rematch : g.leader.intro}”`),
    ),
  );

  const monChip = (b: ReturnType<typeof gymTeam>[number]) => {
    const f = formOf(b.line, b.stage);
    const el = h('div', { class: 'gym-mon' }, portraitSlot(f.dex, 1, 'gym-mon-portrait'), h('span', { class: 'small' }, f.name), h('small', { class: 'muted' }, `Lv${b.level}`));
    tip(el, () => h('div', { class: 'info' }, h('b', null, `${f.name} Lv${b.level}`), h('div', null, ...f.types.map(typeBadge))));
    return el;
  };
  const teams = h('div', { class: 'gym-team' },
    h('div', { class: 'gym-team-row' }, h('span', { class: 'small muted gym-team-label' }, '馆主的队伍'), leaderTeam.map(monChip)),
    h('div', { class: 'gym-junior small' },
      h('span', { class: 'muted' }, `先要打败道馆训练家：${g.junior.title} ${g.junior.name}（${juniorTeam.map((b) => formOf(b.line, b.stage).name).join('、')} · Lv${g.junior.level}）`),
      beatJunior ? h('span', { class: 'ok' }, ' 已打败 ✓') : null,
    ),
  );

  const reward = h('div', { class: 'gym-reward' },
    badgeIcon(g, got, 3),
    h('div', { class: 'gym-reward-body' },
      h('div', null, h('b', { style: `color:${g.badge.color}` }, g.badge.name), h('span', { class: 'small muted' }, got ? ' 已获得 · 加成生效中' : ` 首次获得 · 星之沙 +${g.reward}`)),
      h('div', { class: 'small gym-bonus' }, badgeBonus(g).map((s) => h('span', { class: 'pos' }, s))),
    ),
  );

  const advice = h('div', { class: 'gym-advice small' },
    h('b', null, `${GUIDE.name}：`),
    `${g.leader.name}擅长${TYPE_NAME[g.type]}系，带上`, ...counters(g.type).map(typeBadge), '系的宝可梦会轻松很多！',
  );

  const lv = team.length ? teamLevel(team.map((m) => m.build)) : 0;
  const slots = Array.from({ length: 3 }, (_, i) => team[i] ?? null);
  const autoBtn = h('button', {
    class: `btn small pvp-auto ${p.pvpAuto ? 'on' : ''}`,
    onclick: () => { sfx('click'); p.pvpAuto = !p.pvpAuto; saveProfile(p); gymScreen(root, p, a, g.id); },
  }, uiIcon('robot', 2), h('span', null, p.pvpAuto ? '自动 开' : '自动 关'));
  tip(autoBtn, () => h('div', { class: 'info small' }, '开启后队长也交给 AI，整场观战；对战中按 T 随时切换。'));
  const goBtn = h('button', {
    class: 'btn gold big go gym-go', 'data-key': 'y', disabled: !open || !team.length,
    onclick: () => { if (open && team.length) { sfx('click'); a.challenge(g, team); } },
  }, got ? '再战馆主' : beatJunior ? '挑战馆主' : '挑战道馆', h('small', null, !open ? `先拿到${prev?.badge.name ?? ''}` : !team.length ? '背包里还没有宝可梦' : `队伍平均 Lv${lv}${lv < g.leader.level - 6 ? ' · 有点吃力' : ''}`));
  const you = h('div', { class: 'gym-you' },
    h('div', { class: 'gym-you-team' },
      h('span', { class: 'small muted' }, '你的队伍'),
      slots.map((m, i) => h('div', { class: `pvp-slot ${m ? '' : 'rental'}`, title: m ? `${shinyName(formOf(m.build.line, m.build.stage).name, m.build.shiny)} Lv${m.build.level}` : '背包不够三只时，AI 会借你一只比队伍平均低 2 级的宝可梦' },
        m ? portraitSlot(formOf(m.build.line, m.build.stage).dex, 1, 'pvp-slot-portrait', m.build.shiny) : h('div', { class: 'pvp-slot-q' }, '?'),
        h('div', { class: 'pvp-slot-label' }, i === 0 ? '队长' : m ? `Lv${m.build.level}` : '借用'))),
      h('div', { class: 'gym-you-btns' },
        team.length ? iconBtn('swap', '在对战场调整出战的三只', () => { sfx('click'); a.pvp(); }, { cls: 'small ghost', text: '调整队伍' })
          : h('button', { class: 'btn small', onclick: () => { sfx('click'); a.adventure(); } }, '去冒险'),
        autoBtn,
      ),
    ),
    goBtn,
  );

  mount(root, h('div', { class: 'box panel gym' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, uiIcon('badge_boulder', 3), h('h2', null, '道馆挑战'), h('span', { class: 'sub small' }, `徽章 ${count} / ${GYMS.length} · 加成在冒险和对战中永久生效`)),
      h('div', { class: 'row' },
        iconBtn('sword', '去对战场和其他训练家排位', () => { sfx('click'); a.pvp(); }, { cls: 'ghost small', text: '对战场' }),
        iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' }),
      ),
    ),
    h('div', { class: 'gym-grid' },
      h('div', { class: 'gym-left' }, badgeCase, list),
      h('div', { class: `gym-detail ${open ? '' : 'locked'}` }, hero, teams, reward, advice, you),
    ),
  ), 'gym');
}
