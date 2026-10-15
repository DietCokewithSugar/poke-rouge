/**
 * 账号与云存档的 HTTP 接口：/api/config、/api/auth/*、/api/save。
 * 登录相关的请求由服务器转给 Supabase Auth，错误翻译成中文；
 * 云存档按版本号写入：拿着旧版本号的保存会被拒绝，并返回云端现在的进度，由玩家决定保留哪一份。
 */
import type http from 'node:http';
import { toUser, type SbResult, type Supabase } from './supabase';

type Json = Record<string, unknown>;

/** 一份存档最大多少字节（一般只有几十 KB） */
export const MAX_SAVE_BYTES = 300 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: '邮箱或密码不对',
  user_already_exists: '这个邮箱已经注册过了，直接登录吧',
  email_exists: '这个邮箱已经注册过了，直接登录吧',
  weak_password: '密码太简单了，至少要 6 位',
  email_address_invalid: '邮箱格式不对',
  email_address_not_authorized: '这个邮箱暂时收不到邮件，请换一个邮箱',
  email_not_confirmed: '邮箱还没有验证：请先点开确认邮件里的链接',
  signup_disabled: '现在暂时不能注册新账号',
  over_request_rate_limit: '操作太频繁了，请过几分钟再试',
  over_email_send_rate_limit: '邮件发送太频繁了，请过一会儿再试',
  same_password: '新密码不能和原来的一样',
  refresh_token_not_found: '登录已过期，请重新登录',
  refresh_token_already_used: '登录已过期，请重新登录',
  session_not_found: '登录已过期，请重新登录',
  session_expired: '登录已过期，请重新登录',
  bad_jwt: '登录已过期，请重新登录',
  user_not_found: '登录已过期，请重新登录',
  user_banned: '这个账号已被停用',
  otp_expired: '链接已经过期了，请重新发送一封',
  reauthentication_needed: '需要重新登录后才能修改密码',
};

const AUTH_MESSAGES: [RegExp, string][] = [
  [/refresh token/i, '登录已过期，请重新登录'],
  [/invalid login credentials/i, '邮箱或密码不对'],
  [/already (been )?registered|already exists/i, '这个邮箱已经注册过了，直接登录吧'],
  [/password should be|password is too/i, '密码太简单了，至少要 6 位'],
  [/rate limit/i, '操作太频繁了，请过几分钟再试'],
  [/email not confirmed/i, '邮箱还没有验证：请先点开确认邮件里的链接'],
  [/validate email|invalid format|invalid email/i, '邮箱格式不对'],
  [/signups not allowed/i, '现在暂时不能注册新账号'],
  [/different from the old|same password/i, '新密码不能和原来的一样'],
  [/expired|invalid.*(otp|token|link)/i, '链接已经过期了，请重新发送一封'],
];

/** Supabase Auth 的错误 → 中文 */
export function authError(r: SbResult): { status: number; error: string; code: string } {
  const d = (r.data ?? {}) as Json;
  const code = String(d.error_code ?? (typeof d.code === 'string' ? d.code : '') ?? '') || String(d.error ?? '');
  const msg = String(d.msg ?? d.error_description ?? d.message ?? '');
  const byMsg = AUTH_MESSAGES.find(([re]) => re.test(msg))?.[1];
  const error = (code === 'invalid_grant' ? byMsg : AUTH_ERRORS[code] ?? byMsg) ?? '登录服务出错了，请稍后再试';
  const status = r.status >= 400 && r.status < 500 ? r.status : 502;
  return { status, error, code };
}

/** Auth 返回的会话 → 给浏览器的会话（expires_at 换成毫秒） */
export function sessionOf(d: Json) {
  const expiresAt = typeof d.expires_at === 'number' ? d.expires_at * 1000 : Date.now() + (Number(d.expires_in) || 3600) * 1000;
  return {
    access_token: String(d.access_token ?? ''), refresh_token: String(d.refresh_token ?? ''), expires_at: expiresAt,
    user: d.user && typeof d.user === 'object' ? toUser(d.user as Json) : null,
  };
}

/** 同一来源的请求次数限制（滑动窗口） */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const ok = list.length < max;
    if (ok) list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 20000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < windowMs)) this.hits.delete(k);
    return ok;
  }
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** 读 JSON 请求体；太大或不是对象时返回原因 */
function readJson(req: http.IncomingMessage, limit: number): Promise<Json | 'too_large' | 'bad'> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => {
      if (size > limit) { resolve('too_large'); return; }
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : 'bad');
      } catch { resolve('bad'); }
    });
    req.on('error', () => resolve('bad'));
  });
}

function bearer(req: http.IncomingMessage): string {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function clientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}

/** 云存档的一行 */
export interface CloudSave { data: Json; rev: number; device: string | null; updatedAt: string }

const toSave = (row: Json): CloudSave => ({ data: row.data as Json, rev: Number(row.rev), device: (row.device as string) ?? null, updatedAt: String(row.updated_at) });

