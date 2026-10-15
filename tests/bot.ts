import type { DifficultyId } from '../src/shared/difficulty';
import { GameSim, type PlayerInit } from '../src/shared/sim/game';
import type { SimPlayer } from '../src/shared/sim/entities';
import { buildOf, type SavedBuild } from '../src/shared/pvp/build';
import { autoShop } from '../src/shared/sim/autoshop';
import { autopilotDir } from '../src/shared/sim/autopilot';

/** 走位机器人：和游戏里的 AI 辅助战斗同一套走位，但像真人一样通过上报位置移动（受防加速额度限制） */
export function botMove(sim: GameSim, p: SimPlayer, dt: number) {
  if (p.down) return;
  const v = autopilotDir(sim, p);
  if (!v) return;
  const sp = sim.moveSpeed(p) * dt;
  sim.setPlayerPos(p.id, p.x + v.x * sp, p.y + v.y * sp, true, Math.atan2(v.y, v.x));
}

export const botShop = autoShop;

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
