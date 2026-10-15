/**
 * 账号：登录、注册、忘记密码、修改密码、退出，以及两份进度冲突时让玩家选。
 */
import { TRAINERS } from '../../shared/trainers';
import type { SaveSummary } from '../../shared/cloudsave';
import { sfx } from '../audio';
import type { Cloud, Decision } from '../cloud';
import { uiIcon } from '../gfx/uiicons';
import { h, toast } from './dom';
import { iconBtn } from './layout';
import { mount, tabs } from './screens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function accountScreen(root: HTMLElement, cloud: Cloud, a: { back(): void; applied(): void }) {
  const v = cloud.view();
  if (v.decision) {
    decisionScreen(root, cloud, v.decision, {
      applied: a.applied,
      // 找回密码的链接同时要求选进度时：选完再让玩家设新密码
      back: () => {
        const now = cloud.view();
        if (now.phase === 'recovery' && !now.decision) accountScreen(root, cloud, a);
        else a.back();
      },
    });
    return;
  }
  if (v.phase === 'recovery') { passwordScreen(root, cloud, a, true); return; }
  if (v.phase === 'in') { homeScreen(root, cloud, a); return; }
  if (v.phase === 'off') { offScreen(root, a); return; }
  guestScreen(root, cloud, a);
}

function head(title: string, onBack: () => void) {
  return h('div', { class: 'panel-head' },
    h('div', { class: 'row' }, uiIcon('user', 3), h('h2', null, title)),
    iconBtn('back', '返回', () => { sfx('click'); onBack(); }, { attrs: { 'data-back': '1' }, cls: 'ghost small', text: '返回' }));
}

function offScreen(root: HTMLElement, a: { back(): void }) {
  mount(root, h('div', { class: 'box panel account' },
    head('账号', a.back),
    h('div', { class: 'account-body' },
      h('p', null, '这台服务器没有开启云存档。'),
      h('p', { class: 'small muted' }, '进度只存在这台设备上。换浏览器或清掉网站数据后会丢失。不登录也一样可以玩。'),
    ),
  ), 'account');
}

function guestScreen(root: HTMLElement, cloud: Cloud, a: { back(): void; applied(): void }, tab?: number) {
  const v = cloud.view();
  const names = ['登录', ...(v.signup ? ['注册'] : []), '忘记密码'];
  const initial = v.mailSent ? names.indexOf('忘记密码') : v.confirmMail ? names.indexOf('注册') : 0;
  const cur = Math.max(0, Math.min(names.length - 1, tab ?? initial));
  const mode = names[cur];
  const err = h('div', { class: 'auth-error' });
  const showErr = (t: string | null) => { err.textContent = t || ''; };
  const email = field('邮箱', 'email', 'username');
  const password = field('密码', 'password', mode === '登录' ? 'current-password' : 'new-password');
  const again = field('再输入一次密码', 'password', 'new-password');
  const busy = { on: false };
  const run = async (fn: () => Promise<string | null>) => {
    if (busy.on) return;
    busy.on = true;
    showErr('');
    const msg = await fn();
    busy.on = false;
    if (msg) { showErr(msg); sfx('error'); return; }
    sfx('click');
    const now = cloud.view();
    if (now.decision) { decisionScreen(root, cloud, now.decision, a); return; }
    if (now.phase === 'in' || now.phase === 'recovery') { a.applied(); accountScreen(root, cloud, a); return; }
    if (now.confirmMail || now.mailSent) guestScreen(root, cloud, a);
  };
  const submit = () => {
    const addr = email.value.trim();
    const pass = password.value;
    if (!EMAIL.test(addr)) { showErr('邮箱格式不对'); return; }
    if (mode === '忘记密码') { void run(() => cloud.recover(addr)); return; }
    if (pass.length < 6) { showErr('密码至少要 6 位'); return; }
    if (mode === '注册' && pass !== again.value) { showErr('两次输入的密码不一样'); return; }
    void run(() => (mode === '登录' ? cloud.login(addr, pass) : cloud.signup(addr, pass)));
  };
  password.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  again.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (mode === '忘记密码' ? submit() : password.focus()); } });
  const notice = mode === '注册' && v.confirmMail
    ? '注册成功。请到邮箱里点确认链接，然后再回来登录。'
    : mode === '忘记密码' && v.mailSent
      ? '邮件已发送。点里面的链接即可设置新密码。如果没看到，看看垃圾箱。'
      : mode === '注册'
        ? (v.autoconfirm ? '注册后马上就能玩，不用等验证邮件。' : '注册后需要先点确认邮件里的链接。')
        : mode === '忘记密码'
          ? '输入注册时用的邮箱，我们发一封设置新密码的邮件。'
          : '不登录也能玩，进度只存在这台设备上。登录后换设备也能继续。';
  mount(root, h('div', { class: 'box panel account' },
    head('账号', a.back),
    tabs(names, cur, (i) => { guestScreen(root, cloud, a, i); }),
    h('div', { class: 'account-body' },
      h('p', { class: 'auth-note' }, notice),
      labeled('邮箱', email),
      mode === '忘记密码' ? null : labeled('密码', password),
      mode === '注册' ? labeled('再输入一次密码', again) : null,
      err,
      h('div', { class: 'account-actions' },
        h('button', { class: 'btn gold', onclick: () => { sfx('click'); submit(); } }, mode === '登录' ? '登录' : mode === '注册' ? '注册' : '发送邮件'),
        v.google && mode === '登录' ? h('button', { class: 'btn ghost', onclick: () => { sfx('click'); location.href = cloud.googleUrl(); } }, '用 Google 登录') : null,
      ),
      v.google && mode === '登录' ? h('p', { class: 'auth-note' }, '国内如果打不开 Google，用邮箱登录即可。') : null,
    ),
  ), 'account');
  requestAnimationFrame(() => email.focus({ preventScroll: true }));
}

