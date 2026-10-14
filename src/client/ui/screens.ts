import { ACHIEVEMENTS, META_UPGRADES, metaCost } from '../../shared/meta';
import { LINES, LINE_IDS, type LineId } from '../../shared/pokemon';
import { DIFFICULTIES, DIFFICULTY_IDS, type DifficultyId } from '../../shared/difficulty';
import type { LobbyPlayer, RoomInfo, ServerStats } from '../../shared/protocol';
import { SKILLS } from '../../shared/skills';
import { TYPE_NAME } from '../../shared/types';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { Animator } from '../gfx/sprites';
import { buyUpgrade, isDifficultyUnlocked, isUnlocked, refundUpgrades, saveProfile, type Profile, } from '../save';
import { clear, h, tip, toast } from './dom';

/**
 * 把界面放进容器。同一个界面重新渲染时（切换宝可梦、研究所升级、大厅刷新……）
 * 不再播放弹出动画，并保留滚动位置，看起来就是原地更新而不是关掉再打开。
 */
export function mount(root: HTMLElement, el: HTMLElement, key: string) {
  const prev = root.firstElementChild as HTMLElement | null;
  const same = root.dataset.screen === key && !!prev;
  const scroll = root.scrollTop;
  const inner = same ? prev!.scrollTop : 0;
  clear(root);
  if (same) el.classList.add('no-anim');
  root.dataset.screen = key;
  root.appendChild(el);
  if (same) { root.scrollTop = scroll; el.scrollTop = inner; }
}
import { STAT_LABEL_6, skillIcon, skillInfo, typeBadge } from './describe';

export interface TitleActions {
  solo(): void;
  browse(): void;
  pvp(): void;
  join(code: string): void;
  lab(): void;
  achievements(): void;
  settings(): void;
  credits(): void;
}

export function titleScreen(root: HTMLElement, p: Profile, a: TitleActions, stats: ServerStats | null) {
  const name = h('input', { class: 'field', maxlength: 12, placeholder: '训练家名字', value: p.name }) as HTMLInputElement;
  name.addEventListener('change', () => { p.name = name.value.trim().slice(0, 12); saveProfile(p); });
  const code = h('input', { class: 'field code', maxlength: 5, inputmode: 'numeric', placeholder: '房间号' }) as HTMLInputElement;
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 5); });
  const keepName = () => { p.name = name.value.trim().slice(0, 12) || p.name; saveProfile(p); };
  const unlockedAch = Object.keys(p.achievements).length;
  mount(root, h('div', { class: 'title-wrap' },
    h('div', { class: 'logo' }, h('div', { class: 'logo-main' }, '宝可肉鸽'), h('div', { class: 'logo-sub' }, 'POKé ROUGE · 宝可梦割草肉鸽')),
    h('div', { class: 'box menu' },
      h('label', null, '训练家名字'),
      name,
      h('button', { class: 'menu-item play', onclick: () => { keepName(); sfx('click'); a.solo(); } }, '单人冒险', h('small', null, '选择一只宝可梦，挑战 20 波野生宝可梦')),
      h('button', { class: 'menu-item', onclick: () => { keepName(); sfx('click'); a.browse(); } }, '联机大厅',
        h('small', { id: 'title-online' }, onlineText(stats))),
      h('button', { class: 'menu-item pvp-entry', onclick: () => { keepName(); sfx('click'); a.pvp(); } }, '宝可梦对战',
        h('small', { id: 'title-pvp' }, pvpText(p, stats))),
      h('div', { class: 'join-row' },
        code,
        h('button', { class: 'btn', onclick: () => { keepName(); if (code.value.length !== 5) { toast('请输入 5 位房间号', 'error'); return; } sfx('click'); a.join(code.value); } }, '加入房间'),
      ),
      h('button', { class: 'menu-item', onclick: () => { sfx('click'); a.lab(); } }, '大木研究所', h('small', null, `局外成长 · 星之沙 ${p.stardust}`)),
      h('button', { class: 'menu-item', onclick: () => { sfx('click'); a.achievements(); } }, '成就', h('small', null, `${unlockedAch} / ${ACHIEVEMENTS.length} · 达成成就解锁新的宝可梦`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn small ghost', onclick: () => { sfx('click'); a.settings(); } }, '设置'),
        h('button', { class: 'btn small ghost', onclick: () => { sfx('click'); a.credits(); } }, '致谢与说明'),
      ),
    ),
    h('div', { class: 'title-foot muted small' }, 'WASD / 方向键移动 · 技能自动释放 · 存活到倒计时结束即可过关'),
  ), 'title');
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') (code.nextElementSibling as HTMLButtonElement).click(); });
}

