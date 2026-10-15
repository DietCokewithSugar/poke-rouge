/**
 * 联机服务器：静态托管前端 + WebSocket 房间（/ws）。
 * 每个房间在服务器上运行权威模拟，客户端只上报自己的位置与操作。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { TOWN_WHERE, type C2S, type RoomInfo, type S2C, type ServerStats, type TownPeer, type TownWhere } from '../shared/protocol';
import { Room, cleanName } from '../shared/room';
import { trainerOf } from '../shared/trainers';
import type { PvpRoom } from '../shared/pvp/room';
import type { PvpMode } from '../shared/pvp/sim';
import { TICK_RATE } from '../shared/sim/game';
import { PvpService } from './pvp';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 300);
/** 对战数据（积分、排行榜、AI 构筑池）保存位置 */
const PVP_DATA = process.env.PVP_DATA || path.resolve(process.cwd(), 'data/pvp.json');
/** 匹配多久没找到真人对手就由 AI 训练家补位（秒） */
const BOT_AFTER = process.env.PVP_BOT_AFTER ? Number(process.env.PVP_BOT_AFTER) : null;
const pvp = new PvpService(PVP_DATA, { '1v1': BOT_AFTER ?? 12, '4v4': BOT_AFTER ?? 18 });
const here = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR
  || [path.resolve(here, '../dist'), path.resolve(here, '../../dist')].find((d) => fs.existsSync(path.join(d, 'index.html')))
  || path.resolve(here, '../dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const rooms = new Map<string, Room>();
Room.allowDebug = process.env.POKE_DEBUG === '1';

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz' || url.pathname === '/api/stats' || url.pathname === '/api/rooms' || url.pathname === '/api/pvp/leaderboard') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    const body = url.pathname === '/api/rooms' ? { stats: stats(), rooms: publicRooms() }
      : url.pathname === '/api/pvp/leaderboard' ? (({ rows, players, mode }) => ({ mode, players, rows }))(pvp.board((url.searchParams.get('mode') ?? '1v1') as PvpMode))
      : { ok: true, ...stats(), perf: perfStats() };
    res.end(JSON.stringify(body));
    return;
  }
  let file = path.normalize(path.join(STATIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('前端尚未构建：请先运行 npm run build');
    return;
  }
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  });
  fs.createReadStream(file).pipe(res);
});

/**
 * 开启 permessage-deflate：JSON 状态与事件里大量重复的字段名压缩后只剩很小一部分，
 * 跨境线路带宽紧张、丢包时能明显减少排队。窗口取小一些，控制每条连接的内存。
 */
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 8 * 1024,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 3, memLevel: 7 },
    serverMaxWindowBits: 13,
    clientMaxWindowBits: 13,
    threshold: 200,
    concurrencyLimit: 8,
  },
});

/** 可丢弃的数据（快照、纯视觉事件）在待发送超过这个量时直接跳过：对实时游戏来说过时的画面没有意义，只会越积越多 */
const DROP_BYTES = Number(process.env.NET_DROP_BYTES || 32 * 1024);

