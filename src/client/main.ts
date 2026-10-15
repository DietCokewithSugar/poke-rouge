import './style.css';
import { DEX } from '../shared/dex';
import { ENEMIES } from '../shared/enemies';
import { LINES, LINE_OF_DEX, formOf, type LineId } from '../shared/pokemon';
import type { DifficultyId } from '../shared/difficulty';
import { PROTOCOL_VERSION, type BoardEntry, type C2S, type LobbyPlayer, type PvpRatingChange, type PvpSeatInfo, type ServerStats, type StartPlayer } from '../shared/protocol';
import { shinyName } from '../shared/shiny';
import { PVP_MODES, PVP_MODE_IDS, type PvpMatchResult, type PvpMode } from '../shared/pvp/sim';
import type { MeState, PublicState } from '../shared/sim/game';
import { BIOMES, WAVES } from '../shared/waves';
import { TRAINERS } from '../shared/trainers';
import { initAudio, playMusic, setVolume, sfx } from './audio';
import { GameView, renderDpr } from './game/view';
import { setUiScale } from './ui/layout';
import { Animator, dirRow, preload } from './gfx/sprites';
import { iconUrl } from './gfx/icons';
import { skillIconUrl } from './gfx/skillicons';
import { SKILLS } from '../shared/skills';
import { ITEMS } from '../shared/items';
import { BORDER, arenaCanvas } from './gfx/tiles';
import type { PlaceId } from './gfx/town';
import { initGamepad } from './gamepad';
import { initInput, setInputEnabled } from './input';
import { LocalPvpTransport, LocalTransport, WsTransport, type Incoming, type Transport } from './net';
import {
  PARTY_BONUS_TIER, addOwned, applyRun, autoAssistUnlocked, badgeMeta, buildMon, isUnlocked, loadProfile, monKey, notePvpBest, ownsMon, partnerOf, partyMax, pvpIdentity,
  releaseFromParty, saveProfile, unlockedLines, watchProfile, winGym, type Mon, type PartyMon, type Profile, type Settings,
} from './save';
import { Cloud } from './cloud';
import { accountScreen, conflictScreen } from './ui/account';
import { $, clear, h, hideTip, toast } from './ui/dom';
import { Hud } from './ui/hud';
import { Intermission } from './ui/intermission';
import { BrowseScreen, creditsScreen, lobbyScreen, mount, pauseScreen, portraitSlot, settingsScreen } from './ui/screens';
import { uiIcon } from './gfx/uiicons';
import { QUICK, TownHud, homeScreen, karpDialog, labHub, npcDialog, onlineText, partnerDex, partnerModal, quickMenu, routeScreen, setupScreen, titleScreen } from './ui/town';
import { resultsScreen } from './ui/results';
import { PvpScreen, pvpResultsScreen } from './ui/pvp';
import { badgeBonus, badgeCount, gymScreen } from './ui/gym';
import { TOURS, talk, tour, tourActive } from './ui/guide';
import { badgeCeremony, bigBanner, placeSign, setTransitions, transition, vsSplash, type VsSide } from './ui/fx';
import { GUIDE, GYM_BY_ID, nextGym, type GymDef } from '../shared/gyms';
import { gymTeam, isUnderdog, type GymStage } from '../shared/pvp/gym';
import { TYPE_NAME } from '../shared/types';
import { TownScene } from './town';

/** uids：出战的背包宝可梦（第一只是队长）；gym：道馆对战（哪个道馆、打的是道馆训练家还是馆主） */
interface PvpMatch { mode: PvpMode; uids: string[]; practice: boolean; seats: PvpSeatInfo[]; gym?: { id: string; stage: GymStage } }

/** 打开时有过场（走进门）的地方；NPC 对话直接弹出 */
const BUILDINGS = new Set<string>(['home', 'lab', 'center', 'battle', 'gym', 'route']);

type Where = 'title' | 'setup' | 'town' | 'place' | 'browse' | 'lobby' | 'game' | 'results' | 'pvp';

/** 进行中的联机冒险：离开或断线后凭它回去（刷新页面后也能回去） */
interface RoomSession { code: string; token: string; at: number }
const SESSION_KEY = 'poke-rouge-room';
const SESSION_TTL = 2 * 60 * 60 * 1000;

function loadSession(): RoomSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as RoomSession | null;
    return s && typeof s.code === 'string' && typeof s.token === 'string' && Date.now() - s.at < SESSION_TTL ? s : null;
  } catch {
    return null;
  }
}

/** 地址栏里的 ?room= 邀请参数（保留其它参数） */
function setRoomParam(code: string | null) {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code);
  else u.searchParams.delete('room');
  history.replaceState(null, '', u.pathname + u.search);
}

