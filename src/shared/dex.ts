/**
 * 初代 151 只宝可梦的基础数据：中文名、属性、种族值（第六世代以后的数值），以及进化族。
 * pokemon.ts 用这些数据生成可以游玩的宝可梦（技能表、特性、进化等级）。
 */
import type { PType } from './types';

/** [图鉴编号, 中文名, 属性, HP, 物攻, 物防, 特攻, 特防, 速度] */
type Row = [number, string, string, number, number, number, number, number, number];

const ROWS: Row[] = [
  [1, '妙蛙种子', 'grass/poison', 45, 49, 49, 65, 65, 45], [2, '妙蛙草', 'grass/poison', 60, 62, 63, 80, 80, 60], [3, '妙蛙花', 'grass/poison', 80, 82, 83, 100, 100, 80],
  [4, '小火龙', 'fire', 39, 52, 43, 60, 50, 65], [5, '火恐龙', 'fire', 58, 64, 58, 80, 65, 80], [6, '喷火龙', 'fire/flying', 78, 84, 78, 109, 85, 100],
  [7, '杰尼龟', 'water', 44, 48, 65, 50, 64, 43], [8, '卡咪龟', 'water', 59, 63, 80, 65, 80, 58], [9, '水箭龟', 'water', 79, 83, 100, 85, 105, 78],
  [10, '绿毛虫', 'bug', 45, 30, 35, 20, 20, 45], [11, '铁甲蛹', 'bug', 50, 20, 55, 25, 25, 30], [12, '巴大蝶', 'bug/flying', 60, 45, 50, 90, 80, 70],
  [13, '独角虫', 'bug/poison', 40, 35, 30, 20, 20, 50], [14, '铁壳蛹', 'bug/poison', 45, 25, 50, 25, 25, 35], [15, '大针蜂', 'bug/poison', 65, 90, 40, 45, 80, 75],
  [16, '波波', 'normal/flying', 40, 45, 40, 35, 35, 56], [17, '比比鸟', 'normal/flying', 63, 60, 55, 50, 50, 71], [18, '大比鸟', 'normal/flying', 83, 80, 75, 70, 70, 101],
  [19, '小拉达', 'normal', 30, 56, 35, 25, 35, 72], [20, '拉达', 'normal', 55, 81, 60, 50, 70, 97],
  [21, '烈雀', 'normal/flying', 40, 60, 30, 31, 31, 70], [22, '大嘴雀', 'normal/flying', 65, 90, 65, 61, 61, 100],
  [23, '阿柏蛇', 'poison', 35, 60, 44, 40, 54, 55], [24, '阿柏怪', 'poison', 60, 95, 69, 65, 79, 80],
  [25, '皮卡丘', 'electric', 35, 55, 40, 50, 50, 90], [26, '雷丘', 'electric', 60, 90, 55, 90, 80, 110],
  [27, '穿山鼠', 'ground', 50, 75, 85, 20, 30, 40], [28, '穿山王', 'ground', 75, 100, 110, 45, 55, 65],
  [29, '尼多兰', 'poison', 55, 47, 52, 40, 40, 41], [30, '尼多娜', 'poison', 70, 62, 67, 55, 55, 56], [31, '尼多后', 'poison/ground', 90, 92, 87, 75, 85, 76],
  [32, '尼多朗', 'poison', 46, 57, 40, 40, 40, 50], [33, '尼多力诺', 'poison', 61, 72, 57, 55, 55, 65], [34, '尼多王', 'poison/ground', 81, 102, 77, 85, 75, 85],
  [35, '皮皮', 'fairy', 70, 45, 48, 60, 65, 35], [36, '皮可西', 'fairy', 95, 70, 73, 95, 90, 60],
  [37, '六尾', 'fire', 38, 41, 40, 50, 65, 65], [38, '九尾', 'fire', 73, 76, 75, 81, 100, 100],
  [39, '胖丁', 'normal/fairy', 115, 45, 20, 45, 25, 20], [40, '胖可丁', 'normal/fairy', 140, 70, 45, 85, 50, 45],
  [41, '超音蝠', 'poison/flying', 40, 45, 35, 30, 40, 55], [42, '大嘴蝠', 'poison/flying', 75, 80, 70, 65, 75, 90],
  [43, '走路草', 'grass/poison', 45, 50, 55, 75, 65, 30], [44, '臭臭花', 'grass/poison', 60, 65, 70, 85, 75, 40], [45, '霸王花', 'grass/poison', 75, 80, 85, 110, 90, 50],
  [46, '派拉斯', 'bug/grass', 35, 70, 55, 45, 55, 25], [47, '派拉斯特', 'bug/grass', 60, 95, 80, 60, 80, 30],
  [48, '毛球', 'bug/poison', 60, 55, 50, 40, 55, 45], [49, '摩鲁蛾', 'bug/poison', 70, 65, 60, 90, 75, 90],
  [50, '地鼠', 'ground', 10, 55, 25, 35, 45, 95], [51, '三地鼠', 'ground', 35, 100, 50, 50, 70, 120],
  [52, '喵喵', 'normal', 40, 45, 35, 40, 40, 90], [53, '猫老大', 'normal', 65, 70, 60, 65, 65, 115],
  [54, '可达鸭', 'water', 50, 52, 48, 65, 50, 55], [55, '哥达鸭', 'water', 80, 82, 78, 95, 80, 85],
  [56, '猴怪', 'fighting', 40, 80, 35, 35, 45, 70], [57, '火爆猴', 'fighting', 65, 105, 60, 60, 70, 95],
  [58, '卡蒂狗', 'fire', 55, 70, 45, 70, 50, 60], [59, '风速狗', 'fire', 90, 110, 80, 100, 80, 95],
  [60, '蚊香蝌蚪', 'water', 40, 50, 40, 40, 40, 90], [61, '蚊香君', 'water', 65, 65, 65, 50, 50, 90], [62, '蚊香泳士', 'water/fighting', 90, 95, 95, 70, 90, 70],
  [63, '凯西', 'psychic', 25, 20, 15, 105, 55, 90], [64, '勇基拉', 'psychic', 40, 35, 30, 120, 70, 105], [65, '胡地', 'psychic', 55, 50, 45, 135, 95, 120],
  [66, '腕力', 'fighting', 70, 80, 50, 35, 35, 35], [67, '豪力', 'fighting', 80, 100, 70, 50, 60, 45], [68, '怪力', 'fighting', 90, 130, 80, 65, 85, 55],
  [69, '喇叭芽', 'grass/poison', 50, 75, 35, 70, 30, 40], [70, '口呆花', 'grass/poison', 65, 90, 50, 85, 45, 55], [71, '大食花', 'grass/poison', 80, 105, 65, 100, 70, 70],
  [72, '玛瑙水母', 'water/poison', 40, 40, 35, 50, 100, 70], [73, '毒刺水母', 'water/poison', 80, 70, 65, 80, 120, 100],
  [74, '小拳石', 'rock/ground', 40, 80, 100, 30, 30, 20], [75, '隆隆石', 'rock/ground', 55, 95, 115, 45, 45, 35], [76, '隆隆岩', 'rock/ground', 80, 120, 130, 55, 65, 45],
  [77, '小火马', 'fire', 50, 85, 55, 65, 65, 90], [78, '烈焰马', 'fire', 65, 100, 70, 80, 80, 105],
  [79, '呆呆兽', 'water/psychic', 90, 65, 65, 40, 40, 15], [80, '呆壳兽', 'water/psychic', 95, 75, 110, 100, 80, 30],
  [81, '小磁怪', 'electric/steel', 25, 35, 70, 95, 55, 45], [82, '三合一磁怪', 'electric/steel', 50, 60, 95, 120, 70, 70],
  [83, '大葱鸭', 'normal/flying', 52, 90, 55, 58, 62, 60],
  [84, '嘟嘟', 'normal/flying', 35, 85, 45, 35, 35, 75], [85, '嘟嘟利', 'normal/flying', 60, 110, 70, 60, 60, 110],
  [86, '小海狮', 'water', 65, 45, 55, 45, 70, 45], [87, '白海狮', 'water/ice', 90, 70, 80, 70, 95, 70],
  [88, '臭泥', 'poison', 80, 80, 50, 40, 50, 25], [89, '臭臭泥', 'poison', 105, 105, 75, 65, 100, 50],
  [90, '大舌贝', 'water', 30, 65, 100, 45, 25, 40], [91, '刺甲贝', 'water/ice', 50, 95, 180, 85, 45, 70],
  [92, '鬼斯', 'ghost/poison', 30, 35, 30, 100, 35, 80], [93, '鬼斯通', 'ghost/poison', 45, 50, 45, 115, 55, 95], [94, '耿鬼', 'ghost/poison', 60, 65, 60, 130, 75, 110],
  [95, '大岩蛇', 'rock/ground', 35, 45, 160, 30, 45, 70],
  [96, '催眠貘', 'psychic', 60, 48, 45, 43, 90, 42], [97, '引梦貘人', 'psychic', 85, 73, 70, 73, 115, 67],
  [98, '大钳蟹', 'water', 30, 105, 90, 25, 25, 50], [99, '巨钳蟹', 'water', 55, 130, 115, 50, 50, 75],
  [100, '霹雳电球', 'electric', 40, 30, 50, 55, 55, 100], [101, '顽皮雷弹', 'electric', 60, 50, 70, 80, 80, 150],
  [102, '蛋蛋', 'grass/psychic', 60, 40, 80, 60, 45, 40], [103, '椰蛋树', 'grass/psychic', 95, 95, 85, 125, 75, 55],
  [104, '卡拉卡拉', 'ground', 50, 50, 95, 40, 50, 35], [105, '嘎啦嘎啦', 'ground', 60, 80, 110, 50, 80, 45],
  [106, '飞腿郎', 'fighting', 50, 120, 53, 35, 110, 87], [107, '快拳郎', 'fighting', 50, 105, 79, 35, 110, 76],
  [108, '大舌头', 'normal', 90, 55, 75, 60, 75, 30],
  [109, '瓦斯弹', 'poison', 40, 65, 95, 60, 45, 35], [110, '双弹瓦斯', 'poison', 65, 90, 120, 85, 70, 60],
  [111, '独角犀牛', 'ground/rock', 80, 85, 95, 30, 30, 25], [112, '钻角犀兽', 'ground/rock', 105, 130, 120, 45, 45, 40],
  [113, '吉利蛋', 'normal', 250, 5, 5, 35, 105, 50],
  [114, '蔓藤怪', 'grass', 65, 55, 115, 100, 40, 60],
  [115, '袋兽', 'normal', 105, 95, 80, 40, 80, 90],
  [116, '墨海马', 'water', 30, 40, 70, 70, 25, 60], [117, '海刺龙', 'water', 55, 65, 95, 95, 45, 85],
  [118, '角金鱼', 'water', 45, 67, 60, 35, 50, 63], [119, '金鱼王', 'water', 80, 92, 65, 65, 80, 68],
  [120, '海星星', 'water', 30, 45, 55, 70, 55, 85], [121, '宝石海星', 'water/psychic', 60, 75, 85, 100, 85, 115],
  [122, '魔墙人偶', 'psychic/fairy', 40, 45, 65, 100, 120, 90],
  [123, '飞天螳螂', 'bug/flying', 70, 110, 80, 55, 80, 105],
  [124, '迷唇姐', 'ice/psychic', 65, 50, 35, 115, 95, 95],
  [125, '电击兽', 'electric', 65, 83, 57, 95, 85, 105],
  [126, '鸭嘴火兽', 'fire', 65, 95, 57, 100, 85, 93],
  [127, '凯罗斯', 'bug', 65, 125, 100, 55, 70, 85],
  [128, '肯泰罗', 'normal', 75, 100, 95, 40, 70, 110],
  [129, '鲤鱼王', 'water', 20, 10, 55, 15, 20, 80], [130, '暴鲤龙', 'water/flying', 95, 125, 79, 60, 100, 81],
  [131, '拉普拉斯', 'water/ice', 130, 85, 80, 85, 95, 60],
  [132, '百变怪', 'normal', 48, 48, 48, 48, 48, 48],
  [133, '伊布', 'normal', 55, 55, 50, 45, 65, 55], [134, '水伊布', 'water', 130, 65, 60, 110, 95, 65],
  [135, '雷伊布', 'electric', 65, 65, 60, 110, 95, 130], [136, '火伊布', 'fire', 65, 130, 60, 95, 110, 65],
  [137, '多边兽', 'normal', 65, 60, 70, 85, 75, 40],
  [138, '菊石兽', 'rock/water', 35, 40, 100, 90, 55, 35], [139, '多刺菊石兽', 'rock/water', 70, 60, 125, 115, 70, 55],
  [140, '化石盔', 'rock/water', 30, 80, 90, 55, 45, 55], [141, '镰刀盔', 'rock/water', 60, 115, 105, 65, 70, 80],
  [142, '化石翼龙', 'rock/flying', 80, 105, 65, 60, 75, 130],
  [143, '卡比兽', 'normal', 160, 110, 65, 65, 110, 30],
  [144, '急冻鸟', 'ice/flying', 90, 85, 100, 95, 125, 85], [145, '闪电鸟', 'electric/flying', 90, 90, 85, 125, 90, 100], [146, '火焰鸟', 'fire/flying', 90, 100, 90, 125, 85, 90],
  [147, '迷你龙', 'dragon', 41, 64, 45, 50, 50, 50], [148, '哈克龙', 'dragon', 61, 84, 65, 70, 70, 70], [149, '快龙', 'dragon/flying', 91, 134, 95, 100, 100, 80],
  [150, '超梦', 'psychic', 106, 110, 90, 154, 90, 130], [151, '梦幻', 'psychic', 100, 100, 100, 100, 100, 100],
];