// ---------------------------------------------------------------- 选择宝可梦

function statBars(line: LineId) {
  const b = LINES[line].forms[0].base;
  const vals = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe];
  return h('div', { class: 'statbars' }, vals.map((v, i) => h('div', { class: 'statbar' },
    h('span', null, STAT_LABEL_6[i]), h('b', null, v),
    h('div', { class: 'sb' }, h('div', { class: 'sb-fill', style: `width:${Math.min(100, (v / 160) * 100)}%;background:${v >= 100 ? '#5fe08a' : v >= 60 ? '#ffd23f' : '#ff8c5a'}` })),
  )));
}

export function lineDetail(line: LineId) {
  const L = LINES[line];
  const evo = h('div', { class: 'evo-chain' });
  L.forms.forEach((f, i) => {
    if (i > 0) evo.appendChild(h('span', { class: 'evo-arrow' }, L.evoItem ? '雷之石 →' : `Lv${L.evoLevels[i - 1]} →`));
    evo.appendChild(h('div', { class: 'evo-form' }, Animator.portrait(f.dex, 1), h('div', { class: 'small' }, f.name)));
  });
  if (line === 'mewtwo') evo.appendChild(h('span', { class: 'muted small' }, `Lv${L.evoLevels.join(' / Lv')} 基因觉醒`));
  return h('div', { class: 'line-detail' },
    h('div', { class: 'ld-top' },
      h('div', { class: 'ld-portrait' }, Animator.portrait(L.forms[0].dex, 3)),
      h('div', null,
        h('h2', null, L.name),
        h('div', null, ...L.forms[0].types.map(typeBadge)),
        h('div', { class: 'muted' }, `技能栏 ${L.forms[0].slots} 个 · ${TYPE_NAME[L.bonusType]}系技能 +${L.bonusPct}%`),
        h('p', { class: 'flavor' }, L.flavor),
      ),
    ),
    statBars(line),
    h('div', { class: 'passives' }, L.passives.map((p) => h('div', { class: 'passive' }, h('b', null, p.name), ' ', p.desc))),
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, '初始技能'), ...L.start.map((id) => { const el = h('span', { class: 'chip' }, skillIcon(id, 1, true), SKILLS[id].name); tip(el, () => skillInfo(id, 1, line)); return el; })),
    h('div', { class: 'learnset small' }, h('span', { class: 'muted' }, '升级领悟'), ...L.learnset.map((e) => { const el = h('span', { class: 'chip' }, `Lv${e.lv} ${SKILLS[e.skill].name}`); tip(el, () => skillInfo(e.skill, 1, line)); return el; })),
    evo,
  );
}

