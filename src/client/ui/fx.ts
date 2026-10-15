/**
 * 过场：切换界面时先盖住画面（淡出、条纹、光圈、闪白），换好之后再揭开；
 * 对战前的 VS 画面、冒险出发时的地名牌、胜负大字、颁发徽章。设置里可以关闭过场动画。
 * 所有动画都按时间结束（不依赖 animationend），中途出错也不会卡住画面。
 */
import { sfx } from '../audio';
import { artFull } from '../gfx/trainers';
import { uiIcon } from '../gfx/uiicons';
import { Animator } from '../gfx/sprites';
import { h } from './dom';

let enabled = true;
export function setTransitions(on: boolean) { enabled = on; }

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** 让刚插入的元素先按初始样式算一遍，否则紧接着加上的 in 不会有过渡（直接跳到结束的样子） */
function start(el: HTMLElement) {
  void el.getBoundingClientRect();
  el.classList.add('in');
}

function layer(): HTMLElement {
  let el = document.getElementById('fx');
  if (!el) { el = h('div', { id: 'fx' }); document.body.appendChild(el); }
  return el;
}

export type Cover = 'fade' | 'door' | 'battle' | 'iris' | 'flash';

/** 盖住 / 揭开各需要多久（毫秒） */
const DUR: Record<Cover, [number, number]> = { fade: [220, 260], door: [180, 240], battle: [620, 320], iris: [460, 420], flash: [140, 420] };

function coverEl(kind: Cover) {
  const el = h('div', { class: `cov cov-${kind}` });
  if (kind === 'battle') for (let i = 0; i < 8; i++) el.appendChild(h('i', { style: `--i:${i}` }));
  if (kind === 'iris') el.appendChild(h('i', { class: 'hole' }));
  return el;
}

let busy = false;

/**
 * 盖住画面 → 执行 swap（换界面）→ 揭开。正在播放别的过场时直接换，不排队。
 * hold：盖住之后停留多久（等新界面画出第一帧）。
 */
export async function transition(kind: Cover, swap: () => void, o: { hold?: number } = {}) {
  if (!enabled || busy) { swap(); return; }
  busy = true;
  const el = coverEl(kind);
  layer().appendChild(el);
  try {
    start(el);
    if (kind === 'battle') sfx('wave');
    await wait(DUR[kind][0]);
    try { swap(); } catch (e) { console.error(e); }
    await wait(o.hold ?? 80);
    el.classList.remove('in');
    el.classList.add('out');
    await wait(DUR[kind][1]);
  } finally {
    el.remove();
    busy = false;
  }
}

// ---------------------------------------------------------------- 对战开场

export interface VsSide { name: string; sub?: string; art: string; dex: number[] }

/** 对战开场：两位训练家从两边滑进来，中间一个大大的 VS。点一下可以跳过 */
export async function vsSplash(left: VsSide, right: VsSide, title: string) {
  if (!enabled) return;
  const side = (s: VsSide, cls: string) => h('div', { class: `vs-side ${cls}` },
    h('div', { class: 'vs-art' }, artFull(s.art, 3)),
    h('div', { class: 'vs-info' },
      h('div', { class: 'vs-name' }, s.name),
      s.sub ? h('div', { class: 'vs-sub' }, s.sub) : null,
      h('div', { class: 'vs-mons' }, s.dex.map((d) => Animator.portrait(d, 1))),
    ),
  );
  const el = h('div', { class: 'vs' },
    side(left, 'left'), side(right, 'right'),
    h('div', { class: 'vs-mid' }, h('b', null, 'VS'), h('div', { class: 'vs-title' }, title)),
  );
  let skip: () => void = () => {};
  const skipped = new Promise<void>((r) => { skip = r; });
  el.addEventListener('pointerdown', () => skip());
  layer().appendChild(el);
  start(el);
  sfx('boss');
  await Promise.race([wait(1750), skipped]);
  el.classList.add('out');
  await wait(260);
  el.remove();
}

// ---------------------------------------------------------------- 地名牌与大字

/** 火红叶绿风格的地名牌：从上面滑下来，停一会儿再收回去（不挡操作）；正在过场时等画面揭开再出来 */
export function placeSign(text: string, sub = '') {
  if (!enabled) return;
  if (busy) {
    const t = window.setInterval(() => { if (!busy) { window.clearInterval(t); placeSign(text, sub); } }, 50);
    return;
  }
  const el = h('div', { class: 'place-sign' }, h('b', null, text), sub ? h('small', null, sub) : null);
  layer().appendChild(el);
  start(el);
  window.setTimeout(() => el.classList.remove('in'), 2200);
  window.setTimeout(() => el.remove(), 2700);
}

/** 画面中央的大字（通关、全员倒下、对战胜负），盖住画面一会儿 */
export async function bigBanner(text: string, sub: string, tone: 'win' | 'lose' | 'draw') {
  if (!enabled) return;
  const el = h('div', { class: `big-banner ${tone}` }, h('b', null, text), sub ? h('small', null, sub) : null);
  layer().appendChild(el);
  start(el);
  await wait(tone === 'lose' ? 1500 : 1300);
  el.classList.add('out');
  await wait(300);
  el.remove();
}

// ---------------------------------------------------------------- 颁发徽章

export interface BadgeAward { icon: string; name: string; color: string; gym: string; bonus: string[]; stardust: number; achievements: string[] }

/** 拿到徽章：徽章转着放大，下面写加成和奖励，点按钮关闭（关闭过场动画时也会显示，只是没有动画） */
export function badgeCeremony(a: BadgeAward): Promise<void> {
  return new Promise((done) => {
    const close = () => { el.classList.add('out'); window.setTimeout(() => { el.remove(); done(); }, enabled ? 260 : 0); };
    const el = h('div', { class: `badge-get modal ${enabled ? '' : 'still'}` },
      h('div', { class: 'box badge-box' },
        h('div', { class: 'badge-rays', style: `--bc:${a.color}` }),
        h('div', { class: 'badge-big' }, uiIcon(a.icon, 8, 'uico badge-ico')),
        h('h2', { class: 'gold' }, `获得了${a.name}！`),
        h('div', { class: 'small muted' }, `${a.gym}的徽章 · 冒险与对战中永久生效`),
        h('div', { class: 'badge-bonus' }, a.bonus.map((b) => h('span', { class: 'pos' }, b))),
        a.stardust ? h('div', { class: 'small gold' }, `星之沙 +${a.stardust}`) : null,
        a.achievements.length ? h('div', { class: 'small' }, '新成就：', a.achievements.join('、')) : null,
        h('button', { class: 'btn gold', 'data-key': 'y', 'data-back': '1', onclick: () => { sfx('click'); close(); } }, '太好了！'),
      ),
    );
    layer().appendChild(el);
    sfx('achieve');
    window.setTimeout(() => sfx('clear'), 450);
    (el.querySelector('button') as HTMLButtonElement).focus();
  });
}
