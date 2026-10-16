/**
 * 自动走位（冒险的 AI 辅助战斗）：躲开近身的敌人、弹幕与即将落下的攻击，保持在技能射程边缘绕圈，
 * 安全时去捡糖果和增幅种子、救倒下的队友，血少时去吃橙橙果，远离墙角；
 * 有利的局部属性场地会靠过去站着打，不利的（灼伤、减速、招式受损）会绕开。
 * 只负责走位：技能本来就是自动释放的，商店、升级与进化仍由玩家自己决定。
 */
import { boostOfSeed } from '../pickups';
import { SKILLS } from '../skills';
import { TERRAINS, inTerrain, terrainValue, type Terrain } from '../terrain';
import type { SimPlayer } from './entities';
import { REVIVE_RADIUS, type GameSim } from './game';

/** 这一波的场地对这只宝可梦的好坏（波次中技能和形态不会变，按场地缓存） */
const valueCache = new WeakMap<SimPlayer, { t: Terrain; v: number }>();
function valueOf(T: Terrain, p: SimPlayer) {
  const c = valueCache.get(p);
  if (c && c.t === T) return c.v;
  const v = terrainValue(T.kind, p.tmask, p.skills.map((s) => SKILLS[s.id].type));
  valueCache.set(p, { t: T, v });
  return v;
}

function preferredRange(p: SimPlayer) {
  let r = 999;
  for (const s of p.skills) {
    const d = SKILLS[s.id];
    if (d.cat === 'status') continue;
    r = Math.min(r, d.range * p.d.rangeMult);
  }
  return r === 999 ? 120 : r;
}

/** 算出这一帧的移动方向（没有想去的地方时返回 null） */
export function autopilotDir(sim: GameSim, p: SimPlayer): { x: number; y: number } | null {
  const want = Math.max(26, preferredRange(p) * 0.75);
  // 近战型的宝可梦要贴上去打：只躲开快要碰到的敌人
  const flee = Math.min(70, want + 12);
  let fx = 0, fy = 0;
  let nearest = Infinity, nx = 0, ny = 0;
  for (const e of sim.enemies) {
    if (e.dead || e.hidden) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearest) { nearest = d; nx = dx / d; ny = dy / d; }
    const danger = e.def.rank === 'minion' ? 1 : 2.5;
    const r = e.def.rank === 'minion' ? flee : Math.max(flee, 46);
    if (d < r) { fx += (dx / d) * danger * (r - d) / r * 2.2; fy += (dy / d) * danger * (r - d) / r * 2.2; }
    if (e.def.ai === 'bomber' && e.ai.state === 1 && d < (e.def.blast?.radius ?? 30) + 12) { fx += (dx / d) * 4; fy += (dy / d) * 4; }
  }
  for (const st of sim.strikes) {
    if (!st.enemy) continue;
    const dx = p.x - st.x, dy = p.y - st.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < st.r + 14) { fx += (dx / d) * 4; fy += (dy / d) * 4; }
  }
  for (const z of sim.zones) {
    if (z.owner >= 0) continue;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < z.r + 10) { fx += (dx / d) * 2; fy += (dy / d) * 2; }
  }
  for (const pr of sim.projs) {
    if (pr.owner >= 0) continue;
    const dx = p.x - pr.x, dy = p.y - pr.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 50) { fx += (dx / d) * 1.8 * (50 - d) / 50; fy += (dy / d) * 1.8 * (50 - d) / 50; }
  }
  const safe = nearest > want + 40;
  // 安全时的目标：倒下的队友 > 血少时的橙橙果 > 增幅种子 > 附近的糖果和道具球
  let goal: { x: number; y: number; w: number } | null = null;
  for (const q of sim.players) {
    if (q === p || !q.down || !q.alive || !sim.isAlly(p, q)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d > REVIVE_RADIUS * 0.5 && (safe || d < 90) && (!goal || d < Math.hypot(goal.x - p.x, goal.y - p.y))) goal = { x: q.x, y: q.y, w: 1.6 };
  }
  if (!goal && (safe || nearest > flee + 10)) {
    const low = p.hp < p.d.maxHp * 0.5;
    let bd = (safe ? 160 : 70) ** 2;
    for (const pk of sim.pickups) {
      if (pk.kind === 'berry' && !low) continue;
      // 同一种增幅还剩很久时不急着去踩
      const b = boostOfSeed(pk.kind);
      if (b && p.boosts[b] > 2) continue;
      const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
      const k = pk.kind === 'berry' ? 0.3 : b ? 0.5 : 1;
      if (d * k < bd) { bd = d * k; goal = { x: pk.x, y: pk.y, w: 1.2 }; }
    }
  }
  if (goal) {
    const d = Math.hypot(goal.x - p.x, goal.y - p.y) || 1;
    fx += ((goal.x - p.x) / d) * goal.w;
    fy += ((goal.y - p.y) / d) * goal.w;
  } else if (nearest < Infinity) {
    if (nearest > want + Math.min(20, want * 0.3)) { fx -= nx * 0.6; fy -= ny * 0.6; }
    // 绕圈走
    fx += -ny * 0.5; fy += nx * 0.5;
  }
  // 局部属性场地
  const T = sim.terrain;
  let tv = 0, inside = false;
  if (T) tv = valueOf(T, p);
  if (T && (tv < -0.2 || tv > 0.2)) {
    inside = inTerrain(T, p.x, p.y);
    const dx = T.cx - p.x, dy = T.cy - p.y, d = Math.hypot(dx, dy) || 1;
    if (tv < -0.2 && inside) { fx -= (dx / d) * 1.6; fy -= (dy / d) * 1.6; }
    else if (tv > 0.2 && !goal && d < 320) {
      // 共鸣晶石要站进中心的能量圈才有加成
      const hold = TERRAINS[T.kind].circle ? T.cr * 0.6 : inside ? 40 : 0;
      if (d > hold) { const w = (inside ? 0.35 : 0.8) * Math.min(1, tv); fx += (dx / d) * w; fy += (dy / d) * w; }
    }
  }
  const wall = 80;
  if (p.x < wall) fx += ((wall - p.x) / wall) * 3;
  if (p.x > sim.w - wall) fx -= ((p.x - (sim.w - wall)) / wall) * 3;
  if (p.y < wall) fy += ((wall - p.y) / wall) * 3;
  if (p.y > sim.h - wall) fy -= ((p.y - (sim.h - wall)) / wall) * 3;
  const len = Math.hypot(fx, fy);
  if (len < 1e-6) return null;
  let vx = fx / len, vy = fy / len;
  // 不利的场地：快要走进去时往旁边偏一点绕开
  if (T && tv < -0.2 && !inside && inTerrain(T, p.x + vx * 20, p.y + vy * 20)) {
    for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = vx * c - vy * s, ry = vx * s + vy * c;
      if (!inTerrain(T, p.x + rx * 20, p.y + ry * 20)) { vx = rx; vy = ry; break; }
    }
  }
  return { x: vx, y: vy };
}

/** 由服务器替玩家走一步 */
export function autopilot(sim: GameSim, p: SimPlayer, dt: number) {
  if (p.down || !p.alive) { p.moving = false; return; }
  const v = autopilotDir(sim, p);
  if (!v) { p.moving = false; return; }
  const sp = sim.moveSpeed(p) * dt;
  p.x = Math.max(8, Math.min(sim.w - 8, p.x + v.x * sp));
  p.y = Math.max(14, Math.min(sim.h - 6, p.y + v.y * sp));
  p.dir = Math.atan2(v.y, v.x);
  p.moving = true;
}
