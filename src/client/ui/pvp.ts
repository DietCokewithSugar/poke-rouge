/**
 * 对战相关界面：对战中心（选模式 → 确认阵容 → 开始对战；背包；排行榜）、放生、对战结算。
 */
import { DIFFICULTIES } from '../../shared/difficulty';
import { GYMS } from '../../shared/gyms';
import { ITEMS } from '../../shared/items';
import { LINES, formOf } from '../../shared/pokemon';
import type { PvpBoardRow, PvpHistory, PvpRatingChange, PvpSeatInfo, S2C } from '../../shared/protocol';
import type { RankKind, RankRow } from '../../shared/ranks';
import { shinyName } from '../../shared/shiny';
import { buildPower, type SavedBuild } from '../../shared/pvp/build';
import { START_RATING, tierOf } from '../../shared/pvp/rating';
import { PVP_MODES, PVP_MODE_IDS, RING_END, RING_START, type PvpMatchResult, type PvpMode, type PvpPlayerResult } from '../../shared/pvp/sim';
import type { GameSim } from '../../shared/sim/game';
import { createPlayerFromBuild } from '../../shared/sim/player';
import { SKILLS, TIER_COLOR } from '../../shared/skills';
import { TYPE_COLOR } from '../../shared/types';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { Animator } from '../gfx/sprites';
import { PARTY_BONUS_TIER, PARTY_LIMIT, partyMax, pvpTeamOf, saveProfile, type PartyMon, type Profile } from '../save';
import { clear, h, tip } from './dom';
import { itemInfo, skillIcon, skillInfo, typeBadge } from './describe';
import { mount, portraitSlot, tabs } from './screens';
import { confirmButton, iconBtn, pager } from './layout';
import { uiIcon } from '../gfx/uiicons';

const TEAM_COLOR = ['#5aa0ff', '#ff6a6a'];
const fmt = (n: number) => (n >= 100000 ? `${(n / 10000).toFixed(1)} 万` : Math.round(n).toLocaleString('zh-CN'));
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function formName(b: SavedBuild) { return shinyName(formOf(b.line, b.stage).name, b.shiny); }

function originText(m: PartyMon) {
  const D = DIFFICULTIES[m.from.difficulty];
  return `${D.name} · ${m.from.victory ? '通关' : `第 ${m.from.wavesCleared + 1} 波`}${m.from.players > 1 ? ' · 联机' : ''}`;
}

/** 构筑按当前的大木研究所强化计算出的数值 */
export function buildStats(b: SavedBuild, meta: Record<string, number>) {
  const p = createPlayerFromBuild({ w: 0, h: 0 } as unknown as GameSim, 0, '', b, meta);
  return p;
}

function tierBadge(rating: number, big = false) {
  const t = tierOf(rating).tier;
  return h('span', { class: `tier-badge ${big ? 'big' : ''}`, style: `--tc:${t.color}` }, iconImg(t.icon, big ? 3 : 2), h('b', null, t.name));
}

// ---------------------------------------------------------------- 背包卡片与详情

export function monCard(m: PartyMon, opts: { selected?: boolean; onClick?: () => void; action?: Node | null; badge?: string | null } = {}) {
  const b = m.build;
  const f = formOf(b.line, b.stage);
  const items = b.items.reduce((a, [, n]) => a + n, 0);
  const rec = m.pvp.wins + m.pvp.losses + m.pvp.draws ? `${m.pvp.wins} 胜 ${m.pvp.losses} 负` : '还没有对战';
  return h('div', { class: `mon-card ${opts.selected ? 'on' : ''}${b.shiny ? ' shiny' : ''}`, onclick: opts.onClick, tabindex: opts.onClick ? 0 : undefined, 'data-pad': opts.onClick ? '1' : undefined },
    opts.badge ? h('span', { class: `mon-badge ${opts.badge === '队长' ? 'lead' : ''}` }, opts.badge) : null,
    portraitSlot(f.dex, 2, 'mon-portrait', b.shiny),
    h('div', { class: 'mon-body' },
      h('div', { class: 'mon-name', title: b.shiny ? `闪光${f.name} · 六项能力 +1%` : undefined }, f.name, h('span', { class: 'mon-lv' }, ` Lv${b.level}`)),
      h('div', { class: 'small muted', title: `道具 ${items} 件 · 技能 ${b.skills.length} 个` }, ...f.types.map(typeBadge), ` 强度 ${buildPower(b)}`),
      h('div', { class: 'small mon-rec' }, rec),
    ),
    opts.action ?? null,
  );
}

export function buildDetail(b: SavedBuild, meta: Record<string, number>, page = 0, onPage: (n: number) => void = () => {}) {
  const p = buildStats(b, meta);
  const d = p.d;
  const stat = (label: string, v: string | number) => h('div', { class: 'bd-stat' }, h('span', null, label), h('b', null, v));
  const items = b.items.filter(([id]) => ITEMS[id]).sort((x, y) => ITEMS[y[0]].tier - ITEMS[x[0]].tier || y[1] - x[1]);
  return h('div', { class: 'build-detail' },
    h('div', { class: 'bd-stats' },
      stat('HP', d.maxHp), stat('物攻', Math.round(d.atk)), stat('特攻', Math.round(d.spa)),
      stat('物防', Math.round(d.def)), stat('特防', Math.round(d.spd)), stat('速度', Math.round(d.spe)),
      stat('暴击', `${Math.round(d.crit * 100)}%`), stat('急速', `${Math.round((1 / d.cdMult - 1) * 100)}%`), stat('闪避', `${Math.round(d.dodge * 100)}%`),
    ),
    h('div', { class: 'bd-skills' }, b.skills.map((s) => {
      const el = h('div', { class: 'bd-skill' }, skillIcon(s.id, s.lv, true), h('span', null, SKILLS[s.id].name, s.lv > 1 ? ` +${s.lv - 1}` : ''));
      tip(el, () => skillInfo(s.id, s.lv, b.line));
      return el;
    })),
    (() => {
      const pg = pager(items, 18, page, ([id, n]) => {
        const it = ITEMS[id];
        const cell = h('div', { class: `item-cell tier${it.tier}`, style: `--tc:${TIER_COLOR[it.tier]}` }, iconImg(it.icon, 2), n > 1 ? h('i', null, `×${n}`) : null);
        tip(cell, () => itemInfo(id, n));
        return cell;
      }, { cls: 'bd-items', empty: () => h('div', { class: 'small muted' }, '没有道具'), filler: () => h('div', { class: 'item-cell empty' }), onPage, keys: null, label: `道具 ${items.reduce((a, [, n]) => a + n, 0)}` });
      return h('div', { class: 'bd-items-wrap' }, pg.list, pg.nav);
    })(),
  );
}

