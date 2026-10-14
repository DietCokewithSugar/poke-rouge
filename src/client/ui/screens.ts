import { ACHIEVEMENTS, META_UPGRADES, metaCost, type RunSummary } from '../../shared/meta';
import { LINES, LINE_IDS, type LineId } from '../../shared/pokemon';
import type { LobbyPlayer } from '../../shared/protocol';
import { SKILLS } from '../../shared/skills';
import { TYPE_NAME } from '../../shared/types';
import { sfx } from '../audio';
import { iconImg } from '../gfx/icons';
import { Animator } from '../gfx/sprites';
import { buyUpgrade, isUnlocked, refundUpgrades, saveProfile, type Profile, type RunReward } from '../save';
import { clear, h, tip, toast } from './dom';
import { STAT_LABEL_6, skillIcon, skillInfo, typeBadge } from './describe';

export interface TitleActions {
  solo(): void;
  create(): void;
  join(code: string): void;
  lab(): void;
  achievements(): void;
  settings(): void;
  credits(): void;
}

export function titleScreen(root: HTMLElement, p: Profile, a: TitleActions) {
  clear(root);
  const name = h('input', { class: 'field', maxlength: 12, placeholder: '训练家名字', value: p.name }) as HTMLInputElement;
  name.addEventListener('change', () => { p.name = name.value.trim().slice(0, 12); saveProfile(p); });
  const code = h('input', { class: 'field code', maxlength: 5, inputmode: 'numeric', placeholder: '房间号' }) as HTMLInputElement;
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 5); });
  const keepName = () => { p.name = name.value.trim().slice(0, 12) || p.name; saveProfile(p); };
  const unlockedAch = Object.keys(p.achievements).length;
  root.appendChild(h('div', { class: 'title-wrap' },
    h('div', { class: 'logo' }, h('div', { class: 'logo-main' }, '宝可肉鸽'), h('div', { class: 'logo-sub' }, 'POKé ROUGE · 宝可梦割草肉鸽')),
    h('div', { class: 'box menu' },
      h('label', null, '训练家名字'),
      name,
      h('button', { class: 'menu-item play', onclick: () => { keepName(); sfx('click'); a.solo(); } }, '单人冒险', h('small', null, '选择一只宝可梦，挑战 20 波野生宝可梦')),
      h('button', { class: 'menu-item', onclick: () => { keepName(); sfx('click'); a.create(); } }, '创建房间', h('small', null, '最多 4 人联机，把房间号发给朋友')),
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
  ));
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

export function selectScreen(root: HTMLElement, p: Profile, onStart: (l: LineId) => void, onBack: () => void) {
  let sel: LineId = isUnlocked(p, p.lastLine) ? p.lastLine : 'charmander';
  const render = () => {
    clear(root);
    root.appendChild(h('div', { class: 'box select' },
      h('div', { class: 'row between' },
        h('h2', null, '选择你的伙伴'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', onclick: onBack }, '返回'),
          h('button', { class: 'btn gold', onclick: () => { p.lastLine = sel; saveProfile(p); sfx('wave'); onStart(sel); } }, `就决定是你了，${LINES[sel].name}！`),
        ),
      ),
      pickGrid(p, sel, (l) => { sel = l; render(); }),
      lineDetail(sel),
    ));
  };
  render();
}

// ---------------------------------------------------------------- 大厅

function copy(text: string, ok: string) {
  const done = () => toast(ok);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('复制下面的内容：', text));
  else prompt('复制下面的内容：', text);
}

export interface LobbyActions { pick(l: LineId): void; ready(on: boolean): void; start(): void; leave(): void }

