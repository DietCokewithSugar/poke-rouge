import { ENEMIES, ENEMY_IDS } from '../../shared/enemies';
import { decodeSnapshot, type PvpSeatInfo, type SnapEnemy, type SnapPlayer, type SnapProj, type SnapZone, type Snapshot } from '../../shared/protocol';
import { FX_KINDS, SKILLS } from '../../shared/skills';
import { REVIVE_RADIUS, type Ev, type MeState, type PublicState } from '../../shared/sim/game';
import { sfx } from '../audio';
import { BOOSTS, PICKUP_KINDS, boostOfSeed, type BoostId } from '../../shared/pickups';
import { FxLayer, drawPickup, drawProj, drawZone, pxCircle, pxRing, twinkle } from '../gfx/fx';
import { artGlow, hasArt } from '../gfx/pickups';
import { vis, type Trail } from '../gfx/vfx';
import { shownAmount } from '../../shared/stats';
import { TYPES } from '../../shared/types';
import { Animator, dirRow, preload, shadowSize } from '../gfx/sprites';
import { LINE_OF_DEX, formOf } from '../../shared/pokemon';
import { TERRAINS, inCircle, inTerrain, terrainFromEvent, terrainMove, typeMask, type Terrain, type TerrainId } from '../../shared/terrain';
import { BORDER, arenaCanvas } from '../gfx/tiles';
import { drawTerrain } from '../gfx/terrain';
import { moveVector } from '../input';
import type { Settings } from '../save';

/**
 * 插值缓冲：画面比服务器晚这么多毫秒显示，用来平滑网络抖动。
 * 按最近几秒快照到达的延迟波动自动调整：网络稳定时更跟手，抖动大时宁可稍晚也不卡顿跳跃。
 */
const INTERP_MIN = 90;
const INTERP_MAX = 320;

/** 画布的像素密度：流畅模式按 1 倍渲染（高分屏上像素减少到 1/4），像素画由 CSS 无模糊放大 */
export function renderDpr(s: Settings) {
  return s.quality === 'smooth' ? 1 : Math.min(2, window.devicePixelRatio || 1);
}
const FX_PATTERN = new Map<string, string>();
for (const s of Object.values(SKILLS)) if (!FX_PATTERN.has(s.fx)) FX_PATTERN.set(s.fx, s.pattern);
const SEND_EVERY = 1000 / 20;

interface TimedSnap { t: number; s: Snapshot; players: Map<number, SnapPlayer>; enemies: Map<number, SnapEnemy>; projs: Map<number, SnapProj> }
interface EnemyVis { anim: Animator; flash: number; lx: number; ly: number; dir: number; scale: number; seen: number; tw: number }
/** burn：灼伤掉血时身上闪一下红 */
interface PlayerVis { anim: Animator; flash: number; down: boolean; evoFlash: number; tw: number; burn: number }

/** HUD 用：自己和本波局部属性场地的关系 */
export interface TerrainInfo {
  kind: TerrainId;
  /** 站在场地里 / 站在共鸣晶石的能量圈里 */
  inside: boolean;
  circle: boolean;
  burn: boolean;
  /** 被场地减速 / 被寒霜区域里的攻击减速 */
  slowed: boolean;
  chill: boolean;
  /** 场地刚出现（波次开始的几秒） */
  intro: boolean;
}
interface Corpse { anim: Animator; x: number; y: number; t: number; scale: number }
interface Flyer { x: number; y: number; kind: number; value: number; pid: number; t: number }

