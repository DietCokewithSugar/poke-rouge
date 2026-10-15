import { ITEMS } from '../../shared/items';
import { LINES } from '../../shared/pokemon';
import { SKILLS } from '../../shared/skills';
import type { Command, MeState, PublicState } from '../../shared/sim/game';
import type { LevelCard, ShopOffer } from '../../shared/sim/entities';
import { MOD_LABEL } from '../../shared/stats';
import { TYPE_NAME, type PType } from '../../shared/types';
import { ENEMIES } from '../../shared/enemies';
import { BIOMES, TOTAL_WAVES, WAVES, waveDuration } from '../../shared/waves';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { uiIcon } from '../gfx/uiicons';
import { Animator } from '../gfx/sprites';
import { clear, h, hideTip, tip } from './dom';
import { iconBtn, pager } from './layout';

const INV_PER_PAGE = 26;
const STATS_PER_PAGE = 12;
import { STAT_ROWS, itemInfo, itemLines, skillCardBody, skillIcon, skillInfo, tierBadge, typeBadge } from './describe';
import { forgetRefund } from '../../shared/sim/player';

const STAT_ICON: Record<string, string> = {
  maxHp: 'vitamin_hp', atk: 'vitamin_r', spa: 'vitamin_b', def: 'vitamin_g', spd: 'vitamin_y', spe: 'vitamin_spe',
  crit: 'lens', haste: 'claw', dodge: 'powder', regen: 'berry', lifesteal: 'bell', range: 'widelens', luck: 'clover', harvest: 'coin',
};

export class Intermission {
  root = h('div', { id: 'inter', class: 'hidden' });
  private main = h('div', { class: 'box inter-main' });
  private side = h('div', { class: 'box inter-side' });
  private modal = h('div', { class: 'modal hidden' });
  private me: MeState | null = null;
  private pub: PublicState | null = null;
  private you = 0;
  /** 进化动画播放中：暂停重绘 */
  private animating = false;
  /** 玩家在侧栏点了「进化」：重新打开进化询问 */
  private askEvo = false;
  private invPage = 0;
  private statPage = 0;

