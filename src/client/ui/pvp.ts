/**
 * 对战相关界面：背包、对战中心（选宝可梦/匹配/段位/排行榜）、放生、对战结算。
 */
import { DIFFICULTIES } from '../../shared/difficulty';
import { ITEMS } from '../../shared/items';
import { LINES, formOf } from '../../shared/pokemon';
import type { PvpBoardRow, PvpHistory, PvpRatingChange, PvpSeatInfo, S2C } from '../../shared/protocol';
import { buildPower, type SavedBuild } from '../../shared/pvp/build';
import { START_RATING, tierOf } from '../../shared/pvp/rating';
import { PVP_MODES, PVP_MODE_IDS, type PvpMatchResult, type PvpMode, type PvpPlayerResult } from '../../shared/pvp/sim';
import type { GameSim } from '../../shared/sim/game';
import { createPlayerFromBuild } from '../../shared/sim/player';
import { SKILLS, TIER_COLOR } from '../../shared/skills';
import { TYPE_COLOR } from '../../shared/types';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { Animator } from '../gfx/sprites';
import { PARTY_MAX, type PartyMon, type Profile } from '../save';
import { h, tip } from './dom';
import { itemInfo, skillIcon, skillInfo, typeBadge } from './describe';
import { mount, portraitSlot, tabs } from './screens';
import { confirmButton, pager } from './layout';

const TEAM_COLOR = ['#5aa0ff', '#ff6a6a'];
const fmt = (n: number) => (n >= 100000 ? `${(n / 10000).toFixed(1)} 万` : Math.round(n).toLocaleString('zh-CN'));
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function formName(b: SavedBuild) { return formOf(b.line, b.stage).name; }

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

export function monCard(m: PartyMon, opts: { selected?: boolean; onClick?: () => void; action?: Node | null } = {}) {
  const b = m.build;
  const f = formOf(b.line, b.stage);
  const items = b.items.reduce((a, [, n]) => a + n, 0);
  const rec = m.pvp.wins + m.pvp.losses + m.pvp.draws ? `${m.pvp.wins} 胜 ${m.pvp.losses} 负` : '还没有对战';
  return h('div', { class: `mon-card ${opts.selected ? 'on' : ''}`, onclick: opts.onClick, tabindex: opts.onClick ? 0 : undefined, 'data-pad': opts.onClick ? '1' : undefined },
    portraitSlot(f.dex, 2, 'mon-portrait'),
    h('div', { class: 'mon-body' },
      h('div', { class: 'mon-name' }, f.name, h('span', { class: 'mon-lv' }, ` Lv${b.level}`)),
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
export function releaseModal(party: PartyMon[], incoming: SavedBuild | null, onRelease: (uid: string) => void, onCancel: () => void) {
  const overlay = h('div', { class: 'modal' });
  const close = () => overlay.remove();
  overlay.appendChild(h('div', { class: 'box modal-box release' },
    h('h2', null, '背包满了'),
    h('p', { class: 'sub' }, incoming ? `最多只能带 ${PARTY_MAX} 只宝可梦。放生一只，把 ${formName(incoming)} Lv${incoming.level} 放进背包。` : `最多只能带 ${PARTY_MAX} 只宝可梦。`),
    h('div', { class: 'release-grid' }, party.map((m) => monCard(m, {
      action: h('button', { class: 'btn small danger', onclick: (e: Event) => {
        e.stopPropagation();
        sfx('click');
        close();
        onRelease(m.uid);
      } }, '放生'),
    }))),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => { close(); onCancel(); } }, '取消')),
  ));
  document.body.appendChild(overlay);
  (overlay.querySelector('.btn.danger') as HTMLElement | null)?.focus();
  return overlay;
}

// ---------------------------------------------------------------- 对战中心

export interface PvpActions {
  queue(mode: PvpMode, mon: PartyMon): void;
  cancel(): void;
  practice(mode: PvpMode, mon: PartyMon): void;
  release(uid: string): void;
  board(mode: PvpMode): void;
  adventure(): void;
  back(): void;
}

type Queued = Extract<S2C, { t: 'pvpQueued' }>;