function homeScreen(root: HTMLElement, cloud: Cloud, a: { back(): void; applied(): void }) {
  const v = cloud.view();
  const provider = v.provider === 'google' ? 'Google' : '邮箱';
  mount(root, h('div', { class: 'box panel account' },
    head('账号', a.back),
    h('div', { class: 'account-body' },
      h('div', { class: 'account-who' },
        h('b', null, v.email || '已登录'),
        h('span', { class: 'small muted' }, `通过${provider}登录`),
      ),
      h('div', { class: 'auth-note', id: 'cloud-status' }, v.status),
      h('p', { class: 'auth-note' }, '会同步宝可梦、背包、星之沙、研究所、成就、徽章、训练家和对战身份。音量、界面缩放、帧率和画质只留在这台设备。'),
      h('h3', { class: 'account-sub' }, '修改密码'),
      passwordFields(cloud, false),
    ),
    h('div', { class: 'panel-foot' },
      h('span', { class: 'set-note' }, '退出后，这台设备上的进度还在'),
      h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); void cloud.logout().then(() => { toast('已退出登录，进度还在这台设备上'); a.applied(); accountScreen(root, cloud, a); }); } }, '退出登录'),
    ),
  ), 'account');
}

function passwordScreen(root: HTMLElement, cloud: Cloud, a: { back(): void; applied(): void }, recovery: boolean) {
  mount(root, h('div', { class: 'box panel account' },
    head(recovery ? '设置新密码' : '修改密码', a.back),
    h('div', { class: 'account-body' },
      h('p', { class: 'auth-note' }, recovery ? '链接已确认。请设置一个新密码，之后用它登录。' : '设置一个新密码。'),
      passwordFields(cloud, true, () => { a.applied(); accountScreen(root, cloud, a); }),
    ),
  ), 'account');
}

function passwordFields(cloud: Cloud, focus: boolean, done?: () => void) {
  const password = field('新密码', 'password', 'new-password');
  const again = field('再输入一次新密码', 'password', 'new-password');
  const err = h('div', { class: 'auth-error' });
  const submit = () => {
    if (password.value.length < 6) { err.textContent = '密码至少要 6 位'; return; }
    if (password.value !== again.value) { err.textContent = '两次输入的密码不一样'; return; }
    err.textContent = '';
    void cloud.setPassword(password.value).then((msg) => {
      if (msg) { err.textContent = msg; sfx('error'); return; }
      sfx('wave');
      toast('密码已修改', 'gold');
      password.value = '';
      again.value = '';
      done?.();
    });
  };
  again.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  if (focus) requestAnimationFrame(() => password.focus({ preventScroll: true }));
  return h('div', { class: 'auth-form' },
    labeled('新密码', password),
    labeled('再输入一次', again),
    err,
    h('div', { class: 'account-actions' }, h('button', { class: 'btn gold', onclick: () => { sfx('click'); submit(); } }, '保存新密码')),
  );
}

