/**
 * 真新镇：可以自由行走的小镇。训练家带着跟随的宝可梦在镇上走动，
 * 走到建筑门口（或 NPC 身边）按 A / 空格 / 回车进入；镇上能看到所有在线的玩家。
 */
import { TOWN_WHERE, type TownPeer } from '../shared/protocol';
import { BUILDINGS, CELL, NPCS, SPAWN, VIEW_BOUNDS, blocked, doorPos, drawTownBg, drawTownFg, spotAt, type PlaceId, type Spot } from './gfx/town';
import { Animator, dirRow } from './gfx/sprites';
import { twinkle } from './gfx/fx';
import { drawNpc, drawTrainer, tdirOf, walkFrame, type TDir } from './gfx/trainers';
import { moveVector } from './input';
import { renderDpr } from './game/view';
import type { Settings } from './save';

const SPEED = 88;
/** 跟随的宝可梦和训练家之间隔多远 */
const FOLLOW_GAP = 22;

/** tw：闪光宝可梦下一次闪烁的倒计时 */
interface Walker { x: number; y: number; dir: TDir; moving: boolean; t: number; trail: { x: number; y: number }[]; mon: Animator; mx: number; my: number; tw: number }

interface Peer extends Walker { id: number; name: string; trainer: string; dex: number; tx: number; ty: number; w: number; seen: number }

/** 在线玩家（给界面显示）；shiny：跟随的是闪光宝可梦 */
export interface OnlinePeer { id: number; name: string; trainer: string; dex: number; shiny: boolean; where: string }

export interface TownHooks {
  enter(id: PlaceId): void;
  /** 位置变化时上报（节流由调用方处理） */
  move(x: number, y: number, dir: number, moving: boolean): void;
  /** 站到可以互动的地方 / 离开时 */
  spot(s: Spot | null): void;
}

/** 刚出现时，跟随的宝可梦站在训练家身后（面朝下时在上方） */
const BEHIND: Record<number, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

function walker(x: number, y: number, dex: number, dir: TDir = 0, shiny = false): Walker {
  const mon = new Animator(dex, shiny);
  mon.loop('Idle');
  const [bx, by] = BEHIND[dir];
  const mx = x + bx * FOLLOW_GAP, my = y + by * FOLLOW_GAP;
  return { x, y, dir, moving: false, t: 0, trail: [{ x: mx, y: my }, { x, y }], mon, mx, my, tw: 0.4 };
}

/** 跟随：沿着训练家走过的路径落后一段距离 */
function follow(w: Walker, dt: number) {
  const last = w.trail[w.trail.length - 1];
  if (!last || Math.hypot(last.x - w.x, last.y - w.y) > 2) w.trail.push({ x: w.x, y: w.y });
  if (w.trail.length > 40) w.trail.shift();
  let need = FOLLOW_GAP, tx = w.trail[0]?.x ?? w.x, ty = w.trail[0]?.y ?? w.y;
  for (let i = w.trail.length - 1; i > 0; i--) {
    const a = w.trail[i], b = w.trail[i - 1];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d >= need) { const k = need / d; tx = a.x + (b.x - a.x) * k; ty = a.y + (b.y - a.y) * k; break; }
    need -= d;
    tx = b.x; ty = b.y;
  }
  const dx = tx - w.mx, dy = ty - w.my, d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const step = Math.min(d, Math.max(SPEED, d * 6) * dt);
    w.mx += (dx / d) * step;
    w.my += (dy / d) * step;
    w.mon.dir = dirRow(Math.atan2(dy, dx));
    w.mon.loop('Walk');
  } else w.mon.loop('Idle');
  w.mon.update(dt);
}

export class TownScene {
  me: Walker;
  trainer: string;
  name: string;
  dex: number;
  /** 打开建筑界面时停下来 */
  active = true;
  private peers = new Map<number, Peer>();
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private spot: Spot | null = null;
  private sentAt = 0;
  private sentMoving = false;
  private cam = { x: 0, y: 0 };
  /** 闪光宝可梦身上的闪烁 */
  private twinkles: { x: number; y: number; t: number; life: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, private settings: () => Settings, private hooks: TownHooks, opts: { trainer: string; name: string; dex: number; shiny: boolean; pos?: { x: number; y: number } | null }) {
    this.trainer = opts.trainer;
    this.name = opts.name;
    this.dex = opts.dex;
    const p = opts.pos && !blocked(opts.pos.x, opts.pos.y) ? opts.pos : SPAWN;
    this.me = walker(p.x, p.y, opts.dex, 0, opts.shiny);
    window.addEventListener('keydown', this.onKey);
  }

