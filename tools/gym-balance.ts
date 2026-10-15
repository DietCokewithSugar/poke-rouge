/**
 * 道馆难度报告：用机器人打冒险得到的真实构筑（pvp-balance.ts 生成的缓存）组队挑战每个道馆，
 * 统计不同波次档位的队伍打赢道馆训练家与馆主的胜率。挑战第 N 个道馆时带着前面 N-1 枚徽章。
 * 用法： npx tsx tools/gym-balance.ts [每档局数] [研究所强化等级]
 */
import fs from 'node:fs';
import { GYMS, badgeKey } from '../src/shared/gyms';
import { teamLevel, type SavedBuild } from '../src/shared/pvp/build';
import { gymTeam, type GymStage } from '../src/shared/pvp/gym';
import { PvpSim, type PvpInit } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';

const games = Number(process.argv[2] ?? 30);
const labLv = Number(process.argv[3] ?? 4);
const CACHE = '/tmp/pvp-builds-v2.json';
if (!fs.existsSync(CACHE)) { console.log('先运行 npx tsx tools/pvp-balance.ts 生成构筑缓存'); process.exit(1); }
const pool = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as { wave: number; build: SavedBuild }[];
const TIERS = [5, 10, 15, 20];
const lab = Object.fromEntries(['hp', 'atk', 'spa', 'def', 'spd', 'spe', 'crit', 'haste', 'regen'].map((k) => [k, labLv]));
const rng = new Rng(99);

function play(mine: SavedBuild[], meta: Record<string, number>, foe: SavedBuild[], foeMeta: Record<string, number>, seed: number) {
  const inits: PvpInit[] = [
    ...mine.map((build, i) => ({ id: i + 1, name: '我', team: 0, build, meta, bot: true, owner: 1, helper: i > 0 })),
    ...foe.map((build, i) => ({ id: 10 + i, name: '馆主', team: 1, build, meta: foeMeta, bot: true, owner: 2, helper: i > 0 })),
  ];
  const sim = new PvpSim('1v1', inits, seed);
  for (let i = 0; i < 30 * 200 && sim.phase !== 'over'; i++) { sim.step(1 / 30); sim.flushEvents(); }
  return sim.result();
}

for (const g of GYMS) {
  const meta = { ...lab, ...Object.fromEntries(GYMS.filter((x) => x.no < g.no).map((x) => [badgeKey(x.id), 1])) };
  const row: string[] = [];
  for (const stage of ['junior', 'leader'] as GymStage[]) {
    const foe = gymTeam(g, stage);
    const cells: string[] = [];
    for (const wave of TIERS) {
      const tier = pool.filter((t) => t.wave === wave);
      let wins = 0, time = 0, lv = 0;
      for (let i = 0; i < games; i++) {
        const team = rng.shuffle(tier.slice()).slice(0, 3).map((t) => t.build);
        lv += teamLevel(team);
        const res = play(team, meta, foe, g.meta, 300 + i * 17 + g.no);
        if (res.winner === 0) wins++;
        time += res.time;
      }
      cells.push(`第${wave}波(Lv${Math.round(lv / games)}) ${Math.round((wins / games) * 100)}%/${Math.round(time / games)}s`);
    }
    row.push(`${stage === 'junior' ? '训练家' : '馆主'} Lv${g[stage].level}: ${cells.join('  ')}`);
  }
  console.log(`${g.no}. ${g.name}（${g.leader.name}）\n   ${row.join('\n   ')}`);
}