export function pickGrid(p: Profile, selected: LineId | null, onPick: (l: LineId) => void, taken: Map<LineId, string> = new Map()) {
  return h('div', { class: 'pick-grid' }, LINE_IDS.map((id) => {
    const L = LINES[id];
    const open = isUnlocked(p, id);
    const el = h('button', { class: `pick ${selected === id ? 'on' : ''} ${open ? '' : 'locked'}`, onclick: () => { if (!open) { toast(L.unlockHint, 'error'); sfx('error'); return; } sfx('click'); onPick(id); } },
      Animator.portrait(L.forms[0].dex, 2),
      h('div', { class: 'pick-name' }, open ? L.name : '？？？'),
      h('div', null, ...L.forms[0].types.map(typeBadge)),
      open ? null : h('div', { class: 'pick-lock small' }, '未解锁'),
      taken.get(id) ? h('div', { class: 'pick-taken small' }, taken.get(id)!) : null,
    );
    if (!open) tip(el, () => L.unlockHint);
    return el;
  }));
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

export function selectScreen(root: HTMLElement, p: Profile, onStart: (l: LineId, d: DifficultyId) => void, onBack: () => void) {
  let sel: LineId = isUnlocked(p, p.lastLine) ? p.lastLine : 'charmander';
  let diff: DifficultyId = isDifficultyUnlocked(p, p.lastDifficulty) ? p.lastDifficulty : 'easy';
  const render = () => {
    mount(root, h('div', { class: 'box select' },
      h('div', { class: 'row between' },
        h('h2', null, '选择你的伙伴'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', 'data-back': '1', onclick: onBack }, '返回'),
          h('button', { class: 'btn gold', onclick: () => { p.lastLine = sel; p.lastDifficulty = diff; saveProfile(p); sfx('wave'); onStart(sel, diff); } }, `就决定是你了，${LINES[sel].name}！`),
        ),
      ),
      difficultyPicker(p, diff, (d) => { diff = d; render(); }),
      pickGrid(p, sel, (l) => { sel = l; render(); }),
      lineDetail(sel),
    ), 'select');
  };
  render();
}

// ---------------------------------------------------------------- 大厅

function copy(text: string, ok: string) {
  const done = () => toast(ok);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('复制下面的内容：', text));
  else prompt('复制下面的内容：', text);
}

export function pvpText(p: Profile, stats: ServerStats | null) {
  const fight = stats?.pvpPlaying || stats?.pvpQueue ? ` · ${stats.pvpPlaying ?? 0} 人对战中` : ' · 1v1 / 4v4 排位赛';
  return `背包 ${p.party.length} / 6${fight}`;
}

export function onlineText(stats: ServerStats | null) {
  return stats ? `当前在线 ${stats.online} 人 · ${stats.rooms} 个房间 · 最多 4 人联机` : '最多 4 人联机 · 查看房间列表、创建或加入房间';
}

export interface LobbyActions {
  pick(l: LineId): void;
  ready(on: boolean): void;
  start(): void;
  leave(): void;
  difficulty(id: DifficultyId): void;
  visibility(on: boolean): void;
}

export function lobbyScreen(root: HTMLElement, p: Profile, code: string, you: number, players: LobbyPlayer[], a: LobbyActions, difficulty: DifficultyId, isPublic: boolean) {
  const me = players.find((x) => x.id === you);
  const taken = new Map<LineId, string>();
  for (const x of players) if (x.line && x.id !== you) taken.set(x.line, x.name);
  const slots = [0, 1, 2, 3].map((i) => {
    const x = players[i];
    if (!x) return h('div', { class: 'slot empty' }, h('div', { class: 'muted' }, '等待加入…'));
    return h('div', { class: `slot ${x.id === you ? 'me' : ''}` },
      x.line ? Animator.portrait(LINES[x.line].forms[0].dex, 2) : h('div', { class: 'slot-q' }, '?'),
      h('div', { class: 'slot-name' }, x.name, x.host ? h('span', { class: 'tag' }, '房主') : null),
      h('div', { class: 'small muted' }, x.line ? LINES[x.line].name : '还没选择'),
      h('div', { class: `small ${x.ready || x.host ? 'ok' : 'muted'}` }, x.host ? '房主' : x.ready ? '已准备' : '未准备'),
    );
  });
  const canStart = me?.host && players.every((x) => x.line) && players.every((x) => x.host || x.ready);
  mount(root, h('div', { class: 'box lobby' },
    h('div', { class: 'row between' },
      h('div', null, h('div', { class: 'muted small' }, '房间号'), h('div', { class: 'room-code' }, code)),
      h('div', { class: 'row' },
        me?.host
          ? h('button', { class: `btn small ${isPublic ? '' : 'ghost'}`, title: '公开房间会出现在联机大厅的列表里', onclick: () => a.visibility(!isPublic) }, isPublic ? '公开房间' : '私密房间')
          : h('span', { class: 'muted small' }, isPublic ? '公开房间' : '私密房间'),
        h('button', { class: 'btn small', onclick: () => copy(code, '房间号已复制') }, '复制房间号'),
        h('button', { class: 'btn small', onclick: () => copy(`${location.origin}${location.pathname}?room=${code}`, '邀请链接已复制，发给朋友直接打开即可加入') }, '复制邀请链接'),
        h('button', { class: 'btn small ghost', 'data-back': '1', onclick: a.leave }, '离开房间'),
      ),
    ),
    h('div', { class: 'slots' }, slots),
    difficultyPicker(p, difficulty, me?.host ? (d) => a.difficulty(d) : null),
    me?.host ? null : h('p', { class: 'muted small' }, '难度由房主决定。'),
    h('h3', null, '选择你的宝可梦'),
    pickGrid(p, me?.line ?? null, (l) => a.pick(l), taken),
    me?.line ? lineDetail(me.line) : h('p', { class: 'sub' }, '点击上方的宝可梦进行选择（可以和队友重复）'),
    h('div', { class: 'row end' },
      me?.host
        ? h('button', { class: 'btn gold big', disabled: !canStart, onclick: a.start }, canStart ? '开始冒险！' : '等待所有人选择并准备')
        : h('button', { class: `btn big ${me?.ready ? '' : 'gold'}`, disabled: !me?.line, onclick: () => a.ready(!me?.ready) }, me?.ready ? '取消准备' : '准备！'),
    ),
  ), 'lobby');
}