/** 服务器性能统计：每秒更新一次，/api/stats 里可以看到，用来判断卡顿来自服务器还是网络 */
const perf = { tickAvgMs: 0, tickMaxMs: 0, loopLagMs: 0, outKBps: 0, dropped: 0 };
let tickSum = 0, tickN = 0, tickMax = 0, outBytes = 0, dropped = 0, lagMax = 0;

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function newCode(): string {
  for (let i = 0; i < 1000; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('no room code available');
}

interface Presence { name: string; trainer: string; dex: number; town: boolean; busy: boolean; x: number; y: number; d: number; m: 0 | 1 }

interface Client {
  ws: WebSocket; room: Room | null; id: number; alive: boolean; budget: number; browsing: boolean; lastStats: string;
  conn: { send(data: string | ArrayBuffer, droppable?: boolean): void; buffered(): number };
  pvp: PvpRoom | null; pvpId: number;
  /** 在线玩家编号（真新镇里区分玩家用） */
  uid: number;
  presence: Presence | null;
  lastTown: string;
  send(msg: S2C): void;
}

let uidSeq = 0;
/** 真新镇地图的大小（世界像素），位置超出范围的上报会被截断 */
const TOWN_W = 1024, TOWN_H = 900;
/** 真新镇里最多同时显示多少位其他玩家 */
const TOWN_MAX = 80;

/** 在线人数 = 打开着游戏页面的连接数（单人游戏、浏览大厅、房间里的都算） */
function stats(): ServerStats {
  let playing = 0;
  for (const r of rooms.values()) if (r.inGame) playing += r.members.size;
  const pv = pvp.stats();
  return { online: clients.size, playing: playing + pv.playing, rooms: rooms.size, pvpQueue: pv.queue, pvpPlaying: pv.playing };
}

function perfStats() {
  return { ...perf, memMB: Math.round(process.memoryUsage().rss / 1048576), uptimeSec: Math.round(process.uptime()) };
}

function publicRooms(): RoomInfo[] {
  return [...rooms.values()]
    .filter((r) => r.isPublic && r.members.size > 0)
    .map((r) => r.info())
    .sort((a, b) => Number(a.inGame) - Number(b.inGame) || b.players.length - a.players.length)
    .slice(0, 60);
}

function sendJson(c: Client, msg: S2C) {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws: WebSocket) => {
  const conn = {
    send(data: string | ArrayBuffer, droppable = false) {
      if (ws.readyState !== ws.OPEN) return;
      // 网络慢的时候跳过快照（下一帧会带上最新状态），避免积压出几秒钟的延迟
      if (droppable && ws.bufferedAmount > DROP_BYTES) { dropped++; return; }
      const size = typeof data === 'string' ? data.length : data.byteLength;
      outBytes += size;
      ws.send(data, { compress: size > 200 });
    },
    buffered: () => ws.bufferedAmount,
  };
  const c: Client = {
    ws, room: null, id: 0, alive: true, budget: 200, browsing: false, lastStats: '', conn, pvp: null, pvpId: 0,
    uid: ++uidSeq, presence: null, lastTown: '',
    send: (msg) => conn.send(JSON.stringify(msg)),
  };
  const fail = (msg: string) => conn.send(JSON.stringify({ t: 'error', msg } satisfies S2C));
  const leavePvp = () => {
    pvp.cancel(c);
    if (c.pvp && !c.pvp.ended) c.pvp.leave(c.pvpId);
    c.pvp = null;
  };
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    if (--c.budget < 0) return;
    let msg: C2S;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'stats') { sendJson(c, { t: 'stats', stats: stats() }); return; }
    if (msg.t === 'browse') {
      c.browsing = !!msg.on;
      if (c.browsing) sendJson(c, { t: 'rooms', stats: stats(), rooms: publicRooms() });
      return;
    }
    if (msg.t === 'presence') {
      const prev = c.presence;
      const dex = Number.isInteger(msg.dex) && msg.dex >= 1 && msg.dex <= 151 ? msg.dex : 25;
      c.presence = { name: cleanName(msg.name), trainer: trainerOf(msg.trainer).id, dex, town: !!msg.town, busy: !!msg.busy, x: prev?.x ?? -1, y: prev?.y ?? -1, d: prev?.d ?? 0, m: 0 };
      if (c.presence.town) c.lastTown = '';
      return;
    }
    if (msg.t === 'tpos') {
      const p = c.presence;
      if (!p || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      p.x = Math.round(Math.max(0, Math.min(TOWN_W, msg.x)));
      p.y = Math.round(Math.max(0, Math.min(TOWN_H, msg.y)));
      p.d = Number.isInteger(msg.d) ? msg.d & 7 : 0;
      p.m = msg.m ? 1 : 0;
      return;
    }
    if (msg.t === 'pvpBoard') { sendJson(c, pvp.board(msg.mode, msg.pid, msg.secret)); return; }
    if (msg.t === 'pvpCancel') { if (pvp.cancel(c)) sendJson(c, { t: 'pvpCancelled' }); return; }
    if (msg.t === 'pvpQueue') {
      if (c.room) return fail('请先离开当前房间');
      const err = pvp.enqueue(c, msg);
      if (err) fail(err);
      else c.browsing = false;
      return;
    }
    if (msg.t === 'leave') {
      c.room?.leave(c.id);
      c.room = null;
      leavePvp();
      sendJson(c, { t: 'left' });
      return;
    }
    if (c.pvp && !c.pvp.ended) { c.pvp.handle(c.pvpId, msg); return; }
    if (!c.room) {
      if ((msg.t === 'create' || msg.t === 'join') && pvp.queued(c)) pvp.cancel(c);
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return fail('服务器房间已满，请稍后再试');
        const room = new Room(newCode());
        room.isPublic = msg.public !== false;
        room.onEmpty = () => rooms.delete(room.code);
        const res = room.join(conn, msg.name, msg.meta, msg.v, msg);
        if (typeof res === 'string') return fail(res);
        rooms.set(room.code, room);
        c.room = room; c.id = res; c.browsing = false;
        log(`房间 ${room.code} 创建`);
      } else if (msg.t === 'join') {
        const room = rooms.get(String(msg.code).trim());
        if (!room) return fail('找不到这个房间号');
        const res = room.join(conn, msg.name, msg.meta, msg.v, msg);
        if (typeof res === 'string') return fail(res);
        c.room = room; c.id = res; c.browsing = false;
      }
      return;
    }
    c.room.handle(c.id, msg);
  });
  ws.on('close', () => {
    c.room?.leave(c.id);
    c.room = null;
    leavePvp();
  });
  clients.add(c);
  ws.on('close', () => clients.delete(c));
});