function decisionScreen(root: HTMLElement, cloud: Cloud, d: Decision, a: { back(): void; applied(): void }) {
  const pick = (which: 'cloud' | 'local') => {
    void cloud.choose(which).then((msg) => {
      if (msg) { toast(msg, 'error', 4000); sfx('error'); }
      const now = cloud.view();
      if (now.decision) { decisionScreen(root, cloud, now.decision, a); return; }
      sfx('wave');
      toast(which === 'local' ? '已保留这台设备的进度' : d.kind === 'empty' ? '这个账号从零开始' : '已改用云端进度', 'gold');
      a.applied();
      a.back();
    });
  };
  const later = () => { cloud.hold(); sfx('click'); a.back(); };
  mount(root, h('div', { class: 'box panel account' },
    head('两份进度', later),
    h('div', { class: 'account-body' },
      h('p', { class: 'auth-note' }, d.kind === 'empty'
        ? '这个新账号的云端还是空的，但这台设备上的进度属于之前的账号。要传到这个新账号，还是让它从零开始？'
        : '云端的进度和这台设备不一样。选一份保留，另一份会被盖掉。'),
      h('div', { class: 'conflict-grid' },
        d.kind === 'diverge' && d.remote ? summaryCard('云端进度', d.remote, d.updatedAt, () => pick('cloud'), '使用云端进度') : summaryCard('云端进度', null, '', () => pick('cloud'), '这个账号从零开始'),
        summaryCard('这台设备', d.local, '', () => pick('local'), d.kind === 'empty' ? '传到这个账号' : '使用这台设备的进度'),
      ),
      h('div', { class: 'account-actions' },
        h('button', { class: 'btn ghost', 'data-back': '1', onclick: later }, '先不选，以后再说'),
      ),
    ),
  ), 'account-conflict');
}

function summaryCard(title: string, s: SaveSummary | null, updatedAt: string, onPick: () => void, button: string) {
  const when = updatedAt ? formatTime(updatedAt) : '';
  const trainer = s ? (TRAINERS[s.trainer]?.name ?? '') : '';
  return h('div', { class: 'conflict-card' },
    h('h3', null, title),
    s ? h('div', { class: 'conflict-lines' },
      h('div', null, h('b', null, s.name), trainer ? ` · ${trainer}` : ''),
      h('div', null, `星之沙 ${s.stardust} · 徽章 ${s.badges}`),
      h('div', null, `背包 ${s.party} · 宝可梦 ${s.owned}${s.shinies ? ` · 闪光 ${s.shinies}` : ''}`),
      h('div', null, `冒险 ${s.runs} 局${s.pvpBest ? ` · 对战最高 ${s.pvpBest} 分` : ''}`),
      when ? h('div', { class: 'small muted' }, `更新于 ${when}`) : null,
    ) : h('div', { class: 'conflict-lines muted' }, h('div', null, '还没有云端进度')),
    h('button', { class: `btn small ${title === '云端进度' ? 'gold' : ''}`, onclick: () => { sfx('click'); onPick(); } }, button),
  );
}

function formatTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function labeled(text: string, input: HTMLInputElement) {
  return h('label', { class: 'auth-label' }, text, input);
}

function field(label: string, type: string, autocomplete: string) {
  return h('input', { class: 'field', type, autocomplete, maxlength: type === 'password' ? 72 : 254, 'aria-label': label }) as HTMLInputElement;
}

/** 标题或回到镇上时，如果有还没选的进度，盖一层让玩家选 */
export function conflictScreen(root: HTMLElement, cloud: Cloud, a: { back(): void; applied(): void }) {
  const d = cloud.decision;
  if (!d) { a.back(); return; }
  decisionScreen(root, cloud, d, a);
}