  setIdentity(trainer: string, name: string, dex: number, shiny: boolean) {
    this.trainer = trainer;
    this.name = name;
    this.dex = dex;
    this.me.mon.setDex(dex, shiny);
  }

  /** 从建筑里出来：站在门口，面朝下 */
  placeAt(id: PlaceId) {
    const p = doorPos(id);
    if (!p) return;
    this.me.x = p.x;
    this.me.y = p.y;
    this.me.dir = 0;
    this.me.mx = this.me.x;
    this.me.my = this.me.y - FOLLOW_GAP;
    this.me.trail = [{ x: this.me.mx, y: this.me.my }, { x: this.me.x, y: this.me.y }];
  }

  get pos() { return { x: Math.round(this.me.x), y: Math.round(this.me.y) }; }

  setPeers(you: number, list: TownPeer[]) {
    const now = this.time;
    for (const p of list) {
      if (p.id === you) continue;
      let q = this.peers.get(p.id);
      if (!q) {
        q = { ...walker(p.x, p.y, p.dex, (p.d & 3) as TDir, !!p.s), id: p.id, name: p.name, trainer: p.trainer, dex: p.dex, tx: p.x, ty: p.y, w: p.w, seen: now };
        this.peers.set(p.id, q);
      }
      q.name = p.name; q.trainer = p.trainer; q.w = p.w; q.seen = now;
      q.dex = p.dex;
      q.mon.setDex(p.dex, !!p.s);
      q.tx = p.x; q.ty = p.y; q.dir = (p.d & 3) as TDir; q.moving = !!p.m;
      if (Math.hypot(q.tx - q.x, q.ty - q.y) > 160) {
        q.x = q.tx; q.y = q.ty;
        const [bx, by] = BEHIND[q.dir];
        q.mx = q.x + bx * FOLLOW_GAP; q.my = q.y + by * FOLLOW_GAP;
        q.trail = [{ x: q.mx, y: q.my }, { x: q.x, y: q.y }];
      }
    }
    for (const [id, q] of this.peers) if (q.seen !== now) this.peers.delete(id);
  }

  /** 在线玩家列表（给界面显示） */
  online(): OnlinePeer[] {
    return [...this.peers.values()].map((q) => ({ id: q.id, name: q.name, trainer: q.trainer, dex: q.dex, shiny: q.mon.shiny, where: TOWN_WHERE[q.w] ?? 'menu' }));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    window.removeEventListener('keydown', this.onKey);
  }

