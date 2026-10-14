/**
 * 平衡性报告：让机器人用每只精灵各打若干局，统计到达的波次。
 * 用法： npx tsx tools/balance.ts [局数] [人数]
 */
import { LINE_IDS } from '../src/shared/pokemon';
import { runBotGame } from '../tests/bot';

const runs = Number(process.argv[2] ?? 4);
const players = Number(process.argv[3] ?? 1);

for (const line of LINE_IDS) {
  const res: string[] = [];
  let total = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    const inits = Array.from({ length: players }, (_, k) => ({ id: k + 1, name: `bot${k}`, line, meta: {} }));
    const r = runBotGame(inits, 1000 + i * 7919);
    total += r.phase === 'won' ? 21 : r.wave;
    res.push(`${r.phase === 'won' ? '通关' : 'W' + r.wave}(Lv${r.levels.join('/')} 形态${r.stages.join('/')} 击败${r.kills.join('/')} ${Date.now() - t0}ms)`);
  }
  console.log(`${line.padEnd(11)} 平均 ${(total / runs).toFixed(1)}  ${res.join('  ')}`);
}
