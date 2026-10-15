/**
 * 真新镇相关的界面：标题、开场（选训练家/初始伙伴/名字）、镇上的 HUD 与在线玩家、
 * 我的家（训练家与伙伴）、大木研究所（研究/图鉴/成就）、1 号道路（出发冒险）、NPC 对话。
 */
import { DEX } from '../../shared/dex';
import { ACHIEVEMENTS, metaBonus, trainerHint, unlockHint } from '../../shared/meta';
import { LINES, LINE_IDS, LINE_OF_DEX, STARTERS, formOf, type LineId } from '../../shared/pokemon';
import type { ServerStats } from '../../shared/protocol';
import { fmtMod, type ModKey } from '../../shared/stats';
import { TRAINERS, TRAINER_LIST, trainerOf } from '../../shared/trainers';
import { TYPE_NAME, type PType } from '../../shared/types';
import type { DifficultyId } from '../../shared/difficulty';
import { sfx } from '../audio';
import type { PlaceId, Spot } from '../gfx/town';
import { artFull, trainerFull, trainerPortrait } from '../gfx/trainers';
import { Animator } from '../gfx/sprites';
import { nextGoal, talk, typeText } from './guide';
import { GYMS, GYM_BY_ID } from '../../shared/gyms';
import { uiIcon } from '../gfx/uiicons';
import { iconImg } from '../gfx/icons';
import {
  autoAssistUnlocked, buyLine, buyTrainer, isDifficultyUnlocked, isTrainerUnlocked, isUnlocked, monKey, monList, ownsMon, partnerOf, sameMon, saveProfile,
  unlockedLines, type Mon, type Profile,
} from '../save';
import { shinyName, shinyOdds } from '../../shared/shiny';
import type { OnlinePeer } from '../town';
import { clear, h, tip, toast } from './dom';
import { typeBadge } from './describe';
import { iconBtn, pager } from './layout';
import { achList, buildsLine, difficultyPicker, labGrid, lineDetailModal, lineSummary, mount, portraitSlot, tabs } from './screens';

export function partnerName(p: Profile) { return LINES[p.partner] ? shinyName(LINES[p.partner].name, p.partnerShiny) : '？？？'; }
export function partnerDex(p: Profile) { return formOf(p.partner, 0).dex; }
/** 宝可梦的名字（闪光的叫「闪光 + 名字」） */
export const monName = (m: Mon) => shinyName(LINES[m.line]?.name ?? '？？？', m.shiny);

/** 这位训练家现在的闪光几率（研究所 + 训练家；冒险中的闪耀护符另算） */
export function shinyOddsOf(p: Profile) {
  return shinyOdds((metaBonus(p.upgrades).mods.shiny ?? 0) + (TRAINERS[p.trainer]?.mods.shiny ?? 0));
}

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
        h('span', { class: 'mi-ico' }, uiIcon('gear', 3)), h('span', { class: 'mi-text' }, '设置', h('small', null, '音量、界面缩放、帧率与画质、手柄'))),
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

/** 开场的步骤：大木博士一步一步地问 */
const SETUP_STEPS = ['欢迎', '训练家', '名字', '伙伴', '出发'] as const;
const NAME_IDEAS = ['小赤', '小智', '阿红', '小蓝', '小遥', '小光', '阿亮', '小悠'];

/**
 * 开场：大木博士站在左边，下面的对话框一句一句地说明现在要做什么，
 * 右边只显示这一步要选的东西（训练家 → 名字 → 第一只宝可梦 → 确认），可以随时返回上一步。
 */
