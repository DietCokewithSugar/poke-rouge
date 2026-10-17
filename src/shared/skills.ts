import type { PType } from './types';

export type SkillCat = 'phys' | 'spec' | 'status';
/**
 * proj   发射弹体          melee  身前扇形（爪击/喷吐）  beam  直线光束
 * nova   以自身为中心的冲击波  chain  连锁闪电             strike 目标处延迟爆炸
 * orbit  环绕自身的弹体      zone   目标处持续伤害区域     heal/shield/buff  辅助
 */
export type Pattern = 'proj' | 'melee' | 'beam' | 'nova' | 'chain' | 'strike' | 'orbit' | 'zone' | 'heal' | 'shield' | 'buff';
/**
 * 技能的附加效果，以及特性带来的状态：sleep 睡眠（定身且不能放技能）、root 定身（技能照常）、toxic 毒刺的中毒、
 * weak 威吓（技能伤害降低）、burnPhys 火焰之躯的烧伤（物理伤害减半）、cdUp 诅咒（冷却 +200%）、sun 日照（叠加的减速与掉血）
 */
export type StatusKind = 'burn' | 'poison' | 'para' | 'slow' | 'freeze' | 'stun' | 'leech' | 'sleep' | 'root' | 'toxic' | 'weak' | 'burnPhys' | 'cdUp' | 'sun';

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
  /** 聚宝功：命中时有几率捡到零钱 */
  payday?: boolean;
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

  // ================= 以下为初代 151 只宝可梦补充的招式 =================
  // ---------- 一般 ----------
  { id: 'headbutt', name: '头锤', type: 'normal', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 36, radius: 36, arc: deg(100), status: { kind: 'stun', chance: 0.25, dur: 0.5 }, fx: 'headbutt', desc: '用头猛撞前方，可能使敌人畏缩。' },
  { id: 'hyper_fang', name: '必杀门牙', type: 'normal', cat: 'phys', tier: 2, pattern: 'melee', power: 25, cd: 1.0, range: 32, radius: 32, arc: deg(90), crit: 10, fx: 'hyperfang', desc: '用锋利的门牙狠狠咬下去。' },
  { id: 'pay_day', name: '聚宝功', type: 'normal', cat: 'spec', tier: 1, pattern: 'proj', power: 8, cd: 0.9, range: 150, speed: 230, count: 2, spread: deg(18), size: 3, payday: true, fx: 'payday', desc: '扔出金币攻击，命中时有几率捡到零钱。' },
  { id: 'sing', name: '唱歌', type: 'normal', cat: 'spec', tier: 2, pattern: 'nova', power: 3, cd: 4.0, range: 80, radius: 82, status: { kind: 'sleep', chance: 0.7, dur: 1.4 }, fx: 'sing', desc: '温柔的歌声让周围的敌人睡着（短暂定身）。' },
  { id: 'splash', name: '跃起', type: 'normal', cat: 'status', tier: 1, pattern: 'buff', power: 0, cd: 4, range: 130, buff: { spe: 25, dur: 2 }, fx: 'buff', desc: '只会跳来跳去……不过能跑得快一点。' },
  { id: 'tri_attack', name: '三重攻击', type: 'normal', cat: 'spec', tier: 3, pattern: 'proj', power: 20, cd: 1.3, range: 165, speed: 220, count: 3, spread: deg(34), size: 5, status: { kind: 'burn', chance: 0.12, dur: 3 }, fx: 'triattack', desc: '同时发射 3 道光线，可能灼伤。' },
  { id: 'body_slam', name: '泰山压顶', type: 'normal', cat: 'phys', tier: 3, pattern: 'nova', power: 36, cd: 1.7, range: 54, radius: 56, knock: 60, status: { kind: 'para', chance: 0.3, dur: 2 }, fx: 'bodyslam', desc: '用全身压向四周，可能麻痹敌人。' },
  { id: 'double_edge', name: '舍身冲撞', type: 'normal', cat: 'phys', tier: 4, pattern: 'melee', power: 118, cd: 1.8, range: 52, radius: 52, arc: deg(170), recoil: 0.08, knock: 90, fx: 'doubleedge', desc: '不顾危险地猛撞，会受到少量反作用伤害。' },
  { id: 'explosion', name: '大爆炸', type: 'normal', cat: 'phys', tier: 4, pattern: 'nova', power: 150, cd: 4.2, range: 96, radius: 100, knock: 140, recoil: 0.12, fx: 'explosion', desc: '引发剧烈的爆炸，自己也会受到一些伤害。' },

  // ---------- 火 / 水 / 草 / 电（补充） ----------
  { id: 'fire_punch', name: '火焰拳', type: 'fire', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 36, radius: 36, arc: deg(100), status: { kind: 'burn', chance: 0.2, dur: 3 }, fx: 'firepunch', desc: '带着火焰的拳头，可能灼伤。' },
  { id: 'heat_wave', name: '热风', type: 'fire', cat: 'spec', tier: 3, pattern: 'nova', power: 30, cd: 1.7, range: 74, radius: 76, status: { kind: 'burn', chance: 0.25, dur: 3 }, fx: 'heatwave', desc: '向四周吹出灼热的风。' },
  { id: 'whirlpool', name: '潮旋', type: 'water', cat: 'spec', tier: 2, pattern: 'zone', power: 5, cd: 3.0, range: 165, radius: 32, duration: 3, tick: 0.5, status: { kind: 'slow', chance: 0.5, dur: 1.2, amount: 0.35 }, fx: 'whirlpool', desc: '卷起持续 3 秒的漩涡，困住并减速敌人。' },
  { id: 'crabhammer', name: '蟹钳锤', type: 'water', cat: 'phys', tier: 3, pattern: 'melee', power: 46, cd: 1.2, range: 42, radius: 42, arc: deg(120), crit: 20, fx: 'crabhammer', desc: '用大钳子猛砸，容易击中要害。' },
  { id: 'waterfall', name: '攀瀑', type: 'water', cat: 'phys', tier: 3, pattern: 'melee', power: 40, cd: 1.2, range: 46, radius: 46, arc: deg(150), knock: 70, status: { kind: 'stun', chance: 0.2, dur: 0.5 }, fx: 'waterfall', desc: '以逆流而上的气势冲撞前方。' },
  { id: 'scald', name: '热水', type: 'water', cat: 'spec', tier: 3, pattern: 'proj', power: 34, cd: 1.3, range: 165, speed: 210, size: 7, pierce: 1, status: { kind: 'burn', chance: 0.3, dur: 3 }, fx: 'scald', desc: '喷出滚烫的热水，可能灼伤。' },
  { id: 'mega_drain', name: '超级吸取', type: 'grass', cat: 'spec', tier: 2, pattern: 'proj', power: 14, cd: 1.2, range: 160, speed: 200, size: 5, homing: 4, status: { kind: 'leech', chance: 1, dur: 3 }, heal: 0.5, fx: 'megadrain', desc: '吸取敌人的养分，持续为自己回复。' },
  { id: 'stun_spore', name: '麻痹粉', type: 'grass', cat: 'spec', tier: 2, pattern: 'zone', power: 2, cd: 3.2, range: 160, radius: 36, duration: 3, tick: 0.5, status: { kind: 'para', chance: 0.6, dur: 2 }, fx: 'stunspore', desc: '撒下麻痹粉，使范围内的敌人麻痹。' },
  { id: 'giga_drain', name: '终极吸取', type: 'grass', cat: 'spec', tier: 3, pattern: 'proj', power: 32, cd: 1.4, range: 170, speed: 200, size: 7, homing: 4, status: { kind: 'leech', chance: 1, dur: 4 }, heal: 0.5, fx: 'gigadrain', desc: '大量吸取敌人的养分，持续为自己回复。' },
  { id: 'leaf_blade', name: '叶刃', type: 'grass', cat: 'phys', tier: 3, pattern: 'melee', power: 44, cd: 1.1, range: 44, radius: 44, arc: deg(130), crit: 15, fx: 'leafblade', desc: '挥舞叶片之刃，容易击中要害。' },
  { id: 'power_whip', name: '强力鞭打', type: 'grass', cat: 'phys', tier: 4, pattern: 'melee', power: 105, cd: 1.9, range: 74, radius: 74, arc: deg(80), knock: 80, fx: 'powerwhip', desc: '甩动粗壮的藤蔓，猛力抽打远处的敌人。' },
  { id: 'thunder_punch', name: '雷电拳', type: 'electric', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 36, radius: 36, arc: deg(100), status: { kind: 'para', chance: 0.2, dur: 2 }, fx: 'thunderpunch', desc: '带着电流的拳头，可能麻痹。' },
  { id: 'zap_cannon', name: '电磁炮', type: 'electric', cat: 'spec', tier: 4, pattern: 'proj', power: 110, cd: 2.8, range: 190, speed: 170, size: 12, pierce: 2, status: { kind: 'para', chance: 1, dur: 2 }, fx: 'zapcannon', desc: '发射巨大的电磁炮弹，必定麻痹命中的敌人。' },

  // ---------- 冰 ----------
  { id: 'powder_snow', name: '细雪', type: 'ice', cat: 'spec', tier: 1, pattern: 'proj', power: 7, cd: 0.8, range: 150, speed: 220, count: 2, spread: deg(20), size: 3, status: { kind: 'freeze', chance: 0.08, dur: 0.8 }, fx: 'powdersnow', desc: '吹出细小的雪花，可能冻住敌人。' },
  { id: 'ice_shard', name: '冰砾', type: 'ice', cat: 'phys', tier: 1, pattern: 'proj', power: 9, cd: 0.6, range: 150, speed: 320, size: 3, fx: 'iceshard', desc: '迅速掷出冰块，冷却很短。' },
  { id: 'aurora_beam', name: '极光束', type: 'ice', cat: 'spec', tier: 2, pattern: 'beam', power: 20, cd: 1.2, range: 145, width: 9, status: { kind: 'slow', chance: 0.4, dur: 1.5, amount: 0.35 }, fx: 'aurorabeam', desc: '发射七彩的极光，可能减速敌人。' },
  { id: 'ice_punch', name: '冰冻拳', type: 'ice', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 36, radius: 36, arc: deg(100), status: { kind: 'freeze', chance: 0.12, dur: 0.8 }, fx: 'icepunch', desc: '带着寒气的拳头，可能冻住敌人。' },
  { id: 'blizzard', name: '暴风雪', type: 'ice', cat: 'spec', tier: 4, pattern: 'nova', power: 80, cd: 2.6, range: 96, radius: 98, status: { kind: 'freeze', chance: 0.25, dur: 1 }, fx: 'blizzard', desc: '猛烈的暴风雪席卷四周，可能冻住敌人。' },

  // ---------- 格斗 ----------
  { id: 'karate_chop', name: '空手劈', type: 'fighting', cat: 'phys', tier: 1, pattern: 'melee', power: 11, cd: 0.8, range: 34, radius: 34, arc: deg(100), crit: 15, fx: 'karate', desc: '用手刀劈砍，容易击中要害。' },
  { id: 'cross_chop', name: '十字劈', type: 'fighting', cat: 'phys', tier: 3, pattern: 'melee', power: 46, cd: 1.3, range: 42, radius: 42, arc: deg(140), crit: 20, fx: 'crosschop', desc: '双手交叉劈下，容易击中要害。' },
  { id: 'close_combat', name: '近身战', type: 'fighting', cat: 'phys', tier: 4, pattern: 'nova', power: 95, cd: 2.0, range: 56, radius: 58, knock: 80, fx: 'closecombat', desc: '不顾防守地对周围的敌人一顿猛打。' },
  { id: 'high_jump_kick', name: '飞膝踢', type: 'fighting', cat: 'phys', tier: 4, pattern: 'melee', power: 125, cd: 2.0, range: 56, radius: 56, arc: deg(120), recoil: 0.06, knock: 100, fx: 'hijump', desc: '跳起来用膝盖猛撞，会受到少量反作用伤害。' },
  { id: 'focus_blast', name: '真气弹', type: 'fighting', cat: 'spec', tier: 4, pattern: 'proj', power: 115, cd: 2.6, range: 190, speed: 190, size: 12, pierce: 2, fx: 'focusblast', desc: '集中精神发射威力巨大的气弹。' },

  // ---------- 毒 ----------
  { id: 'poison_sting', name: '毒针', type: 'poison', cat: 'phys', tier: 1, pattern: 'proj', power: 8, cd: 0.75, range: 150, speed: 300, size: 3, status: { kind: 'poison', chance: 0.3, dur: 3 }, fx: 'poisonsting', desc: '射出毒针，可能使敌人中毒。' },
  { id: 'acid', name: '溶解液', type: 'poison', cat: 'spec', tier: 1, pattern: 'proj', power: 7, cd: 0.9, range: 145, speed: 190, count: 2, spread: deg(20), size: 4, status: { kind: 'poison', chance: 0.2, dur: 3 }, fx: 'acid', desc: '喷出溶解液，可能使敌人中毒。' },
  { id: 'poison_jab', name: '毒击', type: 'poison', cat: 'phys', tier: 3, pattern: 'melee', power: 40, cd: 1.1, range: 40, radius: 40, arc: deg(100), status: { kind: 'poison', chance: 0.4, dur: 4 }, fx: 'poisonjab', desc: '用带毒的触手或手臂刺击。' },
  { id: 'sludge_wave', name: '污泥波', type: 'poison', cat: 'spec', tier: 4, pattern: 'nova', power: 80, cd: 2.4, range: 90, radius: 92, status: { kind: 'poison', chance: 0.3, dur: 4 }, fx: 'sludgewave', desc: '掀起污泥的巨浪冲刷四周。' },
  { id: 'gunk_shot', name: '垃圾射击', type: 'poison', cat: 'phys', tier: 4, pattern: 'strike', power: 100, cd: 2.4, range: 175, radius: 42, delay: 0.4, status: { kind: 'poison', chance: 0.4, dur: 4 }, fx: 'gunkshot', desc: '投掷大团污物，在落点炸开。' },

  // ---------- 地面 ----------
  { id: 'mud_slap', name: '掷泥', type: 'ground', cat: 'spec', tier: 1, pattern: 'proj', power: 8, cd: 0.85, range: 145, speed: 210, size: 4, status: { kind: 'slow', chance: 0.3, dur: 1.2, amount: 0.3 }, fx: 'mudslap', desc: '扔出泥巴，可能减速敌人。' },
  { id: 'bonemerang', name: '骨头回力镖', type: 'ground', cat: 'phys', tier: 2, pattern: 'proj', power: 13, cd: 1.1, range: 165, speed: 230, count: 2, spread: deg(14), pierce: 3, size: 5, fx: 'bonemerang', desc: '扔出 2 根骨头，贯穿多个敌人。' },
  { id: 'bulldoze', name: '重踏', type: 'ground', cat: 'phys', tier: 2, pattern: 'nova', power: 20, cd: 1.5, range: 62, radius: 64, status: { kind: 'slow', chance: 0.6, dur: 1.5, amount: 0.35 }, fx: 'bulldoze', desc: '用力踩踏地面，减速周围的敌人。' },
  { id: 'dig', name: '挖洞', type: 'ground', cat: 'phys', tier: 3, pattern: 'strike', power: 44, cd: 1.6, range: 165, radius: 34, delay: 0.5, fx: 'dig', desc: '钻进地下，从敌人脚下冲出来。' },
  { id: 'earth_power', name: '大地之力', type: 'ground', cat: 'spec', tier: 3, pattern: 'strike', power: 40, cd: 1.6, range: 175, radius: 42, delay: 0.35, fx: 'earthpower', desc: '让敌人脚下的大地爆发出力量。' },

  // ---------- 飞行 ----------
  { id: 'gust', name: '起风', type: 'flying', cat: 'spec', tier: 1, pattern: 'proj', power: 8, cd: 0.85, range: 150, speed: 200, size: 5, knock: 40, fx: 'gust', desc: '扇起强风攻击并吹退敌人。' },
  { id: 'peck', name: '啄', type: 'flying', cat: 'phys', tier: 1, pattern: 'melee', power: 10, cd: 0.7, range: 36, radius: 36, arc: deg(80), fx: 'peck', desc: '用尖嘴啄前方的敌人。' },
  { id: 'wing_attack', name: '翅膀攻击', type: 'flying', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 42, radius: 42, arc: deg(150), fx: 'wingattack', desc: '展开翅膀横扫前方。' },
  { id: 'aerial_ace', name: '燕返', type: 'flying', cat: 'phys', tier: 2, pattern: 'proj', power: 18, cd: 1.0, range: 165, speed: 300, size: 5, homing: 10, fx: 'aerialace', desc: '必中的高速斩击，强力追踪。' },
  { id: 'drill_peck', name: '啄钻', type: 'flying', cat: 'phys', tier: 3, pattern: 'melee', power: 42, cd: 1.1, range: 42, radius: 42, arc: deg(90), crit: 15, fx: 'drillpeck', desc: '像钻头一样旋转着啄击。' },
  { id: 'hurricane', name: '暴风', type: 'flying', cat: 'spec', tier: 4, pattern: 'zone', power: 14, cd: 3.2, range: 175, radius: 44, duration: 3, tick: 0.3, status: { kind: 'stun', chance: 0.15, dur: 0.5 }, fx: 'hurricane', desc: '在敌人处卷起持续 3 秒的暴风。' },
  { id: 'brave_bird', name: '勇鸟猛攻', type: 'flying', cat: 'phys', tier: 4, pattern: 'melee', power: 120, cd: 1.8, range: 50, radius: 50, arc: deg(160), recoil: 0.06, knock: 90, fx: 'bravebird', desc: '收起翅膀低空猛冲，会受到少量反作用伤害。' },

  // ---------- 超能力 / 虫 ----------
  { id: 'hypnosis', name: '催眠术', type: 'psychic', cat: 'spec', tier: 2, pattern: 'proj', power: 4, cd: 2.5, range: 160, speed: 170, size: 6, homing: 4, status: { kind: 'sleep', chance: 0.8, dur: 1.2 }, fx: 'hypnosis', desc: '发出催眠的波动，让敌人睡着（短暂定身）。' },
  { id: 'bug_bite', name: '虫咬', type: 'bug', cat: 'phys', tier: 1, pattern: 'melee', power: 11, cd: 0.8, range: 32, radius: 32, arc: deg(100), fx: 'bugbite', desc: '用小小的颚咬住敌人。' },
  { id: 'struggle_bug', name: '虫之抵抗', type: 'bug', cat: 'spec', tier: 1, pattern: 'proj', power: 7, cd: 0.8, range: 145, speed: 210, count: 2, spread: deg(22), size: 3, status: { kind: 'slow', chance: 0.25, dur: 1.2, amount: 0.3 }, fx: 'strugglebug', desc: '拼命抵抗，可能减速敌人。' },
  { id: 'pin_missile', name: '飞弹针', type: 'bug', cat: 'phys', tier: 2, pattern: 'proj', power: 7, cd: 1.0, range: 160, speed: 280, count: 4, spread: deg(26), size: 3, fx: 'pinmissile', desc: '连续射出 4 根尖针。' },
  { id: 'signal_beam', name: '信号光束', type: 'bug', cat: 'spec', tier: 2, pattern: 'beam', power: 20, cd: 1.2, range: 145, width: 9, status: { kind: 'stun', chance: 0.15, dur: 0.5 }, fx: 'signalbeam', desc: '发射奇特的光束，可能使敌人混乱。' },
  { id: 'x_scissor', name: '十字剪', type: 'bug', cat: 'phys', tier: 3, pattern: 'melee', power: 44, cd: 1.2, range: 44, radius: 44, arc: deg(140), crit: 10, fx: 'xscissor', desc: '镰刀或爪子交叉劈下。' },
  { id: 'bug_buzz', name: '虫鸣', type: 'bug', cat: 'spec', tier: 3, pattern: 'nova', power: 32, cd: 1.8, range: 72, radius: 74, knock: 50, fx: 'bugbuzz', desc: '振动翅膀发出刺耳的声波。' },
  { id: 'megahorn', name: '超级角击', type: 'bug', cat: 'phys', tier: 4, pattern: 'melee', power: 115, cd: 1.9, range: 54, radius: 54, arc: deg(120), knock: 120, fx: 'megahorn', desc: '用坚硬的大角全力冲撞。' },

  // ---------- 岩石 ----------
  { id: 'rock_throw', name: '落石', type: 'rock', cat: 'phys', tier: 1, pattern: 'strike', power: 12, cd: 1.0, range: 150, radius: 18, delay: 0.35, fx: 'rockthrow', desc: '扔出一块石头砸向敌人。' },
  { id: 'rock_tomb', name: '岩石封锁', type: 'rock', cat: 'phys', tier: 2, pattern: 'strike', power: 20, cd: 1.5, range: 160, radius: 24, delay: 0.4, strikes: 2, status: { kind: 'slow', chance: 0.6, dur: 2, amount: 0.4 }, fx: 'rocktomb', desc: '落下 2 块岩石，困住并减速敌人。' },
  { id: 'ancient_power', name: '原始之力', type: 'rock', cat: 'spec', tier: 2, pattern: 'proj', power: 10, cd: 1.2, range: 155, speed: 200, count: 3, spread: deg(30), size: 5, fx: 'ancientpower', desc: '用远古的力量发射 3 块岩石。' },
  { id: 'power_gem', name: '力量宝石', type: 'rock', cat: 'spec', tier: 3, pattern: 'beam', power: 34, cd: 1.4, range: 160, width: 12, fx: 'powergem', desc: '发射宝石般闪耀的光芒。' },
  { id: 'stone_edge', name: '尖石攻击', type: 'rock', cat: 'phys', tier: 4, pattern: 'nova', power: 85, cd: 2.4, range: 74, radius: 76, crit: 20, fx: 'stoneedge', desc: '让尖锐的岩石从四周刺出，容易击中要害。' },

  // ---------- 幽灵 ----------
  { id: 'lick', name: '舌舔', type: 'ghost', cat: 'phys', tier: 1, pattern: 'melee', power: 9, cd: 0.8, range: 32, radius: 32, arc: deg(90), status: { kind: 'para', chance: 0.3, dur: 2 }, fx: 'lick', desc: '用长长的舌头舔，可能麻痹敌人。' },
  { id: 'night_shade', name: '黑夜魔影', type: 'ghost', cat: 'spec', tier: 1, pattern: 'proj', power: 9, cd: 0.9, range: 155, speed: 180, size: 4, homing: 4, fx: 'nightshade', desc: '让敌人看见恐怖的幻影，会轻微追踪。' },
  { id: 'shadow_claw', name: '暗影爪', type: 'ghost', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 40, radius: 40, arc: deg(130), crit: 10, fx: 'shadowclaw', desc: '用影子做成的利爪撕裂前方。' },
  { id: 'hex', name: '祸不单行', type: 'ghost', cat: 'spec', tier: 2, pattern: 'zone', power: 6, cd: 2.8, range: 165, radius: 32, duration: 3, tick: 0.5, fx: 'hex', desc: '在敌人脚下留下持续 3 秒的诅咒。' },
  { id: 'shadow_force', name: '暗影潜袭', type: 'ghost', cat: 'phys', tier: 4, pattern: 'strike', power: 100, cd: 2.4, range: 180, radius: 42, delay: 0.6, fx: 'shadowforce', desc: '消失在影子里，片刻后从敌人身边现身攻击。' },

  // ---------- 龙 / 恶 / 钢 ----------
  { id: 'twister', name: '龙卷风', type: 'dragon', cat: 'spec', tier: 2, pattern: 'zone', power: 6, cd: 2.8, range: 165, radius: 34, duration: 2.5, tick: 0.4, status: { kind: 'stun', chance: 0.12, dur: 0.4 }, fx: 'twister', desc: '卷起龙卷风，可能使敌人畏缩。' },
  { id: 'dragon_rage', name: '龙之怒', type: 'dragon', cat: 'spec', tier: 2, pattern: 'proj', power: 18, cd: 1.2, range: 160, speed: 200, size: 6, pierce: 1, fx: 'dragonrage', desc: '喷出愤怒的龙之火焰。' },
  { id: 'dragon_pulse', name: '龙之波动', type: 'dragon', cat: 'spec', tier: 3, pattern: 'beam', power: 36, cd: 1.4, range: 165, width: 14, fx: 'dragonpulse', desc: '从口中发射冲击波。' },
  { id: 'outrage', name: '逆鳞', type: 'dragon', cat: 'phys', tier: 4, pattern: 'nova', power: 100, cd: 2.2, range: 66, radius: 68, knock: 90, fx: 'outrage', desc: '在愤怒中大闹一番，攻击周围所有敌人。' },
  { id: 'dragon_dance', name: '龙之舞', type: 'dragon', cat: 'status', tier: 3, pattern: 'buff', power: 0, cd: 10, range: 130, buff: { haste: 25, spe: 30, dur: 5 }, fx: 'buff', desc: '跳起神秘的舞蹈，5 秒内速度与技能急速提升。' },
  { id: 'night_slash', name: '暗袭要害', type: 'dark', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 42, radius: 42, arc: deg(130), crit: 25, fx: 'nightslash', desc: '抓住瞬间的破绽劈砍，很容易击中要害。' },
  { id: 'crunch', name: '咬碎', type: 'dark', cat: 'phys', tier: 3, pattern: 'melee', power: 44, cd: 1.1, range: 38, radius: 38, arc: deg(100), status: { kind: 'stun', chance: 0.2, dur: 0.5 }, fx: 'crunch', desc: '用利牙咬碎敌人。' },
  { id: 'steel_wing', name: '钢翼', type: 'steel', cat: 'phys', tier: 2, pattern: 'melee', power: 22, cd: 1.0, range: 42, radius: 42, arc: deg(150), fx: 'steelwing', desc: '用坚硬的翅膀横扫前方。' },
  { id: 'iron_defense', name: '铁壁', type: 'steel', cat: 'status', tier: 2, pattern: 'shield', power: 0, cd: 10, range: 130, shield: 0.25, duration: 5, fx: 'shield', desc: '让身体变得像铁一样硬，获得 25% 最大HP 的护盾。' },
  { id: 'flash_cannon', name: '加农光炮', type: 'steel', cat: 'spec', tier: 3, pattern: 'beam', power: 36, cd: 1.4, range: 165, width: 12, fx: 'flashcannon', desc: '把光汇聚起来一口气发射出去。' },
  { id: 'meteor_mash', name: '彗星拳', type: 'steel', cat: 'phys', tier: 4, pattern: 'melee', power: 110, cd: 1.9, range: 50, radius: 50, arc: deg(140), knock: 100, fx: 'meteormash', desc: '像彗星一样的铁拳。' },

  // ---------- 妖精 ----------
  { id: 'fairy_wind', name: '妖精之风', type: 'fairy', cat: 'spec', tier: 1, pattern: 'proj', power: 7, cd: 0.8, range: 150, speed: 210, count: 2, spread: deg(18), size: 4, fx: 'fairywind', desc: '刮起妖精之风攻击敌人。' },
  { id: 'disarming_voice', name: '魅惑之声', type: 'fairy', cat: 'spec', tier: 2, pattern: 'nova', power: 18, cd: 1.3, range: 60, radius: 62, fx: 'disarm', desc: '发出迷人的声音，伤害周围的敌人。' },
  { id: 'draining_kiss', name: '吸取之吻', type: 'fairy', cat: 'spec', tier: 2, pattern: 'proj', power: 15, cd: 1.2, range: 155, speed: 200, size: 5, homing: 4, status: { kind: 'leech', chance: 1, dur: 3 }, heal: 0.6, fx: 'drainkiss', desc: '用一个吻吸取敌人的 HP，持续为自己回复。' },
  { id: 'dazzling_gleam', name: '魔法闪耀', type: 'fairy', cat: 'spec', tier: 3, pattern: 'nova', power: 34, cd: 1.8, range: 76, radius: 78, fx: 'dazzle', desc: '向四周释放强光。' },
  { id: 'play_rough', name: '嬉闹', type: 'fairy', cat: 'phys', tier: 3, pattern: 'melee', power: 44, cd: 1.2, range: 42, radius: 42, arc: deg(160), fx: 'playrough', desc: '和敌人嬉闹着扭打成一团。' },
  { id: 'moonblast', name: '月亮之力', type: 'fairy', cat: 'spec', tier: 4, pattern: 'proj', power: 105, cd: 2.4, range: 190, speed: 190, size: 12, pierce: 3, fx: 'moonblast', desc: '借用月亮的力量发射光球。' },
  { id: 'moonlight', name: '月光', type: 'fairy', cat: 'status', tier: 3, pattern: 'heal', power: 0, cd: 11, range: 0, heal: 0.22, fx: 'heal', desc: '沐浴月光，回复 22% 最大HP。' },

  // ---------- 远程的物理招式（让物攻高的宝可梦不必总是贴身肉搏） ----------
  { id: 'spike_cannon', name: '针刺加农炮', type: 'normal', cat: 'phys', tier: 2, pattern: 'proj', power: 7, cd: 1.0, range: 160, speed: 280, count: 4, spread: deg(24), size: 3, fx: 'spikecannon', desc: '连续发射 4 根尖刺。' },
  { id: 'egg_bomb', name: '炸蛋', type: 'normal', cat: 'phys', tier: 3, pattern: 'strike', power: 40, cd: 1.6, range: 170, radius: 38, delay: 0.4, fx: 'eggbomb', desc: '扔出巨大的蛋，在落点爆炸。' },
  { id: 'vacuum_wave', name: '真空波', type: 'fighting', cat: 'phys', tier: 1, pattern: 'proj', power: 8, cd: 0.7, range: 150, speed: 320, size: 4, fx: 'vacuum', desc: '挥拳打出真空的波动，冷却很短。' },
  { id: 'seismic_toss', name: '地球上投', type: 'fighting', cat: 'phys', tier: 2, pattern: 'strike', power: 24, cd: 1.4, range: 160, radius: 28, delay: 0.45, knock: 60, fx: 'seismic', desc: '抓住远处的敌人狠狠摔在地上。' },
  { id: 'pursuit', name: '追打', type: 'dark', cat: 'phys', tier: 1, pattern: 'proj', power: 9, cd: 0.8, range: 160, speed: 300, size: 4, homing: 10, fx: 'pursuit', desc: '追上逃走的敌人攻击，强力追踪。' },
  { id: 'aqua_jet', name: '水流喷射', type: 'water', cat: 'phys', tier: 1, pattern: 'proj', power: 9, cd: 0.6, range: 150, speed: 330, size: 4, fx: 'aquajet', desc: '以迅雷不及掩耳之势射出水流，冷却很短。' },
  { id: 'bullet_punch', name: '子弹拳', type: 'steel', cat: 'phys', tier: 1, pattern: 'proj', power: 9, cd: 0.6, range: 150, speed: 340, size: 3, fx: 'bulletpunch', desc: '像子弹一样快的拳击，冷却很短。' },
  { id: 'gyro_ball', name: '陀螺球', type: 'steel', cat: 'phys', tier: 3, pattern: 'proj', power: 36, cd: 1.3, range: 165, speed: 170, size: 8, pierce: 2, fx: 'gyroball', desc: '高速旋转的钢球，能贯穿敌人。' },
  { id: 'dragon_darts', name: '龙箭', type: 'dragon', cat: 'phys', tier: 3, pattern: 'proj', power: 22, cd: 1.2, range: 170, speed: 300, count: 2, spread: deg(10), size: 4, homing: 6, fx: 'dragondarts', desc: '射出 2 支会追踪敌人的龙之箭。' },
  { id: 'flame_wheel', name: '火焰轮', type: 'fire', cat: 'phys', tier: 2, pattern: 'proj', power: 20, cd: 1.2, range: 160, speed: 230, size: 7, pierce: 2, status: { kind: 'burn', chance: 0.2, dur: 3 }, fx: 'flamewheel', desc: '滚出燃烧的火轮，贯穿敌人并可能灼伤。' },
  { id: 'wild_charge', name: '疯狂伏特', type: 'electric', cat: 'phys', tier: 3, pattern: 'proj', power: 36, cd: 1.3, range: 165, speed: 260, size: 7, pierce: 2, status: { kind: 'para', chance: 0.2, dur: 2 }, fx: 'wildcharge', desc: '全身缠绕电流冲出一道电光，贯穿敌人。' },
];

/** 不需要贴身的攻击方式 */
export const RANGED_PATTERNS = new Set<Pattern>(['proj', 'beam', 'chain', 'strike', 'zone']);

/** 宝可梦的专属招式：只出现在指定宝可梦的技能表里（商店里仍然可能刷到） */
export const SIGNATURE: Record<string, string[]> = {
  volt_tackle: ['pikachu'], psystrike: ['mewtwo'], frenzy_plant: ['bulbasaur'], pay_day: ['meowth'], splash: ['magikarp'],
  sing: ['jigglypuff', 'clefairy', 'lapras', 'chansey'], explosion: ['geodude', 'voltorb', 'koffing', 'onix'],
  hyper_fang: ['rattata'], bonemerang: ['cubone'], crabhammer: ['krabby'], hypnosis: ['drowzee', 'gastly', 'exeggcute', 'poliwag', 'jynx'],
  egg_bomb: ['exeggcute', 'chansey'], spike_cannon: ['shellder', 'seel'], dragon_darts: ['dratini'],
};

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
  'e_fire', 'e_ice', 'e_leaf', 'e_mud', 'e_dragon', 'e_dark',
];
export const FX_INDEX: Record<string, number> = Object.fromEntries(FX_KINDS.map((k, i) => [k, i]));