// ---------------------------------------------------------------- 联机大厅（匹配）

export interface BrowseActions { create(isPublic: boolean): void; join(code: string): void; back(): void }

export class BrowseScreen {
  private list = h('div', { class: 'room-list' });
  private statsEl = h('div', { class: 'browse-stats' });
  private isPublic = true;
  constructor(root: HTMLElement, private a: BrowseActions, connected: boolean) {
    const code = h('input', { class: 'field code', maxlength: 5, inputmode: 'numeric', placeholder: '房间号' }) as HTMLInputElement;
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 5); });
    const join = () => { if (code.value.length !== 5) { toast('请输入 5 位房间号', 'error'); return; } sfx('click'); a.join(code.value); };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    const pubBtn = h('button', { class: 'btn small', onclick: () => { this.isPublic = !this.isPublic; pubBtn.textContent = this.isPublic ? '公开房间' : '私密房间'; pubBtn.classList.toggle('ghost', !this.isPublic); } }, '公开房间');
    mount(root, h('div', { class: 'box browse' },
      h('div', { class: 'row between' },
        h('div', null, h('h2', null, '联机大厅'), this.statsEl),
        h('button', { class: 'btn small ghost', 'data-back': '1', onclick: a.back }, '返回'),
      ),
      h('div', { class: 'browse-actions row between' },
        h('div', { class: 'row' }, h('button', { class: 'btn gold', onclick: () => { sfx('click'); a.create(this.isPublic); } }, '创建房间'), pubBtn),
        h('div', { class: 'row' }, code, h('button', { class: 'btn', onclick: join }, '加入房间')),
      ),
      h('h3', null, '公开房间'),
      this.list,
    ), 'browse');
    this.setStats(null, connected);
    this.setRooms([]);
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
    clear(this.list);
    if (!rooms.length) {
      this.list.appendChild(h('div', { class: 'room-empty muted' }, '还没有公开房间，创建一个等朋友加入吧！'));
      return;
    }
    for (const r of rooms) {
      const full = r.players.length >= r.max;
      const D = DIFFICULTIES[r.difficulty];
      this.list.appendChild(h('div', { class: `room-card ${r.inGame ? 'busy' : ''}` },
        h('div', { class: 'room-main' },
          h('div', { class: 'room-title' }, h('b', null, `${r.host} 的房间`), h('span', { class: 'muted small' }, ` #${r.code}`)),
          h('div', { class: 'room-mons' }, r.players.map((pl) => h('div', { class: 'room-mon', title: pl.name }, pl.line ? Animator.portrait(LINES[pl.line].forms[0].dex, 1) : h('span', { class: 'slot-q small' }, '?'), h('span', { class: 'small' }, pl.name)))),
        ),
        h('div', { class: 'room-side' },
          h('span', { class: 'diff-tag', style: `--dc:${D.color}` }, D.name),
          h('span', { class: 'small' }, `${r.players.length}/${r.max} 人`),
          h('span', { class: `small ${r.inGame ? 'gold' : 'ok'}` }, r.inGame ? `游戏中 · 第 ${r.wave} 波` : '等待中'),
          h('button', { class: 'btn small', disabled: r.inGame || full, onclick: () => { sfx('click'); this.a.join(r.code); } }, r.inGame ? '进行中' : full ? '已满' : '加入'),
        ),
      ));
    }
  }
}

