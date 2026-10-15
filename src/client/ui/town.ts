/**
 * 真新镇相关的界面：标题、开场（选训练家/初始伙伴/名字）、镇上的 HUD 与在线玩家、
 * 我的家（训练家与伙伴）、大木研究所（研究/图鉴/成就）、1 号道路（出发冒险）、NPC 对话。
 */
import { DEX } from '../../shared/dex';
import { ACHIEVEMENTS, trainerHint, unlockHint } from '../../shared/meta';
import { LINES, LINE_IDS, LINE_OF_DEX, STARTERS, formOf, type LineId } from '../../shared/pokemon';
import type { ServerStats } from '../../shared/protocol';
import { fmtMod, type ModKey } from '../../shared/stats';
import { TRAINERS, TRAINER_LIST, trainerOf } from '../../shared/trainers';
import { TYPE_NAME, type PType } from '../../shared/types';
import type { DifficultyId } from '../../shared/difficulty';
import { sfx } from '../audio';
import type { PlaceId, Spot } from '../gfx/town';
import { trainerFull, trainerPortrait } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { iconImg } from '../gfx/icons';
import {
  autoAssistUnlocked, buyLine, buyTrainer, isDifficultyUnlocked, isTrainerUnlocked, isUnlocked, saveProfile, unlockedLines, type Profile,
} from '../save';
import { clear, h, tip, toast } from './dom';
import { typeBadge } from './describe';
import { iconBtn, pager } from './layout';
import { achList, difficultyPicker, labGrid, lineDetail, mount, portraitSlot, tabs } from './screens';

export function partnerName(p: Profile) { return LINES[p.partner]?.name ?? '？？？'; }
export function partnerDex(p: Profile) { return formOf(p.partner, 0).dex; }

/** 训练家的加成（一行一条） */
export function trainerBonus(id: string): string[] {
  const t = trainerOf(id);
  const out = Object.entries(t.mods).map(([k, v]) => fmtMod(k as ModKey, v ?? 0));
  for (const [ty, v] of Object.entries(t.typeMods ?? {})) out.push(`${TYPE_NAME[ty as PType]}系技能伤害 +${v}%`);
  return out;
}

// ---------------------------------------------------------------- 标题

export interface TitleActions { play(): void; settings(): void; credits(): void }

export function onlineText(stats: ServerStats | null) {
  return stats ? `在线 ${stats.online} 人 · ${stats.playing} 人游戏中` : '正在连接联机服务器…';
}

export function titleScreen(root: HTMLElement, p: Profile, a: TitleActions, stats: ServerStats | null) {
  const owned = unlockedLines(p).length;
  mount(root, h('div', { class: 'title-wrap' },
    h('div', { class: 'logo' }, h('div', { class: 'logo-main' }, '宝可肉鸽'), h('div', { class: 'logo-sub' }, 'POKé ROUGE · 宝可梦割草肉鸽')),
    h('div', { class: 'box menu title-menu' },
      h('button', { class: 'menu-item play', 'data-key': 'y', onclick: () => { sfx('click'); a.play(); } },
        h('span', { class: 'mi-ico' }, uiIcon('play', 3)),
        h('span', { class: 'mi-text' }, p.setup ? '继续游戏' : '开始游戏',
          h('small', null, p.setup ? `${p.name || '训练家'} · ${TRAINERS[p.trainer]?.name ?? ''} · 伙伴 ${partnerName(p)} · 已有 ${owned} 种宝可梦` : '选择训练家与第一只宝可梦，从真新镇出发'))),
      h('button', { class: 'menu-item', onclick: () => { sfx('click'); a.settings(); } },
        h('span', { class: 'mi-ico' }, uiIcon('gear', 3)), h('span', { class: 'mi-text' }, '设置', h('small', null, '音量、界面大小、帧率与画质'))),
      h('button', { class: 'menu-item', onclick: () => { sfx('click'); a.credits(); } },
        h('span', { class: 'mi-ico' }, uiIcon('book', 3)), h('span', { class: 'mi-text' }, '说明与致谢', h('small', null, '玩法、操作、素材来源'))),
      h('div', { class: 'small muted title-online', id: 'title-online' }, onlineText(stats)),
    ),
  ), 'title');
}

// ---------------------------------------------------------------- 开场

