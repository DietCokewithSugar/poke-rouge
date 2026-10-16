type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** 极简的 DOM 构造器：h('div', { class: 'x', onclick }, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`缺少元素 ${sel}`);
  return el as HTMLElement;
}

let toastBox: HTMLElement | null = null;
export function toast(text: string, kind: 'info' | 'error' | 'gold' = 'info', ms = 2600) {
  toastBox ??= $('#toasts');
  const t = h('div', { class: `toast ${kind}` }, text);
  toastBox.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

let tipEl: HTMLElement | null = null;
/** 当前这张提示是从哪个元素冒出来的。元素被拆掉（关掉界面、对战结束）时提示也要一起消失 */
let tipOwner: HTMLElement | null = null;
let tipRaf = 0;

function canHover() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function placeAt(x: number, y: number) {
  if (!tipEl) return;
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  let left = x + 16, top = y + 16;
  if (left + w > window.innerWidth - 8) left = x - w - 12;
  if (top + hh > window.innerHeight - 8) top = window.innerHeight - hh - 8;
  // 坐标是 0 时不要贴到左上角（触屏有时会给出 0,0）
  if (x < 2 && y < 2 && tipOwner) {
    const r = tipOwner.getBoundingClientRect();
    left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left));
    top = Math.min(window.innerHeight - hh - 8, Math.max(8, r.bottom + 8));
  }
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${Math.max(8, top)}px`;
}

function watchTip() {
  tipRaf = 0;
  if (!tipEl || tipEl.classList.contains('hidden')) return;
  if (!tipOwner?.isConnected) { hideTip(); return; }
  tipRaf = requestAnimationFrame(watchTip);
}

function showTip(el: HTMLElement, content: () => Node | string, x: number, y: number) {
  tipEl ??= $('#tooltip');
  clear(tipEl);
  const c = content();
  tipEl.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  tipEl.classList.remove('hidden');
  tipOwner = el;
  placeAt(x, y);
  if (!tipRaf) tipRaf = requestAnimationFrame(watchTip);
}

/** 鼠标悬停提示。触屏没有悬停，点一下在按钮旁边显示，点别处或界面关掉就收起 */
export function tip(el: HTMLElement, content: () => Node | string) {
  el.addEventListener('mouseenter', (e) => {
    if (!canHover()) return;
    showTip(el, content, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => { if (tipOwner === el && canHover()) placeAt(e.clientX, e.clientY); });
  // 触屏点按后浏览器会留一个假的鼠标位置，界面一刷新就可能补发 mouseleave：触屏只靠点别处收起
  el.addEventListener('mouseleave', () => { if (tipOwner === el && canHover()) hideTip(); });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' || canHover()) return;
    if (tipOwner === el && tipEl && !tipEl.classList.contains('hidden')) { hideTip(); return; }
    const r = el.getBoundingClientRect();
    showTip(el, content, r.left + r.width / 2, r.bottom);
  });
}

export function hideTip() {
  tipEl?.classList.add('hidden');
  tipOwner = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    if (!tipOwner) return;
    if (e.target instanceof Node && tipOwner.contains(e.target)) return;
    hideTip();
  }, true);
}
