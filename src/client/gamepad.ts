/**
 * 手柄支持（Xbox / PlayStation，浏览器标准映射）：
 *   左摇杆 / 十字键    移动；菜单与商店中移动选择框
 *   A / ×             确认（点击选中的按钮）
 *   B / ○             返回、取消（例如取消进化）
 *   X / □             商店：刷新
 *   Y / △             商店：出发
 *   Start / Options   暂停 / 继续（单人）
 */
import { setPadVector } from './input';
import { toast } from './ui/dom';

export interface PadHooks { pause(): void }

const BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const DEAD = 0.28;

let hooks: PadHooks;
let prev: boolean[] = [];
let navDir = '';
let navNext = 0;
let focused: HTMLElement | null = null;

export function initGamepad(h: PadHooks) {
  hooks = h;
  window.addEventListener('gamepadconnected', (e) => {
    const name = ((e as GamepadEvent).gamepad?.id ?? '').replace(/\(.*?\)/g, '').trim().slice(0, 40) || '手柄';
    toast(`已连接手柄：${name}。左摇杆移动，A 确认，B 返回，X 刷新，Y 出发，Start 暂停`, 'info', 5000);
  });
  window.addEventListener('gamepaddisconnected', () => { setPadVector(0, 0); toast('手柄已断开', 'error'); });
  // 鼠标一动就隐藏手柄选择框，避免两种操作打架
  window.addEventListener('mousemove', () => setFocus(null));
  requestAnimationFrame(poll);
}

function activePad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

function poll(now: number) {
  requestAnimationFrame(poll);
  const pad = activePad();
  if (!pad) { setPadVector(0, 0); return; }
  const pressed = pad.buttons.map((b) => b.pressed || b.value > 0.5);
  const down = (i: number) => pressed[i] && !prev[i];
  let x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  if (Math.hypot(x, y) < DEAD) { x = 0; y = 0; }
  if (pressed[BTN.LEFT]) x = -1;
  if (pressed[BTN.RIGHT]) x = 1;
  if (pressed[BTN.UP]) y = -1;
  if (pressed[BTN.DOWN]) y = 1;
  setPadVector(x, y);

  const layer = activeLayer();
  if (layer) {
    // 方向：按下立即移动一次，按住时先停顿再连续移动
    const dir = Math.abs(x) > 0.6 || Math.abs(y) > 0.6 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'r' : 'l') : y > 0 ? 'd' : 'u') : '';
    if (dir && (dir !== navDir || now >= navNext)) {
      navNext = now + (dir !== navDir ? 380 : 130);
      move(layer, dir);
    }
    navDir = dir;
    if (down(BTN.A)) confirm(layer);
    if (down(BTN.B)) back(layer);
    if (down(BTN.X)) clickText(layer, '刷新');
    if (down(BTN.Y)) (layer.querySelector('.btn.go') as HTMLButtonElement | null)?.click();
    if (down(BTN.START)) {
      if (!clickText(layer, '继续')) hooks.pause();
    }
  } else {
    setFocus(null);
    if (down(BTN.START)) hooks.pause();
  }
  prev = pressed;
}

/** 当前可以操作的界面层：弹窗 > 全屏菜单 > 波次间商店 */
function activeLayer(): HTMLElement | null {
  const modal = document.querySelector('.modal:not(.hidden)') as HTMLElement | null;
  if (modal) return modal;
  const screen = document.getElementById('screen');
  if (screen && !screen.classList.contains('hidden') && screen.childElementCount) return screen;
  const inter = document.getElementById('inter');
  if (inter && !inter.classList.contains('hidden')) return inter;
  return null;
}

function focusables(layer: HTMLElement): HTMLElement[] {
  return [...layer.querySelectorAll<HTMLElement>('button, input, [data-pad]')].filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  });
}

function setFocus(el: HTMLElement | null) {
  if (focused === el) return;
  if (focused) {
    focused.classList.remove('pad-focus');
    focused.dispatchEvent(new MouseEvent('mouseleave'));
  }
  focused = el;
  if (!el) return;
  el.classList.add('pad-focus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.right, clientY: r.bottom }));
}

function current(layer: HTMLElement): HTMLElement | null {
  if (focused && layer.contains(focused) && focused.isConnected && !(focused as HTMLButtonElement).disabled) return focused;
  return null;
}

function preferred(list: HTMLElement[]): HTMLElement | undefined {
  return list.find((el) => el.matches('button.card, .btn.gold, .menu-item.play')) ?? list.find((el) => el.tagName === 'BUTTON') ?? list[0];
}

function move(layer: HTMLElement, dir: string) {
  const list = focusables(layer);
  if (!list.length) return;
  const cur = current(layer);
  if (!cur) { setFocus(preferred(list) ?? null); return; }
  if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'l' || dir === 'r')) {
    const step = Number(cur.step) || 0.05;
    cur.value = String(Math.max(Number(cur.min), Math.min(Number(cur.max), Number(cur.value) + (dir === 'r' ? step : -step))));
    cur.dispatchEvent(new Event('input'));
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const [dx, dy] = dir === 'l' ? [-1, 0] : dir === 'r' ? [1, 0] : dir === 'u' ? [0, -1] : [0, 1];
  let best: HTMLElement | null = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const along = (bx - ax) * dx + (by - ay) * dy;
    if (along <= 4) continue;
    const side = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
    const score = along + side * 2.5;
    if (score < bs) { bs = score; best = el; }
  }
  if (best) setFocus(best);
}

function confirm(layer: HTMLElement) {
  const cur = current(layer);
  if (!cur) { setFocus(preferred(focusables(layer)) ?? null); return; }
  cur.click();
  // 点击后界面可能整体重绘，把选择框交给新的同位置元素
  requestAnimationFrame(() => { if (!cur.isConnected) setFocus(null); });
}

function back(layer: HTMLElement) {
  const el = layer.querySelector('[data-back]') as HTMLElement | null;
  if (el && !(el as HTMLButtonElement).disabled) { el.click(); return; }
  if (layer.classList.contains('modal')) { layer.classList.add('hidden'); return; }
  const ghost = [...layer.querySelectorAll<HTMLButtonElement>('button.ghost')].find((b) => /返回|算了|离开/.test(b.textContent ?? ''));
  ghost?.click();
}

function clickText(layer: HTMLElement, text: string): boolean {
  const el = [...layer.querySelectorAll<HTMLButtonElement>('button')].find((b) => !b.disabled && (b.textContent ?? '').includes(text));
  if (!el) return false;
  el.click();
  return true;
}
