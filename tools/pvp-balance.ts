/**
 * 对战平衡报告：先让机器人打冒险模式得到真实构筑，再让这些构筑两两对战。
 * 用法： npx tsx tools/pvp-balance.ts [每种构筑局数] [1v1|4v4]
 * 构筑缓存在 /tmp/pvp-builds.json（删掉即可重新生成）。
 */
import fs from 'node:fs';
import { LINE_IDS } from '../src/shared/pokemon';
import { buildPower, validateBuild, type SavedBuild } from '../src/shared/pvp/build';
import { PvpSim, type PvpInit, type PvpMode } from '../src/shared/pvp/sim';
import { runBotGame } from '../tests/bot';

const runs = Number(process.argv[2] ?? 2);
const mode = (process.argv[3] ?? '1v1') as PvpMode;
const CACHE = '/tmp/pvp-builds.json';
const TIERS = [5, 10, 15, 20];

interface Tagged { wave: number; build: SavedBuild }
let pool: Tagged[] = [];
if (fs.existsSync(CACHE)) pool = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
else {
  const meta = Object.fromEntries(['hp', 'atk', 'spa', 'def', 'spd', 'spe', 'crit', 'haste', 'regen', 'luck', 'xp', 'pickup', 'money', 'reroll'].map((k) => [k, 6]));
  for (const line of LINE_IDS) {
    for (const wave of TIERS) {
      for (let i = 0; i < 3; i++) {
        const r = runBotGame([{ id: 1, name: 'bot', line, meta }], 77 + i * 131 + wave, wave);
        const v = validateBuild(r.builds[0]);
        if (typeof v === 'string') { console.log('构筑校验失败', line, wave, v, JSON.stringify(r.builds[0])); continue; }
        const reached = r.phase === 'won' ? 20 : r.wave;
        pool.push({ wave: TIERS.reduce((a, t) => (reached >= t ? t : a), 5), build: v });
      }
    }
    console.log('生成构筑', line);
  }
  fs.writeFileSync(CACHE, JSON.stringify(pool));
}
console.log('构筑档位', TIERS.map((t) => `${t}:${pool.filter((x) => x.wave === t).length}`).join(' '));

function play(a: SavedBuild[], b: SavedBuild[], seed: number) {
  const inits: PvpInit[] = [
    ...a.map((build, i) => ({ id: i + 1, name: `A${i}`, team: 0, build, meta: {}, bot: true })),
    ...b.map((build, i) => ({ id: 10 + i, name: `B${i}`, team: 1, build, meta: {}, bot: true })),
  ];
  const sim = new PvpSim(mode, inits, seed);
  for (let i = 0; i < 30 * 200 && sim.phase !== 'over'; i++) { sim.step(1 / 30); sim.flushEvents(); }
  return sim.result();
}

const size = mode === '1v1' ? 1 : 4;
for (const wave of TIERS) {
  const tier = pool.filter((t) => t.wave === wave);
  let n = 0, time = 0, ko = 0, draws = 0;
  const wins: Record<string, [number, number]> = {};
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < tier.length; i++) {
      const pickTeam = (first: number) => Array.from({ length: size }, (_, k) => tier[(first + k * 3) % tier.length].build);
      const j = (i + 1 + r * 3) % tier.length;
      if (j === i) continue;
      const A = pickTeam(i), B = pickTeam(j);
      const res = play(A, B, 1000 + r * 31 + i * 7);
      n++;
      time += res.time;
      if (res.reason === 'ko') ko++;
      if (res.winner < 0) draws++;
      for (const [team, builds] of [[0, A], [1, B]] as const) {
        for (const b of builds) {
          const w = (wins[b.line] ??= [0, 0]);
          w[1]++;
          if (res.winner === team) w[0]++;
        }
      }
    }
  }
  const avgPow = Math.round(tier.reduce((a, t) => a + buildPower(t.build), 0) / tier.length);
  const avgLv = Math.round(tier.reduce((a, t) => a + t.build.level, 0) / tier.length);
  console.log(`第 ${wave} 波构筑（平均强度 ${avgPow}，Lv${avgLv}）：${n} 场，平均 ${(time / n).toFixed(1)} 秒，击倒结束 ${Math.round((ko / n) * 100)}%，平局 ${draws}`);
  console.log('   胜率 ' + Object.entries(wins).map(([l, [w, t]]) => `${l} ${Math.round((w / t) * 100)}%`).join('  '));
}

// 跨档：高波次构筑打低波次构筑
for (const [lo, hi] of [[5, 10], [10, 15], [15, 20], [10, 20]]) {
  const A = pool.filter((t) => t.wave === lo), B = pool.filter((t) => t.wave === hi);
  let hiWins = 0, n = 0;
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const res = play(Array(size).fill(A[i].build), Array(size).fill(B[(i * 7) % B.length].build), 500 + i);
    n++;
    if (res.winner === 1) hiWins++;
  }
  console.log(`第 ${hi} 波构筑 对 第 ${lo} 波构筑：高档胜率 ${Math.round((hiWins / n) * 100)}%（${n} 场）`);
}
