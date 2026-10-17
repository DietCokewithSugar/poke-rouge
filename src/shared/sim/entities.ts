import type { AbilityDef } from '../abilities';
import type { EnemyDef } from '../enemies';
import type { FieldId } from '../fields';
import type { BoostId, PickupKind } from '../pickups';
import type { LineId } from '../pokemon';
import type { SkillDef, StatusKind } from '../skills';
import type { Derived, Mods, TypeMods } from '../stats';
import type { PType } from '../types';

export interface WaveLog { w: number; kills: number; dmg: number; taken: number; time: number }

export interface OwnedSkill {
  id: string;
  lv: number;
  cd: number;
}

/** 升级时可选的卡片 */
export type LevelCard =
  | { kind: 'stat'; stat: keyof Mods; amount: number; tier: number; name: string }
  | { kind: 'skill'; skill: string; upgrade: boolean; tier: number };

export type ShopOffer =
  | { kind: 'item'; id: string; price: number; tier: number }
  | { kind: 'skill'; id: string; price: number; tier: number };

export interface ShopState {
  offers: (ShopOffer | null)[];
  locked: boolean[];
  rerolls: number;
  freeRerolls: number;
}

/** 撤销上一次购买所需的快照 */
export interface UndoBuy {
  label: string;
  idx: number;
  money: number;
  moneySpent: number;
  items: Record<string, number>;
  skills: OwnedSkill[];
  offers: (ShopOffer | null)[];
  locked: boolean[];
  crates: string[];
  flags: { foreignSkill: boolean; skillsFull: boolean; maxItems: number };
}

export interface SimPlayer {
  id: number;
  name: string;
  /** 对战中的队伍（冒险模式全员为 0） */
  team: number;
  /** 由服务器控制走位的 AI 训练家 */
  bot: boolean;
  /** 联机时离开了房间（断线或主动离开）：走位、商店都由 AI 代替，等他回来 */
  away: boolean;
  /** 训练家（加成在 metaMods / trainerTypeMods 里） */
  trainer: string;
  /** 这位玩家已经拥有的宝可梦（进化线）：没有的才会崇拜他 */
  owned: Set<string>;
  /** 已经拥有的闪光宝可梦（进化线），和普通的分开算 */
  ownedShiny: Set<string>;
  line: LineId;
  /** 闪光宝可梦：六项能力各 +1% */
  shiny: boolean;
  stage: number;
  level: number;
  xp: number;
  money: number;
  x: number; y: number;
  dir: number;
  moving: boolean;
  hp: number;
  alive: boolean;
  down: boolean;
  downT: number;
  revive: number;
  skills: OwnedSkill[];
  items: Record<string, number>;
  levelMods: Mods;
  metaMods: Partial<Mods>;
  trainerTypeMods: TypeMods;
  typeMods: TypeMods;
  d: Derived;
  /** 不算技能、特性、道具加成的承伤倍率（对手有破格时用） */
  baseTaken: { phys: number; spec: number };
  slots: number;
  invuln: number;
  shield: number;
  shieldT: number;
  buffT: number;
  buff: { haste: number; spe: number };
  /** 地图上的增幅种子：每种还剩几秒 */
  boosts: Record<BoostId, number>;
  /** 熔岩池的灼伤还剩几秒（离开熔岩后还会持续一会儿），fieldDot 是掉血的计时 */
  fieldBurn: number;
  fieldDot: number;
  /** 繁茂草丛的命中回复：这一秒从什么时候开始、已经回复了多少 */
  drainAt: number;
  drained: number;
  slowT: number;
  slowAmt: number;
  regenAcc: number;
  lsWindow: number;
  lsCount: number;
  sashUsed: boolean;
  /** 特性「结实」每波只能触发一次 */
  sturdyUsed: boolean;
  /** 现在生效的特性：自己的，加上复制来的；被梦幻的同步消去时为空 */
  ab: AbilityDef[];
  /** 复制、下载来的特性 id */
  copied: string[];
  /** 特性被对手的同步暂时消去 */
  suppressed: boolean;
  at: AbilityState;
  /** 异常状态（对战里和替身目标共用同一份） */
  st: StatusState;
  levelQueue: number[];
  cards: LevelCard[] | null;
  cardRerolls: number;
  crates: string[];
  /** 波次结束后要询问是否进化 */
  evoPrompt: boolean;
  shop: ShopState;
  /** 只能撤销最近一次购买 */
  undo: UndoBuy | null;
  ready: boolean;
  castFlag: number;
  /** 离开房间后，AI 上一次替他逛商店的时间（模拟时间） */
  autoShopAt: number;
  /** 客户端上报位置时允许移动的距离额度（防加速） */
  moveBudget: number;
  stats: {
    kills: number; damage: number; superEff: number; moneyEarned: number; revives: number;
    evolved: boolean; skillsFull: boolean; foreignSkill: boolean; bossKills: string[]; maxItems: number;
    // 结算界面用的详细统计
    killsBy: Record<string, number>;
    rankKills: { minion: number; elite: number; boss: number };
    skillDmg: Record<string, number>;
    taken: number; healed: number; crits: number; dodges: number; moneySpent: number;
    forms: number[];
    waves: WaveLog[];
    mark: { kills: number; damage: number; taken: number };
    /** 对战：击倒对手次数、被击倒次数 */
    kos: number;
    deaths: number;
    /** 本局结交的伙伴（进化线） */
    recruits: string[];
    /** 本局结交的闪光宝可梦（进化线） */
    shinyRecruits: string[];
  };
}

