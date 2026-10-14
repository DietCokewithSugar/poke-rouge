import type { PType } from './types';

export type SkillCat = 'phys' | 'spec' | 'status';
/**
 * proj   发射弹体          melee  身前扇形（爪击/喷吐）  beam  直线光束
 * nova   以自身为中心的冲击波  chain  连锁闪电             strike 目标处延迟爆炸
 * orbit  环绕自身的弹体      zone   目标处持续伤害区域     heal/shield/buff  辅助
 */
export type Pattern = 'proj' | 'melee' | 'beam' | 'nova' | 'chain' | 'strike' | 'orbit' | 'zone' | 'heal' | 'shield' | 'buff';
export type StatusKind = 'burn' | 'poison' | 'para' | 'slow' | 'freeze' | 'stun' | 'leech';

export interface SkillDef {
  id: string;
  name: string;
  type: PType;
  cat: SkillCat;
  tier: 1 | 2 | 3 | 4;
  pattern: Pattern;
  power: number;
  cd: number;
  range: number;
  speed?: number;
  count?: number;
  spread?: number;
  pierce?: number;
  size?: number;
  homing?: number;
  radius?: number;
  width?: number;
  arc?: number;
  delay?: number;
  duration?: number;
  tick?: number;
  chains?: number;
  strikes?: number;
  knock?: number;
  crit?: number;
  status?: { kind: StatusKind; chance: number; dur?: number; amount?: number };
  /** heal：回复最大 HP 的比例；leech：伤害转化为回复的比例 */
  heal?: number;
  /** 反作用：按造成伤害的比例扣自身 HP（单次最多 6% 最大 HP） */
  recoil?: number;
  shield?: number;
  /** 电球：速度越快伤害越高 */
  speedScale?: boolean;
  /** 辅助技能：buff 持续时间与效果 */
  buff?: { haste?: number; spe?: number; dur: number };
  /** 芳香治疗等：对附近队友也生效 */
  team?: boolean;
  fx: string;
  desc: string;
}

const deg = (d: number) => (d * Math.PI) / 180;