export class PvpScreen {
  private boards: Partial<Record<PvpMode, Extract<S2C, { t: 'pvpBoard' }>>> = {};
  private boardMode: PvpMode;
  private queued: Queued | null = null;
  private waiting = false;
  private connected: boolean;
  private itemPage = 0;
  private boardPage = 0;

  constructor(private root: HTMLElement, private p: Profile, private a: PvpActions, connected: boolean) {
    this.connected = connected;
    this.boardMode = p.pvpMode;
    this.render();
  }

  setConnected(on: boolean) {
    if (on === this.connected) return;
    this.connected = on;
    if (!on) { this.queued = null; this.waiting = false; }
    this.render();
  }

  setBoard(b: Extract<S2C, { t: 'pvpBoard' }>) {
    this.boards[b.mode] = b;
    this.render();
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

  private selected(): PartyMon | null {
    return this.p.party.find((m) => m.uid === this.p.pvpPick) ?? this.p.party[0] ?? null;
  }

  render() {
    const p = this.p;
    const sel = this.selected();
    const mode = p.pvpMode;
    const busy = this.isQueued;

    const party = h('div', { class: 'pvp-col pvp-party' },
      h('h3', null, `背包 ${p.party.length} / ${PARTY_MAX}`),
      p.party.length ? h('div', { class: 'party-grid' },
        p.party.map((m) => monCard(m, { selected: m === sel, onClick: busy ? undefined : () => { sfx('click'); p.pvpPick = m.uid; this.itemPage = 0; this.render(); } })),
        Array.from({ length: PARTY_MAX - p.party.length }, () => h('div', { class: 'mon-card empty' }, h('span', { class: 'muted small' }, '空位'))),
      ) : h('div', { class: 'party-empty' },
        h('p', null, '背包里还没有宝可梦。'),
        h('p', { class: 'small muted' }, '完成一局冒险（无论通关与否），在结算界面点「放入背包」，就能用它来对战。等级、技能、道具和升级强化都会保留。'),
        h('button', { class: 'btn gold', onclick: () => { sfx('click'); this.a.adventure(); } }, '去冒险'),
      ),
      sel ? h('div', { class: 'pvp-detail' },
        h('div', { class: 'row between' },
          h('div', { class: 'pvp-detail-title' }, h('b', null, `${formName(sel.build)} Lv${sel.build.level}`), h('span', { class: 'small muted' }, ` ${originText(sel)} · 含研究所强化`)),
          confirmButton('放生', '再点一次放生', 'btn tiny ghost danger', () => { this.a.release(sel.uid); this.itemPage = 0; this.render(); }, { disabled: busy, title: '放生后无法找回' }),
        ),
        buildDetail(sel.build, p.upgrades, this.itemPage, (n) => { this.itemPage = n; this.render(); }),
      ) : null,
    );

    const rec = this.boards[mode]?.me ?? null;
    const rating = rec?.rating ?? START_RATING;
    const T = tierOf(rating);
    const modeTabs = h('div', { class: 'pvp-modes' }, PVP_MODE_IDS.map((id) => {
      const M = PVP_MODES[id];
      const r = this.boards[id]?.me;
      return h('button', {
        class: `pvp-mode ${mode === id ? 'on' : ''}`, disabled: busy && mode !== id,
        onclick: () => { if (busy) return; sfx('click'); p.pvpMode = id; this.boardMode = id; this.a.board(id); this.render(); },
      },
      h('b', null, M.name),
      h('small', null, id === '1v1' ? '一对一 · 90 秒' : '四对四 · 120 秒 · 可救援'),
      h('small', { class: 'muted' }, r?.games ? `${r.rating} 分 · ${r.wins} 胜 ${r.losses} 负` : '未定级'));
    }));

    const ratingCard = h('div', { class: 'pvp-rating' },
      tierBadge(rating, true),
      h('div', { class: 'grow' },
        h('div', { class: 'pvp-score' }, h('b', null, rating), h('span', { class: 'muted small' }, rec?.rank ? ` 第 ${rec.rank} 名` : rec?.games ? '' : ' 定级中')),
        h('div', { class: 'tier-bar' }, h('div', { style: `width:${Math.round(T.progress * 100)}%;background:${T.tier.color}` })),
        h('div', { class: 'small muted' }, T.next ? `距离${T.next.name}还差 ${T.next.min - rating} 分` : '最高段位'),
        h('div', { class: 'small' }, rec?.games ? `${rec.wins} 胜 ${rec.losses} 负${rec.draws ? ` ${rec.draws} 平` : ''} · 胜率 ${Math.round((rec.wins / rec.games) * 100)}%${rec.streak > 1 ? ` · ${rec.streak} 连胜` : ''}` : '还没有排位记录'),
      ),
    );

    let action: Node;
    if (!this.connected) {
      action = h('div', { class: 'pvp-queue' },
        h('div', { class: 'neg' }, '没有连接到对战服务器'),
        h('div', { class: 'small muted' }, '排位赛需要联网。可以先打一场离线练习赛。'),
      );
    } else if (busy) {
      const q = this.queued;
      action = h('div', { class: 'pvp-queue searching' },
        h('div', { class: 'pvp-spinner' }, iconImg('ball_poke', 3)),
        h('div', { class: 'grow' },
          h('b', null, `正在寻找对手… ${q ? fmtTime(q.wait) : ''}`),
          q ? h('div', { class: 'small muted' }, `匹配范围 ±${q.range} 分 · 队列中 ${q.searching} 人`) : null,
          q ? h('div', { class: 'small muted' }, q.botIn > 0 ? `${q.botIn} 秒后由 AI 训练家补位` : '正在安排 AI 训练家…') : null,
        ),
        h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => { sfx('click'); this.a.cancel(); } }, '取消'),
      );
    } else {
      action = h('button', {
        class: 'btn gold big go pvp-go', 'data-key': 'y', disabled: !sel,
        onclick: () => { if (!sel) return; sfx('click'); this.waiting = true; this.render(); this.a.queue(mode, sel); },
      }, '开始匹配', h('small', null, sel ? `${formName(sel.build)} Lv${sel.build.level} · ${PVP_MODES[mode].name}` : '先选择一只宝可梦'));
    }