/** 特性用到的计时器与标记（秒） */
export interface AbilityState {
  /** 逃跑：加速还剩几秒、加速多少 % */
  moveT: number;
  moveAmt: number;
  /** 沙隐、拨沙：完全闪避还剩几秒 */
  evade: number;
  /** 愤怒穴位：全能力提升还剩几秒；之后的减速还剩几秒 */
  anger: number;
  angerSlow: number;
  /** 结实：霸体还剩几秒 */
  armor: number;
  /** 队友的友情防守给的物防特防加成：还剩几秒、多少 % */
  guard: number;
  guardAmt: number;
  /** 上一次有技能选中目标的时间（模拟时间）：友情防守的脱战回复 */
  combat: number;
  /** 特性的持续回复：计时与这一段累计的量 */
  regenT: number;
  /** 收获、生成场地、刷新复制的计时；上一次飘字说复制了什么的时间（模拟时间） */
  harvest: number;
  selfField: number;
  copyT: number;
  copyMsgAt: number;
  /** 这一波已经因为 HP 第一次低于一半生成过场地 / 已经引爆过 */
  lowField: boolean;
  aftermath: boolean;
  /** 脚下的场地（每帧更新） */
  field: FieldId | null;
  /** 站在对自己不利的场地里（每帧更新） */
  bad: boolean;
  /** 对战：有别的队友也有斗争心 */
  rivalAlly: boolean;
  /** 对战：己方在场的宝可梦比对手少 */
  outnumbered: boolean;
}

export interface StatusState {
  burn: number; burnDps: number; burnSrc: number;
  poison: number; poisonDps: number; poisonSrc: number;
  leech: number; leechDps: number; leechSrc: number; leechHeal: number;
  /** 麻痹；paraAmt 是减速的比例（技能的麻痹为 0，按默认的减速算） */
  para: number; paraAmt: number;
  slow: number; slowAmt: number;
  freeze: number;
  stun: number;
  /** 睡眠：定身且不能放技能 */
  sleep: number;
  /** 定身（着迷、沙穴）：不能移动，技能照常 */
  root: number;
  /** 毒刺的中毒：还剩几秒，已经扣了几次（5%、10%、15%），计时 */
  toxic: number; toxicN: number; toxicT: number; toxicSrc: number;
  /** 威吓：释放的技能伤害 ×(1 - weakAmt) */
  weak: number; weakAmt: number;
  /** 火焰之躯的烧伤：物理攻击伤害减半 */
  burnPhys: number;
  /** 诅咒之躯：技能冷却时间 +200% */
  cdUp: number;
  /** 日照：还剩几秒、减速层数、每层的减速、每秒损失最大 HP 的比例、是谁、掉血的计时 */
  sun: number; sunN: number; sunSlow: number; sunDot: number; sunSrc: number; sunT: number;
  dotAcc: number;
}

export function freshStatus(): StatusState {
  return {
    burn: 0, burnDps: 0, burnSrc: -1, poison: 0, poisonDps: 0, poisonSrc: -1, leech: 0, leechDps: 0, leechSrc: -1, leechHeal: 0,
    para: 0, paraAmt: 0, slow: 0, slowAmt: 0, freeze: 0, stun: 0, sleep: 0, root: 0,
    toxic: 0, toxicN: 0, toxicT: 0, toxicSrc: -1, weak: 0, weakAmt: 0, burnPhys: 0, cdUp: 0,
    sun: 0, sunN: 0, sunSlow: 0, sunDot: 0, sunSrc: -1, sunT: 0, dotAcc: 0,
  };
}

