/**
 * 联机流量报告：在进程内跑一局 4 人联机（机器人操作），统计服务器发给每位玩家的数据量。
 * 用法： npx tsx tools/netstat.ts [人数] [打到第几波]
 * 输出每波每位玩家的下行 KB/s（按消息类型拆分）以及开启 permessage-deflate 后的估计值。
 */
import zlib from 'node:zlib';
import { Room } from '../src/shared/room';
import { PROTOCOL_VERSION, type S2C } from '../src/shared/protocol';
import { TICK_RATE } from '../src/shared/sim/game';
import { botMove, botShop } from '../tests/bot';

const players = Number(process.argv[2] ?? 4);
const maxWave = Number(process.argv[3] ?? 14);
const meta = Object.fromEntries(['hp', 'atk', 'spa', 'def', 'spd', 'spe', 'crit', 'haste', 'regen'].map((k) => [k, 8]));

interface Meter { bytes: Record<string, number>; deflated: number; deflate: zlib.Deflate | null; inflight: Buffer[] }
const meters: Meter[] = [];
const room = new Room('测试');
const lines = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'] as const;
for (let i = 0; i < players; i++) {
  const m: Meter = { bytes: {}, deflated: 0, deflate: null, inflight: [] };
  meters.push(m);
  // 模拟 permessage-deflate（保留上下文），估算压缩后的大小
  const def = zlib.createDeflateRaw({ level: 3, memLevel: 7, windowBits: 13 });
  def.on('data', (b: Buffer) => { m.deflated += b.length; });
  m.deflate = def;
  room.join({
    send(data: string | ArrayBuffer) {
      let kind: string;
      let buf: Buffer;
      if (typeof data === 'string') {
        kind = (JSON.parse(data) as S2C).t;
        buf = Buffer.from(data);
      } else {
        kind = 'snapshot';
        buf = Buffer.from(data);
      }
      m.bytes[kind] = (m.bytes[kind] ?? 0) + buf.length;
      def.write(buf);
      def.flush(zlib.constants.Z_SYNC_FLUSH);
    },
    buffered: () => 0,
  }, `bot${i}`, meta, PROTOCOL_VERSION);
}
const ids = [...room.members.keys()];
ids.forEach((id, i) => room.handle(id, { t: 'pick', line: lines[i % lines.length] }));
ids.forEach((id) => room.handle(id, { t: 'ready', on: true }));
// 模拟 1080p 屏幕的视野（3 倍像素 → 640×360 世界像素）
if (process.env.NOVIEW !== '1') ids.forEach((id) => room.handle(id, { t: 'view', w: 640, h: 360 }));
room.handle(ids[0], { t: 'start' });
const sim = room.sim!;
const dt = 1 / TICK_RATE;
let lastWave = 0, waveTicks = 0;
const snap = () => meters.map((m) => ({ ...m.bytes, _def: m.deflated }));
let before = snap();

async function flushAll() {
  await Promise.all(meters.map((m) => new Promise<void>((r) => m.deflate!.flush(zlib.constants.Z_SYNC_FLUSH, () => r()))));
}

async function report(wave: number, ticks: number) {
  await flushAll();
  const after = snap();
  const sec = ticks / TICK_RATE;
  const kinds = new Set<string>();
  for (const a of after) for (const k of Object.keys(a)) kinds.add(k);
  const per = (k: string) => after.reduce((s, a, i) => s + ((a as Record<string, number>)[k] ?? 0) - ((before[i] as Record<string, number>)[k] ?? 0), 0) / meters.length / sec / 1024;
  const total = [...kinds].filter((k) => k !== '_def').reduce((s, k) => s + per(k), 0);
  const parts = [...kinds].filter((k) => k !== '_def').map((k) => [k, per(k)] as const).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ');
  console.log(`第 ${String(wave).padStart(2)} 波 敌人 ${String(sim.enemies.length).padStart(3)} 弹体 ${String(sim.projs.length).padStart(3)}：每人下行 ${total.toFixed(1)} KB/s（${parts}） → 压缩后约 ${per('_def').toFixed(1)} KB/s`);
  before = after;
}

for (let step = 0; step < TICK_RATE * 60 * 30; step++) {
  if (sim.phase === 'wave') {
    for (const p of sim.players) botMove(sim, p, dt);
    waveTicks++;
  } else if (sim.phase === 'inter') {
    if (waveTicks) { await report(lastWave, waveTicks); waveTicks = 0; }
    if (sim.wave >= maxWave) break;
    for (const p of sim.players) {
      if (p.down) continue;
      botShop(sim, p);
    }
    await flushAll();
    before = snap();
  } else break;
  lastWave = sim.wave;
  room.update();
  if (!room.sim) break;
}
for (const m of meters) m.deflate?.end();
