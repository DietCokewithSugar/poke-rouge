/**
 * Supabase：账号（Auth）与数据库（PostgREST）。
 * 浏览器只和游戏服务器通信，登录、云存档和对战数据都由服务器转给 Supabase——
 * 这样玩家只要连得上游戏服务器就能用（在国内比直接连 Supabase 稳定）。
 * 没有配置这三个环境变量时返回 null，游戏照常只用本机存档、对战数据存在文件里。
 */
export interface SupabaseConfig {
  url: string;
  /** 公开密钥（publishable / anon）：代表浏览器调用 Auth 时使用 */
  anonKey: string;
  /** 私密密钥（secret / service_role）：读写数据库，绕过行级权限，只能放在服务器上 */
  serviceKey: string;
}

export function supabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY)?.trim();
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

export interface AuthUser { id: string; email: string; provider: string }
export interface AuthSettings { google: boolean; signup: boolean; autoconfirm: boolean }
/** 失败时 data 里是 Supabase 原样返回的错误 */
export interface SbResult<T = unknown> { status: number; data: T }

type Json = Record<string, unknown>;

/** 旧版密钥是 JWT，可以放进 Authorization；新版 sb_ 开头的密钥只能放在 apikey 里 */
const isJwt = (k: string) => k.startsWith('eyJ');

export class Supabase {
  private users = new Map<string, { user: AuthUser; until: number }>();
  private cachedSettings: { at: number; value: AuthSettings } | null = null;

  constructor(readonly cfg: SupabaseConfig, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(url: string, init: { method?: string; body?: unknown; headers: Record<string, string> }): Promise<SbResult<T>> {
    const res = await this.fetchImpl(url, {
      method: init.method ?? 'GET',
      headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) { try { data = JSON.parse(text); } catch { data = { msg: text }; } }
    return { status: res.status, data: data as T };
  }

  /** Auth 接口；token 是玩家的登录令牌（没有时用公开密钥） */
  auth<T = Json>(path: string, o: { method?: string; body?: unknown; token?: string; query?: Record<string, string> } = {}): Promise<SbResult<T>> {
    const q = o.query ? `?${new URLSearchParams(o.query)}` : '';
    const bearer = o.token ?? (isJwt(this.cfg.anonKey) ? this.cfg.anonKey : '');
    return this.call<T>(`${this.cfg.url}/auth/v1${path}${q}`, {
      method: o.method, body: o.body,
      headers: { apikey: this.cfg.anonKey, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    });
  }

  /** 数据库接口（PostgREST，service role） */
  rest<T = Json[]>(path: string, o: { method?: string; body?: unknown; prefer?: string } = {}): Promise<SbResult<T>> {
    const key = this.cfg.serviceKey;
    return this.call<T>(`${this.cfg.url}/rest/v1${path}`, {
      method: o.method, body: o.body,
      headers: { apikey: key, ...(isJwt(key) ? { authorization: `Bearer ${key}` } : {}), ...(o.prefer ? { prefer: o.prefer } : {}) },
    });
  }

  /** 验证浏览器带来的登录令牌：向 Auth 查一次，结果缓存到令牌过期（最多 5 分钟） */
  async user(token: string): Promise<AuthUser | null> {
    if (!token || token.length > 4096) return null;
    const now = Date.now();
    const hit = this.users.get(token);
    if (hit && hit.until > now) return hit.user;
    const res = await this.auth<Json>('/user', { token });
    if (res.status !== 200 || !res.data || typeof res.data.id !== 'string') return null;
    const user = toUser(res.data);
    const exp = tokenExpiry(token);
    if (this.users.size > 2000) this.users.clear();
    this.users.set(token, { user, until: Math.min(now + 5 * 60_000, exp ? exp - 5000 : now + 60_000) });
    return user;
  }

  /** 退出登录后令牌立刻作废 */
  forget(token: string) { this.users.delete(token); }

  /** Auth 的公开设置：有没有开 Google 登录、能不能注册、注册要不要验证邮箱（缓存 5 分钟） */
  async settings(): Promise<AuthSettings> {
    const now = Date.now();
    if (this.cachedSettings && now - this.cachedSettings.at < 5 * 60_000) return this.cachedSettings.value;
    const res = await this.auth<Json>('/settings');
    const d = res.status === 200 && res.data ? res.data : {};
    const external = (d.external ?? {}) as Record<string, boolean>;
    const value: AuthSettings = { google: !!external.google, signup: !d.disable_signup, autoconfirm: !!d.mailer_autoconfirm };
    if (res.status === 200) this.cachedSettings = { at: now, value };
    return value;
  }
}

export function toUser(u: Json): AuthUser {
  const meta = (u.app_metadata ?? {}) as { provider?: string };
  return { id: String(u.id), email: typeof u.email === 'string' ? u.email : '', provider: meta.provider ?? 'email' };
}

/** 令牌里的过期时间（毫秒）；只读不验证，验证交给 Auth */
export function tokenExpiry(token: string): number {
  try {
    const part = token.split('.')[1];
    if (!part) return 0;
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
