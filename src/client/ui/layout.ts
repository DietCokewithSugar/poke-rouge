/**
 * 界面尺寸：所有卡片界面都按固定的 rem 尺寸设计（最大 60rem × 33.5rem），
 * 根字号按窗口大小计算，100% 时最大的界面正好占画面的 90%，「界面大小」设置在此基础上等比缩小。
 * 界面不滚动、不随内容改变高度；放不下的列表用分页。
 */
import { sfx } from '../audio';
import { h } from './dom';

/** 最大的界面尺寸（rem） */
export const PANEL_W = 60;
export const PANEL_H = 33.5;
export const UI_SCALES = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];

let scale = 1;

export function rootFontPx(s = scale) {
  const fit = Math.min((window.innerWidth * 0.9) / PANEL_W, (window.innerHeight * 0.9) / PANEL_H);
  return Math.max(5, fit * Math.max(0.5, Math.min(1, s)));
}

function apply() {
  document.documentElement.style.fontSize = `${rootFontPx().toFixed(2)}px`;
}

export function setUiScale(s: number) {
  scale = s;
  apply();
}

window.addEventListener('resize', apply);
window.visualViewport?.addEventListener('resize', apply);

export function defaultUiScale() {
  return window.matchMedia('(pointer: coarse)').matches ? 1 : 0.9;
}

/**
 * 分页列表：固定 per 个格子（不足的用空格子补齐，高度永远不变），
 * 下面一行是翻页按钮（手柄 LB / RB）。
 */
export function pager<T>(items: T[], per: number, page: number, render: (t: T, i: number) => Node, opts: {
  cls: string;
  empty?: () => Node;
  filler?: () => Node;
  onPage: (p: number) => void;
  label?: string;
  /** 手柄翻页键；同一界面有两个分页时，第二个传 null（用方向键选中按钮翻页） */
  keys?: [string, string] | null;
}) {
  const keys = opts.keys === undefined ? ['lb', 'rb'] : opts.keys;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const cur = Math.max(0, Math.min(pages - 1, page));
  const list = h('div', { class: `pager-list ${opts.cls}` });
  const slice = items.slice(cur * per, cur * per + per);
  if (!items.length && opts.empty) list.appendChild(h('div', { class: 'pager-empty' }, opts.empty()));
  else {
    slice.forEach((t, i) => list.appendChild(render(t, cur * per + i)));
    for (let i = slice.length; i < per; i++) list.appendChild(opts.filler ? opts.filler() : h('div', { class: 'pager-filler' }));
  }
  const go = (p: number) => { if (p < 0 || p >= pages || p === cur) return; sfx('click'); opts.onPage(p); };
  const nav = h('div', { class: `pager-nav ${pages > 1 ? '' : 'single'}` },
    h('button', { class: 'btn tiny ghost', 'data-key': keys?.[0], disabled: cur <= 0, onclick: () => go(cur - 1) }, '◀'),
    h('span', { class: 'small muted pager-label' }, opts.label ? `${opts.label} · ` : '', `${cur + 1} / ${pages}`),
    h('button', { class: 'btn tiny ghost', 'data-key': keys?.[1], disabled: cur >= pages - 1, onclick: () => go(cur + 1) }, '▶'),
  );
  return { list, nav, page: cur, pages };
}

/** 需要确认的按钮：第一次点击变成「再点一次确认」，3 秒内再点才执行（手柄也能操作，不弹浏览器对话框） */
export function confirmButton(label: string, confirmLabel: string, cls: string, onConfirm: () => void, attrs: Record<string, unknown> = {}) {
  let armed = 0;
  const btn = h('button', { class: cls, ...attrs }, label) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    if (armed) {
      window.clearTimeout(armed);
      armed = 0;
      btn.textContent = label;
      btn.classList.remove('armed');
      onConfirm();
      return;
    }
    sfx('click');
    btn.textContent = confirmLabel;
    btn.classList.add('armed');
    armed = window.setTimeout(() => { armed = 0; btn.textContent = label; btn.classList.remove('armed'); }, 3000);
  });
  return btn;
}
