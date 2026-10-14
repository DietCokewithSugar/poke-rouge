/**
 * 难度（参考土豆兄弟的危险等级）：在简单的基础上叠加敌人数量、血量、伤害、移速，
 * 普通与困难还会出现「群聚波」和额外的精英。通关上一档才能解锁下一档。
 */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  desc: string[];
  count: number;
  hp: number;
  dmg: number;
  speed: number;
  bossHp: number;
  /** 每个普通波次变成群聚波（刷怪翻倍）的几率 */
  horde: number;
  /** 没有精英的波次（第 6 波起）额外出现一只精英的几率 */
  extraElite: number;
  stardust: number;
  /** 解锁需要的成就 */
  unlock: string | null;
  unlockHint: string;
  color: string;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    id: 'easy', name: '简单', color: '#5fe08a',
    desc: ['标准的敌人数量与强度'],
    count: 1, hp: 1, dmg: 1, speed: 1, bossHp: 1, horde: 0, extraElite: 0, stardust: 1,
    unlock: null, unlockHint: '初始可用',
  },
  normal: {
    id: 'normal', name: '普通', color: '#ffd23f',
    desc: ['敌人数量 +20%（糖果总量不变）', '敌人血量 +25%、伤害 +25%', '敌人移速 +8%', '首领血量 +35%', '会出现群聚波与额外精英'],
    count: 1.2, hp: 1.25, dmg: 1.25, speed: 1.08, bossHp: 1.35, horde: 0.15, extraElite: 0.3, stardust: 1.4,
    unlock: 'victory', unlockHint: '通关简单模式后解锁',
  },
  hard: {
    id: 'hard', name: '困难', color: '#ff5f6d',
    desc: ['敌人数量 +35%（糖果总量不变）', '敌人血量 +50%、伤害 +50%', '敌人移速 +15%', '首领血量 +70%', '群聚波与精英更多，最终波耿鬼助阵'],
    count: 1.35, hp: 1.5, dmg: 1.5, speed: 1.15, bossHp: 1.7, horde: 0.25, extraElite: 0.5, stardust: 1.8,
    unlock: 'victory_normal', unlockHint: '通关普通模式后解锁',
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as DifficultyId[];

export function difficultyOf(id: unknown): Difficulty {
  return DIFFICULTIES[(DIFFICULTY_IDS as string[]).includes(id as string) ? (id as DifficultyId) : 'easy'];
}
