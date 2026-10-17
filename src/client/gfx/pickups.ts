/**
 * 地图道具的像素图：橙橙果（蓝色圆果 + 绿叶）、三种增幅种子（同一个种子形状，按颜色区分）、爆炸之种（裂开的黑红种子，顶上冒火星）
 * 和星桃果（粉色的五角星，特性「收获」生成）。
 * 字符图 + 调色板，和 icons.ts 的道具图标同一种画法：. 透明  k 描边  w 高光  1/2/3 深 → 浅  g/G 叶子  r/y 裂缝和火星
 */
import { BLAST_COLOR, type BoostId } from '../../shared/pickups';

const BERRY = [
  '.....kk..',
  '....gGGk.',
  '..kkgkk..',
  '.k3w333k.',
  'k3w33332k',
  'k3333322k',
  'k3333222k',
  'k3322221k',
  '.k22211k.',
  '..kkkkk..',
];

const SEED = [
  '...k...',
  '..k3k..',
  '.k3w2k.',
  '.k332k.',
  'k33322k',
  'k3w221k',
  'k32211k',
  '.k211k.',
  '..kkk..',
];

const BLAST = [
  '....y....',
  '...yry...',
  '....k....',
  '...k3k...',
  '..k3w2k..',
  '..k3r2k..',
  '.k33r22k.',
  '.k3rr21k.',
  'k3r2r221k',
  'k32r2r21k',
  'k322rr11k',
  '.k2r211k.',
  '..kkkkk..',
];

/** 星桃果（特性「收获」生成）：粉色的五角星形果子 */
const STARF = [
  '....gG...',
  '....k....',
  '...k3k...',
  'kkk3w3kkk',
  'k3w33322k',
  '.k33322k.',
  '..k3222k.',
  '.k32k21k.',
  '.k2k.k1k.',
  '.kk...kk.',
];

interface Art { rows: string[]; pal: [string, string, string]; glow: string }

/** 线上的种类编号（shared/pickups.ts 的 PICKUP_KINDS）→ 像素图 */
const ART: Record<number, Art> = {
  1: { rows: BERRY, pal: ['#1840a0', '#3868d8', '#98c0ff'], glow: '#88c8ff' },
  3: { rows: SEED, pal: ['#a01810', '#e84828', '#ffa078'], glow: '#ff8a5a' },
  4: { rows: SEED, pal: ['#5a2a9a', '#9a5ae0', '#e0c0ff'], glow: '#d0a8ff' },
  5: { rows: SEED, pal: ['#9a7000', '#e8c020', '#fff4a0'], glow: '#ffe45a' },
  6: { rows: BLAST, pal: ['#3a0e0c', '#62201a', '#94402c'], glow: BLAST_COLOR },
  7: { rows: STARF, pal: ['#a02868', '#e858a8', '#ffc0e4'], glow: '#ff9ad8' },
};

export const BOOST_KIND: Record<BoostId, number> = { crit: 3, dodge: 4, speed: 5 };
export const BLAST_KIND = 6;

export const hasArt = (kind: number) => kind in ART;
export const artGlow = (kind: number) => ART[kind]?.glow ?? '#ffffff';

const cache = new Map<string, HTMLCanvasElement>();

/** scale 倍的像素图（画布） */
export function itemSprite(kind: number, scale = 1): HTMLCanvasElement {
  const key = `${kind}@${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = ART[kind] ?? ART[1];
  const col: Record<string, string> = { k: '#181020', w: '#ffffff', g: '#2a7a1c', G: '#6cd040', r: '#ff6a1f', y: '#ffe060', '1': a.pal[0], '2': a.pal[1], '3': a.pal[2] };
  const c = document.createElement('canvas');
  c.width = a.rows[0].length * scale;
  c.height = a.rows.length * scale;
  const x = c.getContext('2d')!;
  a.rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === '.') continue;
      x.fillStyle = col[ch] ?? '#ff00ff';
      x.fillRect(rx * scale, ry * scale, scale, scale);
    }
  });
  cache.set(key, c);
  return c;
}

const urls = new Map<string, string>();

/** 界面上用的图标（HUD 的增幅倒计时） */
export function itemIconUrl(kind: number, scale = 3): string {
  const key = `${kind}@${scale}`;
  let u = urls.get(key);
  if (!u) { u = itemSprite(kind, scale).toDataURL(); urls.set(key, u); }
  return u;
}
