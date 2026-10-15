/**
 * 道馆：关都地区的八个道馆。用背包里的宝可梦（和单挑一样三只同时上场）先打败道馆训练家，再挑战馆主，
 * 赢了就能得到徽章。每枚徽章永久提升一项能力，并提高馆主擅长的属性的技能伤害（冒险与对战都生效）。
 * 道馆要按顺序挑战；赢过的道馆可以随时再战（不会再给徽章）。
 */
import type { LineId } from './pokemon';
import type { Mods, TypeMods } from './stats';
import { TYPES, rawEffectiveness, type PType } from './types';

export interface GymTrainer {
  name: string;
  /** 称号（道馆训练家的职业） */
  title: string;
  /** 立绘（public/trainers/<art>.png） */
  art: string;
  team: LineId[];
  level: number;
  /** 开战前 / 你赢了以后 / 你输了以后 */
  intro: string;
  lose: string;
  win: string;
}

export interface GymDef {
  id: string;
  /** 第几个道馆（1~8） */
  no: number;
  name: string;
  type: PType;
  badge: { name: string; icon: string; color: string; mods: Partial<Mods>; typeMods: TypeMods };
  leader: GymTrainer & { rematch: string };
  junior: GymTrainer;
  /** 馆主宝可梦的研究所强化等级 */
  meta: Record<string, number>;
  /** 第一次拿到徽章时的星之沙 */
  reward: number;
}

const lab = (n: number) => ({ hp: n, atk: n, spa: n, def: n, spd: n, spe: Math.min(8, n) });

