import { ACHIEVEMENTS, META_UPGRADES, metaCost } from '../../shared/meta';
import { LINES, STONE_NAME, type LineId } from '../../shared/pokemon';
import { DIFFICULTIES, DIFFICULTY_IDS, type DifficultyId } from '../../shared/difficulty';
import type { LobbyPlayer, RoomInfo, ServerStats } from '../../shared/protocol';
import { SHINY_STAT, shinyName, shinyOdds } from '../../shared/shiny';
import { SKILLS } from '../../shared/skills';
import { TRAINERS, trainerOf } from '../../shared/trainers';
import { TYPE_NAME } from '../../shared/types';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { Animator } from '../gfx/sprites';
import { trainerPortrait } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { buyUpgrade, defaultSettings, isDifficultyUnlocked, refundUpgrades, saveProfile, type Profile } from '../save';
import { PAD_BTN, padState } from '../gamepad';
import { clear, h, hideTip, tip, toast } from './dom';
import { UI_SCALES, confirmButton, iconBtn, pager } from './layout';
import { STAT_LABEL_6, skillIcon, skillInfo, typeBadge } from './describe';

/**
 * 把界面放进容器。同一个界面重新渲染时（切换宝可梦、研究所升级、大厅刷新……）
 * 不再播放弹出动画，看起来就是原地更新而不是关掉再打开。
 */
export function mount(root: HTMLElement, el: HTMLElement, key: string) {
  const same = root.dataset.screen === key && !!root.firstElementChild;
  hideTip();
  clear(root);
  if (same) el.classList.add('no-anim');
  root.dataset.screen = key;
  root.appendChild(el);
}

// ---------------------------------------------------------------- 宝可梦详情

/** 种族值条：闪光宝可梦六项能力各 +1%（显示一位小数） */
function statBars(line: LineId, shiny = false) {
  const b = LINES[line].forms[0].base;
  const vals = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe].map((v) => (shiny ? v * SHINY_STAT : v));
  return h('div', { class: 'statbars' }, vals.map((v, i) => h('div', { class: 'statbar' },
    h('span', null, STAT_LABEL_6[i]), h('b', { class: shiny ? 'shiny-stat' : '' }, shiny ? v.toFixed(1) : v),
    h('div', { class: 'sb' }, h('div', { class: 'sb-fill', style: `width:${Math.min(100, (v / 160) * 100)}%;background:${v >= 100 ? '#5fe08a' : v >= 60 ? '#ffd23f' : '#ff8c5a'}` })),
  )));
}

/** 固定大小的头像框：不同宝可梦的精灵图尺寸不一样，放在框里居中，界面不会跟着变高。闪光宝可梦右上角有一颗星 */
export function portraitSlot(dex: number, scale: number, cls = '', shiny = false) {
  return h('div', { class: `pslot ${cls}${shiny ? ' shiny' : ''}` }, Animator.portrait(dex, scale, shiny));
}

/** 进化路线：每个形态的小头像，中间写进化等级或进化石 */
function evoChain(line: LineId, shiny: boolean) {
  const L = LINES[line];
  const evo = h('div', { class: 'evo-chain' });
  L.forms.forEach((f, i) => {
    if (i > 0) evo.appendChild(h('span', { class: 'evo-arrow' }, L.stones ? `${STONE_NAME[Object.keys(L.stones).find((k) => L.stones![k] === i) ?? ''] ?? '进化石'} →` : `Lv${L.evoLevels[i - 1]} →`));
    evo.appendChild(h('div', { class: 'evo-form' }, portraitSlot(f.dex, 1, 'tiny', shiny), h('div', { class: 'small' }, f.name)));
  });
  if (L.forms.length === 1) evo.appendChild(h('span', { class: 'muted small' }, `Lv${L.evoLevels.join(' / Lv')} 觉醒`));
  return evo;
}

/**
 * 宝可梦的简要资料（选伙伴时看的）：头像、属性、种族值、进化路线；
 * 特性的说明、初始技能和升级领悟的技能放在「详细资料」里。
 */
export function lineSummary(line: LineId, shiny = false, onMore?: () => void, extra: Node | null = null) {
  const L = LINES[line];
  return h('div', { class: `line-detail summary${shiny ? ' shiny' : ''}` },
    h('div', { class: 'ld-top' },
      portraitSlot(L.forms[0].dex, 3, 'ld-portrait', shiny),
      h('div', { class: 'ld-info' },
        h('h2', null, shinyName(L.name, shiny)),
        h('div', null, ...L.forms[0].types.map(typeBadge), shiny ? h('span', { class: 'shiny-tag' }, uiIcon('shiny', 1), '闪光 · 六项能力 +1%') : null),
        h('div', { class: 'small ld-facts' }, `技能栏 ${L.forms[0].slots} 个 · ${TYPE_NAME[L.bonusType]}系技能 +${L.bonusPct}%`),
        h('div', { class: 'small muted ld-facts' }, `特性：${L.passives.slice(1).map((x) => x.name).join('、') || '无'}`),
      ),
    ),
    statBars(line, shiny),
    evoChain(line, shiny),
    extra,
    onMore ? h('button', { class: 'btn small ghost ld-more', onclick: () => { sfx('click'); onMore(); } }, uiIcon('book', 2), ' 详细资料（特性、技能）') : null,
  );
}