    const history = this.boards[mode]?.history ?? [];
    const rules = h('button', { class: 'btn small ghost', 'data-pad': '1' }, '规则');
    tip(rules, () => h('div', { class: 'info' },
      h('b', null, '对战规则'),
      h('div', { class: 'small' }, '技能自动释放，走位躲开对手的招式；只会打到对手。'),
      h('div', { class: 'small' }, '30% 时间后场地开始缩小，圈外持续掉血；缩到最小后进入加时，伤害逐渐提高。'),
      h('div', { class: 'small' }, '击倒全部对手获胜；时间到时存活人数多、剩余 HP 多的一方获胜。团战可以站在倒下的队友身边救援。'),
      h('div', { class: 'small' }, '优先匹配分数接近的训练家，等待越久范围越大，没有真人时由 AI 训练家补位。'),
    ));
    const arena = h('div', { class: 'pvp-col pvp-arena' },
      modeTabs,
      ratingCard,
      action,
      h('div', { class: 'row pvp-sub-actions' },
        h('button', { class: 'btn small ghost grow', disabled: !sel || busy, onclick: () => { if (sel) { sfx('click'); this.a.practice(mode, sel); } } }, '练习赛（离线 · 不计分）'),
        rules,
      ),
      h('div', { class: 'pvp-history' }, h('h3', null, '最近对战'),
        history.length ? history.slice(0, 3).map(histRow) : h('div', { class: 'small muted' }, '还没有排位记录'),
        Array.from({ length: Math.max(0, 3 - Math.max(1, history.length)) }, () => h('div', { class: 'hist filler' })),
      ),
    );

