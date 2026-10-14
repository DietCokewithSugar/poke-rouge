import './style.css';
import { ENEMIES } from '../shared/enemies';
import { LINES, type LineId } from '../shared/pokemon';
import { PROTOCOL_VERSION, type C2S, type LobbyPlayer } from '../shared/protocol';
import type { MeState, PublicState } from '../shared/sim/game';
import { BIOMES } from '../shared/waves';
import { initAudio, playMusic, setVolume, sfx } from './audio';
import { GameView } from './game/view';
import { Animator, dirRow, preload } from './gfx/sprites';
import { BORDER, arenaCanvas } from './gfx/tiles';
import { initInput, setInputEnabled } from './input';
import { LocalTransport, WsTransport, type Incoming, type Transport } from './net';
import { applyRun, loadProfile, type Profile } from './save';
import { $, clear, toast } from './ui/dom';
import { Hud } from './ui/hud';
import { Intermission } from './ui/intermission';
import {
  achievementsScreen, creditsScreen, labScreen, lobbyScreen, pauseScreen, resultsScreen, selectScreen, settingsScreen, titleScreen,
} from './ui/screens';

const ALL_DEX = [...new Set([...Object.values(LINES).flatMap((l) => l.forms.map((f) => f.dex)), ...Object.values(ENEMIES).map((e) => e.dex)])];

class App {
  profile: Profile = loadProfile();
  canvas = $('#game') as HTMLCanvasElement;
  screen = $('#screen');
  ui = $('#ui');
  t: Transport | null = null;
  you = 0;
  code = '';
  solo = false;
  lobby: LobbyPlayer[] = [];
  pendingLine: LineId | null = null;
  view: GameView | null = null;
  hud: Hud | null = null;
  inter: Intermission | null = null;
  me: MeState | null = null;
  pub: PublicState | null = null;
  paused = false;
  where: 'menu' | 'lobby' | 'game' | 'results' = 'menu';
  private menu = new MenuScene(this.canvas);