/** 背包里这只宝可梦的对战构筑（闪光的和普通的分开算） */
export function buildsLine(party: { build: { line: LineId; shiny?: boolean; level: number } }[], line: LineId, shiny: boolean) {
  const own = party.filter((m) => m.build.line === line && !!m.build.shiny === shiny);
  return h('div', { class: `small ld-builds ${own.length ? 'ok' : 'muted'}` }, uiIcon('bag', 1), own.length
    ? ` 背包里有它的对战构筑 ${own.length} 个（最高 Lv${Math.max(...own.map((m) => m.build.level))}），设为伙伴后它就是对战的队长`
    : ' 背包里还没有它的对战构筑：带它冒险，结算时放进背包');
}

/** 详细资料：特性的说明、初始技能、升级领悟的技能 */
export function lineDetailModal(line: LineId, shiny = false) {
  const overlay = h('div', { class: 'modal' });
  const close = () => overlay.remove();
  overlay.appendChild(h('div', { class: 'box modal-box line-modal' },
    h('div', { class: 'panel-head' },
      h('h2', null, `${shinyName(LINES[line].name, shiny)} · 详细资料`),
      iconBtn('close', '关闭', () => { sfx('click'); close(); }, { attrs: { 'data-back': '1' }, cls: 'ghost small' }),
    ),
    lineDetail(line, false, shiny),
  ));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  return overlay;
}

export function lineDetail(line: LineId, compact = false, shiny = false) {
  const L = LINES[line];
  const evo = evoChain(line, shiny);
  const skillChip = (id: string, label: string) => {
    const el = h('span', { class: 'chip' }, skillIcon(id, 1, true), h('span', { class: 'chip-text' }, label));
    tip(el, () => skillInfo(id, 1, line));
    return el;
  };
  return h('div', { class: `line-detail ${compact ? 'compact' : ''}${shiny ? ' shiny' : ''}` },
    h('div', { class: 'ld-top' },
      portraitSlot(L.forms[0].dex, 3, 'ld-portrait', shiny),
      h('div', { class: 'ld-info' },
        h('h2', null, shinyName(L.name, shiny)),
        h('div', null, ...L.forms[0].types.map(typeBadge), shiny ? h('span', { class: 'shiny-tag' }, uiIcon('shiny', 1), '闪光 · 六项能力 +1%') : null),
        h('div', { class: 'muted small' }, `技能栏 ${L.forms[0].slots} 个 · ${TYPE_NAME[L.bonusType]}系技能 +${L.bonusPct}%`),
        h('p', { class: 'flavor' }, L.flavor),
      ),
    ),
    statBars(line, shiny),
    h('div', { class: 'passives' }, L.passives.slice(compact ? 1 : 0).map((p) => h('div', { class: 'passive' }, h('b', null, p.name), ' ', p.desc))),
    h('div', { class: 'ld-row' }, h('span', { class: 'muted small ld-label' }, '初始技能'), h('div', { class: 'chips' }, L.start.map((id) => skillChip(id, SKILLS[id].name)))),
    h('div', { class: 'ld-row' }, h('span', { class: 'muted small ld-label' }, '升级领悟'), h('div', { class: 'chips learn' }, L.learnset.map((e) => skillChip(e.skill, `Lv${e.lv} ${SKILLS[e.skill].name}`)))),
    evo,
  );
}

/** 难度选择：未解锁的显示锁定与解锁条件 */
export function difficultyPicker(p: Profile, current: DifficultyId, onPick: ((d: DifficultyId) => void) | null) {
  return h('div', { class: 'diff-row' },
    h('span', { class: 'muted' }, '难度'),
    DIFFICULTY_IDS.map((id) => {
      const D = DIFFICULTIES[id];
      const open = isDifficultyUnlocked(p, id);
      const el = h('button', {
        class: `diff ${current === id ? 'on' : ''} ${open ? '' : 'locked'}`,
        style: `--dc:${D.color}`,
        disabled: !onPick && current !== id,
        onclick: () => {
          if (!onPick) return;
          if (!open) { toast(D.unlockHint, 'error'); sfx('error'); return; }
          sfx('click');
          onPick(id);
        },
      }, D.name, open ? null : h('i', null, '未解锁'));
      tip(el, () => h('div', { class: 'info' }, h('b', null, `${D.name}模式`), ...D.desc.map((d) => h('div', { class: 'small' }, d)), h('div', { class: 'small gold' }, `星之沙 ×${D.stardust}`), open ? null : h('div', { class: 'small neg' }, D.unlockHint)));
      return el;
    }),
  );
}

// ---------------------------------------------------------------- 联机房间

function copy(text: string, ok: string) {
  const done = () => toast(ok);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('复制下面的内容：', text));
  else prompt('复制下面的内容：', text);
}

export interface LobbyActions {
  partner(): void;
  ready(on: boolean): void;
  start(): void;
  leave(): void;
  difficulty(id: DifficultyId): void;
  visibility(on: boolean): void;
}

