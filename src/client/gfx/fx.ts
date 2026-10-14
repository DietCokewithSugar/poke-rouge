import { TYPE_COLOR } from '../../shared/types';
import { SKILLS } from '../../shared/skills';

/** 像素圆：按半径与颜色缓存成小画布，缩放绘制时保持像素感。 */
const circleCache = new Map<string, HTMLCanvasElement>();
function circleSprite(r: number, color: string, ring = false): HTMLCanvasElement {
  r = Math.max(1, Math.round(r));
  const key = `${r}|${color}|${ring}`;
  let c = circleCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2 + 1;
  const x = c.getContext('2d')!;
  x.fillStyle = color;
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      const d = Math.sqrt(xx * xx + yy * yy);
      if (ring ? d <= r + 0.3 && d >= r - 1.2 : d <= r + 0.3) x.fillRect(xx + r, yy + r, 1, 1);
    }
  }
  if (circleCache.size > 600) circleCache.clear();
  circleCache.set(key, c);
  return c;
}

export function pxCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const s = circleSprite(r, color);
  ctx.drawImage(s, Math.round(x) - Math.round(r), Math.round(y) - Math.round(r));
}

export function pxRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  if (r > 120) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const s = circleSprite(r, color, true);
  ctx.drawImage(s, Math.round(x) - Math.round(r), Math.round(y) - Math.round(r));
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

const FX_COLOR: Record<string, [string, string, string]> = {
  ember: ['#f85020', '#f8a030', '#f8f070'], water: ['#3070e0', '#68a8f8', '#e0f0ff'], bubble: ['#78b8f8', '#b8e0ff', '#ffffff'],
  waterpulse: ['#3878e8', '#78b0f8', '#e0f0ff'], shock: ['#c8a000', '#f8e030', '#ffffff'], electroball: ['#d0a800', '#f8e040', '#ffffa0'],
  leaf: ['#287828', '#58b040', '#a8e070'], seed: ['#704010', '#a07030', '#d0b060'], energyball: ['#30a030', '#78d860', '#e0ffd0'],
  petal: ['#e86898', '#f8a0c8', '#fff0f8'], psy: ['#c048a8', '#f070d0', '#ffd0f0'], star: ['#e0a000', '#f8e050', '#ffffff'],
  psychocut: ['#9038b8', '#d070f0', '#ffe0ff'], shadowball: ['#281838', '#583878', '#9068c0'], aurasphere: ['#2050c0', '#5890f0', '#d0e8ff'],
  psystrike: ['#a03090', '#e060c8', '#ffe0f8'], airslash: ['#a0c8e8', '#d8f0ff', '#ffffff'],
  e_sting: ['#909090', '#e0e0e0', '#ffffff'], e_acid: ['#602880', '#a050c0', '#e0a0f0'], e_spore: ['#90a020', '#d0e050', '#f8ffb0'],
  e_shock: ['#c8a000', '#f8e030', '#ffffff'], e_shadow: ['#201030', '#503070', '#8058a8'], e_psy: ['#c03890', '#f068c8', '#ffd0f0'],
  e_gust: ['#b0c8d8', '#e0f0f8', '#ffffff'], e_rock: ['#605040', '#908070', '#c0b0a0'], e_bubble: ['#80c0f8', '#c0e8ff', '#ffffff'],
  e_star: ['#e050a0', '#f890d0', '#ffffff'], e_ring: ['#f8a040', '#f8d080', '#ffffff'],
};

