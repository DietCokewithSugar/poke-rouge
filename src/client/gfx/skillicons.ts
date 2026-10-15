/**
 * 技能图标：16×16 的像素徽章——按属性上色的底框 + 12×12 的招式图案（火苗、水滴、爪痕、闪电、"大"字……），
 * 图案用和技能特效相同的属性调色板，并自动描边，和道具图标是同一种画风。
 */
import { SKILLS } from '../../shared/skills';
import { PAL, grid, vis, type Grid } from './vfx';

type Gen = (P: Grid) => void;

const C = 5.5;

/** 有光照的圆 */
function ball(P: Grid, cx: number, cy: number, r: number, hi = true) {
  P.fill((x, y) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > r) return null;
    const lit = (-dx * 0.6 - dy * 0.8) / r;
    return hi && lit > 0.55 ? 'w' : lit > 0.12 ? 'l' : lit > -0.45 ? 'm' : 'd';
  });
}

function inPoly(pts: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 多边形：左上边缘高光，右下边缘暗 */
function poly(P: Grid, pts: number[][], fill = 'l') {
  P.fill((x, y) => (inPoly(pts, x + 0.5, y + 0.5) ? fill : null));
  const g = P.g.map((r) => r.slice());
  P.fill((x, y) => {
    if (g[y][x] !== fill) return null;
    if (!g[y - 1]?.[x] || !g[y][x - 1]) return 'w';
    if (!g[y + 1]?.[x] || !g[y][x + 1]) return 'm';
    return null;
  });
}

const GLYPHS: Record<string, Gen> = {
  impact(P) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8, L = k % 2 ? 3.2 : 5.2;
      P.line(C, C, C + Math.cos(a) * L, C + Math.sin(a) * L, 'l');
      P.set(C + Math.cos(a) * L, C + Math.sin(a) * L, 'm');
    }
    P.fill((x, y) => { const d = Math.hypot(x - C, y - C); return d < 1.3 ? 'w' : d < 2.3 ? 'l' : null; });
  },
  claw(P) {
    for (let i = 0; i < 3; i++) P.line(1.2 + i * 3, 10.4, 4.6 + i * 3, 1, 'w', 1, 'l');
  },
  blade(P) {
    P.fill((x, y) => {
      const u = (x - y) / Math.SQRT2, v = (x + y - 11) / Math.SQRT2;
      const curve = -0.09 * v * v + 1.2;
      const d = u - curve;
      if (Math.abs(v) > 6.6 || Math.abs(d) > 1.3 - Math.abs(v) / 9) return null;
      return d < -0.2 ? 'w' : 'l';
    });
  },
  dash(P) {
    poly(P, [[5, 1.5], [11, 6], [5, 10.5], [5, 7.5], [1.5, 7.5], [1.5, 4.5], [5, 4.5]]);
    for (const y of [1, 10]) P.line(0.5, y, 2.5, y, 'm');
  },
  star(P) {
    const pts: number[][] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.3 : 5.6;
      pts.push([6 + Math.cos(a) * r, 6.3 + Math.sin(a) * r]);
    }
    poly(P, pts);
    P.set(5, 5, 'w'); P.set(6, 5, 'w');
  },
  sound(P) {
    P.fill((x, y) => (x >= 1 && x <= 2 && y >= 4 && y <= 7 ? 'm' : null));
    P.fill((x, y) => (x >= 3 && x <= 4 && Math.abs(y - C) <= x - 0.5 ? 'l' : null));
    P.arc(4, C, 3.4, -0.85, 0.85, 'w');
    P.arc(4, C, 5.8, -0.75, 0.75, 'l');
  },
  beam(P) {
    // 从左下的能量球射向右上
    P.fill((x, y) => {
      const d = Math.abs(x + y - 11.5) / Math.SQRT2, t = (x - y) / Math.SQRT2;
      if (t < -3 || t > 7.6) return null;
      return d < 0.7 ? 'w' : d < 1.5 ? 'l' : d < 2.2 ? 'm' : null;
    });
    P.fill((x, y) => { const d = Math.hypot(x - 2.6, y - 8.9); return d < 1.3 ? 'w' : d < 2.6 ? 'l' : d < 3.2 ? 'm' : null; });
  },

  flame(P) {
    P.fill((x, y) => {
      const dx = x - C;
      let half: number;
      if (y >= 7) half = Math.sqrt(Math.max(0, 3.8 * 3.8 - (y - 7) ** 2));
      else half = 3.8 * Math.pow(Math.max(0, (y - 0.4) / 6.6), 1.25);
      const xx = dx + (y < 6 ? (6 - y) * 0.25 : 0);
      if (Math.abs(xx) > half) return null;
      const core = Math.hypot(dx * 1.2, y - 8);
      return core < 1.5 ? 'w' : core < 2.8 ? 'l' : 'm';
    });
    P.fill((x, y) => (Math.hypot(x - 2, (y - 4) * 0.7) < 1.1 ? 'm' : null));
  },
  fang(P) {
    for (let x = 1; x <= 10; x++) { P.set(x, 1, 'm'); P.set(x, 10, 'm'); }
    for (const tx of [2, 5, 8]) { P.set(tx, 2, 'w'); P.set(tx + 1, 2, 'l'); P.set(tx, 3, 'w'); P.set(tx + 1, 3, 'l'); P.set(tx, 4, 'w'); }
    for (const tx of [3, 6, 9]) { P.set(tx, 9, 'l'); P.set(tx - 1, 9, 'w'); P.set(tx, 8, 'l'); P.set(tx - 1, 8, 'w'); P.set(tx - 1, 7, 'w'); }
  },
  swirl(P) {
    for (let t = 0; t < Math.PI * 3.2; t += 0.05) {
      const r = 0.6 + t * 0.48;
      P.set(C + Math.cos(t) * r, C + Math.sin(t) * r, t < Math.PI * 1.2 ? 'w' : t < Math.PI * 2.3 ? 'l' : 'm');
    }
  },
  blast(P) {
    P.line(1.5, 4, 9.5, 4, 'w', 1, 'l');
    P.line(5.5, 0.8, 5.5, 5.5, 'w', 1, 'l');
    P.line(5, 5.5, 1.5, 10, 'w', 1, 'l');
    P.line(6, 5.5, 9.5, 10, 'w', 1, 'l');
  },
  drop(P) {
    P.fill((x, y) => {
      const dx = x - C;
      const half = y >= 7 ? Math.sqrt(Math.max(0, 3.7 * 3.7 - (y - 7) ** 2)) : 3.7 * Math.pow(Math.max(0, (y - 0.6) / 6.4), 1.3);
      if (Math.abs(dx) > half || y > 10.6) return null;
      const lit = -dx * 0.7 - (y - 7) * 0.5;
      return lit > 1.6 ? 'l' : lit > -1.6 ? 'm' : 'd';
    });
    P.set(4, 6, 'w'); P.set(4, 7, 'w'); P.set(3, 8, 'w');
  },
  shell(P) {
    P.fill((x, y) => {
      const e = Math.hypot((x - C) / 5.2, (y - 8) / 6);
      if (y > 9 || e > 1) return null;
      return y >= 8.5 ? 'd' : 'm';
    });
    P.fill((x, y) => (P.get(x, y) === 'm' && (x === 3 || x === 8 || y === 5) && y > 2 ? 'd' : null));
    P.fill((x, y) => (P.get(x, y) === 'm' && x >= 4 && x <= 7 && y >= 2 && y <= 4 ? 'l' : null));
    P.set(4, 2, 'w'); P.set(5, 2, 'w');
  },
  bubbles(P) {
    for (const [cx, cy, r] of [[4, 7.2, 3.3], [8.6, 3.2, 2.3], [9, 8.8, 1.6]]) {
      P.fill((x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r ? (d > r - 1 ? 'l' : 'L') : null; });
      P.set(cx - r * 0.45, cy - r * 0.45, 'w');
    }
  },
  ripple(P) {
    P.fill((x, y) => {
      const d = Math.hypot(x - C, y - C);
      if (Math.abs(d - 5) < 0.6) return 'm';
      if (Math.abs(d - 3) < 0.6) return 'l';
      return d < 1.2 ? 'w' : null;
    });
  },
  tail(P) {
    P.fill((x, y) => {
      const dx = x - 8, dy = y - 8, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (a > -Math.PI * 0.08 || a < -Math.PI * 0.98) return null;
      const t = (a + Math.PI * 0.98) / (Math.PI * 0.9);
      const w = 1 + t * 1.7;
      if (Math.abs(d - 5.4) > w) return null;
      return d < 5.4 - w * 0.3 ? 'l' : 'm';
    });
    P.set(3, 7, 'w'); P.set(4, 5, 'w');
  },
  wave(P) {
    // 卷起的浪头 + 下面的海水
    P.fill((x, y) => {
      const top = 4.2 + Math.sin(x * 0.75 + 0.6) * 2.2;
      if (y < top || y > 10.6) return null;
      const d = y - top;
      const deep = 8.2 + Math.sin(x * 1.1 + 2) * 0.8;
      return d < 1 ? 'w' : d < 2.2 ? 'l' : Math.abs(y - deep) < 0.6 ? 'd' : 'm';
    });
    P.set(9, 1, 'w'); P.set(10, 2, 'l'); P.set(2, 2, 'l');
  },


  vine(P) {
    let px = 1.5, py = 10.5;
    for (let t = 0; t <= 1; t += 0.04) {
      const x = 1.5 + t * 8.5 + Math.sin(t * 9) * 1.1, y = 10.5 - t * 9.2 + Math.cos(t * 9) * 0.6;
      P.line(px, py, x, y, 'm', 1, 'd');
      px = x; py = y;
    }
    for (const [cx, cy] of [[3.5, 5.5], [8, 8]]) P.fill((x, y) => (Math.hypot((x - cx) / 1.8, (y - cy) / 1.1) <= 1 ? 'l' : null));
    P.set(3, 5, 'w');
  },
  seed(P) {
    P.fill((x, y) => {
      const dx = x - C, dy = y - 7.2, e = Math.hypot(dx / 3.2, dy / 3.6);
      if (e > 1) return null;
      const lit = (-dx * 0.6 - dy * 0.8) / 3.4;
      return lit > 0.5 ? 'w' : lit > 0 ? 'l' : lit > -0.5 ? 'm' : 'd';
    });
    P.line(5.5, 3.6, 5.5, 1.5, 'm');
    P.set(6.5, 1.5, 'l'); P.set(7.5, 1.5, 'l'); P.set(7.5, 0.5, 'l'); P.set(4.5, 2.5, 'l');
  },
  leaf(P) {
    P.fill((x, y) => {
      const dx = x - C, dy = y - C;
      const u = (dx - dy) / Math.SQRT2, v = (dx + dy) / Math.SQRT2;
      if (Math.abs(u) / 5.6 + (v / 2.6) ** 2 > 1) return null;
      return Math.abs(v) < 0.5 ? 'd' : v < 0 ? 'l' : 'm';
    });
    P.set(1, 10, 'd'); P.set(2, 9, 'd');
    P.set(5, 3, 'w');
  },
  bomb(P) {
    ball(P, 5, 7, 4);
    P.line(7.6, 3.6, 9.4, 1.6, 'd');
    P.set(10, 1, 'w'); P.set(10.5, 0.5, 'l'); P.set(11, 2, 'l');
  },
  orb(P) {
    ball(P, C, C, 4.2);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      P.set(C + Math.cos(a) * 5.4, C + Math.sin(a) * 5.4, 'l');
    }
  },
  shadow(P) {
    P.fill((x, y) => { const d = Math.hypot(x - C, y - 6); return d < 1.6 ? 'l' : d < 2.9 ? 'm' : d < 4.3 ? 'd' : null; });
    for (const [x, y] of [[1, 3], [10, 2], [11, 8], [2, 10], [6, 0.5], [9, 10.5]]) P.set(x, y, 'm');
    P.set(4, 4, 'w');
  },
  petal(P) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      const cx = C + Math.cos(a) * 3, cy = C + Math.sin(a) * 3;
      P.fill((x, y) => (Math.hypot(x - cx, y - cy) <= 2.3 ? (y < cy ? 'l' : 'm') : null));
    }
    P.fill((x, y) => (Math.hypot(x - C, y - C) < 1.6 ? 'w' : null));
  },
  sun(P) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      P.line(C + Math.cos(a) * 3.9, C + Math.sin(a) * 3.9, C + Math.cos(a) * 5.4, C + Math.sin(a) * 5.4, 'm');
    }
    ball(P, C, C, 2.9);
  },
  cross(P) {
    P.fill((x, y) => ((x >= 4 && x <= 7 && y >= 1 && y <= 10) || (y >= 4 && y <= 7 && x >= 1 && x <= 10) ? 'l' : null));
    P.fill((x, y) => (P.get(x, y) === 'l' && (!P.get(x - 1, y) || !P.get(x, y - 1)) ? 'w' : P.get(x, y) === 'l' && (!P.get(x + 1, y) || !P.get(x, y + 1)) ? 'm' : null));
  },
  heart(P) {
    ['..###..###..', '.##########.', '.##########.', '.##########.', '..########..', '...######...', '....####....', '.....##.....']
      .forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') P.set(x, y + 2, x + y < 7 ? 'l' : x + y < 12 ? 'l' : 'm'); }));
    P.fill((x, y) => (P.get(x, y) === 'l' && x > 6 && y > 4 ? 'm' : null));
    P.set(2, 3, 'w'); P.set(3, 3, 'w'); P.set(2, 4, 'w');
  },

  bolt(P) {
    poly(P, [[7.5, 0.3], [1.8, 6.6], [5.4, 6.6], [3.4, 11.7], [10.2, 4.6], [6.6, 4.6], [9.6, 0.3]]);
  },
  zap(P) {
    const pts = [[0.5, 6], [3, 2.5], [5, 7.5], [7.5, 3], [9, 8], [11, 4.5]];
    for (let i = 0; i < pts.length - 1; i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'w', 1, 'l');
  },
  nova(P) {
    P.fill((x, y) => { const d = Math.hypot(x - C, y - C); return Math.abs(d - 3.6) < 0.7 ? 'l' : d < 1.4 ? 'w' : null; });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      P.line(C + Math.cos(a) * 4.6, C + Math.sin(a) * 4.6, C + Math.cos(a) * 5.8, C + Math.sin(a) * 5.8, 'w');
    }
  },
  storm(P) {
    const blobs = [[3.5, 3.8, 2.6], [6.8, 2.8, 3], [9, 4.2, 2.1]];
    P.fill((x, y) => {
      if (y > 5.5) return null;
      for (const [cx, cy, r] of blobs) if (Math.hypot(x - cx, y - cy) <= r) return y < 3 ? 'w' : 'L';
      return null;
    });
    poly(P, [[6.5, 5.5], [3.5, 8.8], [5.6, 8.8], [4.4, 11.7], [8.4, 7.6], [6.4, 7.6], [8, 5.5]]);
  },
  chevrons(P) {
    for (const ox of [0, 4.6]) {
      P.line(1.2 + ox, 1.2, 5 + ox, C, 'w', 1, 'l');
      P.line(5 + ox, C, 1.2 + ox, 9.8, 'w', 1, 'l');
    }
  },
  shield(P) {
    P.fill((x, y) => {
      if (y < 1 || y > 11) return null;
      const half = y <= 5.5 ? 4.6 : 4.6 * Math.sqrt(Math.max(0, 1 - ((y - 5.5) / 5.6) ** 2));
      return Math.abs(x - C) <= half ? 'm' : null;
    });
    P.fill((x, y) => (P.get(x, y) === 'm' && (!P.get(x - 1, y) || !P.get(x, y - 1)) ? 'l' : null));
    P.line(5.5, 3, 5.5, 8.5, 'w');
    P.line(3.5, 4.5, 7.5, 4.5, 'w');
  },
  eye(P) {
    P.fill((x, y) => {
      const a = Math.hypot(x - C, y - 10.5), b = Math.hypot(x - C, y - 0.5);
      return a < 7 && b < 7 ? 'L' : null;
    });
    P.fill((x, y) => { const d = Math.hypot(x - C, y - C); return d < 1 ? 'd' : d < 2.6 ? 'm' : null; });
    P.set(4.5, 4.2, 'w');
  },
  spiral(P) {
    for (let t = 0; t < Math.PI * 3.6; t += 0.05) {
      const r = 0.3 + t * 0.44;
      P.set(C + Math.cos(-t) * r, C + Math.sin(-t) * r, t < Math.PI * 1.4 ? 'w' : 'l');
    }
    P.set(C, C, 'w');
  },
  meteor(P) {
    // 右上的陨石拖着尾巴落向左下
    P.fill((x, y) => {
      const d = Math.abs(x + y - 11.4) / Math.SQRT2, t = (x - y) / Math.SQRT2;
      if (t > 3 || t < -7) return null;
      const w = 0.4 + (t + 7) * 0.2;
      return d < w * 0.45 ? 'l' : d < w ? 'm' : null;
    });
    ball(P, 7.8, 3.6, 3.1);
  },

  snowflake(P) {
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 3;
      const dx = Math.cos(a) * 5.2, dy = Math.sin(a) * 5.2;
      P.line(C - dx, C - dy, C + dx, C + dy, 'l');
      for (const s of [-1, 1]) {
        const ex = C + s * dx * 0.7, ey = C + s * dy * 0.7;
        for (const b of [-0.7, 0.7]) P.set(ex + Math.cos(a + b + (s < 0 ? Math.PI : 0)) * -1.4, ey + Math.sin(a + b + (s < 0 ? Math.PI : 0)) * -1.4, 'm');
      }
    }
    P.fill((x, y) => (Math.hypot(x - C, y - C) < 1.2 ? 'w' : null));
  },
  fist(P) {
    P.fill((x, y) => (x >= 2 && x <= 9 && y >= 2 && y <= 9 && !((x === 2 || x === 9) && (y === 2 || y === 9)) ? 'l' : null));
    for (const x of [4, 6, 8]) for (let y = 2; y <= 4; y++) P.set(x, y, 'd');
    P.fill((x, y) => (x >= 1 && x <= 3 && y >= 6 && y <= 8 ? 'm' : null));
    for (let x = 3; x <= 9; x++) P.set(x, 9, 'm');
    P.set(3, 3, 'w'); P.set(5, 3, 'w'); P.set(7, 3, 'w');
    P.fill((x, y) => (x >= 4 && x <= 7 && y >= 10 && y <= 11 ? 'm' : null));
  },
  powder(P) {
    for (const [x, y] of [[2, 2], [6, 1], [9, 3], [4, 5], [8, 6], [1, 7], [5, 8.5], [9, 9.5], [2.5, 10.5]]) {
      P.set(x, y, 'w'); P.set(x + 1, y, 'l'); P.set(x, y + 1, 'l'); P.set(x + 1, y + 1, 'm');
    }
  },
  blob(P) {
    P.fill((x, y) => {
      const dx = x - C, dy = y - 4.8;
      const R = 4.1 + Math.sin(Math.atan2(dy, dx) * 3) * 0.5;
      const d = Math.hypot(dx, dy);
      if (d > R) return null;
      const lit = (-dx * 0.6 - dy * 0.8) / R;
      return lit > 0.4 ? 'l' : lit > -0.35 ? 'm' : 'd';
    });
    P.set(4, 9, 'm'); P.set(4, 10, 'm'); P.set(7, 9, 'm'); P.set(4, 3, 'w'); P.set(3, 3, 'w');
  },
  rocks(P) {
    const rock = (cx: number, cy: number, r: number) => P.fill((x, y) => {
      const dx = x - cx, dy = y - cy;
      if (Math.abs(dx) + Math.abs(dy) * 0.8 > r * 1.15 || Math.hypot(dx, dy) > r) return null;
      const lit = (-dx * 0.6 - dy * 0.8) / r;
      return lit > 0.3 ? 'l' : lit > -0.35 ? 'm' : 'd';
    });
    rock(7, 2.8, 2.4); rock(3.6, 7.4, 3.4); rock(8.8, 8.6, 2.5);
    P.set(2.5, 5.5, 'w'); P.set(6, 1, 'w');
  },
  quake(P) {
    P.fill((_x, y) => (y >= 6 && y <= 10.5 ? (y < 7 ? 'l' : 'm') : null));
    for (const [x, y] of [[5, 6], [5, 7], [6, 8], [5, 9], [6, 10], [2, 7], [2, 8], [9, 7], [10, 8], [9, 9]]) P.set(x, y, 'd');
    for (const [x, y] of [[2, 3], [5.5, 1.5], [9, 3.5]]) { P.set(x, y, 'l'); P.set(x + 1, y, 'm'); P.set(x, y + 1, 'm'); }
  },
  breath(P) {
    P.fill((x, y) => {
      if (x < 1 || x > 11) return null;
      const half = 0.6 + (x - 1) * 0.42 + Math.sin(x * 1.3) * 0.4;
      const d = Math.abs(y - C);
      if (d > half) return null;
      return d < half * 0.35 && x > 4 ? 'w' : d < half * 0.7 ? 'l' : 'm';
    });
  },
  moon(P) {
    P.fill((x, y) => {
      const d1 = Math.hypot(x + 0.5 - 6, y + 0.5 - 6), d2 = Math.hypot(x + 0.5 - 8.4, y + 0.5 - 4.4);
      if (d1 > 4.9 || d2 < 4.1) return null;
      return d1 < 2.2 ? 'w' : x + y < 9 ? 'l' : 'm';
    });
  },
  spikes(P) {
    for (const [cx, h] of [[2.5, 6], [6, 9.5], [9.5, 7]]) {
      P.fill((x, y) => {
        const top = 11 - h;
        if (y < top || y > 10.5) return null;
        const half = ((y - top) / h) * 1.9 + 0.2;
        return Math.abs(x - cx) <= half ? (x < cx ? 'l' : 'm') : null;
      });
    }
    P.fill((_x, y) => (y >= 10 ? 'd' : null));
  },
};