export interface ViewHooks {
  onMessage(text: string): void;
  /** 首领出现了（shinyDex：闪光首领的图鉴编号） */
  onBoss(name: string, shinyDex?: number): void;
  onWave(n: number): void;
  onEvolve(pid: number, text: string): void;
  /** 野生宝可梦崇拜了某位玩家（shiny：闪光宝可梦） */
  onRecruit(pid: number, dex: number, line: string, shiny: boolean): void;
  /** 闪光宝可梦出现了 */
  onShiny(dex: number): void;
}

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  w: number; h: number;
  you: number;
  names = new Map<number, string>();
  me: MeState | null = null;
  pub: PublicState | null = null;
  biome = 0;
  private snaps: TimedSnap[] = [];
  private clockOffset: number | null = null;
  /** 当前的插值延迟（毫秒）与最近快照的迟到量 */
  interpMs = 110;
  private late: number[] = [];
  /** 画面尺寸变化时告诉服务器（服务器只发视野附近的数据） */
  onView: (w: number, h: number) => void = () => {};
  /** 收到的最新快照编号：随位置一起发回服务器，没有位置要发时单独确认 */
  lastTick = -1;
  sendAck: (k: number) => void = () => {};
  private lastAck = 0;
  private enemyVis = new Map<number, EnemyVis>();
  /** 场上的闪光宝可梦：敌人 id → 种类（种类对不上说明编号已经给了别的敌人）与出现时间 */
  private shinyEnemies = new Map<number, { kind: number; at: number }>();
  private playerVis = new Map<number, PlayerVis>();
  private corpses: Corpse[] = [];
  private pickups = new Map<number, { kind: number; x: number; y: number; value: number }>();
  private flyers: Flyer[] = [];
  private fx = new FxLayer();
  private local = { x: 0, y: 0, dir: Math.PI / 2, moving: false, synced: false };
  private lastSend = 0;
  private lastFrame = performance.now();
  private raf = 0;
  private scale = 3;
  private viewW = 480;
  private viewH = 270;
  private cam = { x: 0, y: 0 };
  private time = 0;
  private hurtFlash = 0;
  private superEffAt = 0;
  private trailT = new Map<number, number>();
  /** 每位玩家最近一次踩到种子的时间和第几行提示：连着踩到时往上错开，不叠在一起 */
  private boostTxt = new Map<number, { at: number; row: number }>();
  private lastSnapPhase = 0;
  private ringR = 0;
  /** 本波的局部属性场地（出现时淡入）；oldTerrain 是刚换掉的那块（淡出） */
  terrain: Terrain | null = null;
  private terrainAt = 0;
  private oldTerrain: { t: Terrain; at: number } | null = null;
  settings: Settings;
  hooks: ViewHooks;
  send: (x: number, y: number, moving: boolean, dir: number) => void = () => {};
  canMove = () => true;
  /** 自己是不是已经有这条进化线：没有的野生宝可梦头上画一颗爱心 */
  isOwned: (line: string) => boolean = () => true;
  /** 自己是不是已经有这只闪光宝可梦：没有的闪光宝可梦头上画一颗星 */
  isShinyOwned: (line: string) => boolean = () => true;
  /** 对战：每位玩家的队伍；revive 为倒下后能不能被救起（单挑倒下就退场） */
  private pvp: { teams: Map<number, number>; myTeam: number; revive: boolean } | null = null;
  /** 自己的宝可梦由服务器上的 AI 操作：画面跟随服务器位置，不再上报 */
  private auto = false;

  setPvp(seats: PvpSeatInfo[], revive: boolean) {
    this.pvp = { teams: new Map(seats.map((s) => [s.id, s.team])), myTeam: seats.find((s) => s.id === this.you)?.team ?? 0, revive };
  }

  private isFoe(id: number) { return !!this.pvp && this.pvp.teams.get(id) !== this.pvp.myTeam; }

  constructor(canvas: HTMLCanvasElement, w: number, h: number, you: number, settings: Settings, hooks: ViewHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.w = w;
    this.h = h;
    this.you = you;
    this.settings = settings;
    this.hooks = hooks;
    this.local.x = w / 2;
    this.local.y = h / 2;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }

  resize = () => {
    const dpr = renderDpr(this.settings);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.scale = Math.max(1, Math.round(Math.min(ch / 330, cw / 560)));
    this.viewW = Math.ceil(cw / this.scale);
    this.viewH = Math.ceil(ch / this.scale);
    this.onView?.(this.viewW, this.viewH);
  };

  // ------------------------------------------------------------ 网络输入

  onSnapshot(buf: ArrayBuffer) {
    const s = decodeSnapshot(buf);
    this.lastTick = Math.max(this.lastTick, s.tick);
    const now = performance.now();
    const serverMs = (s.tick * 1000) / 30;
    const off = now - serverMs;
    // 取较小的偏移（到达最早的那次），抖动时缓慢回调
    this.clockOffset = this.clockOffset === null ? off : Math.min(off, this.clockOffset + 0.5);
    // 这一帧比「最快到达」晚了多少：取最近 3 秒里较高的分位数作为抖动
    this.late.push(off - this.clockOffset);
    if (this.late.length > 45) this.late.shift();
    const sorted = this.late.slice().sort((a, b) => a - b);
    const jitter = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    const target = Math.max(INTERP_MIN, Math.min(INTERP_MAX, 70 + jitter + 15));
    this.interpMs += (target - this.interpMs) * (target > this.interpMs ? 0.25 : 0.03);
    const ts: TimedSnap = {
      t: serverMs, s,
      players: new Map(s.players.map((p) => [p.id, p])),
      enemies: new Map(s.enemies.map((e) => [e.id, e])),
      projs: new Map(s.projs.map((p) => [p.id, p])),
    };
    this.snaps.push(ts);
    // 联机时视野外的敌人不再出现在快照里，清掉很久没见到的
    if (s.tick % 30 === 0) for (const [id, v] of this.enemyVis) if (this.time - v.seen > 2) this.enemyVis.delete(id);
    // 闪光宝可梦总在快照里：不在了就是被打倒了（视野外的倒下事件不会发过来）
    for (const [id, sh] of this.shinyEnemies) if (!ts.enemies.has(id) && this.time - sh.at > 1) this.shinyEnemies.delete(id);
    if (this.snaps.length > 12) this.snaps.shift();
    const mine = ts.players.get(this.you);
    if (mine && !(mine.flags & 64)) {
      const d = Math.hypot(mine.x - this.local.x, mine.y - this.local.y);
      if (!this.local.synced || d > 140 || (mine.flags & 1) || s.phase !== 0) {
        this.local.x = mine.x;
        this.local.y = mine.y;
        this.local.synced = true;
      } else if (d > (this.local.moving ? 70 : 24)) {
        this.local.x += (mine.x - this.local.x) * 0.2;
        this.local.y += (mine.y - this.local.y) * 0.2;
      }
    }
    if (s.phase !== this.lastSnapPhase) {
      this.lastSnapPhase = s.phase;
      if (s.phase === 1) { this.corpses = []; }
    }
  }

  onEvents(evs: Ev[]) {
    for (const ev of evs) this.event(ev);
  }

  private event(ev: Ev) {
    const k = ev[0] as string;
    const n = (i: number) => ev[i] as number;
    switch (k) {
      case 'h': {
        const id = n(1), x = n(2), y = n(3), dmg = n(4), f = n(5);
        const v = this.enemyVis.get(id);
        // 受击闪白要有间隔，否则持续挨打的首领会一直是白色剪影
        if (v && v.flash < -0.14) v.flash = 0.08;
        if (f & 8) { this.fx.text(x, y - 18, shownAmount(dmg), TYPES[n(6)] === 'fire' ? '#ffa060' : '#d890f0', 10, 0.6); break; }
        const crit = !!(f & 1);
        this.fx.hit(x, y - 8 * (v?.scale ?? 1), TYPES[n(6)] ?? 'normal', crit);
        const col = crit ? '#ffd23f' : f & 2 ? '#ff8c5a' : f & 4 ? '#a0a8b8' : '#ffffff';
        const dmgText = shownAmount(dmg);
        this.fx.text(x, y - 20, crit ? `${dmgText}!` : dmgText, col, crit ? 13 : 11, 0.7);
        if (f & 2 && this.time - this.superEffAt > 2.5) {
          this.superEffAt = this.time;
          this.fx.text(x, y - 34, '效果拔群！', '#ff8c5a', 10, 0.9);
        }
        sfx(crit ? 'crit' : 'hit');
        break;
      }
      case 'ph': {
        const pid = n(1), dmg = n(2), f = n(3);
        const hf = (ev[4] as number | undefined) ?? 0, by = (ev[5] as number | undefined) ?? -1;
        const pos = this.playerPos(pid);
        if (!pos) break;
        if (f & 4) {
          // 灼伤：小小的橙色数字、冒火星、身上闪一下红；不震屏，也不播受伤音效
          this.fx.text(pos.x + (Math.random() - 0.5) * 8, pos.y - 24, `-${shownAmount(dmg)}`, '#ffa060', 9, 0.55);
          this.fx.burst(pos.x, pos.y - 8, ['#ff6a1f', '#ffb22e'], 4, 30);
          const v = this.playerVis.get(pid);
          if (v) v.burn = 0.22;
          if (pid === this.you) this.hurtFlash = Math.max(this.hurtFlash, 0.12);
        } else if (f & 1) this.fx.text(pos.x, pos.y - 26, '闪避', '#9fe8ff', 10);
        else if (f & 2) this.fx.text(pos.x, pos.y - 26, '护盾', '#9fd0ff', 10);
        else if (this.isFoe(pid)) {
          // 对战中打到对手：和打野生宝可梦一样显示伤害数字
          const v = this.playerVis.get(pid);
          if (v && v.flash <= 0) v.flash = 0.1;
          const dmgText = shownAmount(dmg);
          if (hf & 16) { this.fx.text(pos.x, pos.y - 26, `-${dmgText}`, '#d070ff', 10, 0.6); break; }
          if (hf & 8) { this.fx.text(pos.x, pos.y - 22, dmgText, '#d890f0', 10, 0.6); break; }
          const crit = !!(hf & 1);
          this.fx.hit(pos.x, pos.y - 8, 'normal', crit);
          const col = crit ? '#ffd23f' : hf & 2 ? '#ff8c5a' : hf & 4 ? '#a0a8b8' : '#ffffff';
          this.fx.text(pos.x, pos.y - 24, crit ? `${dmgText}!` : dmgText, col, crit ? 13 : 11, 0.7);
          if (hf & 2 && by === this.you && this.time - this.superEffAt > 2.5) {
            this.superEffAt = this.time;
            this.fx.text(pos.x, pos.y - 38, '效果拔群！', '#ff8c5a', 10, 0.9);
          }
          if (by === this.you) sfx(crit ? 'crit' : 'hit');
        } else {
          this.fx.text(pos.x, pos.y - 26, `-${shownAmount(dmg)}`, hf & 16 ? '#d070ff' : '#ff5f6d', 12);
          const v = this.playerVis.get(pid);
          if (v) { v.flash = 0.25; v.anim.play('Hurt'); }
          if (pid === this.you) {
            this.hurtFlash = 0.35;
            if (this.settings.shake) this.fx.shake = Math.max(this.fx.shake, 3);
            sfx('hurt');
          }
        }
        break;
      }
      case 'heal': {
        const pos = this.playerPos(n(1));
        if (pos) this.fx.text(pos.x, pos.y - 26, `+${shownAmount(n(2))}`, '#78f878', 11);
        if (n(1) === this.you) sfx('heal');
        break;
      }
      case 'die': {
        const id = n(1), x = n(2), y = n(3), kind = n(4);
        const v = this.enemyVis.get(id);
        const def = ENEMIES[ENEMY_IDS[kind]];
        const shiny = this.isShiny(id, kind);
        if (def && (this.corpses.length < 60 || shiny)) {
          const anim = new Animator(def.dex, shiny);
          anim.dir = v?.anim.dir ?? 0;
          anim.play('Faint', true, 1.6);
          this.corpses.push({ anim, x, y, t: 0, scale: v?.scale ?? 1 });
        }
        this.enemyVis.delete(id);
        this.fx.death(x, y);
        if (shiny) { this.shinyEnemies.delete(id); this.fx.shinyBurst(x, y, 12 * (v?.scale ?? 1)); }
        sfx('kill');
        break;
      }
      case 'shiny': {
        const id = n(1), kind = n(2);
        const def = ENEMIES[ENEMY_IDS[kind]];
        if (!def) break;
        this.shinyEnemies.set(id, { kind, at: this.time });
        void preload([def.dex], true);
        this.fx.shinyBurst(n(3), n(4), 14 * (def.scale ?? 1));
        sfx('shiny');
        this.hooks.onShiny(def.dex);
        break;
      }
      case 'fx': this.skillFx(ev); break;
      case 'chain': this.fx.lightning(ev[2] as number[], vis(ev[1] as string).pal); sfx('crit'); break;
      case 'mark': this.fx.mark(n(1), n(2)); break;
      case 'warn': this.fx.warn(n(1), n(2), n(3), n(4), n(5) / 1000, n(6), n(7)); break;
      case 'boom': {
        const r = n(3);
        this.fx.boom(ev[4] as string, n(1), n(2), r);
        if (r >= 30) {
          sfx('boom');
          if (this.settings.shake) this.fx.shake = Math.max(this.fx.shake, r > 50 ? 5 : 3);
        }
        break;
      }
      case 'drop':
        this.pickups.set(n(1), { kind: n(2), x: n(3), y: n(4), value: n(5) });
        if (hasArt(n(2))) this.fx.twinkle(n(3), n(4) - 8, 0.6);
        break;
      case 'pick': {
        const pk = this.pickups.get(n(1));
        if (pk) {
          this.flyers.push({ x: pk.x, y: pk.y, kind: pk.kind, value: pk.value, pid: n(2), t: 0 });
          this.pickups.delete(n(1));
          const boost = boostOfSeed(PICKUP_KINDS[pk.kind]);
          this.pickedItem(pk.kind, boost, n(2));
          if (n(2) === this.you) sfx(pk.kind === 2 ? 'ball' : boost ? 'boost' : 'pickup');
        }
        break;
      }
      case 'clrp':
        // 糖果和道具球飞向最近的玩家；橙橙果和种子留到下一波也没用，原地消失
        for (const [, pk] of this.pickups) {
          if (hasArt(pk.kind)) this.fx.burst(pk.x, pk.y - 5, [artGlow(pk.kind), '#ffffff'], 6, 35);
          else this.flyers.push({ ...pk, pid: this.nearestPid(pk.x, pk.y), t: 0 });
        }
        this.pickups.clear();
        break;
      case 'lvl':
        {
          const pos = this.playerPos(n(1));
          if (pos) this.fx.levelUp(pos.x, pos.y);
          if (n(1) === this.you) {
            if (pos) this.fx.text(pos.x, pos.y - 34, 'Lv UP!', '#ffd23f', 12, 1);
            sfx('level');
          }
        }
        break;
      case 'evo': {
        const v = this.playerVis.get(n(1));
        if (v) v.evoFlash = 1.4;
        const pos = this.playerPos(n(1));
        if (pos) this.fx.evolve(pos.x, pos.y);
        this.hooks.onEvolve(n(1), ev[3] as string);
        sfx('evolve');
        break;
      }
      case 'down': sfx('down'); break;
      case 'ko': {
        const k = n(1), v = n(2);
        const name = (id: number) => this.names.get(id) ?? '训练家';
        this.hooks.onMessage(k >= 0 ? `${name(k)} 击倒了 ${name(v)}！` : `${name(v)} 被缩小的场地吞没了`);
        if (k === this.you) {
          const pos = this.playerPos(this.you);
          if (pos) this.fx.text(pos.x, pos.y - 38, '击倒！', '#ffd23f', 14, 1.2);
          sfx('kill');
        }
        break;
      }
      case 'evoReady':
        if (n(1) === this.you) {
          const pos = this.playerPos(this.you);
          if (pos) this.fx.text(pos.x, pos.y - 36, '咦？', '#ffffff', 13, 1.4);
          this.hooks.onMessage(`${ev[2] as string}的样子有些不对劲……这一波结束后可以选择进化`);
        }
        break;
      case 'evoCancel': break;
      case 'rev': {
        sfx('revive');
        const pos = this.playerPos(n(1));
        if (pos) this.fx.burst(pos.x, pos.y - 8, '#f8f080', 12, 60);
        break;
      }
      case 'cast': {
        const v = this.playerVis.get(n(1));
        if (v && !v.anim.busy()) v.anim.play(n(2) === 0 ? 'Attack' : 'Shoot', false, 1.8);
        break;
      }
      case 'txt': this.fx.text(n(1), n(2), ev[3] as string, ev[4] as string, 11, 1.1); break;
      case 'msg': this.hooks.onMessage(ev[1] as string); break;
      case 'wild': void preload(ev[1] as number[]); break;
      case 'recruit': {
        const x = n(4), y = n(5), shiny = ev[6] === 1;
        for (let i = 0; i < 8; i++) this.fx.sp('heart', 'fairy', x + (Math.random() - 0.5) * 18, y - 8 - Math.random() * 10, { vy: -30 - Math.random() * 20, life: 0.9 + Math.random() * 0.4 });
        if (shiny) this.fx.shinyBurst(x, y, 18);
        this.fx.text(x, y - 30, n(1) === this.you ? '崇拜了你！' : '崇拜了队友！', shiny ? '#fff3a8' : '#ff8ad8', 13, 1.6);
        this.hooks.onRecruit(n(1), n(2), ev[3] as string, shiny);
        break;
      }
      case 'boss': {
        const sh = this.shinyEnemies.get(n(1));
        this.hooks.onBoss(ev[2] as string, sh ? ENEMIES[ENEMY_IDS[sh.kind]]?.dex : undefined);
        sfx('boss');
        break;
      }
      case 'terrain': {
        const t = terrainFromEvent(ev);
        const cur = this.terrain;
        // 重新连上时服务器会再发一次同一块场地：不重新淡入
        if (t && cur && t.kind === cur.kind && t.cx === cur.cx && t.cy === cur.cy && t.count === cur.count) break;
        if (cur) this.oldTerrain = { t: cur, at: this.time };
        this.terrain = t;
        this.terrainAt = this.time;
        break;
      }
      case 'wave':
        this.biome = n(3);
        this.local.synced = false;
        this.pickups.clear();
        this.corpses = [];
        this.shinyEnemies.clear();
        this.hooks.onWave(n(1));
        sfx('wave');
        break;
    }
  }

  private skillFx(ev: Ev) {
    const fx = ev[1] as string, x = ev[2] as number, y = ev[3] as number, ang = ev[4] as number;
    const a = ev[5] as number, b = ev[6] as number, owner = ev[7] as number;
    if (fx.endsWith('_pre')) { this.fx.pre(fx, x, y, a, b / 1000); return; }
    if (fx.endsWith('_charge')) { this.fx.charge(fx, x, y, ang, a, b, (ev[8] as number) / 1000); return; }
    void owner;
    this.fx.skill(FX_PATTERN.get(fx), fx, x, y, ang, a, b);
    if (!this.settings.shake) this.fx.shake = 0;
  }

  /** 踩到种子：头顶飘字说明效果；橙橙果只冒一点光（回复的绿色数字由 'heal' 事件显示） */
  private pickedItem(kind: number, boost: BoostId | null, pid: number) {
    if (!hasArt(kind)) return;
    const pos = this.playerPos(pid);
    if (!pos) return;
    if (boost) {
      const B = BOOSTS[boost];
      const now = performance.now(), last = this.boostTxt.get(pid);
      const row = last && now - last.at < 900 ? (last.row + 1) % 3 : 0;
      this.boostTxt.set(pid, { at: now, row });
      this.fx.text(pos.x, pos.y - 38 - row * 14, B.text, B.color, 12, 1.3);
      this.fx.burst(pos.x, pos.y - 8, [B.color, '#ffffff'], 14, 70);
      this.fx.ring(pos.x, pos.y, 4, 18, B.color, 0.4, 1, 0.5);
    } else {
      this.fx.burst(pos.x, pos.y - 8, ['#78f878', artGlow(kind)], 10, 50);
    }
  }

  private isShiny(id: number, kind: number) {
    return this.shinyEnemies.get(id)?.kind === kind;
  }

  private nearestPid(x: number, y: number) {
    let best = this.you, bd = Infinity;
    const s = this.snaps[this.snaps.length - 1];
    if (!s) return best;
    for (const p of s.s.players) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  private playerPos(pid: number): { x: number; y: number } | null {
    if (pid === this.you) return { x: this.local.x, y: this.local.y };
    const s = this.snaps[this.snaps.length - 1];
    const p = s?.players.get(pid);
    return p ? { x: p.x, y: p.y } : null;
  }

  /** 自己宝可梦的属性位（场地的减速、灼伤看单位自身的属性） */
  private myMask() {
    const m = this.me;
    return m ? typeMask(formOf(m.line, m.stage).types) : 0;
  }

  terrainInfo(): TerrainInfo | null {
    const T = this.terrain;
    if (!T || this.pvp) return null;
    const mine = this.snaps[this.snaps.length - 1]?.players.get(this.you);
    const { x, y } = this.local;
    const inside = inTerrain(T, x, y);
    const tst = mine?.tst ?? 0;
    return {
      kind: T.kind, inside, circle: inside && inCircle(T, x, y),
      burn: (tst & 1) !== 0, slowed: inside && terrainMove(T, x, y, this.myMask()) < 1, chill: (tst & 2) !== 0,
      intro: this.time - this.terrainAt < 5,
    };
  }

  // ------------------------------------------------------------ 主循环

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // 帧率上限：跳过多余的刷新（120 帧需要显示器本身支持）
    const minDt = 1000 / (this.settings.fps || 60);
    if (now - this.lastFrame < minDt - 1.5) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.updateLocal(dt, now);
    this.fx.update(dt);
    this.render(now, dt);
  };

  private updateLocal(dt: number, now: number) {
    const last = this.snaps[this.snaps.length - 1];
    const mine = last?.players.get(this.you);
    const inWave = last?.s.phase === 0;
    const down = !!mine && (mine.flags & 1) !== 0;
    const auto = !!mine && (mine.flags & 64) !== 0;
    if (auto !== this.auto) {
      this.auto = auto;
      // 切回手动：从服务器的最新位置接着走
      if (!auto) this.local.synced = false;
    }
    if (auto) {
      const ip = this.interp();
      const pb = ip?.b.players.get(this.you);
      if (ip && pb) {
        const pa = ip.a.players.get(this.you);
        this.local.x = pa ? pa.x + (pb.x - pa.x) * ip.f : pb.x;
        this.local.y = pa ? pa.y + (pb.y - pa.y) * ip.f : pb.y;
        this.local.dir = pb.dir;
        this.local.moving = (pb.flags & 8) !== 0;
        this.local.synced = true;
      }
      if (this.lastTick >= 0 && now - this.lastAck >= 100) {
        this.lastAck = now;
        this.sendAck(this.lastTick);
      }
      return;
    }
    const mv = inWave && !down && this.canMove() ? moveVector() : { x: 0, y: 0 };
    // 私有状态里的速度不含场地减速：按自己现在的位置在本地乘上（服务器按同样的规则限制移动距离）
    const speed = (this.me?.speed ?? 100) * terrainMove(this.terrain, this.local.x, this.local.y, this.myMask());
    this.local.moving = !!(mv.x || mv.y);
    if (this.local.moving) {
      this.local.x = Math.max(8, Math.min(this.w - 8, this.local.x + mv.x * speed * dt));
      this.local.y = Math.max(14, Math.min(this.h - 6, this.local.y + mv.y * speed * dt));
      this.local.dir = Math.atan2(mv.y, mv.x);
    }
    if (inWave && !down && this.local.synced && now - this.lastSend >= SEND_EVERY) {
      this.lastSend = now;
      this.lastAck = now;
      this.send(this.local.x, this.local.y, this.local.moving, this.local.dir);
    } else if (this.lastTick >= 0 && now - this.lastAck >= 100 && now - this.lastSend >= 100) {
      this.lastAck = now;
      this.sendAck(this.lastTick);
    }
  }

  private interp(): { a: TimedSnap; b: TimedSnap; f: number } | null {
    const n = this.snaps.length;
    if (!n || this.clockOffset === null) return null;
    const rt = performance.now() - this.clockOffset - this.interpMs;
    for (let i = n - 1; i > 0; i--) {
      const a = this.snaps[i - 1], b = this.snaps[i];
      if (a.t <= rt) {
        const f = b.t > a.t ? Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t))) : 1;
        return { a, b, f };
      }
    }
    return { a: this.snaps[0], b: this.snaps[0], f: 0 };
  }

  private render(now: number, dt: number) {
    const ctx = this.ctx;
    const S = this.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 镜头
    const tx = this.local.x - this.viewW / 2, ty = this.local.y - this.viewH / 2;
    const clampAxis = (v: number, view: number, world: number) => {
      const min = -BORDER + 8, max = world + BORDER - 8 - view;
      return max < min ? (world - view) / 2 : Math.max(min, Math.min(max, v));
    };
    this.cam.x += (clampAxis(tx, this.viewW, this.w) - this.cam.x) * Math.min(1, dt * 12);
    this.cam.y += (clampAxis(ty, this.viewH, this.h) - this.cam.y) * Math.min(1, dt * 12);
    let cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    if (this.fx.shake > 0) {
      cx += Math.round((Math.random() - 0.5) * this.fx.shake);
      cy += Math.round((Math.random() - 0.5) * this.fx.shake);
    }
    ctx.setTransform(S, 0, 0, S, -cx * S, -cy * S);

    ctx.drawImage(arenaCanvas(this.biome, this.w, this.h), -BORDER, -BORDER);

    const ip = this.interp();
    const t = this.time;

    // 局部属性场地（地面最底层：区域、警示圈、敌人和弹幕都画在它上面）
    const area = { x: cx, y: cy, w: this.viewW, h: this.viewH };
    if (this.oldTerrain) {
      const k = 1 - (t - this.oldTerrain.at) / 0.6;
      if (k <= 0) this.oldTerrain = null;
      else drawTerrain(ctx, this.oldTerrain.t, t, k, area);
    }
    if (this.terrain) drawTerrain(ctx, this.terrain, t, Math.min(1, (t - this.terrainAt) / 0.6), area);

    // 区域
    if (ip) {
      for (const z of ip.b.s.zones as SnapZone[]) drawZone(ctx, FX_KINDS[z.fx], z.x, z.y, z.r, z.life, t);
    }
    // 掉落物
    for (const pk of this.pickups.values()) drawPickup(ctx, pk.kind, pk.x, pk.y, pk.value, t);
    this.fx.drawGround(ctx);
    // 对战缩圈：圈外的地面染成紫色
    const ring = this.pub?.pvp?.ring;
    if (ring) {
      this.ringR = this.ringR ? this.ringR + (ring.r - this.ringR) * Math.min(1, dt * 4) : ring.r;
      ctx.beginPath();
      ctx.rect(-BORDER, -BORDER, this.w + BORDER * 2, this.h + BORDER * 2);
      ctx.arc(ring.x, ring.y, this.ringR, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(110,30,150,0.3)';
      ctx.fill('evenodd');
    }

    // 实体（按 y 排序）
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    if (ip) {
      const { a, b, f } = ip;
      for (const e of b.s.enemies) {
        const pa = a.enemies.get(e.id);
        const x = pa ? pa.x + (e.x - pa.x) * f : e.x;
        const y = pa ? pa.y + (e.y - pa.y) * f : e.y;
        const def = ENEMIES[ENEMY_IDS[e.kind]];
        if (!def) continue;
        const shiny = this.isShiny(e.id, e.kind);
        let v = this.enemyVis.get(e.id);
        if (!v) {
          v = { anim: new Animator(def.dex, shiny), flash: 0, lx: x, ly: y, dir: 0, scale: def.scale ?? 1, seen: t, tw: 0 };
          v.anim.loop('Walk');
          this.enemyVis.set(e.id, v);
        }
        const vis = v;
        vis.anim.setDex(def.dex, shiny);
        if (shiny && !(e.flags & 1) && (vis.tw -= dt) <= 0) {
          vis.tw = 0.22;
          this.fx.twinkle(x + (Math.random() - 0.5) * 18 * vis.scale, y - 4 - Math.random() * 20 * vis.scale);
        }
        const mdx = x - vis.lx, mdy = y - vis.ly;
        if (Math.abs(mdx) + Math.abs(mdy) > 0.15) vis.anim.dir = dirRow(Math.atan2(mdy, mdx));
        vis.anim.loop((e.flags & 128) ? 'Idle' : 'Walk', (e.flags & 16) ? 0 : 1);
        vis.lx = x; vis.ly = y;
        vis.seen = t;
        vis.anim.update(dt);
        vis.flash = Math.max(-1, vis.flash - dt);
        if (e.flags & 1) continue;
        const line = LINE_OF_DEX[def.dex];
        const want = shiny ? (this.isShinyOwned(line) ? '' : 'shiny') : def.wild && !this.isOwned(line) ? 'heart' : '';
        list.push({ y, draw: () => this.drawEnemy(e, def.rank, def.dex, x, y, vis, t, want, shiny) });
      }
      for (const p of b.s.players) {
        const pa = a.players.get(p.id);
        let x = pa ? pa.x + (p.x - pa.x) * f : p.x;
        let y = pa ? pa.y + (p.y - pa.y) * f : p.y;
        if (p.id === this.you && this.local.synced) { x = this.local.x; y = this.local.y; }
        const shiny = (p.flags & 128) !== 0;
        let v = this.playerVis.get(p.id);
        if (!v) { v = { anim: new Animator(p.dex, shiny), flash: 0, down: false, evoFlash: 0, tw: 0.5, burn: 0 }; this.playerVis.set(p.id, v); }
        const vis = v;
        vis.anim.setDex(p.dex, shiny);
        const down = (p.flags & 1) !== 0;
        if (shiny && !down && (vis.tw -= dt) <= 0) {
          vis.tw = 0.8 + Math.random() * 0.6;
          this.fx.twinkle(x + (Math.random() - 0.5) * 16, y - 6 - Math.random() * 16);
        }
        if (down && !vis.down) vis.anim.play('Faint', true);
        if (!down && vis.down) vis.anim.loop('Idle');
        vis.down = down;
        const moving = p.id === this.you ? this.local.moving : (p.flags & 8) !== 0;
        const dir = p.id === this.you ? this.local.dir : p.dir;
        if (!down) {
          vis.anim.loop(moving && b.s.phase === 0 ? 'Walk' : 'Idle');
          vis.anim.dir = dirRow(dir);
        }
        vis.anim.update(dt);
        vis.flash = Math.max(0, vis.flash - dt);
        vis.evoFlash = Math.max(0, vis.evoFlash - dt);
        vis.burn = Math.max(0, vis.burn - dt);
        list.push({ y, draw: () => this.drawPlayer(p, x, y, vis, t) });
      }
    }
    for (const c of this.corpses) {
      c.t += dt;
      c.anim.update(dt);
      list.push({ y: c.y, draw: () => c.anim.draw(ctx, c.x, c.y, c.scale, 0, Math.max(0, 1 - c.t / 0.7)) });
    }
    this.corpses = this.corpses.filter((c) => c.t < 0.7);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();
    if (ring && this.ringR < Math.hypot(this.w, this.h) / 2) {
      ctx.globalAlpha = ring.shrinking && Math.floor(t * 3) % 2 ? 1 : 0.75;
      pxRing(ctx, ring.x, ring.y, this.ringR, '#e070ff', 2, 1, 4);
      ctx.globalAlpha = 1;
    }

    // 弹体（附带拖尾粒子）
    if (ip) {
      const { a, b, f } = ip;
      const seen = new Set<number>();
      for (const p of b.s.projs) {
        const pa = a.projs.get(p.id);
        const x = pa ? pa.x + (p.x - pa.x) * f : p.x;
        const y = pa ? pa.y + (p.y - pa.y) * f : p.y;
        const kind = FX_KINDS[p.fx];
        drawProj(ctx, kind, x, y, p.ang, p.r, t + p.id * 0.1, p.enemy);
        seen.add(p.id);
        const v = vis(kind);
        if (v.trail && Math.abs(x - this.cam.x - this.viewW / 2) < this.viewW / 2 + 20) {
          const last = this.trailT.get(p.id) ?? 0;
          if (t - last > 0.035) {
            this.trailT.set(p.id, t);
            this.fx.trail(v.trail as Trail, v.pal, x, y, Math.cos(p.ang), Math.sin(p.ang));
          }
        }
      }
      if (this.trailT.size > 400) for (const id of this.trailT.keys()) if (!seen.has(id)) this.trailT.delete(id);
    }
    // 飞向玩家的掉落物
    for (const fl of this.flyers) {
      fl.t += dt;
      const pos = this.playerPos(fl.pid);
      if (pos) {
        const k = Math.min(1, fl.t / 0.25);
        drawPickup(ctx, fl.kind, fl.x + (pos.x - fl.x) * k, fl.y + (pos.y - 8 - fl.y) * k, fl.value, t, false);
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 0.25);

    this.fx.drawAir(ctx, this.settings.damageNumbers);

    // 屏幕层：指向画面外倒下的队友（对战中也指向对手）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ip && this.names.size > 1) {
      for (const p of ip.b.s.players) {
        if (p.id === this.you) continue;
        const foe = this.isFoe(p.id);
        const down = (p.flags & 1) !== 0;
        if (foe ? down : !down || (this.pvp && !this.pvp.revive)) continue;
        const sx = (p.x - cx) * S, sy = (p.y - 10 - cy) * S;
        const W = this.canvas.width, H = this.canvas.height, m = 28 * S;
        if (sx >= 0 && sy >= 0 && sx <= W && sy <= H) continue;
        const ex = Math.max(m, Math.min(W - m, sx)), ey = Math.max(m, Math.min(H - m, sy));
        const a = Math.atan2(sy - ey, sx - ex);
        const k = foe ? 0.7 : 1;
        const col = foe ? '#ff6a6a' : '#78f878';
        ctx.save();
        ctx.translate(ex, ey);
        ctx.fillStyle = foe || Math.floor(t * 4) % 2 ? col : '#ffffff';
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(10 * S * k, 0);
        ctx.lineTo(-4 * S * k, -6 * S * k);
        ctx.lineTo(-4 * S * k, 6 * S * k);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const label = foe ? this.names.get(p.id) ?? '' : `救援 ${this.names.get(p.id) ?? ''}`;
        ctx.font = `${Math.round(10 * S * (foe ? 0.85 : 1))}px FusionPixel, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#101018';
        ctx.fillText(label, ex + S, ey + 18 * S * k + S);
        ctx.fillStyle = col;
        ctx.fillText(label, ex, ey + 18 * S * k);
      }
    }
    // 屏幕层：画面外的闪光宝可梦，在画面边上用一颗星指出方向（上下留出 HUD 的位置）
    if (ip) {
      const W = this.canvas.width, H = this.canvas.height;
      const mx = Math.max(16 * S, W * 0.06), top = Math.max(16 * S, H * 0.2), bottom = Math.max(16 * S, H * 0.18);
      const k = S + 1;
      for (const e of ip.b.s.enemies) {
        if (!this.isShiny(e.id, e.kind)) continue;
        const sx = (e.x - cx) * S, sy = (e.y - 10 - cy) * S;
        if (sx >= 0 && sy >= 0 && sx <= W && sy <= H) continue;
        const ex = Math.max(mx, Math.min(W - mx, sx)), ey = Math.max(top, Math.min(H - bottom, sy));
        const a = Math.atan2(sy - ey, sx - ex);
        ctx.save();
        ctx.translate(Math.round(ex), Math.round(ey));
        ctx.scale(k, k);
        ctx.globalAlpha = Math.floor(t * 4) % 2 ? 1 : 0.7;
        const ux = Math.cos(a), uy = Math.sin(a);
        ctx.fillStyle = '#9ae6ff';
        ctx.beginPath();
        ctx.moveTo(ux * 15, uy * 15);
        ctx.lineTo(ux * 6 - uy * 3, uy * 6 + ux * 3);
        ctx.lineTo(ux * 6 + uy * 3, uy * 6 - ux * 3);
        ctx.closePath();
        ctx.fill();
        star(ctx, 0, 0);
        twinkle(ctx, -5, -5, (t * 1.3) % 1);
        ctx.restore();
      }
    }
    // 屏幕层：场地刚出现时，如果不在画面里，在画面边上指出方向
    const T = this.terrain;
    if (T && !this.pvp && t - this.terrainAt < 6) {
      const W = this.canvas.width, H = this.canvas.height;
      const sx = (T.cx - cx) * S, sy = (T.cy - cy) * S;
      if (sx < 0 || sy < 0 || sx > W || sy > H) {
        const mx = Math.max(24 * S, W * 0.08), top = Math.max(24 * S, H * 0.22), bottom = Math.max(30 * S, H * 0.24);
        const ex = Math.max(mx, Math.min(W - mx, sx)), ey = Math.max(top, Math.min(H - bottom, sy));
        const a = Math.atan2(sy - ey, sx - ex);
        const col = TERRAINS[T.kind].color;
        ctx.save();
        ctx.translate(Math.round(ex), Math.round(ey));
        ctx.globalAlpha = Math.floor(t * 3) % 2 ? 1 : 0.75;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = '#101018';
        ctx.beginPath();
        ctx.moveTo(12 * S, 0); ctx.lineTo(-5 * S, -8 * S); ctx.lineTo(-5 * S, 8 * S);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(10 * S, 0); ctx.lineTo(-4 * S, -6 * S); ctx.lineTo(-4 * S, 6 * S);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const label = TERRAINS[T.kind].name;
        ctx.font = `${Math.round(9 * S)}px FusionPixel, monospace`;
        ctx.textAlign = 'center';
        const ly = Math.sin(a) > 0.5 ? -12 * S : 20 * S;
        ctx.fillStyle = '#101018';
        ctx.fillText(label, S, ly + S);
        ctx.fillStyle = col;
        ctx.fillText(label, 0, ly);
        ctx.restore();
      }
    }
    // 屏幕层：受伤红闪
    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      ctx.fillStyle = `rgba(255,40,60,${Math.max(0, this.hurtFlash) * 0.3})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    const mine = ip?.b.players.get(this.you);
    if (mine && mine.hp > 0 && mine.hp < mine.maxHp * 0.3 && !(mine.flags & 1)) {
      const a = 0.12 + 0.08 * Math.sin(now / 180);
      const g = ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.3, this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.8);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawShadow(x: number, y: number, size: number, scale: number) {
    const rx = [5, 7, 10][Math.min(2, size)] * scale;
    this.ctx.fillStyle = 'rgba(0,0,0,.28)';
    this.ctx.fillRect(Math.round(x - rx), Math.round(y - 1), Math.round(rx * 2), 3);
    this.ctx.fillRect(Math.round(x - rx + 2), Math.round(y - 2), Math.round(rx * 2 - 4), 5);
  }

  /** 减速时身体两侧往上飘的冰晶：深浅两种蓝，冰面和草地上都看得清；side 为离中线的距离，hgt 为身体高度 */
  private iceBit(x: number, y: number, side: number, hgt: number) {
    const s = Math.random() < 0.5 ? -1 : 1;
    const deep = Math.random() < 0.5;
    this.fx.px(x + s * (side * 0.6 + Math.random() * side * 0.5), y - 2 - Math.random() * hgt, deep ? '#2f8ce8' : '#c8f0ff', { vy: -16, life: 0.55, size: deep || Math.random() < 0.4 ? 2 : 1 });
  }

  /** want：heart 还没有的乱入宝可梦（头上一颗爱心），shiny 还没有的闪光宝可梦（头上一颗星） */
  private drawEnemy(e: SnapEnemy, rank: string, dex: number, x: number, y: number, v: EnemyVis, t: number, want: '' | 'heart' | 'shiny', shiny: boolean) {
    const ctx = this.ctx;
    this.drawShadow(x, y, shadowSize(dex), v.scale);
    if (want || shiny) {
      // 脚下的光圈：乱入的是粉色，闪光宝可梦是浅蓝色
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 5);
      pxRing(ctx, x, y, 11 * v.scale, shiny ? '#9ae6ff' : '#ff8ad8', 1, 0.45, 2);
      ctx.globalAlpha = 1;
    }
    if (rank !== 'minion') {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
      pxRing(ctx, x, y, 10 * v.scale, rank === 'boss' ? '#f8d030' : '#f85050', 1, 0.45, 2);
      ctx.globalAlpha = 1;
    }
    v.anim.draw(ctx, x, y, v.scale, v.flash > 0 ? 0.8 : 0);
    const f = e.flags;
    const top = y - 26 * v.scale;
    // 异常状态：灼伤冒火星、中毒冒泡、麻痹闪电、冰冻/畏缩罩一层冰
    const jx = () => x + (Math.random() - 0.5) * 10 * v.scale;
    if (f & 2 && Math.random() < 0.25) this.fx.px(jx(), y - 6, Math.random() < 0.5 ? '#ff6a1f' : '#ffb22e', { vy: -35, life: 0.45 });
    if (f & 4 && Math.random() < 0.2) this.fx.px(jx(), y - 4, '#d995f2', { vy: -25, life: 0.5, size: 2 });
    if (f & 8 && Math.random() < 0.12) this.fx.sp('spark', 'electric', jx(), y - 6 - Math.random() * 12 * v.scale, { life: 0.15, fr: 20 });
    if (f & 16) { ctx.globalAlpha = 0.33; pxCircle(ctx, x, y - 8 * v.scale, 7 * v.scale, '#bff3ff'); ctx.globalAlpha = 1; }
    if (f & 32 && Math.random() < 0.22) this.iceBit(x, y, 8 * v.scale, 10 * v.scale);
    if (f & 64) {
      ctx.fillStyle = '#f83838';
      ctx.fillRect(Math.round(x) - 1, Math.round(top) - 6, 2, 5);
      ctx.fillRect(Math.round(x) - 1, Math.round(top), 2, 2);
    }
    if (want === 'heart') heart(ctx, x, top - 4 + Math.round(Math.sin(t * 4) * 1.5));
    else if (want === 'shiny') star(ctx, x, top - 5 + Math.round(Math.sin(t * 4) * 1.5));
    if (rank !== 'minion' || e.hp < 0.999) {
      const w = rank === 'boss' ? 0 : rank === 'elite' ? 22 : 12;
      if (w) {
        const bx = Math.round(x - w / 2), by = Math.round(y + 2);
        ctx.fillStyle = '#181020';
        ctx.fillRect(bx - 1, by - 1, w + 2, 4);
        ctx.fillStyle = rank === 'elite' ? '#f85050' : '#f8a040';
        ctx.fillRect(bx, by, Math.max(1, Math.round(w * e.hp)), 2);
      }
    }
  }

  private drawPlayer(p: SnapPlayer, x: number, y: number, v: PlayerVis, t: number) {
    const ctx = this.ctx;
    const mine = p.id === this.you;
    const foe = this.isFoe(p.id);
    const canRevive = this.names.size > 1 && (!this.pvp || this.pvp.revive);
    if (p.flags & 1 && canRevive) {
      // 救援圈：队友站进圈里就能把它救起来；对手的救援圈是红色的，靠近就能打断
      const col = foe ? '#ff6a6a' : '#78f878';
      ctx.globalAlpha = Math.floor(t * 4) % 2 ? 0.9 : 0.6;
      pxRing(ctx, x, y, REVIVE_RADIUS, col, 2, 0.55, 4);
      ctx.globalAlpha = 0.3;
      if (p.revive > 0) pxCircle(ctx, x, y, Math.max(2, REVIVE_RADIUS * p.revive), col);
      ctx.globalAlpha = 1;
    }
    this.drawShadow(x, y, shadowSize(p.dex), 1);
    if (this.pvp) {
      ctx.globalAlpha = mine ? 0.85 : 0.6;
      pxRing(ctx, x, y, 9, mine ? '#ffffff' : foe ? '#ff6a6a' : '#5aa0ff', 1, 0.45, 2);
      ctx.globalAlpha = 1;
    } else if (mine) {
      ctx.globalAlpha = 0.5;
      pxRing(ctx, x, y, 9, '#ffffff', 1, 0.45, 2);
      ctx.globalAlpha = 1;
    }
    const invuln = (p.flags & 2) !== 0 && !(p.flags & 1);
    const alpha = invuln && Math.floor(t * 16) % 2 ? 0.55 : 1;
    const white = v.flash > 0 || v.evoFlash > 0;
    // 寒霜冻得减速时身上一直带一层淡蓝（灼伤的红闪优先）
    const chill = !white && v.burn <= 0 && (p.tst & 2) !== 0;
    const flash = v.flash > 0 ? 0.6 : v.evoFlash > 0 ? Math.min(1, v.evoFlash) : v.burn > 0 ? Math.min(0.55, v.burn * 3) : chill ? 0.22 + 0.08 * Math.sin(t * 6) : 0;
    v.anim.draw(ctx, x, y, 1, flash, alpha, white ? '#ffffff' : chill ? '#58b8ff' : '#ff4a2a');
    if (v.evoFlash > 0) {
      ctx.globalAlpha = v.evoFlash / 1.4;
      pxRing(ctx, x, y - 10, 10 + (1.4 - v.evoFlash) * 30, '#ffffff', 2);
      ctx.globalAlpha = 1;
    }
    if (p.flags & 4) {
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 8);
      pxRing(ctx, x, y - 9, 13, '#a0d8ff', 1, 1, 3);
      pxRing(ctx, x, y - 9, 12, '#eaf7ff', 1, 1, 7);
      ctx.globalAlpha = 1;
    }
    if (p.flags & 16 && Math.random() < 0.3) {
      // 自己身上的增幅种子：按种子的颜色冒光点
      const bs = mine ? this.me?.boosts : undefined;
      const col = bs?.length ? BOOSTS[bs[Math.floor(Math.random() * bs.length)][0]].color : '#fff36a';
      this.fx.px(x + (Math.random() - 0.5) * 12, y - 2, col, { vy: -40, life: 0.35 });
    }
    // 局部属性场地：灼伤冒火星，减速冒蓝色的冰晶
    if (p.tst & 1 && Math.random() < 0.3) this.fx.px(x + (Math.random() - 0.5) * 12, y - 4 - Math.random() * 12, Math.random() < 0.5 ? '#ff6a1f' : '#ffb22e', { vy: -38, life: 0.4 });
    if (p.tst & 6 && Math.random() < (p.tst & 2 ? 0.35 : 0.28)) this.iceBit(x, y, 9, 12);
    // 名字与血条
    const name = this.names.get(p.id) ?? '';
    ctx.font = '10px FusionPixel, monospace';
    ctx.textAlign = 'center';
    const ny = Math.round(y - 30);
    if (!mine || this.names.size > 1) {
      ctx.fillStyle = '#101018';
      ctx.fillText(name, Math.round(x) + 1, ny + 1);
      ctx.fillStyle = mine ? '#ffd23f' : this.pvp ? (foe ? '#ff9090' : '#9fd0ff') : '#ffffff';
      ctx.fillText(name, Math.round(x), ny);
    }
    const w = this.pvp ? 22 : 18, bx = Math.round(x - w / 2), by = Math.round(y + 3);
    ctx.fillStyle = '#181020';
    ctx.fillRect(bx - 1, by - 1, w + 2, 4);
    const frac = p.maxHp ? p.hp / p.maxHp : 0;
    ctx.fillStyle = foe ? '#f85050' : frac > 0.5 ? '#58d858' : frac > 0.2 ? '#f8c838' : '#f84848';
    ctx.fillRect(bx, by, Math.round(w * frac), 2);
    if (p.flags & 1) {
      const label = this.names.size <= 1 ? '濒死' : !canRevive ? '退场' : foe ? (p.revive > 0 ? '对手救援中！靠近打断' : '倒下') : mine ? '等待救援…' : p.revive > 0 ? `救援中 ${Math.round(p.revive * 100)}%` : '站上来救援！';
      ctx.fillStyle = '#101018';
      ctx.fillText(label, Math.round(x) + 1, ny - 9);
      ctx.fillStyle = mine || foe || !canRevive ? '#ff8c8c' : '#78f878';
      ctx.fillText(label, Math.round(x), ny - 10);
      if (p.revive > 0) {
        ctx.strokeStyle = foe ? '#ff6a6a' : '#78f878';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 8, 14, -Math.PI / 2, -Math.PI / 2 + p.revive * Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function pixels(ctx: CanvasRenderingContext2D, X: number, Y: number, rows: string[], col: Record<string, string>) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = col[r[i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(X + i, Y + j, 1, 1); } } });
}

/** 5×4 的像素爱心（带描边） */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  pixels(ctx, Math.round(x) - 3, Math.round(y) - 3, ['.oo.oo.', 'oppopqo', 'opppppo', '.opppo.', '..opo..', '...o...'], { o: '#401030', p: '#ff6ab8', q: '#ffd0ec' });
}

/** 7×7 的像素四角星（带描边）：还没有的闪光宝可梦 */
function star(ctx: CanvasRenderingContext2D, x: number, y: number) {
  pixels(ctx, Math.round(x) - 3, Math.round(y) - 3, ['...o...', '..oyo..', '.oywyo.', 'oywwwyo', '.oywyo.', '..oyo..', '...o...'], { o: '#4a3010', y: '#ffd23f', w: '#fff6c8' });
}