export function lobbyScreen(root: HTMLElement, p: Profile, code: string, you: number, players: LobbyPlayer[], a: LobbyActions, difficulty: DifficultyId, isPublic: boolean) {
  const me = players.find((x) => x.id === you);
  const slots = [0, 1, 2, 3].map((i) => {
    const x = players[i];
    if (!x) return h('div', { class: 'slot empty' }, h('div', { class: 'muted small' }, '等待加入…'));
    const L = x.line ? LINES[x.line] : null;
    return h('div', { class: `slot ${x.id === you ? 'me' : ''}` },
      h('div', { class: 'slot-team' },
        L ? portraitSlot(L.forms[0].dex, 2, 'slot-portrait', x.shiny) : h('div', { class: 'pslot slot-portrait slot-q' }, '?'),
        trainerPortrait(x.trainer, 1, 'tportrait slot-trainer'),
      ),
      h('div', { class: 'slot-body' },
        h('div', { class: 'slot-name' }, x.name, x.host ? h('span', { class: 'tag' }, '房主') : null),
        h('div', { class: 'small muted' }, `${TRAINERS[x.trainer]?.name ?? ''} · ${L ? shinyName(L.name, x.shiny) : '还没选伙伴'}`),
        h('div', { class: `small ${x.ready || x.host ? 'ok' : 'muted'}` }, x.host ? '房主' : x.ready ? '已准备' : '未准备'),
      ),
    );
  });
  const canStart = me?.host && players.every((x) => x.line) && players.every((x) => x.host || x.ready);
  const L = me?.line ? LINES[me.line] : null;
  mount(root, h('div', { class: 'box panel lobby' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, uiIcon('cross', 3), h('span', { class: 'muted small' }, '房间号'), h('span', { class: 'room-code' }, code)),
      h('div', { class: 'row' },
        me?.host
          ? iconBtn(isPublic ? 'eye' : 'lock', isPublic ? '公开房间：会出现在宝可梦中心的房间列表里' : '私密房间：只能用房间号或邀请链接加入', () => a.visibility(!isPublic), { cls: `small ${isPublic ? '' : 'ghost'}`, text: isPublic ? '公开' : '私密' })
          : h('span', { class: 'muted small' }, isPublic ? '公开房间' : '私密房间'),
        iconBtn('copy', '复制房间号', () => copy(code, '房间号已复制'), { cls: 'small', text: '房间号' }),
        iconBtn('bond', '复制邀请链接', () => copy(`${location.origin}${location.pathname}?room=${code}`, '邀请链接已复制，发给朋友直接打开即可加入'), { cls: 'small', text: '邀请链接' }),
        iconBtn('door', '离开房间', a.leave, { cls: 'small ghost', attrs: { 'data-back': '1' }, text: '离开' }),
      ),
    ),
    h('div', { class: 'lobby-body' },
      h('div', { class: 'lobby-left' },
        h('div', { class: 'slots' }, slots),
        difficultyPicker(p, difficulty, me?.host ? (d) => a.difficulty(d) : null),
        h('p', { class: 'muted small lobby-note' }, me?.host ? '所有人准备好后即可开始。每个人带着自己跟随的伙伴出发。' : '难度由房主决定。准备好了就点「准备」。'),
        me?.host
          ? h('button', { class: 'btn gold big lobby-go', 'data-key': 'y', disabled: !canStart, onclick: a.start }, canStart ? '开始冒险！' : '等待所有人准备')
          : h('button', { class: `btn big lobby-go ${me?.ready ? '' : 'gold'}`, 'data-key': 'y', disabled: !me?.line, onclick: () => a.ready(!me?.ready) }, me?.ready ? '取消准备' : '准备！'),
      ),
      h('div', { class: 'lobby-right' },
        me?.line ? lineDetail(me.line, true, me.shiny) : h('div', { class: 'line-detail empty' }, h('p', { class: 'sub' }, '还没有选择伙伴')),
        h('div', { class: 'row between' },
          h('span', { class: 'small muted' }, L ? `你的伙伴：${shinyName(L.name, me?.shiny)}` : ''),
          iconBtn('swap', '换一只伙伴', () => { if (me?.ready) { toast('先取消准备再换伙伴', 'error'); return; } sfx('click'); a.partner(); }, { cls: 'small', text: '换伙伴' }),
        ),
      ),
    ),
  ), 'lobby');
}

// ---------------------------------------------------------------- 宝可梦中心：联机房间列表

export interface BrowseActions { create(isPublic: boolean): void; join(code: string): void; back(): void; rejoin(): void }

const ROOMS_PER_PAGE = 4;

