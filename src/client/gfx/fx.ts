/**
 * 技能与战斗特效（纯视觉，不影响玩法）。全部落在像素网格上：
 * 粒子是方块，冲击波是像素点组成的环，挥砍是分层的像素弧，光束是一段段像素块，
 * 再叠加 vfx.ts 里按属性上色的小图。透明度按 1 / 0.66 / 0.33 分级，避免显得像矢量图。
 */
import { PAL, drawShape, isDir, spins, vis, type MeleeExtra, type Pal, type Trail } from './vfx';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const step = (k: number) => (k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33);
const P = (pal: Pal) => PAL[pal] ?? PAL.normal;

/** 像素圆：按半径与颜色缓存成小画布 */
const circleCache = new Map<string, HTMLCanvasElement>();
function circleSprite(r: number, color: string): HTMLCanvasElement {
  r = Math.max(1, Math.round(r));
  const key = `${r}|${color}`;
  let c = circleCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2 + 1;
  const x = c.getContext('2d')!;
  x.fillStyle = color;
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (Math.hypot(xx, yy) <= r + 0.3) x.fillRect(xx + r, yy + r, 1, 1);
  if (circleCache.size > 600) circleCache.clear();
  circleCache.set(key, c);
  return c;
}

export function pxCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.drawImage(circleSprite(r, color), Math.round(x) - Math.round(r), Math.round(y) - Math.round(r));
}

/** 像素点组成的环（squash 让地面上的环略扁，看起来贴着地面） */
export function pxRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, size = 1, squash = 1, gap = 2) {
  const n = Math.max(10, Math.ceil((r * TAU) / gap));
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * squash), size, size);
  }
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ---------------------------------------------------------------- 弹体

/** 绘制弹体：地面影子、敌方弹体的红色警示圈、按属性上色的像素小图。 */
export function drawProj(ctx: CanvasRenderingContext2D, fx: string, x: number, y: number, ang: number, r: number, t: number, enemy: boolean) {
  const v = vis(fx);
  const shape = v.proj ?? 'ball';
  const scale = r >= 11 ? 2 : r >= 8 ? 1.5 : 1;
  const gy = y + 6;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(Math.round(x - r), Math.round(gy - 1), Math.max(2, Math.round(r * 2)), 2);
  if (enemy) {
    ctx.globalAlpha = 0.55;
    pxRing(ctx, x, gy, r + 3, '#ff3c50', 1, 0.45, 2);
    ctx.globalAlpha = 1;
  }
  let angle = 0;
  if (isDir(shape)) angle = ang;
  else if (spins(shape)) angle = t * 9;
  drawShape(ctx, shape, v.pal, x, y, { angle, scale, frame: Math.floor(t * 12) });
}

// ---------------------------------------------------------------- 区域