  constructor(parent: HTMLElement, private send: (c: Command) => void) {
    this.root.append(this.main, this.side, this.modal);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  destroy() {
    this.root.remove();
    window.removeEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.key === 'z' || e.key === 'Z') && !(e.target instanceof HTMLInputElement)) this.undo();
  };

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
    if (!on) { this.modal.classList.add('hidden'); hideTip(); }
  }

  get visible() { return !this.root.classList.contains('hidden'); }

  update(me: MeState, pub: PublicState | null, you: number) {
    this.me = me;
    this.pub = pub;
    this.you = you;
    this.render();
  }

  updatePub(pub: PublicState) {
    this.pub = pub;
    const box = this.main.querySelector('.team-ready');
    if (box) this.renderTeam(box as HTMLElement);
  }

  private render() {
    if (this.animating) return;
    const me = this.me!;
    hideTip();
    clear(this.main);
    const wave = this.pub?.wave ?? 1;
    const evoNow = !!me.evo && (me.evo.prompt || this.askEvo);
    if (!me.evo) this.askEvo = false;
    this.main.appendChild(h('div', { class: 'inter-head' },
      h('h2', null, evoNow ? '进化' : me.cards ? '升级！' : me.crate ? '道具球' : `商店 · 第 ${wave + 1} 波之前`),
      h('div', { class: 'money big' }, `₽ ${me.money}`),
    ));
    const stage = h('div', { class: `inter-stage ${evoNow ? 'evo' : ''}` });
    this.main.appendChild(stage);
    if (evoNow) this.renderEvolution(me, stage);
    else if (me.cards) this.renderCards(me, stage);
    else if (me.crate) this.renderCrate(me, stage);
    else this.renderShop(me, stage);
    if (!evoNow) this.main.append(this.inventory(me), this.actions(me));
    this.renderSide(me);
  }

  // ---------------------------------------------------------------- 进化

  private renderEvolution(me: MeState, stage0: HTMLElement) {
    const evo = me.evo!;
    const from = Animator.portrait(evo.fromDex, 3);
    const to = Animator.portrait(evo.toDex, 3);
    to.classList.add('evo-to');
    const stage = h('div', { class: 'evo-stage' }, from, to);
    const text = h('p', { class: 'evo-text' }, `咦？${evo.from}的样子……！`);
    const yes = h('button', { class: 'btn gold big', onclick: () => go(true) }, '进化！') as HTMLButtonElement;
    const no = h('button', { class: 'btn big', 'data-back': '1', onclick: () => go(false) }, '不进化') as HTMLButtonElement;
    const go = (ok: boolean) => {
      yes.disabled = no.disabled = true;
      this.askEvo = false;
      if (!ok) {
        stage.classList.add('stopped');
        text.textContent = `${evo.from}停止了进化。`;
        sfx('click');
        window.setTimeout(() => this.send({ t: 'evolve', yes: false }), 650);
        return;
      }
      this.animating = true;
      stage.classList.add('evolving');
      sfx('evolve');
      window.setTimeout(() => {
        stage.classList.remove('evolving');
        stage.classList.add('done');
        text.textContent = `恭喜！${evo.from}进化成了${evo.to}！`;
      }, 1700);
      window.setTimeout(() => {
        this.animating = false;
        this.send({ t: 'evolve', yes: true });
      }, 2700);
    };
    stage0.appendChild(h('div', { class: 'evo-box' },
      stage,
      text,
      h('p', { class: 'sub small' }, '不进化可以保留当前形态（配合进化奇石、不变之石更强）。之后的商店阶段随时可以在右侧点「进化」。'),
      h('div', { class: 'row center' }, yes, no),
    ));
  }

  // ---------------------------------------------------------------- 升级

  /** 点完一张卡就锁住所有卡，防止连点发出多余的指令。 */
  private lockCards() {
    this.main.querySelectorAll<HTMLButtonElement>('button.card').forEach((b) => { b.disabled = true; });
  }

  private renderCards(me: MeState, stage: HTMLElement) {
    stage.appendChild(h('div', { class: 'stage-sub' },
      h('span', { class: 'sub' }, `${me.form} 升到了 Lv${me.level}！选择一项强化${me.levelsPending > 1 ? `（还剩 ${me.levelsPending} 次）` : ''}`),
      h('button', { class: 'btn small', 'data-key': 'x', onclick: () => this.send({ t: 'levelReroll' }), disabled: me.money < me.cardRerollCost }, `刷新选项 ₽${me.cardRerollCost}`),
    ));
    const row = h('div', { class: 'cards' });
    me.cards!.forEach((c, i) => row.appendChild(this.cardEl(me, c, i)));
    stage.appendChild(row);
  }

  private cardEl(me: MeState, c: LevelCard, i: number) {
    if (c.kind === 'stat') {
      return h('button', { class: `card tier${c.tier}`, onclick: () => { sfx('click'); this.lockCards(); this.send({ t: 'level', i }); } },
        iconImg(STAT_ICON[c.stat] ?? 'bottle', 4),
        h('div', { class: 'card-title' }, c.name),
        tierBadge(c.tier),
        h('div', { class: 'card-body pos' }, `${MOD_LABEL[c.stat]} +${c.amount}${['crit', 'haste', 'dodge', 'lifesteal', 'range'].includes(c.stat) ? '%' : ''}`),
      );
    }
    const s = SKILLS[c.skill];
    const owned = me.skills.find((x) => x.id === c.skill);
    const el = h('button', { class: `card skill tier${c.tier}`, onclick: () => this.chooseSkill(me, c.skill, (slot) => { this.lockCards(); this.send({ t: 'level', i, slot }); }) },
      skillIcon(c.skill, owned ? owned.lv + 1 : 1),
      h('div', { class: 'card-title' }, c.upgrade ? `强化 ${s.name}` : `领悟 ${s.name}`),
      h('div', null, typeBadge(s.type), ' ', tierBadge(s.tier)),
      h('div', { class: 'card-body' }, s.desc),
      h('div', { class: 'card-foot' }, '新技能'),
    );
    tip(el, () => skillInfo(c.skill, owned ? owned.lv + 1 : 1, me.line));
    return el;
  }

  /** 学技能：技能栏满了就先选要遗忘的技能。 */
  private chooseSkill(me: MeState, id: string, done: (slot?: number) => void) {
    const owned = me.skills.some((s) => s.id === id);
    if (owned || me.skills.length < me.slots) { sfx('click'); done(); return; }
    sfx('click');
    let pick = -1;
    const confirmBtn = h('button', { class: 'btn gold swap-go', 'data-key': 'y', disabled: true, onclick: () => {
      if (pick < 0) return;
      this.closeModal();
      sfx('buy');
      done(pick);
    } }, '先选一个要遗忘的技能') as HTMLButtonElement;
    const cards = me.skills.map((s, slot) => {
      const el = h('button', { class: 'swap-card', onclick: () => {
        pick = slot;
        sfx('click');
        cards.forEach((c, k) => c.classList.toggle('on', k === slot));
        confirmBtn.disabled = false;
        confirmBtn.textContent = `遗忘「${SKILLS[s.id].name}」，学习「${SKILLS[id].name}」`;
      } }, skillCardBody(s.id, s.lv, me.line), h('div', { class: 'swap-mark' }, '遗忘'));
      tip(el, () => skillInfo(s.id, s.lv, me.line));
      return el;
    });
    this.openModal(h('div', { class: 'box modal-box skill-swap' },
      h('div', { class: 'swap-head' },
        h('h2', null, '技能栏已满'),
        h('div', { class: 'sub' }, `想要学习「${SKILLS[id].name}」，需要先遗忘一个技能（${me.skills.length} / ${me.slots}）。`),
      ),
      h('div', { class: 'swap-body' },
        h('div', { class: 'swap-new' }, h('div', { class: 'swap-label gold' }, '新技能'), h('div', { class: 'swap-card new' }, skillCardBody(id, 1, me.line))),
        h('div', { class: 'swap-arrow' }, '⇄'),
        h('div', { class: 'swap-old' }, h('div', { class: 'swap-label' }, '选择要遗忘的技能'), h('div', { class: `swap-grid ${cards.length > 4 ? 'dense' : ''}`, style: `grid-template-rows:repeat(${Math.max(2, Math.ceil(cards.length / 2))},minmax(0,1fr))` }, cards)),
      ),
      h('div', { class: 'swap-foot' },
        h('button', { class: 'btn ghost', 'data-back': '1', onclick: () => { sfx('click'); this.closeModal(); } }, '算了，不学了'),
        confirmBtn,
      ),
    ));
  }

  /** 侧栏的「遗忘」：确认后返还少量金钱 */
  private confirmForget(me: MeState, slot: number) {
    const s = me.skills[slot];
    if (!s) return;
    sfx('click');
    const refund = forgetRefund(s.id, s.lv, this.pub?.wave ?? 1);
    this.openModal(h('div', { class: 'box modal-box skill-forget' },
      h('h2', null, '遗忘技能'),
      h('div', { class: 'swap-card new' }, skillCardBody(s.id, s.lv, me.line)),
      h('div', { class: 'sub' }, `遗忘后返还 ₽${refund}，空出的技能栏可以学习新技能。`, s.lv > 1 ? '技能强化等级不会保留。' : ''),
      h('div', { class: 'swap-foot' },
        iconBtn('close', '取消', () => { sfx('click'); this.closeModal(); }, { cls: 'ghost', attrs: { 'data-back': '1' }, text: '取消' }),
        h('button', { class: 'btn gold', 'data-key': 'y', onclick: () => { this.closeModal(); sfx('pickup'); this.send({ t: 'forget', slot }); } }, `遗忘「${SKILLS[s.id].name}」 +₽${refund}`),
      ),
    ));
  }

  private openModal(box: HTMLElement) {
    hideTip();
    clear(this.modal);
    this.modal.appendChild(box);
    this.modal.classList.remove('hidden');
  }

  private closeModal() {
    hideTip();
    this.modal.classList.add('hidden');
    clear(this.modal);
  }

  // ---------------------------------------------------------------- 道具球

  private renderCrate(me: MeState, stage: HTMLElement) {
    const it = ITEMS[me.crate!];
    stage.appendChild(h('div', { class: 'stage-sub' }, h('span', { class: 'sub' }, `打开了精灵球，里面是……${me.cratesLeft > 1 ? `（还有 ${me.cratesLeft - 1} 个）` : ''}`)));
    stage.appendChild(h('div', { class: 'crate' },
      h('div', { class: `card big tier${it.tier}` }, iconImg(it.icon, 5), itemInfo(it.id)),
      h('div', { class: 'crate-btns' },
        h('button', { class: 'btn gold', onclick: () => { sfx('buy'); this.send({ t: 'crate', take: true }); } }, '收下'),
        h('button', { class: 'btn', onclick: () => { sfx('pickup'); this.send({ t: 'crate', take: false }); } }, `卖掉 +₽${me.crateSell}`),
      ),
    ));
  }

  // ---------------------------------------------------------------- 商店

  private renderShop(me: MeState, stage: HTMLElement) {
    const grid = h('div', { class: 'cards shop' });
    me.shop.offers.forEach((o, i) => grid.appendChild(this.offerEl(me, o, i)));
    stage.appendChild(grid);
  }

  /** 底部操作栏：刷新 · 队友状态 · 下一波预告 · 出发 */
  private actions(me: MeState) {
    const team = h('div', { class: 'team-ready' });
    this.renderTeam(team);
    const shopping = !me.cards && !me.crate && !me.evo?.prompt && !this.askEvo;
    return h('div', { class: 'shop-actions' },
      h('div', { class: 'shop-btns' },
        shopping
          ? h('button', { class: 'btn with-ico', 'data-key': 'x', title: '刷新商店', onclick: () => { sfx('click'); this.send({ t: 'reroll' }); }, disabled: me.money < me.shop.rerollCost },
            uiIcon('refresh', 2), h('span', null, me.shop.rerollCost === 0 ? '免费刷新' : `刷新 ₽${me.shop.rerollCost}`))
          : null,
        shopping
          ? h('button', {
            class: 'btn ghost undo', 'data-key': 'lt', disabled: !me.undo,
            title: me.undo ? `撤销购买「${me.undo}」，退还全部金钱（只能撤销最近一次购买）` : '买错了可以撤销最近一次购买',
            onclick: () => this.undo(),
          }, h('span', { class: 'undo-head' }, uiIcon('undo', 2), '撤销'), h('small', null, me.undo ? me.undo : '上一次购买'))
          : null,
      ),
      team,
      h('div', { class: 'go-wrap' },
        this.preview(),
        shopping
          ? h('button', { class: `btn ${me.ready ? '' : 'gold'} go`, 'data-key': 'y', onclick: () => { sfx('click'); this.send({ t: 'waveReady', on: !me.ready }); } },
            me.ready ? '取消准备' : '出发！下一波')
          : null,
      ),
    );
  }

  undo() {
    if (!this.me?.undo || !this.visible) return;
    sfx('click');
    this.send({ t: 'undo' });
  }

  /** 持有道具：固定两行，多了就翻页 */
  private inventory(me: MeState) {
    const total = me.items.reduce((a, [, n]) => a + n, 0);
    const sorted = me.items.filter(([id]) => ITEMS[id]).sort((a, b) => ITEMS[b[0]].tier - ITEMS[a[0]].tier || b[1] - a[1]);
    const pg = pager(sorted, INV_PER_PAGE, this.invPage, ([id, n]) => {
      const it = ITEMS[id];
      const cell = h('div', { class: `item-cell tier${it.tier}`, 'data-pad': '1' }, iconImg(it.icon, 3), n > 1 ? h('i', null, `×${n}`) : null);
      tip(cell, () => itemInfo(id, n));
      return cell;
    }, {
      cls: 'inv-grid',
      empty: () => h('div', { class: 'muted small' }, '还没有道具。在商店购买、或者打开精灵球获得。'),
      filler: () => h('div', { class: 'item-cell empty' }),
      onPage: (n) => { this.invPage = n; this.render(); },
    });
    this.invPage = pg.page;
    return h('div', { class: 'inv' },
      h('div', { class: 'inv-head' },
        h('h3', null, `持有道具（${total}）`),
        h('span', { class: 'muted small' }, matchMedia('(pointer: coarse)').matches ? '点按道具查看效果' : '鼠标悬停查看效果'),
        pg.nav,
      ),
      pg.list,
    );
  }

  /** 下一波预告：出现的宝可梦与精英/首领，方便提前准备属性克制。 */
  private preview() {
    const next = (this.pub?.wave ?? 0) + 1;
    const W = WAVES[next - 1];
    if (!W || next > TOTAL_WAVES) return h('div');
    const mon = (id: string, tag?: string) => {
      const e = ENEMIES[id];
      const el = h('div', { class: `preview-mon ${tag ? 'special' : ''}` }, Animator.portrait(e.dex, 1), tag ? h('i', null, tag) : null);
      tip(el, () => h('div', { class: 'info' }, h('b', null, e.name, tag ? `（${tag}）` : ''), h('div', null, ...e.types.map(typeBadge))));
      return el;
    };
    return h('div', { class: 'preview' },
      h('div', { class: 'preview-label' }, `下一波 · 第 ${next} 波 · ${waveDuration(next)} 秒`, h('span', { class: 'muted' }, ` · ${BIOMES[W.biome].name}`)),
      h('div', { class: 'preview-row' },
        W.boss ? mon(W.boss, '首领') : null,
        ...[...new Set(W.elites ?? [])].map((id) => mon(id, '精英')),
        ...Object.keys(W.pool).map((id) => mon(id)),
      ),
    );
  }

  private renderTeam(box: HTMLElement) {
    clear(box);
    const pub = this.pub;
    if (!pub || pub.players.length <= 1) return;
    for (const p of pub.players) {
      box.appendChild(h('span', { class: `pill ${p.ready ? 'ok' : ''}` }, `${p.name}${p.id === this.you ? '（你）' : ''} ${p.ready ? '✔' : '…'}`));
    }
    if (pub.interLeft >= 0) box.appendChild(h('span', { class: 'muted small' }, ` ${pub.interLeft} 秒后自动开始`));
  }

  private offerEl(me: MeState, o: ShopOffer | null, i: number) {
    if (!o) return h('div', { class: 'card sold' }, h('div', { class: 'card-title muted' }, '已售出'));
    const locked = me.shop.locked[i];
    const afford = me.money >= o.price;
    const lockBtn = h('button', { class: `lock ${locked ? 'on' : ''}`, title: locked ? '已锁定：刷新时保留（再点解锁）' : '锁定：刷新时保留', 'aria-label': locked ? '已锁定' : '锁定', onclick: (e: Event) => { e.stopPropagation(); this.send({ t: 'lock', i }); } }, uiIcon(locked ? 'lock' : 'unlock', 1), locked ? '已锁' : '锁定');
    let el: HTMLElement;
    if (o.kind === 'item') {
      const it = ITEMS[o.id];
      el = h('div', { class: `card tier${o.tier} ${afford ? '' : 'poor'}` },
        lockBtn,
        iconImg(it.icon, 4),
        h('div', { class: 'card-title' }, it.name),
        tierBadge(o.tier),
        h('div', { class: 'card-body' }, itemLines(o.id).map((l) => h('div', { class: l.startsWith('-') || /-\d/.test(l) ? 'neg' : 'pos' }, l))),
        h('button', { class: 'btn small buy', disabled: !afford, onclick: () => this.buy(me, i, o) }, `₽ ${o.price}`),
      );
      tip(el, () => itemInfo(o.id, (me.items.find(([id]) => id === o.id)?.[1] ?? 0) + 1));
    } else {
      const s = SKILLS[o.id];
      const owned = me.skills.find((x) => x.id === o.id);
      el = h('div', { class: `card skill tier${o.tier} ${afford ? '' : 'poor'}` },
        lockBtn,
        skillIcon(o.id, owned ? owned.lv + 1 : 1),
        h('div', { class: 'card-title' }, `招式学习器 · ${s.name}`),
        h('div', null, typeBadge(s.type), ' ', tierBadge(s.tier)),
        h('div', { class: 'card-body' }, owned ? `已拥有：强化到 +${owned.lv}` : s.desc),
        h('button', { class: 'btn small buy', disabled: !afford, onclick: () => this.buy(me, i, o) }, `₽ ${o.price}`),
      );
      tip(el, () => skillInfo(o.id, owned ? owned.lv + 1 : 1, me.line));
    }
    return el;
  }

  private buy(me: MeState, i: number, o: ShopOffer) {
    if (o.kind === 'skill') this.chooseSkill(me, o.id, (slot) => { sfx('buy'); this.send({ t: 'buy', i, slot }); });
    else { sfx('buy'); this.send({ t: 'buy', i }); }
  }

  // ---------------------------------------------------------------- 侧栏

  private renderSide(me: MeState) {
    clear(this.side);
    const L = LINES[me.line];
    this.side.appendChild(h('div', { class: 'side-head' },
      Animator.portrait(me.dex, 2),
      h('div', null,
        h('div', { class: 'big' }, `${me.form}  Lv${me.level}`),
        h('div', null, ...L.forms[Math.min(me.stage, L.forms.length - 1)].types.map((t) => typeBadge(t))),
        h('div', { class: 'muted small' }, `本系加成：${TYPE_NAME[L.bonusType]}系 +${L.bonusPct}%`),
      ),
    ));
    // 进化按钮的位置始终保留，出现/消失时下面的内容不会跳动
    const evoSlot = h('div', { class: 'evo-slot' });
    if (me.evo && !me.evo.prompt && !me.cards && !this.askEvo) {
      evoSlot.appendChild(h('button', { class: 'btn gold small evo-btn', onclick: () => { this.askEvo = true; this.render(); } }, `进化成${me.evo.to}`));
    }
    this.side.appendChild(evoSlot);
    this.side.appendChild(h('h3', null, `技能 ${me.skills.length}/${me.slots}`));
    const rows = Math.max(6, me.slots, me.skills.length);
    const sk = h('div', { class: 'side-skills', style: `grid-template-rows:repeat(${rows},minmax(0,1fr))` });
    me.skills.forEach((s, slot) => {
      const row = h('div', { class: 'side-skill' },
        skillIcon(s.id, s.lv, true),
        h('span', { class: 'grow side-skill-name' }, SKILLS[s.id].name, s.lv > 1 ? ` +${s.lv - 1}` : ''),
        !me.cards && me.skills.length > 1 ? h('button', { class: 'btn tiny ghost', title: '遗忘并返还少量金钱', onclick: (e: Event) => { e.stopPropagation(); this.confirmForget(me, slot); } }, '遗忘') : null,
      );
      tip(row, () => skillInfo(s.id, s.lv, me.line));
      sk.appendChild(row);
    });
    for (let i = me.skills.length; i < rows; i++) sk.appendChild(h('div', { class: `side-skill empty ${i >= me.slots ? 'locked' : ''}` }, i < me.slots ? '— 空 —' : ''));
    this.side.appendChild(sk);

    const entries: [string, string][] = [];
    for (const [k, label, fmt] of STAT_ROWS) {
      const v = me.stats[k];
      if (v !== undefined) entries.push([label, fmt(v)]);
    }
    for (const [t, v] of Object.entries(me.typeMods)) if (v) entries.push([`${TYPE_NAME[t as PType]}系`, `+${v}%`]);
    const pg = pager(entries, STATS_PER_PAGE, this.statPage, ([label, v]) => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('b', null, v)), {
      cls: 'stat-grid',
      keys: null,
      onPage: (n) => { this.statPage = n; this.render(); },
    });
    this.statPage = pg.page;
    this.side.append(h('div', { class: 'side-stat-head' }, h('h3', null, '属性'), pg.nav), pg.list);


  }
}
