import './style.css';
import { ENEMIES } from '../shared/enemies';
import { LINES, type LineId } from '../shared/pokemon';
import type { DifficultyId } from '../shared/difficulty';
import { PROTOCOL_VERSION, type BoardEntry, type C2S, type LobbyPlayer, type PvpRatingChange, type PvpSeatInfo, type ServerStats } from '../shared/protocol';
import { PVP_MODE_IDS, type PvpMatchResult, type PvpMode } from '../shared/pvp/sim';
import type { MeState, PublicState } from '../shared/sim/game';
import { BIOMES } from '../shared/waves';
import { initAudio, playMusic, setVolume, sfx } from './audio';
import { GameView } from './game/view';
import { Animator, dirRow, preload } from './gfx/sprites';
import { iconUrl } from './gfx/icons';
import { skillIconUrl } from './gfx/skillicons';
import { SKILLS } from '../shared/skills';
import { ITEMS } from '../shared/items';
import { BORDER, arenaCanvas } from './gfx/tiles';
import { initGamepad } from './gamepad';
import { initInput, setInputEnabled } from './input';
import { LocalPvpTransport, LocalTransport, WsTransport, type Incoming, type Transport } from './net';
import { applyRun, loadProfile, pvpIdentity, releaseFromParty, saveProfile, type PartyMon, type Profile } from './save';
import { $, clear, toast } from './ui/dom';
import { Hud } from './ui/hud';
import { Intermission } from './ui/intermission';
import {
  BrowseScreen, achievementsScreen, creditsScreen, labScreen, lobbyScreen, onlineText, pauseScreen, pvpText, selectScreen, settingsScreen, titleScreen,
} from './ui/screens';
import { resultsScreen } from './ui/results';
import { PvpScreen, pvpResultsScreen } from './ui/pvp';

interface PvpMatch { mode: PvpMode; uid: string; practice: boolean; seats: PvpSeatInfo[] }