export function drawZone(ctx: CanvasRenderingContext2D, fx: string, x: number, y: number, r: number, life: number, t: number) {
  const v = vis(fx);
  const C = P(v.pal);
  ctx.globalAlpha = step(Math.min(1, life * 3));
  if (fx === 'firespin') {
    pxRing(ctx, x, y, r, C[2], 1, 0.6, 3);
    for (let i = 0; i < 8; i++) {
      const a = t * 4 + (i / 8) * TAU;
      drawShape(ctx, 'flame', 'fire', x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.5 - 5, { frame: Math.floor(t * 10 + i) });
    }
  } else {
    pxRing(ctx, x, y, r, C[2], 1, 0.7, 3);
    for (let i = 0; i < 7; i++) {
      const a = t * 1.2 + i * 0.9;
      const rr = r * (0.3 + 0.55 * ((i * 37) % 10) / 10);
      const yy = y + Math.sin(a) * rr * 0.6 - ((t * 14 + i * 5) % 12);
      drawShape(ctx, v.zone ?? (fx === 'e_cloud' ? 'cloud' : 'bubble'), v.pal, x + Math.cos(a) * rr, yy, { frame: i, alpha: 0.85 });
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- 掉落物

export function drawPickup(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, value: number, t: number) {
  const bob = Math.round(Math.sin(t * 4 + x) * 1);
  x = Math.round(x); y = Math.round(y) + bob;
  if (kind === 0) {
    const col = value >= 5 ? '#f8a8f8' : value >= 2 ? '#f8d058' : '#a8e0f8';
    rect(ctx, x - 2, y - 2, 5, 4, col);
    rect(ctx, x - 1, y - 1, 2, 1, '#ffffff');
    rect(ctx, x - 4, y - 1, 2, 2, col);
    rect(ctx, x + 3, y - 1, 2, 2, col);
    rect(ctx, x - 2, y + 2, 5, 1, 'rgba(0,0,0,.25)');
  } else if (kind === 1) {
    pxCircle(ctx, x, y - 1, 3, '#3868d8');
    rect(ctx, x - 1, y - 2, 1, 1, '#a8c8f8');
    rect(ctx, x, y - 5, 1, 2, '#307830');
  } else {
    pxCircle(ctx, x, y - 2, 4, '#202020');
    pxCircle(ctx, x, y - 2, 3, '#f8f8f8');
    rect(ctx, x - 3, y - 5, 7, 3, '#e83030');
    rect(ctx, x - 3, y - 2, 7, 1, '#202020');
    rect(ctx, x - 1, y - 3, 2, 2, '#f8f8f8');
    if (Math.floor(t * 3) % 2) rect(ctx, x - 2, y - 5, 1, 1, '#ffffff');
  }
}

// ---------------------------------------------------------------- 特效层

interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; s: number; grav: number; drag: number }
interface Spr { shape: string; pal: Pal; x: number; y: number; vx: number; vy: number; t: number; life: number; scale: number; angle: number; spin: number; grav: number; fr: number; fade: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; color: string; t: number; life: number; size: number; squash: number }
interface Slash { x: number; y: number; angle: number; radius: number; arc: number; pal: Pal; t: number; life: number }
interface Beam { x: number; y: number; angle: number; len: number; width: number; pal: Pal; shape: string | null; t: number; life: number; seed: number }
interface Bolt { pts: number[]; pal: Pal; t: number; life: number; seed: number }
interface Ground { kind: 'warn' | 'mark' | 'pre' | 'charge'; fx: string; x: number; y: number; ang: number; a: number; b: number; t: number; life: number; line?: number }

export interface FloatText { x: number; y: number; text: string; color: string; t: number; dur: number; size: number; vy: number }

const CAP_PARTS = 1100, CAP_SPRITES = 320;

interface TextBitmap { c: HTMLCanvasElement; ax: number; ay: number }
const textCache = new Map<string, TextBitmap>();

/** 带 1 像素深色描边的飘字位图（按当前缩放倍数渲染，保持清晰） */
function textBitmap(text: string, color: string, size: number, S: number): TextBitmap {
  const key = `${S}|${size}|${color}|${text}`;
  const hit = textCache.get(key);
  if (hit) {
    textCache.delete(key);
    textCache.set(key, hit);
    return hit;
  }
  const font = `${size * S}px FusionPixel, monospace`;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + 4 * S;
  const hgt = Math.ceil(size * S * 1.5) + 2 * S;
  c.width = w;
  c.height = hgt;
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  const cx = w / 2, by = Math.round(size * S * 1.15) + S;
  x.fillStyle = '#101018';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) x.fillText(text, cx + dx * S, by + dy * S);
  x.fillStyle = color;
  x.fillText(text, cx, by);
  const bm = { c, ax: cx, ay: by };
  // 字体还没加载完时不缓存，免得一直用后备字体
  if (document.fonts?.check?.(font) === false) return bm;
  textCache.set(key, bm);
  if (textCache.size > 600) textCache.delete(textCache.keys().next().value!);
  return bm;
}

export class FxLayer {
  parts: Part[] = [];
  sprites: Spr[] = [];
  rings: Ring[] = [];
  slashes: Slash[] = [];
  beams: Beam[] = [];
  bolts: Bolt[] = [];
  ground: Ground[] = [];
  texts: FloatText[] = [];
  shake = 0;
  private now = 0;

  // ---------- 基础图元 ----------

  px(x: number, y: number, color: string, o: { vx?: number; vy?: number; life?: number; size?: number; grav?: number; drag?: number } = {}) {
    if (this.parts.length >= CAP_PARTS) return;
    this.parts.push({ x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, t: 0, life: o.life ?? 0.4, color, s: o.size ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0.9 });
  }

  burst(x: number, y: number, color: string | string[], n = 8, power = 70) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(power * 0.35, power);
      const c = Array.isArray(color) ? color[i % color.length] : color;
      this.px(x, y, c, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.22, 0.5), size: Math.random() < 0.35 ? 2 : 1 });
    }
  }

  spark(x: number, y: number, color: string, dx: number, dy: number, n = 4) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-0.9, 0.9), s = rnd(40, 110);
      this.px(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.14, 0.3) });
    }
  }

  sp(shape: string, pal: Pal, x: number, y: number, o: { vx?: number; vy?: number; life?: number; scale?: number; angle?: number; spin?: number; grav?: number; fr?: number; fade?: boolean } = {}) {
    if (this.sprites.length >= CAP_SPRITES) return;
    this.sprites.push({ shape, pal, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, t: 0, life: o.life ?? 0.4, scale: o.scale ?? 1, angle: o.angle ?? 0, spin: o.spin ?? 0, grav: o.grav ?? 0, fr: o.fr ?? 10, fade: o.fade ?? true });
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.3, size = 1, squash = 0.85) {
    if (this.rings.length > 80) this.rings.shift();
    this.rings.push({ x, y, r0, r1, color, t: 0, life, size, squash });
  }

  text(x: number, y: number, text: string, color: string, size = 12, dur = 0.8) {
    if (this.texts.length > 120) this.texts.shift();
    this.texts.push({ x: x + rnd(-3, 3), y, text, color, t: 0, dur, size, vy: -28 });
  }

  // ---------- 技能 ----------

  /** 近身扇形：分层像素弧 + 附加图形 */
  slash(x: number, y: number, angle: number, radius: number, arc: number, pal: Pal, extra?: MeleeExtra) {
    this.slashes.push({ x, y, angle, radius, arc, pal, t: 0, life: 0.22 });
    const C = P(pal);
    const mx = x + Math.cos(angle) * radius * 0.7, my = y + Math.sin(angle) * radius * 0.7;
    const big = radius > 44 ? 1.5 : 1;
    switch (extra) {
      case 'impact': this.sp('impact', pal, mx, my, { life: 0.2, scale: big, fr: 12, fade: false }); break;
      case 'claw': this.sp('claw', pal, mx, my, { life: 0.22, scale: big, angle: angle - Math.PI / 4 }); break;
      case 'jaws': this.sp('jaws', pal, mx, my, { life: 0.26, scale: big, fr: 9, fade: false }); break;
      case 'streak':
        for (let i = 0; i < 3; i++) this.sp('streak', pal, x + Math.cos(angle) * (6 + i * 9), y + Math.sin(angle) * (6 + i * 9), { life: 0.16 + i * 0.03, angle });
        this.sp('impact', pal, mx, my, { life: 0.16, fr: 12, fade: false });
        break;
      case 'vine': {
        // 藤鞭：一条弯曲的藤蔓伸向前方，末端甩出叶片
        const n = Math.max(4, Math.round(radius / 7));
        for (let i = 1; i <= n; i++) {
          const u = i / n;
          const wob = Math.sin(u * Math.PI) * 6;
          const px = x + Math.cos(angle) * radius * u - Math.sin(angle) * wob;
          const py = y + Math.sin(angle) * radius * u + Math.cos(angle) * wob;
          this.sp('vine', pal, px, py, { life: 0.18 + u * 0.08, angle: angle - Math.PI / 4 });
        }
        for (let i = 0; i < 3; i++) {
          const a = angle + rnd(-0.6, 0.6);
          this.sp('leaf', pal, mx + Math.cos(angle) * radius * 0.3, my + Math.sin(angle) * radius * 0.3, { vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 - 10, life: 0.45, spin: rnd(-9, 9), grav: 80 });
        }
        break;
      }
      case 'drops':
        for (let i = 0; i < 10; i++) {
          const a = angle - arc / 2 + (arc * i) / 9;
          this.sp('drop', pal, x + Math.cos(a) * radius * 0.8, y + Math.sin(a) * radius * 0.8, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.32, angle: a, grav: 140 });
        }
        break;
      case 'bolts':
        this.sp('impact', pal, mx, my, { life: 0.22, scale: big, fr: 12, fade: false });
        for (let i = 0; i < 5; i++) {
          const a = angle + rnd(-arc / 2, arc / 2);
          this.sp('bolt', pal, mx, my, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.22, angle: a, fr: 16 });
        }
        break;
      case 'shards':
        this.sp('impact', pal, mx, my, { life: 0.18, scale: big, fr: 12, fade: false });
        for (let i = 0; i < 5; i++) {
          const a = angle + rnd(-arc / 2, arc / 2);
          this.sp('shard', pal, mx, my, { vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.3, angle: a });
        }
        break;
      case 'flames': {
        // 喷吐：火焰沿着扇形向外喷出
        for (let i = 0; i < 9; i++) {
          const a = angle + rnd(-arc / 2, arc / 2), s = rnd(radius * 2.5, radius * 4);
          this.sp('fire', pal, x + Math.cos(a) * 6, y + Math.sin(a) * 6, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25, angle: a, fr: 14 });
        }
        break;
      }
    }
    this.spark(mx, my, C[3], Math.cos(angle), Math.sin(angle), 4);
  }

  beam(x: number, y: number, angle: number, len: number, width: number, pal: Pal, shape: string | null) {
    this.beams.push({ x, y, angle, len, width, pal, shape, t: 0, life: 0.26, seed: Math.random() * 100 });
    this.sp('impact', pal, x + Math.cos(angle) * 8, y + Math.sin(angle) * 8, { life: 0.14, fr: 12, fade: false });
    this.sp('impact', pal, x + Math.cos(angle) * len, y + Math.sin(angle) * len, { life: 0.2, scale: width > 18 ? 2 : 1.5, fr: 12, fade: false });
    const C = P(pal);
    for (let d = 10; d < len; d += 18) this.px(x + Math.cos(angle) * d, y + Math.sin(angle) * d, C[3], { vx: rnd(-25, 25), vy: rnd(-40, -10), life: 0.35 });
  }

  lightning(pts: number[], pal: Pal) {
    this.bolts.push({ pts, pal, t: 0, life: 0.24, seed: Math.random() * 100 });
    const C = P(pal);
    for (let i = 2; i + 1 < pts.length; i += 2) {
      this.sp('impact', pal, pts[i], pts[i + 1], { life: 0.18, fr: 14, fade: false });
      this.burst(pts[i], pts[i + 1], [C[3], C[4]], 4, 60);
    }
  }

  /** 从天而降的柱子（打雷、预知未来） */
  column(x: number, y: number, pal: Pal, r: number) {
    const top = y - 140;
    const pts: number[] = [x + rnd(-6, 6), top];
    for (let yy = top + 16; yy < y; yy += 16) pts.push(x + rnd(-7, 7), yy);
    pts.push(x, y);
    this.bolts.push({ pts, pal, t: 0, life: 0.3, seed: Math.random() * 100 });
    this.ring(x, y, 4, r, P(pal)[3], 0.32, 2);
  }

  /** 范围冲击波：像素点环 + 向外飞的小图 */
  nova(x: number, y: number, r: number, pal: Pal, shape?: string) {
    const C = P(pal);
    this.ring(x, y, r * 0.3, r, C[3], 0.3, 2);
    this.ring(x, y, r * 0.15, r * 0.75, C[2], 0.26, 1);
    if (!shape) return;
    const n = Math.min(16, Math.max(8, Math.round(r / 6)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.1, 0.1);
      const sx = x + Math.cos(a) * 8, sy = y + Math.sin(a) * 6;
      const sp = r * 2.6;
      switch (shape) {
        case 'vine':
        case 'rock':
          // 从地面冒出来再落下
          this.sp(shape === 'vine' ? 'leaf' : 'rock', pal, x + Math.cos(a) * r * rnd(0.4, 0.95), y + Math.sin(a) * r * 0.75 * rnd(0.4, 0.95), { vy: -rnd(60, 110), grav: 320, life: 0.45, spin: rnd(-6, 6) });
          break;
        case 'flame':
          this.sp('fire', pal, sx, sy, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, life: 0.3, angle: a, fr: 14 });
          break;
        default:
          this.sp(shape, pal, sx, sy, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, life: 0.3, angle: a, fr: 12 });
      }
    }
    this.burst(x, y - 4, [C[3], C[4]], 10, r * 2);
  }

  /** 根据服务器发来的 fx 事件绘制技能特效。pattern 来自技能定义。 */
  skill(pattern: string | undefined, fx: string, x: number, y: number, ang: number, a: number, b: number) {
    const v = vis(fx);
    switch (pattern) {
      case 'melee': this.slash(x, y, ang, a, (b * Math.PI) / 180, v.pal, v.melee); break;
      case 'beam':
        if (v.beam === 'lightning') this.lightning([x, y, x + Math.cos(ang) * a, y + Math.sin(ang) * a], v.pal);
        else this.beam(x, y, ang, a, b, v.pal, v.beam ?? null);
        if (b >= 20) this.shake = Math.max(this.shake, 2);
        break;
      case 'nova':
        this.nova(x, y, a, v.pal, v.nova);
        if (fx === 'earthquake') this.shake = Math.max(this.shake, 5);
        break;
      case 'heal': {
        const C = P('heal');
        for (let i = 0; i < 6; i++) this.sp(i % 2 ? 'heart' : 'plus', i % 2 ? 'fairy' : 'heal', x + rnd(-10, 10), y - rnd(4, 14), { vy: -rnd(25, 45), life: rnd(0.6, 0.9) });
        if (a > 30) this.ring(x, y, 6, a, C[3], 0.5, 2);
        else this.ring(x, y, 14, 4, C[3], 0.35, 1);
        break;
      }
      case 'shield':
        this.ring(x, y - 8, 18, 12, P('water')[3], 0.3, 2, 1);
        for (let i = 0; i < 6; i++) { const q = (i / 6) * TAU; this.sp('spark', 'water', x + Math.cos(q) * 12, y - 8 + Math.sin(q) * 12, { life: 0.35 }); }
        break;
      case 'buff':
        for (let i = 0; i < 5; i++) this.sp('arrow', 'gold', x + rnd(-10, 10), y - rnd(0, 10), { vy: -rnd(35, 60), life: rnd(0.45, 0.7) });
        this.ring(x, y, 16, 6, P('gold')[3], 0.3, 1);
        break;
    }
  }

  /** 定点打击的预告（落下的东西、地面圈） */
  pre(fx: string, x: number, y: number, r: number, dur: number) {
    this.ground.push({ kind: 'pre', fx, x, y, ang: 0, a: r, b: 0, t: 0, life: Math.max(0.1, dur) });
  }

  charge(fx: string, x: number, y: number, ang: number, len: number, width: number, dur: number) {
    this.ground.push({ kind: 'charge', fx, x, y, ang, a: len, b: width, t: 0, life: Math.max(0.1, dur) });
  }

  warn(shape: number, x: number, y: number, r: number, dur: number, ang: number, len: number) {
    this.ground.push({ kind: 'warn', fx: 'warn', x, y, ang, a: r, b: shape, t: 0, life: dur, line: len });
  }

  mark(x: number, y: number) {
    this.ground.push({ kind: 'mark', fx: 'mark', x, y, ang: 0, a: 0, b: 0, t: 0, life: 1 });
  }

  /** 爆炸 / 定点打击落地 */
  boom(fx: string, x: number, y: number, r: number) {
    const v = vis(fx);
    const C = P(v.pal);
    this.ring(x, y, r * 0.2, r, C[3], 0.32, 2);
    switch (v.boom) {
      case 'fire': {
        // 大字爆炎：火焰摆成"大"字
        const arms = [-Math.PI / 2, Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25];
        for (const a of arms) for (let k = 1; k <= 3; k++) {
          this.sp('flame', 'fire', x + Math.cos(a) * r * 0.3 * k, y + Math.sin(a) * r * 0.25 * k - 4, { life: 0.45 + k * 0.05, fr: 12, scale: 1.2, vy: -10 });
        }
        this.sp('impact', 'fire', x, y - 4, { life: 0.25, scale: 2, fr: 12, fade: false });
        this.burst(x, y - 4, [C[2], C[3], C[4]], 18, r * 3);
        break;
      }
      case 'column': this.column(x, y, v.pal, r); this.burst(x, y - 4, [C[3], C[4]], 10, r * 2.5); break;
      case 'rings':
        this.ring(x, y, r, r * 0.2, C[2], 0.35, 2);
        for (let i = 0; i < 3; i++) this.sp('ring', v.pal, x + rnd(-r / 2, r / 2), y - rnd(0, r / 2), { life: 0.35, scale: 1.5, fr: 8 });
        this.burst(x, y - 4, [C[3], C[4]], 10, r * 2);
        break;
      case 'splash':
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; this.sp('blob', v.pal, x, y - 4, { vx: Math.cos(a) * r * 2, vy: Math.sin(a) * r * 1.5 - 40, grav: 260, life: 0.4 }); }
        this.burst(x, y - 4, [C[2], C[3]], 10, r * 2);
        break;
      case 'rocks':
        for (let i = 0; i < 6; i++) { const a = rnd(0, TAU); this.sp('rock', v.pal, x, y - 4, { vx: Math.cos(a) * r * 2, vy: -rnd(60, 120), grav: 380, life: 0.45, spin: rnd(-8, 8), scale: rnd(0.6, 1) }); }
        this.burst(x, y, [C[1], C[2], C[3]], 12, r * 2);
        break;
      case 'leaves':
        this.sp('impact', v.pal, x, y - 4, { life: 0.22, scale: 1.5, fr: 12, fade: false });
        for (let i = 0; i < 6; i++) { const a = rnd(0, TAU); this.sp('leaf', v.pal, x, y - 4, { vx: Math.cos(a) * r * 2.2, vy: Math.sin(a) * r * 2 - 30, grav: 120, life: 0.5, spin: rnd(-10, 10) }); }
        break;
      case 'cloud':
        for (let i = 0; i < 5; i++) { const a = rnd(0, TAU); this.sp('cloud', v.pal, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.3 - 4, { vx: Math.cos(a) * 20, vy: -15, life: 0.7, fr: 4 }); }
        break;
      case 'big':
        this.sp('impact', v.pal, x, y - 4, { life: 0.3, scale: 2.5, fr: 10, fade: false });
        for (let i = 0; i < 6; i++) { const a = rnd(0, TAU); this.sp('rock', v.pal, x, y - 4, { vx: Math.cos(a) * r * 2.5, vy: -rnd(70, 130), grav: 380, life: 0.5, spin: rnd(-8, 8) }); }
        this.burst(x, y - 4, [C[2], C[3], C[4], '#f8a040'], 20, r * 3);
        this.shake = Math.max(this.shake, 4);
        break;
      default:
        this.sp('impact', v.pal, x, y - 4, { life: 0.24, scale: r > 36 ? 2.5 : 1.5, fr: 12, fade: false });
        this.burst(x, y - 4, [C[2], C[3], C[4]], 14, r * 2.5);
    }
  }

  /** 命中：属性色的小冲击 + 碎屑 */
  hit(x: number, y: number, pal: Pal, crit: boolean) {
    const C = P(pal);
    if (crit || Math.random() < 0.45) this.sp('impact', pal, x + rnd(-3, 3), y + rnd(-3, 3), { life: crit ? 0.2 : 0.12, scale: crit ? 1.5 : 1, fr: 14, fade: false });
    this.burst(x, y, [C[3], C[4]], crit ? 7 : 3, crit ? 90 : 60);
  }

  death(x: number, y: number) {
    const n = this.sprites.length > 200 ? 1 : 2;
    for (let i = 0; i < n; i++) this.sp('cloud', 'normal', x + rnd(-5, 5), y - rnd(2, 8), { vy: -rnd(10, 25), life: 0.32, fr: 3, scale: 0.8 });
    this.burst(x, y - 6, ['#ffffff', '#ece6dc'], 5, 60);
  }

  levelUp(x: number, y: number) {
    for (let i = 0; i < 6; i++) this.sp('arrow', 'gold', x + rnd(-12, 12), y - rnd(0, 12), { vy: -rnd(40, 70), life: rnd(0.5, 0.8) });
    this.ring(x, y, 4, 22, P('gold')[3], 0.4, 2);
  }

  evolve(x: number, y: number) {
    this.ring(x, y - 8, 4, 48, '#ffffff', 0.6, 2, 1);
    this.ring(x, y - 8, 2, 30, P('gold')[3], 0.5, 1, 1);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; this.sp('spark', 'gold', x, y - 10, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.6, fr: 8 }); }
  }

  /** 弹体拖尾 */
  trail(kind: Trail, pal: Pal, x: number, y: number, vx: number, vy: number) {
    const C = P(pal);
    const back = Math.atan2(-vy, -vx);
    const j = () => rnd(-2.5, 2.5);
    switch (kind) {
      case 'ember': this.px(x + j(), y + j(), C[Math.random() < 0.5 ? 3 : 2], { vx: Math.cos(back) * 25, vy: -35, life: 0.35 }); break;
      case 'drip': this.px(x + j(), y + j(), C[3], { vx: Math.cos(back) * 15, vy: 10, grav: 240, life: 0.32 }); break;
      case 'spark': this.px(x + j() * 2, y + j() * 2, Math.random() < 0.5 ? C[4] : C[3], { vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.16 }); break;
      case 'bubbles': this.px(x + j(), y + j(), C[3], { vy: -30, life: 0.45, size: Math.random() < 0.3 ? 2 : 1 }); break;
      case 'dirt': this.px(x + j(), y + j(), C[Math.random() < 0.5 ? 2 : 1], { vx: Math.cos(back) * 20, vy: -15, grav: 260, life: 0.32 }); break;
      case 'wisp': this.px(x + j() * 2, y + j() * 2, C[Math.random() < 0.5 ? 1 : 2], { vy: -25, life: 0.5, size: 2 }); break;
      case 'leafy': this.px(x + j(), y + j(), C[Math.random() < 0.5 ? 3 : 2], { vx: Math.cos(back) * 20, vy: Math.sin(back) * 20, life: 0.3 }); break;
      case 'glitter': this.px(x + j(), y + j(), Math.random() < 0.5 ? C[4] : C[3], { life: 0.3 }); break;
    }
  }

  // ---------- 更新 ----------

  update(dt: number) {
    this.now += dt;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy *= k;
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.t += dt;
      if (s.t >= s.life) { this.sprites.splice(i, 1); continue; }
      s.vy += s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.92, dt * 60);
      if (!s.grav) s.vy *= Math.pow(0.92, dt * 60);
      if (s.spin) s.angle += s.spin * dt;
    }
    for (const arr of [this.rings, this.slashes, this.beams, this.bolts, this.ground] as { t: number; life: number }[][]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt;
        if (arr[i].t >= arr[i].life) arr.splice(i, 1);
      }
    }
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= 0.92; }
    this.texts = this.texts.filter((t) => t.t < t.dur);
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  // ---------- 绘制：地面层 ----------

  drawGround(ctx: CanvasRenderingContext2D) {
    for (const g of this.ground) {
      const k = g.t / g.life;
      if (g.kind === 'warn') this.drawWarn(ctx, g, k);
      else if (g.kind === 'mark') this.drawMark(ctx, g, k);
      else if (g.kind === 'pre') this.drawPreGround(ctx, g, k);
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * k;
      ctx.globalAlpha = step(1 - k);
      pxRing(ctx, r.x, r.y, rad, r.color, r.size, r.squash, r.size > 1 ? 3 : 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawWarn(ctx: CanvasRenderingContext2D, g: Ground, k: number) {
    const blink = Math.floor(g.t * 12) % 2 ? 1 : 0.66;
    if (g.b === 1) {
      const len = g.line ?? 100;
      ctx.save();
      ctx.translate(Math.round(g.x), Math.round(g.y));
      ctx.rotate(Math.round(g.ang / (Math.PI / 16)) * (Math.PI / 16));
      ctx.globalAlpha = 0.33;
      ctx.fillStyle = '#f83848';
      ctx.fillRect(0, -g.a / 2, len, g.a);
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#ff9098';
      for (let d = 0; d < len; d += 4) { ctx.fillRect(d, -g.a / 2, 2, 1); ctx.fillRect(d, g.a / 2 - 1, 2, 1); }
      ctx.fillStyle = '#f83848';
      ctx.fillRect(0, -g.a / 2, Math.round(len * k), g.a);
      ctx.restore();
    } else {
      ctx.globalAlpha = blink;
      pxRing(ctx, g.x, g.y, g.a, '#ff5060', 1, 0.8, 3);
      ctx.globalAlpha = 0.33;
      pxRing(ctx, g.x, g.y, Math.max(1, g.a * k), '#f83848', 2, 0.8, 3);
      ctx.globalAlpha = 0.25;
      pxCircle(ctx, g.x, g.y, Math.max(1, g.a * 0.8 * k), '#f83848');
    }
    ctx.globalAlpha = 1;
  }

  private drawMark(ctx: CanvasRenderingContext2D, g: Ground, k: number) {
    const shakeX = Math.round(Math.sin(g.t * 40));
    for (let i = -1; i <= 1; i++) {
      rect(ctx, g.x + i * 4 + shakeX - 1, g.y - 4, 2, 5, '#2f7a2f');
      rect(ctx, g.x + i * 4 + shakeX, g.y - 6, 1, 3, '#58b048');
    }
    if (k > 0.35) {
      rect(ctx, g.x - 1, g.y - 16, 2, 6, '#101018');
      rect(ctx, g.x - 1, g.y - 8, 2, 2, '#101018');
      rect(ctx, g.x - 2, g.y - 17, 2, 6, '#f83838');
      rect(ctx, g.x - 2, g.y - 9, 2, 2, '#f83838');
    }
  }

  private drawPreGround(ctx: CanvasRenderingContext2D, g: Ground, k: number) {
    const v = vis(g.fx);
    const C = P(v.pal);
    ctx.globalAlpha = 0.66;
    pxRing(ctx, g.x, g.y, g.a, C[3], 1, 0.8, 3);
    ctx.globalAlpha = 0.33;
    pxRing(ctx, g.x, g.y, g.a * (1 - k), C[2], 1, 0.8, 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    const sw = Math.round(4 + 8 * k);
    ctx.fillRect(Math.round(g.x - sw), Math.round(g.y - 1), sw * 2, 3);
    ctx.globalAlpha = 1;
  }

  // ---------- 绘制：空中层 ----------

  drawAir(ctx: CanvasRenderingContext2D, showNumbers: boolean) {
    for (const g of this.ground) {
      const k = g.t / g.life;
      if (g.kind === 'pre') this.drawPreAir(ctx, g, k);
      else if (g.kind === 'charge') this.drawCharge(ctx, g, k);
    }
    for (const b of this.beams) this.drawBeam(ctx, b);
    for (const b of this.bolts) this.drawBolt(ctx, b);
    for (const s of this.slashes) this.drawSlash(ctx, s);
    for (const p of this.parts) {
      ctx.globalAlpha = step(1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (const s of this.sprites) {
      const k = 1 - s.t / s.life;
      drawShape(ctx, s.shape, s.pal, s.x, s.y, { angle: s.angle, scale: s.scale, alpha: s.fade ? step(k) : 1, frame: Math.floor(s.t * s.fr) });
    }
    // 飘字画成缓存的小图再贴上去：每个字只画一次（描边要 6 次 fillText），后期满屏伤害数字时省很多
    const m = ctx.getTransform();
    const S = m.a;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const t of this.texts) {
      if (!showNumbers && /^-?\d+!?$/.test(t.text)) continue;
      const a = t.t / t.dur;
      ctx.globalAlpha = a > 0.7 ? (1 - a) / 0.3 : 1;
      const img = textBitmap(t.text, t.color, t.size, S);
      ctx.drawImage(img.c, Math.round(m.e + Math.round(t.x) * S - img.ax), Math.round(m.f + Math.round(t.y) * S - img.ay));
    }
    ctx.setTransform(m);
    ctx.globalAlpha = 1;
  }

  private drawSlash(ctx: CanvasRenderingContext2D, s: Slash) {
    const k = 1 - s.t / s.life;
    const C = P(s.pal);
    const full = s.arc >= TAU - 0.01;
    const half = Math.min(s.arc, TAU) / 2;
    const r = s.radius * (0.72 + 0.28 * (1 - k));
    const n = Math.max(8, Math.ceil(r * half * 2));
    ctx.globalAlpha = step(k);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = s.angle - half + u * half * 2;
      const thick = Math.round((full ? 1 : Math.sin(Math.PI * u)) * 3 * k);
      for (let j = -1; j <= thick; j++) {
        const rr = r - j;
        ctx.fillStyle = j < 0 ? C[1] : j === thick ? C[4] : j > thick / 2 ? C[3] : C[2];
        ctx.fillRect(Math.round(s.x + Math.cos(a) * rr), Math.round(s.y + Math.sin(a) * rr), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBeam(ctx: CanvasRenderingContext2D, b: Beam) {
    const k = 1 - b.t / b.life;
    const C = P(b.pal);
    const a = Math.round(b.angle / (Math.PI / 16)) * (Math.PI / 16);
    ctx.save();
    ctx.translate(Math.round(b.x), Math.round(b.y));
    ctx.rotate(a);
    ctx.globalAlpha = step(k);
    const seg = 2;
    for (let d = 0; d < b.len; d += seg) {
      const wob = 0.7 + 0.3 * Math.sin(d * 0.18 + this.now * 30 + b.seed);
      const taper = Math.min(1, d / 10);
      const hw = Math.max(1, Math.round((b.width / 2) * wob * (0.6 + 0.4 * k) * taper));
      ctx.fillStyle = C[1]; ctx.fillRect(d, -hw - 1, seg, hw * 2 + 2);
      ctx.fillStyle = C[2]; ctx.fillRect(d, -hw, seg, hw * 2);
      const hc = Math.max(1, Math.round(hw * 0.55));
      ctx.fillStyle = C[3]; ctx.fillRect(d, -hc, seg, hc * 2);
      ctx.fillStyle = C[4]; ctx.fillRect(d, -1, seg, 2);
    }
    if (b.shape) {
      const gap = 22, off = (this.now * 380) % gap;
      for (let d = off; d < b.len - 6; d += gap) {
        const yo = Math.sin(d * 0.3 + b.seed) * b.width * 0.18;
        drawShape(ctx, b.shape, b.pal, d, yo, { angle: 0.0001, scale: b.width > 18 ? 1.5 : 1, frame: Math.floor(d / gap + this.now * 12) });
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawBolt(ctx: CanvasRenderingContext2D, b: Bolt) {
    const k = 1 - b.t / b.life;
    const C = P(b.pal);
    ctx.globalAlpha = step(k);
    const frame = Math.floor(this.now * 30);
    for (let i = 0; i + 3 < b.pts.length; i += 2) {
      const x0 = b.pts[i], y0 = b.pts[i + 1], x1 = b.pts[i + 2], y1 = b.pts[i + 3];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(2, Math.round(len / 6));
      let px = x0, py = y0;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        const jitter = s === n ? 0 : (hash2(i * 31 + s, frame, b.seed) - 0.5) * 9;
        const nx = x0 + (x1 - x0) * u - ((y1 - y0) / len) * jitter;
        const ny = y0 + (y1 - y0) * u + ((x1 - x0) / len) * jitter;
        pixelLine(ctx, px, py, nx, ny, C[3], 3);
        pixelLine(ctx, px, py, nx, ny, C[4], 1);
        px = nx; py = ny;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPreAir(ctx: CanvasRenderingContext2D, g: Ground, k: number) {
    const v = vis(g.fx);
    if (v.fall) {
      // 从高处落下，越接近越大
      const h = (1 - k) * 110;
      const scale = v.fall === 'seed' ? 1 : 1.5 + k * 0.5;
      drawShape(ctx, v.fall, v.pal, g.x + h * 0.25, g.y - 6 - h, { angle: v.fall === 'fire' ? Math.PI / 2 + 0.25 : g.t * 8, scale, frame: Math.floor(g.t * 12) });
      if (Math.random() < 0.6) this.trail(v.fall === 'rock' ? 'dirt' : 'ember', v.fall === 'rock' && g.fx.startsWith('meteor') ? 'fire' : v.pal, g.x + h * 0.25, g.y - 6 - h, -0.25, -1);
    } else if (v.boom === 'column') {
      const C = P(v.pal);
      ctx.globalAlpha = 0.33 + 0.33 * (Math.floor(g.t * 14) % 2);
      pxCircle(ctx, g.x, g.y - 110, 6 + k * 6, C[1]);
      pxCircle(ctx, g.x - 7, g.y - 108, 5 + k * 4, C[1]);
      pxCircle(ctx, g.x + 7, g.y - 108, 5 + k * 4, C[1]);
      ctx.globalAlpha = 1;
      if (g.fx.startsWith('futuresight')) drawShape(ctx, 'eye', v.pal, g.x, g.y - 30 - 10 * Math.sin(g.t * 4), { frame: 0, alpha: 0.85 });
    } else {
      const C = P(v.pal);
      ctx.globalAlpha = step(k);
      pxRing(ctx, g.x, g.y - 4, g.a * (1 - k) + 2, C[3], 2, 0.8, 3);
      ctx.globalAlpha = 1;
    }
  }

  private drawCharge(ctx: CanvasRenderingContext2D, g: Ground, k: number) {
    const v = vis(g.fx);
    const C = P(v.pal);
    const ox = g.x + Math.cos(g.ang) * 8, oy = g.y + Math.sin(g.ang) * 8;
    // 光点向中心聚拢
    if (Math.random() < 0.8) {
      const a = rnd(0, TAU), d = rnd(18, 30);
      this.px(ox + Math.cos(a) * d, oy + Math.sin(a) * d, C[Math.random() < 0.5 ? 3 : 4], { vx: -Math.cos(a) * d * 3.5, vy: -Math.sin(a) * d * 3.5, life: 0.25, drag: 1 });
    }
    drawShape(ctx, 'orb', v.pal, ox, oy, { scale: 0.6 + k * 1.2, frame: Math.floor(g.t * 12) });
    ctx.save();
    ctx.translate(Math.round(g.x), Math.round(g.y));
    ctx.rotate(Math.round(g.ang / (Math.PI / 16)) * (Math.PI / 16));
    ctx.globalAlpha = 0.33;
    ctx.fillStyle = C[3];
    for (let d = 14; d < g.a; d += 6) ctx.fillRect(d, 0, 3, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function hash2(a: number, b: number, c: number) {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** 像素线（方块拼成），w 为线宽 */
function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  ctx.fillStyle = color;
  const o = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    ctx.fillRect(x - o, y - o, w, w);
  }
}
