import { GameSim, type PlayerInit } from '../src/shared/sim/game';
import type { SimPlayer } from '../src/shared/sim/entities';
import { ITEMS } from '../src/shared/items';
import { formOf } from '../src/shared/pokemon';
import { SKILLS } from '../src/shared/skills';

function preferredRange(p: SimPlayer) {
  let r = 999;
  for (const s of p.skills) {
    const d = SKILLS[s.id];
    if (d.cat === 'status') continue;
    r = Math.min(r, d.range * p.d.rangeMult);
  }
  return r === 999 ? 120 : r;
}

/** 走位机器人：躲开近身的敌人与弹幕，保持在技能射程边缘，远离墙角，安全时捡糖果。 */
export function botMove(sim: GameSim, p: SimPlayer, dt: number) {
  if (p.down) return;
  const want = Math.max(28, preferredRange(p) * 0.75);
  let fx = 0, fy = 0;
  let nearest = Infinity, nx = 0, ny = 0;
  for (const e of sim.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearest) { nearest = d; nx = dx / d; ny = dy / d; }
    const danger = e.def.rank === 'minion' ? 1 : 2.5;
    if (d < 70) { fx += (dx / d) * danger * (70 - d) / 70 * 2.2; fy += (dy / d) * danger * (70 - d) / 70 * 2.2; }
  }
  for (const pr of sim.projs) {
    if (pr.owner >= 0) continue;
    const dx = p.x - pr.x, dy = p.y - pr.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 50) { fx += (dx / d) * 1.8 * (50 - d) / 50; fy += (dy / d) * 1.8 * (50 - d) / 50; }
  }
  if (nearest < Infinity) {
    if (nearest > want + 20) { fx -= nx * 0.6; fy -= ny * 0.6; }
    // 绕圈走
    fx += -ny * 0.5; fy += nx * 0.5;
  } else if (sim.pickups.length) {
    let best = sim.pickups[0], bd = Infinity;
    for (const pk of sim.pickups) {
      const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
      if (d < bd) { bd = d; best = pk; }
    }
    fx += best.x - p.x; fy += best.y - p.y;
  }
  const wall = 80;
  if (p.x < wall) fx += ((wall - p.x) / wall) * 3;
  if (p.x > sim.w - wall) fx -= ((p.x - (sim.w - wall)) / wall) * 3;
  if (p.y < wall) fy += ((wall - p.y) / wall) * 3;
  if (p.y > sim.h - wall) fy -= ((p.y - (sim.h - wall)) / wall) * 3;
  const len = Math.hypot(fx, fy);
  if (len < 1e-6) return;
  const sp = sim.moveSpeed(p) * dt;
  sim.setPlayerPos(p.id, p.x + (fx / len) * sp, p.y + (fy / len) * sp, true, Math.atan2(fy, fx));
}

function itemScore(p: SimPlayer, id: string) {
  const it = ITEMS[id];
  const types = formOf(p.line, p.stage).types;
  if (it.typeMods) return Object.keys(it.typeMods).some((t) => types.includes(t as never)) ? 3 : 0;
  if (it.special === 'evo_stone') return 0;
  return 1;
}

export function botShop(sim: GameSim, p: SimPlayer) {
  let guard = 0;
  while (guard++ < 40) {
    const me = sim.privateState(p);
    if (me.cards) {
      const i = me.cards.findIndex((c) => c.kind === 'skill');
      if (i >= 0) {
        const err = sim.command(p.id, { t: 'level', i, slot: me.skills.length >= me.slots ? weakestSlot(p) : undefined });
        if (!err) continue;
      }
      const pref = ['spa', 'atk', 'haste', 'maxHp', 'def', 'spd', 'crit'];
      let best = 0, bs = 99;
      me.cards.forEach((c, j) => {
        if (c.kind !== 'stat') return;
        const k = pref.indexOf(c.stat);
        const s = (k < 0 ? 20 : k) - c.tier * 3;
        if (s < bs) { bs = s; best = j; }
      });
      sim.command(p.id, { t: 'level', i: best });
      continue;
    }
    if (me.crate) { sim.command(p.id, { t: 'crate', take: true }); continue; }
    break;
  }
  const types = formOf(p.line, p.stage).types;
  for (let round = 0; round < 4; round++) {
    const me = sim.privateState(p);
    me.shop.offers.forEach((o, i) => {
      if (!o || o.price > Math.floor(p.money)) return;
      if (o.kind === 'skill') {
        const def = SKILLS[o.id];
        const owned = p.skills.some((s) => s.id === o.id);
        const full = p.skills.length >= p.slots;
        if (!owned && full) {
          const w = weakestSlot(p);
          if (SKILLS[p.skills[w].id].tier >= o.tier) return;
          sim.command(p.id, { t: 'buy', i, slot: w });
          return;
        }
        if (!owned && def.cat === 'status' && p.skills.length >= p.slots - 1) return;
        if (!owned && !types.includes(def.type) && def.tier < 3 && p.skills.length >= 2) return;
      } else if (itemScore(p, o.id) === 0 && o.id !== 'thunder_stone') return;
      if (o.id === 'thunder_stone' && sim.wave < 9) return;
      sim.command(p.id, { t: 'buy', i });
    });
    if (Math.floor(p.money) > 50 + sim.wave * 8) sim.command(p.id, { t: 'reroll' });
  }
  sim.command(p.id, { t: 'waveReady', on: true });
}

function weakestSlot(p: SimPlayer) {
  let w = 0, wt = 99;
  p.skills.forEach((s, i) => {
    const t = SKILLS[s.id].tier * 10 + s.lv;
    if (t < wt) { wt = t; w = i; }
  });
  return w;
}

export interface RunResult { wave: number; phase: string; levels: number[]; stages: number[]; kills: number[]; seconds: number }

export function runBotGame(inits: PlayerInit[], seed: number, maxWave = 20): RunResult {
  const sim = new GameSim(inits, seed);
  const dt = 1 / 30;
  let steps = 0;
  while (steps < 30 * 60 * 40) {
    steps++;
    if (sim.phase === 'wave') {
      for (const p of sim.players) botMove(sim, p, dt);
    } else if (sim.phase === 'inter') {
      if (sim.wave >= maxWave) break;
      for (const p of sim.players) botShop(sim, p);
    } else break;
    sim.step(dt);
    sim.flushEvents();
  }
  return {
    wave: sim.wave,
    phase: sim.phase,
    levels: sim.players.map((p) => p.level),
    stages: sim.players.map((p) => p.stage),
    kills: sim.players.map((p) => p.stats.kills),
    seconds: Math.round(steps / 30),
  };
}
