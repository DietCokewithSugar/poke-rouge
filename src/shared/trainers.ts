import type { Mods, TypeMods } from './stats';

/** 训练家的像素外形（客户端按这些参数画出行走图与头像） */
export interface TrainerLook {
  skin: string;
  hair: string;
  hairStyle: 'spiky' | 'ponytail' | 'long' | 'slick' | 'swept';
  /** 帽子（小智的联盟帽） */
  cap?: [string, string];
  top: string;
  /** 内衬 / 背心 / 披风内侧 */
  top2: string;
  bottom: string;
  shoes: string;
  /** 眯眯眼 */
  squint?: boolean;
  cape?: string;
  /** 胸口的标志（火箭队的 R） */
  mark?: string;
  skirt?: boolean;
}

export interface TrainerDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  mods: Partial<Mods>;
  typeMods?: TypeMods;
  unlock: { start?: boolean; ach?: string; cost?: number };
  look: TrainerLook;
}

const T = (d: TrainerDef) => d;

export const TRAINER_LIST: TrainerDef[] = [
  T({
    id: 'ash', name: '小智', title: '宝可梦之友', desc: '来自真新镇的少年，和宝可梦心意相通，野生宝可梦更容易崇拜他。',
    mods: { recruit: 30, xp: 6 }, unlock: { start: true },
    look: { skin: '#f8c8a0', hair: '#202028', hairStyle: 'spiky', cap: ['#e83838', '#f8f8f8'], top: '#3878d8', top2: '#283040', bottom: '#3858a8', shoes: '#303030' },
  }),
  T({
    id: 'misty', name: '小霞', title: '华蓝的人鱼', desc: '华蓝道馆的馆主，擅长水系宝可梦。',
    mods: { maxHp: 6, regen: 2 }, typeMods: { water: 12 }, unlock: { start: true },
    look: { skin: '#f8c8a0', hair: '#f88830', hairStyle: 'ponytail', top: '#f8d030', top2: '#e83838', bottom: '#3878d8', shoes: '#e83838' },
  }),
  T({
    id: 'brock', name: '小刚', title: '坚如磐石', desc: '深灰道馆的馆主，岩石般可靠的大哥哥。',
    mods: { defPct: 10, maxHp: 10 }, typeMods: { rock: 10 }, unlock: { cost: 400 },
    look: { skin: '#c88858', hair: '#583828', hairStyle: 'spiky', top: '#e07028', top2: '#589048', bottom: '#806040', shoes: '#404040', squint: true },
  }),
  T({
    id: 'gary', name: '小茂', title: '劲敌', desc: '大木博士的孙子，总是比你快一步的天才训练家。',
    mods: { dmg: 6, crit: 3, xp: 6 }, unlock: { ach: 'beat_snorlax' },
    look: { skin: '#f8c8a0', hair: '#987048', hairStyle: 'swept', top: '#8858b8', top2: '#283040', bottom: '#303040', shoes: '#584838' },
  }),
  T({
    id: 'rocket', name: '火箭队', title: '坏事干尽', desc: '武藏与小次郎（还有喵喵）。为了钱什么都做得出来，宝可梦不太信任他们。',
    mods: { money: 20, discount: 5, recruit: -20 }, unlock: { cost: 600 },
    look: { skin: '#f8d0b0', hair: '#d03878', hairStyle: 'long', top: '#f0f0f0', top2: '#282830', bottom: '#f0f0f0', shoes: '#282830', mark: '#e02828' },
  }),
  T({
    id: 'giovanni', name: '坂木老大', title: '火箭队首领', desc: '常磐道馆的神秘馆主，火箭队的首领。',
    mods: { money: 12, dmgBoss: 12 }, typeMods: { ground: 10 }, unlock: { ach: 'victory' },
    look: { skin: '#e8b890', hair: '#282028', hairStyle: 'slick', top: '#d07830', top2: '#302828', bottom: '#a05820', shoes: '#282020' },
  }),
  T({
    id: 'sabrina', name: '娜姿', title: '超能力少女', desc: '金黄道馆的馆主，能用超能力预知未来。',
    mods: { spaPct: 8, haste: 6 }, typeMods: { psychic: 10 }, unlock: { cost: 900 },
    look: { skin: '#f8d8c0', hair: '#284838', hairStyle: 'long', top: '#c02838', top2: '#282830', bottom: '#f0f0f0', shoes: '#282830' },
  }),
  T({
    id: 'lance', name: '渡', title: '龙使', desc: '四天王之首，驾驭龙之宝可梦的强者。',
    mods: { atkPct: 5, spaPct: 5, spePct: 5 }, typeMods: { dragon: 15 }, unlock: { ach: 'victory_normal' },
    look: { skin: '#f8c8a0', hair: '#d03028', hairStyle: 'spiky', top: '#3050a0', top2: '#e08830', bottom: '#283050', shoes: '#282830', cape: '#202028' },
  }),
];

export const TRAINERS: Record<string, TrainerDef> = Object.fromEntries(TRAINER_LIST.map((t) => [t.id, t]));
export const TRAINER_IDS = TRAINER_LIST.map((t) => t.id);
export const DEFAULT_TRAINER = 'ash';

export function trainerOf(id: unknown): TrainerDef {
  return (typeof id === 'string' && TRAINERS[id]) || TRAINERS[DEFAULT_TRAINER];
}