export interface AccountOptions {
  /** 允许登录后跳回的网址（逗号分隔）；不设时只允许游戏服务器自己的域名 */
  publicUrl?: string;
}

/**
 * 返回处理函数：是账号相关的路径就处理并返回 true。
 * sb 为 null（服务器没有配置 Supabase）时，/api/config 告诉前端没有云存档。
 */
export function accountRoutes(sb: Supabase | null, opts: AccountOptions = {}) {
  const limiter = new RateLimiter();
  const extraHosts = (opts.publicUrl ?? '').split(',').map((s) => s.trim()).filter(Boolean).flatMap((s) => { try { return [new URL(s).host]; } catch { return []; } });

  /** 登录、找回密码后跳回的地址：只允许游戏自己的网址，防止被拿去做跳转到别处的链接 */
  const safeRedirect = (raw: unknown, req: http.IncomingMessage): string | null => {
    if (typeof raw !== 'string' || raw.length > 500) return null;
    let u: URL;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    if (u.host !== req.headers.host && !extraHosts.includes(u.host)) return null;
    u.hash = '';
    return u.toString();
  };

  const credentials = (body: Json): { email: string; password: string } | string => {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL.test(email) || email.length > 254) return '邮箱格式不对';
    if (password.length < 6) return '密码太简单了，至少要 6 位';
    if (Buffer.byteLength(password) > 72) return '密码太长了（最多 72 个字符）';
    return { email, password };
  };

  async function currentSave(userId: string): Promise<CloudSave | null> {
    const r = await sb!.rest<Json[]>(`/saves?user_id=eq.${userId}&select=data,rev,device,updated_at`);
    if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`读取云存档失败 ${r.status}`);
    return r.data[0] ? toSave(r.data[0]) : null;
  }

  return async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== '/api/config' && p !== '/api/save' && !p.startsWith('/api/auth/')) return false;
    // 前端和服务器分开部署（VITE_SERVER_URL）时也能用：只用 Authorization 头，不用 cookie
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return true; }
    try {
      if (p === '/api/config') {
        if (!sb) { json(res, 200, { cloud: false }); return true; }
        json(res, 200, { cloud: true, ...(await sb.settings()) });
        return true;
      }
      if (!sb) { json(res, 503, { error: '服务器没有开启云存档' }); return true; }
      const ip = clientIp(req);

      if (p === '/api/auth/google' && req.method === 'GET') {
        const to = safeRedirect(url.searchParams.get('redirect'), req);
        if (!to) { json(res, 400, { error: '跳转地址不对' }); return true; }
        res.writeHead(302, { location: `${sb.cfg.url}/auth/v1/authorize?${new URLSearchParams({ provider: 'google', redirect_to: to })}` });
        res.end();
        return true;
      }

      if (p === '/api/auth/user' && req.method === 'GET') {
        const user = await sb.user(bearer(req));
        if (!user) json(res, 401, { error: '登录已过期，请重新登录' });
        else json(res, 200, { user });
        return true;
      }

      if (p === '/api/save') {
        const token = bearer(req);
        const user = await sb.user(token);
        if (!user || !UUID.test(user.id)) { json(res, 401, { error: '登录已过期，请重新登录' }); return true; }
        if (req.method === 'GET') {
          json(res, 200, { save: await currentSave(user.id) });
          return true;
        }
        if (req.method !== 'PUT') { json(res, 405, { error: '不支持的请求' }); return true; }
        if (!limiter.allow(`save:${user.id}`, 40, 60_000)) { json(res, 429, { error: '保存太频繁了，稍后会自动再试' }); return true; }
        const body = await readJson(req, MAX_SAVE_BYTES + 4096);
        if (body === 'too_large') { json(res, 413, { error: '存档太大了' }); return true; }
        if (body === 'bad' || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) { json(res, 400, { error: '存档格式不对' }); return true; }
        const baseRev = Number(body.baseRev);
        if (!Number.isInteger(baseRev) || baseRev < 0) { json(res, 400, { error: '存档版本不对' }); return true; }
        const device = typeof body.device === 'string' ? body.device.slice(0, 64) : null;
        const row = { data: body.data, device, updated_at: new Date().toISOString() };
        let r: SbResult<Json[]>;
        if (baseRev === 0) {
          r = await sb.rest<Json[]>('/saves', { method: 'POST', body: { user_id: user.id, rev: 1, ...row }, prefer: 'return=representation' });
          if (r.status === 201 && Array.isArray(r.data) && r.data[0]) { json(res, 200, { rev: 1, updatedAt: row.updated_at }); return true; }
          if (r.status !== 409) throw new Error(`写入云存档失败 ${r.status}`);
        } else {
          r = await sb.rest<Json[]>(`/saves?user_id=eq.${user.id}&rev=eq.${baseRev}`, { method: 'PATCH', body: { rev: baseRev + 1, ...row }, prefer: 'return=representation' });
          if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`写入云存档失败 ${r.status}`);
          if (r.data[0]) { json(res, 200, { rev: baseRev + 1, updatedAt: row.updated_at }); return true; }
        }
        // 版本号对不上：别的设备已经保存过更新的进度
        json(res, 409, { error: '云端的进度已经在别的设备上更新了', save: await currentSave(user.id) });
        return true;
      }

      // ---- 登录相关：都是 POST，按来源 IP 限制次数（Supabase 那边看到的都是游戏服务器的 IP）
      if (req.method !== 'POST') { json(res, 405, { error: '不支持的请求' }); return true; }
      const refresh = p === '/api/auth/refresh';
      if (!limiter.allow(`${refresh ? 'refresh' : 'auth'}:${ip}`, refresh ? 120 : 30, 10 * 60_000)) {
        json(res, 429, { error: '操作太频繁了，请过几分钟再试' });
        return true;
      }
      const body = await readJson(req, 8 * 1024);
      if (typeof body === 'string') { json(res, 400, { error: '请求格式不对' }); return true; }
      const fail = (r: SbResult) => { const e = authError(r); json(res, e.status, { error: e.error, code: e.code }); };

      switch (p) {
        case '/api/auth/signup': {
          const c = credentials(body);
          if (typeof c === 'string') { json(res, 400, { error: c }); return true; }
          const to = safeRedirect(body.redirect, req);
          const r = await sb.auth<Json>('/signup', { method: 'POST', body: c, query: to ? { redirect_to: to } : undefined });
          if (r.status !== 200) { fail(r); return true; }
          // 后台开着「注册要验证邮箱」时没有会话：让玩家去点确认邮件
          if (!r.data.access_token) { json(res, 200, { confirm: true }); return true; }
          json(res, 200, { session: sessionOf(r.data) });
          return true;
        }
        case '/api/auth/login': {
          const c = credentials(body);
          if (typeof c === 'string') { json(res, 400, { error: c === '密码太简单了，至少要 6 位' ? '邮箱或密码不对' : c }); return true; }
          const r = await sb.auth<Json>('/token', { method: 'POST', body: c, query: { grant_type: 'password' } });
          if (r.status !== 200) { fail(r); return true; }
          json(res, 200, { session: sessionOf(r.data) });
          return true;
        }
        case '/api/auth/refresh': {
          const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
          if (!token || token.length > 512) { json(res, 400, { error: '登录已过期，请重新登录' }); return true; }
          const r = await sb.auth<Json>('/token', { method: 'POST', body: { refresh_token: token }, query: { grant_type: 'refresh_token' } });
          if (r.status !== 200) { fail(r); return true; }
          json(res, 200, { session: sessionOf(r.data) });
          return true;
        }
        case '/api/auth/recover': {
          const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
          if (!EMAIL.test(email)) { json(res, 400, { error: '邮箱格式不对' }); return true; }
          const to = safeRedirect(body.redirect, req);
          const r = await sb.auth('/recover', { method: 'POST', body: { email }, query: to ? { redirect_to: to } : undefined });
          if (r.status !== 200) { fail(r); return true; }
          json(res, 200, { ok: true });
          return true;
        }
        case '/api/auth/verify': {
          const tokenHash = typeof body.token_hash === 'string' ? body.token_hash : '';
          const type = typeof body.type === 'string' && ['recovery', 'signup', 'email', 'magiclink', 'invite'].includes(body.type) ? body.type : '';
          if (!tokenHash || !type) { json(res, 400, { error: '链接不完整' }); return true; }
          const r = await sb.auth<Json>('/verify', { method: 'POST', body: { type, token_hash: tokenHash } });
          if (r.status !== 200 || !r.data.access_token) { fail(r); return true; }
          json(res, 200, { session: sessionOf(r.data) });
          return true;
        }
        case '/api/auth/password': {
          const token = bearer(req);
          const password = typeof body.password === 'string' ? body.password : '';
          if (password.length < 6) { json(res, 400, { error: '密码太简单了，至少要 6 位' }); return true; }
          if (Buffer.byteLength(password) > 72) { json(res, 400, { error: '密码太长了（最多 72 个字符）' }); return true; }
          const r = await sb.auth('/user', { method: 'PUT', body: { password }, token });
          if (r.status !== 200) { fail(r); return true; }
          json(res, 200, { ok: true });
          return true;
        }
        case '/api/auth/logout': {
          const token = bearer(req);
          if (token) {
            // 只退出这台设备，其他设备保持登录
            await sb.auth('/logout', { method: 'POST', token, query: { scope: 'local' } }).catch(() => null);
            sb.forget(token);
          }
          json(res, 200, { ok: true });
          return true;
        }
      }
      json(res, 404, { error: '没有这个接口' });
    } catch (err) {
      console.error('账号接口出错', err);
      if (!res.headersSent) json(res, 502, { error: '暂时连不上账号服务，请稍后再试' });
    }
    return true;
  };
}