/** 背包满了：选一只放生，或者取消 */
export function releaseModal(party: PartyMon[], max: number, incoming: SavedBuild | null, onRelease: (uid: string) => void, onCancel: () => void) {
  const overlay = h('div', { class: 'modal' });
  const close = () => overlay.remove();
  let page = 0;
  const render = () => {
    clear(overlay);
    const pg = pager(party, 9, page, (m) => monCard(m, {
      action: h('button', { class: 'btn small danger', onclick: (e: Event) => {
        e.stopPropagation();
        sfx('click');
        close();
        onRelease(m.uid);
      } }, '放生'),
    }), { cls: 'release-grid', filler: () => h('div', { class: 'mon-card filler' }), onPage: (n) => { page = n; render(); } });
    overlay.appendChild(h('div', { class: 'box modal-box release no-anim' },
      h('h2', null, '背包满了'),
      h('p', { class: 'sub' }, incoming ? `最多只能带 ${max} 只宝可梦。放生一只，把 ${formName(incoming)} Lv${incoming.level} 放进背包。` : `最多只能带 ${max} 只宝可梦。`),
      pg.list, pg.nav,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => { close(); onCancel(); } }, '取消')),
    ));
  };
  render();
  document.body.appendChild(overlay);
  (overlay.querySelector('.btn.danger') as HTMLElement | null)?.focus();
  return overlay;
}

// ---------------------------------------------------------------- 对战中心

export interface PvpActions {
  /** team：出战的宝可梦，第一只是队长 */
  queue(mode: PvpMode, team: PartyMon[]): void;
  cancel(): void;
  practice(mode: PvpMode, team: PartyMon[]): void;
  release(uid: string): void;
  board(mode: PvpMode): void;
  /** 冒险 / 道馆排行榜 */
  rank(kind: RankKind): void;
  /** 设为队长：它变成跟随的伙伴 */
  partner(mon: PartyMon): void;
  adventure(): void;
  back(): void;
}

type Queued = Extract<S2C, { t: 'pvpQueued' }>;
type PvpBoardMsg = Extract<S2C, { t: 'pvpBoard' }>;
type RankBoardMsg = Extract<S2C, { t: 'rankBoard' }>;
/** 排行榜：两种对战 + 冒险 + 道馆 */
type BoardKind = PvpMode | RankKind;
const BOARD_TABS: [BoardKind, string][] = [['1v1', '单挑'], ['4v4', '团战'], ['adventure', '冒险'], ['gym', '道馆']];
const isPvpBoard = (k: BoardKind): k is PvpMode => k === '1v1' || k === '4v4';
const PARTY_PER = 12;

/**
 * 对战场：默认只做一件事——选模式 → 确认阵容 → 开始对战；
 * 背包里的构筑详情（技能、道具、放生）和排行榜放在另外两个标签里，需要时再看。
 */
export class PvpScreen {
  private boards: Partial<Record<PvpMode, PvpBoardMsg>> = {};
  private ranks: Partial<Record<RankKind, RankBoardMsg>> = {};
  /** 0 对战 · 1 背包 · 2 排行榜 */
  private tab = 0;
  private boardKind: BoardKind;
  private queued: Queued | null = null;
  private waiting = false;
  private connected: boolean;
  private itemPage = 0;
  private boardPage = 0;
  private partyPage = 0;
  /** 背包里正在查看的宝可梦（默认是队长） */
  private focus: string | null = null;

  constructor(private root: HTMLElement, private p: Profile, private a: PvpActions, connected: boolean) {
    this.connected = connected;
    this.boardKind = p.pvpMode;
    this.render();
  }

  setConnected(on: boolean) {
    if (on === this.connected) return;
    this.connected = on;
    if (!on) { this.queued = null; this.waiting = false; }
    this.render();
  }

  setBoard(b: PvpBoardMsg) {
    this.boards[b.mode] = b;
    this.render();
  }

  setRank(b: RankBoardMsg) {
    this.ranks[b.kind] = b;
    if (this.tab === 2) this.render();
  }

  setQueued(q: Queued | null) {
    this.queued = q;
    this.waiting = false;
    this.render();
  }

  setWaiting() {
    this.waiting = true;
    this.render();
  }

  get isQueued() { return !!this.queued || this.waiting; }

  private team() { return pvpTeamOf(this.p, PVP_MODES[this.p.pvpMode].team); }

  private go(tab: number) {
    if (tab === this.tab) return;
    this.tab = tab;
    if (tab === 2) this.requestBoard(this.boardKind);
    this.render();
  }

  private requestBoard(kind: BoardKind) {
    if (isPvpBoard(kind)) this.a.board(kind);
    else this.a.rank(kind);
  }

  private view(m: PartyMon) {
    sfx('click');
    this.focus = m.uid;
    this.itemPage = 0;
    this.render();
  }

  /** 设为队长：它原来是上场的队员时，和原来的队长互换位置 */
  private setLeader(m: PartyMon) {
    const p = this.p;
    const team = pvpTeamOf(p, PVP_MODES['1v1'].team);
    const old = team[0];
    if (old) {
      const members = team.slice(1).map((x) => x.uid).filter((u) => u !== m.uid);
      if (team.includes(m)) members.push(old.uid);
      p.pvpTeam = members;
    }
    p.pvpPick = m.uid;
    sfx('click');
    this.a.partner(m);
    this.render();
  }

  /** 单挑：让它上场或下场（满了就换掉最早选的那只） */
  private toggleMember(m: PartyMon) {
    const p = this.p;
    const members = pvpTeamOf(p, PVP_MODES['1v1'].team).slice(1).map((x) => x.uid);
    const i = members.indexOf(m.uid);
    if (i >= 0) members.splice(i, 1);
    else {
      if (members.length >= PVP_MODES['1v1'].team - 1) members.shift();
      members.push(m.uid);
    }
    p.pvpTeam = members;
    saveProfile(p);
    sfx('click');
    this.render();
  }

