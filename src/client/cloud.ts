/**
 * 账号与云存档。浏览器只请求游戏服务器（/api/auth、/api/save），由服务器转给 Supabase。
 * 没登录、服务器没开云存档、或者暂时连不上时，游戏照常进行，进度留在这台设备上。
 */
import { fingerprint, hasProgress, planSync, summarize, type SaveSummary, type SyncMeta } from '../shared/cloudsave';
import { adoptCloud, type Profile } from './save';

const SESSION_KEY = 'poke-rouge-account';
const META_KEY = 'poke-rouge-cloud-meta';
const DEVICE_KEY = 'poke-rouge-device';

export interface AccountUser { id: string; email: string; provider: string }
export interface AccountSession { access_token: string; refresh_token: string; expires_at: number; user: AccountUser }

interface CloudConfig { cloud: boolean; google: boolean; signup: boolean; autoconfirm: boolean }
interface CloudRow { data: Record<string, unknown>; rev: number; device: string | null; updatedAt: string }

export type SyncFlag = 'idle' | 'saving' | 'saved' | 'offline' | 'queued';

/** 需要玩家决定保留哪一份 */
export interface Decision {
  kind: 'diverge' | 'empty';
  rev: number;
  data: unknown;
  updatedAt: string;
  local: SaveSummary;
  remote: SaveSummary | null;
}

export interface CloudView {
  phase: 'loading' | 'off' | 'guest' | 'in' | 'recovery';
  google: boolean;
  signup: boolean;
  autoconfirm: boolean;
  email: string;
  provider: string;
  sync: SyncFlag;
  /** 注册成功但服务器要求先点确认邮件 */
  confirmMail: boolean;
  /** 找回密码的邮件已发出 */
  mailSent: boolean;
  decision: Decision | null;
  /** 玩家选了「先不选」 */
  held: boolean;
  status: string;
}

type Json = Record<string, unknown>;

function apiBase(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return location.origin;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const a = new Uint8Array(8);
      crypto.getRandomValues(a);
      id = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'device';
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch { /* 隐私模式 */ }
}

export class Cloud {
  profile: Profile | null = null;
  /** 不在对局中才上传、才弹出选择（对局中先记着，回到镇上再同步） */
  gate: () => boolean = () => true;
  onChange: (kind: 'auth' | 'sync') => void = () => {};
  onConflict: () => void = () => {};
  onApplied: () => void = () => {};

  private config: CloudConfig | null = null;
  private session: AccountSession | null = null;
  private meta: SyncMeta | null = null;
  private sync: SyncFlag = 'idle';
  private phase: CloudView['phase'] = 'loading';
  private confirmMail = false;
  private mailSent = false;
  private recovery = false;
  decision: Decision | null = null;
  held = false;
  /** 登录发生在对局中：等离开对局再和云端对齐 */
  private defer = false;
  private ready = false;
  private applying = false;
  private dirty = false;
  private busy = false;
  private again = false;
  private timer = 0;
  private retry = 0;
  private offlineNoted = false;
  /** 邮件 / Google 跳回来时地址上的令牌。要在标题页改地址之前先摘下来 */
  private pendingUrl: { access: string; refresh: string; type: string; tokenHash: string; expiresAt: string; expiresIn: string; error: string } | null = null;

  constructor() {
    this.session = readJson<AccountSession>(SESSION_KEY);
    this.meta = readJson<SyncMeta>(META_KEY);
    if (this.session && (!this.session.access_token || !this.session.user?.id)) this.session = null;
  }

  view(): CloudView {
    const c = this.config;
    return {
      phase: this.phase,
      google: !!c?.google,
      signup: c ? c.signup : true,
      autoconfirm: c ? c.autoconfirm : true,
      email: this.session?.user.email ?? '',
      provider: this.session?.user.provider ?? '',
      sync: this.sync,
      confirmMail: this.confirmMail,
      mailSent: this.mailSent,
      decision: this.decision,
      held: this.held,
      status: this.statusLine(),
    };
  }