/** 绘制弹体。 */
export function drawProj(ctx: CanvasRenderingContext2D, fx: string, x: number, y: number, ang: number, r: number, t: number) {
  const c = FX_COLOR[fx] ?? ['#888', '#ccc', '#fff'];
  const flick = Math.floor(t * 20) % 2;
  switch (fx) {
    case 'ember':
    case 'e_ring':
      pxCircle(ctx, x - Math.cos(ang) * 3, y - Math.sin(ang) * 3, r * 0.7, c[0]);
      pxCircle(ctx, x, y, r + flick * 0.5, c[1]);
      pxCircle(ctx, x + Math.cos(ang), y + Math.sin(ang), Math.max(1, r - 1.5), c[2]);
      return;
    case 'water':
    case 'waterpulse':
    case 'e_bubble':
    case 'bubble':
      if (fx === 'bubble' || fx === 'e_bubble') {
        pxRing(ctx, x, y, r, c[1]);
        rect(ctx, x - r * 0.4, y - r * 0.5, 1, 1, c[2]);
      } else {
        pxCircle(ctx, x - Math.cos(ang) * r, y - Math.sin(ang) * r, r * 0.8, c[0]);
        pxCircle(ctx, x, y, r, c[1]);
        rect(ctx, x - 1, y - 1, 1, 1, c[2]);
        if (fx === 'waterpulse') pxRing(ctx, x, y, r + 2 + flick, c[0]);
      }
      return;
    case 'shock':
    case 'e_shock': {
      ctx.strokeStyle = flick ? c[1] : c[2];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const ca = Math.cos(ang), sa = Math.sin(ang);
      ctx.moveTo(x - ca * 6, y - sa * 6);
      ctx.lineTo(x - ca * 2 - sa * 3, y - sa * 2 + ca * 3);
      ctx.lineTo(x + ca * 2 + sa * 3, y + sa * 2 - ca * 3);
      ctx.lineTo(x + ca * 6, y + sa * 6);
      ctx.stroke();
      return;
    }
    case 'electroball':
      pxCircle(ctx, x, y, r, c[1]);
      pxCircle(ctx, x, y, Math.max(1, r - 2), c[2]);
      for (let i = 0; i < 3; i++) {
        const a = t * 9 + i * 2.1;
        rect(ctx, x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2), 1, 1, c[2]);
      }
      return;
    case 'leaf':
    case 'petal':
    case 'airslash':
    case 'psychocut': {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(fx === 'petal' || fx === 'leaf' ? t * 14 : ang);
      if (fx === 'airslash' || fx === 'psychocut') {
        ctx.fillStyle = c[1];
        ctx.fillRect(-1, -r, 2, r * 2);
        ctx.fillStyle = c[2];
        ctx.fillRect(1, -r + 2, 1, r * 2 - 4);
      } else {
        ctx.fillStyle = c[0];
        ctx.fillRect(-r, -1, r * 2, 2);
        ctx.fillStyle = c[1];
        ctx.fillRect(-r + 1, -2, r * 2 - 2, 4);
        ctx.fillStyle = c[2];
        ctx.fillRect(-r + 2, -1, r - 1, 1);
      }
      ctx.restore();
      return;
    }
    case 'seed':
      pxCircle(ctx, x, y, 2, c[1]);
      rect(ctx, x - 1, y - 1, 1, 1, c[2]);
      return;
    case 'star':
    case 'e_star':
      drawStar(ctx, x, y, r + 1, c[1], c[2], t * 8);
      return;
    case 'shadowball':
    case 'e_shadow':
      pxCircle(ctx, x, y, r + 1, c[1]);
      pxCircle(ctx, x, y, r, c[0]);
      for (let i = 0; i < 2; i++) {
        const a = t * 6 + i * Math.PI;
        rect(ctx, x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1), 2, 2, c[2]);
      }
      return;
    case 'e_rock':
      pxCircle(ctx, x, y, r, c[1]);
      rect(ctx, x - 1, y - 2, 2, 1, c[2]);
      return;
    case 'psystrike':
      pxCircle(ctx, x, y, r, c[0]);
      pxCircle(ctx, x, y, r - 3, c[1]);
      pxRing(ctx, x, y, r + 2 + flick, c[2]);
      return;
    default:
      pxCircle(ctx, x, y, r + 0.5, c[0]);
      pxCircle(ctx, x, y, Math.max(1, r - 0.5), c[1]);
      rect(ctx, x - 1, y - 1, 1, 1, c[2]);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c1: string, c2: string, rot: number) {
  ctx.fillStyle = c1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  rect(ctx, x, y, 1, 1, c2);
}

// ---------------------------------------------------------------- 一次性特效

interface Effect {
  kind: string;
  fx: string;
  x: number; y: number;
  ang: number;
  a: number; b: number;
  t: number; dur: number;
  pts?: number[];
  color: string;
  owner?: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }

export interface FloatText { x: number; y: number; text: string; color: string; t: number; dur: number; size: number; vy: number }

