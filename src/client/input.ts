/** 键盘（WASD/方向键）与触屏摇杆。 */
const keys = new Set<string>();
let joy: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
let joyEl: HTMLElement | null = null;
let knobEl: HTMLElement | null = null;
let enabled = false;
const pad = { x: 0, y: 0 };

/** 手柄摇杆 / 十字键的方向（由 gamepad.ts 每帧写入） */
export function setPadVector(x: number, y: number) {
  pad.x = x;
  pad.y = y;
}

export function initInput(canvas: HTMLCanvasElement) {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  joyEl = document.createElement('div');
  joyEl.className = 'joy hidden';
  knobEl = document.createElement('div');
  knobEl.className = 'joy-knob';
  joyEl.appendChild(knobEl);
  document.body.appendChild(joyEl);

  canvas.addEventListener('touchstart', (e) => {
    if (!enabled || joy) return;
    const t = e.changedTouches[0];
    joy = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY };
    joyEl!.style.left = `${t.clientX}px`;
    joyEl!.style.top = `${t.clientY}px`;
    joyEl!.classList.remove('hidden');
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!joy) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== joy.id) continue;
      joy.x = t.clientX;
      joy.y = t.clientY;
      const dx = joy.x - joy.sx, dy = joy.y - joy.sy;
      const d = Math.min(40, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      knobEl!.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (joy && t.identifier === joy.id) {
        joy = null;
        joyEl!.classList.add('hidden');
        knobEl!.style.transform = '';
      }
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
}

export function setInputEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    keys.clear();
    joy = null;
    joyEl?.classList.add('hidden');
  }
}

export function moveVector(): { x: number; y: number } {
  if (!enabled) return { x: 0, y: 0 };
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (!x && !y && (pad.x || pad.y)) { x = pad.x; y = pad.y; }
  if (joy) {
    const dx = joy.x - joy.sx, dy = joy.y - joy.sy;
    const d = Math.hypot(dx, dy);
    if (d > 8) { x = dx / Math.max(d, 40); y = dy / Math.max(d, 40); }
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}