/** 技能 → [图案, 调色板（默认取技能特效的调色板）] */
const SKILL_GLYPH: Record<string, [string, string?]> = {
  tackle: ['impact'], scratch: ['claw'], quick_attack: ['dash'], swift: ['star'], slash: ['blade'], hyper_voice: ['sound'], hyper_beam: ['beam'],
  ember: ['flame'], fire_fang: ['fang'], fire_spin: ['swirl'], flamethrower: ['breath'], fire_blast: ['blast'], flare_blitz: ['impact', 'hyper'],
  water_gun: ['drop'], withdraw: ['shell'], bubble_beam: ['bubbles'], water_pulse: ['ripple'], aqua_tail: ['tail'], surf: ['wave'], hydro_pump: ['beam'],
  vine_whip: ['vine'], leech_seed: ['seed'], razor_leaf: ['leaf'], seed_bomb: ['bomb'], energy_ball: ['orb'], petal_dance: ['petal'],
  synthesis: ['sun', 'solar'], aromatherapy: ['heart', 'heal'], solar_beam: ['beam', 'solar'], frenzy_plant: ['spikes'],
  thunder_shock: ['bolt'], electro_ball: ['orb'], spark: ['impact'], thunderbolt: ['zap'], discharge: ['nova'], thunder: ['storm'], volt_tackle: ['dash'],
  agility: ['chevrons', 'gold'], confusion: ['ripple'], barrier: ['shield'], psybeam: ['beam'], psycho_cut: ['blade'], psychic: ['spiral'],
  recover: ['cross', 'heal'], shadow_ball: ['shadow'], aura_sphere: ['orb', 'aura'], future_sight: ['eye'], psystrike: ['nova'],
  dragon_breath: ['breath'], dragon_claw: ['claw'], draco_meteor: ['meteor'], air_slash: ['blade'], metal_claw: ['claw'], iron_tail: ['tail'],
  ice_beam: ['snowflake'], bite: ['fang'], dark_pulse: ['ripple'], brick_break: ['fist'], poison_powder: ['powder'], sludge_bomb: ['blob'],
  rock_slide: ['rocks'], earthquake: ['quake'],
  headbutt: ['impact'], hyper_fang: ['fang'], pay_day: ['orb', 'gold'], sing: ['sound', 'fairy'], splash: ['drop', 'water'], tri_attack: ['star', 'hyper'],
  body_slam: ['impact'], double_edge: ['dash'], explosion: ['blast', 'hyper'], fire_punch: ['fist'], heat_wave: ['wave'], whirlpool: ['swirl'],
  crabhammer: ['claw'], waterfall: ['wave'], scald: ['drop'], mega_drain: ['seed', 'heal'], stun_spore: ['powder', 'electric'], giga_drain: ['leaf', 'heal'],
  leaf_blade: ['blade'], power_whip: ['vine'], thunder_punch: ['fist'], zap_cannon: ['orb'], powder_snow: ['snowflake'], ice_shard: ['spikes'],
  aurora_beam: ['beam'], ice_punch: ['fist'], blizzard: ['storm'], karate_chop: ['fist'], cross_chop: ['blade'], close_combat: ['nova'],
  high_jump_kick: ['dash'], focus_blast: ['orb'], poison_sting: ['spikes'], acid: ['blob'], poison_jab: ['fist'], sludge_wave: ['wave'], gunk_shot: ['bomb'],
  mud_slap: ['blob'], bonemerang: ['tail'], bulldoze: ['quake'], dig: ['quake'], earth_power: ['nova'], gust: ['swirl'], peck: ['dash'],
  wing_attack: ['claw'], aerial_ace: ['blade'], drill_peck: ['spiral'], hurricane: ['storm'], brave_bird: ['dash'], hypnosis: ['spiral'],
  bug_bite: ['fang'], struggle_bug: ['bubbles'], pin_missile: ['spikes'], signal_beam: ['beam'], x_scissor: ['claw'], bug_buzz: ['sound'], megahorn: ['impact'],
  rock_throw: ['rocks'], rock_tomb: ['rocks'], ancient_power: ['meteor'], power_gem: ['star'], stone_edge: ['spikes'], lick: ['fang'],
  night_shade: ['shadow'], shadow_claw: ['claw'], hex: ['eye'], shadow_force: ['shadow'], twister: ['swirl'], dragon_rage: ['breath'],
  dragon_pulse: ['ripple'], outrage: ['blast'], dragon_dance: ['chevrons'], night_slash: ['blade'], crunch: ['fang'], steel_wing: ['blade'],
  iron_defense: ['shield'], flash_cannon: ['beam'], meteor_mash: ['meteor'], fairy_wind: ['swirl'], disarming_voice: ['sound'], draining_kiss: ['heart'],
  dazzling_gleam: ['nova'], play_rough: ['impact'], moonblast: ['moon'], moonlight: ['moon', 'fairy'], spike_cannon: ['spikes'], egg_bomb: ['bomb'],
  vacuum_wave: ['ripple'], seismic_toss: ['quake'], pursuit: ['dash'], aqua_jet: ['drop'], bullet_punch: ['fist'], gyro_ball: ['orb'],
  dragon_darts: ['dash'], flame_wheel: ['swirl'], wild_charge: ['bolt'],
};