export function lobbyScreen(root: HTMLElement, p: Profile, code: string, you: number, players: LobbyPlayer[], a: LobbyActions) {
  clear(root);
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
  root.appendChild(h('div', { class: 'box lobby' },
    h('div', { class: 'row between' },
      h('div', null, h('div', { class: 'muted small' }, '房间号'), h('div', { class: 'room-code' }, code)),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => copy(code, '房间号已复制') }, '复制房间号'),
        h('button', { class: 'btn small', onclick: () => copy(`${location.origin}${location.pathname}?room=${code}`, '邀请链接已复制，发给朋友直接打开即可加入') }, '复制邀请链接'),
        h('button', { class: 'btn small ghost', onclick: a.leave }, '离开房间'),
      ),
    ),
    h('div', { class: 'slots' }, slots),
    h('h3', null, '选择你的宝可梦'),
    pickGrid(p, me?.line ?? null, (l) => a.pick(l), taken),
    me?.line ? lineDetail(me.line) : h('p', { class: 'sub' }, '点击上方的宝可梦进行选择（可以和队友重复）'),
    h('div', { class: 'row end' },
      me?.host
        ? h('button', { class: 'btn gold big', disabled: !canStart, onclick: a.start }, canStart ? '开始冒险！' : '等待所有人选择并准备')
        : h('button', { class: `btn big ${me?.ready ? '' : 'gold'}`, disabled: !me?.line, onclick: () => a.ready(!me?.ready) }, me?.ready ? '取消准备' : '准备！'),
    ),
  ));
}

// ---------------------------------------------------------------- 结算

export function resultsScreen(root: HTMLElement, victory: boolean, s: RunSummary | null, reward: RunReward | null, board: { id: number; name: string; line: LineId; level: number; kills: number; damage: number }[], you: number, onContinue: () => void, label: string) {
  clear(root);
  root.appendChild(h('div', { class: 'box results' },
    h('h2', { class: victory ? 'gold' : '' }, victory ? '通关！你是真正的宝可梦大师！' : '眼前一片漆黑……'),
    s ? h('div', { class: 'result-grid' },
      h('div', null, h('span', { class: 'muted' }, '完成波次'), h('b', null, `${s.wavesCleared} / 20`)),
      h('div', null, h('span', { class: 'muted' }, '等级'), h('b', null, `Lv${s.level}`)),
      h('div', null, h('span', { class: 'muted' }, '击败'), h('b', null, s.kills)),
      h('div', null, h('span', { class: 'muted' }, '总伤害'), h('b', null, s.damage)),
      h('div', null, h('span', { class: 'muted' }, '效果拔群'), h('b', null, s.superEff)),
      h('div', null, h('span', { class: 'muted' }, '获得金钱'), h('b', null, `₽${s.moneyEarned}`)),
    ) : null,
    reward ? h('div', { class: 'reward' }, iconImg('stardust', 3), `获得星之沙 +${reward.stardust}`) : null,
    reward?.newAchievements.length ? h('div', { class: 'new-ach' },
      h('h3', null, '达成新成就！'),
      reward.newAchievements.map((a) => h('div', { class: 'ach on' }, h('b', null, a.name), ` +${a.reward} 星之沙`, a.unlocks ? h('span', { class: 'gold' }, ` · 解锁 ${LINES[a.unlocks].name}！`) : null)),
    ) : null,
    board.length > 1 ? h('table', { class: 'board' },
      h('tr', null, h('th', null, '训练家'), h('th', null, '宝可梦'), h('th', null, '等级'), h('th', null, '击败'), h('th', null, '伤害')),
      board.map((b) => h('tr', { class: b.id === you ? 'me' : '' }, h('td', null, b.name), h('td', null, LINES[b.line].name), h('td', null, b.level), h('td', null, b.kills), h('td', null, b.damage))),
    ) : null,
    h('div', { class: 'row end' }, h('button', { class: 'btn gold big', onclick: onContinue }, label)),
  ));
}

// ---------------------------------------------------------------- 研究所 / 成就 / 设置

