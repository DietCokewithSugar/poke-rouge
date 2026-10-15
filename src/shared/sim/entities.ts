import type { EnemyDef } from '../enemies';
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
  slots: number;
  invuln: number;
  shield: number;
  shieldT: number;
  buffT: number;
  buff: { haste: number; spe: number };
  slowT: number;
  slowAmt: number;
  regenAcc: number;
  lsWindow: number;
  lsCount: number;
  sashUsed: boolean;
  /** 特性「结实」每波只能触发一次 */
  sturdyUsed: boolean;
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
  lastPosT: number;
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

export interface StatusState {
  burn: number; burnDps: number; burnSrc: number;
  poison: number; poisonDps: number; poisonSrc: number;
  leech: number; leechDps: number; leechSrc: number; leechHeal: number;
  para: number;
  slow: number; slowAmt: number;
  freeze: number;
  stun: number;
  dotAcc: number;
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
}

export interface Pickup {
  id: number;
  kind: 'candy' | 'berry' | 'ball';
  x: number; y: number;
  value: number;
}

export interface PendingSpawn {
  t: number;
  id: string;
  x: number; y: number;
}

export type StatusApply = { kind: StatusKind; chance: number; dur?: number; amount?: number };