/** 触屏设备开局时尝试全屏并锁定横屏（需要在点击事件里调用）。 */
function mobileFullscreen() {
  if (!window.matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(lock, () => {});
}

/** 冒险开始前要加载的精灵：玩家的所有形态 + 各波次固定出现的敌人（乱入的野生宝可梦在波次开始时再加载） */
function runDex(lines: LineId[]): number[] {
  const set = new Set<number>();
  for (const l of lines) for (const f of LINES[l]?.forms ?? []) set.add(f.dex);
  for (const w of WAVES) {
    for (const id of [...Object.keys(w.pool), ...(w.elites ?? []), ...(w.boss ? [w.boss] : []), ...(w.treasure ? [w.treasure.id] : [])]) {
      const e = ENEMIES[id];
      if (e) set.add(e.dex);
    }
  }
  return [...set];
}

class App {
  profile: Profile = loadProfile();
  canvas = $('#game') as HTMLCanvasElement;
  screen = $('#screen');
  ui = $('#ui');
  /** 当前对局使用的连接：单人是 LocalTransport，联机是常驻的 ws */
  t: Transport | null = null;
  /** 常驻的联机连接：用于在线人数、真新镇、联机房间与对战 */
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
  pendingDifficulty: DifficultyId = 'easy';
  view: GameView | null = null;
  hud: Hud | null = null;
  inter: Intermission | null = null;
  me: MeState | null = null;
  pub: PublicState | null = null;
  paused = false;
  where: Where = 'title';
  private menu = new MenuScene(this.canvas, () => this.profile.settings);
  private town: TownScene | null = null;
  private townHud: TownHud | null = null;
  /** 从哪栋建筑进去的（出来时站在门口） */
  private place: PlaceId | null = null;
  private pvpUi: PvpScreen | null = null;
  /** 联机延迟（往返，毫秒） */
  private rtt = 0;
  private pingTimer = 0;
  /** 正在排队或进行中的对战 */
  private pvpMatch: PvpMatch | null = null;
  /** 邀请链接里的房间号：完成开场后自动加入 */
  private pendingRoom: string | null = null;
  /** 自己的宝可梦现在是不是由 AI 操作（以服务器状态为准） */
  private autoOn = false;
  /** 冒险中上一波所在的地区（换地区时挂出地名牌） */
  private lastBiome = -1;
  /** 结算动画播放中（避免重复处理结束消息） */
  private ending = false;
  /** 可以回去的联机冒险 */
  private session: RoomSession | null = loadSession();
  /** 这个房间里自己的座位凭证（开局时存成 session） */
  private roomToken = '';
  /** 联机冒险中断线：连上服务器后自动回到对局 */
  private rejoinPending = false;
  /** 正在回到联机冒险，服务器还没回复 */
  private rejoining = false;
  /** 收到的结算来自已经结束的那局（离开期间结束的），结算后回真新镇 */
  private roomGone = false;
  /** 联机 / 对战的菜单打开中：打开前是不是自动战斗（null 表示没打开） */
  private menuAuto: boolean | null = null;
  private cloud = new Cloud();
  /** 云存档还在做第一次对齐，先别刷新标题把选择盖掉 */
  private cloudBooting = true;
  private accountOpen = false;
  private accountBack: () => void = () => {};
  private conflictOpen = false;

  start() {
    initInput(this.canvas);
    initGamepad({
      pause: () => {
        if (this.where === 'game') this.pauseOrMenu();
        else if (this.where === 'town') this.openPlace('settings');
      },
      action: () => { if (this.where === 'town') this.town?.interact(); },
      menu: () => { if (this.where === 'town') this.openPlace('quick'); },
    });
    this.applySettings();
    const unlock = () => { initAudio(); setVolume(this.profile.settings.volume, this.profile.settings.music); };
    playMusic('shop');
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('gamepadconnected', unlock);
    const tryFullscreen = () => { if (this.profile.settings.fullscreen) this.enterFullscreen(); };
    window.addEventListener('pointerdown', tryFullscreen);
    window.addEventListener('keydown', tryFullscreen);
    const onFs = () => {
      // 玩家按 Esc 退出全屏后，不要下一次点击又强行进去
      const el = document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      if (!el && this.profile.settings.fullscreen) {
        this.profile.settings.fullscreen = false;
        saveProfile(this.profile);
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (typing) return;
      const menuOpen = this.menuAuto !== null && !this.screen.classList.contains('hidden');
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && this.where === 'game') {
        // Esc 先交给浏览器退出全屏，不要同时把游戏暂停
        if (e.key === 'Escape' && (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement)) return;
        this.pauseOrMenu();
      }
      if ((e.code === 'KeyT' || e.key === 't' || e.key === 'T') && this.where === 'game' && !this.paused && !menuOpen) this.toggleAuto();
    });
    window.addEventListener('beforeunload', (e) => { if (this.where === 'game' && !this.solo) e.preventDefault(); });
    // 真新镇里的快捷键：1~5 直接打开对应的地方，M 打开快速前往
    window.addEventListener('keydown', (e) => {
      if (this.where !== 'town' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = Number(e.key);
      if (n >= 1 && n <= QUICK.length) this.openPlace(QUICK[n - 1].id);
      else if (e.code === 'KeyM') this.openPlace('quick');
    });
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
    this.cloud.profile = this.profile;
    this.cloud.gate = () => this.where !== 'game';
    this.cloud.onChange = (kind) => {
      if (this.accountOpen && kind === 'auth') this.openAccount(this.accountBack);
      else if (kind === 'sync' && this.accountOpen) {
        const el = document.getElementById('cloud-status');
        if (el) el.textContent = this.cloud.statusLine();
      } else if (kind === 'auth' && this.where === 'title' && !this.accountOpen && !this.conflictOpen && !this.cloudBooting) this.title(false);
    };
    this.cloud.onApplied = () => this.afterCloud();
    this.cloud.onConflict = () => this.onCloudConflict();
    watchProfile((p) => this.cloud.note(p));
    window.addEventListener('pagehide', () => this.cloud.flushOnLeave());
    // 先摘下邮件 / Google 跳回来的令牌，再读地址栏：标题界面会把 ?room= 清掉，也可能把 # 清掉
    this.cloud.captureUrl();
    const params = new URLSearchParams(location.search);
    this.ensureWs();
    const room = params.get('room');
    if (room && /^\d{5}$/.test(room)) this.pendingRoom = room;
    this.title();
    void this.cloud.boot(this.profile).then((mode) => {
      this.cloudBooting = false;
      if (this.where !== 'title' || this.accountOpen || this.conflictOpen) return;
      if (mode === 'recovery') this.openAccount(() => this.title(false));
      else if (this.cloud.decision && !this.cloud.held) this.presentConflict(() => this.title(false));
      else this.title(false);
    });
    if (params.has('debug')) Object.assign(window, { __send: (m: C2S) => this.send(m), __icons: { iconUrl, ITEMS, skillIconUrl, SKILLS }, __app: this });
    if (this.pendingRoom && this.profile.setup) this.play();
  }

  applySettings() {
    const s = this.profile.settings;
    setVolume(s.volume, s.music);
    setUiScale(s.uiScale);
    setTransitions(s.transitions);
    this.canvas.style.filter = s.gbFilter ? 'grayscale(1) sepia(1) hue-rotate(42deg) saturate(2.4) brightness(.8) contrast(1.2)' : '';
    if (this.view) { this.view.settings = s; this.view.resize(); }
    if (s.fullscreen) this.enterFullscreen();
    else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }

  /** 浏览器全屏（和全屏播放视频一样）。必须由点击或按键触发，静默调用会被浏览器拒绝 */
  private enterFullscreen() {
    const current = document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    if (current || !this.profile.settings.fullscreen) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const req = el.requestFullscreen?.bind(el);
    if (req) {
      Promise.resolve(req({ navigationUI: 'hide' })).catch(() => { try { el.webkitRequestFullscreen?.(); } catch { /* 这个浏览器不允许 */ } });
      return;
    }
    try { el.webkitRequestFullscreen?.(); } catch { /* 不支持全屏 */ }
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
      if (this.rejoinPending) { this.rejoinPending = false; this.rejoin(); }
      this.presence();
      this.reportProgress();
      if (this.where === 'browse') ws.send({ t: 'browse', on: true });
      this.browser?.setStats(this.stats, true);
      if (this.pvpUi) { this.pvpUi.setConnected(true); for (const mode of PVP_MODE_IDS) this.requestBoard(mode); }
    };
    ws.onMessage = (m) => {
      if (!(m instanceof ArrayBuffer) && (m.t === 'rooms' || m.t === 'stats')) {
        this.stats = m.stats;
        const el = document.getElementById('title-online');
        if (el) el.textContent = onlineText(this.stats);
        this.browser?.setStats(this.stats, true);
        if (m.t === 'rooms') this.browser?.setRooms(m.rooms);
        return;
      }
      if (!(m instanceof ArrayBuffer)) {
        if (m.t === 'town') {
          this.town?.setPeers(m.you, m.peers);
          if (this.town) this.townHud?.setOnline(this.town.online(), this.stats?.online);
          return;
        }
        if (m.t === 'pvpBoard') { this.notePvpBest(m.me?.best); this.pvpUi?.setBoard(m); return; }
        if (m.t === 'rankBoard') { this.pvpUi?.setRank(m); return; }
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
        this.t = null;
        this.rejoining = false;
        if (this.where === 'game' && !this.solo && !this.pvpMatch && this.session) {
          // 联机冒险中断线：AI 先替你战斗，连上以后自动回去
          this.rejoinPending = true;
          this.showReconnect();
        } else {
          toast(reason, 'error', 4000);
          this.leaveGame();
          this.home();
        }
      }
      // 服务器重启或网络波动时自动重连（等着回到对局时重连得快一些）
      const delay = this.rejoinPending ? 1500 : Math.min(30000, 2000 * 2 ** this.wsRetry++);
      window.setTimeout(() => this.ensureWs(), delay);
    };
    return ws;
  }

  /** 把冒险的最好成绩和徽章数报给服务器（排行榜用；还没有成绩时不报） */
  private reportProgress() {
    const ws = this.ws, p = this.profile;
    const badges = badgeCount(p);
    if (!ws?.connected || !p.setup || (!p.bestRun && !badges)) return;
    const id = pvpIdentity(p);
    if (p.bestRun) ws.send({ t: 'runReport', ...id, name: this.name(), run: p.bestRun });
    if (badges) ws.send({ t: 'gymReport', ...id, name: this.name(), badges, dex: partnerDex(p), shiny: p.partnerShiny || undefined });
  }

  /** 对战场的最高分：第一次达到超级球级时背包扩展 */
  private notePvpBest(best: number | undefined) {
    if (notePvpBest(this.profile, best)) {
      sfx('achieve');
      toast(`对战场达到${PARTY_BONUS_TIER.name}！背包扩展到 ${partyMax(this.profile)} 格`, 'gold', 5000);
    }
  }

  private setSession(s: RoomSession | null) {
    this.session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* 隐私模式等情况下无法保存 */ }
    this.townHud?.setRejoin(s);
  }

  /** 断线了：画面停在原地，上面盖一层「正在重新连接」 */
  private showReconnect() {
    this.menuAuto = null;
    setInputEnabled(false);
    this.screen.classList.remove('hidden');
    mount(this.screen, h('div', { class: 'box pause reconnect' },
      h('h2', null, uiIcon('refresh', 3), ' 连接断开了'),
      h('p', { class: 'pause-note' }, '正在重新连接服务器……AI 会先替你战斗，连上以后自动回到这局冒险。'),
      h('div', { class: 'menu-list' },
        h('button', { class: 'menu-item', 'data-back': '1', onclick: () => { this.rejoinPending = false; this.leaveGame(); this.home(); } },
          h('span', { class: 'mi-ico' }, uiIcon('home', 3)), h('span', { class: 'mi-text' }, '先回真新镇', h('small', null, '之后在镇上还能回到这局冒险'))),
      ),
    ), 'reconnect');
  }

  /** 回到离开或断线的联机冒险 */
  rejoin() {
    const s = this.session;
    if (!s) return;
    const ws = this.ensureWs();
    if (this.t && this.t !== ws) this.close();
    this.solo = false;
    this.t = ws;
    this.rejoining = true;
    this.roomGone = false;
    ws.send({ t: 'rejoin', code: s.code, token: s.token, v: PROTOCOL_VERSION });
    if (this.where !== 'game') this.loading(`正在回到房间 ${s.code} 的冒险…`);
  }

  /** Esc / 手柄 Start / 右上角的按钮：单人暂停（波次中和升级、商店阶段都可以），联机和对战打开菜单 */
  private pauseOrMenu() {
    if (this.where !== 'game') return;
    if (this.solo) {
      const phase = this.pub?.phase;
      if (this.paused || (!this.ending && (phase === 'wave' || phase === 'inter'))) this.setPause(!this.paused);
      return;
    }
    if (this.menuAuto !== null) this.closeGameMenu();
    else this.openGameMenu();
  }

  /** 联机冒险 / 对战的菜单：游戏不会暂停，打开期间由 AI 暂时替你战斗 */
  private openGameMenu() {
    this.menuAuto = this.autoOn;
    if (!this.autoOn) this.setAutoLocal(true);
    this.renderGameMenu();
  }

  private renderGameMenu() {
    setInputEnabled(false);
    this.screen.classList.remove('hidden');
    const pvp = this.pvpMatch;
    pauseScreen(this.screen, {
      menu: true,
      note: '联机时游戏不会暂停。打开菜单期间，AI 会暂时替你战斗。',
      resume: () => this.closeGameMenu(),
      settings: () => this.openSettings(() => this.renderGameMenu()),
      quit: pvp
        ? { label: pvp.practice || pvp.gym ? '离开这场练习' : '离开对战（本场判负）', confirm: '再点一次离开', run: () => { this.menuAuto = null; this.leavePvp(); } }
        : { label: '离开房间（AI 继续替你战斗，可以回来）', confirm: '再点一次离开', run: () => { this.menuAuto = null; this.leaveCoop(); } },
    });
  }

  private closeGameMenu() {
    const was = this.menuAuto;
    this.menuAuto = null;
    clear(this.screen);
    this.screen.classList.add('hidden');
    if (was === false && this.where === 'game') this.setAutoLocal(false);
    if (!this.inter?.visible) setInputEnabled(true);
  }

  /** 对局结束时菜单（或从菜单打开的设置）还开着：直接收起来，不再切换自动战斗 */
  private dropGameMenu() {
    if (this.menuAuto === null) return;
    this.menuAuto = null;
    this.accountOpen = false;
    clear(this.screen);
    this.screen.classList.add('hidden');
  }

  /** 离开联机冒险：AI 先替你战斗，在真新镇或宝可梦中心随时可以回来 */
  private leaveCoop() {
    this.close();
    this.where = 'place';
    toast('你离开了房间，AI 会先替你战斗。在真新镇可以随时回到这局冒险', 'info', 5000);
    this.backToTown();
  }

  /** 告诉服务器自己是谁、在不在真新镇（镇上的其他玩家能看到你） */
  private presence() {
    if (!this.profile.setup || !this.ws?.connected) return;
    const p = this.profile;
    const busy = this.where === 'game' && (this.solo || !!this.pvpMatch?.practice);
    this.ws.send({
      t: 'presence', name: this.name(), trainer: p.trainer, dex: partnerDex(p), shiny: p.partnerShiny ? 1 : undefined,
      town: this.where === 'town' || this.where === 'place', busy: busy ? 1 : undefined,
    });
    if ((this.where === 'town' || this.where === 'place') && this.town) {
      const pos = this.town.pos;
      this.ws.send({ t: 'tpos', x: pos.x, y: pos.y, d: this.town.me.dir, m: 0 });
    }
  }

  // ------------------------------------------------------------ 标题与开场

  title(autoConflict = true) {
    this.where = 'title';
    this.accountOpen = false;
    this.conflictOpen = false;
    this.browser = null;
    this.pvpUi = null;
    this.hideTown();
    this.menu.start();
    if (location.search.includes('room=')) setRoomParam(null);
    this.screen.classList.remove('hidden');
    playMusic('shop');
    titleScreen(this.screen, this.profile, {
      play: () => this.play(),
      account: () => this.openAccount(() => this.title(false)),
      settings: () => this.openSettings(() => this.title(false)),
      credits: () => creditsScreen(this.screen, () => this.title(false)),
    }, this.stats, this.cloud.menuHint());
    this.presence();
    this.ws?.send({ t: 'stats' });
    this.cloud.poke();
    if (autoConflict && !this.cloudBooting && this.cloud.decision && !this.cloud.held) this.presentConflict(() => this.title(false));
  }

  private openSettings(onBack: () => void) {
    settingsScreen(this.screen, this.profile, () => this.applySettings(), onBack, () => this.openAccount(() => this.openSettings(onBack)));
  }

  private openAccount(onBack: () => void) {
    this.accountBack = onBack;
    this.accountOpen = true;
    this.conflictOpen = false;
    this.screen.classList.remove('hidden');
    void this.cloud.ensure();
    accountScreen(this.screen, this.cloud, {
      back: () => { this.accountOpen = false; onBack(); },
      applied: () => this.afterCloud(),
    });
  }

  private presentConflict(onBack: () => void) {
    if (!this.cloud.decision) { onBack(); return; }
    this.conflictOpen = true;
    this.accountOpen = false;
    this.screen.classList.remove('hidden');
    conflictScreen(this.screen, this.cloud, {
      back: () => { this.conflictOpen = false; onBack(); },
      applied: () => this.afterCloud(),
    });
  }

  private onCloudConflict() {
    if (this.cloudBooting || this.cloud.held || !this.cloud.decision) return;
    if (this.accountOpen) { this.openAccount(this.accountBack); return; }
    if (this.where === 'game') { toast('云端进度和这台设备不一样。这局结束后再到账号里选择保留哪一份', 'info', 5000); return; }
    if (this.where === 'title') this.presentConflict(() => this.title(false));
    else if (this.where === 'town') this.presentConflict(() => { this.conflictOpen = false; this.enterTown(); });
  }

  /** 云端进度写回之后：刷新训练家、把对战身份报给服务器 */
  private afterCloud() {
    this.applySettings();
    const p = this.profile;
    this.town?.setIdentity(p.trainer, this.name(), partnerDex(p), p.partnerShiny);
    this.townHud?.refresh();
    this.presence();
    this.reportProgress();
    if (this.pvpUi) for (const mode of PVP_MODE_IDS) this.requestBoard(mode);
  }

  /** 开始游戏：第一次先走开场，之后直接进真新镇 */
  play() {
    if (!this.profile.setup) { void transition('fade', () => this.setup()); return; }
    void transition('fade', () => this.arrive());
  }

  /** 来到真新镇（从标题或开场）：显示地名牌；邀请链接里有房间号就直接加入 */
  private arrive() {
    this.enterTown();
    placeSign('真新镇', '纯白的开始之镇');
    const room = this.pendingRoom;
    this.pendingRoom = null;
    if (room) this.joinRoom(room);
  }

  setup() {
    this.where = 'setup';
    this.menu.start();
    this.screen.classList.remove('hidden');
    setupScreen(this.screen, this.profile, (trainer, starter, name) => {
      const p = this.profile;
      p.trainer = trainer;
      p.partner = starter;
      p.partnerShiny = false;
      p.name = name;
      if (!p.owned.includes(starter)) p.owned.push(starter);
      p.setup = true;
      p.stats.owned = unlockedLines(p).length;
      saveProfile(p);
      void transition('iris', () => this.arrive(), { hold: 250 });
    });
  }

  /** 回到「家」：完成开场的玩家回真新镇，否则回标题 */
  home() {
    if (this.profile.setup) this.enterTown();
    else this.title();
  }

  /** 从建筑里出来（淡出淡入） */
  private backToTown() {
    void transition('fade', () => this.enterTown());
  }

  /** 第一次来到真新镇：大木博士介绍一下镇上的界面（引导期间不能走动） */
  private townTour() {
    if (this.where !== 'town' || this.profile.guide.town || tourActive()) return;
    setInputEnabled(false);
    tour(this.profile, 'town', TOURS.town, { done: () => { if (this.where === 'town') setInputEnabled(true); } });
  }

  // ------------------------------------------------------------ 真新镇

  enterTown(from: PlaceId | null = this.place) {
    this.where = 'town';
    this.place = null;
    this.browser = null;
    this.pvpUi = null;
    this.menu.stop();
    clear(this.screen);
    this.screen.dataset.screen = '';
    this.screen.classList.add('hidden');
    const p = this.profile;
    if (!this.town) {
      this.town = new TownScene(this.canvas, () => this.profile.settings, {
        enter: (id) => this.openPlace(id, 0, 'door'),
        move: (x, y, d, m) => { if (this.ws?.connected) this.ws.send({ t: 'tpos', x: Math.round(x), y: Math.round(y), d, m: m ? 1 : 0 }); },
        spot: (s) => this.townHud?.setSpot(s),
      }, { trainer: p.trainer, name: this.name(), dex: partnerDex(p), shiny: p.partnerShiny, pos: p.townPos });
    }
    this.town.setIdentity(p.trainer, this.name(), partnerDex(p), p.partnerShiny);
    if (from) this.town.placeAt(from);
    this.town.active = true;
    this.town.start();
    if (!this.townHud) {
      this.townHud = new TownHud(this.ui, p, {
        card: () => this.openPlace('home', 1),
        settings: () => { this.openPlace('settings'); },
        help: () => { this.openPlace('help'); },
        title: () => { this.saveTownPos(); void transition('fade', () => this.title()); },
        interact: () => this.town?.interact(),
        go: (id, tab) => this.openPlace(id, tab ?? 0),
        rejoin: () => { sfx('click'); this.hideTown(); this.rejoin(); },
      });
    }
    this.townHud.refresh();
    this.townHud.setRejoin(this.session);
    this.townHud.show(true);
    setInputEnabled(true);
    playMusic('town');
    hideTip();
    this.presence();
    this.cloud.poke();
    if (!this.cloudBooting && this.cloud.decision && !this.cloud.held && !this.conflictOpen) {
      setInputEnabled(false);
      this.presentConflict(() => this.enterTown());
      return;
    }
    if (!p.guide.town) window.setTimeout(() => this.townTour(), 700);
  }

  private saveTownPos() {
    if (!this.town) return;
    this.profile.townPos = this.town.pos;
    saveProfile(this.profile);
  }

  private hideTown() {
    if (this.town) { this.saveTownPos(); this.town.stop(); this.town.active = false; }
    this.townHud?.show(false);
  }

  /** 建筑里的界面背后继续显示真新镇（其他玩家照样走来走去），没有进过镇就显示标题背景 */
  private backdrop() {
    setInputEnabled(false);
    this.townHud?.show(false);
    if (this.town && this.profile.setup) {
      this.menu.stop();
      this.town.active = false;
      this.town.start();
    } else this.menu.start();
  }

  /**
   * 进入建筑 / 和 NPC 说话：镇上的画面留在背后。
   * via=door：走到门口进去的，出来时站在门口；其它（快捷栏、训练家卡片、左下角的信息……）出来时还站在原地。
   */
  openPlace(id: PlaceId | 'settings' | 'help' | 'quick', tab = 0, via: 'door' | 'remote' = 'remote') {
    if ((this.where !== 'town' && this.where !== 'place') || tourActive()) return;
    if (this.where === 'town') this.place = via === 'door' && BUILDINGS.has(id) ? id as PlaceId : null;
    const fromTown = this.where === 'town';
    this.where = 'place';
    this.townHud?.setSpot(null);
    sfx('click');
    const show = () => {
      this.backdrop();
      this.screen.classList.remove('hidden');
      this.renderPlace(id, tab, via);
    };
    if (fromTown && BUILDINGS.has(id)) {
      setInputEnabled(false);
      void transition('door', show);
    } else show();
  }

  private renderPlace(id: PlaceId | 'settings' | 'help' | 'quick', tab: number, via: 'door' | 'remote') {
    const back = () => this.backToTown();
    // 对话框关掉就回到镇上，不需要过场
    const close = () => this.enterTown();
    const changed = () => { this.townHud?.refresh(); this.town?.setIdentity(this.profile.trainer, this.name(), partnerDex(this.profile), this.profile.partnerShiny); this.presence(); };
    const p = this.profile;
    switch (id) {
      case 'home': homeScreen(this.screen, p, { back, changed }, tab); break;
      case 'lab':
        labHub(this.screen, p, { back, changed }, tab);
        tour(p, 'lab', TOURS.lab);
        break;
      case 'oak': {
        const n = unlockedLines(p).length;
        const b = badgeCount(p);
        const s = p.shiny.length;
        npcDialog(this.screen, '大木博士', n >= 79 ? `了不起！你已经和所有的宝可梦都成为朋友了！${s ? `闪光宝可梦也有 ${s} 种了。` : ''}`
          : `你已经拥有 ${n} 种宝可梦${b ? `、${b} 枚徽章` : ''}${s ? `，还有 ${s} 种闪光宝可梦` : ''}了！冒险中击败野生宝可梦时，它们有时会崇拜你。研究所里的「友情缎带」能让它们更容易崇拜你，「闪光研究」能让闪光宝可梦更常出现哦。`, [
          ['去研究所', () => labHub(this.screen, p, { back, changed }, 1), 'gold'],
          ['好的', close, 'ghost'],
        ], { art: 'oak' });
        break;
      }
      case 'karp': karpDialog(this.screen, p, (bought) => { if (bought) changed(); close(); }); break;
      case 'mom': {
        const b = badgeCount(p);
        const g = nextGym(p.badges);
        npcDialog(this.screen, '妈妈', b
          ? `${this.name()}，听说你已经拿到 ${b} 枚徽章了！${g ? `下一个是${g.name}吧？` : '妈妈真为你骄傲！'}出门要注意安全，累了就回家，我会让${LINES[p.partner]?.name ?? '宝可梦'}好好休息的。`
          : `${this.name()}，出门冒险要注意安全哦。累了就回家，我会让${LINES[p.partner]?.name ?? '宝可梦'}好好休息的。`, [['知道了', close]], { npc: 'mom' });
        break;
      }
      case 'rival':
        npcDialog(this.screen, '小茂的家', '小茂的姐姐：小茂说他要去挑战道馆，还要在对战场成为最强的训练家。你要不要也去看看？', [
          ['去道馆', () => this.gymCenter(), 'gold'],
          ['去对战场', () => this.pvpCenter()],
          ['好的', close, 'ghost'],
        ]);
        break;
      case 'quick': quickMenu(this.screen, (to) => { this.where = 'town'; this.openPlace(to); }, close); break;
      case 'sign':
        npcDialog(this.screen, '告示牌', '真新镇 —— 纯白的开始之镇。北边是 1 号道路，从那里出发冒险；宝可梦中心可以和朋友联机；东边的道馆可以挑战道馆馆主、和其他训练家对战。', [['好的', close]]);
        break;
      case 'route': this.route(); break;
      case 'center': this.browse(); break;
      // 走进道馆的门先遇到道馆向导；快捷栏的「对战」直接去对战场
      case 'battle': if (via === 'door') this.gymGuide(); else this.pvpCenter(); break;
      case 'gym': this.gymCenter(); break;
      case 'settings': this.openSettings(close); break;
      case 'help': creditsScreen(this.screen, close); break;
    }
  }

  /** 1 号道路：确认难度后直接带着伙伴出发 */
  private route() {
    const p = this.profile;
    const render = () => routeScreen(this.screen, p, {
      go: (d) => void transition('battle', () => this.startSolo(partnerOf(p), d), { hold: 300 }),
      partner: () => partnerModal(p, (m) => { this.setPartner(m); render(); }),
      back: () => this.backToTown(),
    });
    render();
    tour(p, 'route', TOURS.route);
  }

  private setPartner(m: Mon) {
    if (!ownsMon(this.profile, m)) return;
    this.profile.partner = m.line;
    this.profile.partnerShiny = m.shiny;
    saveProfile(this.profile);
    this.town?.setIdentity(this.profile.trainer, this.name(), partnerDex(this.profile), m.shiny);
    this.townHud?.refresh();
    this.presence();
  }

  // ------------------------------------------------------------ 宝可梦中心：联机房间

  browse() {
    this.where = 'browse';
    this.backdrop();
    this.screen.classList.remove('hidden');
    const ws = this.ensureWs();
    this.browser = new BrowseScreen(this.screen, {
      create: (pub) => this.createRoom(pub),
      join: (code) => this.joinRoom(code),
      back: () => { this.ws?.send({ t: 'browse', on: false }); this.backToTown(); },
      rejoin: () => { this.ws?.send({ t: 'browse', on: false }); this.browser = null; this.rejoin(); },
    }, ws.connected, this.session?.code ?? null);
    if (this.stats) this.browser.setStats(this.stats, ws.connected);
    if (ws.connected) ws.send({ t: 'browse', on: true });
  }

  // ------------------------------------------------------------ 对战场

  /**
   * 对战中心：背包、匹配、段位与排行榜（自动用跟随的伙伴出战）。
   * tab：0 对战 · 1 背包 · 2 排行榜；gym：从这个道馆过来的，出门时回到道馆
   */
  pvpCenter(tab = 0, gym?: string) {
    this.where = 'pvp';
    this.browser = null;
    this.backdrop();
    this.screen.classList.remove('hidden');
    const ws = this.ensureWs();
    this.pvpUi = new PvpScreen(this.screen, this.profile, {
      queue: (mode, team) => this.pvpQueue(mode, team),
      cancel: () => {
        this.ws?.send({ t: 'pvpCancel' });
        this.pvpUi?.setQueued(null);
        this.pvpMatch = null;
        if (this.t === this.ws) this.t = null;
      },
      practice: (mode, team) => this.pvpPractice(mode, team),
      release: (uid) => releaseFromParty(this.profile, uid),
      board: (mode) => { saveProfile(this.profile); this.requestBoard(mode); },
      rank: (kind) => { this.reportProgress(); this.ws?.send({ t: 'rankBoard', kind, ...pvpIdentity(this.profile) }); },
      partner: (mon) => { this.setPartner(buildMon(mon.build)); this.profile.pvpPick = mon.uid; saveProfile(this.profile); },
      adventure: () => { this.pvpUi = null; this.where = 'place'; this.route(); },
      back: () => { saveProfile(this.profile); this.pvpUi = null; if (gym) this.gymCenter(gym); else this.backToTown(); },
    }, ws.connected, tab, gym ? '道馆' : null);
    if (ws.connected) for (const mode of PVP_MODE_IDS) this.requestBoard(mode);
    if (!tab) tour(this.profile, 'pvp', TOURS.pvp);
  }

  // ------------------------------------------------------------ 道馆

  /** 走进道馆的门：道馆向导打招呼，问你要挑战道馆还是去对战场 */
  private gymGuide() {
    const p = this.profile;
    const g = nextGym(p.badges);
    const tip = g ? `下一个是${g.name}，馆主${g.leader.name}擅长${TYPE_NAME[g.type]}系，推荐 Lv${g.leader.level}。` : '';
    npcDialog(this.screen, GUIDE.name, g ? `${GUIDE.hello}${tip}` : GUIDE.done, [
      ['挑战道馆', () => this.gymCenter(), 'gold'],
      ['排位对战', () => this.pvpCenter()],
      ['下次再说', () => this.enterTown(), 'ghost'],
    ], { npc: 'guide' });
  }

  /** 道馆挑战：徽章盒、八个道馆与你的出战队伍 */
  gymCenter(sel?: string) {
    this.where = 'place';
    this.pvpUi = null;
    this.backdrop();
    this.screen.classList.remove('hidden');
    playMusic('town');
    gymScreen(this.screen, this.profile, {
      challenge: (g, team) => this.gymChallenge(g, team),
      team: (g) => this.pvpCenter(1, g.id),
      adventure: () => this.route(),
      back: () => this.backToTown(),
    }, sel);
    tour(this.profile, 'gym', TOURS.gym);
  }

  /** 道馆训练家 / 馆主开战前的台词（打败过道馆训练家就直接挑战馆主） */
  private gymChallenge(g: GymDef, team: PartyMon[], stage?: GymStage) {
    const p = this.profile;
    const st: GymStage = stage ?? (p.gymJunior[g.id] || p.badges[g.id] ? 'leader' : 'junior');
    const T = g[st];
    const foes = gymTeam(g, st);
    this.where = 'place';
    this.backdrop();
    this.screen.classList.remove('hidden');
    talk(this.screen, {
      name: `${T.title} · ${T.name}`, art: T.art,
      text: st === 'leader' && p.badges[g.id] ? g.leader.rematch : T.intro,
      extra: h('div', { class: 'talk-team' }, foes.map((b) => portraitSlot(formOf(b.line, b.stage).dex, 1, 'tiny')), h('span', { class: 'small muted' }, `Lv${T.level}`)),
      buttons: [
        [st === 'leader' ? '挑战馆主！' : '迎战！', () => this.startGymBattle(g, team, st), 'gold'],
        ['再准备一下', () => this.gymCenter(g.id), 'ghost'],
      ],
    });
  }

  private startGymBattle(g: GymDef, team: PartyMon[], stage: GymStage) {
    mobileFullscreen();
    const T = g[stage];
    void transition('battle', () => {
      if (this.pvpUi?.isQueued) this.ws?.send({ t: 'pvpCancel' });
      this.close();
      this.solo = false;
      this.pvpMatch = { mode: '1v1', uids: team.map((m) => m.uid), practice: true, seats: [], gym: { id: g.id, stage } };
      const t = new LocalPvpTransport('1v1', { name: this.name(), team: team.map((m) => m.build), meta: this.meta(), trainer: this.profile.trainer, auto: this.profile.pvpAuto },
        [], { name: T.name, trainer: T.art, builds: gymTeam(g, stage), meta: g.meta });
      this.t = t;
      t.onMessage = (m) => this.onMessage(m);
    }, { hold: 300 });
  }

  /** 道馆对战结束：输了可以再来；赢了道馆训练家接着挑战馆主；赢了馆主颁发徽章 */
  private endGym(g: GymDef, stage: GymStage, team: PartyMon[], res: PvpMatchResult, you: number, report: () => void) {
    const p = this.profile;
    const T = g[stage];
    const me = res.players.find((x) => x.id === you);
    const won = !!me && res.winner === me.team;
    const back = () => this.gymCenter(g.id);
    const who = { name: `${T.title} · ${T.name}`, art: T.art };
    const log = (p.gymLog[g.id] ??= { tries: 0, wins: 0 });
    log.tries++;
    if (won) log.wins++;
    saveProfile(p);
    if (!won) {
      talk(this.screen, { ...who, text: T.win, buttons: [['再挑战一次', () => this.gymChallenge(g, team, stage), 'gold'], ['查看战报', report], ['回去准备', back, 'ghost']] });
      return;
    }
    if (stage === 'junior') {
      p.gymJunior[g.id] = Date.now();
      saveProfile(p);
      talk(this.screen, { ...who, text: T.lose, buttons: [['挑战馆主！', () => this.gymChallenge(g, team, 'leader'), 'gold'], ['查看战报', report], ['先休息一下', back, 'ghost']] });
      return;
    }
    const mine = res.players.filter((x) => x.owner === me!.owner);
    const reward = winGym(p, { gym: g.id, underdog: isUnderdog(team.map((m) => m.build), g), auto: me!.bot, flawless: mine.every((x) => x.alive) });
    this.townHud?.refresh();
    if (reward.badge) this.reportProgress();
    const ceremony = () => {
      if (!reward.badge) { back(); return; }
      void badgeCeremony({
        icon: g.badge.icon, name: g.badge.name, color: g.badge.color, gym: g.name, bonus: badgeBonus(g), stardust: reward.stardust,
        achievements: reward.newAchievements.map((a) => a.name),
      }).then(back);
    };
    if (!reward.badge && reward.newAchievements.length) toast(`新成就：${reward.newAchievements.map((a) => a.name).join('、')}（星之沙 +${reward.stardust}）`, 'gold', 4000);
    talk(this.screen, { ...who, text: T.lose, buttons: reward.badge ? [['收下徽章', ceremony, 'gold']] : [['查看战报', report], ['好的', back, 'gold']] });
  }

  private requestBoard(mode: PvpMode) {
    this.ws?.send({ t: 'pvpBoard', mode, ...pvpIdentity(this.profile) });
  }

  private pvpQueue(mode: PvpMode, team: PartyMon[]) {
    mobileFullscreen();
    this.close();
    this.solo = false;
    this.t = this.ensureWs();
    this.profile.pvpMode = mode;
    this.profile.pvpPick = team[0].uid;
    saveProfile(this.profile);
    this.pvpMatch = { mode, uids: team.map((m) => m.uid), practice: false, seats: [] };
    this.send({
      t: 'pvpQueue', mode, team: team.map((m) => m.build), name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION,
      trainer: this.profile.trainer, auto: this.profile.pvpAuto || undefined, ...pvpIdentity(this.profile),
    });
  }

  private pvpPractice(mode: PvpMode, team: PartyMon[]) {
    mobileFullscreen();
    if (this.pvpUi?.isQueued) this.ws?.send({ t: 'pvpCancel' });
    this.close();
    this.solo = false;
    this.profile.pvpMode = mode;
    this.profile.pvpPick = team[0].uid;
    saveProfile(this.profile);
    this.pvpMatch = { mode, uids: team.map((m) => m.uid), practice: true, seats: [] };
    const others = this.profile.party.filter((m) => !team.includes(m)).map((m) => m.build);
    const t = new LocalPvpTransport(mode, { name: this.name(), team: team.map((m) => m.build), meta: this.meta(), trainer: this.profile.trainer, auto: this.profile.pvpAuto }, others);
    this.t = t;
    t.onMessage = (m) => this.onMessage(m);
  }

  private leavePvp() {
    const practice = this.pvpMatch?.practice;
    const gym = this.pvpMatch?.gym;
    this.pvpMatch = null;
    this.close();
    if (!practice) toast('你离开了对战，本场判负', 'error');
    if (gym) this.gymCenter(gym.id);
    else this.pvpCenter();
  }

  /** 对战结束：先在画面中央显示胜负，再淡出到结算（道馆对战接着显示台词） */
  private async endPvp(res: PvpMatchResult, you: number, rating: PvpRatingChange | null) {
    const match = this.pvpMatch;
    this.pvpMatch = null;
    this.notePvpBest(rating?.record.best);
    const me = res.players.find((p) => p.id === you);
    const outcome = !me || res.winner < 0 ? 'draw' : res.winner === me.team ? 'win' : 'loss';
    const team = (match?.uids ?? []).map((u) => this.profile.party.find((m) => m.uid === u)).filter((m): m is PartyMon => !!m);
    if (match && !match.practice && team.length) {
      for (const mon of team) {
        if (outcome === 'win') mon.pvp.wins++;
        else if (outcome === 'loss') mon.pvp.losses++;
        else mon.pvp.draws++;
      }
      saveProfile(this.profile);
    }
    setInputEnabled(false);
    sfx(outcome === 'win' ? 'clear' : outcome === 'loss' ? 'down' : 'wave');
    await bigBanner(outcome === 'win' ? '胜利！' : outcome === 'loss' ? '败北……' : '平局', res.reason === 'ko' ? (outcome === 'win' ? '击倒了全部对手' : outcome === 'loss' ? '我方全员倒下' : '双方同时倒下') : '时间到', outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw');
    const gym = match?.gym ? GYM_BY_ID[match.gym.id] : null;
    const report = () => pvpResultsScreen(this.screen, res, you, rating, match?.seats ?? [], true, {
      again: () => (gym && match?.gym ? this.gymChallenge(gym, team, match.gym.stage) : this.pvpCenter()),
      back: () => (gym ? this.gymCenter(gym.id) : this.pvpCenter()),
      home: () => this.backToTown(),
    });
    void transition('fade', () => {
      const t = this.t;
      this.t = null;
      if (t instanceof LocalPvpTransport) t.close();
      this.leaveGame();
      this.where = gym ? 'place' : 'results';
      this.backdrop();
      this.screen.classList.remove('hidden');
      playMusic('shop');
      if (gym && match?.gym) { this.endGym(gym, match.gym.stage, team, res, you, report); return; }
      pvpResultsScreen(this.screen, res, you, rating, match?.seats ?? [], !!match?.practice, {
        again: () => {
          this.pvpCenter();
          // 放生过的不再上场；队长没了就留在对战中心重新选
          if (!match || !team.length || team[0].uid !== match.uids[0]) return;
          if (match.practice) this.pvpPractice(match.mode, team);
          else if (this.ws?.connected) { this.pvpUi?.setWaiting(); this.pvpQueue(match.mode, team); }
        },
        back: () => this.pvpCenter(),
        home: () => this.backToTown(),
      });
    });
  }

  /** 研究所强化 + 道馆徽章：开局时加到宝可梦身上（服务器端同样计算） */
  private meta() { return { ...this.profile.upgrades, ...badgeMeta(this.profile) }; }
  private name() { return this.profile.name || TRAINERS[this.profile.trainer]?.name || '训练家'; }
  /** 加入房间时带上的身份 */
  private ident() {
    const p = this.profile;
    return { trainer: p.trainer, line: p.partner, shiny: p.partnerShiny || undefined, owned: unlockedLines(p), ownedShiny: p.shiny };
  }

  // ------------------------------------------------------------ 冒险

  startSolo(mon: Mon, difficulty: DifficultyId) {
    mobileFullscreen();
    this.close();
    this.solo = true;
    if (ownsMon(this.profile, mon)) { this.profile.partner = mon.line; this.profile.partnerShiny = mon.shiny; }
    this.pendingDifficulty = difficulty;
    this.hideTown();
    void preload(runDex([mon.line]));
    if (mon.shiny) void preload(LINES[mon.line].forms.map((f) => f.dex), true);
    const t = new LocalTransport();
    this.t = t;
    t.onMessage = (m) => this.onMessage(m);
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION, ...this.ident() });
  }

  createRoom(isPublic = true) {
    mobileFullscreen();
    this.close();
    this.solo = false;
    this.joining = true;
    this.t = this.ensureWs();
    this.browser = null;
    this.send({ t: 'create', name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION, public: isPublic, ...this.ident() });
    this.loading('正在创建房间…');
  }

  joinRoom(code: string) {
    if (navigator.userActivation?.isActive) mobileFullscreen();
    this.close();
    this.solo = false;
    this.joining = true;
    this.t = this.ensureWs();
    this.browser = null;
    this.send({ t: 'join', code, name: this.name(), meta: this.meta(), v: PROTOCOL_VERSION, ...this.ident() });
    this.loading(`正在加入房间 ${code}…`);
  }

  private loading(text: string) {
    this.hideTown();
    clear(this.screen);
    this.screen.dataset.screen = 'loading';
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<div class="box loading-box"><h3>${text}</h3></div>`;
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
    // 菜单开着时对局结束：不收起来的话，下一局第一次 Esc 会去关一个看不见的菜单
    if (m.t === 'end' || m.t === 'pvpEnd') this.dropGameMenu();
    switch (m.t) {
      case 'joined':
        this.you = m.you;
        this.code = m.code;
        this.joining = false;
        this.rejoining = false;
        this.roomToken = !m.solo && m.token ? m.token : '';
        if (this.solo) {
          this.send({ t: 'difficulty', id: this.pendingDifficulty });
          this.send({ t: 'start' });
        }
        break;
      case 'rejoinFail':
        this.rejoining = false;
        this.setSession(null);
        if (this.t === this.ws) this.t = null;
        toast(m.msg, 'error', 3500);
        if (this.where === 'game' || this.screen.dataset.screen === 'loading' || this.screen.dataset.screen === 'reconnect') { this.leaveGame(); this.home(); }
        break;
      case 'lobby':
        this.lobby = m.players;
        this.roomDifficulty = m.difficulty;
        this.roomPublic = m.public;
        if (!this.solo && (this.where === 'town' || this.where === 'place' || this.where === 'browse' || this.where === 'lobby' || this.where === 'title')) this.showLobby();
        break;
      case 'error':
        toast(m.msg, 'error', 3500);
        sfx('error');
        if (this.pvpMatch && (this.where === 'pvp' || m.fatal)) {
          this.pvpMatch = null;
          this.pvpUi?.setQueued(null);
          if (this.t === this.ws) this.t = null;
          if (m.fatal) { this.leaveGame(); this.pvpCenter(); }
          break;
        }
        if (this.joining || m.fatal) {
          this.joining = false;
          if (this.t === this.ws) this.t = null;
          if (!this.solo && this.profile.setup) { this.where = 'place'; this.browse(); }
          else this.home();
        }
        break;
      case 'start':
        // 联机冒险开局：记下座位，离开或断线后可以回来
        if (!m.pvp && !this.solo && this.roomToken) this.setSession({ code: this.code, token: this.roomToken, at: Date.now() });
        this.beginGame(m.w, m.h, m.players, m.pvp?.seats);
        break;
      case 'pvpEnd': this.endPvp(m.result, m.you, m.rating); break;
      case 'ev': this.view?.onEvents(m.e); break;
      case 'st': this.onPublic(m.s); break;
      case 'me': this.onMe(m.s); break;
      case 'md':
        if (this.me) {
          const d = m.s;
          Object.assign(this.me, { hp: d.hp, maxHp: d.maxHp, xp: d.xp, money: d.money, down: d.down, speed: d.speed });
          this.me.skills.forEach((sk, i) => { sk.cd = d.cds[i] ?? sk.cd; });
          this.onMe(this.me);
        }
        break;
      case 'cmdErr': toast(m.msg, 'error'); sfx('error'); break;
      case 'paused': this.paused = m.on; this.renderPause(); break;
      case 'end':
        // 回来时这局已经结束了：服务器补发的结算，结算完回真新镇
        if (this.rejoining) { this.rejoining = false; this.roomGone = true; if (this.t === this.ws) this.t = null; }
        if (!this.solo) this.setSession(null);
        this.endGame(m.victory, m.summary, m.board);
        break;
      case 'pong':
        if (this.t !== this.ws) break;
        this.rtt = this.rtt ? this.rtt * 0.6 + (performance.now() - m.at) * 0.4 : performance.now() - m.at;
        this.hud?.setNet(this.rtt, this.view?.interpMs ?? 0);
        break;
      case 'left': case 'rooms': case 'stats': case 'pvpBoard': case 'pvpQueued': case 'pvpCancelled': case 'town': break;
    }
  }

  private showLobby() {
    this.where = 'lobby';
    this.browser = null;
    this.backdrop();
    this.screen.classList.remove('hidden');
    lobbyScreen(this.screen, this.profile, this.code, this.you, this.lobby, {
      partner: () => {
        const taken = new Map<string, string>();
        for (const x of this.lobby) if (x.line && x.id !== this.you) taken.set(monKey({ line: x.line, shiny: !!x.shiny }), x.name);
        partnerModal(this.profile, (m) => { this.setPartner(m); this.send({ t: 'pick', line: m.line, shiny: m.shiny || undefined }); }, { taken });
      },
      ready: (on) => this.send({ t: 'ready', on }),
      start: () => this.send({ t: 'start' }),
      leave: () => { this.close(); this.where = 'place'; this.browse(); },
      difficulty: (id) => this.send({ t: 'difficulty', id }),
      visibility: (on) => this.send({ t: 'visibility', public: on }),
    }, this.roomDifficulty, this.roomPublic);
    setRoomParam(this.code);
  }

  private beginGame(w: number, h: number, players: StartPlayer[], pvpSeats?: PvpSeatInfo[]) {
    this.leaveGame();
    this.hideTown();
    this.pvpUi = null;
    this.where = 'game';
    this.menu.stop();
    clear(this.screen);
    this.screen.classList.add('hidden');
    if (!pvpSeats) void preload(runDex(players.map((p) => p.line)));
    const shinyDex = [...(pvpSeats ?? players).filter((p) => p.shiny).flatMap((p) => LINES[p.line]?.forms.map((f) => f.dex) ?? [])];
    if (shinyDex.length) void preload(shinyDex, true);
    this.view = new GameView(this.canvas, w, h, this.you, this.profile.settings, {
      onMessage: (text) => this.hud?.message(text),
      // 闪光首领：闪光的提示已经先发过了，大字也写明是闪光的
      onBoss: (name, shinyDex) => this.hud?.announce(shinyDex ? `野生的闪光${name}出现了！` : `野生的${name}出现了！`),
      onWave: (n) => {
        const b = this.view?.biome ?? 0;
        this.hud?.announce(`第 ${n} 波`, BIOMES[b]?.name ?? '');
        // 进入新的地区时，左上角挂出地名牌
        if (b !== this.lastBiome) { this.lastBiome = b; placeSign(BIOMES[b]?.name ?? '', n === 1 ? '冒险开始！' : `第 ${n} 波 · 来到了新的地区`); }
      },
      onEvolve: (pid, text) => {
        if (pid === this.you) this.hud?.announce(text);
        else this.hud?.message(`${players.find((p) => p.id === pid)?.name ?? '队友'}：${text}`);
      },
      onRecruit: (pid, dex, line, shiny) => this.onRecruit(pid, dex, line, shiny, players),
      onShiny: (dex) => {
        const line = LINE_OF_DEX[dex];
        const name = DEX[dex]?.name ?? '';
        this.hud?.announce(`闪光的${name}出现了！`, this.profile.shiny.includes(line) ? '已经有这只闪光宝可梦了' : '打倒它，它一定会崇拜你！');
        this.hud?.message(`闪闪发光！野生的${name}是闪光宝可梦！`);
      },
    });
    this.view.isOwned = (line) => isUnlocked(this.profile, line);
    this.view.isShinyOwned = (line) => this.profile.shiny.includes(line);
    for (const p of players) this.view.names.set(p.id, p.name);
    this.view.onView = (w, h) => this.send({ t: 'view', w, h });
    this.view.resize();
    this.rtt = 0;
    if (this.t === this.ws) {
      this.send({ t: 'ping', at: performance.now() });
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 2000);
    }
    this.view.send = (x, y, moving, dir) => this.send({ t: 'pos', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, m: moving ? 1 : 0, d: Math.round(dir * 100) / 100, k: this.view?.lastTick });
    this.view.sendAck = (k) => { if (this.t === this.ws) this.send({ t: 'ack', k }); };
    this.view.canMove = () => !this.paused && !(this.inter?.visible ?? false);
    const mine = players.find((p) => p.id === this.you);
    this.autoOn = false;
    if (pvpSeats) {
      const mode = this.pvpMatch?.mode ?? (pvpSeats.length > 6 ? '4v4' : '1v1');
      const M = PVP_MODES[mode];
      if (this.pvpMatch) this.pvpMatch.seats = pvpSeats;
      // 单挑时同一位训练家的三只头上显示宝可梦的名字，团战显示训练家的名字
      if (M.team > 1) for (const s of pvpSeats) this.view.names.set(s.id, shinyName(LINES[s.line]?.forms.find((f) => f.dex === s.dex)?.name ?? s.name, s.shiny));
      this.view.setPvp(pvpSeats, M.revive);
      this.hud = new Hud(this.ui, () => this.pauseOrMenu(), 'menu');
      this.hud.setPvp(mode, pvpSeats, this.you);
      this.hud.enableAuto(() => this.toggleAuto(), M.team > 1
        ? '交给 AI 操作你的队长（另外两只一直由 AI 操作），可以随时切回手动。对战比的是构筑和阵容，网络不好时也可以放心交给 AI。'
        : '交给 AI 操作你的宝可梦，可以随时切回手动。');
      this.battleIntro(mode, pvpSeats);
    } else {
      this.lastBiome = -1;
      this.hud = new Hud(this.ui, () => this.pauseOrMenu(), this.solo ? 'pause' : 'menu');
      this.inter = new Intermission(this.ui, (c) => this.send(c), { kind: this.solo ? 'pause' : 'menu', open: () => this.pauseOrMenu() });
      if (autoAssistUnlocked(this.profile)) {
        this.hud.enableAuto(() => this.toggleAuto(), 'AI 替你走位、躲开攻击、捡糖果和救队友；技能照常自动释放，商店和升级仍由你来选。');
        if (this.profile.autoAssist) this.setAutoLocal(true);
      }
    }
    this.hud.setTrainer(mine?.trainer ?? this.profile.trainer, mine?.name ?? this.name());
    setInputEnabled(true);
    playMusic('battle');
    this.presence();
  }

  /** 野生宝可梦崇拜了你：立刻解锁并保存（中途离开也不会丢） */
  private onRecruit(pid: number, dex: number, line: string, shiny: boolean, players: { id: number; name: string }[]) {
    const name = shinyName(LINES[line]?.name ?? '', shiny);
    if (pid !== this.you) {
      this.hud?.message(`${players.find((p) => p.id === pid)?.name ?? '队友'} 结交了新伙伴：${name}`);
      return;
    }
    const isNew = addOwned(this.profile, line, true, shiny);
    sfx(shiny ? 'shiny' : 'achieve');
    const form = shinyName(formOf(line, LINES[line].forms.findIndex((f) => f.dex === dex)).name, shiny);
    this.hud?.announce(`野生的${form}崇拜了你！`, isNew ? `${name}成为了你的伙伴！回到真新镇可以让它跟着你` : '');
  }

  /** 对战开场：两边的训练家和宝可梦（道馆对战显示道馆训练家 / 馆主的立绘） */
  private battleIntro(mode: PvpMode, seats: PvpSeatInfo[]) {
    const me = seats.find((s) => s.id === this.you);
    if (!me) return;
    const allies = seats.filter((s) => s.team === me.team), foes = seats.filter((s) => s.team !== me.team);
    const gym = this.pvpMatch?.gym ? GYM_BY_ID[this.pvpMatch.gym.id] : null;
    const mons = (list: PvpSeatInfo[]) => list.map((s) => ({ dex: s.dex, shiny: !!s.shiny }));
    const left: VsSide = { name: this.name(), sub: TRAINERS[this.profile.trainer]?.title, art: this.profile.trainer, mons: mons(allies) };
    let right: VsSide, title: string;
    if (gym && this.pvpMatch?.gym) {
      const T = gym[this.pvpMatch.gym.stage];
      right = { name: T.name, sub: T.title, art: T.art, mons: mons(foes) };
      title = `${gym.name} · ${this.pvpMatch.gym.stage === 'leader' ? '馆主战' : '道馆训练家'}`;
    } else {
      const names = [...new Set(foes.map((s) => s.name))];
      right = { name: names.length > 1 ? `${names[0]} 等 ${names.length} 人` : names[0] ?? '对手', sub: foes[0]?.bot ? 'AI 训练家' : '训练家', art: foes[0]?.trainer ?? 'gary', mons: mons(foes) };
      title = `${PVP_MODES[mode].name}${this.pvpMatch?.practice ? ' · 练习赛' : ' · 排位赛'}`;
    }
    void vsSplash(left, right, title);
  }

  /** 切换自动战斗（对战随时可用；冒险要先通关一次） */
  private toggleAuto() {
    if (this.where !== 'game' || !this.hud) return;
    if (!this.pvpMatch && !autoAssistUnlocked(this.profile)) {
      toast('首次通关后解锁 AI 辅助战斗', 'info');
      return;
    }
    const on = !this.autoOn;
    this.setAutoLocal(on);
    sfx('click');
    if (!this.pvpMatch) { this.profile.autoAssist = on; saveProfile(this.profile); }
    this.hud.message(on ? 'AI 自动战斗：开（按 T 切回手动）' : '切换为手动操作');
  }

  private autoAt = 0;
  private setAutoLocal(on: boolean) {
    this.autoOn = on;
    this.autoAt = performance.now();
    this.hud?.setAuto(on);
    this.send({ t: 'auto', on });
  }

  private onPublic(s: PublicState) {
    this.pub = s;
    if (this.view) { this.view.pub = s; this.view.biome = s.biome; }
    // 刚切换时服务器的状态可能还没跟上，过一会儿再以服务器为准
    const bot = !!s.players.find((p) => p.id === this.you)?.bot;
    if (bot !== this.autoOn && performance.now() - this.autoAt > 1000) { this.autoOn = bot; this.hud?.setAuto(bot); }
    this.hud?.update(this.me, s, this.you);
    if (!this.inter) return;
    if (s.phase === 'inter' && !this.inter.visible) {
      this.inter.show(true);
      setInputEnabled(false);
      if (this.me) this.inter.update(this.me, s, this.you);
      playMusic('shop');
      sfx('clear');
      // 第一次进商店：介绍升级、刷新与撤销、出发
      window.setTimeout(() => { if (this.inter?.visible) tour(this.profile, 'shop', TOURS.shop); }, 450);
    } else if (s.phase === 'wave' && this.inter.visible) {
      this.inter.show(false);
      setInputEnabled(true);
      playMusic('battle');
    } else if (s.phase === 'inter') this.inter.updatePub(s);
  }

  private onMe(s: MeState) {
    this.me = s;
    this.hud?.setCooldowns(s.skills);
    if (this.view) this.view.me = s;
    this.hud?.update(s, this.pub, this.you);
    if (this.pub?.phase === 'inter' && this.inter?.visible) this.inter.update(s, this.pub, this.you);
  }

  private setPause(on: boolean) {
    this.send({ t: 'pause', on });
  }

  /** 单人暂停菜单的「放弃本局」：波次中和升级、商店阶段都走这里 */
  private abandonRun() {
    this.close();
    this.backToTown();
  }

  private renderPause() {
    if (this.paused) {
      setInputEnabled(false);
      this.screen.classList.remove('hidden');
      pauseScreen(this.screen, {
        resume: () => this.setPause(false),
        settings: () => this.openSettings(() => this.renderPause()),
        quit: { label: '放弃本局，回到真新镇', confirm: '再点一次确认放弃', run: () => this.abandonRun() },
      });
    } else {
      clear(this.screen);
      this.screen.classList.add('hidden');
      if (!this.inter?.visible) setInputEnabled(true);
    }
  }

  /** 一局冒险结束：画面中央先显示「恭喜通关」或「全员倒下了」，再淡出到结算 */
  private async endGame(victory: boolean, summary: import('../shared/meta').RunSummary | null, board: BoardEntry[]) {
    if (this.ending) return;
    this.ending = true;
    const reward = summary ? applyRun(this.profile, summary) : null;
    this.reportProgress();
    setInputEnabled(false);
    sfx(victory ? 'clear' : 'down');
    const waves = summary?.wavesCleared ?? this.pub?.wave ?? 0;
    await bigBanner(victory ? '恭喜通关！' : '全员倒下了……', victory ? '你们是真正的宝可梦大师！' : `坚持到了第 ${waves + 1} 波`, victory ? 'win' : 'lose');
    void transition('fade', () => {
      this.ending = false;
      // 新成就直接在结算界面里列出，不再弹提示挡住统计
      if (reward?.newAchievements.length) sfx('achieve');
      this.leaveGame();
      this.where = 'results';
      this.backdrop();
      this.screen.classList.remove('hidden');
      playMusic('shop');
      const mon = partnerOf(this.profile), diff = this.pendingDifficulty;
      const gone = this.roomGone;
      this.roomGone = false;
      resultsScreen(this.screen, victory, summary, reward, board, this.you, () => {
        if (this.solo) void transition('battle', () => { this.close(); this.startSolo(mon, diff); }, { hold: 300 });
        else if (gone) this.backToTown();
        else this.showLobby();
      }, this.solo ? '再来一局' : gone ? '回到真新镇' : '返回房间', this.profile, gone ? undefined : () => { this.close(); this.backToTown(); });
      // 第一次结算：提醒把宝可梦放进背包（之后可以挑战道馆、对战）
      if (summary?.build) window.setTimeout(() => tour(this.profile, 'results', TOURS.results), 500);
    });
  }

  private leaveGame() {
    hideTip();
    window.clearInterval(this.pingTimer);
    this.view?.destroy();
    this.view = null;
    this.hud?.destroy();
    this.hud = null;
    this.inter?.destroy();
    this.inter = null;
    this.me = null;
    this.pub = null;
    this.paused = false;
    this.menuAuto = null;
    setInputEnabled(false);
    if (this.where === 'game') this.where = 'results';
  }
}

/** 标题界面的背景：在 1 号道路上闲逛的宝可梦。 */
class MenuScene {
  private raf = 0;
  private mons: { a: Animator; x: number; y: number; tx: number; ty: number; wait: number }[] = [];
  private last = 0;
  private running = false;
  constructor(private canvas: HTMLCanvasElement, private settings: () => Settings) {
    const dex = [4, 7, 1, 25, 10, 13, 16, 19, 133, 43, 39, 52];
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
    const st = this.settings();
    if (now - this.last < 1000 / (st.fps || 60) - 1.5) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas;
    const dpr = renderDpr(st);
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