export function setupScreen(root: HTMLElement, p: Profile, onDone: (trainer: string, starter: LineId, name: string) => void) {
  let trainer = isTrainerUnlocked(p, p.trainer) ? p.trainer : 'ash';
  let starter: LineId = STARTERS.includes(p.partner) ? p.partner : 'charmander';
  let name = p.name || '';
  let step = 0;
  const who = () => name || TRAINERS[trainer].name;
  const say = (): string => {
    switch (step) {
      case 0: return p.stats.runs
        ? '又见面了！你以前的研究、成就和背包都还在。不过这个世界变了不少，我们重新登记一下吧。'
        : '你好！欢迎来到宝可梦的世界！我叫大木，大家都叫我宝可梦博士。这个世界上到处都住着叫做「宝可梦」的生物……';
      case 1: return '首先，请告诉我：你是哪一位训练家？每位训练家都有自己擅长的东西。';
      case 2: return `原来是${TRAINERS[trainer].title}啊！那么，你的名字是？`;
      case 3: return `${who()}！我这里有三只宝可梦，选一只作为你的第一个伙伴吧！`;
      default: return `${who()}和${LINES[starter].name}……真是好搭档！你的宝可梦传说就要开始了，梦想与冒险的世界在等着你！`;
    }
  };
  const go = (n: number) => { sfx('click'); step = Math.max(0, Math.min(SETUP_STEPS.length - 1, n)); render(); };
  const finish = () => { sfx('wave'); onDone(trainer, starter, who().slice(0, 12)); };

  const stage = (): Node => {
    if (step === 0) {
      return h('div', { class: 'setup-hello' },
        h('div', { class: 'setup-hello-mons' }, [25, 1, 4, 7].map((d, i) => h('div', { class: 'setup-hello-mon', style: `--d:${i}` }, Animator.portrait(d, 3)))),
        h('p', { class: 'small muted' }, '在这里，你要和宝可梦一起冒险、结交新的伙伴、挑战道馆，成为最强的训练家。'),
      );
    }
    if (step === 1) {
      const list = TRAINER_LIST.filter((t) => isTrainerUnlocked(p, t.id));
      return h('div', { class: 'setup-step' },
        h('div', { class: 'setup-trainers' }, list.map((t) => trainerCard(t.id, { on: trainer === t.id, compact: list.length > 2, onClick: () => { sfx('click'); trainer = t.id; render(); } }))),
        h('div', { class: 'small muted' }, '其他训练家可以在冒险或道馆中达成成就，或者用星之沙在「我的家」招募。'),
      );
    }
    if (step === 2) {
      const input = h('input', { class: 'field setup-input', maxlength: 12, placeholder: TRAINERS[trainer].name, value: name }) as HTMLInputElement;
      input.addEventListener('input', () => { name = input.value.trim().slice(0, 12); });
      // 阻止默认行为：否则回车会接着点到下一步新出现的按钮，一下跳过两步
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(3); } });
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
      return h('div', { class: 'setup-step setup-name' },
        h('div', { class: 'setup-preview' }, trainerFull(trainer, 2)),
        h('div', { class: 'setup-name-form' },
          input,
          h('div', { class: 'small muted' }, '不填就用训练家原来的名字。也可以选一个：'),
          h('div', { class: 'setup-ideas' }, NAME_IDEAS.map((n) => h('button', { class: `btn tiny ${name === n ? 'gold' : 'ghost'}`, onclick: () => { sfx('click'); name = n; render(); } }, n))),
        ),
      );
    }
    if (step === 3) {
      const L = LINES[starter];
      return h('div', { class: 'setup-step' },
        h('div', { class: 'setup-starters' }, STARTERS.map((s) => starterCard(s, starter === s, () => { sfx('click'); starter = s; render(); }))),
        h('div', { class: 'small setup-flavor' }, L.flavor),
        h('div', { class: 'small muted' }, '其他宝可梦要在冒险中结交：击败野生宝可梦时，它有几率崇拜你、成为你的伙伴。'),
      );
    }
    const L = LINES[starter];
    return h('div', { class: 'setup-step setup-confirm' },
      h('div', { class: 'setup-preview' }, trainerFull(trainer, 2), portraitSlot(L.forms[0].dex, 3, 'setup-mon')),
      h('div', { class: 'setup-summary' },
        h('div', null, h('span', { class: 'muted' }, '训练家 '), h('b', null, `${who()}（${TRAINERS[trainer].name}）`)),
        h('div', { class: 'small pos' }, trainerBonus(trainer).join(' · ')),
        h('div', null, h('span', { class: 'muted' }, '第一个伙伴 '), h('b', null, L.name), ' ', ...L.forms[0].types.map(typeBadge)),
      ),
    );
  };

  const render = () => {
    const text = h('p', { class: 'setup-say' });
    const last = step === SETUP_STEPS.length - 1;
    mount(root, h('div', { class: 'box panel setup' },
      h('div', { class: 'setup-steps' }, SETUP_STEPS.slice(1).map((s, i) => h('div', { class: `setup-dot ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}` }, h('i', null, step > i + 1 ? '✓' : i + 1), s))),
      h('div', { class: 'setup-body' },
        h('div', { class: 'setup-oak' }, artFull('oak', 2)),
        h('div', { class: 'setup-stage' }, stage()),
      ),
      h('div', { class: 'setup-dialog' },
        h('div', { class: 'talk-name' }, '大木博士'),
        text,
        h('div', { class: 'row end setup-nav' },
          step > 0 ? h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => go(step - 1) }, '返回') : null,
          h('button', { class: `btn ${last ? 'gold big go' : 'gold'}`, 'data-key': 'y', onclick: () => (last ? finish() : go(step + 1)) },
            step === 0 ? '下一步' : step === 3 ? `就决定是你了，${LINES[starter].name}！` : last ? '出发！' : '确定'),
        ),
      ),
    ), 'setup');
    const done = typeText(text, say());
    text.addEventListener('click', done);
    if (step !== 2) (root.querySelector('.setup-nav .btn.gold') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  render();
}