export function trainerCard(id: string, opts: { on?: boolean; locked?: boolean; onClick?: () => void; foot?: Node | string | null; compact?: boolean } = {}) {
  const t = TRAINERS[id];
  const el = h('button', { class: `tcard ${opts.on ? 'on' : ''} ${opts.locked ? 'locked' : ''} ${opts.compact ? 'compact' : ''}`, onclick: opts.onClick },
    h('div', { class: 'tcard-sprite' }, opts.compact ? trainerPortrait(id, 1) : trainerFull(id, 1)),
    h('div', { class: 'tcard-body' },
      h('div', { class: 'tcard-name' }, t.name, h('span', { class: 'tcard-title' }, t.title)),
      h('div', { class: 'tcard-bonus small' }, trainerBonus(id).map((s) => h('div', { class: /-\d/.test(s) ? 'neg' : 'pos' }, s))),
      opts.foot ? h('div', { class: 'tcard-foot small' }, opts.foot) : null,
    ),
  );
  tip(el, () => h('div', { class: 'info' }, h('b', null, `${t.name} · ${t.title}`), h('div', { class: 'small' }, t.desc), ...trainerBonus(id).map((s) => h('div', { class: 'small pos' }, s)), opts.locked ? h('div', { class: 'small neg' }, trainerHint(id)) : null));
  return el;
}

function starterCard(line: LineId, on: boolean, onClick: () => void) {
  const L = LINES[line];
  return h('button', { class: `scard ${on ? 'on' : ''}`, onclick: onClick },
    portraitSlot(L.forms[0].dex, 2, 'scard-portrait'),
    h('div', { class: 'scard-name' }, L.name),
    h('div', { class: 'scard-types' }, ...L.forms[0].types.map(typeBadge)),
  );
}

export function setupScreen(root: HTMLElement, p: Profile, onDone: (trainer: string, starter: LineId, name: string) => void) {
  let trainer = isTrainerUnlocked(p, p.trainer) ? p.trainer : 'ash';
  let starter: LineId = STARTERS.includes(p.partner) ? p.partner : 'charmander';
  let name = p.name || '';
  const render = () => {
    const input = h('input', { class: 'field', maxlength: 12, placeholder: TRAINERS[trainer].name, value: name }) as HTMLInputElement;
    input.addEventListener('input', () => { name = input.value.trim().slice(0, 12); });
    const L = LINES[starter];
    const done = () => {
      sfx('wave');
      onDone(trainer, starter, (name || TRAINERS[trainer].name).slice(0, 12));
    };
    mount(root, h('div', { class: 'box panel setup' },
      h('div', { class: 'panel-head' },
        h('div', null,
          h('h2', null, '欢迎来到宝可梦的世界！'),
          h('div', { class: 'sub small' }, p.stats.runs ? '我是大木博士。你以前的研究、成就和背包都还在，重新告诉我你是谁吧。' : '我是大木博士。在出发之前，先告诉我你是谁、想和哪只宝可梦一起冒险吧。'),
        ),
      ),
      h('div', { class: 'setup-body' },
        h('div', { class: 'setup-col' },
          h('h3', null, '1. 你是？'),
          (() => {
            const list = TRAINER_LIST.filter((t) => isTrainerUnlocked(p, t.id));
            return h('div', { class: 'setup-trainers' }, list.map((t) => trainerCard(t.id, { on: trainer === t.id, compact: list.length > 2, onClick: () => { sfx('click'); trainer = t.id; render(); } })));
          })(),
          h('div', { class: 'small muted' }, '其他训练家可以在冒险中达成成就，或者用星之沙在「我的家」招募。'),
        ),
        h('div', { class: 'setup-col' },
          h('h3', null, '2. 选择第一只宝可梦'),
          h('div', { class: 'setup-starters' }, STARTERS.map((s) => starterCard(s, starter === s, () => { sfx('click'); starter = s; render(); }))),
          h('div', { class: 'small setup-flavor' }, L.flavor),
          h('div', { class: 'small muted' }, '其他宝可梦要在冒险中结交：击败野生宝可梦时，它有几率崇拜你、成为你的伙伴。'),
        ),
        h('div', { class: 'setup-col setup-name' },
          h('h3', null, '3. 你的名字'),
          input,
          h('div', { class: 'setup-preview' }, trainerFull(trainer, 2), portraitSlot(L.forms[0].dex, 3, 'setup-mon')),
          h('button', { class: 'btn gold big go', 'data-key': 'y', onclick: done }, '出发！'),
        ),
      ),
    ), 'setup');
  };
  render();
}

