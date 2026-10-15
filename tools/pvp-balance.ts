/**
 * 对战平衡报告：先让机器人打冒险模式得到真实构筑（第 5/10/15/20 波结束时各存一份），
 * 再按档位组成队伍互相对战，统计对战时长、击倒结束的比例、首次击倒时间与各宝可梦的胜率。
 * 用法： npx tsx tools/pvp-balance.ts [每档局数] [1v1|4v4] [取样的进化线数]
 * 构筑缓存在 /tmp/pvp-builds-v2.json（删掉即可重新生成）。
 */
import fs from 'node:fs';
import { LINE_IDS } from '../src/shared/pokemon';
import { buildOf, buildPower, validateBuild, type SavedBuild } from '../src/shared/pvp/build';
import { PVP_MODES, PvpSim, type PvpInit, type PvpMode } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { GameSim } from '../src/shared/sim/game';
import { botMove, botShop } from '../tests/bot';

const games = Number(process.argv[2] ?? 40);
const mode = (process.argv[3] ?? '1v1') as PvpMode;
const sample = Number(process.argv[4] ?? 24);
const CACHE = '/tmp/pvp-builds-v2.json';
const TIERS = [5, 10, 15, 20];
const META = Object.fromEntries(['hp', 'atk', 'spa', 'def', 'spd', 'spe', 'crit', 'haste', 'regen', 'luck', 'xp', 'pickup', 'money', 'reroll'].map((k) => [k, 6]));

interface Tagged { wave: number; build: SavedBuild }

function harvest(line: string, seed: number): Tagged[] {
  const sim = new GameSim([{ id: 1, name: 'bot', line: line as SavedBuild['line'], meta: META }], seed, 'easy');
  const out: Tagged[] = [];
  const keep = (wave: number) => {
    const v = validateBuild(JSON.parse(JSON.stringify(buildOf(sim.players[0]))));
    if (typeof v !== 'string') out.push({ wave, build: v });
  };
  let lastShop = 0;
  for (let steps = 0; steps < 30 * 60 * 40; steps++) {
    if (sim.phase === 'wave') for (const p of sim.players) botMove(sim, p, 1 / 30);
    else if (sim.phase === 'inter') {
      for (const p of sim.players) botShop(sim, p);
      if (sim.wave !== lastShop) {
        lastShop = sim.wave;
        if (TIERS.includes(sim.wave)) keep(sim.wave);
      }
    } else break;
    sim.step(1 / 30);
    sim.flushEvents();
  }
  if (sim.phase === 'won') keep(20);
  return out;
}

let pool: Tagged[] = [];
if (fs.existsSync(CACHE)) pool = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
else {
  const step = Math.max(1, Math.floor(LINE_IDS.length / sample));
  const lines = LINE_IDS.filter((_, i) => i % step === 0).slice(0, sample);
  for (const [i, line] of lines.entries()) {
    for (let s = 0; s < 2; s++) pool.push(...harvest(line, 77 + s * 131 + i));
    process.stdout.write(`\r生成构筑 ${i + 1}/${lines.length} ${line}      `);
  }
  console.log();
  fs.writeFileSync(CACHE, JSON.stringify(pool));
}
console.log('构筑档位', TIERS.map((t) => `${t}:${pool.filter((x) => x.wave === t).length}`).join(' '));

const M = PVP_MODES[mode];
function play(a: SavedBuild[][], b: SavedBuild[][], seed: number) {
  const inits: PvpInit[] = [];
  let id = 1;
  for (const [team, seats] of [[0, a], [1, b]] as const) {
    seats.forEach((builds, s) => builds.forEach((build, i) => {
      inits.push({ id: id++, name: `T${team}S${s}`, team, build, meta: META, bot: true, owner: team * 10 + s + 1, helper: i > 0 });
    }));
  }
  const sim = new PvpSim(mode, inits, seed);
  for (let i = 0; i < 30 * 200 && sim.phase !== 'over'; i++) { sim.step(1 / 30); sim.flushEvents(); }
  return sim.result();
}

const rng = new Rng(2024);
/** 一边的阵容：size 位训练家，每位 team 只不同的构筑 */
const side = (tier: Tagged[]) => Array.from({ length: M.size }, () => rng.shuffle(tier.slice()).slice(0, M.team).map((t) => t.build));
const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 100)}%`;

for (const wave of TIERS) {
  const tier = pool.filter((t) => t.wave === wave);
  if (tier.length < M.team * 2) continue;
  const times: number[] = [], firstKo: number[] = [];
  let ko = 0, draws = 0;
  const wins: Record<string, [number, number]> = {};
  for (let g = 0; g < games; g++) {
    const A = side(tier), B = side(tier);
    const res = play(A, B, 1000 + g * 31 + wave);
    times.push(res.time);
    if (res.feed.length) firstKo.push(res.feed[0][0]);
    if (res.reason === 'ko') ko++;
    if (res.winner < 0) draws++;
    for (const p of res.players) {
      const w = (wins[p.line] ??= [0, 0]);
      w[1]++;
      if (res.winner === p.team) w[0]++;
    }
  }
  times.sort((x, y) => x - y);
  firstKo.sort((x, y) => x - y);
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)).toFixed(1);
  const avgPow = Math.round(tier.reduce((s, t) => s + buildPower(t.build), 0) / tier.length);
  const avgLv = Math.round(tier.reduce((s, t) => s + t.build.level, 0) / tier.length);
  console.log(`第 ${wave} 波构筑（${tier.length} 个，平均强度 ${avgPow}，Lv${avgLv}）：${games} 场 · 平均 ${avg(times)} 秒（中位 ${times[times.length >> 1]}，最短 ${times[0]}）`
    + ` · 20 秒内结束 ${pct(times.filter((t) => t < 20).length, games)} · 打满时间 ${pct(times.filter((t) => t >= M.dur).length, games)}`
    + ` · 击倒结束 ${pct(ko, games)} · 平局 ${draws} · 首次击倒 平均 ${avg(firstKo)} 秒（最早 ${firstKo[0] ?? '-'}）`);
  const rows = Object.entries(wins).filter(([, [, t]]) => t >= 4).sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1]);
  console.log('   胜率 ' + rows.map(([l, [w, t]]) => `${l} ${pct(w, t)}`).join('  '));
}

// 跨档：高波次构筑打低波次构筑（构筑强度要能决定胜负）
for (const [lo, hi] of [[5, 10], [10, 15], [15, 20], [10, 20]]) {
  const A = pool.filter((t) => t.wave === lo), B = pool.filter((t) => t.wave === hi);
  if (A.length < M.team || B.length < M.team) continue;
  let hiWins = 0;
  const n = Math.max(10, Math.round(games / 2));
  for (let i = 0; i < n; i++) if (play(side(A), side(B), 500 + i).winner === 1) hiWins++;
  console.log(`第 ${hi} 波构筑 对 第 ${lo} 波构筑：高档胜率 ${pct(hiWins, n)}（${n} 场）`);
}