/** 结算里的「持续伤害」「反伤等其它」 */
const PSEUDO: Record<string, [string, string]> = { _dot: ['blob', 'poison'], _other: ['impact', 'steel'] };

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const glyphCache = new Map<string, Grid>();
function glyph(name: string): Grid {
  let g = glyphCache.get(name);
  if (!g) {
    g = grid(12, 12);
    (GLYPHS[name] ?? GLYPHS.orb)(g);
    g.outline();
    glyphCache.set(name, g);
  }
  return g;
}

const urlCache = new Map<string, string>();

/** 技能图标的 dataURL（16×16 像素，按 scale 放大） */
export function skillIconUrl(id: string, scale = 3): string {
  const key = `${id}@${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const s = SKILLS[id];
  const [shape, palName] = SKILL_GLYPH[id] ?? PSEUDO[id] ?? ['orb'];
  const tp = PAL[s?.type ?? PSEUDO[id]?.[1] ?? 'normal'] ?? PAL.normal;
  const gp = PAL[palName ?? vis(s?.fx ?? '').pal] ?? tp;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16 * scale;
  const c = cv.getContext('2d')!;
  const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x * scale, y * scale, scale, scale); };
  // 底框：圆角、上亮下暗的属性色，内侧一圈斜面高光
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const cx = Math.min(x, 15 - x), cy = Math.min(y, 15 - y);
      if (cx + cy < 2) continue;
      const edge = cx === 0 || cy === 0 || cx + cy === 2;
      if (edge) { px(x, y, '#101018'); continue; }
      let col = mix(tp[1], tp[0], y / 15);
      if (x === 1 || y === 1 || (cx + cy === 3 && (x < 8 || y < 8))) col = mix(tp[2], tp[1], 0.35);
      else if (x === 14 || y === 14) col = mix(tp[0], '#000000', 0.35);
      px(x, y, col);
    }
  }
  const g = glyph(shape);
  const IDX: Record<string, number> = { d: 1, m: 2, l: 3, w: 4 };
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const ch = g.g[y][x];
      if (!ch) continue;
      px(x + 2, y + 2, ch === 'o' ? '#181020' : ch === 'L' ? rgba(gp[3], 0.55) : gp[IDX[ch]] ?? gp[2]);
    }
  }
  const url = cv.toDataURL();
  urlCache.set(key, url);
  return url;
}

export function skillIconImg(id: string, scale = 3): HTMLImageElement {
  const img = new Image();
  img.src = skillIconUrl(id, scale);
  img.className = 'sk-img';
  img.draggable = false;
  img.alt = SKILLS[id]?.name ?? '';
  return img;
}

export const SKILL_GLYPH_IDS = Object.keys(SKILL_GLYPH);