  menuHint(): { title: string; detail: string } {
    const v = this.view();
    if (v.phase === 'loading') return { title: '账号', detail: '正在连接账号服务…' };
    if (v.phase === 'off') return { title: '账号', detail: '这台服务器没有云存档' };
    if (v.decision) return { title: '账号', detail: '云端和本机进度不一样，点这里选择' };
    if (v.phase === 'in') {
      if (v.sync === 'offline') return { title: '账号', detail: '云端暂时连不上，进度在这台设备上' };
      if (v.sync === 'saving' || v.sync === 'queued') return { title: '账号', detail: v.sync === 'queued' ? '这局结束后保存到云端' : '正在保存到云端…' };
      return { title: '账号', detail: v.email ? `已登录 · ${v.email}` : '已登录' };
    }
    return { title: '账号', detail: '登录后换设备也能继续' };
  }

  statusLine(): string {
    if (this.sync === 'saving') return '正在保存到云端…';
    if (this.sync === 'queued') return '这局结束后保存到云端';
    if (this.sync === 'offline') return '云端暂时连不上，进度先存在这台设备上，连上后会自动同步';
    if (this.sync === 'saved') return '已同步到云端';
    if (this.phase === 'in') return '已登录。宝可梦、背包、星之沙、研究所、成就、徽章、训练家和对战身份会自动保存';
    if (this.phase === 'off') return '这台服务器没有开启云存档，进度只存在这台设备上';
    if (this.phase === 'loading') return '正在连接账号服务…';
    return '不登录也能玩。登录后换一台设备，进度还在';
  }

  googleUrl(): string {
    const back = `${location.origin}${location.pathname}`;
    return `${apiBase()}/api/auth/google?redirect=${encodeURIComponent(back)}`;
  }