  /** 互动：走到门口按 A / 空格 / 回车 */
  interact() {
    if (this.active && this.spot) this.hooks.enter(this.spot.id);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.active || !this.running) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'NumpadEnter') { e.preventDefault(); this.interact(); }
  };

  private update(dt: number) {
    const me = this.me;
    const v = this.active ? moveVector() : { x: 0, y: 0 };
    me.moving = false;
    if (v.x || v.y) {
      const sx = v.x * SPEED * dt, sy = v.y * SPEED * dt;
      if (!blocked(me.x + sx, me.y)) me.x += sx;
      if (!blocked(me.x, me.y + sy)) me.y += sy;
      me.dir = tdirOf(Math.atan2(v.y, v.x));
      me.moving = true;
    }
    me.t += dt;
    follow(me, dt);
    this.sparkle(me, dt);
    for (const w of this.twinkles) w.t += dt;
    this.twinkles = this.twinkles.filter((w) => w.t < w.life);
    const s = spotAt(me.x, me.y);
    if (s !== this.spot) { this.spot = s; this.hooks.spot(s); }
    // 位置上报：走动时每 0.2 秒一次，停下时立刻报一次
    const now = performance.now();
    if ((me.moving && now - this.sentAt > 200) || me.moving !== this.sentMoving) {
      this.sentAt = now;
      this.sentMoving = me.moving;
      this.hooks.move(me.x, me.y, me.dir, me.moving);
    }
    for (const q of this.peers.values()) {
      const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const step = Math.min(d, Math.max(SPEED * 1.1, d * 5) * dt);
        q.x += (dx / d) * step;
        q.y += (dy / d) * step;
      }
      q.t += dt;
      follow(q, dt);
      if (q.w === 0) this.sparkle(q, dt);
    }
  }

  /** 跟随的闪光宝可梦时不时闪一下 */
  private sparkle(w: Walker, dt: number) {
    if (!w.mon.shiny || (w.tw -= dt) > 0 || this.twinkles.length > 60) return;
    w.tw = 0.7 + Math.random() * 0.7;
    this.twinkles.push({ x: w.mx + (Math.random() - 0.5) * 14, y: w.my - 4 - Math.random() * 14, t: 0, life: 0.5 + Math.random() * 0.2 });
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const st = this.settings();
    if (now - this.last < 1000 / (st.fps || 60) - 1.5) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
  };

  private draw() {
    const c = this.canvas;
    const dpr = renderDpr(this.settings());
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const S = Math.max(2, Math.round(Math.min(ch / 230, cw / 400)));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a7a3a';
    ctx.fillRect(0, 0, cw, ch);
    const vw = cw / S, vh = ch / S;
    const B = VIEW_BOUNDS;
    const clampCam = (v: number, view: number, a: number, b: number) => (view >= b - a ? (a + b - view) / 2 : Math.max(a, Math.min(b - view, v - view / 2)));
    this.cam.x = Math.round(clampCam(this.me.x, vw, B.x0, B.x1));
    this.cam.y = Math.round(clampCam(this.me.y - 8, vh, B.y0, B.y1));
    const { x: ox, y: oy } = this.cam;
    ctx.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    drawTownBg(ctx);

    // 按脚底的 y 排序后画：NPC、其他玩家、自己，以及各自跟随的宝可梦；树冠和屋檐最后画，挡住走到后面的人
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    const t = this.time;
    for (const [k, n] of Object.entries(NPCS)) list.push({ y: n.y, draw: () => drawNpc(ctx, k, n.x, n.y, 0) });
    const pushWalker = (w: Walker, trainer: string, alpha = 1) => {
      list.push({ y: w.my, draw: () => { shadow(ctx, w.mx, w.my); w.mon.draw(ctx, w.mx, w.my, 1, 0, alpha); } });
      list.push({ y: w.y, draw: () => { shadow(ctx, w.x, w.y); drawTrainer(ctx, trainer, w.x, w.y, w.dir, walkFrame(w.t, w.moving), 1, alpha); } });
    };
    for (const q of this.peers.values()) if (q.w === 0 && q.x >= 0) pushWalker(q, q.trainer, 0.92);
    pushWalker(this.me, this.trainer);
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    for (const w of this.twinkles) twinkle(ctx, w.x, w.y - w.t * 8, w.t / w.life);
    drawTownFg(ctx);

    // 文字用屏幕像素画，保证清晰
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.max(12, Math.round((12 * dpr) / 12) * 12);
    ctx.font = `${fs}px FusionPixel, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = (text: string, wx: number, wy: number, col: string, bg = 'rgba(16,20,40,.72)') => {
      const sx = Math.round((wx - ox) * S), sy = Math.round((wy - oy) * S);
      const w = Math.ceil(ctx.measureText(text).width) + fs * 0.6;
      ctx.fillStyle = bg;
      ctx.fillRect(Math.round(sx - w / 2), sy - fs - 4, Math.round(w), fs + 4);
      ctx.fillStyle = col;
      ctx.fillText(text, sx, sy - 1);
    };
    for (const b of BUILDINGS) label(b.name, b.door.x * CELL + CELL / 2, (b.door.y - 1) * CELL - 1, '#ffe070');
    label('1号道路 ▲', 13 * CELL, 2 * CELL + 6, '#c8ffb0');
    for (const q of this.peers.values()) if (q.w === 0 && q.x >= 0) label(q.name, q.x, q.y - 26, '#e8f0ff');
    label(this.name || '训练家', this.me.x, this.me.y - 26, '#ffffff', 'rgba(40,80,200,.75)');
    if (this.spot && this.active) {
      const bob = Math.round(Math.sin(t * 6) * 1.5);
      label(`▼ ${this.spot.label}`, this.me.x, this.me.y - 38 + bob, '#ffd23f', 'rgba(16,20,40,.85)');
    }
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(Math.round(x - 6), Math.round(y - 1), 12, 3);
}