export class BrowseScreen {
  private list = h('div', { class: 'room-area' });
  private statsEl = h('div', { class: 'browse-stats' });
  private isPublic = true;
  /** 每页几个房间：上面有「回到冒险」时少一个，界面高度不变 */
  private per = ROOMS_PER_PAGE;
  private rooms: RoomInfo[] = [];
  private page = 0;
  /** rejoinCode：有进行中的联机冒险（离开或断线了）时，最上面显示「回到冒险」 */
  constructor(root: HTMLElement, private a: BrowseActions, connected: boolean, rejoinCode: string | null = null) {
    const code = h('input', { class: 'field code', maxlength: 5, inputmode: 'numeric', placeholder: '房间号' }) as HTMLInputElement;
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 5); });
    const join = () => { if (code.value.length !== 5) { toast('请输入 5 位房间号', 'error'); return; } sfx('click'); a.join(code.value); };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    const pubBtn = this.pubButton();
    if (rejoinCode) this.per = ROOMS_PER_PAGE - 1;
    mount(root, h('div', { class: 'box panel browse' },
      h('div', { class: 'panel-head' },
        h('div', { class: 'row' }, uiIcon('cross', 3), h('h2', null, '宝可梦中心 · 联机冒险'), this.statsEl),
        iconBtn('back', '回到真新镇', a.back, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '出门' }),
      ),
      rejoinCode ? h('div', { class: 'browse-rejoin' },
        h('div', null, h('b', null, `你在房间 ${rejoinCode} 的冒险还在继续`), h('div', { class: 'small muted' }, '离开期间 AI 一直在替你战斗，回去就能接着玩。')),
        h('button', { class: 'btn gold', 'data-key': 'y', onclick: () => { sfx('click'); a.rejoin(); } }, '回到冒险'),
      ) : null,
      h('div', { class: 'browse-actions' },
        h('div', { class: 'row' }, h('button', { class: `btn ${rejoinCode ? '' : 'gold'}`, 'data-key': rejoinCode ? undefined : 'y', onclick: () => { sfx('click'); a.create(this.isPublic); } }, uiIcon('plus', 2), ' 创建房间'), pubBtn),
        h('div', { class: 'row' }, code, iconBtn('next', '加入房间', join, { text: '加入' })),
      ),
      this.list,
    ), 'browse');
    this.setStats(null, connected);
    this.setRooms([]);
  }

  /** 公开 / 私密切换：点一下换成另一种状态的按钮 */
  private pubButton(): HTMLButtonElement {
    const b = iconBtn(this.isPublic ? 'eye' : 'lock', '公开房间会出现在列表里；私密房间只能用房间号加入', () => {
      this.isPublic = !this.isPublic;
      b.replaceWith(this.pubButton());
    }, { cls: `small ${this.isPublic ? '' : 'ghost'}`, text: this.isPublic ? '公开房间' : '私密房间' });
    return b;
  }

  setStats(st: ServerStats | null, connected = true) {
    clear(this.statsEl);
    if (!connected) { this.statsEl.appendChild(h('span', { class: 'neg' }, '正在连接联机服务器……')); return; }
    if (!st) return;
    this.statsEl.append(
      h('span', { class: 'stat-pill' }, h('b', null, st.online), ' 人在线'),
      h('span', { class: 'stat-pill' }, h('b', null, st.playing), ' 人游戏中'),
      h('span', { class: 'stat-pill' }, h('b', null, st.rooms), ' 个房间'),
    );
  }

  setRooms(rooms: RoomInfo[]) {
    this.rooms = rooms;
    this.renderRooms();
  }

  private renderRooms() {
    clear(this.list);
    const pg = pager(this.rooms, this.per, this.page, (r) => this.roomCard(r), {
      cls: 'room-list',
      empty: () => h('div', { class: 'muted' }, '还没有公开房间，创建一个等朋友加入吧！'),
      filler: () => h('div', { class: 'room-card filler' }),
      onPage: (pg2) => { this.page = pg2; this.renderRooms(); },
      label: `公开房间 ${this.rooms.length} 个`,
    });
    this.page = pg.page;
    this.list.append(pg.list, pg.nav);
  }

  private roomCard(r: RoomInfo) {
    const full = r.players.length >= r.max;
    const D = DIFFICULTIES[r.difficulty];
    return h('div', { class: `room-card ${r.inGame ? 'busy' : ''}` },
      h('div', { class: 'room-main' },
        h('div', { class: 'room-title' }, h('b', null, `${r.host} 的房间`), h('span', { class: 'muted small' }, ` #${r.code}`)),
        h('div', { class: 'room-mons' }, Array.from({ length: r.max }, (_, i) => {
          const pl = r.players[i];
          if (!pl) return h('div', { class: 'room-mon empty' }, h('span', { class: 'small muted' }, '空位'));
          return h('div', { class: 'room-mon', title: pl.name },
            trainerPortrait(pl.trainer, 1, 'tportrait tiny'),
            pl.line ? portraitSlot(LINES[pl.line].forms[0].dex, 1, 'tiny', pl.shiny) : h('span', { class: 'pslot tiny slot-q' }, '?'),
            h('span', { class: 'small room-mon-name' }, pl.name));
        })),
      ),
      h('div', { class: 'room-side' },
        h('span', { class: 'diff-tag', style: `--dc:${D.color}` }, D.name),
        h('span', { class: `small ${r.inGame ? 'gold' : 'ok'}` }, r.inGame ? `游戏中 · 第 ${r.wave} 波` : `等待中 · ${r.players.length}/${r.max} 人`),
        h('button', { class: 'btn small', disabled: r.inGame || full, onclick: () => { sfx('click'); this.a.join(r.code); } }, r.inGame ? '进行中' : full ? '已满' : '加入'),
      ),
    );
  }
}

// ---------------------------------------------------------------- 研究所 / 成就（大木研究所的标签页内容）

/** 研究所里用界面图标（而不是道具图标）的研究 */
const LAB_UI_ICONS = new Set(['bow', 'shiny']);