  render() {
    const p = this.p;
    const busy = this.isQueued;
    const body = this.tab === 1 ? this.partyTab(busy) : this.tab === 2 ? this.boardTab() : this.battleTab(busy);
    mount(this.root, h('div', { class: 'box panel pvp' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'row' }, uiIcon('sword', 3), h('h2', null, '对战场')),
        tabs(['对战', `背包 ${p.party.length}/${partyMax(p)}`, '排行榜'], this.tab, (i) => this.go(i)),
        iconBtn('back', '回到真新镇', () => { if (busy) this.a.cancel(); this.a.back(); }, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' }),
      ),
      body,
    ), 'pvp');
  }

  // ---------------------------------------------------------------- 对战：三步

  private battleTab(busy: boolean) {
    const p = this.p;
    const mode = p.pvpMode;
    const M = PVP_MODES[mode];
    const team = this.team();
    const leader = team[0] ?? null;
    const step = (n: number, title: string, tools: Node | null = null) =>
      h('div', { class: 'pvp-step-head' }, h('i', { class: 'step-no' }, n), h('b', null, title), tools);

    // ① 选择模式
    const modes = h('div', { class: 'pvp-modes' }, PVP_MODE_IDS.map((id) => {
      const D = PVP_MODES[id];
      const r = this.boards[id]?.me;
      return h('button', {
        class: `pvp-mode ${mode === id ? 'on' : ''}`, disabled: busy && mode !== id, 'aria-pressed': mode === id ? 'true' : 'false',
        onclick: () => { if (busy || mode === id) return; sfx('click'); p.pvpMode = id; saveProfile(p); this.render(); },
      },
      h('span', { class: 'pvp-mode-title' }, h('b', null, D.name), mode === id ? uiIcon('check', 2) : null),
      h('span', { class: 'pvp-mode-desc' }, D.desc),
      h('span', { class: 'pvp-mode-rec' }, r?.games ? `${r.rating} 分 · ${tierOf(r.rating).tier.name}` : '还没有定级'));
    }));

    // ② 确认阵容：队长由你操作，另外两只由 AI 操作；不够的由 AI 借给你
    const slots = Array.from({ length: M.team }, (_, i) => team[i] ?? null);
    const autoBtn = h('button', {
      class: `btn small pvp-auto ${p.pvpAuto ? 'on' : ''}`, disabled: busy, role: 'switch', 'aria-checked': p.pvpAuto ? 'true' : 'false',
      onclick: () => { sfx('click'); p.pvpAuto = !p.pvpAuto; saveProfile(p); this.render(); },
    }, uiIcon('robot', 2), h('span', null, p.pvpAuto ? '全自动：开' : '全自动：关'));
    tip(autoBtn, () => h('div', { class: 'info' },
      h('b', null, '全自动（斗蛐蛐）'),
      h('div', { class: 'small' }, '开启后开局就把队长也交给 AI，你只需要观战；对战中按 T（手柄 Y）或点右下角的按钮随时切换。'),
      M.team > 1 ? h('div', { class: 'small muted' }, '另外两只上场的宝可梦一直由 AI 操作。') : null,
    ));
    const tools = h('div', { class: 'row tight pvp-step-tools' },
      p.party.length ? iconBtn('swap', '在背包里选队长和上场的宝可梦', () => { sfx('click'); this.go(1); }, { cls: 'small', text: '更换阵容', attrs: { disabled: busy } }) : null,
      autoBtn,
    );
    const lineup = leader
      ? h('div', { class: `pvp-lineup n${M.team}` }, slots.map((m, i) => (m ? this.lineupCard(m, i === 0, M.team > 1) : h('div', { class: 'pvp-lineup-card rental' },
        h('div', { class: 'pvp-slot-q' }, '?'), h('b', null, '借用'), h('small', { class: 'muted' }, '背包不够时 AI 借你一只'), h('small', { class: 'muted' }, '比队伍平均低 2 级')))))
      : h('div', { class: 'pvp-lineup empty' },
        h('b', null, `跟随你的${LINES[p.partner] ? shinyName(LINES[p.partner].name, p.partnerShiny) : '伙伴'}还没有对战构筑`),
        h('p', { class: 'small muted' }, p.party.length
          ? `可以在「背包」里把一只宝可梦设为队长，或者带它完成一次冒险，在结算时放入背包。${p.partnerShiny ? '闪光的和普通的要分别培养。' : ''}`
          : '完成一局冒险（无论通关与否），在结算界面点「放入背包」，就能用它来对战。等级、技能、道具和升级强化都会保留。'),
        h('div', { class: 'row tight' },
          p.party.length ? h('button', { class: 'btn', onclick: () => { sfx('click'); this.go(1); } }, '打开背包') : null,
          h('button', { class: 'btn gold', onclick: () => { sfx('click'); this.a.adventure(); } }, '去冒险')),
      );

    // ③ 开始对战
    let action: Node;
    if (busy) {
      const q = this.queued;
      action = h('div', { class: 'pvp-queue searching' },
        h('div', { class: 'pvp-spinner' }, iconImg('ball_poke', 3)),
        h('div', { class: 'grow' },
          h('b', null, `正在寻找对手… ${q ? fmtTime(q.wait) : ''}`),
          q ? h('div', { class: 'small muted' }, `匹配范围 ±${q.range} 分 · 队列中 ${q.searching} 人 · ${q.botIn > 0 ? `${q.botIn} 秒后由 AI 训练家补位` : '正在安排 AI 训练家…'}`) : null,
        ),
        h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => { sfx('click'); this.a.cancel(); } }, '取消'),
      );
    } else {
      action = h('button', {
        class: 'btn gold big go pvp-go', 'data-key': 'y', disabled: !leader || !this.connected,
        onclick: () => { if (!leader || !this.connected) return; sfx('click'); this.waiting = true; this.render(); this.a.queue(mode, team); },
      }, '开始匹配', h('small', null, !this.connected ? '没有连接到对战服务器，可以先打练习赛' : leader ? `排位赛 · ${M.name}` : '先确认阵容'));
    }
    const rules = h('button', { class: 'btn small ghost', 'data-pad': '1' }, uiIcon('info', 2), ' 规则');
    const R = (s: number) => Math.round(M.dur * s);
    tip(rules, () => h('div', { class: 'info' },
      h('b', null, '对战规则'),
      h('div', { class: 'small' }, '单挑：双方各派三只宝可梦同时上场，你操作队长，另外两只由 AI 操作；倒下的宝可梦直接退场。比的是构筑和阵容搭配。'),
      h('div', { class: 'small' }, '团战：四人一队，每人一只；站在倒下的队友身边可以救援（附近有对手时救不起来）。'),
      h('div', { class: 'small' }, '每只宝可梦每秒受到的伤害有上限，再强的构筑也不会开场几秒就把对手秒掉。'),
      h('div', { class: 'small' }, `每场 ${M.dur} 秒：${R(RING_START)} 秒后场地开始缩小，圈外持续掉血；${R(RING_END)} 秒缩到最小后进入加时，伤害逐渐提高。`),
      h('div', { class: 'small' }, '击倒全部对手获胜；时间到时存活多、剩余 HP 多的一方获胜。'),
      h('div', { class: 'small muted' }, '优先匹配分数接近的训练家，等待越久范围越大，没有真人时由 AI 训练家补位。'),
    ));
    const sub = h('div', { class: 'row tight pvp-sub-actions' },
      h('button', { class: 'btn small grow', disabled: !leader || busy, onclick: () => { if (leader) { sfx('click'); this.a.practice(mode, team); } } }, '练习赛（离线 · 不计分）'),
      rules,
    );

    return h('div', { class: 'pvp-battle' },
      h('div', { class: 'pvp-steps' },
        h('section', { class: 'pvp-step' }, step(1, '选择模式'), modes),
        h('section', { class: 'pvp-step grow' }, step(2, '确认阵容', tools), lineup),
        h('section', { class: 'pvp-step' }, step(3, '开始对战'), h('div', { class: 'pvp-start' }, action, sub)),
      ),
      this.rankSide(mode),
    );
  }

  private lineupCard(m: PartyMon, lead: boolean, multi: boolean) {
    const b = m.build;
    const f = formOf(b.line, b.stage);
    const el = h('button', { class: `pvp-lineup-card ${lead ? 'lead' : ''}${b.shiny ? ' shiny' : ''}`, onclick: () => { this.focus = m.uid; this.itemPage = 0; sfx('click'); this.go(1); } },
      lead ? h('i', { class: 'mon-badge lead' }, '队长') : null,
      portraitSlot(f.dex, 2, 'pvp-lineup-portrait', b.shiny),
      h('b', { class: 'pvp-lineup-name' }, shinyName(f.name, b.shiny)),
      h('small', null, `Lv${b.level} · ${lead ? '你来操作' : multi ? 'AI 操作' : ''}`),
      h('span', { class: 'pvp-lineup-types' }, ...f.types.map(typeBadge)),
    );
    tip(el, () => h('div', { class: 'info small' }, `强度 ${buildPower(b)} · ${originText(m)}`, h('div', { class: 'muted' }, '点一下在背包里查看技能和道具')));
    return el;
  }

  /** 右边：我的段位（选中的模式）、背包扩展的提示、最近一场 */
  private rankSide(mode: PvpMode) {
    const p = this.p;
    const rec = this.boards[mode]?.me ?? null;
    const rating = rec?.rating ?? START_RATING;
    const T = tierOf(rating);
    const max = partyMax(p);
    const history = this.boards[mode]?.history ?? [];
    return h('aside', { class: 'pvp-side-col' },
      h('div', { class: 'small muted' }, `我的段位 · ${PVP_MODES[mode].name}`),
      h('div', { class: 'pvp-rating side' },
        tierBadge(rating, true),
        h('div', { class: 'grow' },
          h('div', { class: 'pvp-score' }, h('b', null, rating), h('span', { class: 'muted small' }, rec?.rank ? ` 第 ${rec.rank} 名` : rec?.games ? '' : ' 定级中')),
          h('div', { class: 'tier-bar' }, h('div', { style: `width:${Math.round(T.progress * 100)}%;background:${T.tier.color}` })),
          h('div', { class: 'small muted' }, T.next ? `距离${T.next.name}还差 ${T.next.min - rating} 分` : '最高段位'),
          h('div', { class: 'small' }, rec?.games ? `${rec.wins} 胜 ${rec.losses} 负${rec.draws ? ` ${rec.draws} 平` : ''}${rec.streak > 1 ? ` · ${rec.streak} 连胜` : ''}` : '还没有排位记录'),
        ),
      ),
      h('div', { class: `pvp-side-note small ${max >= PARTY_LIMIT ? 'ok' : ''}` }, uiIcon('bag', 1),
        max >= PARTY_LIMIT ? ` 背包已经扩展到 ${max} 格` : ` 达到${PARTY_BONUS_TIER.name}（${PARTY_BONUS_TIER.min} 分），背包从 ${max} 格扩展到 ${PARTY_LIMIT} 格`),
      h('div', { class: 'pvp-last' },
        h('div', { class: 'small muted' }, '最近一场'),
        history.length ? histRow(history[0]) : h('div', { class: 'hist empty small muted' }, this.connected ? '还没有排位记录' : '连接服务器后显示'),
      ),
      h('button', { class: 'btn small ghost pvp-to-board', onclick: () => { sfx('click'); this.go(2); } }, uiIcon('trophy', 2), ' 排行榜与战绩'),
    );
  }

  // ---------------------------------------------------------------- 背包：构筑详情与管理

  private partyTab(busy: boolean) {
    const p = this.p;
    const M = PVP_MODES[p.pvpMode];
    const team = this.team();
    const leader = team[0] ?? null;
    const focus = p.party.find((m) => m.uid === this.focus) ?? leader ?? p.party[0] ?? null;
    const role = (m: PartyMon) => (m === leader ? '队长' : team.includes(m) ? '上场' : null);
    const max = partyMax(p);
    if (!p.party.length) {
      return h('div', { class: 'pvp-party-tab empty' },
        h('p', null, '背包里还没有宝可梦。'),
        h('p', { class: 'small muted' }, '完成一局冒险（无论通关与否），在结算界面点「放入背包」，就能用它来对战和挑战道馆。'),
        h('button', { class: 'btn gold', onclick: () => { sfx('click'); this.a.adventure(); } }, '去冒险'),
      );
    }
    // 背包的格子：有的显示宝可梦，空着的显示「空位」，超出容量的部分不画
    const cells: (PartyMon | null)[] = [...p.party, ...Array.from({ length: Math.max(0, max - p.party.length) }, () => null)];
    const pg = pager(cells, PARTY_PER, this.partyPage, (m) => (m
      ? monCard(m, { selected: m === focus, badge: role(m), onClick: () => this.view(m) })
      : h('div', { class: 'mon-card empty' }, h('span', { class: 'muted small' }, '空位'))), {
      cls: 'party-grid', filler: () => h('div', { class: 'mon-card filler' }), onPage: (n) => { this.partyPage = n; this.render(); }, keys: null,
      label: `${p.party.length} / ${max} 只${max < PARTY_LIMIT ? ` · ${PARTY_BONUS_TIER.name}后 ${PARTY_LIMIT} 格` : ''}`,
    });
    this.partyPage = pg.page;
    const detail = focus ? h('div', { class: 'pvp-detail' },
      h('div', { class: 'row between' },
        h('div', { class: 'pvp-detail-title' }, h('b', null, `${formName(focus.build)} Lv${focus.build.level}`), h('span', { class: 'small muted' }, ` ${originText(focus)}`)),
        h('div', { class: 'row tight pvp-detail-actions' },
          focus === leader
            ? h('span', { class: 'mon-badge lead static', title: '由你操作；也是在真新镇里跟着你的伙伴' }, '队长')
            : h('button', { class: 'btn tiny gold', disabled: busy, onclick: () => this.setLeader(focus) }, '设为队长'),
          M.team > 1 && focus !== leader
            ? h('button', { class: `btn tiny ${team.includes(focus) ? 'ghost' : ''}`, disabled: busy, onclick: () => this.toggleMember(focus) }, team.includes(focus) ? '下场' : '上场')
            : null,
          confirmButton('放生', '再点一次', 'btn tiny ghost danger', () => { this.a.release(focus.uid); this.focus = null; this.itemPage = 0; this.render(); }, { disabled: busy, title: '放生后无法找回' }),
        ),
      ),
      buildDetail(focus.build, p.upgrades, this.itemPage, (n) => { this.itemPage = n; this.render(); }),
    ) : null;
    return h('div', { class: 'pvp-party-tab' },
      h('div', { class: 'pvp-party-left' },
        h('div', { class: 'small muted' }, M.team > 1 ? '点宝可梦查看构筑；队长由你操作，再选两只上场由 AI 操作。' : '点宝可梦查看构筑；团战只派队长上场。'),
        pg.list, pg.nav,
      ),
      detail,
    );
  }

  // ---------------------------------------------------------------- 排行榜

  private boardTab() {
    const kind = this.boardKind;
    const chips = h('div', { class: 'row tight lb-kinds' }, BOARD_TABS.map(([k, label]) => h('button', {
      class: `btn tiny ${k === kind ? 'gold' : 'ghost'}`, 'aria-pressed': k === kind ? 'true' : 'false',
      onclick: () => { if (k === kind) return; sfx('click'); this.boardKind = k; this.boardPage = 0; this.requestBoard(k); this.render(); },
    }, label)));
    const msg = isPvpBoard(kind) ? this.boards[kind] : this.ranks[kind];
    const empty = () => h('div', { class: 'muted small' }, !this.connected ? '连接服务器后可以查看排行榜' : !msg ? '加载中…' : '还没有人上榜，快来成为第一名！');
    let head: Node, list: HTMLElement, nav: HTMLElement, me: Node, side: Node;
    if (isPvpBoard(kind)) {
      const b = this.boards[kind];
      const pg = pager(b?.rows ?? [], 10, this.boardPage, boardRow, { cls: 'lb', empty, filler: () => h('div', { class: 'lb-row filler' }), onPage: (n) => { this.boardPage = n; this.render(); }, keys: null });
      this.boardPage = pg.page;
      head = h('div', { class: 'lb-head' }, h('span', null, '#'), h('span', null, '训练家'), h('span', null, '段位'), h('span', null, '积分'), h('span', null, '胜/负'));
      ({ list, nav } = pg);
      const leader = this.team()[0];
      me = b?.me?.games
        ? boardRow({ rank: b.me.rank, name: this.p.name || '训练家', rating: b.me.rating, wins: b.me.wins, losses: b.me.losses, draws: b.me.draws, streak: b.me.streak, dex: leader ? formOf(leader.build.line, leader.build.stage).dex : 0, shiny: leader?.build.shiny, you: true })
        : h('div', { class: 'lb-row filler' });
      const history = b?.history ?? [];
      side = h('aside', { class: 'lb-side' },
        h('b', null, '最近对战'),
        h('div', { class: 'lb-history' }, history.length ? history.slice(0, 8).map(histRow) : h('div', { class: 'small muted' }, '还没有排位记录')),
        h('div', { class: 'small muted' }, b ? `共 ${b.players} 位训练家参与${PVP_MODES[kind].name}排位` : ''),
      );
    } else {
      const r = this.ranks[kind];
      const rowFn = kind === 'adventure' ? advRow : gymRow;
      const pg = pager(r?.rows ?? [], 10, this.boardPage, rowFn, { cls: 'lb', empty, filler: () => h('div', { class: `lb-row ${kind} filler` }), onPage: (n) => { this.boardPage = n; this.render(); }, keys: null });
      this.boardPage = pg.page;
      head = kind === 'adventure'
        ? h('div', { class: 'lb-head adventure' }, h('span', null, '#'), h('span', null, '训练家'), h('span', null, '难度'), h('span', null, '成绩'), h('span', null, '人数'))
        : h('div', { class: 'lb-head gym' }, h('span', null, '#'), h('span', null, '训练家'), h('span', null, '徽章'), h('span', null, '达成'));
      ({ list, nav } = pg);
      me = r?.me ? rowFn({ ...r.me, you: true }) : h('div', { class: `lb-row ${kind} filler` });
      side = h('aside', { class: 'lb-side' },
        h('b', null, kind === 'adventure' ? '冒险榜' : '道馆榜'),
        h('p', { class: 'small' }, kind === 'adventure'
          ? '每位训练家最好的一局冒险：先比难度，再比完成的波次，都通关了比用时（包括商店）。单人和联机都算。'
          : '集齐的道馆徽章越多排得越靠前；徽章一样多时，先拿到最后一枚的排在前面。'),
        h('div', { class: 'small muted' }, r ? `共 ${r.players} 位训练家上榜` : ''),
      );
    }
    return h('div', { class: 'pvp-board-tab' },
      h('div', { class: 'lb-main' }, chips, head, h('div', { class: 'lb-wrap' }, list, nav), me),
      side,
    );
  }
}

