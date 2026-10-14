import { ENEMIES, ENEMY_IDS } from '../../shared/enemies';
import { decodeSnapshot, type SnapEnemy, type SnapPlayer, type SnapProj, type SnapZone, type Snapshot } from '../../shared/protocol';
import { FX_KINDS, SKILLS } from '../../shared/skills';
import type { Ev, MeState, PublicState } from '../../shared/sim/game';
import { sfx } from '../audio';
import { FxLayer, drawPickup, drawProj, drawZone, pxCircle, pxRing } from '../gfx/fx';
import { Animator, dirRow, shadowSize } from '../gfx/sprites';
import { BORDER, arenaCanvas } from '../gfx/tiles';
import { moveVector } from '../input';
import type { Settings } from '../save';

const INTERP_MS = 110;
const SEND_EVERY = 1000 / 30;

interface TimedSnap { t: number; s: Snapshot; players: Map<number, SnapPlayer>; enemies: Map<number, SnapEnemy>; projs: Map<number, SnapProj> }
interface EnemyVis { anim: Animator; flash: number; lx: number; ly: number; dir: number; scale: number }
interface PlayerVis { anim: Animator; flash: number; down: boolean; evoFlash: number }
interface Corpse { anim: Animator; x: number; y: number; t: number; scale: number }
interface Flyer { x: number; y: number; kind: number; value: number; pid: number; t: number }

