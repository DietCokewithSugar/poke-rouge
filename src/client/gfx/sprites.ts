import { SPRITE_META, type AnimMeta } from './spriteMeta';

export type AnimName = 'Idle' | 'Walk' | 'Attack' | 'Shoot' | 'Hurt' | 'Faint';

interface Sheet { img: HTMLImageElement; ready: boolean; white?: HTMLCanvasElement }
const sheets = new Map<string, Sheet>();

function sheet(dex: number, anim: string): Sheet {
  const k = `${dex}/${anim}`;
  let s = sheets.get(k);
  if (!s) {
    const img = new Image();
    s = { img, ready: false };
    const ref = s;
    img.onload = () => { ref.ready = true; };
    img.src = `${import.meta.env.BASE_URL}sprites/${dex}/${anim}.png`;
    sheets.set(k, s);
  }
  return s;
}

function whiteOf(s: Sheet): HTMLCanvasElement {
  if (s.white) return s.white;
  const c = document.createElement('canvas');
  c.width = s.img.width;
  c.height = s.img.height;
  const x = c.getContext('2d')!;
  x.drawImage(s.img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  s.white = c;
  return c;
}

export function preload(dexes: number[]): Promise<void> {
  const list: Sheet[] = [];
  for (const d of dexes) {
    const m = SPRITE_META[d];
    if (!m) continue;
    for (const a of Object.keys(m.a)) list.push(sheet(d, a));
  }
  return new Promise((res) => {
    const t0 = performance.now();
    const check = () => {
      if (list.every((s) => s.ready || s.img.complete) || performance.now() - t0 > 6000) res();
      else setTimeout(check, 40);
    };
    check();
  });
}

export function animMeta(dex: number, anim: string): AnimMeta | null {
  const m = SPRITE_META[dex];
  if (!m) return null;
  return m.a[anim] ?? m.a.Idle ?? m.a.Walk ?? null;
}

export function hasAnim(dex: number, anim: string) {
  return !!SPRITE_META[dex]?.a[anim];
}

export function shadowSize(dex: number) {
  return SPRITE_META[dex]?.s ?? 1;
}

export function hovers(dex: number) {
  return !!SPRITE_META[dex]?.hv;
}

/** 屏幕角度 → 方向行（0 下、1 右下、2 右 … 6 左、7 左下） */
export function dirRow(ang: number) {
  return ((Math.round((Math.PI / 2 - ang) / (Math.PI / 4)) % 8) + 8) % 8;
}

/** 一只宝可梦的动画播放器：循环动画（Idle/Walk）+ 一次性动画（Attack/Hurt…）。 */
export class Animator {
  dex: number;
  base: AnimName = 'Idle';
  cur: AnimName = 'Idle';
  frame = 0;
  t = 0;
  once = false;
  hold = false;
  done = false;
  dir = 0;
  speed = 1;

  constructor(dex: number) { this.dex = dex; }

  setDex(dex: number) {
    if (dex === this.dex) return;
    this.dex = dex;
    this.start(this.base, false);
  }

  loop(anim: AnimName, speed = 1) {
    this.base = anim;
    if (!this.once && this.cur !== anim) this.start(anim, false);
    if (!this.once) this.speed = speed;
  }

  play(anim: AnimName, hold = false, speed = 1) {
    if (!hasAnim(this.dex, anim)) return;
    this.start(anim, true);
    this.hold = hold;
    this.speed = speed;
  }

  busy() { return this.once && !this.done; }

  private start(anim: AnimName, once: boolean) {
    this.cur = hasAnim(this.dex, anim) ? anim : 'Idle';
    this.frame = 0;
    this.t = 0;
    this.once = once;
    this.done = false;
  }

  update(dt: number) {
    const m = animMeta(this.dex, this.cur);
    if (!m || this.done) return;
    this.t += dt * 60 * this.speed;
    let guard = 0;
    while (this.t >= m.d[this.frame] && guard++ < 50) {
      this.t -= m.d[this.frame];
      this.frame++;
      if (this.frame >= m.n) {
        if (this.once) {
          if (this.hold) { this.frame = m.n - 1; this.done = true; return; }
          this.start(this.base, false);
          this.speed = 1;
          return;
        }
        this.frame = 0;
      }
    }
  }

  /** 以脚底 (x, y) 为锚点绘制，scale 为整数倍。 */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, flash = 0, alpha = 1) {
    const m = animMeta(this.dex, this.cur);
    let s = sheet(this.dex, this.cur);
    let meta = m;
    if (!s.ready) {
      const idle = sheet(this.dex, 'Idle');
      if (idle.ready) { s = idle; meta = animMeta(this.dex, 'Idle'); }
    }
    if (!meta || !s.ready) {
      ctx.fillStyle = '#6b7a94';
      ctx.fillRect(Math.round(x - 5), Math.round(y - 12), 10, 10);
      return;
    }
    const frame = s === sheet(this.dex, this.cur) ? Math.min(this.frame, meta.n - 1) : 0;
    const row = Math.min(this.dir, meta.r - 1);
    const sx = frame * meta.w, sy = row * meta.h;
    const dx = Math.round(x - meta.ax * scale), dy = Math.round(y - meta.ay * scale);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(s.img, sx, sy, meta.w, meta.h, dx, dy, meta.w * scale, meta.h * scale);
    if (flash > 0) {
      ctx.globalAlpha = prev * alpha * Math.min(1, flash);
      ctx.drawImage(whiteOf(s), sx, sy, meta.w, meta.h, dx, dy, meta.w * scale, meta.h * scale);
    }
    ctx.globalAlpha = prev;
  }

  /** 用于 UI 的静态画像（Idle 第 0 帧，朝下） */
  static portrait(dex: number, scale = 2): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const m = animMeta(dex, 'Idle');
    const w = m?.w ?? 32, h = m?.h ?? 32;
    c.width = w * scale;
    c.height = h * scale;
    c.style.setProperty('--pw', `${(w * scale) / 16}rem`);
    c.style.setProperty('--ph', `${(h * scale) / 16}rem`);
    const draw = () => {
      const s = sheet(dex, 'Idle');
      if (!s.ready || !m) return false;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(s.img, 0, 0, w, h, 0, 0, w * scale, h * scale);
      return true;
    };
    if (!draw()) sheet(dex, 'Idle').img.addEventListener('load', () => draw(), { once: true });
    c.className = 'portrait';
    return c;
  }
}