// ---------------------------------------------------------------- 选择伙伴

const PICK_PER = 21;

/** 宝可梦格子（按图鉴顺序，分页）：没有的显示剪影 */
export function partnerGrid(p: Profile, sel: LineId | null, onPick: (l: LineId) => void, page: number, onPage: (n: number) => void, opts: { ownedOnly?: boolean; taken?: Map<LineId, string> } = {}) {
  const ids = opts.ownedOnly ? LINE_IDS.filter((l) => isUnlocked(p, l)) : LINE_IDS;
  const pg = pager(ids, PICK_PER, page, (id) => {
    const L = LINES[id];
    const open = isUnlocked(p, id);
    const el = h('button', {
      class: `pmon ${sel === id ? 'on' : ''} ${open ? '' : 'locked'} ${p.partner === id ? 'partner' : ''}`,
      onclick: () => { sfx('click'); onPick(id); },
    },
    portraitSlot(L.forms[0].dex, 1, 'pmon-portrait'),
    h('span', { class: 'pmon-name' }, open ? L.name : '？？？'),
    opts.taken?.get(id) ? h('i', { class: 'pmon-tag' }, opts.taken.get(id)!) : p.partner === id ? h('i', { class: 'pmon-tag' }, '伙伴') : null,
    );
    tip(el, () => open ? `${L.name} · ${L.forms.map((f) => f.name).join(' → ')}` : unlockHint(id));
    return el;
  }, { cls: 'pmon-grid', filler: () => h('div', { class: 'pmon filler' }), onPage, label: `已拥有 ${unlockedLines(p).length} / ${LINE_IDS.length} 种` });
  return h('div', { class: 'pmon-wrap' }, pg.list, pg.nav);
}

/** 宝可梦详情：没有的显示解锁方式 */
function lockedDetail(id: LineId) {
  const L = LINES[id];
  return h('div', { class: 'line-detail locked-detail' },
    portraitSlot(L.forms[0].dex, 3, 'ld-portrait silhouette'),
    h('h2', null, '？？？'),
    h('p', { class: 'sub' }, '还没有成为你的伙伴。'),
    h('p', { class: 'small' }, unlockHint(id)),
    L.unlock.cost ? h('p', { class: 'small gold' }, `可以在真新镇向鲤鱼王推销员购买（${L.unlock.cost} 星之沙）`) : null,
  );
}

/** 换伙伴（弹窗）：大厅、出发前都可以换 */
export function partnerModal(p: Profile, onPick: (l: LineId) => void, opts: { taken?: Map<LineId, string> } = {}) {
  const overlay = h('div', { class: 'modal' });
  let sel: LineId = p.partner;
  let page = Math.floor(LINE_IDS.filter((l) => isUnlocked(p, l)).indexOf(sel) / PICK_PER);
  const close = () => overlay.remove();
  const render = () => {
    clear(overlay);
    const open = isUnlocked(p, sel);
    overlay.appendChild(h('div', { class: 'box modal-box partner-modal no-anim' },
      h('div', { class: 'panel-head' },
        h('h2', null, '选择跟随的伙伴'),
        iconBtn('close', '关闭', () => { sfx('click'); close(); }, { attrs: { 'data-back': '1' }, cls: 'ghost small' }),
      ),
      h('div', { class: 'partner-body' },
        partnerGrid(p, sel, (l) => { sel = l; render(); }, page, (n) => { page = n; render(); }, { ownedOnly: true, taken: opts.taken }),
        h('div', { class: 'partner-side' },
          open ? lineDetail(sel, true) : lockedDetail(sel),
          h('button', { class: 'btn gold', 'data-key': 'y', disabled: !open, onclick: () => { sfx('wave'); close(); onPick(sel); } }, p.partner === sel ? `继续和${LINES[sel].name}一起` : `就决定是你了，${LINES[sel].name}！`),
        ),
      ),
    ));
  };
  render();
  document.body.appendChild(overlay);
  return overlay;
}

// ---------------------------------------------------------------- 我的家：训练家与伙伴

export interface HomeActions { back(): void; changed(): void }