function colorOfFx(fx: string): string {
  const base = fx.replace(/_(pre|charge)$/, '');
  for (const s of Object.values(SKILLS)) if (s.fx === base) return TYPE_COLOR[s.type];
  const c = FX_COLOR[base];
  return c ? c[1] : '#ffffff';
}

export class FxLayer {
  effects: Effect[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  shake = 0;

  add(kind: string, fx: string, x: number, y: number, ang = 0, a = 0, b = 0, dur = 0.25, pts?: number[], owner?: number) {
    if (this.effects.length > 400) this.effects.shift();
    this.effects.push({ kind, fx, x, y, ang, a, b, t: 0, dur, pts, color: colorOfFx(fx), owner });
  }

  burst(x: number, y: number, color: string, n = 6, speed = 40, size = 1, g = 0, life = 0.4) {
    if (this.particles.length > 900) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, color, size, g });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 12, dur = 0.8) {
    if (this.texts.length > 160) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 6, y, text, color, t: 0, dur, size, vy: -26 });
  }

  update(dt: number) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= 0.94;
      p.vy *= p.g ? 1 : 0.94;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= 0.92;
    }
    this.texts = this.texts.filter((t) => t.t < t.dur);
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  /** 地面层（警示圈、出怪标记、区域） */
  drawGround(ctx: CanvasRenderingContext2D) {
    for (const e of this.effects) {
      const k = e.t / e.dur;
      if (e.kind === 'warn') {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(e.t * 20);
        if (e.b === 1) {
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(e.ang);
          ctx.fillStyle = 'rgba(248,56,56,.35)';
          ctx.fillRect(0, -e.a / 2, (e.pts?.[0] ?? 100), e.a);
          ctx.fillStyle = 'rgba(248,80,80,.8)';
          ctx.fillRect(0, -e.a / 2, (e.pts?.[0] ?? 100) * k, 1);
          ctx.fillRect(0, e.a / 2 - 1, (e.pts?.[0] ?? 100) * k, 1);
          ctx.restore();
        } else {
          pxRing(ctx, e.x, e.y, e.a, '#f83838');
          ctx.globalAlpha *= 0.6;
          pxCircle(ctx, e.x, e.y, Math.max(1, e.a * k), 'rgba(248,56,56,.45)');
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'mark') {
        const shakeX = Math.round(Math.sin(e.t * 40));
        ctx.globalAlpha = 0.85;
        // 摇晃的草丛
        for (let i = -1; i <= 1; i++) {
          rect(ctx, e.x + i * 4 + shakeX - 1, e.y - 4, 2, 5, '#2f7a2f');
          rect(ctx, e.x + i * 4 + shakeX, e.y - 6, 1, 3, '#58b048');
        }
        if (k > 0.35) {
          rect(ctx, e.x - 1, e.y - 16, 2, 6, '#f83838');
          rect(ctx, e.x - 1, e.y - 8, 2, 2, '#f83838');
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'pre') {
        drawStrikePre(ctx, e, k);
      }
    }
  }

  /** 空中层（技能特效、粒子、文字） */
  drawAir(ctx: CanvasRenderingContext2D, showNumbers: boolean) {
    for (const e of this.effects) {
      const k = e.t / e.dur;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      switch (e.kind) {
        case 'melee': drawMelee(ctx, e, k); break;
        case 'beam': drawBeam(ctx, e, k); break;
        case 'charge': drawCharge(ctx, e, k); break;
        case 'nova': drawNova(ctx, e, k); break;
        case 'chain': drawChain(ctx, e); break;
        case 'boom': drawBoom(ctx, e, k); break;
        case 'heal':
          for (let i = 0; i < 5; i++) {
            const a = i * 1.26 + e.t * 2;
            const r = 6 + (i % 3) * 3;
            const yy = e.y - 10 - k * 16 - i * 2;
            rect(ctx, e.x + Math.cos(a) * r - 1, yy, 3, 1, '#78f878');
            rect(ctx, e.x + Math.cos(a) * r, yy - 1, 1, 3, '#78f878');
          }
          if (e.a > 30) pxRing(ctx, e.x, e.y - 6, e.a * Math.min(1, k * 2), '#88f888');
          break;
        case 'buff':
          for (let i = 0; i < 4; i++) rect(ctx, e.x - 10 + i * 6, e.y - 4 - ((e.t * 60 + i * 7) % 20), 1, 4, '#f8e048');
          break;
        case 'shieldfx':
          pxRing(ctx, e.x, e.y - 8, 12 + k * 4, '#a0d8ff');
          break;
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      rect(ctx, p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const t of this.texts) {
      if (!showNumbers && /^\d+!?$/.test(t.text)) continue;
      const a = t.t / t.dur;
      ctx.globalAlpha = a > 0.7 ? (1 - a) / 0.3 : 1;
      ctx.font = `${t.size}px FusionPixel, monospace`;
      const x = Math.round(t.x), y = Math.round(t.y);
      ctx.fillStyle = '#101018';
      ctx.fillText(t.text, x + 1, y);
      ctx.fillText(t.text, x - 1, y);
      ctx.fillText(t.text, x, y + 1);
      ctx.fillText(t.text, x, y - 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMelee(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const rad = e.a, arc = (e.b * Math.PI) / 180;
  const col = e.color;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (/claw|scratch|slash|chop/.test(e.fx)) {
    ctx.rotate(e.ang);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      const off = i * 5;
      const len = rad * 0.8 * Math.min(1, k * 3);
      ctx.moveTo(rad * 0.35 - len / 2, off - len / 2);
      ctx.lineTo(rad * 0.35 + len / 2, off + len / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.9, -arc / 2, arc / 2);
    ctx.stroke();
  } else if (/bite|fang/.test(e.fx)) {
    ctx.rotate(e.ang);
    const gap = 8 * (1 - Math.min(1, k * 2.5));
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(rad * 0.4 + i * 3, -gap - 4, 2, 4);
      ctx.fillRect(rad * 0.4 + i * 3, gap, 2, 4);
    }
    if (e.fx === 'firefang') { ctx.fillStyle = '#f87830'; ctx.fillRect(rad * 0.4, -2, 12, 4); }
  } else {
    // 扇形（喷吐 / 撞击 / 尾巴横扫）
    ctx.fillStyle = col;
    ctx.globalAlpha *= 0.45;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const r = rad * (0.5 + 0.5 * Math.min(1, k * 2.5));
    if (arc >= Math.PI * 2 - 0.01) ctx.arc(0, 0, r, 0, Math.PI * 2);
    else ctx.arc(0, 0, r, e.ang - arc / 2, e.ang + arc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.45;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (arc >= Math.PI * 2 - 0.01) ctx.arc(0, 0, r, 0, Math.PI * 2);
    else ctx.arc(0, 0, r, e.ang - arc / 2, e.ang + arc / 2);
    ctx.stroke();
  }
  ctx.restore();
}

const BEAM: Record<string, [string, string]> = {
  flamethrower: ['#f86020', '#f8d040'], hydropump: ['#3070e0', '#c8e8ff'], icebeam: ['#78d8f0', '#ffffff'],
  solarbeam: ['#f8e868', '#ffffff'], psybeam: ['#e060c0', '#ffd0f8'], hyperbeam: ['#f89838', '#fff0c0'],
};

function drawBeam(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const [c1, c2] = BEAM[e.fx] ?? [e.color, '#ffffff'];
  const w = e.b * (1 - k * 0.6);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.ang);
  if (e.fx === 'flamethrower') {
    for (let i = 0; i < 14; i++) {
      const d = (i / 14) * e.a;
      const s = 2 + (i / 14) * w * 0.5;
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.fillRect(d, -s / 2 + Math.sin(e.t * 40 + i) * 2, s, s);
    }
  } else {
    ctx.fillStyle = c1;
    ctx.fillRect(0, -w / 2, e.a, Math.max(1, w));
    ctx.fillStyle = c2;
    ctx.fillRect(0, -w / 6, e.a, Math.max(1, w / 3));
    if (e.fx === 'psybeam') {
      for (let i = 0; i < e.a; i += 8) { ctx.fillStyle = ['#f85888', '#f8d030', '#58c8f8'][(i / 8 + Math.floor(e.t * 20)) % 3]; ctx.fillRect(i, -w / 2, 3, w); }
    }
  }
  ctx.restore();
}

function drawCharge(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const [c1, c2] = BEAM[e.fx.replace('_charge', '')] ?? [e.color, '#ffffff'];
  ctx.globalAlpha = 0.9;
  pxCircle(ctx, e.x + Math.cos(e.ang) * 8, e.y + Math.sin(e.ang) * 8, 2 + k * 6, c1);
  pxCircle(ctx, e.x + Math.cos(e.ang) * 8, e.y + Math.sin(e.ang) * 8, 1 + k * 3, c2);
  ctx.globalAlpha = 0.25;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.ang);
  ctx.fillStyle = c1;
  ctx.fillRect(0, -1, e.a, 2);
  ctx.restore();
}

function drawNova(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const r = e.a * Math.min(1, 0.2 + k * 1.4);
  switch (e.fx) {
    case 'surf':
      pxRing(ctx, e.x, e.y, r, '#3878e8');
      pxRing(ctx, e.x, e.y, r - 2, '#78b0f8');
      pxRing(ctx, e.x, e.y, r + 1, '#ffffff');
      break;
    case 'discharge':
      pxRing(ctx, e.x, e.y, r, '#f8e030');
      for (let i = 0; i < 10; i++) {
        const a = i * 0.628 + e.t * 5;
        rect(ctx, e.x + Math.cos(a) * r * 0.7, e.y + Math.sin(a) * r * 0.7, 2, 2, '#ffffff');
      }
      break;
    case 'earthquake':
      pxRing(ctx, e.x, e.y, r, '#a07838');
      pxRing(ctx, e.x, e.y, r * 0.7, '#c8a060');
      break;
    case 'flareblitz':
      pxRing(ctx, e.x, e.y, r, '#f85020');
      pxRing(ctx, e.x, e.y, r - 3, '#f8c040');
      break;
    case 'frenzyplant':
      for (let i = 0; i < 12; i++) {
        const a = i * 0.524;
        const rr = r * (0.6 + (i % 3) * 0.15);
        rect(ctx, e.x + Math.cos(a) * rr - 1, e.y + Math.sin(a) * rr - 5, 3, 6, '#307830');
        rect(ctx, e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr - 7, 1, 3, '#78c858');
      }
      break;
    default:
      pxRing(ctx, e.x, e.y, r, e.color);
      pxRing(ctx, e.x, e.y, r * 0.6, '#ffffff');
  }
}

function drawChain(ctx: CanvasRenderingContext2D, e: Effect) {
  const pts = e.pts ?? [];
  ctx.strokeStyle = Math.floor(e.t * 30) % 2 ? '#ffffff' : '#f8e030';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    ctx.moveTo(x0, y0);
    const seg = 4;
    for (let s = 1; s < seg; s++) {
      const f = s / seg;
      ctx.lineTo(x0 + (x1 - x0) * f + (Math.random() - 0.5) * 8, y0 + (y1 - y0) * f + (Math.random() - 0.5) * 8);
    }
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

const BOOM: Record<string, string[]> = {
  fireblast: ['#f84010', '#f89830', '#f8f070'], seedbomb: ['#507020', '#90b040', '#d0e080'], thunder: ['#f8e030', '#ffffff', '#f8f8a0'],
  psychic: ['#e050b0', '#f8a0e0', '#ffffff'], futuresight: ['#8040c0', '#c080f8', '#ffffff'], meteor: ['#7038f8', '#f8a040', '#ffffff'],
  sludge: ['#703090', '#a050c0', '#d090e8'], rockslide: ['#706050', '#a09080', '#d0c0b0'],
  e_blast: ['#f8e030', '#f88030', '#ffffff'], e_cloud: ['#8040a0', '#a868c0', '#d0a8e0'], e_slam: ['#a08060', '#d0b890', '#ffffff'],
  e_rock: ['#706050', '#a09080', '#d0c0b0'], e_psy: ['#e050b0', '#f8a0e0', '#ffffff'], e_vanish: ['#403050', '#806898', '#c0b0d8'],
};

function drawBoom(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const c = BOOM[e.fx] ?? [e.color, '#ffffff', '#ffffff'];
  const r = e.a * Math.min(1, 0.3 + k * 1.6);
  if (e.fx === 'thunder') {
    ctx.fillStyle = k < 0.3 ? '#ffffff' : '#f8e030';
    let x = e.x;
    for (let y = e.y - 120; y < e.y; y += 8) {
      const nx = x + (Math.random() - 0.5) * 10;
      ctx.fillRect(Math.round(Math.min(x, nx)), y, Math.max(2, Math.abs(nx - x)), 8);
      x = nx;
    }
  }
  pxCircle(ctx, e.x, e.y, r, c[0]);
  pxCircle(ctx, e.x, e.y, r * 0.65, c[1]);
  pxCircle(ctx, e.x, e.y, r * 0.3, c[2]);
}

function drawStrikePre(ctx: CanvasRenderingContext2D, e: Effect, k: number) {
  const c = BOOM[e.fx.replace('_pre', '')] ?? [e.color, '#fff', '#fff'];
  ctx.globalAlpha = 0.5;
  pxRing(ctx, e.x, e.y, e.a, c[1]);
  ctx.globalAlpha = 0.25;
  pxCircle(ctx, e.x, e.y, e.a * k, c[0]);
  ctx.globalAlpha = 1;
  const base = e.fx.replace('_pre', '');
  if (base === 'fireblast' || base === 'meteor' || base === 'rockslide' || base === 'seedbomb' || base === 'sludge') {
    const h = (1 - k) * 90;
    pxCircle(ctx, e.x + h * 0.3, e.y - h, base === 'seedbomb' ? 3 : 5, c[1]);
    pxCircle(ctx, e.x + h * 0.3, e.y - h, base === 'seedbomb' ? 1 : 3, c[2]);
  }
}

// ---------------------------------------------------------------- 掉落物

export function drawPickup(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, value: number, t: number) {
  const bob = Math.round(Math.sin(t * 4 + x) * 1);
  x = Math.round(x); y = Math.round(y) + bob;
  if (kind === 0) {
    // 经验糖果：按价值换颜色
    const col = value >= 5 ? '#f8a8f8' : value >= 2 ? '#f8d058' : '#a8e0f8';
    rect(ctx, x - 2, y - 2, 5, 4, col);
    rect(ctx, x - 1, y - 1, 2, 1, '#ffffff');
    rect(ctx, x - 4, y - 1, 2, 2, col);
    rect(ctx, x + 3, y - 1, 2, 2, col);
    rect(ctx, x - 2, y + 2, 5, 1, 'rgba(0,0,0,.25)');
  } else if (kind === 1) {
    // 橙橙果
    pxCircle(ctx, x, y - 1, 3, '#3868d8');
    rect(ctx, x - 1, y - 2, 1, 1, '#a8c8f8');
    rect(ctx, x, y - 5, 1, 2, '#307830');
  } else {
    // 精灵球
    pxCircle(ctx, x, y - 2, 4, '#202020');
    pxCircle(ctx, x, y - 2, 3, '#f8f8f8');
    rect(ctx, x - 3, y - 5, 7, 3, '#e83030');
    rect(ctx, x - 3, y - 2, 7, 1, '#202020');
    rect(ctx, x - 1, y - 3, 2, 2, '#f8f8f8');
    if (Math.floor(t * 3) % 2) rect(ctx, x - 2, y - 5, 1, 1, '#ffffff');
  }
}

export function drawZone(ctx: CanvasRenderingContext2D, fx: string, x: number, y: number, r: number, life: number, t: number) {
  ctx.globalAlpha = Math.min(1, life * 3) * 0.75;
  if (fx === 'firespin') {
    for (let i = 0; i < 10; i++) {
      const a = t * 6 + (i / 10) * Math.PI * 2;
      const rr = r * (0.55 + 0.35 * Math.sin(t * 3 + i));
      pxCircle(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7 - 3, 2, i % 2 ? '#f86020' : '#f8c040');
    }
  } else {
    const col = fx === 'e_cloud' ? '#9050b0' : '#a858c8';
    ctx.globalAlpha *= 0.5;
    pxCircle(ctx, x, y, r, col);
    ctx.globalAlpha /= 0.5;
    for (let i = 0; i < 8; i++) {
      const a = t * 1.5 + i * 0.785;
      rect(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a * 1.3) * r * 0.5, 2, 2, '#d8a8f0');
    }
  }
  ctx.globalAlpha = 1;
}
