/**
 * 联机服务器：静态托管前端 + WebSocket 房间（/ws）。
 * 每个房间在服务器上运行权威模拟，客户端只上报自己的位置与操作。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { C2S, S2C } from '../shared/protocol';
import { Room } from '../shared/room';
import { TICK_RATE } from '../shared/sim/game';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 300);
const here = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(here, '../dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const rooms = new Map<string, Room>();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.members.size, 0) }));
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

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: false });

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

interface Client { ws: WebSocket; room: Room | null; id: number; alive: boolean; budget: number }

wss.on('connection', (ws: WebSocket) => {
  const c: Client = { ws, room: null, id: 0, alive: true, budget: 200 };
  const conn = {
    send(data: string | ArrayBuffer) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    },
  };
  const fail = (msg: string) => conn.send(JSON.stringify({ t: 'error', msg, fatal: true } satisfies S2C));
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    if (--c.budget < 0) return;
    let msg: C2S;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (!c.room) {
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return fail('服务器房间已满，请稍后再试');
        const room = new Room(newCode());
        room.onEmpty = () => rooms.delete(room.code);
        const res = room.join(conn, msg.name, msg.meta, msg.v);
        if (typeof res === 'string') return fail(res);
        rooms.set(room.code, room);
        c.room = room; c.id = res;
        log(`房间 ${room.code} 创建`);
      } else if (msg.t === 'join') {
        const room = rooms.get(String(msg.code).trim());
        if (!room) return fail('找不到这个房间号');
        const res = room.join(conn, msg.name, msg.meta, msg.v);
        if (typeof res === 'string') return fail(res);
        c.room = room; c.id = res;
      }
      return;
    }
    c.room.handle(c.id, msg);
  });
  ws.on('close', () => {
    c.room?.leave(c.id);
    c.room = null;
  });
  clients.add(c);
  ws.on('close', () => clients.delete(c));
});

const clients = new Set<Client>();

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
  acc += now - last;
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    acc -= STEP;
    steps++;
    for (const room of rooms.values()) {
      try { room.update(); } catch (err) {
        console.error(`房间 ${room.code} 出错`, err);
        room.sim = null;
        room.sendLobby();
      }
    }
  }
  if (acc > STEP * 4) acc = 0;
}, STEP / 2);

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}（房间数 ${rooms.size}）`);
}

server.listen(PORT, HOST, () => {
  console.log(`宝可肉鸽服务器已启动：http://localhost:${PORT}  （静态目录 ${STATIC_DIR}）`);
});