export function homeScreen(root: HTMLElement, p: Profile, a: HomeActions, tab = 0, state = { page: -1, sel: '' as LineId, ownedOnly: false }) {
  const re = (t = tab) => homeScreen(root, p, a, t, state);
  if (!state.sel) state.sel = p.partner;
  let body: Node;
  if (tab === 0) {
    const input = h('input', { class: 'field', maxlength: 12, value: p.name }) as HTMLInputElement;
    input.addEventListener('change', () => { p.name = input.value.trim().slice(0, 12) || p.name; saveProfile(p); a.changed(); toast(`以后就叫你${p.name}了`); });
    body = h('div', { class: 'home-trainers' },
      h('div', { class: 'home-tgrid' }, TRAINER_LIST.map((t) => {
        const open = isTrainerUnlocked(p, t.id);
        const cost = t.unlock.cost;
        const foot = p.trainer === t.id ? h('span', { class: 'ok' }, '使用中')
          : open ? h('span', { class: 'gold' }, '点击换成这位训练家')
            : cost ? h('span', null, iconImg('stardust', 1), ` ${cost} 星之沙招募`)
              : h('span', { class: 'neg' }, trainerHint(t.id));
        return trainerCard(t.id, {
          on: p.trainer === t.id, locked: !open, compact: true, foot,
          onClick: () => {
            if (open) {
              if (p.trainer === t.id) return;
              sfx('click'); p.trainer = t.id; saveProfile(p); a.changed(); re(); return;
            }
            if (cost && buyTrainer(p, t.id)) { sfx('achieve'); toast(`${t.name}加入了！`, 'gold'); p.trainer = t.id; saveProfile(p); a.changed(); re(); return; }
            sfx('error');
            toast(cost ? `星之沙不够（需要 ${cost}）` : trainerHint(t.id), 'error');
          },
        });
      })),
      h('div', { class: 'home-name' }, h('label', null, uiIcon('pencil', 2), ' 训练家的名字'), input, h('div', { class: 'small muted' }, `星之沙 ${p.stardust}`)),
    );
  } else {
    const ids = state.ownedOnly ? LINE_IDS.filter((l) => isUnlocked(p, l)) : LINE_IDS;
    if (state.page < 0) state.page = Math.max(0, Math.floor(ids.indexOf(state.sel) / PICK_PER));
    const open = isUnlocked(p, state.sel);
    body = h('div', { class: 'partner-body' },
      h('div', { class: 'partner-left' },
        h('div', { class: 'row between' },
          h('span', { class: 'small muted' }, uiIcon('pc', 2), ' 宝可梦存储系统'),
          h('button', { class: `btn tiny ${state.ownedOnly ? '' : 'ghost'}`, onclick: () => { state.ownedOnly = !state.ownedOnly; state.page = 0; re(); } }, state.ownedOnly ? '显示全部宝可梦' : '只看已拥有的'),
        ),
        partnerGrid(p, state.sel, (l) => { state.sel = l; re(); }, state.page, (n) => { state.page = n; re(); }, { ownedOnly: state.ownedOnly }),
      ),
      h('div', { class: 'partner-side' },
        open ? lineDetail(state.sel, true) : lockedDetail(state.sel),
        h('button', {
          class: 'btn gold', 'data-key': 'y', disabled: !open || p.partner === state.sel,
          onclick: () => { sfx('wave'); p.partner = state.sel; saveProfile(p); a.changed(); toast(`${LINES[state.sel].name}现在跟着你了！`, 'gold'); re(); },
        }, p.partner === state.sel ? `${LINES[state.sel].name}正跟着你` : open ? `让${LINES[state.sel].name}跟着我` : '还没有成为伙伴'),
      ),
    );
  }
  mount(root, h('div', { class: 'box panel home' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, uiIcon('home', 3), h('h2', null, '我的家')),
      tabs(['训练家', '伙伴'], tab, (i) => re(i)),
      iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' }),
    ),
    body,
  ), 'home');
}

// ---------------------------------------------------------------- 大木研究所：研究、图鉴、成就

const DEX_PER = 32;