// ---------------------------------------------------------------- 研究所 / 成就 / 设置

export function labScreen(root: HTMLElement, p: Profile, onBack: () => void) {
  const render = () => {
    mount(root, h('div', { class: 'box lab' },
      h('div', { class: 'row between' },
        h('div', null, h('h2', null, '大木研究所'), h('p', { class: 'sub' }, '用冒险中获得的星之沙，永久强化所有宝可梦的基础属性。')),
        h('div', { class: 'row' }, h('div', { class: 'money big' }, `星之沙 ${p.stardust}`), h('button', { class: 'btn small ghost', 'data-back': '1', onclick: onBack }, '返回')),
      ),
      h('div', { class: 'lab-grid' }, META_UPGRADES.map((u) => {
        const lv = p.upgrades[u.id] ?? 0;
        const maxed = lv >= u.max;
        const cost = maxed ? 0 : metaCost(u, lv);
        return h('div', { class: `lab-item ${maxed ? 'max' : ''}` },
          iconImg(u.icon, 3),
          h('div', { class: 'grow' },
            h('b', null, u.name),
            h('div', { class: 'small muted' }, `${u.desc} / 级`),
            h('div', { class: 'pips' }, Array.from({ length: u.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))),
          ),
          h('button', { class: 'btn small', disabled: maxed || p.stardust < cost, onclick: () => { if (buyUpgrade(p, u.id)) { sfx('buy'); render(); } } }, maxed ? '已满级' : `${cost}`),
        );
      })),
      h('div', { class: 'row end' }, h('button', { class: 'btn small ghost', onclick: () => { if (confirm('返还全部星之沙并重置研究？')) { refundUpgrades(p); render(); } } }, '重置并返还')),
    ), 'lab');
  };
  render();
}

export function achievementsScreen(root: HTMLElement, p: Profile, onBack: () => void) {
  mount(root, h('div', { class: 'box ach-screen' },
    h('div', { class: 'row between' }, h('h2', null, `成就 ${Object.keys(p.achievements).length} / ${ACHIEVEMENTS.length}`), h('button', { class: 'btn small ghost', 'data-back': '1', onclick: onBack }, '返回')),
    h('div', { class: 'muted small' }, `累计：${p.stats.runs} 局 · 通关 ${p.stats.wins} 次 · 击败 ${p.stats.kills} 只 · 最佳 ${p.stats.bestWave} 波`),
    h('div', { class: 'ach-list' }, ACHIEVEMENTS.map((a) => h('div', { class: `ach ${p.achievements[a.id] ? 'on' : ''}` },
      h('b', null, p.achievements[a.id] ? '★ ' : '☆ ', a.name),
      h('span', { class: 'small' }, a.desc),
      h('span', { class: 'small gold' }, `+${a.reward} 星之沙${a.unlocks ? ` · 解锁${LINES[a.unlocks].name}` : ''}${a.unlocksDifficulty ? ` · 解锁${DIFFICULTIES[a.unlocksDifficulty].name}难度` : ''}`),
    ))),
  ), 'ach-screen');
}