export const GYMS: GymDef[] = [
  {
    id: 'pewter', no: 1, name: '深灰道馆', type: 'rock', meta: lab(1), reward: 60,
    badge: { name: '灰色徽章', icon: 'badge_boulder', color: '#a8a8b8', mods: { defPct: 6, maxHp: 4 }, typeMods: { rock: 8 } },
    junior: {
      name: '阿亮', title: '露营男孩', art: 'camper', team: ['sandshrew', 'diglett'], level: 6,
      intro: '站住！想见小刚老大，先过我这关！……先说好，输了不许笑我的帐篷。',
      lose: '我的帐篷……我是说我的宝可梦！去吧去吧，老大在里面数石头呢。',
      win: '哈哈！回去多练练吧，顺便帮我把帐篷收一下。',
    },
    leader: {
      name: '小刚', title: '深灰道馆馆主', art: 'brock', team: ['geodude', 'onix', 'kabuto'], level: 9,
      intro: '我是深灰道馆的馆主小刚！我的岩石宝可梦就像我的眼睛一样——你永远不知道它们是不是睁着的。',
      lose: '你的意志比岩石还坚硬！这枚灰色徽章送给你……对了，你有没有姐姐？',
      win: '坚如磐石！要打倒我，至少得先学会对付岩石……听说水系和草系挺好用的。',
      rematch: '又来了？正好，我新学了一道菜，打完请你尝尝。',
    },
  },
  {
    id: 'cerulean', no: 2, name: '华蓝道馆', type: 'water', meta: lab(2), reward: 80,
    badge: { name: '蓝色徽章', icon: 'badge_cascade', color: '#58a8f8', mods: { regen: 2, spdPct: 4 }, typeMods: { water: 8 } },
    junior: {
      name: '小望', title: '泳装少女', art: 'swimmer', team: ['horsea', 'tentacool'], level: 10,
      intro: '这里是华蓝道馆！先说好：泳池边不许跑，不许跳水，不许赢我！',
      lose: '呜……我刚做的头发！小霞姐姐在跳台那边等你。',
      win: '扑通——你被冲走啦！去换身干衣服再来吧。',
    },
    leader: {
      name: '小霞', title: '华蓝道馆馆主', art: 'misty', team: ['staryu', 'psyduck', 'goldeen'], level: 13,
      intro: '我是小霞！我的方针是用水系宝可梦全力进攻！……还有，你没骑着我的自行车来吧？',
      lose: '可恶，竟然输了！蓝色徽章给你。哼，我才不是被可达鸭拖了后腿呢！',
      win: '这就是华蓝人鱼的实力！你的宝可梦都湿透了，快带它们去宝可梦中心吧。',
      rematch: '可达鸭又头痛了，正好拿你来练练手！',
    },
  },
  {
    id: 'vermilion', no: 3, name: '枯叶道馆', type: 'electric', meta: lab(3), reward: 100,
    badge: { name: '橙色徽章', icon: 'badge_thunder', color: '#f8a040', mods: { spePct: 6, haste: 3 }, typeMods: { electric: 8 } },
    junior: {
      name: '阿雷', title: '摇滚歌手', art: 'rocker', team: ['voltorb', 'magnemite'], level: 14,
      intro: '嘿！准备好被电到了吗？我的吉他每弹一个音，整栋楼就跳一次闸！',
      lose: '弦……弦断了……马志士少校的门锁开关藏在垃圾桶里，别说是我告诉你的！',
      win: '这就是摇滚！你的发型现在应该挺炸的。',
    },
    leader: {
      name: '马志士', title: '枯叶道馆馆主', art: 'surge', team: ['voltorb', 'pikachu', 'electabuzz'], level: 17,
      intro: '嘿，小鬼！在战场上，电系宝可梦救过我的命，顺便也把我的头发烫成了这样！',
      lose: '哇哦！你真是个了不起的战士！橙色徽章拿去吧……顺便借我把梳子。',
      win: '哈哈哈！被电麻了吧？下次记得带上地面系的宝可梦，小鬼！',
      rematch: '又是你！来吧，这次我把电压调高了！',
    },
  },
  {
    id: 'celadon', no: 4, name: '玉虹道馆', type: 'grass', meta: lab(4), reward: 120,
    badge: { name: '彩虹徽章', icon: 'badge_rainbow', color: '#78d050', mods: { maxHp: 8, regen: 1 }, typeMods: { grass: 8 } },
    junior: {
      name: '花子', title: '美女', art: 'beauty', team: ['paras', 'exeggcute'], level: 18,
      intro: '欢迎来到玉虹道馆～请先在门口闻一闻香水……啊，那瓶好像是臭臭花的。',
      lose: '哎呀，花瓣都掉光了。莉佳大人在后面插花，请小声一点哦。',
      win: '呼呼～你被花粉迷住了吧？回去好好打个喷嚏吧。',
    },
    leader: {
      name: '莉佳', title: '玉虹道馆馆主', art: 'erika', team: ['bellsprout', 'tangela', 'oddish'], level: 21,
      intro: '啊……今天天气真好，我刚才不小心睡着了……你好，我是莉佳。要来比试一下吗？',
      lose: '哎呀……我输了呢。这枚彩虹徽章给你，请好好爱护花草……还有，别吵醒我。',
      win: '呼……刚才打赢了吗？抱歉，我好像又睡着了一会儿……',
      rematch: 'zzz……啊，是你呀。稍等，我先把这盆花浇完。',
    },
  },
  {
    id: 'fuchsia', no: 5, name: '浅红道馆', type: 'poison', meta: lab(5), reward: 140,
    badge: { name: '粉红徽章', icon: 'badge_soul', color: '#f080b8', mods: { dodge: 3, crit: 2 }, typeMods: { poison: 8 } },
    junior: {
      name: '阿杏', title: '忍者见习生', art: 'janine', team: ['zubat', 'ekans'], level: 22,
      intro: '嘿嘿，你居然看得到我？……不对，我们道馆的墙是透明的，你本来就看得到。',
      lose: '可恶！爸爸——不对，阿桔大人就在里面，小心别撞上看不见的墙！',
      win: '忍法·让你迷路！出口在……嗯，我也忘了。',
    },
    leader: {
      name: '阿桔', title: '浅红道馆馆主', art: 'koga', team: ['koffing', 'grimer', 'venonat'], level: 25,
      intro: '呼哈哈哈！我是忍者阿桔，擅长用毒和花招！……刚才那声笑是我在练习，不算数。',
      lose: '呼……竟然看穿了我的忍术！粉红徽章拿去吧。这件事不要告诉我女儿阿杏，好吗？',
      win: '中毒的滋味如何？别担心，门口的自动贩卖机有解毒药……昨天就卖完了。',
      rematch: '呼哈哈哈！这次我换了一种新毒……其实还是同一种，只是换了个瓶子。',
    },
  },
  {
    id: 'saffron', no: 6, name: '金黄道馆', type: 'psychic', meta: lab(6), reward: 160,
    badge: { name: '金色徽章', icon: 'badge_marsh', color: '#f8d030', mods: { spaPct: 6, haste: 2 }, typeMods: { psychic: 8 } },
    junior: {
      name: '阿念', title: '超能力者', art: 'psychic', team: ['slowpoke', 'jynx'], level: 27,
      intro: '我已经预知到你会来……也预知到你会输！……咦？预言的后半段有点模糊。',
      lose: '怎么会……我的勺子明明弯得很标准！娜姿大人在传送点的尽头等你。',
      win: '看吧，我早就预知到了！……其实是猜的。',
    },
    leader: {
      name: '娜姿', title: '金黄道馆馆主', art: 'sabrina', team: ['abra', 'mr_mime', 'drowzee'], level: 30,
      intro: '我早就知道你会来。三年前我就预知到了，所以提前订好了外卖。',
      lose: '这个结果……我没有预见到。金色徽章给你。没关系，至少外卖还是热的。',
      win: '一切都在我的预料之中。你接下来会说「再来一次」——你看，我就知道。',
      rematch: '你要说的话我都知道了。那我们直接开始吧。',
    },
  },
  {
    id: 'cinnabar', no: 7, name: '红莲道馆', type: 'fire', meta: lab(7), reward: 180,
    badge: { name: '深红徽章', icon: 'badge_volcano', color: '#f05838', mods: { atkPct: 6, crit: 2 }, typeMods: { fire: 8 } },
    junior: {
      name: '阿尔', title: '研究员', art: 'scientist', team: ['vulpix', 'ponyta'], level: 34,
      intro: '第一题：什么属性克制火系？……答对了也不会让你过去，我只是想考考你！',
      lose: '答……答错的是我！夏伯馆主就在火山口边上，他的题更难！',
      win: '回答错误！正确答案是：不要挑战我。',
    },
    leader: {
      name: '夏伯', title: '红莲道馆馆主', art: 'blaine', team: ['growlithe', 'ponyta', 'magmar'], level: 37,
      intro: '哇哈哈！我是热血的猜谜王夏伯！我的火焰会把你烧得连烧伤药都来不及喝！',
      lose: '我被烧得一干二净了！深红徽章送给你！……能帮我找找我的墨镜吗？',
      win: '哇哈哈！烤熟了吧！记住：下次带上灭火器……我是说，水系宝可梦！',
      rematch: '猜谜时间！什么东西越烧越旺？答案是——我对战斗的热情！',
    },
  },
  {
    id: 'viridian', no: 8, name: '常磐道馆', type: 'ground', meta: lab(9), reward: 240,
    badge: { name: '绿色徽章', icon: 'badge_earth', color: '#58b858', mods: { dmg: 4, dmgBoss: 6 }, typeMods: { ground: 8 } },
    junior: {
      name: '阿武', title: '空手王', art: 'blackbelt', team: ['machop', 'cubone'], level: 42,
      intro: '哈！我在这里修行了十年，每天劈一百块砖！……今天还没劈，你来当第一块吧！',
      lose: '嘿呀！……被劈开的是我。坂木大人在最里面，他好像不太喜欢小孩子……',
      win: '哈！今天的第一块砖，谢谢配合！',
    },
    leader: {
      name: '坂木', title: '常磐道馆馆主', art: 'giovanni', team: ['rhyhorn', 'nidoran_m', 'nidoran_f'], level: 46,
      intro: '欢迎来到常磐道馆。我平时很忙……忙什么？火箭队的——咳，商业机密。',
      lose: '哈，精彩的对战。绿色徽章是你的了。……顺便一提，火箭队正在招人，待遇很好哦。',
      win: '看来你还不够格。回去吧，这里不是小孩子来的地方……出去的时候小心别踩到地鼠。',
      rematch: '又是你？好吧，我今天正好没有……别的工作。',
    },
  },
];