export function labGrid(p: Profile, rerender: () => void) {
  return h('div', { class: 'lab-body' },
    h('div', { class: 'lab-grid' }, META_UPGRADES.map((u) => {
      const lv = p.upgrades[u.id] ?? 0;
      const maxed = lv >= u.max;
      const cost = maxed ? 0 : metaCost(u, lv);
      // 闪光研究：显示现在的闪光几率（研究所 + 现在的训练家）
      const shinyBonus = u.per.shiny ? lv * u.per.shiny + (trainerOf(p.trainer).mods.shiny ?? 0) : 0;
      const el = h('div', { class: `lab-item ${maxed ? 'max' : ''}` },
        LAB_UI_ICONS.has(u.icon) ? uiIcon(u.icon, 3) : iconImg(u.icon, 3),
        h('div', { class: 'lab-body-text' },
          h('div', { class: 'lab-name' }, h('b', null, u.name), h('span', { class: 'small muted' }, ` ${lv}/${u.max}`),
            u.per.shiny ? h('span', { class: 'small gold' }, ` · 现在 ${shinyOdds(shinyBonus)}`) : null),
          h('div', { class: 'small muted lab-desc' }, `${u.desc} / 级`),
          h('div', { class: 'pips' }, Array.from({ length: u.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))),
        ),
        h('button', { class: 'btn small lab-buy', disabled: maxed || p.stardust < cost, onclick: () => { if (buyUpgrade(p, u.id)) { sfx('buy'); rerender(); } } }, maxed ? '已满级' : `${cost}`),
      );
      if (u.per.shiny) {
        tip(el, () => h('div', { class: 'info' },
          h('b', null, '闪光宝可梦'),
          h('div', { class: 'small' }, '每只野生宝可梦出现时有 1/1000 的几率是闪光的。'),
          h('div', { class: 'small' }, '研究所每级 +60%，训练家火箭队 +100%，冒险中的道具闪耀护符 +50%；加在一起最高 1/200，联机时按队伍里最高的算。'),
          h('div', { class: 'small gold' }, '打倒闪光宝可梦 100% 得到它（首领也一样）。闪光的和普通的是两只宝可梦，六项能力各高 1%。'),
        ));
      }
      return el;
    })),
    h('div', { class: 'panel-foot' },
      h('span', { class: 'small muted' }, '用冒险得到的星之沙永久强化所有宝可梦（对战同样生效）。等级越高越贵，可以随时全额返还。'),
      confirmButton('重置并返还', '再点一次确认重置', 'btn small ghost', () => { refundUpgrades(p); sfx('buy'); rerender(); }),
    ),
  );
}

const ACH_PER_PAGE = 15;

export function achList(p: Profile, page: number, onPage: (n: number) => void) {
  const pg = pager(ACHIEVEMENTS, ACH_PER_PAGE, page, (a) => {
    const reward = [`+${a.reward} 星之沙`, ...(a.unlocks ?? []).map((l) => `解锁${LINES[l].name}`), a.trainer ? `解锁训练家${TRAINERS[a.trainer].name}` : '', a.unlocksDifficulty ? `解锁${DIFFICULTIES[a.unlocksDifficulty].name}难度` : ''].filter(Boolean).join(' · ');
    return h('div', { class: `ach ${p.achievements[a.id] ? 'on' : ''}` },
      h('b', { class: 'ach-name' }, uiIcon(p.achievements[a.id] ? 'medal' : 'medalOff', 1), ' ', a.name),
      h('span', { class: 'small ach-desc' }, a.desc),
      h('span', { class: 'small gold ach-reward' }, reward),
    );
  }, { cls: 'ach-list', onPage, label: `累计 ${p.stats.runs} 局 · 通关 ${p.stats.wins} 次 · 结交 ${p.stats.recruits} 位伙伴` });
  return h('div', { class: 'ach-wrap' }, pg.list, pg.nav);
}

// ---------------------------------------------------------------- 设置 / 说明

/** 选项：值、名字，以及可选的第二行小字 */
type Seg<T> = [T, string, string?];
/** 单选按钮组：选中的一项前面打勾 */
function segmented<T>(value: T, options: Seg<T>[], onPick: (v: T) => void, label = '') {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, options.map(([v, text, sub]) => h('button', {
    class: `seg-btn ${v === value ? 'on' : ''} ${sub ? 'two' : ''}`, role: 'radio', 'aria-checked': v === value ? 'true' : 'false',
    onclick: () => { if (v === value) return; sfx('click'); onPick(v); },
  }, h('span', { class: 'seg-main' }, v === value ? uiIcon('check', 1) : null, text), sub ? h('small', null, sub) : null)));
}

/** 设置项旁边的说明图标：悬停或手柄选中时显示详细说明 */
function infoTip(text: string) {
  const el = h('span', { class: 'set-info', tabindex: 0, 'data-pad': '1', 'aria-label': text }, uiIcon('info', 1));
  tip(el, () => h('div', { class: 'info small' }, text));
  return el;
}

