import type { Mods, TypeMods } from './stats';

/**
 * 装备道具。名称取自宝可梦系列的携带物品、树果、薰香、石板、薄荷、球、
 * 野外道具（香水/喷雾/玻璃哨）以及宝可梦卡牌（TCG）的「宝可梦道具」，
 * 加成内容按土豆兄弟的思路重新设计。
 */
export type ItemSpecial =
  | 'sash' | 'revive' | 'rare_candy' | 'evo_stone' | 'eviolite' | 'everstone'
  | 'focus_band' | 'goggles' | 'light_clay' | 'big_root' | 'light_ball';

export type ItemGroup = 'held' | 'type' | 'berry' | 'incense' | 'field' | 'ball' | 'vitamin' | 'mint' | 'plate' | 'tcg' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  price: number;
  mods?: Partial<Mods>;
  typeMods?: TypeMods;
  max?: number;
  special?: ItemSpecial;
  /** 复活类道具复活时的 HP 比例 */
  reviveHp?: number;
  /** 只对某个精灵系列出现 */
  only?: string;
  icon: string;
  group: ItemGroup;
  desc?: string;
}

const I = (d: ItemDef) => d;

const LIST: ItemDef[] = [
  // ======================= 一阶 =======================
  I({ id: 'muscle_band', name: '力量头带', tier: 1, price: 20, mods: { dmgMinion: 8 }, icon: 'headband', group: 'tcg' }),
  I({ id: 'big_charm', name: '大护符', tier: 1, price: 18, mods: { maxHp: 5 }, icon: 'charm', group: 'tcg' }),
  I({ id: 'float_stone', name: '浮石', tier: 1, price: 18, mods: { spe: 8 }, icon: 'stone', group: 'tcg' }),
  I({ id: 'air_balloon', name: '气球', tier: 1, price: 20, mods: { dodge: 4 }, icon: 'balloon', group: 'tcg' }),
  I({ id: 'exp_share', name: '学习装置', tier: 1, price: 24, mods: { xp: 15, pickup: 20 }, icon: 'expshare', group: 'tcg' }),
  // 属性强化（每种属性一件）
  I({ id: 'charcoal', name: '木炭', tier: 1, price: 20, typeMods: { fire: 12 }, icon: 'charcoal', group: 'type' }),
  I({ id: 'mystic_water', name: '神秘水滴', tier: 1, price: 20, typeMods: { water: 12 }, icon: 'drop', group: 'type' }),
  I({ id: 'miracle_seed', name: '奇迹种子', tier: 1, price: 20, typeMods: { grass: 12 }, icon: 'seed', group: 'type' }),
  I({ id: 'magnet', name: '磁铁', tier: 1, price: 20, typeMods: { electric: 12 }, icon: 'magnet', group: 'type' }),
  I({ id: 'twisted_spoon', name: '弯曲的汤匙', tier: 1, price: 20, typeMods: { psychic: 12 }, icon: 'spoon', group: 'type' }),
  I({ id: 'silk_scarf', name: '丝绸围巾', tier: 1, price: 18, typeMods: { normal: 12 }, icon: 'scarf', group: 'type' }),
  I({ id: 'poison_barb', name: '毒针', tier: 1, price: 18, typeMods: { poison: 12 }, icon: 'barb', group: 'type' }),
  I({ id: 'dragon_fang', name: '龙之牙', tier: 1, price: 18, typeMods: { dragon: 12 }, icon: 'fang', group: 'type' }),
  I({ id: 'metal_coat', name: '金属膜', tier: 1, price: 20, typeMods: { steel: 12 }, mods: { def: 3 }, icon: 'coat', group: 'type' }),
  I({ id: 'never_melt_ice', name: '不融冰', tier: 1, price: 18, typeMods: { ice: 12 }, icon: 'ice', group: 'type' }),
  I({ id: 'spell_tag', name: '诅咒之符', tier: 1, price: 18, typeMods: { ghost: 12 }, icon: 'tag_ghost', group: 'type' }),
  I({ id: 'sharp_beak', name: '锐利鸟嘴', tier: 1, price: 18, typeMods: { flying: 12 }, icon: 'beak', group: 'type' }),
  I({ id: 'soft_sand', name: '柔软沙子', tier: 1, price: 18, typeMods: { ground: 12 }, icon: 'sand', group: 'type' }),
  I({ id: 'hard_stone', name: '硬石头', tier: 1, price: 18, typeMods: { rock: 12 }, icon: 'hardstone', group: 'type' }),
  I({ id: 'black_glasses', name: '黑色眼镜', tier: 1, price: 18, typeMods: { dark: 12 }, icon: 'shades', group: 'type' }),
  // 营养剂
  I({ id: 'hp_up', name: 'HP增强剂', tier: 1, price: 20, mods: { maxHp: 6 }, icon: 'vitamin_hp', group: 'vitamin' }),
  I({ id: 'protein', name: '攻击增强剂', tier: 1, price: 22, mods: { atk: 6 }, icon: 'vitamin_r', group: 'vitamin' }),
  I({ id: 'iron', name: '防御增强剂', tier: 1, price: 20, mods: { def: 6 }, icon: 'vitamin_g', group: 'vitamin' }),
  I({ id: 'calcium', name: '特攻增强剂', tier: 1, price: 22, mods: { spa: 6 }, icon: 'vitamin_b', group: 'vitamin' }),
  I({ id: 'zinc', name: '特防增强剂', tier: 1, price: 20, mods: { spd: 6 }, icon: 'vitamin_y', group: 'vitamin' }),
  I({ id: 'carbos', name: '速度增强剂', tier: 1, price: 20, mods: { spe: 7 }, icon: 'vitamin_spe', group: 'vitamin' }),
  // 树果
  I({ id: 'oran_berry', name: '橙橙果', tier: 1, price: 16, mods: { regen: 3 }, icon: 'berry', group: 'berry' }),
  I({ id: 'liechi_berry', name: '枝荔果', tier: 1, price: 15, mods: { atk: 5, maxHp: 2 }, icon: 'berry_red', group: 'berry' }),
  I({ id: 'petaya_berry', name: '龙火果', tier: 1, price: 15, mods: { spa: 5, maxHp: 2 }, icon: 'berry_pink', group: 'berry' }),
  I({ id: 'ganlon_berry', name: '龙睛果', tier: 1, price: 15, mods: { def: 5, regen: 1 }, icon: 'berry_purple', group: 'berry' }),
  I({ id: 'apicot_berry', name: '杏仔果', tier: 1, price: 15, mods: { spd: 5, regen: 1 }, icon: 'berry_yellow', group: 'berry' }),
  I({ id: 'salac_berry', name: '沙鳞果', tier: 1, price: 15, mods: { spe: 6, dodge: 1 }, icon: 'berry_green', group: 'berry' }),
  I({ id: 'leppa_berry', name: '苹野果', tier: 1, price: 16, mods: { haste: 5 }, icon: 'berry_orange', group: 'berry' }),
  I({ id: 'jaboca_berry', name: '嘉珍果', tier: 1, price: 16, mods: { thorns: 4, def: 2 }, icon: 'berry_gold', group: 'berry' }),
  // 薰香
  I({ id: 'sea_incense', name: '海潮薰香', tier: 1, price: 18, typeMods: { water: 10 }, mods: { spd: 3 }, icon: 'incense_blue', group: 'incense' }),
  I({ id: 'rose_incense', name: '花朵薰香', tier: 1, price: 18, typeMods: { grass: 10 }, mods: { regen: 1 }, icon: 'incense_pink', group: 'incense' }),
  I({ id: 'odd_incense', name: '奇异薰香', tier: 1, price: 18, typeMods: { psychic: 10 }, mods: { spa: 3 }, icon: 'incense_purple', group: 'incense' }),
  I({ id: 'rock_incense', name: '岩石薰香', tier: 1, price: 18, typeMods: { rock: 10 }, mods: { def: 3 }, icon: 'incense_brown', group: 'incense' }),
  I({ id: 'lax_incense', name: '悠闲薰香', tier: 1, price: 20, mods: { dodge: 6, spe: -4 }, icon: 'incense_white', group: 'incense' }),
  I({ id: 'full_incense', name: '满载薰香', tier: 1, price: 20, mods: { maxHp: 12, spe: -6 }, icon: 'incense_orange', group: 'incense' }),
  I({ id: 'pure_incense', name: '清净薰香', tier: 1, price: 18, mods: { enemies: -8, regen: 2 }, icon: 'incense_green', group: 'incense', desc: '野生宝可梦更不容易靠近。' }),
  // 野外道具：增减敌人数量
  I({ id: 'lure', name: '引虫香水', tier: 1, price: 18, mods: { enemies: 12, xp: 5 }, icon: 'perfume_pink', group: 'field', desc: '吸引更多野生宝可梦：风险更高，收获也更多。' }),
  I({ id: 'repel', name: '除虫喷雾', tier: 1, price: 18, mods: { enemies: -10 }, icon: 'spray_purple', group: 'field', desc: '让弱小的野生宝可梦不再靠近。' }),
  I({ id: 'white_flute', name: '白色玻璃哨', tier: 1, price: 16, mods: { enemies: 8, luck: 5 }, icon: 'flute_white', group: 'field' }),
  I({ id: 'black_flute', name: '黑色玻璃哨', tier: 1, price: 16, mods: { enemies: -8, luck: 3 }, icon: 'flute_black', group: 'field' }),
  I({ id: 'poke_ball', name: '精灵球', tier: 1, price: 16, mods: { luck: 5 }, icon: 'ball_poke', group: 'ball' }),
  I({ id: 'smoke_ball', name: '烟雾球', tier: 1, price: 18, mods: { dodge: 4, spe: 4 }, icon: 'smokeball', group: 'held' }),
  I({ id: 'poke_doll', name: '皮皮玩偶', tier: 1, price: 18, mods: { dodge: 3, maxHp: 3 }, icon: 'doll', group: 'field' }),
  I({ id: 'amulet_coin', name: '护符金币', tier: 1, price: 24, mods: { money: 10 }, icon: 'coin', group: 'held' }),

  // ======================= 二阶 =======================
  I({ id: 'quick_claw', name: '先制之爪', tier: 2, price: 45, mods: { haste: 10 }, icon: 'claw', group: 'held' }),
  I({ id: 'scope_lens', name: '焦点镜', tier: 2, price: 45, mods: { crit: 6 }, icon: 'lens', group: 'held' }),
  I({ id: 'razor_claw', name: '锐利之爪', tier: 2, price: 44, mods: { crit: 4, stun: 4 }, icon: 'razorclaw', group: 'held' }),
  I({ id: 'leftovers', name: '吃剩的东西', tier: 2, price: 48, mods: { regen: 5, maxHp: 3 }, icon: 'apple', group: 'held' }),
  I({ id: 'black_sludge', name: '黑色污泥', tier: 2, price: 46, mods: { regen: 6 }, typeMods: { poison: 6 }, icon: 'sludge', group: 'held' }),
  I({ id: 'shell_bell', name: '贝壳之铃', tier: 2, price: 50, mods: { lifesteal: 4 }, icon: 'bell', group: 'held' }),
  I({ id: 'big_root', name: '大根茎', tier: 2, price: 44, mods: { lifesteal: 2 }, special: 'big_root', max: 1, icon: 'root', group: 'held', desc: '回复类技能与吸取类效果 +30%。' }),
  I({ id: 'rocky_helmet', name: '凸凸头盔', tier: 2, price: 46, mods: { thorns: 6, def: 6 }, icon: 'helmet', group: 'held' }),
  I({ id: 'assault_vest', name: '突击背心', tier: 2, price: 48, mods: { spd: 15 }, icon: 'vest', group: 'held' }),
  I({ id: 'light_clay', name: '光之黏土', tier: 2, price: 42, mods: { def: 4, spd: 4 }, special: 'light_clay', max: 1, icon: 'clay', group: 'held', desc: '护盾类技能的护盾 +60%。' }),
  I({ id: 'wide_lens', name: '广角镜', tier: 2, price: 42, mods: { range: 12 }, icon: 'widelens', group: 'held' }),
  I({ id: 'choice_belt', name: '讲究腰带', tier: 2, price: 50, mods: { dmgBoss: 15 }, icon: 'belt_gold', group: 'tcg' }),
  I({ id: 'power_bracer', name: '力量护腕', tier: 2, price: 44, mods: { atk: 12, spe: -5 }, icon: 'bracer', group: 'held' }),
  I({ id: 'power_lens', name: '力量镜片', tier: 2, price: 44, mods: { spa: 12, spe: -5 }, icon: 'plens', group: 'held' }),
  I({ id: 'iron_ball', name: '黑色铁球', tier: 2, price: 42, mods: { def: 15, spd: 15, spe: -12 }, icon: 'ironball', group: 'held' }),
  I({ id: 'lagging_tail', name: '后攻之尾', tier: 2, price: 44, mods: { dmg: 14, spe: -10 }, icon: 'tail', group: 'held' }),
  I({ id: 'kings_rock', name: '王者之证', tier: 2, price: 48, mods: { stun: 8 }, icon: 'crown', group: 'held' }),
  I({ id: 'bright_powder', name: '光粉', tier: 2, price: 46, mods: { dodge: 7 }, icon: 'powder', group: 'held' }),
  I({ id: 'focus_band', name: '气势头带', tier: 2, price: 46, special: 'focus_band', max: 1, mods: { maxHp: 4 }, icon: 'headband_orange', group: 'held', desc: '受到致命伤害时有 15% 几率保留 1 HP（可反复触发）。' }),
  I({ id: 'safety_goggles', name: '防尘护目镜', tier: 2, price: 40, special: 'goggles', max: 1, mods: { dodge: 2 }, icon: 'goggles', group: 'held', desc: '不会被孢子减速，也不受毒雾伤害。' }),
  I({ id: 'quick_powder', name: '速度粉', tier: 2, price: 40, mods: { spe: 14 }, icon: 'powder_blue', group: 'held' }),
  I({ id: 'metal_powder', name: '金属粉', tier: 2, price: 40, mods: { def: 12, spd: 6 }, icon: 'powder_gray', group: 'held' }),
  I({ id: 'thick_club', name: '粗骨头', tier: 2, price: 46, mods: { atk: 16, spe: -3 }, icon: 'bone', group: 'held' }),
  I({ id: 'dowsing_machine', name: '探宝器', tier: 2, price: 36, mods: { pickup: 40, luck: 6 }, icon: 'dowsing', group: 'key' }),
  I({ id: 'big_nugget', name: '大金珠', tier: 2, price: 52, mods: { harvest: 8, money: 5 }, icon: 'nugget', group: 'held', desc: '每波结束额外获得金钱。' }),
  I({ id: 'luck_incense', name: '幸运薰香', tier: 2, price: 50, mods: { money: 20, luck: 4 }, icon: 'incense_gold', group: 'incense' }),
  I({ id: 'super_lure', name: '白银香水', tier: 2, price: 38, mods: { enemies: 20, money: 8 }, icon: 'perfume_silver', group: 'field', desc: '吸引大量野生宝可梦。' }),
  I({ id: 'super_repel', name: '白银喷雾', tier: 2, price: 38, mods: { enemies: -15, dodge: 2 }, icon: 'spray_silver', group: 'field' }),
  I({ id: 'cleanse_tag', name: '洁净之符', tier: 2, price: 42, mods: { enemies: -12, dmgBoss: 8 }, icon: 'tag_clean', group: 'held' }),
  I({ id: 'great_ball', name: '超级球', tier: 2, price: 36, mods: { luck: 10 }, icon: 'ball_great', group: 'ball' }),
  I({ id: 'sitrus_berry', name: '文柚果', tier: 2, price: 40, mods: { maxHp: 8, regen: 3 }, icon: 'berry_yellow', group: 'berry' }),
  I({ id: 'lansat_berry', name: '兰萨果', tier: 2, price: 42, mods: { crit: 5, haste: 3 }, icon: 'berry_red', group: 'berry' }),
  I({ id: 'silver_bottle_cap', name: '银色王冠', tier: 2, price: 50, mods: { atk: 4, def: 4, spa: 4, spd: 4, spe: 4 }, icon: 'cap_silver', group: 'held', desc: '极限特训：全部基础属性小幅提升。' }),
  // 性格薄荷：一项提升、一项降低
  I({ id: 'adamant_mint', name: '固执薄荷', tier: 2, price: 40, mods: { atkPct: 12, spaPct: -8 }, max: 1, icon: 'mint_red', group: 'mint' }),
  I({ id: 'modest_mint', name: '内敛薄荷', tier: 2, price: 40, mods: { spaPct: 12, atkPct: -8 }, max: 1, icon: 'mint_blue', group: 'mint' }),
  I({ id: 'timid_mint', name: '胆小薄荷', tier: 2, price: 40, mods: { spePct: 12, atkPct: -6 }, max: 1, icon: 'mint_cyan', group: 'mint' }),
  I({ id: 'bold_mint', name: '大胆薄荷', tier: 2, price: 40, mods: { defPct: 15, atkPct: -6 }, max: 1, icon: 'mint_green', group: 'mint' }),
  I({ id: 'calm_mint', name: '温和薄荷', tier: 2, price: 40, mods: { spdPct: 15, atkPct: -6 }, max: 1, icon: 'mint_yellow', group: 'mint' }),
  // 石板：更强的属性强化
  I({ id: 'flame_plate', name: '火球石板', tier: 2, price: 46, typeMods: { fire: 20 }, icon: 'plate_fire', group: 'plate' }),
  I({ id: 'splash_plate', name: '水滴石板', tier: 2, price: 46, typeMods: { water: 20 }, icon: 'plate_water', group: 'plate' }),
  I({ id: 'meadow_plate', name: '碧绿石板', tier: 2, price: 46, typeMods: { grass: 20 }, icon: 'plate_grass', group: 'plate' }),
  I({ id: 'zap_plate', name: '雷电石板', tier: 2, price: 46, typeMods: { electric: 20 }, icon: 'plate_electric', group: 'plate' }),
  I({ id: 'mind_plate', name: '神奇石板', tier: 2, price: 46, typeMods: { psychic: 20 }, icon: 'plate_psychic', group: 'plate' }),
  I({ id: 'draco_plate', name: '龙之石板', tier: 2, price: 42, typeMods: { dragon: 20 }, icon: 'plate_dragon', group: 'plate' }),
  I({ id: 'spooky_plate', name: '妖怪石板', tier: 2, price: 42, typeMods: { ghost: 20 }, icon: 'plate_ghost', group: 'plate' }),
  I({ id: 'fist_plate', name: '拳头石板', tier: 2, price: 42, typeMods: { fighting: 20 }, icon: 'plate_fighting', group: 'plate' }),
  I({ id: 'icicle_plate', name: '冰柱石板', tier: 2, price: 42, typeMods: { ice: 20 }, icon: 'plate_ice', group: 'plate' }),
  I({ id: 'iron_plate', name: '钢铁石板', tier: 2, price: 42, typeMods: { steel: 20 }, icon: 'plate_steel', group: 'plate' }),
  // 进化相关
  I({ id: 'thunder_stone', name: '雷之石', tier: 2, price: 40, special: 'evo_stone', only: 'pikachu', max: 1, icon: 'tstone', group: 'key', desc: '让皮卡丘进化为雷丘（会失去电气球加成）。' }),
  I({ id: 'light_ball', name: '电气球', tier: 2, price: 46, special: 'light_ball', only: 'pikachu', max: 1, icon: 'lightball', group: 'held', desc: '皮卡丘未进化时物攻、特攻 +20%。' }),
  I({ id: 'everstone', name: '不变之石', tier: 2, price: 36, special: 'everstone', max: 1, icon: 'everstone', group: 'held', desc: '携带后不会再进化；尚未进化到最终形态时，全伤害 +10%、经验 +15%。' }),

  // ======================= 三阶 =======================
  I({ id: 'choice_band', name: '讲究头带', tier: 3, price: 95, mods: { atkPct: 30, slots: -1 }, max: 1, icon: 'headband_gold', group: 'held', desc: '技能栏 -1。' }),
  I({ id: 'choice_specs', name: '讲究眼镜', tier: 3, price: 95, mods: { spaPct: 30, slots: -1 }, max: 1, icon: 'cspecs', group: 'held', desc: '技能栏 -1。' }),
  I({ id: 'choice_scarf', name: '讲究围巾', tier: 3, price: 90, mods: { spePct: 30, haste: 15, slots: -1 }, max: 1, icon: 'scarf_blue', group: 'held', desc: '技能栏 -1。' }),
  I({ id: 'life_orb', name: '生命宝珠', tier: 3, price: 100, mods: { dmg: 20, maxHp: -6 }, icon: 'orb', group: 'held' }),
  I({ id: 'expert_belt', name: '达人带', tier: 3, price: 90, mods: { superEff: 40, dmg: 4 }, icon: 'belt_blue', group: 'held', desc: '效果拔群时伤害更高。' }),
  I({ id: 'weakness_policy', name: '弱点保险', tier: 3, price: 92, mods: { atkPct: 10, spaPct: 10, defPct: -6, spdPct: -6 }, icon: 'policy', group: 'held' }),
  I({ id: 'focus_sash', name: '气势披带', tier: 3, price: 85, special: 'sash', max: 1, icon: 'sash', group: 'held', desc: '每波一次：受到致命伤害时保留 1 HP。' }),
  I({ id: 'heros_cape', name: '英雄斗篷', tier: 3, price: 95, mods: { maxHp: 20, spe: -5 }, icon: 'cape', group: 'tcg' }),
  I({ id: 'rare_candy', name: '神奇糖果', tier: 3, price: 70, special: 'rare_candy', icon: 'candy', group: 'held', desc: '立即提升 1 级。' }),
  I({ id: 'lucky_egg', name: '幸运蛋', tier: 3, price: 85, mods: { xp: 30, luck: 6 }, icon: 'egg', group: 'held' }),
  I({ id: 'eviolite', name: '进化奇石', tier: 3, price: 90, special: 'eviolite', max: 1, icon: 'eviolite', group: 'held', desc: '尚未进化到最终形态时，物防、特防 +40%。' }),
  I({ id: 'metronome', name: '节拍器', tier: 3, price: 92, mods: { haste: 18, crit: 3 }, icon: 'metronome', group: 'held' }),
  I({ id: 'max_lure', name: '黄金香水', tier: 3, price: 80, mods: { enemies: 30, money: 12, xp: 12 }, icon: 'perfume_gold', group: 'field', desc: '吸引成群的野生宝可梦。' }),
  I({ id: 'max_repel', name: '黄金喷雾', tier: 3, price: 80, mods: { enemies: -22, maxHp: 5 }, icon: 'spray_gold', group: 'field' }),
  I({ id: 'ultra_ball', name: '高级球', tier: 3, price: 78, mods: { luck: 15, harvest: 5 }, icon: 'ball_ultra', group: 'ball' }),
  I({ id: 'bicycle', name: '自行车', tier: 3, price: 88, mods: { spePct: 15, dodge: 2 }, max: 1, icon: 'bike', group: 'key' }),
  I({ id: 'starf_berry', name: '星桃果', tier: 3, price: 95, mods: { atk: 6, def: 6, spa: 6, spd: 6, spe: 6, maxHp: 4 }, icon: 'berry_star', group: 'berry' }),
  I({ id: 'revive', name: '活力碎片', tier: 3, price: 80, special: 'revive', reviveHp: 0.5, max: 1, icon: 'revive_half', group: 'held', desc: '倒下时自动以一半 HP 复活一次（用后消失）。' }),

  // ======================= 四阶 =======================
  I({ id: 'master_ball', name: '大师球', tier: 4, price: 170, mods: { luck: 20, dmg: 12 }, max: 1, icon: 'masterball', group: 'ball' }),
  I({ id: 'rainbow_wing', name: '彩虹之羽', tier: 4, price: 180, mods: { maxHp: 15, atk: 8, def: 8, spa: 8, spd: 8, spe: 8 }, icon: 'wing', group: 'held' }),
  I({ id: 'dynamax_band', name: '极巨腕带', tier: 4, price: 190, mods: { dmg: 25, range: 15 }, max: 1, icon: 'dynamax', group: 'key' }),
  I({ id: 'key_stone', name: '钥石', tier: 4, price: 200, mods: { atkPct: 12, spaPct: 12, defPct: 12, spdPct: 12, spePct: 12 }, max: 1, icon: 'keystone', group: 'key' }),
  I({ id: 'max_revive', name: '活力块', tier: 4, price: 150, special: 'revive', reviveHp: 1, max: 1, icon: 'revive', group: 'held', desc: '倒下时自动以满 HP 复活一次（用后消失）。' }),
  I({ id: 'soul_dew', name: '心之水滴', tier: 4, price: 185, mods: { spa: 20, spd: 20 }, typeMods: { psychic: 15, dragon: 15 }, icon: 'souldew', group: 'held' }),
  I({ id: 'gold_bottle_cap', name: '金色王冠', tier: 4, price: 190, mods: { atk: 12, def: 12, spa: 12, spd: 12, spe: 12 }, icon: 'cap_gold', group: 'held', desc: '极限特训：全部基础属性大幅提升。' }),
  I({ id: 'shiny_charm', name: '闪耀护符', tier: 4, price: 175, mods: { luck: 25, xp: 15, money: 15 }, max: 1, icon: 'shinycharm', group: 'key' }),
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((i) => [i.id, i]));
export const ITEM_IDS = LIST.map((i) => i.id);

export const GROUP_NAME: Record<ItemGroup, string> = {
  held: '携带物品', type: '属性道具', berry: '树果', incense: '薰香', field: '野外道具', ball: '精灵球',
  vitamin: '营养剂', mint: '薄荷', plate: '石板', tcg: '宝可梦卡牌 · 宝可梦道具', key: '重要物品',
};