function dexGrid(p: Profile, page: number, onPage: (n: number) => void) {
  const all = Array.from({ length: 151 }, (_, i) => i + 1);
  const owned = all.filter((d) => isUnlocked(p, LINE_OF_DEX[d])).length;
  const pg = pager(all, DEX_PER, page, (d) => {
    const line = LINE_OF_DEX[d];
    const open = isUnlocked(p, line);
    const el = h('div', { class: `dex-cell ${open ? '' : 'locked'}` },
      h('span', { class: 'dex-no' }, `#${String(d).padStart(3, '0')}`),
      portraitSlot(d, 1, 'dex-portrait'),
      h('span', { class: 'dex-name' }, open ? DEX[d].name : '？？？'),
    );
    tip(el, () => open ? h('div', { class: 'info' }, h('b', null, `#${d} ${DEX[d].name}`), h('div', null, ...DEX[d].types.map(typeBadge)), h('div', { class: 'small muted' }, LINES[line].flavor)) : unlockHint(line));
    return el;
  }, { cls: 'dex-grid', onPage, label: `图鉴 ${owned} / 151` });
  return h('div', { class: 'dex-wrap' }, pg.list, pg.nav);
}

export function labHub(root: HTMLElement, p: Profile, a: HomeActions, tab = 0, page = 0) {
  const re = (t = tab, pg = page) => labHub(root, p, a, t, pg);
  const body = tab === 0 ? labGrid(p, () => { a.changed(); re(); })
    : tab === 1 ? dexGrid(p, page, (n) => re(1, n))
      : achList(p, page, (n) => re(2, n));
  mount(root, h('div', { class: 'box panel lab' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, uiIcon('flask', 3), h('h2', null, '大木研究所')),
      tabs(['研究', '图鉴', `成就 ${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`], tab, (i) => re(i, 0)),
      h('div', { class: 'row' }, h('div', { class: 'money' }, iconImg('stardust', 2), ` ${p.stardust}`), iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' })),
    ),
    body,
  ), 'lab');
}

// ---------------------------------------------------------------- 1 号道路：出发冒险

export interface RouteActions { go(d: DifficultyId): void; partner(): void; back(): void }

export function routeScreen(root: HTMLElement, p: Profile, a: RouteActions) {
  let diff: DifficultyId = isDifficultyUnlocked(p, p.lastDifficulty) ? p.lastDifficulty : 'easy';
  const render = () => {
    const L = LINES[p.partner];
    mount(root, h('div', { class: 'box panel-md route' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'row' }, uiIcon('sign', 3), h('h2', null, '1号道路 · 出发冒险')),
        iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '回镇上' }),
      ),
      h('div', { class: 'route-team' },
        h('div', { class: 'route-who' }, trainerFull(p.trainer, 1), h('div', null, h('b', null, p.name || TRAINERS[p.trainer].name), h('div', { class: 'small muted' }, TRAINERS[p.trainer].title), h('div', { class: 'small pos' }, trainerBonus(p.trainer).join(' · ')))),
        h('div', { class: 'route-mon' }, portraitSlot(L.forms[0].dex, 3, 'route-portrait'),
          h('div', null, h('b', null, L.name), h('div', null, ...L.forms[0].types.map(typeBadge)), h('div', { class: 'small muted' }, `技能栏 ${L.forms[0].slots} 个 · ${L.forms.map((f) => f.name).join(' → ')}`)),
          iconBtn('swap', '换伙伴', () => { sfx('click'); a.partner(); }, { cls: 'small', text: '换伙伴' })),
      ),
      difficultyPicker(p, diff, (d) => { diff = d; render(); }),
      h('p', { class: 'small muted' }, '一路上会有野生宝可梦乱入，击败它们，也许它们会崇拜你、成为新的伙伴。'),
      h('div', { class: 'row between route-foot' },
        assistToggle(p, render),
        h('button', { class: 'btn gold big go', 'data-key': 'y', onclick: () => { p.lastDifficulty = diff; saveProfile(p); sfx('wave'); a.go(diff); } }, `出发！`),
      ),
    ), 'route');
  };
  render();
}

/** AI 辅助战斗开关：首次通关后解锁 */
function assistToggle(p: Profile, render: () => void) {
  const open = autoAssistUnlocked(p);
  const on = open && p.autoAssist;
  return h('div', { class: 'route-assist' },
    h('button', {
      class: `btn small route-auto ${on ? 'on' : ''}`, disabled: !open,
      onclick: () => { sfx('click'); p.autoAssist = !p.autoAssist; saveProfile(p); render(); },
    }, uiIcon(open ? 'robot' : 'lock', 2), h('span', null, `AI 辅助战斗${open ? (on ? '：开' : '：关') : ''}`)),
    h('div', { class: 'small muted' }, open
      ? 'AI 替你走位、躲招、捡糖果，你专心挑技能和道具；战斗中按 T 随时切换。'
      : '首次通关后解锁：AI 替你走位，你专心构筑。'),
  );
}

