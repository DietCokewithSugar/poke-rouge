/**
 * 联机同步：每位玩家一份。
 * - 快照与纯视觉的特效事件只发视野附近的（伤害数字、技能特效、爆炸、敌人倒下……）
 * - 网络拥堵时先丢弃纯视觉的事件和快照，关键事件（波次、首领、升级、倒下、救援……）照常发送
 * - 波次进行中的私有状态只发变化频繁的字段；整份状态只在真正有变化时重发
 */
import { inBox, type MeDyn, type ViewBox } from './protocol';
import type { SimPlayer } from './sim/entities';
import type { Ev, GameSim } from './sim/game';

export interface Conn {
  /** droppable：网络拥堵时可以丢弃（快照、纯视觉的事件） */
  send(data: string | ArrayBuffer, droppable?: boolean): void;
  /** 还没发出去的数据量（字节） */
  buffered?(): number;
}

/** 视野外留出的余量（世界像素）：镜头跟随有延迟、屏幕震动 */
const MARGIN = 80;
/** 待发送数据超过这个量就认为拥堵：快照减半、只发关键事件 */
export const CONGESTED_BYTES = 8 * 1024;

/**
 * 只看服务器进程里待发送的数据量不够：数据一旦交给操作系统，慢线路上的积压会堆在内核的 TCP 发送缓冲区里
 * （Linux 会自动扩大到几 MB），程序里看不到。所以客户端会确认收到的快照编号，服务器用「发出 → 确认」的往返时间
 * 减去最近的最小往返时间，估计线路上排了多少毫秒的队，排队多了就主动少发。
 */
export const QUEUE_SLOW_MS = 150;
export const QUEUE_JAM_MS = 500;

/** 纯视觉事件：[位置 x 的下标, y 的下标, 额外余量] */
const COSMETIC: Record<string, [number, number, number]> = {
  h: [2, 3, 40], fx: [2, 3, 240], boom: [1, 2, 120], die: [2, 3, 40], mark: [1, 2, 40], txt: [1, 2, 60],
};

export function isCosmetic(ev: Ev) {
  return ev[0] === 'chain' || (ev[0] as string) in COSMETIC;
}

/** 只保留视野附近的视觉事件；拥堵时视觉事件全部丢掉 */
export function cullEvents(evs: Ev[], box: ViewBox | null, congested: boolean): Ev[] {
  if (!box && !congested) return evs;
  return evs.filter((ev) => {
    const k = ev[0] as string;
    if (k === 'chain') {
      if (congested) return false;
      const pts = ev[2] as number[];
      return inBox(box, pts[0], pts[1], 240);
    }
    const c = COSMETIC[k];
    if (!c) return true;
    if (congested) return false;
    return inBox(box, ev[c[0]] as number, ev[c[1]] as number, c[2]);
  });
}

export class PeerSync {
  /** 客户端画面的世界尺寸 */
  view = { w: 720, h: 420 };
  private lastStatic = '';
  private lastDyn = '';
  private sentAt = new Map<number, number>();
  private rtt = 0;
  private minRtt = Infinity;
  private lastAckAt = 0;

  /** 记录快照的发出时间 */
  markSent(tick: number, now: number) {
    this.sentAt.set(tick, now);
    if (this.sentAt.size > 240) this.sentAt.delete(this.sentAt.keys().next().value!);
  }

  /** 客户端确认收到了编号为 k 的快照 */
  ack(k: number, now: number) {
    const t0 = this.sentAt.get(k);
    if (t0 === undefined) return;
    for (const t of this.sentAt.keys()) { if (t > k) break; this.sentAt.delete(t); }
    this.rtt = now - t0;
    // 最小往返时间缓慢上浮（每秒 2ms），线路长期变慢时也能慢慢适应
    const drift = this.lastAckAt ? ((now - this.lastAckAt) / 1000) * 2 : 0;
    this.minRtt = Math.min(this.minRtt + drift, this.rtt);
    this.lastAckAt = now;
  }

  /** 线路上排队的估计（毫秒）；还没收到过确认（旧版客户端）时为 0 */
  queueMs(now: number) {
    if (!this.lastAckAt) return 0;
    let oldest = Infinity;
    for (const t of this.sentAt.values()) { oldest = t; break; }
    const pending = oldest === Infinity ? 0 : now - oldest;
    return Math.max(0, Math.max(this.rtt, pending) - this.minRtt);
  }

  /** 0 正常 · 1 变慢（快照降到 7.5 次/秒、不发视觉事件） · 2 堵塞（快照 3 次/秒） */
  congestion(now: number, buffered: number) {
    const q = this.queueMs(now);
    this.level = q > QUEUE_JAM_MS || buffered > CONGESTED_BYTES * 4 ? 2 : q > QUEUE_SLOW_MS || buffered > CONGESTED_BYTES ? 1 : 0;
    return this.level;
  }

  /** 最近一次估计的拥堵程度 */
  level = 0;

  /** 这一帧要不要发快照（拥堵时降低频率，保证还能收到确认） */
  shouldSend(tick: number, level: number) {
    return level === 0 || tick % (level === 1 ? 4 : 10) === 0;
  }

  setView(w: number, h: number) {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    this.view = { w: Math.max(200, Math.min(1600, w)), h: Math.max(120, Math.min(1000, h)) };
  }

  box(p: SimPlayer | undefined): ViewBox | null {
    if (!p) return null;
    const hw = this.view.w / 2 + MARGIN, hh = this.view.h / 2 + MARGIN;
    return { x0: p.x - hw, y0: p.y - hh, x1: p.x + hw, y1: p.y + hh };
  }

  /** 要发给这位玩家的私有状态；没变化时返回 null */
  privateMsg(sim: GameSim, p: SimPlayer): string | null {
    const me = sim.privateState(p);
    if (sim.phase !== 'wave') {
      this.lastStatic = '';
      this.lastDyn = '';
      return JSON.stringify({ t: 'me', s: me });
    }
    const { hp, maxHp, xp, money, down, speed, skills, ...rest } = me;
    const stat = JSON.stringify({ ...rest, skills: skills.map((s) => [s.id, s.lv, s.max]) });
    const dyn: MeDyn = { hp, maxHp, xp, money, down, speed, cds: skills.map((s) => s.cd) };
    const d = JSON.stringify(dyn);
    if (stat !== this.lastStatic) {
      this.lastStatic = stat;
      this.lastDyn = d;
      return JSON.stringify({ t: 'me', s: me });
    }
    if (d === this.lastDyn) return null;
    this.lastDyn = d;
    return JSON.stringify({ t: 'md', s: dyn });
  }

  reset() {
    this.lastStatic = '';
    this.lastDyn = '';
  }
}
