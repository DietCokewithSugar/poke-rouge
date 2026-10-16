/**
 * 自动走位（冒险的 AI 辅助战斗）：躲开近身的敌人、弹幕与即将落下的攻击，保持在技能射程边缘绕圈，
 * 安全时去捡糖果和增幅种子、救倒下的队友，血少时去吃橙橙果，被一群小怪围住时去踩爆炸之种，远离墙角。
 * 局部属性场地：安全时往对自己有利的场地靠；血少时离开正在灼伤自己的熔岩。
 * 只负责走位：技能本来就是自动释放的，商店、升级与进化仍由玩家自己决定。
 */
import { fieldVerdict, type FieldId } from '../fields';
import { BLAST_RADIUS, boostOfSeed } from '../pickups';
import { formOf } from '../pokemon';
import { SKILLS } from '../skills';
import type { SimPlayer } from './entities';
import { REVIVE_RADIUS, blastable, type GameSim } from './game';

/** 爆炸范围里有这么多只普通小怪才去踩爆炸之种，不然绕开它，留到需要的时候 */
export const AUTO_BLAST_CROWD = 10;

/** 场上每种场地对这只宝可梦的好坏（> 0 有利，< 0 不利） */
function fieldScores(sim: GameSim, p: SimPlayer): Map<FieldId, number> {
  const types = formOf(p.line, p.stage).types;
  const moves = p.skills.map((s) => SKILLS[s.id]).filter(Boolean).map((d) => ({ type: d.type, damaging: d.cat !== 'status', phys: d.cat === 'phys' }));
  const out = new Map<FieldId, number>();
  for (const f of sim.fields) if (!out.has(f.kind)) out.set(f.kind, fieldVerdict(f.kind, types, moves).score);
  return out;
}

/** 从 (x, y) 出发，往哪个方向走最快能到满足 ok 的地方（max 像素以内，找不到时为 null） */
function towards(sim: GameSim, x: number, y: number, ok: (x: number, y: number) => boolean, max = 320) {
  for (let d = 24; d <= max; d += 24) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d;
      if (tx < 16 || ty < 20 || tx > sim.w - 16 || ty > sim.h - 16) continue;
      if (ok(tx, ty)) return { x: Math.cos(a), y: Math.sin(a) };
    }
  }
  return null;
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
  let crowd = 0;
  for (const e of sim.enemies) {
    if (e.dead || e.hidden) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearest) { nearest = d; nx = dx / d; ny = dy / d; }
    if (d < BLAST_RADIUS && blastable(e)) crowd++;
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
  const crowded = crowd >= AUTO_BLAST_CROWD;
  const safe = nearest > want + 40;
  if (sim.fields.length) {
    const score = fieldScores(sim, p);
    const val = (x: number, y: number) => { const k = sim.fieldAt(x, y, true); return k ? score.get(k) ?? 0 : 0; };
    const here = val(p.x, p.y);
    // 追进不利场地的野生宝可梦一样吃亏（被灼伤、减速、冷却变长），硬躲反而容易被围：
    // 只有血少、身边又没有敌人的时候才离开正在灼伤自己的场地；很安全时往附近对自己有利的场地靠
    if (here < -0.5 && p.fieldBurn > 0 && p.hp < p.d.maxHp * 0.4 && nearest > flee + 20) {
      const out = towards(sim, p.x, p.y, (x, y) => val(x, y) >= -0.5);
      if (out) { fx += out.x * 1.2; fy += out.y * 1.2; }
    } else if (here <= 0.5 && nearest > want + 80) {
      const to = towards(sim, p.x, p.y, (x, y) => val(x, y) > 0.5, 200);
      if (to) { fx += to.x * 0.5; fy += to.y * 0.5; }
    }
  }
  // 目标：被围住时的爆炸之种 > 倒下的队友 > 血少时的橙橙果 > 增幅种子 > 附近的糖果和道具球
  let goal: { x: number; y: number; w: number } | null = null;
  if (crowded) {
    let bd = 240 ** 2;
    for (const pk of sim.pickups) {
      if (pk.kind !== 'seed_blast') continue;
      const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
      if (d < bd) { bd = d; goal = { x: pk.x, y: pk.y, w: 2.4 }; }
    }
  }
  for (const q of goal ? [] : sim.players) {
    if (q === p || !q.down || !q.alive || !sim.isAlly(p, q)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d > REVIVE_RADIUS * 0.5 && (safe || d < 90) && (!goal || d < Math.hypot(goal.x - p.x, goal.y - p.y))) goal = { x: q.x, y: q.y, w: 1.6 };
  }
  if (!goal && (safe || nearest > flee + 10)) {
    const low = p.hp < p.d.maxHp * 0.5;
    let bd = (safe ? 160 : 70) ** 2;
    for (const pk of sim.pickups) {
      if (pk.kind === 'seed_blast' || (pk.kind === 'berry' && !low)) continue;
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
  if (!crowded) {
    // 没被围住时绕开爆炸之种，留到需要的时候：离得近了往想走的那一侧让开
    for (const pk of sim.pickups) {
      if (pk.kind !== 'seed_blast') continue;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= 44) continue;
      const ux = dx / d, uy = dy / d;
      const side = -uy * fx + ux * fy >= 0 ? 1 : -1;
      const k = Math.min(1, (44 - d) / 22);
      fx += (ux * 2.4 - uy * side * 1.6) * k;
      fy += (uy * 2.4 + ux * side * 1.6) * k;
    }
  }
  const wall = 80;
  if (p.x < wall) fx += ((wall - p.x) / wall) * 3;
  if (p.x > sim.w - wall) fx -= ((p.x - (sim.w - wall)) / wall) * 3;
  if (p.y < wall) fy += ((wall - p.y) / wall) * 3;
  if (p.y > sim.h - wall) fy -= ((p.y - (sim.h - wall)) / wall) * 3;
  const len = Math.hypot(fx, fy);
  return len < 1e-6 ? null : { x: fx / len, y: fy / len };
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
