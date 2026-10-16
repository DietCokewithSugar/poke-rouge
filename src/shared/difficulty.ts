/**
 * 难度（参考土豆兄弟的危险等级）：在简单的基础上叠加敌人数量、血量、伤害、移速，
 * 普通与困难还会出现「群聚波」和额外的精英。通关上一档才能解锁下一档。
 * 地狱与噩梦：野生宝可梦会以进化形态出现（噩梦里全部进化，一半是最终形态），掉落的糖果也更多，经验和金钱跟着变多。
 */
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'hell' | 'nightmare';

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
  /** 一波掉落的糖果总量（经验与金钱）的倍率 */
  candy: number;
  /** 小怪以进化形态出现的几率；evolve2：进化过的再进化一次（到最终形态）的几率 */
  evolve: number;
  evolve2: number;
  /** 首领波来助阵的精英：第 10 波、第 20 波 */
  guards: [string[], string[]];
  stardust: number;
  /** 解锁需要的成就 */
  unlock: string | null;
  unlockHint: string;
  color: string;
}

const BASE = { candy: 1, evolve: 0, evolve2: 0, guards: [[], []] as [string[], string[]] };

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    ...BASE, id: 'easy', name: '简单', color: '#5fe08a',
    desc: ['标准的敌人数量与强度'],
    count: 1, hp: 1, dmg: 1, speed: 1, bossHp: 1, horde: 0, extraElite: 0, stardust: 1,
    unlock: null, unlockHint: '初始可用',
  },
  normal: {
    ...BASE, id: 'normal', name: '普通', color: '#ffd23f',
    desc: ['敌人数量 +20%（糖果总量不变）', '敌人血量 +25%、伤害 +25%', '敌人移速 +8%', '首领血量 +35%', '会出现群聚波与额外精英'],
    count: 1.2, hp: 1.25, dmg: 1.25, speed: 1.08, bossHp: 1.35, horde: 0.15, extraElite: 0.3, stardust: 1.4,
    unlock: 'victory', unlockHint: '通关简单模式后解锁',
  },
  hard: {
    ...BASE, id: 'hard', name: '困难', color: '#ff5f6d',
    desc: ['敌人数量 +35%（糖果总量不变）', '敌人血量 +50%、伤害 +50%', '敌人移速 +15%', '首领血量 +70%', '群聚波与精英更多，最终波耿鬼助阵'],
    count: 1.35, hp: 1.5, dmg: 1.5, speed: 1.15, bossHp: 1.7, horde: 0.25, extraElite: 0.5, stardust: 1.8,
    guards: [[], ['gengar', 'gengar']],
    unlock: 'victory_normal', unlockHint: '通关普通模式后解锁',
  },
  hell: {
    id: 'hell', name: '地狱', color: '#ff7a1a',
    desc: ['敌人数量 +45%', '敌人血量 +60%、伤害 +60%', '敌人移速 +18%', '首领血量 +100%', '一半的小怪以进化形态出现',
      '糖果总量 +35%（经验与金钱更多）', '首领波有精英助阵'],
    count: 1.45, hp: 1.6, dmg: 1.6, speed: 1.18, bossHp: 2, horde: 0.3, extraElite: 0.65, stardust: 2.4,
    candy: 1.35, evolve: 0.5, evolve2: 0, guards: [['beedrill'], ['gengar', 'gengar', 'onix']],
    unlock: 'victory_hard', unlockHint: '通关困难模式后解锁',
  },
  nightmare: {
    id: 'nightmare', name: '噩梦', color: '#c070ff',
    desc: ['敌人数量 +55%', '敌人血量 +65%、伤害 +65%', '敌人移速 +20%', '首领血量 +130%', '小怪全部以进化形态出现，一半是最终形态',
      '糖果总量 +70%（经验与金钱更多）', '首领波有更多精英助阵'],
    count: 1.55, hp: 1.65, dmg: 1.65, speed: 1.2, bossHp: 2.3, horde: 0.35, extraElite: 0.8, stardust: 3.2,
    candy: 1.7, evolve: 1, evolve2: 0.5, guards: [['beedrill', 'beedrill'], ['gengar', 'gengar', 'onix', 'onix']],
    unlock: 'victory_hell', unlockHint: '通关地狱模式后解锁',
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as DifficultyId[];

export function difficultyOf(id: unknown): Difficulty {
  return DIFFICULTIES[(DIFFICULTY_IDS as string[]).includes(id as string) ? (id as DifficultyId) : 'easy'];
}

/** 难度 a 是不是至少和 b 一样难 */
export const atLeast = (a: DifficultyId, b: DifficultyId) => DIFFICULTY_IDS.indexOf(a) >= DIFFICULTY_IDS.indexOf(b);