/** 触屏设备开局时尝试全屏并锁定横屏（需要在点击事件里调用）。 */
function mobileFullscreen() {
  if (!window.matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(lock, () => {});
}

const ALL_DEX = [...new Set([...Object.values(LINES).flatMap((l) => l.forms.map((f) => f.dex)), ...Object.values(ENEMIES).map((e) => e.dex)])];

class App {
  profile: Profile = loadProfile();
  canvas = $('#game') as HTMLCanvasElement;
  screen = $('#screen');
  ui = $('#ui');
  /** 当前对局使用的连接：单人是 LocalTransport，联机是常驻的 ws */
  t: Transport | null = null;
  /** 常驻的联机连接：用于在线人数统计、联机大厅和房间 */
  ws: WsTransport | null = null;
  stats: ServerStats | null = null;
  private browser: BrowseScreen | null = null;
  private joining = false;
  you = 0;
  code = '';
  solo = false;
  lobby: LobbyPlayer[] = [];
  roomDifficulty: DifficultyId = 'easy';
  roomPublic = true;
  pendingLine: LineId | null = null;
  pendingDifficulty: DifficultyId = 'easy';
  view: GameView | null = null;
  hud: Hud | null = null;
  inter: Intermission | null = null;
  me: MeState | null = null;
  pub: PublicState | null = null;
  paused = false;
  where: 'menu' | 'browse' | 'lobby' | 'game' | 'results' | 'pvp' = 'menu';
  private menu = new MenuScene(this.canvas);
  private pvpUi: PvpScreen | null = null;
  /** 正在排队或进行中的对战 */
  private pvpMatch: PvpMatch | null = null;

  start() {
    initInput(this.canvas);
    initGamepad({
      pause: () => { if (this.where === 'game' && this.solo && this.pub?.phase === 'wave') this.setPause(!this.paused); },
    });
    this.applySettings();
    const unlock = () => { initAudio(); setVolume(this.profile.settings.volume, this.profile.settings.music); };
    playMusic('shop');
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('gamepadconnected', unlock);
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && this.where === 'game' && this.solo && this.pub?.phase === 'wave') this.setPause(!this.paused);
    });
    window.addEventListener('beforeunload', (e) => { if (this.where === 'game' && !this.solo) e.preventDefault(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.where === 'game' && this.solo && this.pub?.phase === 'wave' && !this.paused) this.setPause(true);
    });
    // 手机竖屏：显示旋转提示；单人对局自动暂停
    const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const onOrient = () => {
      if (portrait.matches && this.where === 'game' && this.solo && this.pub?.phase === 'wave' && !this.paused) this.setPause(true);
    };
    portrait.addEventListener('change', onOrient);
    $('#rotate-fs').addEventListener('click', () => mobileFullscreen());
    this.menu.start();
    this.ensureWs();
    this.title();
    void preload(ALL_DEX);
    const params = new URLSearchParams(location.search);
    if (params.has('debug')) Object.assign(window, { __send: (m: C2S) => this.send(m), __icons: { iconUrl, ITEMS, skillIconUrl, SKILLS } });
    const room = params.get('room');
    if (room && /^\d{5}$/.test(room)) this.joinRoom(room);
  }

  applySettings() {
    const s = this.profile.settings;
    setVolume(s.volume, s.music);
    this.canvas.style.filter = s.gbFilter ? 'grayscale(1) sepia(1) hue-rotate(42deg) saturate(2.4) brightness(.8) contrast(1.2)' : '';
    if (this.view) this.view.settings = s;
  }

  // ------------------------------------------------------------ 常驻联机连接

  private wsRetry = 0;
  private ensureWs() {
    if (this.ws) return this.ws;
    const ws = new WsTransport();
    this.ws = ws;
    ws.onOpen = () => {
      this.wsRetry = 0;
      ws.send({ t: 'stats' });
      if (this.where === 'browse') ws.send({ t: 'browse', on: true });
      this.browser?.setStats(this.stats, true);
      if (this.pvpUi) { this.pvpUi.setConnected(true); for (const mode of PVP_MODE_IDS) this.requestBoard(mode); }
    };
    ws.onMessage = (m) => {
      if (!(m instanceof ArrayBuffer) && (m.t === 'rooms' || m.t === 'stats')) {
        this.stats = m.stats;
        const el = document.getElementById('title-online');
        if (el) el.textContent = onlineText(this.stats);
        const pv = document.getElementById('title-pvp');
        if (pv) pv.textContent = pvpText(this.profile, this.stats);
        this.browser?.setStats(this.stats, true);
        if (m.t === 'rooms') this.browser?.setRooms(m.rooms);
        return;
      }
      if (!(m instanceof ArrayBuffer)) {
        if (m.t === 'pvpBoard') { this.pvpUi?.setBoard(m); return; }
        if (m.t === 'pvpQueued') { this.pvpUi?.setQueued(m); return; }
        if (m.t === 'pvpCancelled') { this.pvpUi?.setQueued(null); return; }
        if (m.t === 'start' && m.pvp && this.t !== ws) { ws.send({ t: 'leave' }); return; }
      }
      if (this.t === ws) this.onMessage(m);
    };
    ws.onClose = (reason) => {
      if (this.ws === ws) this.ws = null;
      this.stats = null;
      this.browser?.setStats(null, false);
      this.pvpUi?.setConnected(false);
      if (this.pvpMatch && !this.pvpMatch.practice && this.where !== 'game') this.pvpMatch = null;
      if (this.t === ws) {
        toast(reason, 'error', 4000);
        this.t = null;
        this.leaveGame();
        this.title();
      }
      // 服务器重启或网络波动时自动重连
      const delay = Math.min(30000, 2000 * 2 ** this.wsRetry++);
      window.setTimeout(() => this.ensureWs(), delay);
    };
    return ws;
  }

  // ------------------------------------------------------------ 菜单

  title() {
    this.where = 'menu';
    this.browser = null;
    if (location.search.includes('room=')) history.replaceState(null, '', location.pathname);
    this.screen.classList.remove('hidden');
    this.pvpUi = null;
    titleScreen(this.screen, this.profile, {
      solo: () => this.select(),
      browse: () => this.browse(),
      pvp: () => this.pvpCenter(),
      join: (code) => this.joinRoom(code),
      lab: () => labScreen(this.screen, this.profile, () => this.title()),
      achievements: () => achievementsScreen(this.screen, this.profile, () => this.title()),
      settings: () => settingsScreen(this.screen, this.profile, () => this.applySettings(), () => this.title()),
      credits: () => creditsScreen(this.screen, () => this.title()),
    }, this.stats);
    this.ws?.send({ t: 'stats' });
  }

  select() {
    selectScreen(this.screen, this.profile, (line, diff) => this.startSolo(line, diff), () => this.title());
  }

  /** 联机大厅：房间列表 + 在线人数 */
  browse() {
    this.where = 'browse';
    this.screen.classList.remove('hidden');
    const ws = this.ensureWs();
    this.browser = new BrowseScreen(this.screen, {
      create: (pub) => this.createRoom(pub),
      join: (code) => this.joinRoom(code),
      back: () => { this.ws?.send({ t: 'browse', on: false }); this.title(); },
    }, ws.connected);
    if (this.stats) this.browser.setStats(this.stats, ws.connected);
    if (ws.connected) ws.send({ t: 'browse', on: true });
  }

  // ------------------------------------------------------------ 对战

  /** 对战中心：背包、匹配、段位与排行榜 */
  pvpCenter() {
    this.where = 'pvp';
    this.browser = null;
    this.screen.classList.remove('hidden');
    const ws = this.ensureWs();
    this.pvpUi = new PvpScreen(this.screen, this.profile, {
      queue: (mode, mon) => this.pvpQueue(mode, mon),
      cancel: () => {
        this.ws?.send({ t: 'pvpCancel' });
        this.pvpUi?.setQueued(null);
        this.pvpMatch = null;
        if (this.t === this.ws) this.t = null;
      },
      practice: (mode, mon) => this.pvpPractice(mode, mon),
      release: (uid) => releaseFromParty(this.profile, uid),
      board: (mode) => { saveProfile(this.profile); this.requestBoard(mode); },
      adventure: () => { this.pvpUi = null; this.select(); },
      back: () => { saveProfile(this.profile); this.pvpUi = null; this.title(); },
    }, ws.connected);
    if (ws.connected) for (const mode of PVP_MODE_IDS) this.requestBoard(mode);
  }

  private requestBoard(mode: PvpMode) {
    this.ws?.send({ t: 'pvpBoard', mode, ...pvpIdentity(this.profile) });
  }

  private pvpQueue(mode: PvpMode, mon: PartyMon) {
    mobileFullscreen();
    this.close();
    this.solo = false;
    this.t = this.ensureWs();
    this.profile.pvpMode = mode;
    this.profile.pvpPick = mon.uid;
    saveProfile(this.profile);
    this.pvpMatch = { mode, uid: mon.uid, practice: false, seats: [] };
    this.send({ t: 'pvpQueue', mode, build: mon.build, name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION, ...pvpIdentity(this.profile) });
  }

  private pvpPractice(mode: PvpMode, mon: PartyMon) {
    mobileFullscreen();
    if (this.pvpUi?.isQueued) this.ws?.send({ t: 'pvpCancel' });
    this.close();
    this.solo = false;
    this.profile.pvpMode = mode;
    this.profile.pvpPick = mon.uid;
    saveProfile(this.profile);
    this.pvpMatch = { mode, uid: mon.uid, practice: true, seats: [] };
    const allies = this.profile.party.filter((m) => m.uid !== mon.uid).map((m) => m.build);
    const t = new LocalPvpTransport(mode, { name: this.name(), build: mon.build, meta: this.meta() }, allies);
    this.t = t;
    t.onMessage = (m) => this.onMessage(m);
  }

  private leavePvp() {
    const practice = this.pvpMatch?.practice;
    this.pvpMatch = null;
    this.close();
    this.menu.start();
    if (!practice) toast('你离开了对战，本场判负', 'error');
    this.pvpCenter();
  }

  private endPvp(res: PvpMatchResult, you: number, rating: PvpRatingChange | null) {
    const match = this.pvpMatch;
    this.pvpMatch = null;
    const me = res.players.find((p) => p.id === you);
    const outcome = !me || res.winner < 0 ? 'draw' : res.winner === me.team ? 'win' : 'loss';
    const mon = match ? this.profile.party.find((m) => m.uid === match.uid) : undefined;
    if (mon && match && !match.practice) {
      if (outcome === 'win') mon.pvp.wins++;
      else if (outcome === 'loss') mon.pvp.losses++;
      else mon.pvp.draws++;
      saveProfile(this.profile);
    }
    const t = this.t;
    this.t = null;
    if (t instanceof LocalPvpTransport) t.close();
    this.leaveGame();
    this.where = 'results';
    this.menu.start();
    this.screen.classList.remove('hidden');
    playMusic('shop');
    sfx(outcome === 'win' ? 'clear' : outcome === 'loss' ? 'down' : 'wave');
    pvpResultsScreen(this.screen, res, you, rating, match?.seats ?? [], !!match?.practice, {
      again: () => {
        this.pvpCenter();
        const again = match && this.profile.party.find((m) => m.uid === match.uid);
        if (!match || !again) return;
        if (match.practice) this.pvpPractice(match.mode, again);
        else if (this.ws?.connected) { this.pvpUi?.setWaiting(); this.pvpQueue(match.mode, again); }
      },
      back: () => this.pvpCenter(),
    });
  }

  private meta() { return { ...this.profile.upgrades }; }
  private name() { return this.profile.name || '训练家'; }

  startSolo(line: LineId, difficulty: DifficultyId) {
    mobileFullscreen();
    this.close();
    this.solo = true;
    this.pendingLine = line;
    this.pendingDifficulty = difficulty;
    const t = new LocalTransport();
    this.t = t;
    t.onMessage = (m) => this.onMessage(m);
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION });
  }

  createRoom(isPublic = true) {
    mobileFullscreen();
    this.close();
    this.solo = false;
    this.joining = true;
    this.t = this.ensureWs();
    this.browser = null;
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION, public: isPublic });
    this.loading('正在创建房间…');
  }

  joinRoom(code: string) {
    if (navigator.userActivation?.isActive) mobileFullscreen();
    this.close();
    this.solo = false;
    this.joining = true;
    this.t = this.ensureWs();
    this.browser = null;
    this.send({ t: 'join', code, name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION });
    this.loading(`正在加入房间 ${code}…`);
  }

  private loading(text: string) {
    clear(this.screen);
    this.screen.dataset.screen = 'loading';
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<div class="box"><h3>${text}</h3></div>`;
  }

  /** 结束当前会话：单人关闭本地模拟，联机只是离开房间（连接保留） */
  close() {
    const t = this.t;
    this.t = null;
    if (t instanceof LocalTransport || t instanceof LocalPvpTransport) t.close();
    else if (t) t.send({ t: 'leave' });
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
        this.joining = false;
        if (this.solo && this.pendingLine) {
          this.send({ t: 'pick', line: this.pendingLine });
          this.send({ t: 'difficulty', id: this.pendingDifficulty });
          this.send({ t: 'start' });
        }
        break;
      case 'lobby':
        this.lobby = m.players;
        this.roomDifficulty = m.difficulty;
        this.roomPublic = m.public;
        if (!this.solo && (this.where === 'menu' || this.where === 'browse' || this.where === 'lobby')) this.showLobby();
        break;
      case 'error':
        toast(m.msg, 'error', 3500);
        sfx('error');
        if (this.pvpMatch && (this.where === 'pvp' || m.fatal)) {
          this.pvpMatch = null;
          this.pvpUi?.setQueued(null);
          if (this.t === this.ws) this.t = null;
          if (m.fatal) { this.leaveGame(); this.menu.start(); this.pvpCenter(); }
          break;
        }
        if (this.joining || m.fatal) {
          this.joining = false;
          if (this.t === this.ws) this.t = null;
          if (!this.solo) this.browse();
          else this.title();
        }
        break;
      case 'start': this.beginGame(m.w, m.h, m.players, m.pvp?.seats); break;
      case 'pvpEnd': this.endPvp(m.result, m.you, m.rating); break;
      case 'ev': this.view?.onEvents(m.e); break;
      case 'st': this.onPublic(m.s); break;
      case 'me': this.onMe(m.s); break;
      case 'cmdErr': toast(m.msg, 'error'); sfx('error'); break;
      case 'paused': this.paused = m.on; this.renderPause(); break;
      case 'end': this.endGame(m.victory, m.summary, m.board); break;
      case 'pong': case 'left': case 'rooms': case 'stats': case 'pvpBoard': case 'pvpQueued': case 'pvpCancelled': break;
    }
  }

  private showLobby() {
    this.where = 'lobby';
    this.browser = null;
    this.screen.classList.remove('hidden');
    lobbyScreen(this.screen, this.profile, this.code, this.you, this.lobby, {
      pick: (line) => this.send({ t: 'pick', line }),
      ready: (on) => this.send({ t: 'ready', on }),
      start: () => this.send({ t: 'start' }),
      leave: () => { this.close(); this.browse(); },
      difficulty: (id) => this.send({ t: 'difficulty', id }),
      visibility: (on) => this.send({ t: 'visibility', public: on }),
    }, this.roomDifficulty, this.roomPublic);
    history.replaceState(null, '', `?room=${this.code}`);
  }

  private beginGame(w: number, h: number, players: { id: number; name: string; line: LineId }[], pvpSeats?: PvpSeatInfo[]) {
    this.leaveGame();
    this.pvpUi = null;
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
    if (pvpSeats) {
      if (this.pvpMatch) this.pvpMatch.seats = pvpSeats;
      this.view.setPvp(pvpSeats);
      this.hud = new Hud(this.ui, null, () => { if (this.pvpMatch?.practice || confirm('现在离开会被判负，确定要离开对战吗？')) this.leavePvp(); });
      this.hud.setPvp(pvpSeats, this.you);
    } else {
      this.hud = new Hud(this.ui, this.solo ? () => this.setPause(true) : null);
      this.inter = new Intermission(this.ui, (c) => this.send(c));
    }
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

  private endGame(victory: boolean, summary: import('../shared/meta').RunSummary | null, board: BoardEntry[]) {
    const reward = summary ? applyRun(this.profile, summary) : null;
    // 新成就直接在结算界面里列出，不再弹提示挡住统计
    if (reward?.newAchievements.length) sfx('achieve');
    this.leaveGame();
    this.where = 'results';
    this.menu.start();
    this.screen.classList.remove('hidden');
    playMusic('shop');
    resultsScreen(this.screen, victory, summary, reward, board, this.you, () => {
      if (this.solo) { this.close(); this.select(); }
      else this.showLobby();
    }, this.solo ? '再来一局' : '返回房间', this.profile);
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