export function settingsScreen(root: HTMLElement, p: Profile, onChange: () => void, onBack: () => void) {
  const s = p.settings;
  const slider = (label: string, key: 'volume' | 'music') => {
    const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(s[key]) }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = Number(inp.value); saveProfile(p); onChange(); });
    return h('label', { class: 'set-row' }, h('span', null, label), inp);
  };
  const toggle = (label: string, key: 'damageNumbers' | 'gbFilter' | 'shake') => {
    const inp = h('input', { type: 'checkbox' }) as HTMLInputElement;
    inp.checked = s[key];
    inp.addEventListener('change', () => { s[key] = inp.checked; saveProfile(p); onChange(); });
    return h('label', { class: 'set-row' }, h('span', null, label), inp);
  };
  mount(root, h('div', { class: 'box settings' },
    h('div', { class: 'row between' }, h('h2', null, '设置'), h('button', { class: 'btn small ghost', 'data-back': '1', onclick: onBack }, '返回')),
    slider('音效音量', 'volume'),
    slider('音乐音量', 'music'),
    toggle('显示伤害数字', 'damageNumbers'),
    toggle('屏幕震动', 'shake'),
    toggle('初代 GB 绿屏滤镜', 'gbFilter'),
  ), 'settings');
}

export function creditsScreen(root: HTMLElement, onBack: () => void) {
  mount(root, h('div', { class: 'box credits' },
    h('div', { class: 'row between' }, h('h2', null, '说明与致谢'), h('button', { class: 'btn small ghost', 'data-back': '1', onclick: onBack }, '返回')),
    h('h3', null, '玩法'),
    h('ul', null,
      h('li', null, '普通波次 30~60 秒，撑到倒计时结束就算过关；第 10 波和第 20 波是 90 秒的首领波。'),
      h('li', null, '技能会自动瞄准最近的敌人释放。物理技能吃「物攻」（偏近身），特殊技能吃「特攻」（偏远程）。'),
      h('li', null, '敌人的接触伤害由「物防」减免，弹幕与爆炸由「特防」减免。'),
      h('li', null, '属性克制只是锦上添花：效果拔群伤害 +10%，效果不好 -10%；和自身属性相同的技能有 1.5 倍本系加成。'),
      h('li', null, '击败敌人掉落经验糖果（经验 + 金钱）。升级时选择强化，到达特定等级会领悟新技能。'),
      h('li', null, '等级够了以后，波次结束时会询问是否进化：可以按 B 取消，保持当前形态（配合进化奇石、不变之石更强），之后的商店里随时可以再进化。'),
      h('li', null, '每波结束后进入商店：购买道具、学习其它宝可梦的招式（越贵越高级）、刷新或锁定商品。香水会吸引更多敌人（收获也更多），喷雾、玻璃哨和洁净之符能减少敌人。'),
      h('li', null, '难度分简单 / 普通 / 困难：通关上一档才能解锁下一档，通关困难模式可以得到超梦。'),
      h('li', null, '联机时倒下的队友身边会出现绿色救援圈，站进去就能把它救起来；整局结束会获得星之沙，在大木研究所永久强化。'),
      h('li', null, '支持 Xbox / PlayStation 手柄：左摇杆或十字键移动，A 确认，B 返回，X 刷新商店，Y 出发，Start 暂停。'),
    ),
    h('h3', null, '致谢'),
    h('p', { class: 'small' }, '宝可梦像素精灵：PMDCollab / SpriteCollab 的众多画师（CC BY-NC 4.0，非商业使用），完整名单见仓库 CREDITS.md。'),
    h('p', { class: 'small' }, '界面风格参考 JPTER78/pokesurvivor；字体：缝合像素字体 Fusion Pixel Font（OFL 1.1）。'),
    h('p', { class: 'small muted' }, 'Pokémon 及相关名称为 Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company 的商标。本作为非营利粉丝作品。'),
  ), 'credits');
}

export function pauseScreen(root: HTMLElement, onResume: () => void, onSettings: () => void, onQuit: () => void) {
  mount(root, h('div', { class: 'box pause' },
    h('h2', null, '暂停'),
    h('div', { class: 'menu-list' },
      h('button', { class: 'menu-item play', onclick: onResume }, '继续'),
      h('button', { class: 'menu-item', onclick: onSettings }, '设置'),
      h('button', { class: 'menu-item', onclick: onQuit }, '放弃本局'),
    ),
  ), 'pause');
}
