import type { DifficultyId } from '../src/shared/difficulty';
import { GameSim, type PlayerInit } from '../src/shared/sim/game';
import type { SimPlayer } from '../src/shared/sim/entities';
import { ITEMS } from '../src/shared/items';
import { formOf } from '../src/shared/pokemon';
import { SKILLS } from '../src/shared/skills';
import { buildOf, type SavedBuild } from '../src/shared/pvp/build';
import { autopilotDir } from '../src/shared/sim/autopilot';

/** 走位机器人：和游戏里的 AI 辅助战斗同一套走位，但像真人一样通过上报位置移动（受防加速额度限制） */
export function botMove(sim: GameSim, p: SimPlayer, dt: number) {
  if (p.down) return;
  const v = autopilotDir(sim, p);
  if (!v) return;
  const sp = sim.moveSpeed(p) * dt;
  sim.setPlayerPos(p.id, p.x + v.x * sp, p.y + v.y * sp, true, Math.atan2(v.y, v.x));
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
    if (me.evo?.prompt) { sim.command(p.id, { t: 'evolve', yes: true }); continue; }
    if (me.cards) {
      const i = me.cards.findIndex((c) => c.kind === 'skill');
      if (i >= 0) {
        const err = sim.command(p.id, { t: 'level', i, slot: me.skills.length >= me.slots ? weakestSlot(p) : undefined });
        if (!err) continue;
      }
      const phys = p.skills.filter((s) => SKILLS[s.id].cat === 'phys').length;
      const spec = p.skills.filter((s) => SKILLS[s.id].cat === 'spec').length;
      const pref = phys > spec ? ['atk', 'maxHp', 'haste', 'def', 'spa', 'spd', 'crit'] : ['spa', 'atk', 'haste', 'maxHp', 'def', 'spd', 'crit'];
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

export interface RunResult { wave: number; phase: string; levels: number[]; stages: number[]; kills: number[]; seconds: number; builds: SavedBuild[] }

export function runBotGame(inits: PlayerInit[], seed: number, maxWave = 20, difficulty: DifficultyId = 'easy'): RunResult {
  const sim = new GameSim(inits, seed, difficulty);
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
    builds: sim.players.map((p) => buildOf(p)),
  };
}