// ---------------------------------------------------------------- 选择伙伴

const PICK_PER = 21;

/** 宝可梦格子里显示哪些：我的精灵（已拥有的）/ 只看闪光的 / 全部图鉴（没有的显示剪影） */
export type MonView = 'owned' | 'shiny' | 'all';

function viewList(p: Profile, view: MonView): Mon[] {
  return view === 'shiny' ? monList(p).filter((m) => m.shiny) : monList(p, view === 'all');
}

/** 宝可梦格子（按图鉴顺序，分页；闪光的排在普通的后面，是单独的一格） */
export function partnerGrid(p: Profile, sel: Mon | null, onPick: (m: Mon) => void, page: number, onPage: (n: number) => void, opts: { view?: MonView; taken?: Map<string, string> } = {}) {
  const me = partnerOf(p);
  const view = opts.view ?? 'owned';
  const items = viewList(p, view);
  const pg = pager(items, PICK_PER, page, (m) => {
    const L = LINES[m.line];
    const open = ownsMon(p, m);
    const taken = opts.taken?.get(monKey(m));
    const el = h('button', {
      class: `pmon ${sel && sameMon(sel, m) ? 'on' : ''} ${open ? '' : 'locked'} ${sameMon(me, m) ? 'partner' : ''} ${m.shiny ? 'shiny' : ''}`,
      onclick: () => { sfx('click'); onPick(m); },
    },
    portraitSlot(L.forms[0].dex, 1, 'pmon-portrait', m.shiny),
    h('span', { class: 'pmon-name' }, open ? L.name : '？？？'),
    taken ? h('i', { class: 'pmon-tag' }, taken) : sameMon(me, m) ? h('i', { class: 'pmon-tag' }, '伙伴') : null,
    );
    tip(el, () => open ? `${monName(m)} · ${L.forms.map((f) => f.name).join(' → ')}${m.shiny ? ' · 六项能力 +1%' : ''}` : unlockHint(m.line));
    return el;
  }, {
    cls: 'pmon-grid', filler: () => h('div', { class: 'pmon filler' }), onPage,
    label: view === 'all' ? `图鉴 · 已拥有 ${unlockedLines(p).length} / ${LINE_IDS.length} 种` : view === 'shiny' ? `闪光宝可梦 ${items.length} 只` : `我的精灵 ${items.length} 只`,
  });
  return h('div', { class: 'pmon-wrap' }, pg.list, pg.nav);
}

/** 浏览方式：我的精灵（平时选伙伴、找闪光）和全部图鉴（看收集进度） */
function viewSwitch(p: Profile, view: MonView, onView: (v: MonView) => void) {
  const mine = monList(p).length;
  const btn = (v: MonView, label: string, sub: string) => h('button', {
    class: `pmon-mode ${view === v || (v === 'owned' && view === 'shiny') ? 'on' : ''}`, 'aria-pressed': view === v ? 'true' : 'false',
    onclick: () => { if (view === v) return; sfx('click'); onView(v); },
  }, h('b', null, label), h('small', null, sub));
  return h('div', { class: 'row tight pmon-views' },
    btn('owned', '我的精灵', `${mine} 只`),
    btn('all', '全部图鉴', `${unlockedLines(p).length} / ${LINE_IDS.length}`),
    view !== 'all' && p.shiny.length ? h('button', {
      class: `btn tiny pmon-shiny ${view === 'shiny' ? 'gold' : 'ghost'}`, 'aria-pressed': view === 'shiny' ? 'true' : 'false',
      onclick: () => { sfx('click'); onView(view === 'shiny' ? 'owned' : 'shiny'); },
    }, uiIcon('shiny', 1), ` 只看闪光 ${p.shiny.length}`) : null,
  );
}

