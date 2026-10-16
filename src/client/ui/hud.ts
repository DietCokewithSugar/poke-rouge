import { FIELDS, fieldVerdict, type FieldVerdict } from '../../shared/fields';
import { BOOSTS, BOOST_DUR, type BoostId } from '../../shared/pickups';
import { LINES, formOf } from '../../shared/pokemon';
import { SKILLS } from '../../shared/skills';
import { BIOMES } from '../../shared/waves';
import { DIFFICULTIES } from '../../shared/difficulty';
import type { MeState, PublicState } from '../../shared/sim/game';
import type { PvpSeatInfo } from '../../shared/protocol';
import { PVP_MODES, RING_START, type PvpMode } from '../../shared/pvp/sim';
import { shinyName } from '../../shared/shiny';
import { BOOST_KIND, itemIconUrl } from '../gfx/pickups';
import { Animator } from '../gfx/sprites';
import { trainerPortrait } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { clear, h, tip } from './dom';
import { skillIcon, skillInfo, typeBadge } from './describe';

const VERDICT: Record<FieldVerdict, string> = { good: '对你有利', bad: '对你不利', mixed: '有利有弊', none: '对你没影响' };

export class Hud {
  root: HTMLElement;
  private me = {
    trainer: h('div', { class: 'hud-trainer' }),
    portrait: h('div', { class: 'hud-portrait' }),
    name: h('div', { class: 'hud-name' }),
    lv: h('span', { class: 'hud-lv' }),
    hpFill: h('div', { class: 'bar-fill hp' }),
    hpText: h('div', { class: 'bar-text' }),
    xpFill: h('div', { class: 'bar-fill xp' }),
    money: h('div', { class: 'hud-money' }),
  };
  private wave = h('div', { class: 'hud-wave' });
  private timer = h('div', { class: 'hud-timer' });
  private bossBox = h('div', { class: 'hud-boss hidden' });
  private bossName = h('div', { class: 'boss-name' });
  private bossFill = h('div', { class: 'bar-fill boss' });
  private team = h('div', { class: 'hud-team' });
  private skills = h('div', { class: 'hud-skills' });
  private banner = h('div', { class: 'hud-banner' });
  private downBox = h('div', { class: 'hud-down hidden' }, h('b', null, '你倒下了！'), h('div', { class: 'hud-down-sub' }, '队友站到你身边就能把你救起来'));
  private hordeEl = h('div', { class: 'hud-horde hidden' }, '群聚波！');
  private sub = h('div', { class: 'hud-sub' });
  private net = h('div', { class: 'hud-net hidden' });
  pauseBtn: HTMLButtonElement;
  private lastDex = -1;
  private skillKey = '';
  private teamKey = '';
  private bannerTimer = 0;
  private subTimer = 0;

  private pvpBox = h('div', { class: 'hud-pvp box tight compact hidden' });
  /** 技能冷却：服务器每秒只同步几次，两次之间在本地按时间倒数，进度条才不会跳 */
  private cds: { cd: number; max: number; at: number }[] = [];
  /** 增幅种子的倒计时（左上角，在训练家信息下面） */
  private boostBox = h('div', { class: 'hud-boosts hidden' });
  private boostKey = '';
  /** 局部属性场地的卡片（增幅下面）：获益属性、正负效果、对你有利还是不利；站在里面的那块会亮 */
  private fieldBox = h('div', { class: 'hud-fields hidden' });
  private fieldKey = '';
  private hereId: number | null = null;
  /** 自己现在站在哪块场地里（由画面提供） */
  fieldHere: () => number | null = () => null;
  private boosts: { left: number; at: number; t: HTMLElement; bar: HTMLElement }[] = [];
  private raf = 0;
  private pvpSeats: PvpSeatInfo[] = [];
  private myTeam = 0;
  private lastCount = -1;
  private autoBtn: HTMLButtonElement | null = null;