const clients = new Set<Client>();

// 大厅：每 2 秒给浏览房间列表的人推送一次；不在对局里的人收到在线人数变化
let lastRooms = '';
setInterval(() => {
  const st = stats();
  const roomsJson = JSON.stringify({ t: 'rooms', stats: st, rooms: publicRooms() } satisfies S2C);
  const changed = roomsJson !== lastRooms;
  lastRooms = roomsJson;
  const statsJson = JSON.stringify({ t: 'stats', stats: st } satisfies S2C);
  for (const c of clients) {
    if (c.ws.readyState !== c.ws.OPEN) continue;
    if (c.browsing && changed) c.ws.send(roomsJson);
    else if (!c.room?.inGame && !(c.pvp && !c.pvp.ended) && c.lastStats !== statsJson) { c.lastStats = statsJson; c.ws.send(statsJson); }
  }
}, 2000);

/** 这位玩家现在在做什么 */
function whereOf(c: Client): TownWhere {
  if (c.pvp && !c.pvp.ended) return 'pvp';
  if (c.room?.inGame) return 'game';
  if (c.room) return 'room';
  if (c.presence?.busy) return 'game';
  return c.presence?.town ? 'town' : 'menu';
}

// 真新镇：每 0.25 秒把所有在线玩家的位置与状态发给镇上的玩家（没有变化就不发）
setInterval(() => {
  const peers: TownPeer[] = [];
  const inTown: Client[] = [];
  for (const c of clients) {
    const p = c.presence;
    if (!p || c.ws.readyState !== c.ws.OPEN) continue;
    const w = whereOf(c);
    if (w === 'town') inTown.push(c);
    if (peers.length < TOWN_MAX || w !== 'town') peers.push({ id: c.uid, name: p.name, trainer: p.trainer, dex: p.dex, x: p.x, y: p.y, d: p.d, m: p.m, w: TOWN_WHERE.indexOf(w) });
  }
  if (!inTown.length) return;
  const list = JSON.stringify(peers.slice(0, TOWN_MAX * 2));
  for (const c of inTown) {
    if (c.lastTown === list) continue;
    c.lastTown = list;
    c.conn.send(`{"t":"town","you":${c.uid},"peers":${list}}`, true);
  }
}, 250);

// 消息额度：每秒恢复，防止刷屏
setInterval(() => { for (const c of clients) c.budget = Math.min(200, c.budget + 120); }, 1000);

// 心跳
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 20000);

// 固定步长主循环
let last = performance.now();
let acc = 0;
const STEP = 1000 / TICK_RATE;
setInterval(() => {
  const now = performance.now();
  // 事件循环延迟：定时器本该每 STEP/2 触发一次，晚到的部分说明服务器忙不过来
  lagMax = Math.max(lagMax, now - last - STEP / 2);
  acc += now - last;
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    acc -= STEP;
    steps++;
    const t0 = performance.now();
    for (const room of rooms.values()) {
      try { room.update(); } catch (err) {
        console.error(`房间 ${room.code} 出错`, err);
        room.sim = null;
        room.sendLobby();
      }
    }
    for (const room of pvp.rooms) {
      try { room.update(); } catch (err) {
        console.error(`${room.code} 出错`, err);
        room.ended = true;
        for (const s of room.seats) s.conn?.send(JSON.stringify({ t: 'error', msg: '对战出错了，本场不计分', fatal: true } satisfies S2C));
      }
    }
    const dt = performance.now() - t0;
    tickSum += dt; tickN++; tickMax = Math.max(tickMax, dt);
  }
  if (acc > STEP * 4) acc = 0;
}, STEP / 2);

// 每秒汇总一次性能数据
setInterval(() => {
  perf.tickAvgMs = tickN ? Math.round((tickSum / tickN) * 100) / 100 : 0;
  perf.tickMaxMs = Math.round(tickMax * 100) / 100;
  perf.loopLagMs = Math.round(lagMax * 10) / 10;
  perf.outKBps = Math.round(outBytes / 102.4) / 10;
  perf.dropped = dropped;
  tickSum = 0; tickN = 0; tickMax = 0; outBytes = 0; dropped = 0; lagMax = 0;
}, 1000);

// 对战匹配
setInterval(() => pvp.tick(), 500);
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { pvp.saveNow(); process.exit(0); });
}

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}（房间数 ${rooms.size}）`);
}

server.listen(PORT, HOST, () => {
  console.log(`宝可肉鸽服务器已启动：http://localhost:${PORT}  （静态目录 ${STATIC_DIR}）`);
});
