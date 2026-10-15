/**
 * 云存档：进度怎么比较、账号接口（用假的 Supabase）、以及本机 Supabase 真的走一遍。
 * 没在本机起数据库时，真连的那一段会跳过。
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { accountRoutes, authError, RateLimiter } from '../src/server/account';
import { Supabase, supabaseConfig, type Supabase as SupabaseType } from '../src/server/supabase';
import { SupabasePvpStore, playerRow, rowPlayer, type StoredPlayer } from '../src/server/pvpstore';
import { fingerprint, hasProgress, planSync, summarize } from '../src/shared/cloudsave';

const USER = '11111111-1111-4111-8111-111111111111';

test('两份进度：字段顺序不同仍是同一份，画面设置不参与比较', () => {
  const a = { name: '小智', stardust: 12, settings: { volume: 1, uiScale: 0.9 }, stats: { runs: 2, wins: 1 } };
  const b = { stardust: 12, stats: { wins: 1, runs: 2 }, name: '小智', settings: { volume: 0 } };
  assert.equal(fingerprint(a), fingerprint(b));
  assert.equal(hasProgress({ settings: { volume: 1 }, stardust: 0 }), false);
  assert.equal(hasProgress({ setup: true }), true);
  assert.equal(hasProgress({ stats: { runs: 1 } }), true);
  assert.equal(hasProgress({ gymLog: { pewter: { tries: 1, wins: 0 } } }), true);
  const s = summarize({ name: ' 小霞 ', trainer: 'misty', stardust: 3.8, badges: { pewter: 1 }, party: [{}], shiny: ['pikachu'], pvpBest: 1100, stats: { runs: 4 } });
  assert.equal(s.name, '小霞');
  assert.equal(s.stardust, 3);
  assert.equal(s.badges, 1);
  assert.equal(s.shinies, 1);
  assert.equal(s.pvpBest, 1100);
});

test('同步策略：空账号上传、没改过就用云端、两边都改过要问、别的账号的副本不静默拷贝', () => {
  const guest = { setup: true, name: '小智', stardust: 5 };
  const cloud = { rev: 3, data: { setup: true, name: '小霞', stardust: 9 } };
  assert.deepEqual(planSync({ userId: 'a', local: guest, cloud: null, synced: null }), { do: 'upload', baseRev: 0 });
  assert.deepEqual(planSync({ userId: 'a', local: { stardust: 0 }, cloud: null, synced: null }), { do: 'keep', rev: 0 });
  assert.deepEqual(planSync({ userId: 'a', local: cloud.data, cloud, synced: null }), { do: 'keep', rev: 3 });
  // 这台设备记下的就是这份，云端后来变了：直接下载
  const key = fingerprint(guest);
  assert.deepEqual(planSync({ userId: 'a', local: guest, cloud, synced: { userId: 'a', rev: 2, key } }), { do: 'download' });
  // 这台设备自己也改过
  assert.deepEqual(planSync({ userId: 'a', local: guest, cloud, synced: { userId: 'a', rev: 2, key: 'other' } }), { do: 'ask' });
  // 空的新账号，但这份进度属于上一个账号
  assert.deepEqual(planSync({ userId: 'b', local: guest, cloud: null, synced: { userId: 'a', rev: 2, key } }), { do: 'ask-upload' });
  // 新账号自己有云端进度，本机还是上一个账号的副本：用云端
  assert.deepEqual(planSync({ userId: 'b', local: guest, cloud, synced: { userId: 'a', rev: 2, key } }), { do: 'download' });
});

test('登录错误翻成中文；次数限制按窗口计算', () => {
  assert.equal(authError({ status: 400, data: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }).error, '邮箱或密码不对');
  assert.equal(authError({ status: 422, data: { error_code: 'user_already_exists', msg: 'already registered' } }).error, '这个邮箱已经注册过了，直接登录吧');
  assert.match(authError({ status: 500, data: { msg: 'nope' } }).error, /稍后再试/);
  const lim = new RateLimiter();
  assert.equal(lim.allow('a', 2, 1000, 0), true);
  assert.equal(lim.allow('a', 2, 1000, 10), true);
  assert.equal(lim.allow('a', 2, 1000, 20), false);
  assert.equal(lim.allow('a', 2, 1000, 2000), true);
});

/** 假的 Supabase：只实现账号接口会用到的方法 */
function fakeSb() {
  const saves = new Map<string, { user_id: string; data: unknown; rev: number; device: string | null; updated_at: string }>();
  const sb = {
    cfg: { url: 'http://supabase.local', anonKey: 'eyJ.test', serviceKey: 'eyJ.test' },
    settings: async () => ({ google: true, signup: true, autoconfirm: true }),
    user: async (token: string) => (token === 'tok' ? { id: USER, email: 'a@b.co', provider: 'email' } : null),
    forget() {},
    async auth(path: string, o: { method?: string; body?: unknown; query?: Record<string, string> }) {
      const body = (o.body ?? {}) as { email?: string; password?: string };
      if (path === '/signup') {
        if (body.email === 'exists@b.co') return { status: 422, data: { error_code: 'user_already_exists', msg: 'already' } };
        return { status: 200, data: session(body.email ?? '') };
      }
      if (path === '/token' && o.query?.grant_type === 'password') {
        if (body.password !== 'secret12') return { status: 400, data: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } };
        return { status: 200, data: session(body.email ?? '') };
      }
      if (path === '/recover') return { status: 200, data: {} };
      if (path === '/logout') return { status: 204, data: {} };
      return { status: 404, data: {} };
    },
    async rest(path: string, o: { method?: string; body?: unknown } = {}) {
      const id = /user_id=eq\.([^&]+)/.exec(path)?.[1];
      if ((!o.method || o.method === 'GET') && path.startsWith('/saves')) {
        const row = id ? saves.get(id) : undefined;
        return { status: 200, data: row ? [row] : [] };
      }
      if (o.method === 'POST' && path === '/saves') {
        const body = o.body as { user_id: string; data: unknown; rev: number; device: string | null; updated_at: string };
        if (saves.has(body.user_id)) return { status: 409, data: { code: '23505' } };
        saves.set(body.user_id, body);
        return { status: 201, data: [body] };
      }
      if (o.method === 'PATCH' && path.startsWith('/saves')) {
        const rev = Number(/rev=eq\.(\d+)/.exec(path)?.[1]);
        const row = id ? saves.get(id) : undefined;
        const body = o.body as { rev: number; data: unknown; device: string | null; updated_at: string };
        if (!row || row.rev !== rev) return { status: 200, data: [] };
        Object.assign(row, body);
        return { status: 200, data: [{ ...row }] };
      }
      return { status: 500, data: { msg: path } };
    },
  };
  return sb;
}