  /** onMenu：单人是暂停（pause），联机和对战是菜单（menu：设置、离开） */
  constructor(parent: HTMLElement, onMenu: (() => void) | null, kind: 'pause' | 'menu' = 'pause') {
    const label = kind === 'pause' ? '暂停' : '菜单（设置、离开）';
    this.pauseBtn = h('button', { class: 'btn small icon hud-pause', 'data-key': 'start', title: label, 'aria-label': label, onclick: () => onMenu?.() }, uiIcon(kind, 2));
    if (!onMenu) this.pauseBtn.classList.add('hidden');
    this.root = h('div', { id: 'hud' },
      h('div', { class: 'hud-me box tight' },
        this.me.trainer,
        this.me.portrait,
        h('div', { class: 'hud-me-body' },
          h('div', { class: 'hud-row' }, this.me.name, this.me.lv),
          h('div', { class: 'bar' }, this.me.hpFill, this.me.hpText),
          h('div', { class: 'bar thin' }, this.me.xpFill),
          this.me.money,
        ),
      ),
      h('div', { class: 'hud-left' }, this.boostBox, this.fieldBox),
      h('div', { class: 'hud-center' },
        h('div', { class: 'box tight hud-wavebox' }, this.wave, this.timer, this.hordeEl),
        this.pvpBox,
        this.bossBox,
      ),
      this.team,
      this.pauseBtn,
      this.skills,
      this.banner,
      this.sub,
      this.downBox,
      this.net,
    );
    this.bossBox.append(this.bossName, h('div', { class: 'bar boss' }, this.bossFill));
    parent.appendChild(this.root);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  /** 收到新的私有状态时调用：记下每个技能剩余的冷却和收到的时间 */
  setCooldowns(skills: MeState['skills']) {
    const now = performance.now();
    this.cds = skills.map((s) => ({ cd: s.cd, max: Math.max(0.1, s.max), at: now }));
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    this.cds.forEach((c, i) => {
      const cd = (this.skills.children[i] as HTMLElement | undefined)?.querySelector('.cd') as HTMLElement | null;
      if (!cd) return;
      const left = Math.max(0, c.cd - (now - c.at) / 1000);
      const p = `${Math.round(Math.min(1, left / c.max) * 100)}%`;
      if (cd.style.getPropertyValue('--p') !== p) cd.style.setProperty('--p', p);
    });
    for (const b of this.boosts) {
      // 服务器每 0.2 秒更新一次；两次之间最多往前推 0.3 秒（暂停时停在原地，不会自己倒数完）
      const left = Math.max(0, b.left - Math.min(0.3, (now - b.at) / 1000));
      set(b.t, `${Math.ceil(left)}秒`);
      const w = `${Math.round((left / BOOST_DUR) * 100)}%`;
      if (b.bar.style.width !== w) b.bar.style.width = w;
    }
    const here = this.fieldBox.childElementCount ? this.fieldHere() : null;
    if (here !== this.hereId) {
      this.hereId = here;
      for (const el of this.fieldBox.children) el.classList.toggle('here', Number((el as HTMLElement).dataset.id) === here);
    }
  };

  /** 场地卡片：只在波次进行中显示；按自己的属性和会的招式写明对你有利还是不利 */
  private setFields(pub: PublicState, me: MeState | null) {
    const list = pub.phase === 'wave' ? pub.fields ?? [] : [];
    const types = me ? formOf(me.line, me.stage).types : [];
    const moves = (me?.skills ?? []).map((s) => SKILLS[s.id]).filter(Boolean).map((d) => ({ type: d.type, damaging: d.cat !== 'status', phys: d.cat === 'phys' }));
    const verdicts = list.map((f) => fieldVerdict(f.kind, types, moves).verdict);
    const key = list.map((f, i) => `${f.id}:${f.on ? 1 : 0}:${verdicts[i]}`).join(',');
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    clear(this.fieldBox);
    list.forEach((f, i) => {
      const F = FIELDS[f.kind];
      this.fieldBox.appendChild(h('div', { class: `hud-field v-${verdicts[i]}${f.on ? '' : ' forming'}`, 'data-id': f.id, style: `--c: ${F.color}` },
        h('div', { class: 'hf-head' },
          h('span', { class: 'hf-name' }, F.name),
          h('span', { class: 'hf-types' }, F.types.map(typeBadge)),
          h('span', { class: 'hf-here' }, '你在这里'),
          h('span', { class: 'hf-v' }, f.on ? VERDICT[verdicts[i]] : '即将出现'),
        ),
        h('div', { class: 'hf-line pos' }, `▲ ${F.short[0]}`),
        h('div', { class: 'hf-line neg' }, `▼ ${F.short[1]}`),
      ));
    });
    this.fieldBox.classList.toggle('hidden', !list.length);
    this.hereId = null;
  }

  /** 正在生效的增幅：小图标 + 名字 + 剩余秒数 + 进度条 */
  private setBoosts(list: [BoostId, number][]) {
    const key = list.map(([id]) => id).join(',');
    if (key !== this.boostKey) {
      this.boostKey = key;
      clear(this.boostBox);
      this.boosts = list.map(([id]) => {
        const B = BOOSTS[id];
        const t = h('span', { class: 'hb-t' });
        const bar = h('i');
        this.boostBox.appendChild(h('div', { class: 'hud-boost', style: `--c: ${B.color}`, title: `${B.name}：${B.desc}` },
          h('img', { class: 'hb-ico', src: itemIconUrl(BOOST_KIND[id], 3), alt: '' }),
          h('span', { class: 'hb-name' }, B.label),
          t,
          h('div', { class: 'hb-bar' }, bar),
        ));
        return { left: 0, at: 0, t, bar };
      });
      this.boostBox.classList.toggle('hidden', !list.length);
    }
    const now = performance.now();
    list.forEach(([, left], i) => { const b = this.boosts[i]; if (b) { b.left = left; b.at = now; } });
  }

  /** 左上角：训练家 + 宝可梦 */
  setTrainer(trainer: string, name: string) {
    clear(this.me.trainer);
    this.me.trainer.appendChild(trainerPortrait(trainer, 1, 'tportrait'));
    this.me.trainer.title = name;
  }

  /** 联机延迟：往返时间与画面缓冲 */
  setNet(rtt: number, buffer: number) {
    const ms = Math.round(rtt);
    const level = ms < 120 && buffer < 160 ? 'good' : ms < 250 && buffer < 240 ? 'ok' : 'bad';
    this.net.className = `hud-net ${level}`;
    set(this.net, `${level === 'bad' ? '网络不稳定 · ' : ''}延迟 ${ms}ms`);
    this.net.title = `往返延迟 ${ms}ms · 画面缓冲 ${Math.round(buffer)}ms（网络抖动越大，缓冲越大）`;
  }

  /** 自动战斗按钮（右下角，键盘 T / 手柄 Y） */
  enableAuto(onToggle: () => void, hint: string) {
    this.autoBtn?.remove();
    this.autoBtn = h('button', { class: 'btn small hud-auto', 'data-key': 'y', onclick: () => onToggle() }, uiIcon('robot', 2), h('span', null, '手动'));
    tip(this.autoBtn, () => h('div', { class: 'info' }, h('b', null, 'AI 自动战斗（T）'), h('div', { class: 'small' }, hint)));
    this.root.appendChild(this.autoBtn);
  }

  setAuto(on: boolean) {
    if (!this.autoBtn) return;
    this.autoBtn.classList.toggle('on', on);
    set(this.autoBtn.querySelector('span') as HTMLElement, on ? '自动中' : '手动');
  }

  /** 对战：顶部显示两队宝可梦、倒计时与缩圈状态。单挑时每边是一位训练家的三只宝可梦 */
  setPvp(mode: PvpMode, seats: PvpSeatInfo[], you: number) {
    const me = seats.find((s) => s.id === you);
    const M = PVP_MODES[mode];
    this.pvpSeats = seats;
    this.myTeam = me?.team ?? 0;
    this.root.classList.add('pvp');
    this.pvpBox.classList.remove('hidden');
    set(this.downBox.querySelector('b') as HTMLElement, M.revive ? '你倒下了！' : '你的队长退场了！');
    set(this.downBox.querySelector('.hud-down-sub') as HTMLElement, M.revive ? '队友站到你身边就能把你救起来（附近有对手时无法救援）' : '另外两只宝可梦还在战斗，为它们加油吧！');
    const chip = (s: PvpSeatInfo) => {
      const form = LINES[s.line]?.forms.find((f) => f.dex === s.dex)?.name ?? '';
      return h('div', {
        class: `pvp-chip ${s.id === you ? 'me' : ''} ${me && s.owner === me.owner ? 'mine' : ''}`, 'data-id': s.id,
        title: `${s.name}${s.bot ? '（AI 训练家）' : ''}的${shinyName(form, s.shiny)} · Lv${s.level}${s.helper ? ' · AI 操作' : ''}`,
      },
      h('div', { class: 'pvp-chip-portrait' }, Animator.portrait(s.dex, 1, s.shiny)),
      h('div', { class: 'pvp-chip-body' }, h('div', { class: 'bar thin' }, h('div', { class: 'bar-fill hp' }))),
      );
    };
    const side = (ally: boolean) => {
      const list = seats.filter((s) => (s.team === this.myTeam) === ally);
      const label = M.team > 1 && list[0] ? `${list[0].name}${list[0].bot ? ' · AI' : ''}` : ally ? '我方' : '对方';
      return h('div', { class: `pvp-side ${ally ? 'ally' : 'enemy'}` }, h('div', { class: 'pvp-side-name' }, label), h('div', { class: 'pvp-chips' }, list.map(chip)));
    };
    clear(this.pvpBox);
    this.pvpBox.append(side(true), h('div', { class: 'pvp-mid' }, h('div', { class: 'pvp-mode-name' }, M.name), this.timer, h('div', { class: 'pvp-ring small' })), side(false));
  }

  private updatePvp(pub: PublicState) {
    const pv = pub.pvp!;
    for (const p of pub.players) {
      const el = this.pvpBox.querySelector(`[data-id="${p.id}"]`) as HTMLElement | null;
      if (!el) continue;
      (el.querySelector('.bar-fill') as HTMLElement).style.width = `${p.down ? 0 : (p.hp / Math.max(1, p.maxHp)) * 100}%`;
      el.classList.toggle('down', p.down);
    }
    if (pub.phase === 'inter') {
      set(this.timer, `${pv.countdown}`);
      if (pv.countdown !== this.lastCount) { this.lastCount = pv.countdown; if (pv.countdown > 0) this.announce(String(pv.countdown)); }
    } else {
      if (this.lastCount !== 0) { this.lastCount = 0; this.announce('对战开始！'); }
      const left = Math.max(0, Math.ceil(pub.dur - pub.time));
      set(this.timer, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      this.timer.classList.toggle('urgent', left <= 10);
    }
    const t0 = PVP_MODES[pv.mode].dur * RING_START;
    set(this.pvpBox.querySelector('.pvp-ring') as HTMLElement, pv.ring.shrinking ? '场地正在缩小！' : pub.time < t0 ? `${Math.ceil(t0 - pub.time)} 秒后缩圈` : '加时 · 伤害提高');
  }

  show(on: boolean) { this.root.classList.toggle('hidden', !on); }

  update(me: MeState | null, pub: PublicState | null, you: number, hpOverride?: { hp: number; maxHp: number }) {
    if (me) {
      if (me.dex !== this.lastDex) {
        this.lastDex = me.dex;
        clear(this.me.portrait);
        this.me.portrait.appendChild(Animator.portrait(me.dex, 1, me.shiny));
      }
      set(this.me.name, shinyName(me.form, me.shiny));
      set(this.me.lv, `Lv${me.level}`);
      const hp = hpOverride?.hp ?? me.hp, max = hpOverride?.maxHp ?? me.maxHp;
      this.me.hpFill.style.width = `${Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100))}%`;
      this.me.hpFill.classList.toggle('low', hp < max * 0.3);
      set(this.me.hpText, `${Math.max(0, hp)} / ${max}`);
      this.me.xpFill.style.width = `${Math.min(100, (me.xp / me.xpNext) * 100)}%`;
      set(this.me.money, `₽ ${me.money}`);
      this.setBoosts(me.down ? [] : me.boosts ?? []);
      const key = me.skills.map((s) => `${s.id}:${s.lv}`).join(',') + `|${me.slots}`;
      if (key !== this.skillKey) {
        this.skillKey = key;
        clear(this.skills);
        for (let i = 0; i < me.slots; i++) {
          const s = me.skills[i];
          const cell = h('div', { class: `hud-skill${s ? '' : ' empty'}` });
          if (s) {
            cell.appendChild(skillIcon(s.id, s.lv));
            cell.appendChild(h('div', { class: 'cd' }));
            tip(cell, () => skillInfo(s.id, s.lv, me.line));
          }
          this.skills.appendChild(cell);
        }
      }
    }
    if (pub) this.setFields(pub, me);
    if (pub?.pvp) {
      this.updatePvp(pub);
      this.downBox.classList.toggle('hidden', !(me?.down && pub.phase === 'wave' && this.pvpSeats.filter((s) => s.team === this.myTeam).length > 1));
    } else if (pub) {
      const D = DIFFICULTIES[pub.difficulty];
      set(this.wave, `${D.name} · 第 ${pub.wave} / ${pub.total} 波 · ${BIOMES[pub.biome]?.name ?? ''}`);
      this.hordeEl.classList.toggle('hidden', !(pub.horde && pub.phase === 'wave'));
      this.downBox.classList.toggle('hidden', !(me?.down && pub.players.length > 1 && pub.phase === 'wave'));
      if (pub.phase === 'wave') {
        const left = Math.max(0, pub.dur - pub.time);
        set(this.timer, left <= 0 && pub.boss ? '击败首领！' : `${Math.ceil(left)}`);
        this.timer.classList.toggle('urgent', left <= 5);
      } else if (pub.phase === 'inter') {
        set(this.timer, '商店');
        this.timer.classList.remove('urgent');
      }
      if (pub.boss) {
        this.bossBox.classList.remove('hidden');
        set(this.bossName, `${pub.boss.name}  ${pub.boss.hp} / ${pub.boss.max}`);
        this.bossFill.style.width = `${(pub.boss.hp / pub.boss.max) * 100}%`;
      } else this.bossBox.classList.add('hidden');
      const others = pub.players.filter((p) => p.id !== you);
      const tk = others.map((p) => `${p.id}:${p.dex}:${p.shiny ? 1 : 0}`).join(',');
      if (tk !== this.teamKey) {
        this.teamKey = tk;
        clear(this.team);
        for (const p of others) {
          this.team.appendChild(h('div', { class: 'team-row box tight', 'data-id': p.id },
            h('div', { class: 'team-portrait' }, Animator.portrait(p.dex, 1, p.shiny)),
            h('div', { class: 'team-body' },
              h('div', { class: 'team-name' }, `${p.name} · ${shinyName(LINES[p.line].forms.find((f) => f.dex === p.dex)?.name ?? '', p.shiny)}`),
              h('div', { class: 'bar thin' }, h('div', { class: 'bar-fill hp' })),
              h('div', { class: 'team-status' }),
            ),
          ));
        }
      }
      for (const p of others) {
        const row = this.team.querySelector(`[data-id="${p.id}"]`) as HTMLElement | null;
        if (!row) continue;
        (row.querySelector('.bar-fill') as HTMLElement).style.width = `${(p.hp / Math.max(1, p.maxHp)) * 100}%`;
        set(row.querySelector('.team-status') as HTMLElement, p.down ? '濒死！靠近它来救援' : p.away ? '离开了 · AI 代打中' : pub.phase === 'inter' ? (p.ready ? '已准备' : '购物中…') : `Lv${p.level} · 击败 ${p.kills}`);
        row.classList.toggle('away', !!p.away);
        row.classList.toggle('down', p.down);
      }
    }
  }

  announce(text: string, sub = '') {
    set(this.banner, text);
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), 2200);
    if (sub) this.message(sub);
  }

  message(text: string) {
    set(this.sub, text);
    this.sub.classList.remove('show');
    void this.sub.offsetWidth;
    this.sub.classList.add('show');
    window.clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => this.sub.classList.remove('show'), 2600);
  }
}

function set(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
