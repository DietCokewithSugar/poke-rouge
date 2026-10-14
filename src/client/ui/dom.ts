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
/** 鼠标悬停提示 */
export function tip(el: HTMLElement, content: () => Node | string) {
  el.addEventListener('mouseenter', (e) => {
    tipEl ??= $('#tooltip');
    clear(tipEl);
    const c = content();
    tipEl.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    tipEl.classList.remove('hidden');
    place(e as MouseEvent);
  });
  el.addEventListener('mousemove', (e) => place(e as MouseEvent));
  el.addEventListener('mouseleave', () => tipEl?.classList.add('hidden'));
}

export function hideTip() { tipEl?.classList.add('hidden'); }

function place(e: MouseEvent) {
  if (!tipEl) return;
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
  if (y + hh > window.innerHeight - 8) y = window.innerHeight - hh - 8;
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
}