const LIST: SkillDef[] = [
  // ---------- 一般 ----------
  { id: 'tackle', name: '撞击', type: 'normal', cat: 'phys', tier: 1, pattern: 'melee', power: 11, cd: 0.8, range: 34, radius: 34, arc: deg(120), knock: 50, fx: 'tackle', desc: '用身体撞向前方的敌人。' },
  { id: 'scratch', name: '抓', type: 'normal', cat: 'phys', tier: 1, pattern: 'melee', power: 10, cd: 0.7, range: 34, radius: 34, arc: deg(110), fx: 'scratch', desc: '用利爪抓挠前方。' },
  { id: 'quick_attack', name: '电光一闪', type: 'normal', cat: 'phys', tier: 1, pattern: 'melee', power: 8, cd: 0.45, range: 36, radius: 36, arc: deg(90), fx: 'quick', desc: '迅雷不及掩耳的快速突击，冷却极短。' },
  { id: 'swift', name: '高速星星', type: 'normal', cat: 'spec', tier: 2, pattern: 'proj', power: 9, cd: 1.1, range: 170, speed: 210, count: 3, spread: deg(40), homing: 6, size: 4, fx: 'star', desc: '发射 3 颗会追踪敌人的星星。' },
  { id: 'slash', name: '劈开', type: 'normal', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 42, radius: 42, arc: deg(130), crit: 20, fx: 'slash', desc: '大范围劈砍，容易击中要害。' },
  { id: 'hyper_voice', name: '巨声', type: 'normal', cat: 'spec', tier: 3, pattern: 'nova', power: 30, cd: 1.8, range: 70, radius: 70, knock: 70, fx: 'voice', desc: '向四周发出巨大声波并击退敌人。' },
  { id: 'hyper_beam', name: '破坏光线', type: 'normal', cat: 'spec', tier: 4, pattern: 'beam', power: 150, cd: 4.0, range: 230, width: 22, delay: 0.35, fx: 'hyperbeam', desc: '蓄力后发射毁灭性的光线，冷却很长。' },

  // ---------- 火 ----------
  { id: 'ember', name: '火花', type: 'fire', cat: 'spec', tier: 1, pattern: 'proj', power: 9, cd: 0.9, range: 155, speed: 220, size: 3, status: { kind: 'burn', chance: 0.15, dur: 3 }, fx: 'ember', desc: '发射小火苗，有几率灼伤。' },
  { id: 'fire_fang', name: '火焰牙', type: 'fire', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 36, radius: 36, arc: deg(100), status: { kind: 'burn', chance: 0.2, dur: 3 }, fx: 'firefang', desc: '用燃烧的牙齿撕咬，可能灼伤。' },
  { id: 'fire_spin', name: '火焰旋涡', type: 'fire', cat: 'spec', tier: 2, pattern: 'zone', power: 5, cd: 3.0, range: 165, radius: 30, duration: 3, tick: 0.5, fx: 'firespin', desc: '在敌人脚下卷起持续 3 秒的火焰旋涡。' },
  { id: 'flamethrower', name: '喷射火焰', type: 'fire', cat: 'spec', tier: 3, pattern: 'beam', power: 32, cd: 1.3, range: 135, width: 16, status: { kind: 'burn', chance: 0.25, dur: 3 }, fx: 'flamethrower', desc: '喷出一道火焰，贯穿直线上的所有敌人。' },
  { id: 'fire_blast', name: '大字爆炎', type: 'fire', cat: 'spec', tier: 4, pattern: 'strike', power: 110, cd: 2.6, range: 175, radius: 50, delay: 0.35, status: { kind: 'burn', chance: 0.4, dur: 4 }, fx: 'fireblast', desc: '"大"字形的烈焰在目标处爆炸。' },
  { id: 'flare_blitz', name: '闪焰冲锋', type: 'fire', cat: 'phys', tier: 4, pattern: 'nova', power: 95, cd: 2.0, range: 60, radius: 62, recoil: 0.08, status: { kind: 'burn', chance: 0.2, dur: 3 }, fx: 'flareblitz', desc: '全身包裹火焰爆发，会受到少量反作用伤害。' },

  // ---------- 水 ----------
  { id: 'water_gun', name: '水枪', type: 'water', cat: 'spec', tier: 1, pattern: 'proj', power: 8, cd: 0.8, range: 150, speed: 240, size: 3, knock: 60, fx: 'water', desc: '喷射水流，能击退敌人。' },
  { id: 'withdraw', name: '缩入壳中', type: 'water', cat: 'status', tier: 1, pattern: 'shield', power: 0, cd: 8, range: 130, shield: 0.15, duration: 4, fx: 'shield', desc: '缩进壳里，获得相当于 15% 最大HP 的护盾。' },
  { id: 'bubble_beam', name: '泡沫光线', type: 'water', cat: 'spec', tier: 2, pattern: 'proj', power: 9, cd: 1.1, range: 150, speed: 190, count: 3, spread: deg(30), size: 4, status: { kind: 'slow', chance: 0.35, dur: 1.5, amount: 0.35 }, fx: 'bubble', desc: '吐出 3 串泡泡，可能减速敌人。' },
  { id: 'water_pulse', name: '水之波动', type: 'water', cat: 'spec', tier: 2, pattern: 'proj', power: 20, cd: 1.2, range: 160, speed: 200, size: 6, pierce: 2, status: { kind: 'stun', chance: 0.2, dur: 0.6 }, fx: 'waterpulse', desc: '超声波般的水球，能穿透并使敌人混乱。' },
  { id: 'aqua_tail', name: '水流尾', type: 'water', cat: 'phys', tier: 3, pattern: 'melee', power: 40, cd: 1.3, range: 46, radius: 46, arc: deg(360), knock: 80, fx: 'aquatail', desc: '挥动水流缠绕的尾巴，横扫一圈。' },
  { id: 'surf', name: '冲浪', type: 'water', cat: 'spec', tier: 3, pattern: 'nova', power: 36, cd: 2.2, range: 90, radius: 92, knock: 110, fx: 'surf', desc: '掀起巨浪冲刷四周，大幅击退。' },
  { id: 'hydro_pump', name: '水炮', type: 'water', cat: 'spec', tier: 4, pattern: 'beam', power: 105, cd: 2.4, range: 200, width: 22, knock: 160, fx: 'hydropump', desc: '以猛烈的水压冲击直线上的敌人。' },

  // ---------- 草 ----------
  { id: 'vine_whip', name: '藤鞭', type: 'grass', cat: 'phys', tier: 1, pattern: 'melee', power: 11, cd: 0.9, range: 58, radius: 58, arc: deg(50), fx: 'vine', desc: '甩出细长的藤蔓抽打远处的敌人。' },
  { id: 'leech_seed', name: '寄生种子', type: 'grass', cat: 'spec', tier: 1, pattern: 'proj', power: 4, cd: 2.0, range: 150, speed: 170, size: 3, status: { kind: 'leech', chance: 1, dur: 5 }, heal: 0.5, fx: 'seed', desc: '种下种子持续吸取 HP，并为自己回复。' },
  { id: 'razor_leaf', name: '飞叶快刀', type: 'grass', cat: 'phys', tier: 2, pattern: 'proj', power: 12, cd: 0.9, range: 160, speed: 240, count: 2, spread: deg(16), pierce: 1, size: 4, crit: 15, fx: 'leaf', desc: '飞出锋利的叶片，容易击中要害。' },
  { id: 'seed_bomb', name: '种子炸弹', type: 'grass', cat: 'phys', tier: 2, pattern: 'strike', power: 26, cd: 1.4, range: 160, radius: 30, delay: 0.4, fx: 'seedbomb', desc: '投掷坚硬的种子，在落点爆炸。' },
  { id: 'energy_ball', name: '能量球', type: 'grass', cat: 'spec', tier: 3, pattern: 'proj', power: 38, cd: 1.3, range: 170, speed: 200, size: 7, pierce: 1, fx: 'energyball', desc: '汇聚自然之力发射能量球。' },
  { id: 'petal_dance', name: '花瓣舞', type: 'grass', cat: 'spec', tier: 3, pattern: 'orbit', power: 14, cd: 6, range: 120, count: 5, radius: 42, duration: 4.5, size: 5, fx: 'petal', desc: '花瓣环绕身体飞舞 4.5 秒，切割接近的敌人。' },
  { id: 'synthesis', name: '光合作用', type: 'grass', cat: 'status', tier: 3, pattern: 'heal', power: 0, cd: 10, range: 0, heal: 0.2, fx: 'heal', desc: '吸收阳光，回复 20% 最大HP。' },
  { id: 'aromatherapy', name: '芳香治疗', type: 'grass', cat: 'status', tier: 2, pattern: 'heal', power: 0, cd: 12, range: 0, heal: 0.12, radius: 120, team: true, fx: 'heal', desc: '散发香气，为自己和附近队友回复 12% 最大HP。' },
  { id: 'solar_beam', name: '日光束', type: 'grass', cat: 'spec', tier: 4, pattern: 'beam', power: 140, cd: 3.2, range: 230, width: 26, delay: 0.6, fx: 'solarbeam', desc: '蓄满阳光后发射巨大的光束。' },
  { id: 'frenzy_plant', name: '疯狂植物', type: 'grass', cat: 'phys', tier: 4, pattern: 'nova', power: 90, cd: 2.6, range: 84, radius: 86, status: { kind: 'stun', chance: 0.3, dur: 0.8 }, fx: 'frenzyplant', desc: '巨大的根须破土而出，缠住四周的敌人。' },

  // ---------- 电 ----------
  { id: 'thunder_shock', name: '电击', type: 'electric', cat: 'spec', tier: 1, pattern: 'proj', power: 7, cd: 0.6, range: 150, speed: 300, size: 3, status: { kind: 'para', chance: 0.1, dur: 2 }, fx: 'shock', desc: '放出电流，冷却很短，可能麻痹。' },
  { id: 'electro_ball', name: '电球', type: 'electric', cat: 'spec', tier: 2, pattern: 'proj', power: 12, cd: 1.1, range: 165, speed: 220, size: 6, speedScale: true, fx: 'electroball', desc: '速度越快，电球的威力越大。' },
  { id: 'spark', name: '电光', type: 'electric', cat: 'phys', tier: 2, pattern: 'melee', power: 20, cd: 1.0, range: 40, radius: 40, arc: deg(120), status: { kind: 'para', chance: 0.3, dur: 2 }, fx: 'sparkmelee', desc: '带电撞击，较高几率麻痹。' },
  { id: 'thunderbolt', name: '十万伏特', type: 'electric', cat: 'spec', tier: 3, pattern: 'chain', power: 30, cd: 1.3, range: 165, chains: 4, status: { kind: 'para', chance: 0.2, dur: 2 }, fx: 'thunderbolt', desc: '强力电流在 4 个敌人之间连锁。' },
  { id: 'discharge', name: '放电', type: 'electric', cat: 'spec', tier: 3, pattern: 'nova', power: 30, cd: 1.6, range: 76, radius: 78, status: { kind: 'para', chance: 0.3, dur: 2 }, fx: 'discharge', desc: '向四周释放电流。' },
  { id: 'thunder', name: '打雷', type: 'electric', cat: 'spec', tier: 4, pattern: 'strike', power: 70, cd: 2.4, range: 190, radius: 28, delay: 0.5, strikes: 4, status: { kind: 'para', chance: 0.3, dur: 2 }, fx: 'thunder', desc: '召唤 4 道落雷劈向不同的敌人。' },
  { id: 'volt_tackle', name: '伏特攻击', type: 'electric', cat: 'phys', tier: 4, pattern: 'melee', power: 120, cd: 1.8, range: 52, radius: 52, arc: deg(180), recoil: 0.06, status: { kind: 'para', chance: 0.2, dur: 2 }, fx: 'volttackle', desc: '缠绕电流猛撞，会受到少量反作用伤害。' },
  { id: 'agility', name: '高速移动', type: 'psychic', cat: 'status', tier: 2, pattern: 'buff', power: 0, cd: 10, range: 130, buff: { haste: 30, spe: 30, dur: 4 }, fx: 'buff', desc: '4 秒内速度与技能急速大幅提升。' },

  // ---------- 超能力 / 幽灵 / 格斗 ----------
  { id: 'confusion', name: '念力', type: 'psychic', cat: 'spec', tier: 1, pattern: 'proj', power: 9, cd: 0.9, range: 160, speed: 180, size: 4, homing: 3, status: { kind: 'stun', chance: 0.1, dur: 0.4 }, fx: 'psy', desc: '微弱的念力波，会轻微追踪敌人。' },
  { id: 'barrier', name: '屏障', type: 'psychic', cat: 'status', tier: 2, pattern: 'shield', power: 0, cd: 10, range: 130, shield: 0.25, duration: 5, fx: 'shield', desc: '制造坚固的墙壁，获得 25% 最大HP 的护盾。' },
  { id: 'psybeam', name: '幻象光线', type: 'psychic', cat: 'spec', tier: 2, pattern: 'beam', power: 20, cd: 1.2, range: 145, width: 9, status: { kind: 'stun', chance: 0.15, dur: 0.5 }, fx: 'psybeam', desc: '发射奇异的光线，可能使敌人混乱。' },
  { id: 'psycho_cut', name: '精神利刃', type: 'psychic', cat: 'phys', tier: 2, pattern: 'proj', power: 18, cd: 1.0, range: 160, speed: 240, size: 6, pierce: 4, crit: 15, fx: 'psychocut', desc: '用念力制造的利刃，贯穿多个敌人。' },
  { id: 'psychic', name: '精神强念', type: 'psychic', cat: 'spec', tier: 3, pattern: 'strike', power: 40, cd: 1.6, range: 175, radius: 44, delay: 0.2, fx: 'psychic', desc: '强大的念力在目标处爆发。' },
  { id: 'recover', name: '自我再生', type: 'normal', cat: 'status', tier: 3, pattern: 'heal', power: 0, cd: 12, range: 0, heal: 0.25, fx: 'heal', desc: '再生细胞，回复 25% 最大HP。' },
  { id: 'shadow_ball', name: '暗影球', type: 'ghost', cat: 'spec', tier: 3, pattern: 'proj', power: 40, cd: 1.4, range: 170, speed: 170, size: 8, fx: 'shadowball', desc: '投掷一团黑影，威力很高。' },
  { id: 'aura_sphere', name: '波导弹', type: 'fighting', cat: 'spec', tier: 3, pattern: 'proj', power: 34, cd: 1.2, range: 180, speed: 230, size: 6, homing: 8, fx: 'aurasphere', desc: '必中的波导之力，强力追踪。' },
  { id: 'future_sight', name: '预知未来', type: 'psychic', cat: 'spec', tier: 4, pattern: 'strike', power: 120, cd: 3.0, range: 200, radius: 40, delay: 1.2, strikes: 3, fx: 'futuresight', desc: '预知敌人的位置，片刻后降下 3 次念力打击。' },
  { id: 'psystrike', name: '精神击破', type: 'psychic', cat: 'spec', tier: 4, pattern: 'proj', power: 100, cd: 2.2, range: 200, speed: 220, size: 12, pierce: 99, fx: 'psystrike', desc: '超梦的专属招式：贯穿一切的念力波。' },

  // ---------- 其它属性（覆盖面） ----------
  { id: 'dragon_breath', name: '龙息', type: 'dragon', cat: 'spec', tier: 1, pattern: 'melee', power: 11, cd: 1.1, range: 52, radius: 52, arc: deg(70), status: { kind: 'para', chance: 0.2, dur: 2 }, fx: 'dragonbreath', desc: '喷出龙之气息，可能麻痹。' },
  { id: 'dragon_claw', name: '龙爪', type: 'dragon', cat: 'phys', tier: 3, pattern: 'melee', power: 46, cd: 1.1, range: 44, radius: 44, arc: deg(140), crit: 10, fx: 'dragonclaw', desc: '用锋利的巨爪撕裂前方。' },
  { id: 'draco_meteor', name: '流星群', type: 'dragon', cat: 'spec', tier: 4, pattern: 'strike', power: 90, cd: 3.2, range: 200, radius: 32, delay: 0.7, strikes: 5, fx: 'meteor', desc: '从天而降 5 颗陨石。' },
  { id: 'air_slash', name: '空气斩', type: 'flying', cat: 'spec', tier: 3, pattern: 'proj', power: 30, cd: 1.2, range: 170, speed: 260, size: 6, pierce: 3, status: { kind: 'stun', chance: 0.2, dur: 0.4 }, fx: 'airslash', desc: '发射空气之刃，能贯穿敌人并使其畏缩。' },
  { id: 'metal_claw', name: '金属爪', type: 'steel', cat: 'phys', tier: 1, pattern: 'melee', power: 11, cd: 0.8, range: 34, radius: 34, arc: deg(110), fx: 'metalclaw', desc: '用钢铁般的爪子抓挠。' },
  { id: 'iron_tail', name: '铁尾', type: 'steel', cat: 'phys', tier: 3, pattern: 'melee', power: 50, cd: 1.4, range: 46, radius: 46, arc: deg(160), knock: 60, fx: 'irontail', desc: '用坚硬的尾巴横扫，岩石系也怕它。' },
  { id: 'ice_beam', name: '冰冻光束', type: 'ice', cat: 'spec', tier: 3, pattern: 'beam', power: 34, cd: 1.5, range: 165, width: 10, status: { kind: 'freeze', chance: 0.15, dur: 1 }, fx: 'icebeam', desc: '发射冰冻光束，可能冻住敌人。' },
  { id: 'bite', name: '咬住', type: 'dark', cat: 'phys', tier: 1, pattern: 'melee', power: 12, cd: 0.8, range: 30, radius: 30, arc: deg(90), status: { kind: 'stun', chance: 0.15, dur: 0.4 }, fx: 'bite', desc: '用尖牙咬住敌人，可能使其畏缩。' },
  { id: 'dark_pulse', name: '恶之波动', type: 'dark', cat: 'spec', tier: 3, pattern: 'nova', power: 32, cd: 1.7, range: 66, radius: 68, status: { kind: 'stun', chance: 0.2, dur: 0.5 }, fx: 'darkpulse', desc: '释放充满恶意的波动。' },
  { id: 'brick_break', name: '劈瓦', type: 'fighting', cat: 'phys', tier: 2, pattern: 'melee', power: 24, cd: 1.0, range: 36, radius: 36, arc: deg(100), fx: 'chop', desc: '用手刀猛力劈下。' },
  { id: 'poison_powder', name: '毒粉', type: 'poison', cat: 'spec', tier: 2, pattern: 'zone', power: 3, cd: 3.0, range: 160, radius: 36, duration: 3.5, tick: 0.5, status: { kind: 'poison', chance: 0.6, dur: 4 }, fx: 'poisonpowder', desc: '撒下毒粉云，持续伤害并使敌人中毒。' },
  { id: 'sludge_bomb', name: '污泥炸弹', type: 'poison', cat: 'spec', tier: 3, pattern: 'strike', power: 36, cd: 1.6, range: 170, radius: 36, delay: 0.3, status: { kind: 'poison', chance: 0.4, dur: 4 }, fx: 'sludge', desc: '投掷污泥，在落点溅射并可能中毒。' },
  { id: 'rock_slide', name: '岩崩', type: 'rock', cat: 'phys', tier: 3, pattern: 'strike', power: 32, cd: 1.8, range: 170, radius: 24, delay: 0.45, strikes: 3, status: { kind: 'stun', chance: 0.2, dur: 0.5 }, fx: 'rockslide', desc: '落下 3 块巨石砸向敌人。' },
  { id: 'earthquake', name: '地震', type: 'ground', cat: 'phys', tier: 4, pattern: 'nova', power: 80, cd: 2.6, range: 100, radius: 104, fx: 'earthquake', desc: '引发地震，伤害周围所有敌人。' },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(LIST.map((s) => [s.id, s]));
export const SKILL_IDS = LIST.map((s) => s.id);

export const SKILL_MAX_LV = 3;
export function skillLevelDmg(lv: number) { return 1 + 0.35 * (lv - 1); }
export function skillLevelCd(lv: number) { return 1 - 0.1 * (lv - 1); }

export const CAT_NAME: Record<SkillCat, string> = { phys: '物理', spec: '特殊', status: '变化' };
export const TIER_NAME = ['', '初级', '中级', '高级', '究极'] as const;
export const TIER_COLOR = ['', '#cfd8e6', '#5fe08a', '#4fb4ff', '#c47bff'] as const;

/** 弹体/特效的视觉种类，二进制快照中以序号传输。 */
export const FX_KINDS: string[] = [
  'none', ...new Set(LIST.map((s) => s.fx)),
  // 敌人弹体
  'e_sting', 'e_acid', 'e_spore', 'e_shock', 'e_shadow', 'e_psy', 'e_gust', 'e_rock', 'e_bubble', 'e_star', 'e_ring',
];
export const FX_INDEX: Record<string, number> = Object.fromEntries(FX_KINDS.map((k, i) => [k, i]));