export function freshAbilityState(): AbilityState {
  return {
    moveT: 0, moveAmt: 0, evade: 0, anger: 0, angerSlow: 0, armor: 0, guard: 0, guardAmt: 0, combat: -99, regenT: 0,
    harvest: 0, selfField: 0, copyT: 0, copyMsgAt: -99, lowField: false, aftermath: false, field: null, bad: false, rivalAlly: false, outnumbered: false,
  };
}

/** 有没有陷入异常状态（威吓、诅咒这类特性带来的削弱不算） */
export function hasStatus(st: StatusState): boolean {
  return st.burn > 0 || st.poison > 0 || st.toxic > 0 || st.leech > 0 || st.para > 0 || st.slow > 0 || st.freeze > 0
    || st.stun > 0 || st.sleep > 0 || st.root > 0 || st.burnPhys > 0 || st.sun > 0;
}

/** 清掉所有异常状态（星桃果） */
export function cureStatus(st: StatusState) {
  const keep = { weak: st.weak, weakAmt: st.weakAmt, cdUp: st.cdUp };
  Object.assign(st, freshStatus(), keep);
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  kind: number;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  dmg: number;
  speed: number;
  r: number;
  st: StatusState;
  ai: { state: number; t: number; cd: number; cd2: number; tx: number; ty: number; ax: number; ay: number; n: number; flag: number };
  dir: number;
  hidden: boolean;
  lastHit: number;
  age: number;
  dead?: boolean;
  /** 闪光宝可梦：能力 +1%，打倒后一定会崇拜还没有它的训练家 */
  shiny?: boolean;
  /** 可被同一环绕弹体再次命中的时间 */
  orbitHit?: Map<number, number>;
  /** 对战：这个目标代表的玩家（伤害会转给该玩家） */
  pvp?: SimPlayer;
  /** 熔岩池的灼伤还剩几秒 */
  fieldBurn?: number;
  /** 繁茂草丛的命中回复：这一秒从什么时候开始、已经回复了多少 */
  drainAt?: number;
  drained?: number;
  /** 掉落的糖果（地狱、噩梦里进化出来的小怪按进化前算） */
  candy?: number;
}

/** 招式命中时还要结算的场地效果：暴击率（百分点）、命中回复的比例、命中减速 */
export interface HitFx {
  crit?: number;
  drain?: number;
  chill?: boolean;
}

export interface Proj {
  id: number;
  fx: string;
  owner: number;          // 玩家 id；敌人弹体为 -1
  skill: SkillDef | null;
  type: PType;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  dmg: number;
  pierce: number;
  life: number;
  homing: number;
  hit: Set<number>;
  slow?: number;
  orbit?: { ang: number; rad: number; spd: number };
  crit: number;
  knock: number;
  status?: SkillDef['status'];
  /** 场地效果：命中回复的比例、命中减速 */
  drain?: number;
  chill?: boolean;
  /** 敌人弹体：是谁射的（命中回复要回到它身上） */
  src?: number;
}

export interface Zone {
  id: number;
  fx: string;
  owner: number;          // -1：敌方毒雾，会伤害玩家
  skill: SkillDef | null;
  type: PType;
  x: number; y: number; r: number;
  life: number; maxLife: number;
  tick: number; t: number;
  dmg: number;
  /** 场地效果：暴击率（百分点）、命中回复、命中减速 */
  crit?: number;
  drain?: number;
  chill?: boolean;
}

export interface Strike {
  owner: number;
  skill: SkillDef | null;
  x: number; y: number; r: number;
  t: number;
  dmg: number;
  type: PType;
  fx: string;
  /** 敌方攻击：伤害玩家 */
  enemy?: boolean;
  cat: 'phys' | 'spec';
  /** 直线形（延迟光束）；r 为宽度 */
  line?: { ang: number; len: number };
  /** 场地效果：暴击率（百分点）、命中回复、命中减速；src 是出招的敌人 */
  crit?: number;
  drain?: number;
  chill?: boolean;
  src?: number;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number; y: number;
  value: number;
}

export interface PendingSpawn {
  t: number;
  id: string;
  x: number; y: number;
  candy?: number;
}

/** stacks、dot：日照的最多层数、每秒损失最大 HP 的比例 */
export type StatusApply = { kind: StatusKind; chance: number; dur?: number; amount?: number; stacks?: number; dot?: number };
