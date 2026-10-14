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