/** 开关：滑块 + 「开 / 关」文字 */
function switchBtn(on: boolean, label: string, onChange: (v: boolean) => void) {
  return h('button', {
    class: `switch ${on ? 'on' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label,
    onclick: () => { sfx('click'); onChange(!on); },
  }, h('span', { class: 'switch-track' }, h('span', { class: 'switch-knob' })), h('span', { class: 'switch-text' }, on ? '开' : '关'));
}

/** 手柄的按键（按下时对应的格子会亮起来） */
const PAD_KEYS: [keyof typeof PAD_BTN, string, string, string][] = [
  ['A', 'A', '✕', '确认'], ['B', 'B', '○', '返回'], ['X', 'X', '□', '刷新商店'], ['Y', 'Y', '△', '出发 / 自动战斗'],
  ['LB', 'LB', 'L1', '翻页 / 切换标签'], ['LT', 'LT', 'L2', '撤销购买'], ['START', 'Start', 'Options', '暂停 / 菜单'], ['UP', '十字键', '十字键', '移动 / 选择'],
];

export function settingsScreen(root: HTMLElement, p: Profile, onChange: () => void, onBack: () => void) {
  const s = p.settings;
  const render = () => settingsScreen(root, p, onChange, onBack);
  const set = <K extends keyof Profile['settings']>(k: K, v: Profile['settings'][K], rerender = true) => {
    s[k] = v;
    saveProfile(p);
    onChange();
    if (rerender) render();
  };
  const note = (text: string) => h('div', { class: 'set-note' }, text);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const volume = (label: string, key: 'volume' | 'music', icon: string) => {
    const val = h('b', { class: 'set-val' }, pct(s[key]));
    const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(s[key]), 'aria-label': label, 'aria-valuetext': pct(s[key]) }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      val.textContent = pct(v);
      inp.setAttribute('aria-valuetext', pct(v));
      set(key, v, false);
    });
    return h('label', { class: 'set-row' }, h('span', { class: 'set-label' }, uiIcon(icon, 2), label), h('div', { class: 'set-ctl' }, inp, val));
  };
  const toggle = (label: string, key: 'damageNumbers' | 'gbFilter' | 'shake' | 'transitions', hint: string) =>
    h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('span', null, label), note(hint)), switchBtn(s[key], label, (v) => set(key, v)));
  const scaleIdx = Math.max(0, UI_SCALES.findIndex((v) => Math.abs(v - s.uiScale) < 0.001));
  const scaleVal = h('b', { class: 'set-val' }, pct(s.uiScale));
  const scale = h('input', { type: 'range', min: 0, max: UI_SCALES.length - 1, step: 1, value: String(scaleIdx), 'aria-label': '界面缩放', 'aria-valuetext': pct(s.uiScale) }) as HTMLInputElement;
  // 拖动时只更新数字，松手后再缩放，避免界面在手指下面跳动
  scale.addEventListener('input', () => { scaleVal.textContent = pct(UI_SCALES[Number(scale.value)]); });
  scale.addEventListener('change', () => set('uiScale', UI_SCALES[Number(scale.value)]));
  const section = (icon: string, title: string, ...rows: Node[]) => h('section', { class: 'set-section' }, h('h3', null, uiIcon(icon, 2), title), ...rows);

  // 手柄：连接状态和按键测试，每帧读一次（离开设置界面就停）
  const padStatus = h('div', { class: 'pad-status' });
  const keys = PAD_KEYS.map(([k, xbox, ps, what]) => {
    const glyph = h('b', { class: `pad-glyph k-${k.toLowerCase()}` }, xbox);
    const el = h('div', { class: 'pad-key' }, glyph, h('span', null, what));
    return { k, el, glyph, xbox, ps };
  });
  let lastPad: string | null = null;
  const poll = () => {
    if (!padStatus.isConnected) return;
    requestAnimationFrame(poll);
    const pad = padState();
    const sig = pad ? `${pad.name}|${pad.ps}` : '';
    if (sig !== lastPad) {
      lastPad = sig;
      clear(padStatus);
      padStatus.className = `pad-status ${pad ? 'on' : ''}`;
      padStatus.append(h('i', { class: 'pad-dot' }), pad
        ? h('span', null, h('b', null, '手柄已连接'), ` · ${pad.name}`)
        : h('span', null, h('b', null, '手柄未连接'), ' · 插上或用蓝牙连上手柄后按任意键'));
      for (const x of keys) x.glyph.textContent = pad?.ps ? x.ps : x.xbox;
    }
    for (const x of keys) {
      const i = PAD_BTN[x.k];
      const down = !!pad && (x.k === 'UP'
        ? [PAD_BTN.UP, PAD_BTN.DOWN, PAD_BTN.LEFT, PAD_BTN.RIGHT].some((b) => pad.pressed[b]) || Math.hypot(pad.stick[0], pad.stick[1]) > 0.5
        : x.k === 'LB' ? pad.pressed[i] || pad.pressed[PAD_BTN.RB] : pad.pressed[i]);
      x.el.classList.toggle('on', down);
    }
  };

  mount(root, h('div', { class: 'box panel settings' },
    h('div', { class: 'panel-head' }, h('div', { class: 'row' }, uiIcon('gear', 3), h('h2', null, '设置')), iconBtn('back', '返回', onBack, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '返回' })),
    h('div', { class: 'set-grid' },
      h('div', { class: 'set-col' },
        section('sound', '声音',
          volume('音效音量', 'volume', 'sound'),
          volume('音乐音量', 'music', 'music'),
        ),
        section('star', '游戏效果',
          toggle('过场动画', 'transitions', '切换界面、出发冒险、对战开场时的动画'),
          toggle('伤害数字', 'damageNumbers', '战斗中在敌人头上显示伤害'),
          toggle('屏幕震动', 'shake', '爆炸和受伤时画面晃动'),
          toggle('GB 绿屏滤镜', 'gbFilter', '把画面变成初代 Game Boy 的绿色'),
        ),
      ),
      h('div', { class: 'set-col' },
        section('full', '画面与性能',
          h('div', { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', null, '界面缩放', infoTip('100% 时最大的界面占满屏幕的九成。电脑上默认 90%，手机上默认 100%。')), note('数值越大，界面越大')),
            h('div', { class: 'set-ctl' }, scale, scaleVal)),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', null, '帧率', infoTip('120 帧适合 120Hz 以上的高刷新率屏幕，普通屏幕选了也只显示 60 帧；电脑性能不够时画面会掉帧，这时推荐 60 帧，还卡就选 30 帧。')), note('一般选 60；卡顿时选 30')),
            segmented<Profile['settings']['fps']>(s.fps, [[30, '30 帧'], [60, '60 帧'], [120, '120 帧']], (v) => set('fps', v), '帧率')),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', null, '画质', infoTip('高清按屏幕的原生分辨率渲染；流畅在高分屏上按一半的分辨率渲染，像素减少到四分之一，显卡负担更小、更省电。')), note('流畅更省电、更不容易卡')),
            segmented<Profile['settings']['quality']>(s.quality, [['high', '高清', '原生分辨率'], ['smooth', '流畅', '降低分辨率']], (v) => set('quality', v), '画质')),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', null, '全屏', infoTip('像全屏播放视频一样，占满整个浏览器。默认开启。按 Esc 可以退出全屏。')), note('占满屏幕，按 Esc 退出')),
            switchBtn(!!s.fullscreen, '全屏', (v) => set('fullscreen', v))),
        ),
        section('pad', '手柄', padStatus, h('div', { class: 'pad-keys' }, keys.map((x) => x.el)), note('按一下手柄上的键，对应的格子会亮起来')),
      ),
    ),
    h('div', { class: 'panel-foot' },
      confirmButton('恢复默认设置', '再点一次确认恢复', 'btn small ghost', () => {
        p.settings = defaultSettings();
        saveProfile(p);
        onChange();
        sfx('click');
        toast('已恢复默认设置');
        render();
      }, {}, 'undo'),
      h('span', { class: 'set-note' }, '设置会自动保存'),
    ),
  ), 'settings');
  poll();
}

const CREDIT_TABS: [string, () => Node][] = [
  ['玩法', () => h('ul', { class: 'credit-list' },
    h('li', null, '在真新镇里走动：北边的 1 号道路出发冒险，宝可梦中心和朋友联机，道馆挑战馆主、在对战场和其他训练家对战，大木研究所做研究、看图鉴和成就，我的家换训练家与跟随的伙伴。不知道做什么时，看左上角的「目标」。'),
    h('li', null, '普通波次 30~60 秒，撑到倒计时结束就算过关；第 10 波和第 20 波是 90 秒的首领波。技能会自动瞄准最近的敌人释放。'),
    h('li', null, '物理技能吃「物攻」（偏近身），特殊技能吃「特攻」（偏远程）；接触伤害由「物防」减免，弹幕与爆炸由「特防」减免。属性克制只多/少 10%，本系技能 1.5 倍。'),
    h('li', null, '冒险中会有野生宝可梦乱入。击败野生宝可梦时它有几率崇拜你，成为新的伙伴（整条进化线都能用）。研究所的「友情缎带」、精灵球类道具和小智都能提高崇拜几率。'),
    h('li', null, '闪光宝可梦：每只宝可梦出现时有 1/1000 的几率是闪光（异色）的，六项能力各高 1%。打倒闪光宝可梦 100% 得到它（首领也一样）；闪光的和普通的是两只宝可梦，要分别培养、分别设为伙伴。研究所的「闪光研究」、火箭队和闪耀护符能提高几率，加在一起最高 1/200。'),
    h('li', null, '等级够了以后，波次结束时会询问是否进化，可以取消；伊布要在商店里买进化石。每波结束后进入商店：买道具、学招式，买错了可以撤销上一次购买。'),
  )],
  ['模式', () => h('ul', { class: 'credit-list' },
    h('li', null, '难度分简单 / 普通 / 困难：通关上一档才能解锁下一档。'),
    h('li', null, '训练家各有加成：小智更容易让宝可梦崇拜、小霞擅长水系、火箭队赚得多还专门盯着闪光宝可梦，但宝可梦不太信任他们……其他训练家靠成就或星之沙解锁。'),
    h('li', null, '联机时倒下的队友身边会出现绿色救援圈，站进去就能把它救起来。首次通关后可以开启 AI 辅助战斗，由 AI 替你走位。'),
    h('li', null, '联机冒险中按 Esc 或右上角的按钮打开菜单（设置、离开房间）。离开或断线后由 AI 接手你的宝可梦，之后从真新镇或宝可梦中心回到房间，错过的结算也会补发。'),
    h('li', null, '冒险结束后可以把宝可梦放进背包（12 格，对战场达到超级球级后再多 6 格），在对战场里排位：单挑是三只同时上场（你操作队长），团战四人各一只；每场 60 秒，也可以整场交给 AI。'),
    h('li', null, '排行榜：单挑、团战、冒险（难度 → 波次 → 用时）、道馆（徽章数），每人只算最好的一次。'),
    h('li', null, '道馆：关都八个道馆按顺序挑战，先打道馆训练家再打馆主。每枚徽章永久提升一项能力和对应属性的技能伤害；打败小刚、娜姿还能解锁他们当你的训练家。'),
    h('li', null, '香水会吸引更多敌人（收获也更多），喷雾、玻璃哨和洁净之符能减少敌人；限持一个的道具拿到后不会再出现。'),
  )],
  ['操作', () => h('ul', { class: 'credit-list' },
    h('li', null, '键盘：WASD / 方向键移动，空格 / 回车与建筑互动，镇上 1~6 直接打开各个地方、M 快速前往，战斗中 T 切换自动战斗，Esc / P 暂停（联机时打开菜单），商店里 Z 撤销上一次购买；引导里空格 / 回车下一步、Esc 跳过。'),
    h('li', null, '手机：在屏幕任意位置拖动出现摇杆，点下方的提示进入建筑，右下角的按钮快速前往或切换自动战斗，需要横屏游玩。'),
    h('li', null, '全屏：设置里默认开启，第一次点击或按键后像全屏播放视频一样占满浏览器。按 Esc 退出。'),
    h('li', null, '手柄（Xbox / PlayStation）：左摇杆或十字键移动与选择，A/× 确认与进入建筑，B/○ 返回，X/□ 刷新商店，Y/△ 出发（战斗中切换自动战斗、镇上快速前往），LB/RB 翻页，LT 撤销购买，Start 暂停（联机时打开菜单）。设置里能看到手柄有没有连上，按键时对应的格子会亮。'),
  )],
  ['致谢', () => h('div', { class: 'credit-list' },
    h('p', { class: 'small' }, '宝可梦像素精灵（包括闪光宝可梦的异色精灵图）：PMDCollab / SpriteCollab 的众多画师（CC BY-NC 4.0，非商业使用），通过 JPTER78/pokesurvivor 整理导入，完整名单见仓库 CREDITS.md。'),
    h('p', { class: 'small' }, '真新镇图块、行走图与大木博士的立绘：《宝可梦 火红 / 叶绿》（通过 pret/pokefirered 导入）；训练家与道馆馆主的立绘：PokéRogue（CC BY-NC-SA 4.0）。'),
    h('p', { class: 'small' }, '界面风格与部分界面图标（齿轮、声音、奖杯、硬币、星星、王冠等）来自 JPTER78/pokesurvivor（MIT）。字体：缝合像素字体 Fusion Pixel Font（OFL 1.1）。'),
    h('p', { class: 'small muted' }, 'Pokémon 及相关名称为 Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company 的商标。本作为非营利粉丝作品。'),
  )],
];

/** 标签页：手柄 LB / RB 切换 */
export function tabs(names: string[], cur: number, onPick: (i: number) => void) {
  return h('div', { class: 'tabbar' },
    h('button', { class: 'tab-nav', 'data-key': 'lb', disabled: cur <= 0, onclick: () => { sfx('click'); onPick(cur - 1); } }, '◀'),
    names.map((n, i) => h('button', { class: `tab ${i === cur ? 'on' : ''}`, onclick: () => { if (i !== cur) { sfx('click'); onPick(i); } } }, n)),
    h('button', { class: 'tab-nav', 'data-key': 'rb', disabled: cur >= names.length - 1, onclick: () => { sfx('click'); onPick(cur + 1); } }, '▶'),
  );
}

export function creditsScreen(root: HTMLElement, onBack: () => void, tab = 0) {
  mount(root, h('div', { class: 'box panel-md credits' },
    h('div', { class: 'panel-head' }, h('div', { class: 'row' }, uiIcon('book', 3), h('h2', null, '说明与致谢')), iconBtn('back', '返回', onBack, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '返回' })),
    tabs(CREDIT_TABS.map(([n]) => n), tab, (i) => creditsScreen(root, onBack, i)),
    h('div', { class: 'credit-body' }, CREDIT_TABS[tab][1]()),
  ), 'credits');
}

/** 暂停（单人）/ 菜单（联机、对战：游戏不会暂停） */
export interface PauseOpts {
  menu?: boolean;
  note?: string;
  resume(): void;
  settings(): void;
  quit: { label: string; confirm: string; run(): void };
}

export function pauseScreen(root: HTMLElement, o: PauseOpts) {
  mount(root, h('div', { class: 'box pause' },
    h('h2', null, uiIcon(o.menu ? 'menu' : 'pause', 3), o.menu ? ' 菜单' : ' 暂停'),
    o.note ? h('p', { class: 'pause-note' }, o.note) : null,
    h('div', { class: 'menu-list' },
      h('button', { class: 'menu-item play', 'data-key': 'start', 'data-back': '1', onclick: o.resume }, h('span', { class: 'mi-ico' }, uiIcon('play', 3)), h('span', { class: 'mi-text' }, '继续')),
      h('button', { class: 'menu-item', onclick: o.settings }, h('span', { class: 'mi-ico' }, uiIcon('gear', 3)), h('span', { class: 'mi-text' }, '设置')),
      confirmButton(o.quit.label, o.quit.confirm, 'menu-item', o.quit.run, {}, 'door'),
    ),
  ), 'pause');
}