function session(email: string) {
  return { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: USER, email, app_metadata: { provider: 'email' } } };
}

function serve(handle: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<boolean>) {
  const server = http.createServer((req, res) => {
    const host = req.headers.host || '127.0.0.1';
    void handle(req, res, new URL(req.url || '/', `http://${host}`));
  });
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function call(port: number, path: string, init: RequestInit = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, data, location: res.headers.get('location') };
}

test('账号接口：注册登录、云存档版本对不上就拒绝、跳转地址不能指向别处', async () => {
  const handle = accountRoutes(fakeSb() as unknown as SupabaseType, { publicUrl: 'https://game.example' });
  const srv = await serve(handle);
  after(() => srv.close());
  const bad = await call(srv.port, '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nope', password: 'secret12' }) });
  assert.equal(bad.status, 400);
  assert.match(String(bad.data.error), /邮箱/);
  const exists = await call(srv.port, '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'exists@b.co', password: 'secret12' }) });
  assert.equal(exists.status, 422);
  assert.match(String(exists.data.error), /已经注册/);
  const wrong = await call(srv.port, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'short' }) });
  assert.equal(wrong.status, 400);
  assert.match(String(wrong.data.error), /邮箱或密码不对/);
  const ok = await call(srv.port, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'secret12' }) });
  assert.equal(ok.status, 200);
  const token = (ok.data.session as { access_token: string }).access_token;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const empty = await call(srv.port, '/api/save', { headers: auth });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.save, null);
  const put = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 0, data: { name: '小智', stardust: 4 }, device: 'd1' }) });
  assert.equal(put.status, 200);
  assert.equal(put.data.rev, 1);
  const clash = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 0, data: { name: '另一台', stardust: 1 } }) });
  assert.equal(clash.status, 409);
  assert.equal((clash.data.save as { rev: number }).rev, 1);
  const next = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 1, data: { name: '小智', stardust: 8 } }) });
  assert.equal(next.status, 200);
  assert.equal(next.data.rev, 2);
  const stale = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 1, data: { name: '旧的' } }) });
  assert.equal(stale.status, 409);
  assert.equal((stale.data.save as { data: { stardust: number } }).data.stardust, 8);
  const redir = await fetch(`http://127.0.0.1:${srv.port}/api/auth/google?redirect=${encodeURIComponent('https://evil.example/steal')}`, { redirect: 'manual' });
  assert.equal(redir.status, 400);
  const okGo = await fetch(`http://127.0.0.1:${srv.port}/api/auth/google?redirect=${encodeURIComponent('https://game.example/play')}`, { redirect: 'manual' });
  assert.equal(okGo.status, 302);
  assert.match(okGo.headers.get('location') || '', /supabase\.local\/auth\/v1\/authorize/);
  assert.match(okGo.headers.get('location') || '', /game\.example/);
  const sneak = await fetch(`http://127.0.0.1:${srv.port}/api/auth/google?redirect=${encodeURIComponent('http://user:pass@127.0.0.1/x')}`, { redirect: 'manual' });
  assert.equal(sneak.status, 400);
  const cfg = await call(srv.port, '/api/config');
  assert.equal(cfg.data.cloud, true);
  assert.equal(cfg.data.google, true);
  assert.equal('serviceKey' in cfg.data, false);
});