function boardRow(r: PvpBoardRow) {
  const T = tierOf(r.rating).tier;
  return h('div', { class: `lb-row ${r.you ? 'me' : ''}` },
    h('span', { class: r.rank <= 3 ? `top${r.rank}` : '' }, r.rank || '-'),
    h('span', { class: 'board-mon' }, r.dex ? portraitSlot(r.dex, 1, 'tiny', r.shiny) : null, h('span', { class: 'lb-name' }, r.name)),
    h('span', { class: 'lb-tier', style: `color:${T.color}` }, iconImg(T.icon, 1), ` ${T.name}`),
    h('span', null, h('b', null, r.rating)),
    h('span', null, `${r.wins}/${r.losses}`),
  );
}

function advRow(r: RankRow) {
  const run = r.run;
  const D = run ? DIFFICULTIES[run.difficulty] : null;
  return h('div', { class: `lb-row adventure ${r.you ? 'me' : ''}` },
    h('span', { class: r.rank <= 3 ? `top${r.rank}` : '' }, r.rank || '-'),
    h('span', { class: 'board-mon' }, r.dex ? portraitSlot(r.dex, 1, 'tiny', r.shiny) : null, h('span', { class: 'lb-name' }, r.name)),
    h('span', { style: D ? `color:${D.color}` : undefined }, D?.name ?? ''),
    h('span', null, run ? (run.victory ? h('b', { class: 'gold' }, `通关 ${fmtTime(run.time)}`) : `完成 ${run.waves} 波`) : ''),
    h('span', { class: 'muted' }, run ? (run.players > 1 ? `${run.players} 人` : '单人') : ''),
  );
}