    const bm = this.boardMode;
    const board = this.boards[bm];
    const boardEl = h('div', { class: 'pvp-col pvp-board' },
      h('div', { class: 'row between' },
        h('h3', null, '排行榜'),
        h('div', { class: 'tabs' }, PVP_MODE_IDS.map((id) => h('button', { class: `tab ${bm === id ? 'on' : ''}`, onclick: () => { this.boardMode = id; this.boardPage = 0; this.a.board(id); this.render(); } }, id))),
      ),
      h('div', { class: 'lb-head' }, h('span', null, '#'), h('span', null, '训练家'), h('span', null, '段位'), h('span', null, '积分'), h('span', null, '胜/负')),
      (() => {
        const rows = board?.rows ?? [];
        const pg = pager(rows, 10, this.boardPage, boardRow, {
          cls: 'lb',
          empty: () => h('div', { class: 'muted small' }, !this.connected ? '连接服务器后可以查看排行榜' : !board ? '加载中…' : '还没有人上榜，快来成为第一名！'),
          filler: () => h('div', { class: 'lb-row filler' }),
          onPage: (n) => { this.boardPage = n; this.render(); },
        });
        this.boardPage = pg.page;
        return h('div', { class: 'lb-wrap' }, pg.list, pg.nav);
      })(),
      board?.me?.games ? boardRow({ rank: board.me.rank, name: p.name || '训练家', rating: board.me.rating, wins: board.me.wins, losses: board.me.losses, draws: board.me.draws, streak: board.me.streak, dex: sel ? formOf(sel.build.line, sel.build.stage).dex : 0, you: true }) : h('div', { class: 'lb-row filler' }),
      h('div', { class: 'small muted' }, board ? `共 ${board.players} 位训练家参与排位` : ''),
    );

    mount(this.root, h('div', { class: 'box panel pvp' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'row' }, h('h2', null, '宝可梦对战'), h('span', { class: 'sub small' }, '用背包里的宝可梦和其他训练家一决高下 · 数值受大木研究所强化影响')),
        h('button', { class: 'btn small ghost', 'data-back': '1', onclick: () => { if (busy) this.a.cancel(); this.a.back(); } }, '返回'),
      ),
      h('div', { class: 'pvp-grid' }, party, arena, boardEl),
    ), 'pvp');
  }
}

function boardRow(r: PvpBoardRow) {
  const T = tierOf(r.rating).tier;
  return h('div', { class: `lb-row ${r.you ? 'me' : ''}` },
    h('span', { class: r.rank <= 3 ? `top${r.rank}` : '' }, r.rank || '-'),
    h('span', { class: 'board-mon' }, r.dex ? portraitSlot(r.dex, 1, 'tiny') : null, h('span', { class: 'lb-name' }, r.name)),
    h('span', { class: 'lb-tier', style: `color:${T.color}` }, iconImg(T.icon, 1), ` ${T.name}`),
    h('span', null, h('b', null, r.rating)),
    h('span', null, `${r.wins}/${r.losses}`),
  );
}

