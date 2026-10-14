import type { Mods, TypeMods } from './stats';

/**
 * 装备道具。名称取自宝可梦对战道具与宝可梦卡牌（TCG）的"宝可梦道具"，
 * 加成内容按土豆兄弟的思路重新设计。
 */
export interface ItemDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  price: number;
  mods?: Partial<Mods>;
  typeMods?: TypeMods;
  max?: number;
  /** 特殊效果标记，由模拟层处理 */
  special?: 'sash' | 'revive' | 'rare_candy' | 'evo_stone' | 'eviolite' | 'exp_share';
  /** 只对某个精灵系列出现 */
  only?: string;
  icon: string;
  desc?: string;
  tcg?: boolean;
}

const LIST: ItemDef[] = [
  // ---------- 一阶 ----------
  { id: 'muscle_band', name: '力量头带', tier: 1, price: 20, mods: { dmgMinion: 8 }, icon: 'band', tcg: true },
  { id: 'big_charm', name: '大护符', tier: 1, price: 18, mods: { maxHp: 5 }, icon: 'charm', tcg: true },
  { id: 'float_stone', name: '浮石', tier: 1, price: 18, mods: { spe: 8 }, icon: 'stone', tcg: true },
  { id: 'air_balloon', name: '气球', tier: 1, price: 20, mods: { dodge: 4 }, icon: 'balloon', tcg: true },
  { id: 'charcoal', name: '木炭', tier: 1, price: 20, typeMods: { fire: 12 }, icon: 'charcoal' },
  { id: 'mystic_water', name: '神秘水滴', tier: 1, price: 20, typeMods: { water: 12 }, icon: 'drop' },
  { id: 'miracle_seed', name: '奇迹种子', tier: 1, price: 20, typeMods: { grass: 12 }, icon: 'seed' },
  { id: 'magnet', name: '磁铁', tier: 1, price: 20, typeMods: { electric: 12 }, icon: 'magnet' },
  { id: 'twisted_spoon', name: '弯曲的汤匙', tier: 1, price: 20, typeMods: { psychic: 12 }, icon: 'spoon' },
  { id: 'silk_scarf', name: '丝绸围巾', tier: 1, price: 18, typeMods: { normal: 12 }, icon: 'scarf' },
  { id: 'poison_barb', name: '毒针', tier: 1, price: 18, typeMods: { poison: 12 }, icon: 'barb' },
  { id: 'dragon_fang', name: '龙之牙', tier: 1, price: 18, typeMods: { dragon: 12 }, icon: 'fang' },
  { id: 'metal_coat', name: '金属膜', tier: 1, price: 20, typeMods: { steel: 12 }, mods: { def: 3 }, icon: 'coat' },
  { id: 'never_melt_ice', name: '不融冰', tier: 1, price: 18, typeMods: { ice: 12 }, icon: 'ice' },
  { id: 'black_belt', name: '黑带', tier: 1, price: 18, typeMods: { fighting: 12 }, icon: 'belt' },
  { id: 'amulet_coin', name: '护符金币', tier: 1, price: 24, mods: { money: 10 }, icon: 'coin' },
  { id: 'oran_berry', name: '橙橙果', tier: 1, price: 16, mods: { regen: 3 }, icon: 'berry' },
  { id: 'exp_share', name: '学习装置', tier: 1, price: 24, mods: { xp: 15 }, special: 'exp_share', icon: 'expshare', tcg: true, desc: '联机时，队友击败敌人也会分给你少量经验。' },
  { id: 'protein', name: '攻击增强剂', tier: 1, price: 22, mods: { atk: 6 }, icon: 'vitamin_r' },
  { id: 'calcium', name: '特攻增强剂', tier: 1, price: 22, mods: { spa: 6 }, icon: 'vitamin_b' },
  { id: 'iron', name: '防御增强剂', tier: 1, price: 20, mods: { def: 6 }, icon: 'vitamin_g' },
  { id: 'zinc', name: '特防增强剂', tier: 1, price: 20, mods: { spd: 6 }, icon: 'vitamin_y' },

  // ---------- 二阶 ----------
  { id: 'quick_claw', name: '先制之爪', tier: 2, price: 45, mods: { haste: 10 }, icon: 'claw' },
  { id: 'scope_lens', name: '焦点镜', tier: 2, price: 45, mods: { crit: 6 }, icon: 'lens' },
  { id: 'leftovers', name: '吃剩的东西', tier: 2, price: 48, mods: { regen: 5, maxHp: 3 }, icon: 'apple' },
  { id: 'shell_bell', name: '贝壳之铃', tier: 2, price: 50, mods: { lifesteal: 4 }, icon: 'bell' },
  { id: 'rocky_helmet', name: '凸凸头盔', tier: 2, price: 46, mods: { thorns: 6, def: 6 }, icon: 'helmet' },
  { id: 'assault_vest', name: '突击背心', tier: 2, price: 48, mods: { spd: 15 }, icon: 'vest' },
  { id: 'wide_lens', name: '广角镜', tier: 2, price: 42, mods: { range: 12 }, icon: 'widelens' },
  { id: 'choice_belt', name: '讲究腰带', tier: 2, price: 50, mods: { dmgBoss: 15 }, icon: 'cbelt', tcg: true },
  { id: 'power_bracer', name: '力量护腕', tier: 2, price: 44, mods: { atk: 12, spe: -5 }, icon: 'bracer' },
  { id: 'power_lens', name: '力量镜片', tier: 2, price: 44, mods: { spa: 12, spe: -5 }, icon: 'plens' },
  { id: 'power_belt', name: '力量腰带', tier: 2, price: 42, mods: { def: 10, spd: 10, spe: -5 }, icon: 'pbelt' },
  { id: 'kings_rock', name: '王者之证', tier: 2, price: 48, mods: { stun: 8 }, icon: 'crown' },
  { id: 'bright_powder', name: '光粉', tier: 2, price: 46, mods: { dodge: 7 }, icon: 'powder' },
  { id: 'magnet_pull', name: '磁力吸引器', tier: 2, price: 36, mods: { pickup: 40, luck: 5 }, icon: 'pull' },
  { id: 'pay_day', name: '聚宝功秘籍', tier: 2, price: 52, mods: { harvest: 8, money: 5 }, icon: 'book', desc: '每波结束额外获得金钱。' },
  { id: 'thunder_stone', name: '雷之石', tier: 2, price: 40, special: 'evo_stone', only: 'pikachu', max: 1, icon: 'tstone', desc: '让皮卡丘进化为雷丘（会失去电气球加成）。' },

  // ---------- 三阶 ----------
  { id: 'choice_band', name: '讲究头带', tier: 3, price: 95, mods: { atkPct: 30, slots: -1 }, max: 1, icon: 'cband', desc: '技能栏 -1。' },
  { id: 'choice_specs', name: '讲究眼镜', tier: 3, price: 95, mods: { spaPct: 30, slots: -1 }, max: 1, icon: 'cspecs', desc: '技能栏 -1。' },
  { id: 'choice_scarf', name: '讲究围巾', tier: 3, price: 90, mods: { spePct: 30, haste: 15, slots: -1 }, max: 1, icon: 'cscarf', desc: '技能栏 -1。' },
  { id: 'life_orb', name: '生命宝珠', tier: 3, price: 100, mods: { dmg: 20, maxHp: -6 }, icon: 'orb' },
  { id: 'expert_belt', name: '达人带', tier: 3, price: 90, mods: { superEff: 25 }, icon: 'ebelt' },
  { id: 'focus_sash', name: '气势披带', tier: 3, price: 85, special: 'sash', max: 1, icon: 'sash', desc: '每波一次：受到致命伤害时保留 1 HP。' },
  { id: 'heros_cape', name: '英雄斗篷', tier: 3, price: 95, mods: { maxHp: 20, spe: -5 }, icon: 'cape', tcg: true },
  { id: 'rare_candy', name: '神奇糖果', tier: 3, price: 70, special: 'rare_candy', icon: 'candy', desc: '立即提升 1 级。' },
  { id: 'lucky_egg', name: '幸运蛋', tier: 3, price: 85, mods: { xp: 30, luck: 6 }, icon: 'egg' },
  { id: 'eviolite', name: '进化奇石', tier: 3, price: 90, special: 'eviolite', max: 1, icon: 'eviolite', desc: '尚未进化到最终形态时，物防、特防 +40%。' },
  { id: 'metronome', name: '节拍器', tier: 3, price: 92, mods: { haste: 18, crit: 3 }, icon: 'metronome' },

  // ---------- 四阶 ----------
  { id: 'master_ball', name: '大师球', tier: 4, price: 170, mods: { luck: 20, dmg: 12 }, max: 1, icon: 'masterball' },
  { id: 'rainbow_wing', name: '彩虹之羽', tier: 4, price: 180, mods: { maxHp: 15, atk: 8, def: 8, spa: 8, spd: 8, spe: 8 }, icon: 'wing' },
  { id: 'dynamax_band', name: '极巨腕带', tier: 4, price: 190, mods: { dmg: 25, range: 15 }, max: 1, icon: 'dynamax' },
  { id: 'key_stone', name: '钥石', tier: 4, price: 200, mods: { atkPct: 12, spaPct: 12, defPct: 12, spdPct: 12, spePct: 12 }, max: 1, icon: 'keystone' },
  { id: 'max_revive', name: '活力块', tier: 4, price: 150, special: 'revive', max: 1, icon: 'revive', desc: '倒下时自动以满 HP 复活一次（用后消失）。' },
  { id: 'soul_dew', name: '心之水滴', tier: 4, price: 185, mods: { spa: 20, spd: 20 }, typeMods: { psychic: 15, dragon: 15 }, icon: 'souldew' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((i) => [i.id, i]));
export const ITEM_IDS = LIST.map((i) => i.id);