/** 选中的宝可梦在第几页 */
function pageOf(p: Profile, view: MonView, m: Mon) {
  return Math.max(0, Math.floor(viewList(p, view).findIndex((x) => sameMon(x, m)) / PICK_PER));
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

/** 换伙伴（弹窗）：大厅、出发前都可以换。taken：房间里别人选了的（键为 monKey） */
export function partnerModal(p: Profile, onPick: (m: Mon) => void, opts: { taken?: Map<string, string> } = {}) {
  const overlay = h('div', { class: 'modal' });
  let sel: Mon = partnerOf(p);
  let view: MonView = 'owned';
  let page = pageOf(p, view, sel);
  const close = () => overlay.remove();
  const render = () => {
    clear(overlay);
    const open = ownsMon(p, sel);
    const name = monName(sel);
    overlay.appendChild(h('div', { class: 'box modal-box partner-modal no-anim' },
      h('div', { class: 'panel-head' },
        h('h2', null, '选择跟随的伙伴'),
        iconBtn('close', '关闭', () => { sfx('click'); close(); }, { attrs: { 'data-back': '1' }, cls: 'ghost small' }),
      ),
      h('div', { class: 'partner-body' },
        h('div', { class: 'partner-left' },
          viewSwitch(p, view, (v) => { view = v; page = 0; render(); }),
          partnerGrid(p, sel, (m) => { sel = m; render(); }, page, (n) => { page = n; render(); }, { view, taken: opts.taken }),
        ),
        h('div', { class: 'partner-side' },
          open ? lineSummary(sel.line, sel.shiny, () => lineDetailModal(sel.line, sel.shiny)) : lockedDetail(sel.line),
          h('button', { class: 'btn gold big', 'data-key': 'y', disabled: !open, onclick: () => { sfx('wave'); close(); onPick(sel); } }, sameMon(partnerOf(p), sel) ? `继续和${name}一起` : open ? `就决定是你了，${name}！` : '还没有成为伙伴'),
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

export function homeScreen(root: HTMLElement, p: Profile, a: HomeActions, tab = 0, state: { page: number; sel: Mon | null; view: MonView } = { page: -1, sel: null, view: 'owned' }) {
  const re = (t = tab) => homeScreen(root, p, a, t, state);
  if (!state.sel) state.sel = partnerOf(p);
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
    if (state.view === 'shiny' && !p.shiny.length) state.view = 'owned';
    const sel = state.sel;
    if (state.page < 0) state.page = pageOf(p, state.view, sel);
    const open = ownsMon(p, sel);
    const cur = sameMon(partnerOf(p), sel);
    const name = monName(sel);
    body = h('div', { class: 'partner-body' },
      h('div', { class: 'partner-left' },
        viewSwitch(p, state.view, (v) => { state.view = v; state.page = 0; re(); }),
        partnerGrid(p, sel, (m) => { state.sel = m; re(); }, state.page, (n) => { state.page = n; re(); }, { view: state.view }),
      ),
      h('div', { class: 'partner-side' },
        open ? lineSummary(sel.line, sel.shiny, () => lineDetailModal(sel.line, sel.shiny), buildsLine(p.party, sel.line, sel.shiny)) : lockedDetail(sel.line),
        h('button', {
          class: 'btn gold big', 'data-key': 'y', disabled: !open || cur,
          onclick: () => { sfx('wave'); p.partner = sel.line; p.partnerShiny = sel.shiny; saveProfile(p); a.changed(); toast(`${name}现在跟着你了！`, 'gold'); re(); },
        }, cur ? `${name}正跟着你` : open ? `让${name}跟着我` : '还没有成为伙伴'),
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
    const shiny = p.shiny.includes(line);
    const el = h('div', { class: `dex-cell ${open || shiny ? '' : 'locked'}` },
      h('span', { class: 'dex-no' }, `#${String(d).padStart(3, '0')}`),
      shiny ? h('span', { class: 'dex-shiny' }, uiIcon('shiny', 1)) : null,
      portraitSlot(d, 1, 'dex-portrait'),
      h('span', { class: 'dex-name' }, open || shiny ? DEX[d].name : '？？？'),
    );
    tip(el, () => open || shiny
      ? h('div', { class: 'info' }, h('b', null, `#${d} ${DEX[d].name}`), h('div', null, ...DEX[d].types.map(typeBadge)), h('div', { class: 'small muted' }, LINES[line].flavor),
        shiny ? h('div', { class: 'small gold' }, `已经有闪光的${LINES[line].name}了${open ? '' : '（普通的还没有）'}`) : null)
      : unlockHint(line));
    return el;
  }, { cls: 'dex-grid', onPage, label: `图鉴 ${owned} / 151${p.shiny.length ? ` · 闪光 ${p.shiny.length} 种` : ''}` });
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
    const shiny = p.partnerShiny;
    mount(root, h('div', { class: 'box panel-md route' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'row' }, uiIcon('sign', 3), h('h2', null, '1号道路 · 出发冒险')),
        iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '回镇上' }),
      ),
      h('div', { class: 'route-team' },
        h('div', { class: 'route-who' }, trainerFull(p.trainer, 1), h('div', null, h('b', null, p.name || TRAINERS[p.trainer].name), h('div', { class: 'small muted' }, TRAINERS[p.trainer].title), h('div', { class: 'small pos' }, trainerBonus(p.trainer).join(' · ')))),
        h('div', { class: 'route-mon' }, portraitSlot(L.forms[0].dex, 3, 'route-portrait', shiny),
          h('div', null, h('b', null, shinyName(L.name, shiny)), h('div', null, ...L.forms[0].types.map(typeBadge), shiny ? h('span', { class: 'shiny-tag' }, uiIcon('shiny', 1), '+1%') : null),
            h('div', { class: 'small muted' }, `技能栏 ${L.forms[0].slots} 个 · ${L.forms.map((f) => f.name).join(' → ')}`)),
          iconBtn('swap', '换伙伴', () => { sfx('click'); a.partner(); }, { cls: 'small', text: '换伙伴' })),
      ),
      difficultyPicker(p, diff, (d) => { diff = d; render(); }),
      h('p', { class: 'small muted' }, `一路上会有野生宝可梦乱入，击败它们，也许它们会崇拜你、成为新的伙伴。每只宝可梦有 ${shinyOddsOf(p)} 的几率是闪光的，打倒还没有的闪光宝可梦，它一定会崇拜你。`),
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

/** 镇上的人说话：有立绘的显示立绘，只有行走图的把行走图放大 */
export function npcDialog(root: HTMLElement, speaker: string, text: string, buttons: [string, () => void, string?][], who: { art?: string; npc?: string } = {}) {
  talk(root, { name: speaker, text, buttons, ...who });
}

export function karpDialog(root: HTMLElement, p: Profile, done: (bought: boolean) => void) {
  const cost = LINES.magikarp.unlock.cost ?? 300;
  const who = { npc: 'karp' };
  if (isUnlocked(p, 'magikarp')) {
    npcDialog(root, '鲤鱼王推销员', '上次那只鲤鱼王还好吗？只要耐心培养，它可是会变成很厉害的宝可梦哦。', [['好的', () => done(false)]], who);
    return;
  }
  npcDialog(root, '鲤鱼王推销员', `嘿，训练家！要不要来一只鲤鱼王？现在只要 ${cost} 星之沙！（你有 ${p.stardust} 星之沙）`, [
    ['买下', () => {
      if (buyLine(p, 'magikarp')) { sfx('achieve'); toast('鲤鱼王成为了你的伙伴！', 'gold'); done(true); }
      else { sfx('error'); toast('星之沙不够', 'error'); }
    }, 'gold'],
    ['算了', () => done(false), 'ghost'],
  ], who);
}

// ---------------------------------------------------------------- 快速前往

/** 不用走到建筑门口也能直接打开的地方（数字键 1~6） */
export const QUICK: { id: PlaceId; icon: string; name: string; hint: string }[] = [
  { id: 'route', icon: 'sign', name: '冒险', hint: '1号道路 · 带着伙伴出发' },
  { id: 'center', icon: 'cross', name: '联机', hint: '宝可梦中心 · 和朋友一起冒险' },
  { id: 'battle', icon: 'sword', name: '对战', hint: '对战场 · 排位赛与练习赛' },
  { id: 'gym', icon: 'badge_boulder', name: '道馆', hint: '道馆挑战 · 收集八枚徽章' },
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

export interface TownHudActions { card(): void; settings(): void; help(): void; title(): void; interact(): void; go(id: PlaceId, tab?: number): void; rejoin(): void }

const WHERE_NAME: Record<string, string> = { town: '在真新镇', menu: '在标题界面', room: '在联机房间', game: '冒险中', pvp: '对战中' };

export class TownHud {
  root: HTMLElement;
  private card = h('button', { class: 'th-card box tight' });
  private onlineBtn: HTMLButtonElement;
  private onlineList = h('div', { class: 'th-online box tight hidden' });
  private prompt = h('button', { class: 'th-prompt box tight hidden' });
  private dust = h('div', { class: 'th-dust box tight' });
  private goal = h('button', { class: 'th-goal box tight' });
  /** 进行中的联机冒险：离开或断线后从这里回去 */
  private rejoinBtn = h('button', { class: 'th-rejoin box tight hidden' });
  private peers: OnlinePeer[] = [];
  private total = 1;

  constructor(parent: HTMLElement, private p: Profile, private a: TownHudActions) {
    this.card.addEventListener('click', () => { sfx('click'); a.card(); });
    this.prompt.addEventListener('click', () => a.interact());
    this.goal.addEventListener('click', () => { sfx('click'); a.go(nextGoal(this.p).place); });
    this.rejoinBtn.addEventListener('click', () => a.rejoin());
    this.onlineBtn = iconBtn('friends', '在线玩家', () => { sfx('click'); this.onlineList.classList.toggle('hidden'); this.renderOnline(); }, { cls: 'small th-btn', text: '1' });
    this.root = h('div', { id: 'town-hud' },
      h('div', { class: 'th-left' }, this.card, this.goal, this.rejoinBtn),
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
      h('div', { class: 'th-mon' }, portraitSlot(partnerDex(p), 1, 'th-mon-portrait', p.partnerShiny)),
    );
    clear(this.dust);
    const stat = (icon: Node, text: string, label: string, id: PlaceId, tab?: number) => h('button', {
      class: 'th-stat', title: label, 'aria-label': label,
      onclick: () => { sfx('click'); this.a.go(id, tab); },
    }, icon, h('span', null, text));
    this.dust.append(
      stat(iconImg('stardust', 1), String(p.stardust), '星之沙：去大木研究所做研究', 'lab', 0),
      stat(uiIcon('ball', 1), `${unlockedLines(p).length}/${LINE_IDS.length}`, `拥有的宝可梦${p.shiny.length ? `（另有闪光宝可梦 ${p.shiny.length} 种）` : ''}：在我的家查看、换伙伴`, 'home', 1),
      stat(uiIcon('badge_boulder', 1), `${Object.keys(p.badges).filter((id) => GYM_BY_ID[id]).length}/${GYMS.length}`, '道馆徽章：去道馆挑战馆主', 'gym'),
      stat(uiIcon('trophy', 1), `${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`, '成就：在大木研究所查看', 'lab', 2),
    );
    const g = nextGoal(p);
    clear(this.goal);
    this.goal.append(h('span', { class: 'th-goal-tag' }, '目标'), uiIcon(g.icon, 1), h('span', { class: 'th-goal-text' }, g.text), h('span', { class: 'th-goal-go' }, '▶'));
    this.goal.title = `下一步：${g.text}（点一下直接前往）`;
  }

  /** 有进行中的联机冒险时显示「回到冒险」 */
  setRejoin(s: { code: string } | null) {
    this.rejoinBtn.classList.toggle('hidden', !s);
    clear(this.rejoinBtn);
    if (!s) return;
    this.rejoinBtn.append(uiIcon('cross', 2), h('span', { class: 'th-rejoin-text' }, h('b', null, '回到联机冒险'), h('small', null, `房间 ${s.code} · AI 正在替你战斗`)), h('span', { class: 'th-goal-go' }, '▶'));
    this.rejoinBtn.title = '回到离开或断线的那局联机冒险';
  }

  setOnline(peers: OnlinePeer[], total?: number) {
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
        portraitSlot(q.dex, 1, 'tiny', q.shiny),
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