function gymRow(r: RankRow) {
  const n = r.badges ?? 0;
  const day = r.at ? new Date(r.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
  return h('div', { class: `lb-row gym ${r.you ? 'me' : ''}` },
    h('span', { class: r.rank <= 3 ? `top${r.rank}` : '' }, r.rank || '-'),
    h('span', { class: 'board-mon' }, r.dex ? portraitSlot(r.dex, 1, 'tiny', r.shiny) : null, h('span', { class: 'lb-name' }, r.name)),
    h('span', { class: 'lb-badges', title: `${n} / ${GYMS.length} 枚徽章` }, GYMS.slice(0, n).map((g) => uiIcon(g.badge.icon, 1)), h('small', null, ` ${n}`)),
    h('span', { class: 'muted' }, day),
  );
}

function histRow(x: PvpHistory) {
  const label = x.result === 'win' ? '胜' : x.result === 'loss' ? '负' : '平';
  return h('div', { class: `hist ${x.result}` },
    h('b', null, label),
    x.dex ? Animator.portrait(x.dex, 1, x.shiny) : null,
    h('span', { class: 'grow small' }, `${x.mode} · 对手 ${x.opp}`),
    h('span', { class: x.delta >= 0 ? 'pos' : 'neg' }, `${x.delta >= 0 ? '+' : ''}${x.delta}`),
  );
}

// ---------------------------------------------------------------- 对战结算

function tile(label: string, value: string | number, sub?: string, color?: string) {
  return h('div', { class: 'r-tile' },
    h('div', { class: 'r-tile-label' }, label),
    h('div', { class: 'r-tile-value', style: color ? `color:${color}` : undefined }, String(value)),
    sub ? h('div', { class: 'r-tile-sub' }, sub) : null,
  );
}

function section(title: string, ...children: (Node | null)[]) {
  return h('div', { class: 'r-section' }, h('h3', null, title), ...children);
}

const svg = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** 两队剩余 HP 曲线 + 击倒标记 */
function hpChart(res: PvpMatchResult, myTeam: number) {
  const W = 320, H = 110, pad = 18;
  const tl = res.timeline;
  const maxT = Math.max(1, res.time, ...tl.map((x) => x.t));
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hp-chart', preserveAspectRatio: 'none' });
  for (const y of [0, 50, 100]) root.appendChild(svg('line', { x1: pad, x2: W, y1: H - pad - (y / 100) * (H - pad * 1.5), y2: H - pad - (y / 100) * (H - pad * 1.5), class: 'grid' }));
  const X = (t: number) => pad + (t / maxT) * (W - pad);
  const Y = (v: number) => H - pad - (v / 100) * (H - pad * 1.5);
  for (const team of [0, 1]) {
    const col = TEAM_COLOR[team === myTeam ? 0 : 1];
    const pts = tl.map((x) => `${X(x.t).toFixed(1)},${Y(x.hp[team]).toFixed(1)}`).join(' ');
    root.appendChild(svg('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  }
  for (const [t, , victim] of res.feed) {
    const v = res.players.find((p) => p.id === victim);
    if (!v) continue;
    const col = TEAM_COLOR[v.team === myTeam ? 0 : 1];
    root.appendChild(svg('circle', { cx: X(t), cy: Y(0) - 4, r: 4, fill: col, stroke: '#101018', 'stroke-width': 1.5 }));
  }
  for (let t = 0; t <= maxT; t += maxT > 60 ? 30 : maxT > 24 ? 10 : 5) {
    const tx = svg('text', { x: X(t), y: H - 3, class: 'axis', 'text-anchor': 'middle' });
    tx.textContent = fmtTime(t);
    root.appendChild(tx);
  }
  return h('div', { class: 'hp-chart-wrap' }, root as unknown as HTMLElement,
    h('div', { class: 'legend small' },
      h('span', { style: `color:${TEAM_COLOR[0]}` }, '■ 我方剩余 HP'), h('span', { style: `color:${TEAM_COLOR[1]}` }, '■ 对方剩余 HP'), h('span', { class: 'muted' }, '● 击倒')));
}

function skillBars(p: PvpPlayerResult) {
  const rows = p.skillDmg.filter(([, v]) => v > 0);
  const total = rows.reduce((a, [, v]) => a + v, 0) || 1;
  const max = rows[0]?.[1] ?? 1;
  const held = new Map(p.skills.map((s) => [s.id, s.lv]));
  const list = h('div', { class: 'r-skills' });
  for (const [id, v] of rows) {
    const def = SKILLS[id];
    const color = def ? TYPE_COLOR[def.type] : '#a0a8b8';
    const row = h('div', { class: 'r-skill' },
      skillIcon(id, held.get(id) ?? 1, true),
      h('div', { class: 'r-skill-name' }, def ? def.name : id === '_dot' ? '灼伤 / 中毒 / 寄生' : '反伤等其它'),
      h('div', { class: 'r-skill-bar' }, h('div', { style: `width:${(v / max) * 100}%;background:${color}` })),
      h('div', { class: 'r-skill-num' }, `${fmt(v)} · ${Math.round((v / total) * 100)}%`),
    );
    if (def) tip(row, () => skillInfo(id, held.get(id) ?? 1, p.line));
    list.appendChild(row);
  }
  for (const s of p.skills) {
    if (rows.some(([id]) => id === s.id)) continue;
    list.appendChild(h('div', { class: 'r-skill' }, skillIcon(s.id, s.lv, true), h('div', { class: 'r-skill-name' }, SKILLS[s.id].name), h('div', { class: 'r-skill-bar' }), h('div', { class: 'r-skill-num muted' }, SKILLS[s.id].cat === 'status' ? '辅助技能' : '没有命中')));
  }
  return rows.length || p.skills.length ? list : h('div', { class: 'muted small' }, '没有记录');
}

/** MVP：伤害、击倒、救援、承伤综合评分 */
function score(p: PvpPlayerResult) { return p.damage + p.kos * 120 + p.revives * 100 + p.taken * 0.3 + p.healed * 0.5; }

function scoreboard(res: PvpMatchResult, you: number, myTeam: number, seats: PvpSeatInfo[]) {
  const mvp = res.players.slice().sort((a, b) => score(b) - score(a))[0];
  const maxDmg = Math.max(1, ...res.players.map((p) => Math.max(p.damage, p.taken)));
  const multi = PVP_MODES[res.mode].team > 1;
  const team = (t: number) => {
    const ps = res.players.filter((p) => p.team === t).sort((a, b) => score(b) - score(a));
    const mine = t === myTeam;
    const won = res.winner === t;
    return h('div', { class: `sb-team ${mine ? 'ally' : 'enemy'}` },
      h('div', { class: 'sb-head', style: `color:${TEAM_COLOR[mine ? 0 : 1]}` }, mine ? '我方' : '对方', res.winner < 0 ? ' · 平局' : won ? ' · 胜利' : ' · 失败'),
      h('table', { class: 'board' },
        h('tr', null, h('th', null, '训练家'), h('th', null, '宝可梦'), h('th', null, '伤害'), h('th', null, '承伤'), h('th', null, '回复'), h('th', null, '击倒'), h('th', null, multi ? '退场' : '救援')),
        ps.map((p) => {
          const seat = seats.find((s) => s.id === p.id);
          // 真人训练家断线后由 AI 接手：p.bot 为真但座位不是 AI 训练家
          const aiTrainer = seat ? seat.bot : p.bot && !p.helper;
          return h('tr', { class: `${p.id === you ? 'me' : ''} ${p.alive ? '' : 'dead'}` },
            h('td', null, p.name, aiTrainer ? h('span', { class: 'tag ai' }, 'AI') : null, multi && !p.helper ? h('span', { class: 'tag lead' }, '队长') : null, p === mvp ? h('span', { class: 'tag mvp' }, 'MVP') : null),
            h('td', { class: 'board-mon' }, Animator.portrait(p.dex, 1, p.shiny), `${shinyName(p.form, p.shiny)} Lv${p.level}`),
            h('td', null, h('div', { class: 'dmg-cell' }, h('i', { style: `width:${(p.damage / maxDmg) * 100}%;background:${TEAM_COLOR[mine ? 0 : 1]}` }), h('span', null, fmt(p.damage)))),
            h('td', null, fmt(p.taken)), h('td', null, fmt(p.healed)), h('td', null, p.kos), h('td', null, multi ? (p.alive ? '-' : '是') : p.revives),
          );
        }),
      ),
    );
  };
  return h('div', { class: 'scoreboard' }, team(myTeam), team(1 - myTeam));
}

function feedList(res: PvpMatchResult, myTeam: number, page: number, onPage: (n: number) => void) {
  const name = (id: number) => {
    const p = res.players.find((x) => x.id === id);
    return p ? h('span', { style: `color:${TEAM_COLOR[p.team === myTeam ? 0 : 1]}` }, `${p.name}的${shinyName(p.form, p.shiny)}`) : h('span', { class: 'muted' }, '缩圈');
  };
  const pg = pager(res.feed, 10, page, ([t, k, v]) => h('div', { class: 'small ko-row' },
    h('span', { class: 'muted' }, fmtTime(t), ' '), k >= 0 ? name(k) : h('span', { class: 'muted' }, '缩小的场地'), ' 击倒了 ', name(v)), {
    cls: 'ko-feed', empty: () => h('div', { class: 'muted small' }, '没有人被击倒'), filler: () => h('div', { class: 'ko-row filler' }), onPage, keys: null,
  });
  return h('div', { class: 'r-paged' }, pg.list, pg.nav);
}

export interface PvpResultActions { again(): void; back(): void; home(): void }

export function pvpResultsScreen(root: HTMLElement, res: PvpMatchResult, you: number, rating: PvpRatingChange | null, seats: PvpSeatInfo[], practice: boolean, a: PvpResultActions, tab = 0, feedPage = 0, unit = 0) {
  const again = (t: number, f: number, u = unit) => pvpResultsScreen(root, res, you, rating, seats, practice, a, t, f, u);
  const me = res.players.find((p) => p.id === you) ?? res.players[0];
  const myTeam = me.team;
  // 自己派出的宝可梦（单挑三只，队长在前）
  const mine = res.players.filter((p) => p.owner === me.owner).sort((x, y) => Number(x.helper) - Number(y.helper));
  const multi = mine.length > 1;
  const sum = (k: 'damage' | 'taken' | 'healed' | 'kos' | 'deaths' | 'crits' | 'superEff' | 'dodges' | 'revives') => mine.reduce((s, p) => s + p[k], 0);
  const outcome = res.winner < 0 ? 'draw' : res.winner === myTeam ? 'win' : 'loss';
  const title = outcome === 'win' ? '胜利！' : outcome === 'loss' ? '败北……' : '平局';
  const reason = res.reason === 'ko' ? (outcome === 'win' ? '击倒了全部对手' : outcome === 'loss' ? '我方全员倒下' : '双方同时倒下') : '时间到 · 按存活人数和剩余 HP 判定';
  const head = h('div', { class: 'r-head' },
    h('div', null, h('h2', { class: outcome === 'win' ? 'gold' : outcome === 'loss' ? 'neg' : '' }, title), h('div', { class: 'small muted' }, `${PVP_MODES[res.mode].name} · ${reason}${practice ? ' · 练习赛（不计分）' : ''}`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: a.home }, '首页'),
      h('button', { class: 'btn ghost', 'data-back': '1', onclick: a.back }, '返回对战中心'),
      h('button', { class: 'btn gold big', 'data-key': 'y', onclick: a.again }, '再来一场'),
    ),
  );
  let ratingEl: Node | null = null;
  if (rating) {
    const before = tierOf(rating.before), after = tierOf(rating.after);
    const up = after.index > before.index, down = after.index < before.index;
    ratingEl = h('div', { class: `pvp-rating result ${rating.delta >= 0 ? 'up' : 'down'}` },
      tierBadge(rating.after, true),
      h('div', { class: 'grow' },
        h('div', { class: 'pvp-score' }, h('span', { class: 'muted' }, `${rating.before} → `), h('b', null, rating.after),
          h('span', { class: rating.delta >= 0 ? 'pos' : 'neg' }, `  ${rating.delta >= 0 ? '+' : ''}${rating.delta}`)),
        h('div', { class: 'tier-bar' }, h('div', { style: `width:${Math.round(after.progress * 100)}%;background:${after.tier.color}` })),
        h('div', { class: 'small' }, up ? h('span', { class: 'gold' }, `升到了${after.tier.name}！`) : down ? h('span', { class: 'neg' }, `降到了${after.tier.name}`) : after.next ? `距离${after.next.name}还差 ${after.next.min - rating.after} 分` : '最高段位',
          rating.record.rank ? `  · 排名第 ${rating.record.rank}` : '', `  · ${rating.record.wins} 胜 ${rating.record.losses} 负`,
          rating.record.streak > 1 ? `  · ${rating.record.streak} 连胜` : ''),
      ),
    );
  }
  const status = (p: PvpPlayerResult) => h('div', { class: 'small', style: `color:${p.alive ? '#78f878' : '#ff8c8c'}` }, p.alive ? `存活 · HP ${p.hp} / ${p.maxHp}` : multi ? '退场' : '被击倒');
  const hero = multi
    ? h('div', { class: 'r-hero r-hero-team' }, mine.map((p) => h('div', { class: `r-hero-mon ${p.alive ? '' : 'dead'}` },
      portraitSlot(p.dex, 2, 'r-hero-portrait', p.shiny),
      h('div', null, h('b', null, `${shinyName(p.form, p.shiny)} Lv${p.level}`), h('div', { class: 'small muted' }, p.helper ? 'AI 操作' : '队长'), status(p)),
    )))
    : h('div', { class: 'r-hero' },
      portraitSlot(me.dex, 3, 'r-hero-portrait', me.shiny),
      h('div', null,
        h('div', { class: 'big' }, `${shinyName(me.form, me.shiny)}  Lv${me.level}`),
        h('div', null, ...(LINES[me.line].forms.find((f) => f.dex === me.dex)?.types ?? []).map(typeBadge)),
        status(me),
      ),
    );
  const dmg = sum('damage');
  const share = multi
    ? tile('队长输出', `${Math.round((me.damage / Math.max(1, dmg)) * 100)}%`, '在自己三只中')
    : tile('伤害占比', `${Math.round((me.damage / Math.max(1, res.players.filter((p) => p.team === myTeam).reduce((x, p) => x + p.damage, 0))) * 100)}%`, '在我方中');
  const tiles = h('div', { class: 'r-tiles' },
    tile('对战时长', fmtTime(res.time)),
    tile('造成伤害', fmt(dmg), `效果拔群 ${sum('superEff')} 次`),
    tile('承受伤害', fmt(sum('taken')), `闪避 ${sum('dodges')} 次`),
    tile('回复', fmt(sum('healed'))),
    tile('击倒', sum('kos'), sum('deaths') ? `${multi ? '退场' : '被击倒'} ${sum('deaths')} 次` : '没有被击倒', sum('kos') ? '#ffd23f' : undefined),
    multi ? tile('存活', `${mine.filter((p) => p.alive).length} / ${mine.length}`, '倒下的宝可梦退场') : tile('救援', sum('revives'), '站在倒下的队友身边'),
    tile('暴击', sum('crits')),
    share,
  );
  const shown = mine[Math.min(unit, mine.length - 1)] ?? me;
  const unitTabs = multi
    ? h('div', { class: 'r-unit-tabs' }, mine.map((p, i) => h('button', { class: `btn tiny ${p === shown ? 'gold' : 'ghost'}`, onclick: () => again(tab, feedPage, i) }, Animator.portrait(p.dex, 1, p.shiny), p.form)))
    : null;
  const content = tab === 0
    ? h('div', { class: 'r-grid' },
      h('div', { class: 'r-col' }, hero, tiles),
      h('div', { class: 'r-col' }, section('两队剩余 HP', hpChart(res, myTeam))))
    : tab === 1
      ? h('div', { class: 'r-full' }, h('div', { class: 'r-section' }, scoreboard(res, you, myTeam, seats)))
      : h('div', { class: 'r-grid' },
        h('div', { class: 'r-col' }, section(multi ? '技能伤害' : '我的技能伤害', unitTabs, skillBars(shown))),
        h('div', { class: 'r-col' }, section('击倒记录', feedList(res, myTeam, feedPage, (n) => again(tab, n)))));
  mount(root, h('div', { class: 'box panel results pvp-results' },
    head,
    ratingEl ?? h('div', { class: 'pvp-rating result empty' }, h('span', { class: 'muted' }, practice ? '练习赛不计分，积分与段位不变' : '本场不计分')),
    tabs(['概览', '计分板', '技能与击倒'], tab, (t) => again(t, feedPage)),
    h('div', { class: 'tab-body' }, content),
  ), 'pvp-results');
}

