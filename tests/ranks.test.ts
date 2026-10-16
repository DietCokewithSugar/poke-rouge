import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PvpService } from '../src/server/pvp';
import { betterRun, cleanRun, compareRuns, type RunRecord } from '../src/shared/ranks';
import { TOTAL_WAVES } from '../src/shared/waves';

const run = (over: Partial<RunRecord> = {}): RunRecord => ({ difficulty: 'easy', waves: 10, victory: false, time: 600, dex: 4, players: 1, ...over });
const win = (over: Partial<RunRecord> = {}) => run({ waves: TOTAL_WAVES, victory: true, ...over });
const ident = (n: number) => ({ pid: `rank${String(n).padStart(10, '0')}`, secret: `secret-${n}-0123456789abcdef` });
const dataFile = () => path.join(os.tmpdir(), `ranks-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('冒险成绩：上报的数据要校验，打完全部波次才算通关', () => {
  assert.deepEqual(cleanRun(run()), run());
  assert.equal(cleanRun(null), null);
  assert.equal(cleanRun('easy'), null);
  assert.equal(cleanRun(run({ difficulty: 'nightmare' as never })), null);
  assert.equal(cleanRun(run({ waves: TOTAL_WAVES + 1 })), null);
  assert.equal(cleanRun(run({ waves: 2.5 })), null);
  assert.equal(cleanRun(run({ time: -1 })), null);
  assert.equal(cleanRun(run({ dex: 152 })), null);
  assert.equal(cleanRun(run({ players: 5 })), null);
  assert.equal(cleanRun(run({ waves: 12, victory: true }))!.victory, false, '没打完不算通关');
  assert.equal(cleanRun(win())!.victory, true);
  assert.equal(cleanRun({ ...run(), shiny: 'yes' })!.shiny, undefined);
  assert.equal(cleanRun(run({ shiny: true }))!.shiny, true);
  assert.equal('extra' in cleanRun({ ...run(), extra: 1 })!, false, '多余的字段被丢掉');
});

test('冒险排名：难度 → 完成波次 → 通关 → 通关用时', () => {
  const sorted = [
    run({ waves: 18 }),
    win({ time: 1500 }),
    run({ difficulty: 'normal', waves: 3 }),
    win({ time: 1200 }),
    run({ waves: TOTAL_WAVES }),
    win({ difficulty: 'hard', time: 2000 }),
  ].sort(compareRuns);
  assert.deepEqual(sorted.map((r) => `${r.difficulty}/${r.waves}/${r.victory ? r.time : '-'}`),
    ['hard/20/2000', 'normal/3/-', 'easy/20/1200', 'easy/20/1500', 'easy/20/-', 'easy/18/-']);
  assert.equal(compareRuns(run({ time: 100 }), run({ time: 900 })), 0, '没通关时不比用时');
  const a = run(), b = win();
  assert.equal(betterRun(null, a), a);
  assert.equal(betterRun(a, undefined), a);
  assert.equal(betterRun(null, null), null);
  assert.equal(betterRun(a, b), b);
  assert.equal(betterRun(b, a), b);
  const same = run();
  assert.equal(betterRun(a, same), a, '一样好时留下原来的');
});

test('服务器：冒险榜每人只留最好的一次，按排名规则排序', () => {
  const s = new PvpService(dataFile(), { '1v1': 12, '4v4': 18 });
  const a = ident(1), b = ident(2), c = ident(3);
  assert.equal(s.reportRun({ ...a, name: '小赤', run: { difficulty: 'easy', waves: 99 } }), '成绩数据无效');
  assert.equal(s.reportRun({ pid: 'bad', secret: a.secret, name: '小赤', run: run() }), '对战身份无效');
  assert.equal(s.reportRun({ ...a, name: '小赤', run: run({ waves: 8 }) }), null);
  assert.equal(s.reportRun({ ...a, name: '小赤', run: run({ waves: 6, dex: 25 }) }), null);
  assert.equal(s.reportRun({ ...b, name: '小茂', run: win({ time: 1300 }) }), null);
  assert.equal(s.reportRun({ ...c, name: '小霞', run: win({ time: 1100, dex: 120, shiny: true }) }), null);
  assert.equal(s.reportRun({ pid: a.pid, secret: 'wrong-secret-0123456789', name: '冒充', run: win({ difficulty: 'hard' }) }), '对战身份校验失败');

  let board = s.rankBoard('adventure', a.pid, a.secret);
  assert.equal(board.kind, 'adventure');
  assert.deepEqual(board.rows.map((r) => [r.rank, r.name, r.run!.waves, r.dex]), [[1, '小霞', 20, 120], [2, '小茂', 20, 4], [3, '小赤', 8, 4]], '差的成绩不会覆盖好的');
  assert.equal(board.players, 3);
  assert.equal(board.me?.rank, 3);
  assert.equal(board.rows[2].you, true);
  assert.equal(board.rows[0].you, undefined);
  assert.equal(board.rows[0].shiny, true);
  assert.equal('at' in board.rows[0].run!, false, '成绩里不带服务器记录的时间');

  s.reportRun({ ...a, name: '小赤', run: win({ difficulty: 'normal', time: 1800 }) });
  board = s.rankBoard('adventure', a.pid, a.secret);
  assert.deepEqual(board.rows.map((r) => r.name), ['小赤', '小霞', '小茂'], '更好的成绩覆盖原来的并重新排名');
  assert.equal(board.me?.rank, 1);
  assert.equal(s.rankBoard('adventure').me, null, '没有身份时只看榜');
  assert.equal(s.rankBoard('gym').players, 0, '冒险成绩不进道馆榜');
});

test('服务器：道馆榜按徽章数排名，一样多时先拿到的在前；数据会保存', async () => {
  const file = dataFile();
  const s = new PvpService(file, { '1v1': 12, '4v4': 18 });
  const a = ident(1), b = ident(2), c = ident(3);
  assert.equal(s.reportGym({ ...a, name: '小赤', badges: 0, dex: 4 }), '徽章数据无效');
  assert.equal(s.reportGym({ ...a, name: '小赤', badges: 17, dex: 4 }), '徽章数据无效', '普通徽章 8 枚 + 大师徽章 8 枚，最多 16');
  assert.equal(s.reportGym({ ...a, name: '小赤', badges: 3, dex: 4 }), null);
  await sleep(5);
  assert.equal(s.reportGym({ ...b, name: '小茂', badges: 3, dex: 7 }), null);
  assert.equal(s.reportGym({ ...c, name: '小霞', badges: 2, dex: 999, shiny: true }), null);

  let board = s.rankBoard('gym', b.pid, b.secret);
  assert.deepEqual(board.rows.map((r) => [r.rank, r.name, r.badges]), [[1, '小赤', 3], [2, '小茂', 3], [3, '小霞', 2]]);
  assert.equal(board.me?.rank, 2);
  assert.equal(board.rows[2].dex, 25, '不合法的图鉴编号换成皮卡丘');
  assert.equal(board.rows[2].shiny, true);
  const at = board.rows[0].at;
  assert.ok(at && at <= Date.now());

  await sleep(5);
  s.reportGym({ ...a, name: '小赤', badges: 2, dex: 25, shiny: true });
  board = s.rankBoard('gym');
  assert.equal(board.rows[0].name, '小赤');
  assert.equal(board.rows[0].badges, 3, '徽章数不会变少');
  assert.equal(board.rows[0].at, at, '徽章没变多时不改达成时间');
  assert.equal(board.rows[0].dex, 25, '但会更新跟随的伙伴');
  assert.equal(board.rows[0].shiny, true);

  s.reportGym({ ...c, name: '小霞', badges: 4, dex: 120 });
  board = s.rankBoard('gym');
  assert.deepEqual(board.rows.map((r) => [r.name, r.badges]), [['小霞', 4], ['小赤', 3], ['小茂', 3]]);
  assert.equal(board.rows[0].shiny, undefined);

  s.saveNow();
  const again = new PvpService(file, { '1v1': 12, '4v4': 18 });
  fs.rmSync(file, { force: true });
  assert.deepEqual(again.rankBoard('gym').rows, board.rows, '重启服务器后排行榜还在');
});
