import type { Mods, TypeMods } from './stats';

export interface TrainerDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  mods: Partial<Mods>;
  typeMods?: TypeMods;
  unlock: { start?: boolean; ach?: string; cost?: number };
}

const T = (d: TrainerDef) => d;

export const TRAINER_LIST: TrainerDef[] = [
  T({
    id: 'ash', name: '小智', title: '宝可梦之友', desc: '来自真新镇的少年，和宝可梦心意相通，野生宝可梦更容易崇拜他。',
    mods: { recruit: 30, xp: 6 }, unlock: { start: true },
  }),
  T({
    id: 'misty', name: '小霞', title: '华蓝的人鱼', desc: '华蓝道馆的馆主，擅长水系宝可梦。',
    mods: { maxHp: 6, regen: 2 }, typeMods: { water: 12 }, unlock: { start: true },
  }),
  T({
    id: 'brock', name: '小刚', title: '坚如磐石', desc: '深灰道馆的馆主，岩石般可靠的大哥哥。',
    mods: { defPct: 10, maxHp: 10 }, typeMods: { rock: 10 }, unlock: { cost: 400, ach: 'badge_1' },
  }),
  T({
    id: 'gary', name: '小茂', title: '劲敌', desc: '大木博士的孙子，总是比你快一步的天才训练家。',
    mods: { dmg: 6, crit: 3, xp: 6 }, unlock: { ach: 'beat_snorlax' },
  }),
  T({
    id: 'rocket', name: '火箭队', title: '坏事干尽', desc: '火箭队的成员，为了钱什么都做得出来，宝可梦不太信任他们。',
    mods: { money: 20, discount: 5, recruit: -20 }, unlock: { cost: 600 },
  }),
  T({
    id: 'giovanni', name: '坂木老大', title: '火箭队首领', desc: '常磐道馆的神秘馆主，火箭队的首领。',
    mods: { money: 12, dmgBoss: 12 }, typeMods: { ground: 10 }, unlock: { ach: 'victory' },
  }),
  T({
    id: 'sabrina', name: '娜姿', title: '超能力少女', desc: '金黄道馆的馆主，能用超能力预知未来。',
    mods: { spaPct: 8, haste: 6 }, typeMods: { psychic: 10 }, unlock: { cost: 900, ach: 'badge_6' },
  }),
  T({
    id: 'lance', name: '渡', title: '龙使', desc: '四天王之首，驾驭龙之宝可梦的强者。',
    mods: { atkPct: 5, spaPct: 5, spePct: 5 }, typeMods: { dragon: 15 }, unlock: { ach: 'victory_normal' },
  }),
];

export const TRAINERS: Record<string, TrainerDef> = Object.fromEntries(TRAINER_LIST.map((t) => [t.id, t]));
export const TRAINER_IDS = TRAINER_LIST.map((t) => t.id);
export const DEFAULT_TRAINER = 'ash';

export function trainerOf(id: unknown): TrainerDef {
  return (typeof id === 'string' && TRAINERS[id]) || TRAINERS[DEFAULT_TRAINER];
}
