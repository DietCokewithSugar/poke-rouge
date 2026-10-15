/**
 * 训练家形象：行走图来自火红/叶绿（16×32，9 帧：下、上、左站立 + 各两帧走路，右边由左边镜像），
 * 正面立绘来自 PokéRogue。素材由 tools/import-trainers.mjs 导入到 public/trainers/。
 */
import { trainerOf } from '../../shared/trainers';

export const TW = 16;
export const TH = 32;
/** 方向：0 下 1 左 2 上 3 右 */
export type TDir = 0 | 1 | 2 | 3;

const images = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement {
  let img = images.get(file);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}trainers/${file}`;
    images.set(file, img);
  }
  return img;
}

const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

/** 方向 → [站立, 走路 1, 走路 2] 在行走图里的帧号 */
const FRAMES: Record<TDir, [number, number, number]> = { 0: [0, 3, 4], 1: [2, 7, 8], 2: [1, 5, 6], 3: [2, 7, 8] };

function drawSheet(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, x: number, y: number, dir: TDir, frame: number, scale: number, alpha: number) {
  if (!ready(sheet)) return;
  const f = FRAMES[dir][frame % 3];
  const dw = TW * scale, dh = TH * scale;
  const dx = Math.round(x - dw / 2), dy = Math.round(y - dh + scale);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  if (dir === 3) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, f * TW, 0, TW, TH, 0, 0, dw, dh);
    ctx.restore();
  } else ctx.drawImage(sheet, f * TW, 0, TW, TH, dx, dy, dw, dh);
  ctx.globalAlpha = prev;
}

/** 以脚底 (x, y) 为锚点画训练家 */
export function drawTrainer(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, dir: TDir, frame: number, scale = 1, alpha = 1) {
  drawSheet(ctx, image(`${trainerOf(id).id}_ow.png`), x, y, dir, frame, scale, alpha);
}

/** 镇上的 NPC（大木博士、鲤鱼王推销员、妈妈） */
export function drawNpc(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, dir: TDir) {
  drawSheet(ctx, image(`npc_${key}_ow.png`), x, y, dir, 0, 1, 1);
}

/** 提前加载行走图（进镇之前调用，避免第一帧看不到人） */
export function preloadTrainers(ids: string[]) {
  for (const id of ids) image(`${trainerOf(id).id}_ow.png`);
  for (const k of ['oak', 'karp', 'mom']) image(`npc_${k}_ow.png`);
}

/** 走路动画的帧：站立 → 左脚 → 站立 → 右脚 */
export function walkFrame(t: number, moving: boolean) {
  if (!moving) return 0;
  const k = Math.floor(t * 7) % 4;
  return k === 1 ? 1 : k === 3 ? 2 : 0;
}

/** 屏幕角度 → 训练家方向 */
export function tdirOf(ang: number): TDir {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= (Math.PI * 7) / 4) return 3;
  if (a < (Math.PI * 3) / 4) return 0;
  if (a < (Math.PI * 5) / 4) return 1;
  return 2;
}

/** 立绘加载完成后再画到画布上（图片尺寸各不相同） */
function whenReady(img: HTMLImageElement, fn: () => void) {
  if (ready(img)) fn();
  else img.addEventListener('load', fn, { once: true });
}

/** 全身立绘（训练家卡片）：按 scale 放大，高度按 80 像素对齐，矮的立绘脚底对齐 */
export function trainerFull(id: string, scale = 1, cls = 'tfull'): HTMLCanvasElement {
  const img = image(`${trainerOf(id).id}.png`);
  const c = document.createElement('canvas');
  c.className = cls;
  const H = 80;
  c.width = 64 * scale;
  c.height = H * scale;
  c.style.setProperty('--pw', `${(64 * scale) / 16}rem`);
  c.style.setProperty('--ph', `${(H * scale) / 16}rem`);
  whenReady(img, () => {
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    const w = Math.min(64, img.naturalWidth), h = Math.min(H, img.naturalHeight);
    x.drawImage(img, 0, 0, w, h, Math.round((64 - w) / 2) * scale, (H - h) * scale, w * scale, h * scale);
  });
  return c;
}

/** 头像：立绘最上面的一块（头和肩膀），正方形，按 scale 放大 */
export function trainerPortrait(id: string, scale = 1, cls = 'tportrait'): HTMLCanvasElement {
  const img = image(`${trainerOf(id).id}.png`);
  const S = 36;
  const c = document.createElement('canvas');
  c.className = cls;
  c.width = S * scale;
  c.height = S * scale;
  c.style.setProperty('--pw', `${(S * scale) / 16}rem`);
  c.style.setProperty('--ph', `${(S * scale) / 16}rem`);
  whenReady(img, () => {
    // 找到头部（最上面 24 行有颜色的像素）的水平中心
    const t = document.createElement('canvas');
    t.width = img.naturalWidth;
    t.height = img.naturalHeight;
    const tx = t.getContext('2d')!;
    tx.drawImage(img, 0, 0);
    const d = tx.getImageData(0, 0, t.width, Math.min(24, t.height)).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { sum += (i / 4) % t.width; n++; }
    const cx = n ? sum / n : t.width / 2;
    const sx = Math.round(Math.max(0, Math.min(t.width - S, cx - S / 2)));
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.drawImage(img, sx, 0, Math.min(S, t.width), S, 0, 0, Math.min(S, t.width) * scale, S * scale);
  });
  return c;
}