  /**
   * 把地址栏里的登录令牌先摘下来。
   * 标题页会改掉地址（邀请房间号），必须在那之前调用，否则邮件和 Google 跳回来的令牌会丢。
   */
  captureUrl() {
    if (this.pendingUrl) return;
    const hash = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '');
    const q = new URLSearchParams(location.search);
    const access = hash.get('access_token') || '';
    const refresh = hash.get('refresh_token') || '';
    const tokenHash = q.get('token_hash') || '';
    const error = hash.get('error_description') || q.get('error_description') || '';
    const dirty = !!(access || refresh || tokenHash || hash.get('error') || q.get('error'));
    if (!dirty) return;
    this.pendingUrl = {
      access, refresh, tokenHash, error,
      type: hash.get('type') || q.get('type') || '',
      expiresAt: hash.get('expires_at') || '',
      expiresIn: hash.get('expires_in') || '',
    };
    const url = new URL(location.href);
    url.hash = '';
    for (const k of ['token_hash', 'type', 'error', 'error_description', 'error_code', 'code']) url.searchParams.delete(k);
    history.replaceState(null, '', url.pathname + url.search);
  }

  /** 打开游戏时调用：读配置、处理邮件链接、和云端对齐 */
  async boot(p: Profile): Promise<'recovery' | 'ok'> {
    this.profile = p;
    try {
      await this.loadConfig();
      const fromUrl = await this.consumeUrl();
      if (!this.config?.cloud) {
        this.phase = this.config ? 'off' : 'guest';
        this.ready = true;
        this.emit('auth');
        return 'ok';
      }
      if (!(await this.token())) {
        this.phase = 'guest';
        this.ready = true;
        this.emit('auth');
        return 'ok';
      }
      this.phase = 'in';
      if (fromUrl === 'recovery' || this.recovery) {
        this.recovery = true;
        this.phase = 'recovery';
      }
      if (this.gate()) await this.reconcile();
      else this.defer = true;
      this.ready = true;
      this.emit('auth');
      return this.recovery ? 'recovery' : 'ok';
    } catch (err) {
      console.error('云存档初始化失败', err);
      this.sync = 'offline';
      this.phase = this.session ? 'in' : 'guest';
      this.ready = true;
      this.emit('auth');
      return 'ok';
    }
  }

  /** 打开账号页时再试一次（刚才服务器没连上）。没有新情况就不刷新，避免把正在输入的密码清掉 */
  async ensure() {
    const before = this.phase + String(!!this.config);
    if (!this.config) await this.loadConfig();
    if (this.config && !this.config.cloud) this.phase = 'off';
    else if (this.session && (this.phase === 'guest' || this.phase === 'loading')) {
      if (await this.token()) {
        this.phase = this.recovery ? 'recovery' : 'in';
        if (this.gate()) await this.reconcile();
        else this.defer = true;
      } else this.phase = 'guest';
    }
    if (this.phase + String(!!this.config) !== before) this.emit('auth');
  }

  /** 本机存档变了（设置变化不会上传） */
  note(p: Profile) {
    this.profile = p;
    if (!this.ready || this.applying || !this.session || this.decision || this.phase === 'off' || this.phase === 'loading') return;
    const key = fingerprint(p);
    if (this.meta?.userId === this.session.user.id && this.meta.key === key) return;
    this.dirty = true;
    if (!this.gate()) { this.sync = 'queued'; this.emit('sync'); return; }
    this.sync = 'saving';
    this.emit('sync');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(false), 800);
  }

  /** 离开对局、回到标题或真新镇时调用 */
  poke() {
    if (!this.ready || !this.session || !this.gate()) return;
    if (this.defer) { this.defer = false; void this.reconcile(); return; }
    void this.flush(false);
  }

  /** 关掉页面前尽量把进度传上去 */
  flushOnLeave() { void this.flush(true); }

  async login(email: string, password: string): Promise<string | null> {
    this.confirmMail = false;
    const r = await this.req('POST', '/api/auth/login', { email, password });
    return this.takeSession(r, '登录');
  }

  async signup(email: string, password: string): Promise<string | null> {
    this.confirmMail = false;
    const redirect = `${location.origin}${location.pathname}`;
    const r = await this.req('POST', '/api/auth/signup', { email, password, redirect });
    if (r.ok && r.data.confirm === true) {
      this.confirmMail = true;
      this.emit('auth');
      return null;
    }
    return this.takeSession(r, '注册');
  }

  async recover(email: string): Promise<string | null> {
    this.mailSent = false;
    const redirect = `${location.origin}${location.pathname}`;
    const r = await this.req('POST', '/api/auth/recover', { email, redirect });
    if (!r.ok) return this.errText(r, '发送失败，请稍后再试');
    this.mailSent = true;
    this.emit('auth');
    return null;
  }

  async setPassword(password: string): Promise<string | null> {
    const token = await this.token();
    if (!token) return '登录已过期，请重新登录';
    const r = await this.req('POST', '/api/auth/password', { password }, token);
    if (!r.ok) return this.errText(r, '修改失败，请稍后再试');
    this.recovery = false;
    if (this.phase === 'recovery') this.phase = 'in';
    this.emit('auth');
    return null;
  }

  async logout() {
    const token = this.session?.access_token;
    if (token) void this.req('POST', '/api/auth/logout', {}, token).catch(() => null);
    this.session = null;
    writeJson(SESSION_KEY, null);
    this.decision = null;
    this.held = false;
    this.recovery = false;
    this.dirty = false;
    this.defer = false;
    this.sync = 'idle';
    this.phase = this.config?.cloud === false ? 'off' : 'guest';
    this.emit('auth');
  }

  hold() { this.held = true; this.emit('auth'); }

  /** 玩家选好了保留哪一份。返回错误文字；成功返回 null */
  async choose(which: 'cloud' | 'local'): Promise<string | null> {
    const d = this.decision;
    const p = this.profile;
    if (!d || !p || !this.session) return '现在没有需要选择的进度';
    this.decision = null;
    this.held = false;
    if (d.kind === 'empty') {
      if (which === 'local') {
        const up = await this.upload(0);
        if (up === 'ok') { this.emit('auth'); return null; }
        if (up !== 'conflict' && !this.decision) { this.decision = { ...d, local: summarize(p) }; this.emit('auth'); }
        return up === 'conflict' ? '云端刚刚有了新的进度，请再选一次' : '上传失败，请稍后再试';
      }
      this.applying = true;
      try { adoptCloud(p, {}); } finally { this.applying = false; }
      this.remember(0, fingerprint(p));
      this.sync = 'saved';
      this.onApplied();
      this.emit('auth');
      return null;
    }
    if (which === 'cloud') {
      this.applyRow({ data: obj(d.data), rev: d.rev, device: null, updatedAt: d.updatedAt });
      this.emit('auth');
      return null;
    }
    const up = await this.upload(d.rev);
    if (up === 'ok') { this.emit('auth'); return null; }
    if (up !== 'conflict' && !this.decision) { this.decision = { ...d, local: summarize(p) }; this.emit('auth'); }
    return up === 'conflict' ? '云端又更新了，请再选一次' : '上传失败，请稍后再试';
  }

  // ---------------------------------------------------------------- 内部

  private emit(kind: 'auth' | 'sync') { this.onChange(kind); }

  private async loadConfig() {
    const r = await this.req('GET', '/api/config');
    if (r.status === 200 && r.data && typeof r.data.cloud === 'boolean') {
      this.config = r.data.cloud
        ? { cloud: true, google: !!r.data.google, signup: r.data.signup !== false, autoconfirm: !!r.data.autoconfirm }
        : { cloud: false, google: false, signup: false, autoconfirm: false };
      if (!this.config.cloud) this.phase = 'off';
    }
  }

  /** 邮件链接或 Google 登录跳回来时，地址上带着令牌（captureUrl 已经摘下来了） */
  private async consumeUrl(): Promise<'recovery' | 'login' | null> {
    this.captureUrl();
    const pending = this.pendingUrl;
    this.pendingUrl = null;
    if (!pending) return null;
    const { access, refresh, tokenHash, type, error } = pending;
    if (error) return null;
    if (tokenHash && type) {
      const r = await this.req('POST', '/api/auth/verify', { token_hash: tokenHash, type });
      const err = await this.takeSession(r, '链接');
      if (err) return null;
      if (type === 'recovery') this.recovery = true;
      return type === 'recovery' ? 'recovery' : 'login';
    }
    if (access && refresh) {
      const expSec = Number(pending.expiresAt || 0);
      const exp = expSec > 1e12 ? expSec : expSec > 0 ? expSec * 1000 : Date.now() + (Number(pending.expiresIn) || 3600) * 1000;
      this.session = { access_token: access, refresh_token: refresh, expires_at: exp, user: { id: '', email: '', provider: '' } };
      writeJson(SESSION_KEY, this.session);
      if (!(await this.token())) return null;
      if (type === 'recovery') this.recovery = true;
      return type === 'recovery' ? 'recovery' : 'login';
    }
    return null;
  }

  private async takeSession(r: ApiResult, what: string): Promise<string | null> {
    if (!r.ok || !r.data.session || typeof r.data.session !== 'object') return this.errText(r, `${what}失败，请稍后再试`);
    const s = r.data.session as Json;
    const user = s.user && typeof s.user === 'object' ? s.user as Json : null;
    if (typeof s.access_token !== 'string' || !user || typeof user.id !== 'string') return `${what}失败，请稍后再试`;
    this.session = {
      access_token: s.access_token,
      refresh_token: String(s.refresh_token ?? ''),
      expires_at: Number(s.expires_at) || Date.now() + 3600_000,
      user: { id: String(user.id), email: typeof user.email === 'string' ? user.email : '', provider: typeof user.provider === 'string' ? user.provider : 'email' },
    };
    writeJson(SESSION_KEY, this.session);
    this.phase = this.recovery ? 'recovery' : 'in';
    this.confirmMail = false;
    if (this.gate()) await this.reconcile();
    else { this.defer = true; this.sync = 'queued'; }
    this.ready = true;
    this.emit('auth');
    return null;
  }

  /** 可用的登录令牌；快过期就刷新。失败时退出登录状态，本机进度保留 */
  private async token(): Promise<string | null> {
    const s = this.session;
    if (!s) return null;
    if (s.expires_at > Date.now() + 60_000) {
      if (!s.user.id) {
        const u = await this.req('GET', '/api/auth/user', undefined, s.access_token);
        const user2 = u.ok && u.data.user && typeof u.data.user === 'object' ? u.data.user as Json : null;
        if (!user2 || typeof user2.id !== 'string') { this.dropSession(); return null; }
        s.user = { id: String(user2.id), email: typeof user2.email === 'string' ? user2.email : '', provider: typeof user2.provider === 'string' ? user2.provider : 'email' };
        writeJson(SESSION_KEY, s);
      }
      return s.access_token;
    }
    if (!s.refresh_token) { this.dropSession(); return null; }
    const r = await this.req('POST', '/api/auth/refresh', { refresh_token: s.refresh_token });
    const session = r.ok ? r.data.session as Json | undefined : undefined;
    if (!session || typeof session.access_token !== 'string') { this.dropSession(); return null; }
    const user = session.user && typeof session.user === 'object' ? session.user as Json : null;
    this.session = {
      access_token: session.access_token,
      refresh_token: String(session.refresh_token ?? s.refresh_token),
      expires_at: Number(session.expires_at) || Date.now() + 3600_000,
      user: {
        id: user && typeof user.id === 'string' ? user.id : s.user.id,
        email: user && typeof user.email === 'string' ? user.email : s.user.email,
        provider: user && typeof user.provider === 'string' ? user.provider : s.user.provider,
      },
    };
    if (!this.session.user.id) {
      const u = await this.req('GET', '/api/auth/user', undefined, this.session.access_token);
      const user2 = u.ok && u.data.user && typeof u.data.user === 'object' ? u.data.user as Json : null;
      if (!user2 || typeof user2.id !== 'string') { this.dropSession(); return null; }
      this.session.user = { id: String(user2.id), email: typeof user2.email === 'string' ? user2.email : '', provider: typeof user2.provider === 'string' ? user2.provider : 'email' };
    }
    writeJson(SESSION_KEY, this.session);
    return this.session.access_token;
  }

  private dropSession() {
    this.session = null;
    writeJson(SESSION_KEY, null);
    this.phase = 'guest';
  }

  private async reconcile() {
    if (!this.profile || !this.session) return;
    const row = await this.fetchSave();
    if (row === 'error') { this.markOffline(); return; }
    const plan = planSync({ userId: this.session.user.id, local: this.profile, cloud: row, synced: this.meta });
    if (plan.do === 'keep') { this.remember(plan.rev, fingerprint(this.profile)); this.sync = 'saved'; this.emit('sync'); return; }
    if (plan.do === 'upload') { await this.upload(plan.baseRev); return; }
    if (plan.do === 'download' && row) {
      const before = fingerprint(row.data);
      this.applyRow(row);
      if (fingerprint(this.profile) !== before) { this.dirty = true; await this.flush(false); }
      return;
    }
    if (plan.do === 'ask-upload') { this.raise({ kind: 'empty', rev: 0, data: null, updatedAt: '' }); return; }
    if (plan.do === 'ask' && row) { this.raise({ kind: 'diverge', rev: row.rev, data: row.data, updatedAt: row.updatedAt }); }
  }

  private raise(d: Omit<Decision, 'local' | 'remote'>) {
    const local = summarize(this.profile);
    const remote = d.kind === 'diverge' ? summarize(d.data) : null;
    this.decision = { ...d, local, remote };
    this.held = false;
    this.dirty = false;
    this.sync = 'idle';
    this.onConflict();
    this.emit('auth');
  }

  private applyRow(row: CloudRow) {
    if (!this.profile) return;
    this.applying = true;
    try { adoptCloud(this.profile, row.data); } finally { this.applying = false; }
    this.remember(row.rev, fingerprint(this.profile));
    this.sync = 'saved';
    this.offlineNoted = false;
    this.onApplied();
  }

  private async fetchSave(): Promise<CloudRow | null | 'error'> {
    const token = await this.token();
    if (!token) return 'error';
    const r = await this.req('GET', '/api/save', undefined, token);
    if (r.status === 401) { this.dropSession(); this.emit('auth'); return 'error'; }
    if (!r.ok) return 'error';
    const save = r.data.save;
    if (save == null) return null;
    if (typeof save !== 'object') return 'error';
    const row = save as Json;
    if (!row.data || typeof row.data !== 'object' || !Number.isInteger(row.rev)) return 'error';
    return { data: row.data as Record<string, unknown>, rev: Number(row.rev), device: typeof row.device === 'string' ? row.device : null, updatedAt: String(row.updatedAt ?? '') };
  }

  private async upload(baseRev: number): Promise<'ok' | 'conflict' | 'error'> {
    const p = this.profile;
    const token = await this.token();
    if (!p || !token) return 'error';
    const data = cloudData(p);
    const r = await this.req('PUT', '/api/save', { data, baseRev, device: deviceId() }, token);
    if (r.status === 200 && Number.isInteger(r.data.rev)) {
      this.remember(Number(r.data.rev), fingerprint(p));
      this.sync = 'saved';
      this.offlineNoted = false;
      window.clearTimeout(this.retry);
      this.emit('sync');
      return 'ok';
    }
    if (r.status >= 400 && r.status < 500 && r.status !== 409 && r.status !== 401 && r.status !== 429) {
      this.dirty = false;
      this.sync = 'offline';
      this.emit('sync');
      return 'error';
    }
    if (r.status === 409 && r.data.save && typeof r.data.save === 'object') {
      const save = r.data.save as Json;
      if (save.data && typeof save.data === 'object' && Number.isInteger(save.rev)) {
        this.raise({ kind: 'diverge', rev: Number(save.rev), data: save.data, updatedAt: String(save.updatedAt ?? '') });
        return 'conflict';
      }
    }
    if (r.status === 401) { this.dropSession(); this.emit('auth'); return 'error'; }
    this.markOffline();
    return 'error';
  }

  private async flush(force: boolean) {
    if (!this.dirty || !this.session || this.decision || !this.ready) return;
    if (!force && !this.gate()) { this.sync = 'queued'; this.emit('sync'); return; }
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.dirty = false;
    this.sync = 'saving';
    this.emit('sync');
    const baseRev = this.meta && this.session && this.meta.userId === this.session.user.id ? this.meta.rev : 0;
    const result = await this.upload(baseRev);
    this.busy = false;
    if (result === 'error') this.dirty = true;
    if (this.again && this.dirty) { this.again = false; void this.flush(force); }
  }

  private markOffline() {
    this.sync = 'offline';
    this.dirty = true;
    this.emit('sync');
    if (!this.offlineNoted) this.offlineNoted = true;
    window.clearTimeout(this.retry);
    this.retry = window.setTimeout(() => { if (this.gate()) void this.flush(false); }, 15000);
  }

  private remember(rev: number, key: string) {
    if (!this.session) return;
    this.meta = { userId: this.session.user.id, rev, key };
    writeJson(META_KEY, this.meta);
  }

  private errText(r: ApiResult, fallback: string): string {
    return typeof r.data.error === 'string' && r.data.error ? r.data.error : fallback;
  }

  private async req(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> {
    try {
      const res = await fetch(`${apiBase()}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        keepalive: method === 'PUT',
      });
      const text = await res.text();
      let data: Json = {};
      if (text) { try { data = JSON.parse(text) as Json; } catch { data = {}; } }
      return { status: res.status, ok: res.ok, data };
    } catch {
      return { status: 0, ok: false, data: { error: '暂时连不上服务器' } };
    }
  }
}

interface ApiResult { status: number; ok: boolean; data: Json }

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/** 上传时去掉画面设置 */
function cloudData(p: Profile): Record<string, unknown> {
  const data = { ...p } as Record<string, unknown>;
  delete data.settings;
  return data;
}

export const cloudHasProgress = hasProgress;
