import { LINES } from '../../shared/pokemon';
import { SKILLS } from '../../shared/skills';
import { BIOMES } from '../../shared/waves';
import type { MeState, PublicState } from '../../shared/sim/game';
import { Animator } from '../gfx/sprites';
import { clear, h, tip } from './dom';
import { skillIcon, skillInfo } from './describe';

export class Hud {
  root: HTMLElement;
  private me = {
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
  private sub = h('div', { class: 'hud-sub' });
  pauseBtn: HTMLButtonElement;
  private lastDex = -1;
  private skillKey = '';
  private teamKey = '';
  private bannerTimer = 0;
  private subTimer = 0;

  constructor(parent: HTMLElement, onPause: (() => void) | null) {
    this.pauseBtn = h('button', { class: 'btn small hud-pause', onclick: () => onPause?.() }, '暂停');
    if (!onPause) this.pauseBtn.classList.add('hidden');
    this.root = h('div', { id: 'hud' },
      h('div', { class: 'hud-me box tight' },
        this.me.portrait,
        h('div', { class: 'hud-me-body' },
          h('div', { class: 'hud-row' }, this.me.name, this.me.lv),
          h('div', { class: 'bar' }, this.me.hpFill, this.me.hpText),
          h('div', { class: 'bar thin' }, this.me.xpFill),
          this.me.money,
        ),
      ),
      h('div', { class: 'hud-center' },
        h('div', { class: 'box tight hud-wavebox' }, this.wave, this.timer),
        this.bossBox,
      ),
      this.team,
      this.pauseBtn,
      this.skills,
      this.banner,
      this.sub,
    );
    this.bossBox.append(this.bossName, h('div', { class: 'bar boss' }, this.bossFill));
    parent.appendChild(this.root);
  }

  destroy() { this.root.remove(); }

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
    if (pub) {
      set(this.wave, `第 ${pub.wave} / ${pub.total} 波 · ${BIOMES[pub.biome]?.name ?? ''}`);
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