function histRow(x: PvpHistory) {
  const label = x.result === 'win' ? '胜' : x.result === 'loss' ? '负' : '平';
  return h('div', { class: `hist ${x.result}` },
    h('b', null, label),
    x.dex ? Animator.portrait(x.dex, 1) : null,
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
  const team = (t: number) => {
    const ps = res.players.filter((p) => p.team === t).sort((a, b) => score(b) - score(a));
    const mine = t === myTeam;
    const won = res.winner === t;
    return h('div', { class: `sb-team ${mine ? 'ally' : 'enemy'}` },
      h('div', { class: 'sb-head', style: `color:${TEAM_COLOR[mine ? 0 : 1]}` }, mine ? '我方' : '对方', res.winner < 0 ? ' · 平局' : won ? ' · 胜利' : ' · 失败'),
      h('table', { class: 'board' },
        h('tr', null, h('th', null, '训练家'), h('th', null, '宝可梦'), h('th', null, '伤害'), h('th', null, '承伤'), h('th', null, '回复'), h('th', null, '击倒'), h('th', null, '救援')),
        ps.map((p) => {
          const seat = seats.find((s) => s.id === p.id);
          return h('tr', { class: `${p.id === you ? 'me' : ''} ${p.alive ? '' : 'dead'}` },
            h('td', null, p.name, p.bot || seat?.bot ? h('span', { class: 'tag ai' }, 'AI') : null, p === mvp ? h('span', { class: 'tag mvp' }, 'MVP') : null),
            h('td', { class: 'board-mon' }, Animator.portrait(p.dex, 1), `${p.form} Lv${p.level}`),
            h('td', null, h('div', { class: 'dmg-cell' }, h('i', { style: `width:${(p.damage / maxDmg) * 100}%;background:${TEAM_COLOR[mine ? 0 : 1]}` }), h('span', null, fmt(p.damage)))),
            h('td', null, fmt(p.taken)), h('td', null, fmt(p.healed)), h('td', null, p.kos), h('td', null, p.revives),
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
    return p ? h('span', { style: `color:${TEAM_COLOR[p.team === myTeam ? 0 : 1]}` }, `${p.name}的${p.form}`) : h('span', { class: 'muted' }, '缩圈');
  };
  const pg = pager(res.feed, 10, page, ([t, k, v]) => h('div', { class: 'small ko-row' },
    h('span', { class: 'muted' }, fmtTime(t), ' '), k >= 0 ? name(k) : h('span', { class: 'muted' }, '缩小的场地'), ' 击倒了 ', name(v)), {
    cls: 'ko-feed', empty: () => h('div', { class: 'muted small' }, '没有人被击倒'), filler: () => h('div', { class: 'ko-row filler' }), onPage, keys: null,
  });
  return h('div', { class: 'r-paged' }, pg.list, pg.nav);
}

export interface PvpResultActions { again(): void; back(): void; home(): void }

export function pvpResultsScreen(root: HTMLElement, res: PvpMatchResult, you: number, rating: PvpRatingChange | null, seats: PvpSeatInfo[], practice: boolean, a: PvpResultActions, tab = 0, feedPage = 0) {
  const again = (t: number, f: number) => pvpResultsScreen(root, res, you, rating, seats, practice, a, t, f);
  const me = res.players.find((p) => p.id === you) ?? res.players[0];
  const myTeam = me.team;
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
  const hero = h('div', { class: 'r-hero' },
    portraitSlot(me.dex, 3, 'r-hero-portrait'),
    h('div', null,
      h('div', { class: 'big' }, `${me.form}  Lv${me.level}`),
      h('div', null, ...(LINES[me.line].forms.find((f) => f.dex === me.dex)?.types ?? []).map(typeBadge)),
      h('div', { class: 'small', style: `color:${me.alive ? '#78f878' : '#ff8c8c'}` }, me.alive ? `存活 · 剩余 HP ${me.hp} / ${me.maxHp}` : '被击倒'),
    ),
  );
  const tiles = h('div', { class: 'r-tiles' },
    tile('对战时长', fmtTime(res.time)),
    tile('造成伤害', fmt(me.damage), `效果拔群 ${me.superEff} 次`),
    tile('承受伤害', fmt(me.taken), `闪避 ${me.dodges} 次`),
    tile('回复', fmt(me.healed)),
    tile('击倒', me.kos, me.deaths ? `被击倒 ${me.deaths} 次` : '没有被击倒', me.kos ? '#ffd23f' : undefined),
    tile('救援', me.revives, res.mode === '4v4' ? '站在倒下的队友身边' : '团战可用'),
    tile('暴击', me.crits),
    tile('伤害占比', `${Math.round((me.damage / Math.max(1, res.players.filter((p) => p.team === myTeam).reduce((x, p) => x + p.damage, 0))) * 100)}%`, '在我方中'),
  );
  const content = tab === 0
    ? h('div', { class: 'r-grid' },
      h('div', { class: 'r-col' }, hero, tiles),
      h('div', { class: 'r-col' }, section('两队剩余 HP', hpChart(res, myTeam))))
    : tab === 1
      ? h('div', { class: 'r-full' }, section('计分板', scoreboard(res, you, myTeam, seats)))
      : h('div', { class: 'r-grid' },
        h('div', { class: 'r-col' }, section('我的技能伤害', skillBars(me))),
        h('div', { class: 'r-col' }, section('击倒记录', feedList(res, myTeam, feedPage, (n) => again(tab, n)))));
  mount(root, h('div', { class: 'box panel results pvp-results' },
    head,
    ratingEl ?? h('div', { class: 'pvp-rating result empty' }, h('span', { class: 'muted' }, practice ? '练习赛不计分，积分与段位不变' : '本场不计分')),
    tabs(['概览', '计分板', '技能与击倒'], tab, (t) => again(t, feedPage)),
    h('div', { class: 'tab-body' }, content),
  ), 'pvp-results');
}