export function labScreen(root: HTMLElement, p: Profile, onBack: () => void) {
  const render = () => {
    clear(root);
    root.appendChild(h('div', { class: 'box lab' },
      h('div', { class: 'row between' },
        h('div', null, h('h2', null, '大木研究所'), h('p', { class: 'sub' }, '用冒险中获得的星之沙，永久强化所有宝可梦的基础属性。')),
        h('div', { class: 'row' }, h('div', { class: 'money big' }, `星之沙 ${p.stardust}`), h('button', { class: 'btn small ghost', onclick: onBack }, '返回')),
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
    ));
  };
  render();
}

export function achievementsScreen(root: HTMLElement, p: Profile, onBack: () => void) {
  clear(root);
  root.appendChild(h('div', { class: 'box ach-screen' },
    h('div', { class: 'row between' }, h('h2', null, `成就 ${Object.keys(p.achievements).length} / ${ACHIEVEMENTS.length}`), h('button', { class: 'btn small ghost', onclick: onBack }, '返回')),
    h('div', { class: 'muted small' }, `累计：${p.stats.runs} 局 · 通关 ${p.stats.wins} 次 · 击败 ${p.stats.kills} 只 · 最佳 ${p.stats.bestWave} 波`),
    h('div', { class: 'ach-list' }, ACHIEVEMENTS.map((a) => h('div', { class: `ach ${p.achievements[a.id] ? 'on' : ''}` },
      h('b', null, p.achievements[a.id] ? '★ ' : '☆ ', a.name),
      h('span', { class: 'small' }, a.desc),
      h('span', { class: 'small gold' }, `+${a.reward} 星之沙${a.unlocks ? ` · 解锁${LINES[a.unlocks].name}` : ''}`),
    ))),
  ));
}

export function settingsScreen(root: HTMLElement, p: Profile, onChange: () => void, onBack: () => void) {
  clear(root);
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
  root.appendChild(h('div', { class: 'box settings' },
    h('div', { class: 'row between' }, h('h2', null, '设置'), h('button', { class: 'btn small ghost', onclick: onBack }, '返回')),
    slider('音效音量', 'volume'),
    slider('音乐音量', 'music'),
    toggle('显示伤害数字', 'damageNumbers'),
    toggle('屏幕震动', 'shake'),
    toggle('初代 GB 绿屏滤镜', 'gbFilter'),
  ));
}

export function creditsScreen(root: HTMLElement, onBack: () => void) {
  clear(root);
  root.appendChild(h('div', { class: 'box credits' },
    h('div', { class: 'row between' }, h('h2', null, '说明与致谢'), h('button', { class: 'btn small ghost', onclick: onBack }, '返回')),
    h('h3', null, '玩法'),
    h('ul', null,
      h('li', null, '每波 60~90 秒，撑到倒计时结束就算过关；第 10 波和第 20 波有首领。'),
      h('li', null, '技能会自动瞄准最近的敌人释放。物理技能吃「物攻」（偏近身），特殊技能吃「特攻」（偏远程）。'),
      h('li', null, '敌人的接触伤害由「物防」减免，弹幕与爆炸由「特防」减免。'),
      h('li', null, '属性克制有效：效果拔群 ×1.75，效果不好 ×0.6；和自身属性相同的技能有 1.5 倍本系加成。'),
      h('li', null, '击败敌人掉落经验糖果（经验 + 金钱）。升级时选择强化，到达特定等级会进化并领悟新技能。'),
      h('li', null, '每波结束后进入商店：购买道具、学习其它宝可梦的招式（越贵越高级）、刷新或锁定商品。'),
      h('li', null, '联机时倒下的队友可以靠近救援；整局结束会获得星之沙，在大木研究所永久强化。'),
    ),
    h('h3', null, '致谢'),
    h('p', { class: 'small' }, '宝可梦像素精灵：PMDCollab / SpriteCollab 的众多画师（CC BY-NC 4.0，非商业使用），完整名单见仓库 CREDITS.md。'),
    h('p', { class: 'small' }, '界面风格参考 JPTER78/pokesurvivor；字体：缝合像素字体 Fusion Pixel Font（OFL 1.1）。'),
    h('p', { class: 'small muted' }, 'Pokémon 及相关名称为 Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company 的商标。本作为非营利粉丝作品。'),
  ));
}

export function pauseScreen(root: HTMLElement, onResume: () => void, onSettings: () => void, onQuit: () => void) {
  clear(root);
  root.appendChild(h('div', { class: 'box pause' },
    h('h2', null, '暂停'),
    h('div', { class: 'menu-list' },
      h('button', { class: 'menu-item play', onclick: onResume }, '继续'),
      h('button', { class: 'menu-item', onclick: onSettings }, '设置'),
      h('button', { class: 'menu-item', onclick: onQuit }, '放弃本局'),
    ),
  ));
}