  start() {
    initInput(this.canvas);
    this.applySettings();
    const unlock = () => { initAudio(); setVolume(this.profile.settings.volume, this.profile.settings.music); };
    playMusic('shop');
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && this.where === 'game' && this.solo && this.pub?.phase === 'wave') this.setPause(!this.paused);
    });
    window.addEventListener('beforeunload', (e) => { if (this.where === 'game' && !this.solo) e.preventDefault(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.where === 'game' && this.solo && this.pub?.phase === 'wave' && !this.paused) this.setPause(true);
    });
    this.menu.start();
    this.title();
    void preload(ALL_DEX);
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room && /^\d{5}$/.test(room)) this.joinRoom(room);
  }

  applySettings() {
    const s = this.profile.settings;
    setVolume(s.volume, s.music);
    this.canvas.style.filter = s.gbFilter ? 'grayscale(1) sepia(1) hue-rotate(42deg) saturate(2.4) brightness(.8) contrast(1.2)' : '';
    if (this.view) this.view.settings = s;
  }

  // ------------------------------------------------------------ 菜单

  title() {
    this.where = 'menu';
    if (location.search.includes('room=')) history.replaceState(null, '', location.pathname);
    this.screen.classList.remove('hidden');
    titleScreen(this.screen, this.profile, {
      solo: () => this.select(),
      create: () => this.createRoom(),
      join: (code) => this.joinRoom(code),
      lab: () => labScreen(this.screen, this.profile, () => this.title()),
      achievements: () => achievementsScreen(this.screen, this.profile, () => this.title()),
      settings: () => settingsScreen(this.screen, this.profile, () => this.applySettings(), () => this.title()),
      credits: () => creditsScreen(this.screen, () => this.title()),
    });
  }

  select() {
    selectScreen(this.screen, this.profile, (line) => this.startSolo(line), () => this.title());
  }

  private meta() { return { ...this.profile.upgrades }; }
  private name() { return this.profile.name || '训练家'; }

  startSolo(line: LineId) {
    this.close();
    this.solo = true;
    this.pendingLine = line;
    this.open(new LocalTransport());
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION });
  }

  createRoom() {
    this.close();
    this.solo = false;
    this.open(new WsTransport());
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION });
    this.loading('正在创建房间…');
  }

  joinRoom(code: string) {
    this.close();
    this.solo = false;
    this.open(new WsTransport());
    this.send({ t: 'join', code, name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION });
    this.loading(`正在加入房间 ${code}…`);
  }

  private loading(text: string) {
    clear(this.screen);
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<div class="box"><h3>${text}</h3></div>`;
  }

  private open(t: Transport) {
    this.t = t;
    t.onMessage = (m) => this.onMessage(m);
    t.onClose = (reason) => {
      if (this.t !== t) return;
      toast(reason, 'error', 4000);
      this.leaveGame();
      this.t = null;
      this.title();
    };
  }

  close() {
    if (this.t) { const t = this.t; this.t = null; t.close(); }
    this.leaveGame();
  }

  send(m: C2S) { this.t?.send(m); }

  // ------------------------------------------------------------ 消息

  private onMessage(m: Incoming) {
    if (m instanceof ArrayBuffer) { this.view?.onSnapshot(m); return; }
    switch (m.t) {
      case 'joined':
        this.you = m.you;
        this.code = m.code;
        if (this.solo && this.pendingLine) {
          this.send({ t: 'pick', line: this.pendingLine });
          this.send({ t: 'start' });
        }
        break;
      case 'lobby':
        this.lobby = m.players;
        if (!this.solo && (this.where === 'menu' || this.where === 'lobby')) this.showLobby();
        break;
      case 'error':
        toast(m.msg, 'error', 3500);
        sfx('error');
        if (m.fatal) { this.close(); this.title(); }
        break;
      case 'start': this.beginGame(m.w, m.h, m.players); break;
      case 'ev': this.view?.onEvents(m.e); break;
      case 'st': this.onPublic(m.s); break;
      case 'me': this.onMe(m.s); break;
      case 'cmdErr': toast(m.msg, 'error'); sfx('error'); break;
      case 'paused': this.paused = m.on; this.renderPause(); break;
      case 'end': this.endGame(m.victory, m.summary, m.board); break;
      case 'pong': break;
    }
  }

  private showLobby() {
    this.where = 'lobby';
    this.screen.classList.remove('hidden');
    lobbyScreen(this.screen, this.profile, this.code, this.you, this.lobby, {
      pick: (line) => this.send({ t: 'pick', line }),
      ready: (on) => this.send({ t: 'ready', on }),
      start: () => this.send({ t: 'start' }),
      leave: () => { this.close(); this.title(); },
    });
    history.replaceState(null, '', `?room=${this.code}`);
  }

  private beginGame(w: number, h: number, players: { id: number; name: string; line: LineId }[]) {
    this.leaveGame();
    this.where = 'game';
    this.menu.stop();
    clear(this.screen);
    this.screen.classList.add('hidden');
    this.view = new GameView(this.canvas, w, h, this.you, this.profile.settings, {
      onMessage: (text) => this.hud?.message(text),
      onBoss: (name) => this.hud?.announce(`野生的${name}出现了！`),
      onWave: (n) => this.hud?.announce(`第 ${n} 波`, BIOMES[this.view?.biome ?? 0]?.name ?? ''),
      onEvolve: (pid, text) => {
        if (pid === this.you) this.hud?.announce(text);
        else this.hud?.message(`${players.find((p) => p.id === pid)?.name ?? '队友'}：${text}`);
      },
    });
    for (const p of players) this.view.names.set(p.id, p.name);
    this.view.send = (x, y, moving, dir) => this.send({ t: 'pos', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, m: moving ? 1 : 0, d: Math.round(dir * 100) / 100 });
    this.view.canMove = () => !this.paused && !(this.inter?.visible ?? false);
    this.hud = new Hud(this.ui, this.solo ? () => this.setPause(true) : null);
    this.inter = new Intermission(this.ui, (c) => this.send(c));
    setInputEnabled(true);
    playMusic('battle');
  }

  private onPublic(s: PublicState) {
    this.pub = s;
    if (this.view) { this.view.pub = s; this.view.biome = s.biome; }
    this.hud?.update(this.me, s, this.you);
    if (!this.inter) return;
    if (s.phase === 'inter' && !this.inter.visible) {
      this.inter.show(true);
      setInputEnabled(false);
      if (this.me) this.inter.update(this.me, s, this.you);
      playMusic('shop');
      sfx('clear');
    } else if (s.phase === 'wave' && this.inter.visible) {
      this.inter.show(false);
      setInputEnabled(true);
      playMusic('battle');
    } else if (s.phase === 'inter') this.inter.updatePub(s);
  }

  private onMe(s: MeState) {
    this.me = s;
    if (this.view) this.view.me = s;
    this.hud?.update(s, this.pub, this.you);
    if (this.pub?.phase === 'inter' && this.inter?.visible) this.inter.update(s, this.pub, this.you);
  }

  private setPause(on: boolean) {
    this.send({ t: 'pause', on });
  }

  private renderPause() {
    if (this.paused) {
      setInputEnabled(false);
      this.screen.classList.remove('hidden');
      pauseScreen(this.screen, () => this.setPause(false), () => settingsScreen(this.screen, this.profile, () => this.applySettings(), () => this.renderPause()), () => {
        this.close();
        this.menu.start();
        this.title();
      });
    } else {
      clear(this.screen);
      this.screen.classList.add('hidden');
      if (!this.inter?.visible) setInputEnabled(true);
    }
  }

  private endGame(victory: boolean, summary: import('../shared/meta').RunSummary | null, board: { id: number; name: string; line: LineId; level: number; kills: number; damage: number }[]) {
    const reward = summary ? applyRun(this.profile, summary) : null;
    for (const a of reward?.newAchievements ?? []) {
      toast(`成就达成：${a.name}${a.unlocks ? `（解锁 ${LINES[a.unlocks].name}）` : ''}`, 'gold', 4500);
    }
    if (reward?.newAchievements.length) sfx('achieve');
    this.leaveGame();
    this.where = 'results';
    this.menu.start();
    this.screen.classList.remove('hidden');
    playMusic('shop');
    resultsScreen(this.screen, victory, summary, reward, board, this.you, () => {
      if (this.solo) { this.close(); this.select(); }
      else this.showLobby();
    }, this.solo ? '再来一局' : '返回房间');
  }

  private leaveGame() {
    this.view?.destroy();
    this.view = null;
    this.hud?.destroy();
    this.hud = null;
    this.inter?.destroy();
    this.inter = null;
    this.me = null;
    this.pub = null;
    this.paused = false;
    setInputEnabled(false);
    if (this.where === 'game') this.where = 'menu';
  }
}

/** 菜单背景：在 1 号道路上闲逛的宝可梦。 */
class MenuScene {
  private raf = 0;
  private mons: { a: Animator; x: number; y: number; tx: number; ty: number; wait: number }[] = [];
  private last = 0;
  private running = false;
  constructor(private canvas: HTMLCanvasElement) {
    const dex = [4, 7, 1, 25, 10, 13, 16, 19, 10, 43];
    this.mons = dex.map((d) => {
      const a = new Animator(d);
      a.loop('Walk');
      return { a, x: 100 + Math.random() * 500, y: 80 + Math.random() * 380, tx: 0, ty: 0, wait: Math.random() * 2 };
    });
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const S = Math.max(1, Math.round(Math.min(ch / 330, cw / 560)));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, cw, ch);
    const vw = cw / S, vh = ch / S;
    const ox = Math.round(384 - vw / 2 + Math.sin(now / 9000) * 60), oy = Math.round(288 - vh / 2 + Math.cos(now / 11000) * 30);
    ctx.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    ctx.drawImage(arenaCanvas(0, 768, 576), -BORDER, -BORDER);
    this.mons.sort((a, b) => a.y - b.y);
    for (const m of this.mons) {
      if (m.wait > 0) {
        m.wait -= dt;
        m.a.loop('Idle');
        if (m.wait <= 0) { m.tx = 60 + Math.random() * 640; m.ty = 60 + Math.random() * 450; }
      } else {
        const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
        if (d < 2) m.wait = 1 + Math.random() * 3;
        else {
          m.x += (dx / d) * 30 * dt;
          m.y += (dy / d) * 30 * dt;
          m.a.dir = dirRow(Math.atan2(dy, dx));
          m.a.loop('Walk');
        }
      }
      m.a.update(dt);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(Math.round(m.x - 6), Math.round(m.y - 1), 12, 3);
      m.a.draw(ctx, m.x, m.y);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(8,14,32,.35)';
    ctx.fillRect(0, 0, cw, ch);
  };
}

new App().start();