export interface DexEntry { dex: number; name: string; types: PType[]; hp: number; atk: number; def: number; spa: number; spd: number; spe: number; bst: number }

export const DEX: Record<number, DexEntry> = Object.fromEntries(ROWS.map(([dex, name, t, hp, atk, def, spa, spd, spe]) => [dex, {
  dex, name, types: t.split('/') as PType[], hp, atk, def, spa, spd, spe, bst: hp + atk + def + spa + spd + spe,
}]));

// ---------------------------------------------------------------- 进化族

export interface FamilyDef {
  id: string;
  dex: number[];
  /** 进化等级；只有一只时为觉醒等级（全属性提升）；stones 为进化石 → 形态 */
  lv: number[];
  stones?: Record<string, number>;
  /** 每个形态的特性（abilities.ts）；只有一种形态的依次是 Lv1、第一次觉醒、第二次觉醒的特性 */
  abilities: string[];
  flavor: string;
  /** 技能表的补充属性（百变怪、梦幻这种什么都会的） */
  cover?: PType[];
}

const F = (id: string, dex: number[], lv: number[], abilities: string[], flavor: string, stones?: Record<string, number>, cover?: PType[]): FamilyDef => ({ id, dex, lv, abilities, flavor, stones, cover });

/** 初代的进化族（不含已经单独设计的小火龙、杰尼龟、妙蛙种子、皮卡丘、超梦） */
export const FAMILIES: FamilyDef[] = [
  F('caterpie', [10, 11, 12], [5, 9], ['shield_dust', 'shed_skin_p', 'tinted_lens'], '进化得很快的虫宝可梦。从弱小的绿毛虫起步，最终成为会撒鳞粉的巴大蝶。'),
  F('weedle', [13, 14, 15], [5, 9], ['poison_point', 'shed_skin_p', 'swarm_pp'], '头上有毒针。进化成大针蜂后又快又凶。'),
  F('pidgey', [16, 17, 18], [7, 14], ['keen_eye', 'keen_eye_p', 'keen_eye_pp'], '性情温和的小鸟。大比鸟能以两倍音速飞行。'),
  F('rattata', [19, 20], [9], ['run_away', 'guts'], '门牙很锋利，数量多、动作快。'),
  F('spearow', [21, 22], [9], ['keen_eye', 'sniper'], '凶巴巴的小鸟，进化后能长途飞行。'),
  F('ekans', [23, 24], [10], ['shed_skin', 'intimidate'], '悄无声息地靠近猎物，肚子上的花纹能吓退敌人。'),
  F('sandshrew', [27, 28], [10], ['sand_veil', 'sand_rush'], '缩成一团就能挡住攻击，干燥地带的挖掘高手。'),
  F('nidoran_f', [29, 30, 31], [7, 14], ['rivalry', 'rivalry_p', 'rivalry_pp'], '温柔的尼多兰，进化后是身披铠甲的尼多后。'),
  F('nidoran_m', [32, 33, 34], [7, 14], ['rivalry', 'rivalry_p', 'rivalry_pp'], '头上的角带有剧毒。尼多王的尾巴能扫倒一切。'),
  F('clefairy', [35, 36], [10], ['friend_guard', 'friend_guard_p'], '据说来自月亮的神秘宝可梦。'),
  F('vulpix', [37, 38], [10], ['flash_fire', 'drought'], '出生时只有一条尾巴。九尾的尾巴有不可思议的力量。'),
  F('jigglypuff', [39, 40], [10], ['cute_charm', 'cute_charm_p'], '圆滚滚的身体充满弹性，歌声能让敌人睡着。'),
  F('zubat', [41, 42], [10], ['infiltrator', 'infiltrator_p'], '没有眼睛，靠超声波感知周围。'),
  F('oddish', [43, 44, 45], [7, 14], ['chlorophyll', 'chlorophyll_p', 'chlorophyll_pp'], '白天把身体埋在土里，夜里四处走动撒播种子。'),
  F('paras', [46, 47], [10], ['effect_spore', 'effect_spore'], '背上的蘑菇才是本体，会撒出孢子。'),
  F('venonat', [48, 49], [10], ['run_away', 'wonder_skin'], '大大的眼睛能看清远处，摩鲁蛾的鳞粉带毒。'),
  F('diglett', [50, 51], [10], ['arena_trap', 'arena_trap'], '在地底高速穿行，没人见过它的全身。'),
  F('meowth', [52, 53], [10], ['pickup', 'technician'], '最喜欢亮晶晶的东西。冒险中能多赚不少零花钱。'),
  F('psyduck', [54, 55], [10], ['cloud_nine', 'cloud_nine_p'], '总是头痛的可达鸭，头痛到极点时会爆发念力。'),
  F('mankey', [56, 57], [10], ['anger_point', 'anger_point_p'], '脾气暴躁，一旦生气就停不下来。'),
  F('growlithe', [58, 59], [10], ['justified', 'justified_p'], '忠诚勇敢。风速狗被称为传说中的宝可梦。'),
  F('poliwag', [60, 61, 62], [7, 14], ['swift_swim', 'swift_swim_p', 'swift_swim_pp'], '肚子上的漩涡是内脏透出来的样子。蚊香泳士擅长格斗。'),
  F('abra', [63, 64, 65], [7, 14], ['magic_guard', 'magic_guard_p', 'magic_guard_pp'], '每天睡 18 个小时。胡地的智商高达 5000。'),
  F('machop', [66, 67, 68], [7, 14], ['no_guard', 'no_guard_p', 'no_guard_pp'], '全身都是肌肉，怪力的四只手能一秒打出千拳。'),
  F('bellsprout', [69, 70, 71], [7, 14], ['gluttony', 'gluttony_p', 'gluttony_pp'], '藤蔓般的身体灵活地甩动，大食花会吞下猎物。'),
  F('tentacool', [72, 73], [10], ['clear_body', 'clear_body_p'], '透明的身体几乎全是水，触手带有毒刺。'),
  F('geodude', [74, 75, 76], [7, 14], ['sturdy', 'sturdy_p', 'sturdy_pp'], '长得像石头，经常被人踩到。隆隆岩会滚下山坡。'),
  F('ponyta', [77, 78], [10], ['flame_body', 'flame_body_p'], '鬃毛是燃烧的火焰，奔跑起来像一道火光。'),
  F('slowpoke', [79, 80], [11], ['oblivious', 'oblivious_p'], '反应慢得出奇，尾巴被咬了也要过很久才觉得痛。'),
  F('magnemite', [81, 82], [10], ['magnet_pull', 'magnet_pull_p'], '用电磁波漂浮在空中，三合一磁怪是三只合体。'),
  F('farfetchd', [83], [10, 18], ['keen_eye_pp', 'inner_focus', 'inner_focus_p'], '总是拿着一根葱，用它当剑使。'),
  F('doduo', [84, 85], [10], ['run_away', 'run_away_p'], '两个头轮流睡觉，跑得比飞得还快。'),
  F('seel', [86, 87], [10], ['thick_fat', 'thick_fat_p'], '喜欢冰冷的海水，厚厚的脂肪不怕严寒。'),
  F('grimer', [88, 89], [10], ['stench', 'stench_p'], '由污泥形成，走过的地方草木不生。'),
  F('shellder', [90, 91], [10], ['shell_armor', 'skill_link'], '坚硬的外壳能挡住一切。刺甲贝会射出外壳上的刺。'),
  F('gastly', [92, 93, 94], [7, 14], ['levitate', 'levitate', 'cursed_body'], '由气体构成的身体。耿鬼会潜入人的影子里。'),
  F('onix', [95], [10, 18], ['sturdy', 'weak_armor', 'weak_armor_p'], '在地底高速挖掘的巨大岩蛇，防御极高。'),
  F('drowzee', [96, 97], [10], ['insomnia', 'forewarn'], '会吃掉人的梦。手上的钟摆能催眠敌人。'),
  F('krabby', [98, 99], [10], ['shell_armor', 'hyper_cutter'], '大钳子力大无穷，巨钳蟹的钳子能夹碎岩石。'),
  F('voltorb', [100, 101], [10], ['aftermath', 'aftermath_p'], '长得像精灵球，稍微碰一下就会爆炸。'),
  F('exeggcute', [102, 103], [10], ['chloro_toxin', 'harvest'], '六颗蛋心灵相通。椰蛋树被称为会走路的热带雨林。'),
  F('cubone', [104, 105], [10], ['battle_armor', 'battle_armor'], '戴着头骨的孤独宝可梦，挥舞骨头战斗。'),
  F('hitmonlee', [106], [10, 18], ['limber', 'reckless', 'reckless_p'], '腿能自由伸缩，踢击快如闪电。'),
  F('hitmonchan', [107], [10, 18], ['keen_eye', 'iron_fist', 'iron_fist_p'], '拳击手般的宝可梦，出拳快到看不清。'),
  F('lickitung', [108], [10, 18], ['oblivious', 'cloud_nine', 'cloud_nine_p'], '舌头有身体两倍长，舔一下就会麻痹。'),
  F('koffing', [109, 110], [10], ['levitate', 'neutralizing_gas'], '体内充满毒气，随时可能爆炸。'),
  F('rhyhorn', [111, 112], [11], ['rock_head', 'rock_head_p'], '横冲直撞的犀牛，钻角犀兽能用角钻碎岩石。'),
  F('chansey', [113], [10, 18], ['natural_cure', 'healer', 'healer_p'], '性格温柔，HP 极高的治疗系宝可梦。攻击很弱，但几乎打不倒。'),
  F('tangela', [114], [10, 18], ['chlorophyll_p', 'regenerator', 'regenerator_p'], '全身被蓝色的藤蔓包裹，看不见真面目。'),
  F('kangaskhan', [115], [10, 18], ['inner_focus', 'scrappy', 'scrappy_p'], '带着孩子的母亲，为了保护孩子会拼命战斗。'),
  F('horsea', [116, 117], [10], ['swift_swim_p', 'sniper'], '能喷出墨汁和水柱，海刺龙的鳍带毒。'),
  F('goldeen', [118, 119], [10], ['water_veil', 'water_veil_p'], '优雅地在水中游动，头上的角很锋利。'),
  F('staryu', [120, 121], [10], ['natural_cure', 'illuminate'], '核心闪闪发光，宝石海星的核心像宝石一样美丽。'),
  F('mr_mime', [122], [10, 18], ['technician', 'filter', 'filter_p'], '擅长哑剧，能造出看不见的墙壁。'),
  F('scyther', [123], [10, 18], ['swarm', 'technician', 'technician_p'], '双臂的镰刀锋利无比，动作快得看不清。'),
  F('jynx', [124], [10, 18], ['forewarn', 'dry_skin', 'dry_skin'], '说着奇怪的语言，舞蹈般地战斗。'),
  F('electabuzz', [125], [10, 18], ['static', 'vital_spirit', 'vital_spirit_p'], '常常出现在发电厂附近，全身带着电。'),
  F('magmar', [126], [10, 18], ['flame_body', 'vital_spirit', 'vital_spirit_p'], '全身燃烧着火焰，住在火山口附近。'),
  F('pinsir', [127], [10, 18], ['hyper_cutter', 'mold_breaker', 'mold_breaker'], '头上的大角能夹住敌人甩出去。'),
  F('tauros', [128], [10, 18], ['intimidate', 'anger_point', 'anger_point'], '性格暴躁，一边用尾巴抽打自己一边冲锋。'),
  F('magikarp', [129, 130], [9], ['swift_swim_pp', 'intimidate'], '只会跳来跳去的鲤鱼王……熬过最弱的时期，就会进化成凶暴的暴鲤龙！'),
  F('lapras', [131], [10, 18], ['shell_armor', 'hydration', 'hydration'], '性情温和，喜欢载着人在海上航行。'),
  F('ditto', [132], [8, 16], ['imposter', 'imposter', 'imposter'], '能变身成任何东西。带着金属粉、速度粉越变越强，什么属性的技能都学得会。', undefined, ['fire', 'water', 'electric', 'grass', 'ice', 'psychic']),
  F('eevee', [133, 134, 135, 136], [], ['adaptability', 'water_absorb', 'volt_absorb', 'flash_fire_p'], '基因不稳定，用不同的进化石会进化成不同的样子（商店里购买水之石、雷之石或火之石）。', { water_stone: 1, thunder_stone: 2, fire_stone: 3 }),
  F('porygon', [137], [10, 18], ['trace', 'download', 'download_p'], '用程序制造出来的人工宝可梦，能在电脑网络中移动。'),
  F('omanyte', [138, 139], [11], ['swift_swim_p', 'swift_swim_pp'], '由化石复活的古代宝可梦，用触手捕猎。'),
  F('kabuto', [140, 141], [11], ['swift_swim_p', 'swift_swim_pp'], '由化石复活的古代宝可梦，镰刀盔的镰刀非常锋利。'),
  F('aerodactyl', [142], [10, 18], ['rock_head_p', 'pressure', 'pressure_p'], '由琥珀复活的古代天空霸主。'),
  F('snorlax', [143], [10, 18], ['gluttony_p', 'thick_fat_p', 'thick_fat_pp'], '一天要吃 400 公斤食物，吃饱了就睡。无法进化，但血厚力大。'),
  F('articuno', [144], [10, 18], ['pressure', 'pressure', 'snow_cloak_x'], '传说中的冰之鸟。所到之处会降下大雪。'),
  F('zapdos', [145], [10, 18], ['pressure', 'pressure', 'static_x'], '传说中的雷之鸟。出现时会伴随雷鸣。'),
  F('moltres', [146], [10, 18], ['pressure', 'pressure', 'flame_body_x'], '传说中的火之鸟。振翅时会洒下火焰。'),
  F('dratini', [147, 148, 149], [9, 18], ['shed_skin', 'shed_skin_p', 'multiscale'], '长年被当作传说的幻之宝可梦，快龙能绕地球一圈只用 16 小时。'),
  F('mew', [151], [10, 18], ['synchronize', 'synchronize', 'synchronize'], '据说是所有宝可梦的祖先，能学会任何技能。', undefined, ['fire', 'water', 'electric', 'grass', 'fighting', 'ghost', 'dragon']),
];