export interface ViewHooks {
  onMessage(text: string): void;
  onBoss(name: string): void;
  onWave(n: number): void;
  onEvolve(pid: number, text: string): void;
}

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  w: number; h: number;
  you: number;
  names = new Map<number, string>();
  me: MeState | null = null;
  pub: PublicState | null = null;
  biome = 0;
  private snaps: TimedSnap[] = [];
  private clockOffset: number | null = null;
  private enemyVis = new Map<number, EnemyVis>();
  private playerVis = new Map<number, PlayerVis>();
  private corpses: Corpse[] = [];
  private pickups = new Map<number, { kind: number; x: number; y: number; value: number }>();
  private flyers: Flyer[] = [];
  private fx = new FxLayer();
  private local = { x: 0, y: 0, dir: Math.PI / 2, moving: false, synced: false };
  private lastSend = 0;
  private lastFrame = performance.now();
  private raf = 0;
  private scale = 3;
  private viewW = 480;
  private viewH = 270;
  private cam = { x: 0, y: 0 };
  private time = 0;
  private hurtFlash = 0;
  private superEffAt = 0;
  private lastSnapPhase = 0;
  settings: Settings;
  hooks: ViewHooks;
  send: (x: number, y: number, moving: boolean, dir: number) => void = () => {};
  canMove = () => true;

  constructor(canvas: HTMLCanvasElement, w: number, h: number, you: number, settings: Settings, hooks: ViewHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.w = w;
    this.h = h;
    this.you = you;
    this.settings = settings;
    this.hooks = hooks;
    this.local.x = w / 2;
    this.local.y = h / 2;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }

  private resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.scale = Math.max(1, Math.round(Math.min(ch / 290, cw / 430)));
    this.viewW = Math.ceil(cw / this.scale);
    this.viewH = Math.ceil(ch / this.scale);
  };

  // ------------------------------------------------------------ 网络输入

  onSnapshot(buf: ArrayBuffer) {
    const s = decodeSnapshot(buf);
    const now = performance.now();
    const serverMs = (s.tick * 1000) / 30;
    const off = now - serverMs;
    // 取较小的偏移（到达最早的那次），抖动时缓慢回调
    this.clockOffset = this.clockOffset === null ? off : Math.min(off, this.clockOffset + 0.5);
    const ts: TimedSnap = {
      t: serverMs, s,
      players: new Map(s.players.map((p) => [p.id, p])),
      enemies: new Map(s.enemies.map((e) => [e.id, e])),
      projs: new Map(s.projs.map((p) => [p.id, p])),
    };
    this.snaps.push(ts);
    if (this.snaps.length > 12) this.snaps.shift();
    const mine = ts.players.get(this.you);
    if (mine) {
      const d = Math.hypot(mine.x - this.local.x, mine.y - this.local.y);
      if (!this.local.synced || d > 140 || (mine.flags & 1) || s.phase !== 0) {
        this.local.x = mine.x;
        this.local.y = mine.y;
        this.local.synced = true;
      } else if (d > (this.local.moving ? 70 : 24)) {
        this.local.x += (mine.x - this.local.x) * 0.2;
        this.local.y += (mine.y - this.local.y) * 0.2;
      }
    }
    if (s.phase !== this.lastSnapPhase) {
      this.lastSnapPhase = s.phase;
      if (s.phase === 1) { this.corpses = []; }
    }
  }

  onEvents(evs: Ev[]) {
    for (const ev of evs) this.event(ev);
  }

  private event(ev: Ev) {
    const k = ev[0] as string;
    const n = (i: number) => ev[i] as number;
    switch (k) {
      case 'h': {
        const id = n(1), x = n(2), y = n(3), dmg = n(4), f = n(5);
        const v = this.enemyVis.get(id);
        if (v) v.flash = 0.12;
        if (f & 8) { this.fx.text(x, y - 18, String(dmg), '#d890f0', 10, 0.6); break; }
        const crit = !!(f & 1);
        const col = crit ? '#ffd23f' : f & 2 ? '#ff8c5a' : f & 4 ? '#a0a8b8' : '#ffffff';
        this.fx.text(x, y - 20, crit ? `${dmg}!` : String(dmg), col, crit ? 13 : 11, 0.7);
        if (f & 2 && this.time - this.superEffAt > 2.5) {
          this.superEffAt = this.time;
          this.fx.text(x, y - 34, '效果拔群！', '#ff8c5a', 10, 0.9);
        }
        sfx(crit ? 'crit' : 'hit');
        break;
      }
      case 'ph': {
        const pid = n(1), dmg = n(2), f = n(3);
        const pos = this.playerPos(pid);
        if (!pos) break;
        if (f & 1) this.fx.text(pos.x, pos.y - 26, '闪避', '#9fe8ff', 10);
        else if (f & 2) this.fx.text(pos.x, pos.y - 26, '护盾', '#9fd0ff', 10);
        else {
          this.fx.text(pos.x, pos.y - 26, `-${dmg}`, '#ff5f6d', 12);
          const v = this.playerVis.get(pid);
          if (v) { v.flash = 0.25; v.anim.play('Hurt'); }
          if (pid === this.you) {
            this.hurtFlash = 0.35;
            if (this.settings.shake) this.fx.shake = Math.max(this.fx.shake, 3);
            sfx('hurt');
          }
        }
        break;
      }
      case 'heal': {
        const pos = this.playerPos(n(1));
        if (pos) this.fx.text(pos.x, pos.y - 26, `+${n(2)}`, '#78f878', 11);
        if (n(1) === this.you) sfx('heal');
        break;
      }
      case 'die': {
        const id = n(1), x = n(2), y = n(3), kind = n(4);
        const v = this.enemyVis.get(id);
        const def = ENEMIES[ENEMY_IDS[kind]];
        if (def && this.corpses.length < 120) {
          const anim = new Animator(def.dex);
          anim.dir = v?.anim.dir ?? 0;
          anim.play('Faint', true, 1.6);
          this.corpses.push({ anim, x, y, t: 0, scale: v?.scale ?? 1 });
        }
        this.enemyVis.delete(id);
        this.fx.burst(x, y - 6, '#ffffff', 5, 50, 1);
        sfx('kill');
        break;
      }
      case 'fx': this.skillFx(ev); break;
      case 'chain': this.fx.add('chain', ev[1] as string, 0, 0, 0, 0, 0, 0.22, ev[2] as number[]); sfx('crit'); break;
      case 'mark': this.fx.add('mark', 'mark', n(1), n(2), 0, 0, 0, 1.0); break;
      case 'warn': this.fx.add('warn', 'warn', n(2), n(3), n(6), n(4), n(1), n(5) / 1000, [n(7)]); break;
      case 'boom': {
        const r = n(3);
        this.fx.add('boom', ev[4] as string, n(1), n(2), 0, r, 0, 0.35);
        if (r >= 30) {
          sfx('boom');
          if (this.settings.shake) this.fx.shake = Math.max(this.fx.shake, r > 50 ? 5 : 3);
        }
        break;
      }
      case 'drop': this.pickups.set(n(1), { kind: n(2), x: n(3), y: n(4), value: n(5) }); break;
      case 'pick': {
        const pk = this.pickups.get(n(1));
        if (pk) {
          this.flyers.push({ x: pk.x, y: pk.y, kind: pk.kind, value: pk.value, pid: n(2), t: 0 });
          this.pickups.delete(n(1));
          if (n(2) === this.you) sfx(pk.kind === 2 ? 'ball' : 'pickup');
        }
        break;
      }
      case 'clrp':
        for (const [, pk] of this.pickups) this.flyers.push({ ...pk, pid: this.nearestPid(pk.x, pk.y), t: 0 });
        this.pickups.clear();
        break;
      case 'lvl':
        if (n(1) === this.you) {
          const pos = this.playerPos(this.you);
          if (pos) this.fx.text(pos.x, pos.y - 34, 'Lv UP!', '#ffd23f', 12, 1);
          sfx('level');
        }
        break;
      case 'evo': {
        const v = this.playerVis.get(n(1));
        if (v) v.evoFlash = 1.4;
        this.hooks.onEvolve(n(1), ev[3] as string);
        sfx('evolve');
        break;
      }
      case 'down': sfx('down'); break;
      case 'rev': {
        sfx('revive');
        const pos = this.playerPos(n(1));
        if (pos) this.fx.burst(pos.x, pos.y - 8, '#f8f080', 12, 60);
        break;
      }
      case 'cast': {
        const v = this.playerVis.get(n(1));
        if (v && !v.anim.busy()) v.anim.play(n(2) === 0 ? 'Attack' : 'Shoot', false, 1.8);
        break;
      }
      case 'txt': this.fx.text(n(1), n(2), ev[3] as string, ev[4] as string, 11, 1.1); break;
      case 'msg': this.hooks.onMessage(ev[1] as string); break;
      case 'boss': this.hooks.onBoss(ev[2] as string); sfx('boss'); break;
      case 'wave':
        this.biome = n(3);
        this.local.synced = false;
        this.pickups.clear();
        this.corpses = [];
        this.hooks.onWave(n(1));
        sfx('wave');
        break;
    }
  }

  private skillFx(ev: Ev) {
    const fx = ev[1] as string, x = ev[2] as number, y = ev[3] as number, ang = ev[4] as number;
    const a = ev[5] as number, b = ev[6] as number, owner = ev[7] as number;
    if (fx.endsWith('_pre')) { this.fx.add('pre', fx, x, y, 0, a, 0, b / 1000); return; }
    if (fx.endsWith('_charge')) { this.fx.add('charge', fx, x, y, ang, a, b, (ev[8] as number) / 1000, undefined, owner); return; }
    const skill = Object.values(SKILLS).find((s) => s.fx === fx);
    const pat = skill?.pattern;
    if (pat === 'melee') this.fx.add('melee', fx, x, y, ang, a, b, 0.2);
    else if (pat === 'beam') { this.fx.add('beam', fx, x, y, ang, a, b, 0.28); if (b >= 20 && this.settings.shake) this.fx.shake = Math.max(this.fx.shake, 2); }
    else if (pat === 'nova') { this.fx.add('nova', fx, x, y, 0, a, 0, 0.3); if (fx === 'earthquake' && this.settings.shake) this.fx.shake = 5; }
    else if (pat === 'heal') { this.fx.add('heal', fx, x, y, 0, a, 0, 0.8); }
    else if (pat === 'buff') this.fx.add('buff', fx, x, y, 0, 0, 0, 0.6);
    else if (pat === 'shield') this.fx.add('shieldfx', fx, x, y, 0, 0, 0, 0.4);
  }

  private nearestPid(x: number, y: number) {
    let best = this.you, bd = Infinity;
    const s = this.snaps[this.snaps.length - 1];
    if (!s) return best;
    for (const p of s.s.players) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  private playerPos(pid: number): { x: number; y: number } | null {
    if (pid === this.you) return { x: this.local.x, y: this.local.y };
    const s = this.snaps[this.snaps.length - 1];
    const p = s?.players.get(pid);
    return p ? { x: p.x, y: p.y } : null;
  }

  // ------------------------------------------------------------ 主循环

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.updateLocal(dt, now);
    this.fx.update(dt);
    this.render(now, dt);
  };

  private updateLocal(dt: number, now: number) {
    const last = this.snaps[this.snaps.length - 1];
    const mine = last?.players.get(this.you);
    const inWave = last?.s.phase === 0;
    const down = !!mine && (mine.flags & 1) !== 0;
    const mv = inWave && !down && this.canMove() ? moveVector() : { x: 0, y: 0 };
    const speed = this.me?.speed ?? 100;
    this.local.moving = !!(mv.x || mv.y);
    if (this.local.moving) {
      this.local.x = Math.max(8, Math.min(this.w - 8, this.local.x + mv.x * speed * dt));
      this.local.y = Math.max(14, Math.min(this.h - 6, this.local.y + mv.y * speed * dt));
      this.local.dir = Math.atan2(mv.y, mv.x);
    }
    if (inWave && !down && this.local.synced && now - this.lastSend >= SEND_EVERY) {
      this.lastSend = now;
      this.send(this.local.x, this.local.y, this.local.moving, this.local.dir);
    }
  }

  private interp(): { a: TimedSnap; b: TimedSnap; f: number } | null {
    const n = this.snaps.length;
    if (!n || this.clockOffset === null) return null;
    const rt = performance.now() - this.clockOffset - INTERP_MS;
    for (let i = n - 1; i > 0; i--) {
      const a = this.snaps[i - 1], b = this.snaps[i];
      if (a.t <= rt) {
        const f = b.t > a.t ? Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t))) : 1;
        return { a, b, f };
      }
    }
    return { a: this.snaps[0], b: this.snaps[0], f: 0 };
  }

  private render(now: number, dt: number) {
    const ctx = this.ctx;
    const S = this.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 镜头
    const tx = this.local.x - this.viewW / 2, ty = this.local.y - this.viewH / 2;
    const clampAxis = (v: number, view: number, world: number) => {
      const min = -BORDER + 8, max = world + BORDER - 8 - view;
      return max < min ? (world - view) / 2 : Math.max(min, Math.min(max, v));
    };
    this.cam.x += (clampAxis(tx, this.viewW, this.w) - this.cam.x) * Math.min(1, dt * 12);
    this.cam.y += (clampAxis(ty, this.viewH, this.h) - this.cam.y) * Math.min(1, dt * 12);
    let cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    if (this.fx.shake > 0) {
      cx += Math.round((Math.random() - 0.5) * this.fx.shake);
      cy += Math.round((Math.random() - 0.5) * this.fx.shake);
    }
    ctx.setTransform(S, 0, 0, S, -cx * S, -cy * S);

    ctx.drawImage(arenaCanvas(this.biome, this.w, this.h), -BORDER, -BORDER);

    const ip = this.interp();
    const t = this.time;

    // 区域
    if (ip) {
      for (const z of ip.b.s.zones as SnapZone[]) drawZone(ctx, FX_KINDS[z.fx], z.x, z.y, z.r, z.life, t);
    }
    // 掉落物
    for (const pk of this.pickups.values()) drawPickup(ctx, pk.kind, pk.x, pk.y, pk.value, t);
    this.fx.drawGround(ctx);

    // 实体（按 y 排序）
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    if (ip) {
      const { a, b, f } = ip;
      for (const e of b.s.enemies) {
        const pa = a.enemies.get(e.id);
        const x = pa ? pa.x + (e.x - pa.x) * f : e.x;
        const y = pa ? pa.y + (e.y - pa.y) * f : e.y;
        const def = ENEMIES[ENEMY_IDS[e.kind]];
        if (!def) continue;
        let v = this.enemyVis.get(e.id);
        if (!v) {
          v = { anim: new Animator(def.dex), flash: 0, lx: x, ly: y, dir: 0, scale: def.scale ?? 1 };
          v.anim.loop('Walk');
          this.enemyVis.set(e.id, v);
        }
        const vis = v;
        const mdx = x - vis.lx, mdy = y - vis.ly;
        if (Math.abs(mdx) + Math.abs(mdy) > 0.15) vis.anim.dir = dirRow(Math.atan2(mdy, mdx));
        vis.anim.loop((e.flags & 128) ? 'Idle' : 'Walk', (e.flags & 16) ? 0 : 1);
        vis.lx = x; vis.ly = y;
        vis.anim.update(dt);
        vis.flash = Math.max(0, vis.flash - dt);
        if (e.flags & 1) continue;
        list.push({ y, draw: () => this.drawEnemy(e, def.rank, def.dex, x, y, vis, t) });
      }
      for (const p of b.s.players) {
        const pa = a.players.get(p.id);
        let x = pa ? pa.x + (p.x - pa.x) * f : p.x;
        let y = pa ? pa.y + (p.y - pa.y) * f : p.y;
        if (p.id === this.you && this.local.synced) { x = this.local.x; y = this.local.y; }
        let v = this.playerVis.get(p.id);
        if (!v) { v = { anim: new Animator(p.dex), flash: 0, down: false, evoFlash: 0 }; this.playerVis.set(p.id, v); }
        const vis = v;
        vis.anim.setDex(p.dex);
        const down = (p.flags & 1) !== 0;
        if (down && !vis.down) vis.anim.play('Faint', true);
        if (!down && vis.down) vis.anim.loop('Idle');
        vis.down = down;
        const moving = p.id === this.you ? this.local.moving : (p.flags & 8) !== 0;
        const dir = p.id === this.you ? this.local.dir : p.dir;
        if (!down) {
          vis.anim.loop(moving && b.s.phase === 0 ? 'Walk' : 'Idle');
          vis.anim.dir = dirRow(dir);
        }
        vis.anim.update(dt);
        vis.flash = Math.max(0, vis.flash - dt);
        vis.evoFlash = Math.max(0, vis.evoFlash - dt);
        list.push({ y, draw: () => this.drawPlayer(p, x, y, vis, t) });
      }
    }
    for (const c of this.corpses) {
      c.t += dt;
      c.anim.update(dt);
      list.push({ y: c.y, draw: () => c.anim.draw(ctx, c.x, c.y, c.scale, 0, Math.max(0, 1 - c.t / 0.7)) });
    }
    this.corpses = this.corpses.filter((c) => c.t < 0.7);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();

    // 弹体
    if (ip) {
      const { a, b, f } = ip;
      for (const p of b.s.projs) {
        const pa = a.projs.get(p.id);
        const x = pa ? pa.x + (p.x - pa.x) * f : p.x;
        const y = pa ? pa.y + (p.y - pa.y) * f : p.y;
        drawProj(ctx, FX_KINDS[p.fx], x, y, p.ang, p.r, t + p.id * 0.1);
      }
    }
    // 飞向玩家的掉落物
    for (const fl of this.flyers) {
      fl.t += dt;
      const pos = this.playerPos(fl.pid);
      if (pos) {
        const k = Math.min(1, fl.t / 0.25);
        drawPickup(ctx, fl.kind, fl.x + (pos.x - fl.x) * k, fl.y + (pos.y - 8 - fl.y) * k, fl.value, t);
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 0.25);

    this.fx.drawAir(ctx, this.settings.damageNumbers);

    // 屏幕层：受伤红闪
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      ctx.fillStyle = `rgba(255,40,60,${Math.max(0, this.hurtFlash) * 0.5})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    const mine = ip?.b.players.get(this.you);
    if (mine && mine.hp > 0 && mine.hp < mine.maxHp * 0.3 && !(mine.flags & 1)) {
      const a = 0.12 + 0.08 * Math.sin(now / 180);
      const g = ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.3, this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.8);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawShadow(x: number, y: number, size: number, scale: number) {
    const rx = [5, 7, 10][Math.min(2, size)] * scale;
    this.ctx.fillStyle = 'rgba(0,0,0,.28)';
    this.ctx.fillRect(Math.round(x - rx), Math.round(y - 1), Math.round(rx * 2), 3);
    this.ctx.fillRect(Math.round(x - rx + 2), Math.round(y - 2), Math.round(rx * 2 - 4), 5);
  }

  private drawEnemy(e: SnapEnemy, rank: string, dex: number, x: number, y: number, v: EnemyVis, t: number) {
    const ctx = this.ctx;
    this.drawShadow(x, y, shadowSize(dex), v.scale);
    if (rank !== 'minion') {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
      pxRing(ctx, x, y - 2, 9 * v.scale, rank === 'boss' ? '#f8d030' : '#f85050');
      ctx.globalAlpha = 1;
    }
    v.anim.draw(ctx, x, y, v.scale, v.flash > 0 ? 1 : 0);
    const f = e.flags;
    const top = y - 26 * v.scale;
    if (f & 2 && Math.random() < 0.3) this.fx.burst(x + (Math.random() - 0.5) * 8, y - 8, '#f88030', 1, 10, 1, -40, 0.4);
    if (f & 4 && Math.random() < 0.25) this.fx.burst(x + (Math.random() - 0.5) * 8, y - 6, '#b060d0', 1, 8, 1, -30, 0.5);
    if (f & 8 && Math.random() < 0.25) this.fx.burst(x + (Math.random() - 0.5) * 10, y - 10, '#f8e030', 1, 30, 1, 0, 0.2);
    if (f & 16) { ctx.globalAlpha = 0.4; pxCircle(ctx, x, y - 8, 7 * v.scale, '#a8e8f8'); ctx.globalAlpha = 1; }
    if (f & 64) {
      ctx.fillStyle = '#f83838';
      ctx.fillRect(Math.round(x) - 1, Math.round(top) - 6, 2, 5);
      ctx.fillRect(Math.round(x) - 1, Math.round(top), 2, 2);
    }
    if (rank !== 'minion' || e.hp < 0.999) {
      const w = rank === 'boss' ? 0 : rank === 'elite' ? 22 : 12;
      if (w) {
        const bx = Math.round(x - w / 2), by = Math.round(y + 2);
        ctx.fillStyle = '#181020';
        ctx.fillRect(bx - 1, by - 1, w + 2, 4);
        ctx.fillStyle = rank === 'elite' ? '#f85050' : '#f8a040';
        ctx.fillRect(bx, by, Math.max(1, Math.round(w * e.hp)), 2);
      }
    }
  }

  private drawPlayer(p: SnapPlayer, x: number, y: number, v: PlayerVis, t: number) {
    const ctx = this.ctx;
    const mine = p.id === this.you;
    this.drawShadow(x, y, shadowSize(p.dex), 1);
    if (mine) {
      ctx.globalAlpha = 0.5;
      pxRing(ctx, x, y - 1, 8, '#ffffff');
      ctx.globalAlpha = 1;
    }
    const invuln = (p.flags & 2) !== 0 && !(p.flags & 1);
    const alpha = invuln && Math.floor(t * 16) % 2 ? 0.55 : 1;
    v.anim.draw(ctx, x, y, 1, v.flash > 0 ? 0.6 : v.evoFlash > 0 ? Math.min(1, v.evoFlash) : 0, alpha);
    if (v.evoFlash > 0) {
      ctx.globalAlpha = v.evoFlash / 1.4;
      pxRing(ctx, x, y - 10, 10 + (1.4 - v.evoFlash) * 30, '#ffffff');
      ctx.globalAlpha = 1;
    }
    if (p.flags & 4) {
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 8);
      pxRing(ctx, x, y - 9, 13, '#a0d8ff');
      ctx.globalAlpha = 1;
    }
    if (p.flags & 16 && Math.random() < 0.3) this.fx.burst(x, y - 4, '#f8e048', 1, 20, 1, 0, 0.3);
    // 名字与血条
    const name = this.names.get(p.id) ?? '';
    ctx.font = '10px FusionPixel, monospace';
    ctx.textAlign = 'center';
    const ny = Math.round(y - 30);
    if (!mine || this.names.size > 1) {
      ctx.fillStyle = '#101018';
      ctx.fillText(name, Math.round(x) + 1, ny + 1);
      ctx.fillStyle = mine ? '#ffd23f' : '#ffffff';
      ctx.fillText(name, Math.round(x), ny);
    }
    const w = 18, bx = Math.round(x - w / 2), by = Math.round(y + 3);
    ctx.fillStyle = '#181020';
    ctx.fillRect(bx - 1, by - 1, w + 2, 4);
    const frac = p.maxHp ? p.hp / p.maxHp : 0;
    ctx.fillStyle = frac > 0.5 ? '#58d858' : frac > 0.2 ? '#f8c838' : '#f84848';
    ctx.fillRect(bx, by, Math.round(w * frac), 2);
    if (p.flags & 1) {
      ctx.fillStyle = '#101018';
      ctx.fillText('濒死', Math.round(x) + 1, ny - 9);
      ctx.fillStyle = '#ff8c8c';
      ctx.fillText('濒死', Math.round(x), ny - 10);
      if (p.revive > 0) {
        ctx.strokeStyle = '#78f878';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 8, 14, -Math.PI / 2, -Math.PI / 2 + p.revive * Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
