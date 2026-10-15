import { SPRITE_META, type AnimMeta } from './spriteMeta';

export type AnimName = 'Idle' | 'Walk' | 'Attack' | 'Shoot' | 'Hurt' | 'Faint';

interface Sheet { img: HTMLImageElement; ready: boolean; white?: HTMLCanvasElement }
const sheets = new Map<string, Sheet>();

/** 这只宝可梦有没有闪光（异色）精灵图 */
export function hasShiny(dex: number) {
  return !!SPRITE_META[dex]?.sh;
}

/** 这个动画用不用闪光精灵表（闪光精灵表缺这个动画时用普通的） */
function useShiny(dex: number, anim: string, shiny: boolean) {
  const m = SPRITE_META[dex];
  return shiny && !!m?.sh && !m.sm?.includes(anim);
}

function sheet(dex: number, anim: string, shiny = false): Sheet {
  const k = `${dex}/${useShiny(dex, anim, shiny) ? 's/' : ''}${anim}`;
  let s = sheets.get(k);
  if (!s) {
    const img = new Image();
    s = { img, ready: false };
    const ref = s;
    img.onload = () => { ref.ready = true; };
    img.src = `${import.meta.env.BASE_URL}sprites/${k}.png`;
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

export function preload(dexes: number[], shiny = false): Promise<void> {
  const list: Sheet[] = [];
  for (const d of dexes) {
    const m = SPRITE_META[d];
    if (!m) continue;
    for (const a of Object.keys(m.a)) list.push(sheet(d, a, shiny));
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

/** 帧尺寸与时长：闪光精灵表只有少数动画和普通的不一样 */
export function animMeta(dex: number, anim: string, shiny = false): AnimMeta | null {
  const m = SPRITE_META[dex];
  if (!m) return null;
  const name = m.a[anim] ? anim : m.a.Idle ? 'Idle' : 'Walk';
  return (useShiny(dex, name, shiny) ? m.sa?.[name] : undefined) ?? m.a[name] ?? null;
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

/** 闪光宝可梦头像右上角的四角星（7×7） */
const SPARKLE = ['...k...', '..kwk..', '.kwywk.', 'kwyyywk', '.kwywk.', '..kwk..', '...k...'];
const SPARKLE_PAL: Record<string, string> = { k: '#5a3a10', w: '#fff6b0', y: '#ffd23f' };

function drawSparkle(x: CanvasRenderingContext2D, ox: number, oy: number, scale: number) {
  SPARKLE.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = SPARKLE_PAL[row[i]];
      if (!c) continue;
      x.fillStyle = c;
      x.fillRect(ox + i * scale, oy + j * scale, scale, scale);
    }
  });
}

/** 一只宝可梦的动画播放器：循环动画（Idle/Walk）+ 一次性动画（Attack/Hurt…）。shiny 为闪光宝可梦 */
export class Animator {
  dex: number;
  shiny: boolean;
  base: AnimName = 'Idle';
  cur: AnimName = 'Idle';
  frame = 0;
  t = 0;
  once = false;
  hold = false;
  done = false;
  dir = 0;
  speed = 1;

  constructor(dex: number, shiny = false) {
    this.dex = dex;
    this.shiny = shiny;
  }

  setDex(dex: number, shiny = this.shiny) {
    if (dex === this.dex && shiny === this.shiny) return;
    this.dex = dex;
    this.shiny = shiny;
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
    const m = animMeta(this.dex, this.cur, this.shiny);
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

  /** 要画的精灵表：还没加载完时先用 Idle，闪光的还没加载完时先用普通的 */
  private pick(): { s: Sheet; meta: AnimMeta; frame: number } | null {
    const tries: [AnimName, boolean][] = this.shiny
      ? [[this.cur, true], ['Idle', true], [this.cur, false], ['Idle', false]]
      : [[this.cur, false], ['Idle', false]];
    for (const [anim, sh] of tries) {
      const s = sheet(this.dex, anim, sh);
      const meta = s.ready ? animMeta(this.dex, anim, sh) : null;
      if (!meta) continue;
      return { s, meta, frame: anim === this.cur ? Math.min(this.frame, meta.n - 1) : 0 };
    }
    return null;
  }

  /** 以脚底 (x, y) 为锚点绘制，scale 为整数倍。 */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, flash = 0, alpha = 1) {
    const p = this.pick();
    if (!p) {
      ctx.fillStyle = '#6b7a94';
      ctx.fillRect(Math.round(x - 5), Math.round(y - 12), 10, 10);
      return;
    }
    const { s, meta, frame } = p;
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

  /** 用于 UI 的静态画像（Idle 第 0 帧，朝下）；闪光宝可梦右上角画一颗星 */
  static portrait(dex: number, scale = 2, shiny = false): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const sh = shiny && hasShiny(dex);
    const m = animMeta(dex, 'Idle', sh);
    const w = m?.w ?? 32, h = m?.h ?? 32;
    c.width = w * scale;
    c.height = h * scale;
    c.style.setProperty('--pw', `${(w * scale) / 16}rem`);
    c.style.setProperty('--ph', `${(h * scale) / 16}rem`);
    const s = sheet(dex, 'Idle', sh);
    const draw = () => {
      if (!s.ready || !m) return false;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(s.img, 0, 0, w, h, 0, 0, w * scale, h * scale);
      if (shiny) drawSparkle(x, (w - SPARKLE.length - 1) * scale, scale, scale);
      return true;
    };
    if (!draw()) s.img.addEventListener('load', () => draw(), { once: true });
    c.className = shiny ? 'portrait shiny' : 'portrait';
    return c;
  }
}