// ---------------------------------------------------------------- NPC 对话

export function npcDialog(root: HTMLElement, speaker: string, text: string, buttons: [string, () => void, string?][]) {
  mount(root, h('div', { class: 'box dialog' },
    h('div', { class: 'dialog-who' }, speaker),
    h('p', { class: 'dialog-text' }, text),
    h('div', { class: 'row end' }, buttons.map(([label, fn, cls], i) => h('button', { class: `btn ${cls ?? ''}`, 'data-back': i === buttons.length - 1 ? '1' : undefined, onclick: () => { sfx('click'); fn(); } }, label))),
  ), 'dialog');
}

export function karpDialog(root: HTMLElement, p: Profile, done: (bought: boolean) => void) {
  const cost = LINES.magikarp.unlock.cost ?? 300;
  if (isUnlocked(p, 'magikarp')) {
    npcDialog(root, '鲤鱼王推销员', '上次那只鲤鱼王还好吗？只要耐心培养，它可是会变成很厉害的宝可梦哦。', [['好的', () => done(false)]]);
    return;
  }
  npcDialog(root, '鲤鱼王推销员', `嘿，训练家！要不要来一只鲤鱼王？现在只要 ${cost} 星之沙！（你有 ${p.stardust} 星之沙）`, [
    ['买下', () => {
      if (buyLine(p, 'magikarp')) { sfx('achieve'); toast('鲤鱼王成为了你的伙伴！', 'gold'); done(true); }
      else { sfx('error'); toast('星之沙不够', 'error'); }
    }, 'gold'],
    ['算了', () => done(false), 'ghost'],
  ]);
}

// ---------------------------------------------------------------- 快速前往

/** 不用走到建筑门口也能直接打开的地方（数字键 1~5） */
export const QUICK: { id: PlaceId; icon: string; name: string; hint: string }[] = [
  { id: 'route', icon: 'sign', name: '冒险', hint: '1号道路 · 带着伙伴出发' },
  { id: 'center', icon: 'cross', name: '联机', hint: '宝可梦中心 · 和朋友一起冒险' },
  { id: 'battle', icon: 'sword', name: '对战', hint: '对战场 · 排位赛与练习赛' },
  { id: 'lab', icon: 'flask', name: '研究所', hint: '大木研究所 · 研究、图鉴、成就' },
  { id: 'home', icon: 'home', name: '我的家', hint: '换训练家、换伙伴、改名' },
];

/** 快速前往（手柄 Y / 键盘 M） */
export function quickMenu(root: HTMLElement, go: (id: PlaceId) => void, back: () => void) {
  mount(root, h('div', { class: 'box quick-menu' },
    h('div', { class: 'panel-head' }, h('h2', null, '快速前往'), iconBtn('close', '关闭', back, { attrs: { 'data-back': '1' }, cls: 'ghost small' })),
    h('div', { class: 'menu-list' }, QUICK.map((q, i) => h('button', { class: `menu-item ${i === 0 ? 'play' : ''}`, onclick: () => go(q.id) },
      h('span', { class: 'mi-ico' }, uiIcon(q.icon, 3)),
      h('span', { class: 'mi-text' }, `${i + 1}. ${q.name}`, h('small', null, q.hint)),
    ))),
  ), 'quick');
}

// ---------------------------------------------------------------- 镇上的 HUD

export interface TownHudActions { card(): void; settings(): void; help(): void; title(): void; interact(): void; go(id: PlaceId): void }

const WHERE_NAME: Record<string, string> = { town: '在真新镇', menu: '在标题界面', room: '在联机房间', game: '冒险中', pvp: '对战中' };

export class TownHud {
  root: HTMLElement;
  private card = h('button', { class: 'th-card box tight' });
  private onlineBtn: HTMLButtonElement;
  private onlineList = h('div', { class: 'th-online box tight hidden' });
  private prompt = h('button', { class: 'th-prompt box tight hidden' });
  private dust = h('div', { class: 'th-dust box tight' });
  private peers: { name: string; trainer: string; dex: number; where: string }[] = [];
  private total = 1;

