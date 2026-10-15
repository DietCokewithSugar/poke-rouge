import { LINES } from '../../shared/pokemon';
import { SKILLS } from '../../shared/skills';
import { BIOMES } from '../../shared/waves';
import { DIFFICULTIES } from '../../shared/difficulty';
import type { MeState, PublicState } from '../../shared/sim/game';
import type { PvpSeatInfo } from '../../shared/protocol';
import { PVP_MODES } from '../../shared/pvp/sim';
import { Animator } from '../gfx/sprites';
import { trainerPortrait } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { clear, h, tip } from './dom';
import { confirmButton } from './layout';
import { skillIcon, skillInfo } from './describe';

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

  private pvpBox = h('div', { class: 'hud-pvp box tight hidden' });
  private pvpSeats: PvpSeatInfo[] = [];
  private myTeam = 0;
  private lastCount = -1;

  constructor(parent: HTMLElement, onPause: (() => void) | null, onLeave?: () => void, leaveConfirm = '再按一次离开') {
    this.pauseBtn = onLeave
      ? confirmButton('离开', leaveConfirm, 'btn small hud-pause', onLeave, { 'data-key': 'start' }, 'door')
      : h('button', { class: 'btn small icon hud-pause', 'data-key': 'start', title: '暂停', 'aria-label': '暂停', onclick: () => onPause?.() }, uiIcon('pause', 2));
    if (!onPause && !onLeave) this.pauseBtn.classList.add('hidden');
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
  }

  destroy() { this.root.remove(); }

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

  /** 对战：顶部显示两队宝可梦、倒计时与缩圈状态 */
  setPvp(seats: PvpSeatInfo[], you: number) {
    this.pvpSeats = seats;
    this.myTeam = seats.find((s) => s.id === you)?.team ?? 0;
    this.root.classList.add('pvp');
    this.pvpBox.classList.remove('hidden');
    set(this.downBox.querySelector('.hud-down-sub') as HTMLElement, '队友站到你身边就能把你救起来（附近有对手时无法救援）');
    const chip = (s: PvpSeatInfo) => h('div', { class: `pvp-chip ${s.id === you ? 'me' : ''}`, 'data-id': s.id, title: `${s.name}${s.bot ? '（AI）' : ''} · Lv${s.level}` },
      h('div', { class: 'pvp-chip-portrait' }, Animator.portrait(s.dex, 1)),
      h('div', { class: 'pvp-chip-body' },
        h('div', { class: 'pvp-chip-name' }, s.name, s.bot ? h('i', null, 'AI') : null),
        h('div', { class: 'bar thin' }, h('div', { class: 'bar-fill hp' })),
      ),
    );
    clear(this.pvpBox);
    const mode = seats.length > 2 ? '4v4' : '1v1';
    this.pvpBox.classList.toggle('compact', mode === '4v4');
    this.pvpBox.append(
      h('div', { class: 'pvp-side ally' }, seats.filter((s) => s.team === this.myTeam).map(chip)),
      h('div', { class: 'pvp-mid' }, h('div', { class: 'pvp-mode-name' }, PVP_MODES[mode].name), this.timer, h('div', { class: 'pvp-ring small' })),
      h('div', { class: 'pvp-side enemy' }, seats.filter((s) => s.team !== this.myTeam).map(chip)),
    );
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
    const t0 = PVP_MODES[pv.mode].dur * 0.3;
    set(this.pvpBox.querySelector('.pvp-ring') as HTMLElement, pv.ring.shrinking ? '场地正在缩小！' : pub.time < t0 ? `${Math.ceil(t0 - pub.time)} 秒后缩圈` : '场地已缩到最小');
  }

  show(on: boolean) { this.root.classList.toggle('hidden', !on); }

  update(me: MeState | null, pub: PublicState | null, you: number, hpOverride?: { hp: number; maxHp: number }) {
    if (me) {
      if (me.dex !== this.lastDex) {
        this.lastDex = me.dex;
        clear(this.me.portrait);
        this.me.portrait.appendChild(Animator.portrait(me.dex, 1));
      }
      set(this.me.name, me.form);
      set(this.me.lv, `Lv${me.level}`);
      const hp = hpOverride?.hp ?? me.hp, max = hpOverride?.maxHp ?? me.maxHp;
      this.me.hpFill.style.width = `${Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100))}%`;
      this.me.hpFill.classList.toggle('low', hp < max * 0.3);
      set(this.me.hpText, `${Math.max(0, hp)} / ${max}`);
      this.me.xpFill.style.width = `${Math.min(100, (me.xp / me.xpNext) * 100)}%`;
      set(this.me.money, `₽ ${me.money}`);
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
      me.skills.forEach((s, i) => {
        const cell = this.skills.children[i] as HTMLElement | undefined;
        const cd = cell?.querySelector('.cd') as HTMLElement | null;
        if (!cd) return;
        const frac = SKILLS[s.id] ? Math.min(1, s.cd / Math.max(0.1, s.max)) : 0;
        cd.style.setProperty('--p', `${Math.round(frac * 100)}%`);
      });
    }
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
      const tk = others.map((p) => `${p.id}:${p.dex}`).join(',');
      if (tk !== this.teamKey) {
        this.teamKey = tk;
        clear(this.team);
        for (const p of others) {
          this.team.appendChild(h('div', { class: 'team-row box tight', 'data-id': p.id },
            h('div', { class: 'team-portrait' }, Animator.portrait(p.dex, 1)),
            h('div', { class: 'team-body' },
              h('div', { class: 'team-name' }, `${p.name} · ${LINES[p.line].forms.find((f) => f.dex === p.dex)?.name ?? ''}`),
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
        set(row.querySelector('.team-status') as HTMLElement, p.down ? '濒死！靠近它来救援' : pub.phase === 'inter' ? (p.ready ? '已准备' : '购物中…') : `Lv${p.level} · 击败 ${p.kills}`);
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