export const GYM_BY_ID: Record<string, GymDef> = Object.fromEntries(GYMS.map((g) => [g.id, g]));

/** 道馆向导：站在道馆门口给大家加油的大叔 */
export const GUIDE = {
  name: '道馆向导',
  art: 'npc_guide',
  hello: '哟！未来的冠军！这里是宝可梦道馆：挑战八位道馆馆主收集徽章，或者去对战场和其他训练家排位。我就在这儿给大家加油……顺便卖点矿泉水。',
  done: '八枚徽章都集齐了！你已经是真正的宝可梦训练家了……要买瓶矿泉水庆祝一下吗？',
};

/** 存档与联机协议里的徽章键（和研究所强化一起发给服务器，开局时加到宝可梦身上） */
export const badgeKey = (id: string) => `badge_${id}`;

/** 克制这个属性的属性（道馆向导的建议） */
export function counters(t: PType): PType[] {
  return TYPES.filter((a) => rawEffectiveness(a, [t]) > 1);
}

/** 按顺序挑战：前一个道馆的徽章拿到了才能挑战下一个 */
export function gymOpen(badges: Record<string, number>, g: GymDef): boolean {
  return g.no === 1 || !!badges[GYMS[g.no - 2].id];
}

/** 下一个要挑战的道馆（全部拿到时为 null） */
export function nextGym(badges: Record<string, number>): GymDef | null {
  return GYMS.find((g) => !badges[g.id]) ?? null;
}