  constructor(parent: HTMLElement, private p: Profile, a: TownHudActions) {
    this.card.addEventListener('click', () => { sfx('click'); a.card(); });
    this.prompt.addEventListener('click', () => a.interact());
    this.onlineBtn = iconBtn('friends', '在线玩家', () => { sfx('click'); this.onlineList.classList.toggle('hidden'); this.renderOnline(); }, { cls: 'small th-btn', text: '1' });
    this.root = h('div', { id: 'town-hud' },
      this.card,
      h('div', { class: 'th-top' },
        this.onlineBtn,
        iconBtn('gear', '设置', () => { sfx('click'); a.settings(); }, { cls: 'small th-btn' }),
        iconBtn('help', '说明', () => { sfx('click'); a.help(); }, { cls: 'small th-btn' }),
        iconBtn('door', '回到标题', () => { sfx('click'); a.title(); }, { cls: 'small th-btn' }),
      ),
      this.onlineList,
      this.dust,
      this.prompt,
      h('div', { class: 'th-quick' }, QUICK.map((q, i) => {
        const b = iconBtn(q.icon, `${q.name}（${i + 1}）：${q.hint}`, () => { sfx('click'); a.go(q.id); }, { cls: 'small th-btn', text: q.name });
        b.appendChild(h('i', { class: 'th-num' }, String(i + 1)));
        return b;
      })),
    );
    parent.appendChild(this.root);
    this.refresh();
  }

  destroy() { this.root.remove(); }
  show(on: boolean) { this.root.classList.toggle('hidden', !on); }

  /** 训练家与伙伴卡片、星之沙 */
  refresh() {
    const p = this.p;
    clear(this.card);
    this.card.append(
      h('div', { class: 'th-trainer' }, trainerPortrait(p.trainer, 1)),
      h('div', { class: 'th-info' },
        h('div', { class: 'th-name' }, p.name || TRAINERS[p.trainer].name),
        h('div', { class: 'th-title small muted' }, TRAINERS[p.trainer].title),
        h('div', { class: 'th-partner small' }, h('span', { class: 'muted' }, '伙伴 '), partnerName(p)),
      ),
      h('div', { class: 'th-mon' }, portraitSlot(partnerDex(p), 1, 'th-mon-portrait')),
    );
    clear(this.dust);
    this.dust.append(
      h('span', { title: '星之沙' }, iconImg('stardust', 1), ` ${p.stardust}`),
      h('span', { title: '拥有的宝可梦' }, uiIcon('ball', 1), ` ${unlockedLines(p).length}/${LINE_IDS.length}`),
      h('span', { title: '成就' }, uiIcon('trophy', 1), ` ${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`),
    );
  }

  setOnline(peers: { name: string; trainer: string; dex: number; where: string }[], total?: number) {
    this.peers = peers;
    this.total = total ?? peers.length + 1;
    const span = this.onlineBtn.querySelector('span');
    if (span) span.textContent = String(this.total);
    if (!this.onlineList.classList.contains('hidden')) this.renderOnline();
  }

  private renderOnline() {
    clear(this.onlineList);
    const list = this.peers.slice().sort((a, b) => Number(b.where === 'town') - Number(a.where === 'town')).slice(0, 12);
    this.onlineList.append(
      h('div', { class: 'th-online-head' }, `在线 ${this.total} 人`),
      ...(list.length ? list.map((q) => h('div', { class: 'th-peer' },
        trainerPortrait(q.trainer, 1, 'tportrait tiny'),
        portraitSlot(q.dex, 1, 'tiny'),
        h('span', { class: 'th-peer-name' }, q.name),
        h('span', { class: `small ${q.where === 'town' ? 'ok' : 'muted'}` }, WHERE_NAME[q.where] ?? ''),
      )) : [h('div', { class: 'small muted' }, '现在只有你在线。邀请朋友一起来吧！')]),
      this.peers.length > 12 ? h('div', { class: 'small muted' }, `……还有 ${this.peers.length - 12} 人`) : '',
    );
  }

  setSpot(s: Spot | null) {
    this.prompt.classList.toggle('hidden', !s);
    if (!s) return;
    clear(this.prompt);
    this.prompt.append(h('span', { class: 'th-key' }), h('b', null, s.label), h('span', { class: 'small muted' }, ` ${s.hint}`));
  }
}

