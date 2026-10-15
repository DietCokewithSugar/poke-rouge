import { DIFFICULTIES } from '../../shared/difficulty';
import { ENEMIES } from '../../shared/enemies';
import { ITEMS } from '../../shared/items';
import { ACHIEVEMENTS, type RunSummary } from '../../shared/meta';
import { TRAINERS } from '../../shared/trainers';
import { LINES } from '../../shared/pokemon';
import type { BoardEntry } from '../../shared/protocol';
import { SKILLS, TIER_COLOR } from '../../shared/skills';
import { TYPE_COLOR } from '../../shared/types';
import { TOTAL_WAVES, WAVES } from '../../shared/waves';
import { iconImg } from '../gfx/icons';
import { uiIcon } from '../gfx/uiicons';
import { validateBuild } from '../../shared/pvp/build';
import { sfx } from '../audio';
import { PARTY_MAX, addToParty, releaseFromParty, type Profile, type RunReward } from '../save';
import { h, tip, toast } from './dom';
import { itemInfo, skillIcon, skillInfo, typeBadge } from './describe';
import { releaseModal } from './pvp';
import { mount, portraitSlot, tabs } from './screens';
import { iconBtn, pager } from './layout';

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} 分 ${String(s).padStart(2, '0')} 秒` : `${s} 秒`;
}

function fmtNum(n: number) {
  return n >= 100000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN');
}

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

/** 20 格的波次进度条：完成的点亮，首领波标金色 */
function waveStrip(s: RunSummary) {
  return h('div', { class: 'r-strip' }, Array.from({ length: TOTAL_WAVES }, (_, i) => {
    const w = i + 1;
    const boss = !!WAVES[i].boss;
    const cls = w <= s.wavesCleared ? 'done' : w === s.wavesCleared + 1 && !s.victory ? 'fail' : '';
    const el = h('div', { class: `r-cell ${cls} ${boss ? 'boss' : ''}` }, boss ? '★' : '');
    tip(el, () => `第 ${w} 波${boss ? `（首领：${ENEMIES[WAVES[i].boss!].name}）` : ''}${cls === 'done' ? ' · 已完成' : cls === 'fail' ? ' · 在这一波倒下' : ''}`);
    return el;
  }));
}

/** 每波击败数柱状图 */
function waveChart(s: RunSummary) {
  const waves = s.detail.waves;
  if (!waves.length) return h('div', { class: 'muted small' }, '没有记录');
  const max = Math.max(1, ...waves.map((w) => w.kills));
  return h('div', { class: 'r-chart' }, waves.map((w) => {
    const boss = !!WAVES[w.w - 1]?.boss;
    const bar = h('div', { class: 'r-bar-wrap' },
      h('div', { class: 'r-bar-num' }, w.kills),
      h('div', { class: `r-bar ${boss ? 'boss' : ''}`, style: `height:${Math.max(4, (w.kills / max) * 100)}%` }),
      h('div', { class: 'r-bar-label' }, w.w),
    );
    tip(bar, () => h('div', { class: 'info' },
      h('b', null, `第 ${w.w} 波${boss ? ' · 首领波' : ''}`),
      h('div', { class: 'small' }, `击败 ${w.kills} 只`),
      h('div', { class: 'small' }, `造成伤害 ${fmtNum(w.dmg)}`),
      h('div', { class: 'small' }, `承受伤害 ${fmtNum(w.taken)}`),
      h('div', { class: 'small' }, `用时 ${w.time} 秒`),
    ));
    return bar;
  }));
}

/** 技能伤害占比 */
function skillChart(s: RunSummary) {
  const rows = s.detail.skillDmg.filter(([, v]) => v > 0);
  const total = rows.reduce((a, [, v]) => a + v, 0) || 1;
  const held = new Map(s.detail.skills.map((x) => [x.id, x.lv]));
  const list = h('div', { class: 'r-skills' });
  const max = rows[0]?.[1] ?? 1;
  for (const [id, v] of rows) {
    const def = SKILLS[id];
    const lv = held.get(id);
    const name = def ? def.name : id === '_dot' ? '灼伤 / 中毒 / 寄生' : '反伤等其它';
    const color = def ? TYPE_COLOR[def.type] : '#a0a8b8';
    const row = h('div', { class: `r-skill ${def && lv === undefined ? 'forgot' : ''}` },
      skillIcon(id, lv ?? 1, true),
      h('div', { class: 'r-skill-name' }, name, lv && lv > 1 ? ` +${lv - 1}` : '', def && lv === undefined ? h('span', { class: 'muted small' }, ' （已遗忘）') : null),
      h('div', { class: 'r-skill-bar' }, h('div', { style: `width:${(v / max) * 100}%;background:${color}` })),
      h('div', { class: 'r-skill-num' }, `${fmtNum(v)} · ${Math.round((v / total) * 100)}%`),
    );
    if (def) tip(row, () => skillInfo(id, lv ?? 1, s.line));
    list.appendChild(row);
  }
  // 持有但没有造成伤害的技能（护盾、回复等）
  for (const x of s.detail.skills) {
    if (rows.some(([id]) => id === x.id)) continue;
    const row = h('div', { class: 'r-skill' }, skillIcon(x.id, x.lv, true), h('div', { class: 'r-skill-name' }, SKILLS[x.id].name, x.lv > 1 ? ` +${x.lv - 1}` : ''), h('div', { class: 'r-skill-bar' }), h('div', { class: 'r-skill-num muted' }, SKILLS[x.id].cat === 'status' ? '辅助技能' : '没有造成伤害'));
    tip(row, () => skillInfo(x.id, x.lv, s.line));
    list.appendChild(row);
  }
  return list;
}

function itemGrid(s: RunSummary, page: number, onPage: (n: number) => void) {
  const items = s.detail.items.filter(([id]) => ITEMS[id]).sort((a, b) => ITEMS[b[0]].tier - ITEMS[a[0]].tier || b[1] - a[1]);
  const pg = pager(items, 32, page, ([id, n]) => {
    const it = ITEMS[id];
    const cell = h('div', { class: `item-cell tier${it.tier}`, style: `--tc:${TIER_COLOR[it.tier]}` }, iconImg(it.icon, 3), n > 1 ? h('i', null, `×${n}`) : null);
    tip(cell, () => itemInfo(id, n));
    return cell;
  }, { cls: 'r-items', empty: () => h('div', { class: 'muted small' }, '这一局没有持有道具'), filler: () => h('div', { class: 'item-cell empty' }), onPage, keys: null });
  return h('div', { class: 'r-paged' }, pg.list, pg.nav);
}

function topKills(s: RunSummary) {
  const list = s.detail.topKills.filter(([id]) => ENEMIES[id]).slice(0, 8);
  if (!list.length) return h('div', { class: 'muted small' }, '没有击败任何宝可梦');
  return h('div', { class: 'r-kills' }, list.map(([id, n]) => {
    const e = ENEMIES[id];
    return h('div', { class: 'r-kill' }, portraitSlot(e.dex, 1, 'tiny'), h('div', { class: 'small' }, e.name), h('b', null, `×${n}`));
  }));
}

/** 每一波的详细数据表 */
function waveTable(s: RunSummary, page: number, onPage: (n: number) => void) {
  const pg = pager(s.detail.waves, 8, page, (w) => h('div', { class: 'wt-row' },
    h('span', null, `第 ${w.w} 波${WAVES[w.w - 1]?.boss ? ' ★' : ''}`), h('span', null, w.kills), h('span', null, fmtNum(w.dmg)), h('span', null, fmtNum(w.taken)), h('span', null, `${w.time} 秒`),
  ), { cls: 'wave-table', empty: () => h('div', { class: 'muted small' }, '没有记录'), filler: () => h('div', { class: 'wt-row filler' }), onPage, keys: null });
  return h('div', { class: 'r-paged' },
    h('div', { class: 'wt-row head' }, h('span', null, '波次'), h('span', null, '击败'), h('span', null, '伤害'), h('span', null, '承伤'), h('span', null, '用时')),
    pg.list, pg.nav);
}

/** 结算后把这只宝可梦放进背包（满了要先放生一只） */
function storeButton(p: Profile, s: RunSummary, state: { stored: boolean }) {
  const form = s.detail.form;
  const btn = h('button', { class: 'btn store', disabled: state.stored }, state.stored ? '已放入背包 ✓' : `放入背包（${p.party.length} / ${PARTY_MAX}）`) as HTMLButtonElement;
  const done = () => {
    state.stored = true;
    btn.disabled = true;
    btn.textContent = '已放入背包 ✓';
    sfx('buy');
    toast(`${form} Lv${s.level} 已放入背包，可以在「宝可梦对战」里使用`, 'gold', 3200);
  };
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    if (addToParty(p, s)) { done(); return; }
    sfx('click');
    releaseModal(p.party, s.build ?? null, (uid) => {
      releaseFromParty(p, uid);
      if (addToParty(p, s)) done();
    }, () => btn.focus());
  });
  tip(btn, () => h('div', { class: 'info' },
    h('b', null, '放入背包'),
    h('div', { class: 'small' }, '保留这一局的等级、形态、技能（含等级）、道具和升级强化。'),
    h('div', { class: 'small' }, `可以用来和其他玩家对战（排位赛），最多保存 ${PARTY_MAX} 只。`),
  ));
  return btn;
}

export function resultsScreen(root: HTMLElement, victory: boolean, s: RunSummary | null, reward: RunReward | null, board: BoardEntry[], you: number, onContinue: () => void, label: string, profile?: Profile, onHome?: () => void) {
  const state = { tab: 0, stored: false, items: 0, waves: 0, achs: 0 };
  const render = () => {
    const head = h('div', { class: 'r-head' },
      h('h2', { class: victory ? 'gold' : '' }, victory ? '通关！你是真正的宝可梦大师！' : '眼前一片漆黑……'),
      h('div', { class: 'row' },
        s?.build && profile && typeof validateBuild(s.build) !== 'string' ? storeButton(profile, s, state) : null,
        onHome ? iconBtn('home', '回到真新镇', onHome, { cls: 'ghost', attrs: { 'data-back': '1' }, text: '回到真新镇' }) : null,
        h('button', { class: 'btn gold big', 'data-key': 'y', onclick: onContinue }, label),
      ),
    );
    if (!s) {
      mount(root, h('div', { class: 'box panel-sm results' }, head), 'results');
      return;
    }
    const d = s.detail;
    const D = DIFFICULTIES[s.difficulty];
    const L = LINES[s.line];
    const kills = d.kills.minion + d.kills.elite + d.kills.boss;
    const evoPath = h('div', { class: 'r-evo' }, d.forms.map((dex, i) => [
      i ? h('span', { class: 'evo-arrow' }, '→') : null,
      portraitSlot(dex, 1, 'tiny'),
    ]));
    const hero = h('div', { class: 'r-hero' },
      portraitSlot(d.dex, 3, 'r-hero-portrait'),
      h('div', null,
        h('div', { class: 'big' }, `${d.form}  Lv${s.level}`),
        h('div', null, ...L.forms.find((f) => f.dex === d.dex)!.types.map(typeBadge)),
        h('div', { class: 'small', style: `color:${D.color}` }, `${D.name}模式${s.players > 1 ? ` · ${s.players} 人联机` : ' · 单人'}`),
        d.forms.length > 1 ? evoPath : h('div', { class: 'muted small' }, L.forms.length > 1 ? '全程没有进化' : ''),
      ),
    );
    const tiles = h('div', { class: 'r-tiles' },
      tile('游戏时长', fmtTime(d.time)),
      tile('完成波次', `${s.wavesCleared} / ${TOTAL_WAVES}`, victory ? '通关' : `倒在第 ${s.wavesCleared + 1} 波`, victory ? '#ffd23f' : undefined),
      tile('击败', kills, `小怪 ${d.kills.minion} · 精英 ${d.kills.elite} · 首领 ${d.kills.boss}`),
      tile('造成伤害', fmtNum(s.damage), `暴击 ${d.crits} · 拔群 ${s.superEff}`),
      tile('承受伤害', fmtNum(d.damageTaken), `闪避 ${d.dodges} 次`),
      tile('回复', fmtNum(d.healed)),
      tile('获得金钱', `₽${fmtNum(s.moneyEarned)}`, `花费 ₽${fmtNum(d.moneySpent)}`),
      tile('道具 / 技能', `${d.items.reduce((a, [, n]) => a + n, 0)} / ${d.skills.length}`),
    );
    let achs: Node | null = null;
    if (reward?.newAchievements.length) {
      const pg = pager(reward.newAchievements, 6, state.achs, (a) => {
        const def = ACHIEVEMENTS.find((x) => x.id === a.id);
        const names = [...(a.unlocks ?? []).map((l) => LINES[l].name), ...(a.trainer ? [`训练家${TRAINERS[a.trainer]?.name ?? ''}`] : [])];
        const unlock = names.length ? `解锁 ${names.join('、')}！` : def?.unlocksDifficulty ? `解锁${DIFFICULTIES[def.unlocksDifficulty].name}难度！` : '';
        const el = h('div', { class: `r-ach ${unlock ? 'unlock' : ''}` }, h('b', null, `★ ${a.name}`), h('span', { class: 'muted' }, ` +${a.reward}`), unlock ? h('span', { class: 'gold' }, ` · ${unlock}`) : null);
        if (def) tip(el, () => `${def.desc}${unlock ? ` · ${unlock}` : ''}`);
        return el;
      }, { cls: 'r-achs', filler: () => h('div', { class: 'r-ach filler' }), onPage: (n) => { state.achs = n; render(); }, keys: null, label: `达成 ${reward.newAchievements.length} 个新成就` });
      achs = h('div', { class: 'r-paged' }, pg.list, pg.nav);
    }
    const recruits = reward?.recruits ?? s.recruits ?? [];
    const rewards = h('div', { class: 'r-reward' },
      h('div', { class: 'reward' }, iconImg('stardust', 3), reward ? `获得星之沙 +${reward.stardust}` : '没有获得星之沙'),
      recruits.length ? h('div', { class: 'r-recruits' },
        h('span', { class: 'small gold' }, uiIcon('heart', 1), ` 结交了 ${recruits.length} 位新伙伴`),
        h('div', { class: 'r-recruit-list' }, recruits.slice(0, 8).map((l) => {
          const el = h('div', { class: 'r-recruit' }, portraitSlot(LINES[l].forms[0].dex, 1, 'tiny'), h('span', { class: 'small' }, LINES[l].name));
          tip(el, () => `${LINES[l].name}崇拜了你，回到真新镇可以在「我的家」让它跟着你`);
          return el;
        })),
      ) : null,
      achs ?? h('div', { class: 'muted small' }, '这一局没有达成新成就'),
    );
    const boardEl = board.length > 1 ? h('table', { class: 'board' },
      h('tr', null, h('th', null, '训练家'), h('th', null, '宝可梦'), h('th', null, '等级'), h('th', null, '击败'), h('th', null, '伤害'), h('th', null, '承伤'), h('th', null, '救援')),
      board.map((b) => h('tr', { class: b.id === you ? 'me' : '' },
        h('td', null, b.name),
        h('td', { class: 'board-mon' }, portraitSlot(b.dex, 1, 'tiny'), LINES[b.line].forms.find((f) => f.dex === b.dex)?.name ?? LINES[b.line].name),
        h('td', null, b.level), h('td', null, b.kills), h('td', null, fmtNum(b.damage)), h('td', null, fmtNum(b.taken)), h('td', null, b.revives))),
    ) : null;
    const names = ['概览', '技能与道具', boardEl ? '击败与队伍' : '击败与波次'];
    const content = state.tab === 0
      ? h('div', { class: 'r-grid' },
        h('div', { class: 'r-col' }, hero, tiles, section('波次进度', waveStrip(s))),
        h('div', { class: 'r-col' }, rewards, section('每波击败数', waveChart(s))))
      : state.tab === 1
        ? h('div', { class: 'r-grid' },
          h('div', { class: 'r-col' }, section('技能伤害', skillChart(s))),
          h('div', { class: 'r-col' }, section(`持有道具（${d.items.reduce((a, [, n]) => a + n, 0)}）`, itemGrid(s, state.items, (n) => { state.items = n; render(); }))))
        : h('div', { class: 'r-grid' },
          h('div', { class: 'r-col' }, section('最常击败的宝可梦', topKills(s))),
          h('div', { class: 'r-col' }, boardEl ? section('队伍', boardEl) : section('每波数据', waveTable(s, state.waves, (n) => { state.waves = n; render(); }))));
    mount(root, h('div', { class: 'box panel results' },
      head,
      tabs(names, state.tab, (i) => { state.tab = i; render(); }),
      h('div', { class: 'tab-body' }, content),
    ), 'results');
  };
  render();
}
