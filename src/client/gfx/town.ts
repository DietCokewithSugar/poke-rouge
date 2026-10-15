/**
 * 真新镇：火红/叶绿图块拼成的地图（tools/build-town.mjs 生成图片与碰撞数据）。
 * 世界坐标的原点是可走动区域的左上角，图片外面还有一圈装饰用的树林。
 */
import { TOWN_COLS, TOWN_DOORS, TOWN_MARGIN, TOWN_NPCS, TOWN_ROUTE, TOWN_ROWS, TOWN_SOLID } from './townMap';

export const CELL = 16;
export const TOWN_W = TOWN_COLS * CELL;
export const TOWN_H = TOWN_ROWS * CELL;
const MARGIN_PX = TOWN_MARGIN * CELL;

/** 镇上能去的地方；gym（道馆挑战）在道馆建筑里，也可以从快捷栏直接打开 */
export type PlaceId = 'home' | 'rival' | 'center' | 'battle' | 'gym' | 'lab' | 'route' | 'karp' | 'oak' | 'mom' | 'sign';

export interface Rect { x: number; y: number; w: number; h: number }

/** 走进去就能互动的区域 */
export interface Spot extends Rect { id: PlaceId; label: string; hint: string }

const cellRect = (c: { x: number; y: number }, pad = 3): Rect => ({ x: c.x * CELL - pad, y: c.y * CELL - pad, w: CELL + pad * 2, h: CELL + pad * 2 });
const npcSpot = (c: { x: number; y: number }): Rect => ({ x: c.x * CELL - 14, y: c.y * CELL - 12, w: CELL + 28, h: CELL + 26 });

/** 建筑：名字显示在门的上方 */
export const BUILDINGS: { id: PlaceId; name: string; door: { x: number; y: number } }[] = [
  { id: 'home', name: '我的家', door: TOWN_DOORS.home },
  { id: 'rival', name: '小茂的家', door: TOWN_DOORS.rival },
  { id: 'lab', name: '大木研究所', door: TOWN_DOORS.lab },
  { id: 'center', name: '宝可梦中心', door: TOWN_DOORS.center },
  { id: 'battle', name: '道馆 · 对战场', door: TOWN_DOORS.battle },
];

export const SPOTS: Spot[] = [
  { id: 'home', label: '我的家', hint: '换训练家、换伙伴', ...cellRect(TOWN_DOORS.home) },
  { id: 'rival', label: '小茂的家', hint: '劲敌在对战场等你', ...cellRect(TOWN_DOORS.rival) },
  { id: 'lab', label: '大木研究所', hint: '研究、图鉴与成就', ...cellRect(TOWN_DOORS.lab) },
  { id: 'center', label: '宝可梦中心', hint: '联机冒险', ...cellRect(TOWN_DOORS.center) },
  { id: 'battle', label: '道馆 · 对战场', hint: '挑战道馆、排位对战', ...cellRect(TOWN_DOORS.battle) },
  { id: 'sign', label: '真新镇', hint: '看告示牌', ...cellRect(TOWN_DOORS.sign) },
  { id: 'route', label: '1号道路', hint: '出发冒险', x: TOWN_ROUTE.x0 * CELL, y: TOWN_ROUTE.y0 * CELL, w: (TOWN_ROUTE.x1 - TOWN_ROUTE.x0 + 1) * CELL, h: (TOWN_ROUTE.y1 - TOWN_ROUTE.y0 + 1) * CELL + 8 },
  { id: 'oak', label: '大木博士', hint: '和博士说话', ...npcSpot(TOWN_NPCS.oak) },
  { id: 'karp', label: '鲤鱼王推销员', hint: '“要不要来一只鲤鱼王？”', ...npcSpot(TOWN_NPCS.karp) },
  { id: 'mom', label: '妈妈', hint: '和妈妈说话', ...npcSpot(TOWN_NPCS.mom) },
];

/** NPC 的脚底位置（像素） */
export const NPCS = Object.fromEntries(Object.entries(TOWN_NPCS).map(([k, c]) => [k, { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL - 1 }])) as Record<keyof typeof TOWN_NPCS, { x: number; y: number }>;

/** 出生点：家门口 */
export const SPAWN = { x: TOWN_DOORS.home.x * CELL + CELL / 2, y: TOWN_DOORS.home.y * CELL + CELL - 2 };

/** 出建筑时站的位置 */
export function doorPos(id: PlaceId): { x: number; y: number } | null {
  if (id === 'route') return { x: (TOWN_ROUTE.x0 + 1.5) * CELL, y: (TOWN_ROUTE.y1 + 2) * CELL };
  const d = (TOWN_DOORS as Record<string, { x: number; y: number }>)[id];
  return d ? { x: d.x * CELL + CELL / 2, y: d.y * CELL + CELL - 2 } : null;
}

const solid = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= TOWN_COLS || cy >= TOWN_ROWS || TOWN_SOLID[cy][cx] === '#';

/** 脚底 (x, y) 的碰撞盒有没有撞到东西 */
export function blocked(x: number, y: number): boolean {
  const x0 = Math.floor((x - 5) / CELL), x1 = Math.floor((x + 5) / CELL);
  const y0 = Math.floor((y - 4) / CELL), y1 = Math.floor(y / CELL);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (solid(cx, cy)) return true;
  return false;
}

export function spotAt(x: number, y: number): Spot | null {
  return SPOTS.find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) ?? null;
}

const layers = (() => {
  const load = (f: string) => { const i = new Image(); i.src = `${import.meta.env.BASE_URL}town/${f}`; return i; };
  return { bg: load('bg.png'), fg: load('fg.png') };
})();

/** 人物下面的图层 */
export function drawTownBg(ctx: CanvasRenderingContext2D) {
  if (layers.bg.complete && layers.bg.naturalWidth) ctx.drawImage(layers.bg, -MARGIN_PX, -MARGIN_PX);
}

/** 人物上面的图层：树冠、屋檐 */
export function drawTownFg(ctx: CanvasRenderingContext2D) {
  if (layers.fg.complete && layers.fg.naturalWidth) ctx.drawImage(layers.fg, -MARGIN_PX, -MARGIN_PX);
}

/** 镜头能看到的最大范围（含外围的树林） */
export const VIEW_BOUNDS = { x0: -MARGIN_PX, y0: -MARGIN_PX, x1: TOWN_W + MARGIN_PX, y1: TOWN_H + MARGIN_PX };