test('没配置 Supabase 时告诉前端没有云存档', async () => {
  const handle = accountRoutes(null);
  const srv = await serve(handle);
  after(() => srv.close());
  const cfg = await call(srv.port, '/api/config');
  assert.deepEqual(cfg.data, { cloud: false });
  const save = await call(srv.port, '/api/save');
  assert.equal(save.status, 503);
});

const cfg = supabaseConfig();
const loopback = !!cfg && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(cfg.url);

test('本机 Supabase：注册、云存档冲突、对战数据写进数据库', { skip: loopback ? false : '没有本机 Supabase' }, async () => {
  const sb = new Supabase(cfg!);
  const ping = await sb.auth('/settings').catch(() => null);
  if (!ping || ping.status !== 200) return;
  const handle = accountRoutes(sb, { publicUrl: 'http://127.0.0.1:8787' });
  const srv = await serve(handle);
  after(() => srv.close());
  const email = `cloud${Date.now()}@poke-rouge.test`;
  const signed = await call(srv.port, '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret12' }) });
  assert.equal(signed.status, 200, JSON.stringify(signed.data));
  const token = (signed.data.session as { access_token: string }).access_token;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const put = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 0, data: { name: '小智', stardust: 6, setup: true }, device: 'dev' }) });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.rev, 1);
  const clash = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 0, data: { name: '晚到的' } }) });
  assert.equal(clash.status, 409);
  const upd = await call(srv.port, '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ baseRev: 1, data: { name: '小智', stardust: 7, setup: true } }) });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.rev, 2);
  const got = await call(srv.port, '/api/save', { headers: auth });
  assert.equal((got.data.save as { data: { stardust: number }; rev: number }).rev, 2);
  assert.equal((got.data.save as { data: { stardust: number } }).data.stardust, 7);
  const pass = await call(srv.port, '/api/auth/password', { method: 'POST', headers: auth, body: JSON.stringify({ password: 'secret13' }) });
  assert.equal(pass.status, 200, JSON.stringify(pass.data));
  const again = await call(srv.port, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret13' }) });
  assert.equal(again.status, 200);

  const store = new SupabasePvpStore(sb);
  const pid = `t${Date.now().toString(36)}abcd`;
  const player: StoredPlayer = { pid, hash: 'abc', name: '测试', created: Date.now(), last: Date.now(), modes: { '1v1': { rating: 1040, best: 1040, wins: 1, losses: 0, draws: 0, streak: 1, games: 1, dex: 4 } }, history: [] };
  await store.save({ players: [player], ghosts: [], removedGhosts: [], all: { players: [player], ghosts: [] } });
  const loaded = await store.load();
  const back = loaded.players.find((p) => p.pid === pid);
  assert.ok(back, '数据库里应该有刚写入的训练家');
  assert.equal(back!.modes['1v1']?.rating, 1040);
  assert.equal(rowPlayer(playerRow(player)).name, '测试');
  await sb.rest(`/pvp_players?pid=eq.${pid}`, { method: 'DELETE', prefer: 'return=minimal' });
  const user = await sb.auth<{ id: string }>('/user', { token });
  if (user.status === 200 && user.data.id) await sb.rest(`/saves?user_id=eq.${user.data.id}`, { method: 'DELETE', prefer: 'return=minimal' });
});
