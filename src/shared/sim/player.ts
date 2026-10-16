import { ITEMS, ITEM_IDS, type ItemDef } from '../items';
import { metaBonus } from '../meta';
import { LINES, awakenings, formOf, isFinal, isNative, maxStageByLevel, type LineId } from '../pokemon';
import { SKILLS, SKILL_IDS, SKILL_MAX_LV } from '../skills';
import { BOOST_CRIT, BOOST_DODGE, BOOST_SPEED } from '../pickups';
import { MOVE_SPEED_MAX, addMods, addTypeMods, derive, emptyMods, type Mods, type TypeMods } from '../stats';
import { trainerOf } from '../trainers';
import { priceMult } from '../waves';
import type { SavedBuild } from '../pvp/build';
import type { LevelCard, ShopOffer, SimPlayer, UndoBuy } from './entities';
import type { GameSim } from './game';

export const SKILL_PRICE = [0, 22, 48, 88, 145];

export function xpToNext(level: number): number {
  return (level + 3) * (level + 3);
}

/** 玩家的身份：训练家、已经拥有的宝可梦（普通的和闪光的分开）、带来的是不是闪光宝可梦 */
export interface PlayerIdent { trainer?: string; owned?: Iterable<string>; ownedShiny?: Iterable<string>; shiny?: boolean }

export function createPlayer(sim: GameSim, id: number, name: string, line: LineId, meta: Record<string, number>, o: PlayerIdent = {}): SimPlayer {
  const mb = metaBonus(meta);
  const L = LINES[line];
  const T = trainerOf(o.trainer);
  const metaMods: Partial<Mods> = { ...mb.mods };
  for (const [k, v] of Object.entries(T.mods)) metaMods[k as keyof Mods] = (metaMods[k as keyof Mods] ?? 0) + (v ?? 0);
  const p: SimPlayer = {
    id, name, team: 0, bot: false, away: false, trainer: T.id, owned: new Set(o.owned ?? []), ownedShiny: new Set(o.ownedShiny ?? []),
    line, shiny: !!o.shiny, stage: 0, level: 1, xp: 0, money: 30 + mb.startMoney,
    x: sim.w / 2, y: sim.h / 2, dir: 0, moving: false,
    hp: 1, alive: true, down: false, downT: 0, revive: 0,
    skills: L.start.map((id, i) => ({ id, lv: 1, cd: 0.5 + i * 0.2 })),
    items: {},
    levelMods: emptyMods(),
    metaMods,
    trainerTypeMods: addTypeMods({ ...(T.typeMods ?? {}) }, mb.typeMods),
    typeMods: {},
    d: derive(formOf(line, 0).base, emptyMods()),
    slots: formOf(line, 0).slots,
    invuln: 1.5, shield: 0, shieldT: 0, buffT: 0, buff: { haste: 0, spe: 0 }, boosts: { crit: 0, dodge: 0, speed: 0 },
    fieldBurn: 0, fieldDot: 0, drainAt: -9, drained: 0,
    slowT: 0, slowAmt: 0, regenAcc: 0, lsWindow: 0, lsCount: 0, sashUsed: false, sturdyUsed: false,
    levelQueue: [], cards: null, cardRerolls: 0, crates: [], evoPrompt: false,
    shop: { offers: [], locked: [false, false, false, false], rerolls: 0, freeRerolls: 0 },
    undo: null,
    ready: false, castFlag: 0, autoShopAt: -1, moveBudget: 0,
    stats: {
      kills: 0, damage: 0, superEff: 0, moneyEarned: 0, revives: 0, evolved: false, skillsFull: false, foreignSkill: false, bossKills: [], maxItems: 0,
      killsBy: {}, rankKills: { minion: 0, elite: 0, boss: 0 }, skillDmg: {}, taken: 0, healed: 0, crits: 0, dodges: 0, moneySpent: 0,
      forms: [formOf(line, 0).dex], waves: [], mark: { kills: 0, damage: 0, taken: 0 }, kos: 0, deaths: 0, recruits: [], shinyRecruits: [],
    },
  };
  recompute(p);
  p.hp = p.d.maxHp;
  return p;
}

/** 按背包里保存的构筑创建玩家（对战用）。大木研究所的强化照常生效。 */
export function createPlayerFromBuild(sim: GameSim, id: number, name: string, b: SavedBuild, meta: Record<string, number>, trainer = ''): SimPlayer {
  const p = createPlayer(sim, id, name, b.line, meta, { trainer, shiny: !!b.shiny });
  p.stage = b.stage;
  p.level = b.level;
  p.items = Object.fromEntries(b.items.filter(([it, n]) => ITEMS[it] && n > 0));
  for (const [k, v] of Object.entries(b.levelMods)) p.levelMods[k as keyof Mods] += v ?? 0;
  p.skills = b.skills.filter((s) => SKILLS[s.id]).map((s, i) => ({ id: s.id, lv: Math.max(1, Math.min(SKILL_MAX_LV, s.lv)), cd: 0.6 + i * 0.25 }));
  p.stats.forms = [formOf(b.line, b.stage).dex];
  recompute(p);
  if (p.skills.length > p.slots) p.skills.length = p.slots;
  p.hp = p.d.maxHp;
  return p;
}

export function recompute(p: SimPlayer) {
  const L = LINES[p.line];
  const form = formOf(p.line, p.stage);
  const m: Mods = emptyMods();
  if (!(L.flags.modsStage0Only && p.stage > 0)) addMods(m, L.mods);
  addMods(m, p.metaMods);
  addMods(m, p.levelMods);
  const tm: TypeMods = { ...p.trainerTypeMods };
  const final = isFinal(p.line, p.stage);
  let itemCount = 0;
  for (const id in p.items) {
    const n = p.items[id];
    const it = ITEMS[id];
    if (!it || n <= 0) continue;
    itemCount += n;
    if (it.mods) addMods(m, it.mods, n);
    addTypeMods(tm, it.typeMods, n);
    if (it.special === 'eviolite' && !final) { m.defPct += 40; m.spdPct += 40; }
    if (it.special === 'everstone' && !final) { m.dmg += 10; m.xp += 15; }
    if (it.special === 'light_ball' && p.line === 'pikachu' && p.stage === 0) { m.atkPct += 20; m.spaPct += 20; }
  }
  const aw = awakenings(p.line, p.level);
  if (aw > 0) {
    const pct = aw * 10;
    m.atkPct += pct; m.spaPct += pct; m.defPct += pct; m.spdPct += pct; m.spePct += pct;
    m.maxHp += aw * 8;
  }
  if (p.buffT > 0) { m.haste += p.buff.haste; m.spePct += p.buff.spe; }
  if (p.boosts.crit > 0) m.crit += BOOST_CRIT;
  if (p.boosts.dodge > 0) m.dodge += BOOST_DODGE;
  m.maxHp += p.level - 1;
  const prevMax = p.d.maxHp;
  p.d = derive(form.base, m, p.shiny);
  if (p.boosts.speed > 0) p.d.moveSpeed = Math.max(p.d.moveSpeed, Math.min(MOVE_SPEED_MAX, p.d.moveSpeed * (1 + BOOST_SPEED)));
  p.typeMods = tm;
  p.slots = Math.max(1, form.slots + m.slots + (L.awakenSlot && aw >= L.awakenSlot ? 1 : 0));
  if (p.d.maxHp > prevMax && p.alive && !p.down) p.hp = Math.min(p.d.maxHp, p.hp + (p.d.maxHp - prevMax));
  p.hp = Math.min(p.hp, p.d.maxHp);
  p.stats.maxItems = Math.max(p.stats.maxItems, itemCount);
  if (p.skills.length >= p.slots) p.stats.skillsFull = true;
}

/** 增加经验；返回升了几级。进化在升级瞬间发生。 */
export function addXp(sim: GameSim, p: SimPlayer, amount: number): number {
  p.xp += amount;
  let ups = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    levelUp(sim, p);
    ups++;
  }
  return ups;
}

export function levelUp(sim: GameSim, p: SimPlayer) {
  const couldEvolve = canEvolve(p);
  p.level++;
  p.levelQueue.push(p.level);
  sim.emit(['lvl', p.id, p.level]);
  const awBefore = awakenings(p.line, p.level - 1);
  recompute(p);
  if (awakenings(p.line, p.level) > awBefore) {
    const f = formOf(p.line, p.stage);
    sim.emit(['evo', p.id, f.dex, p.line === 'mewtwo' ? '基因觉醒' : `${f.name}觉醒了！`]);
  }
  // 和原作一样，进化在战斗结束后发生，并且可以按 B 取消
  if (!couldEvolve && canEvolve(p)) {
    sim.emit(['evoReady', p.id, formOf(p.line, p.stage).name]);
    if (sim.phase === 'inter') p.evoPrompt = true;
  }
  if (p.alive && !p.down) p.hp = Math.min(p.d.maxHp, p.hp + 2);
}

/** 等级已经够了、还没有进化、也没有携带不变之石。 */
export function canEvolve(p: SimPlayer): boolean {
  if (p.items.everstone) return false;
  return p.stage < maxStageByLevel(p.line, p.level);
}

/** 玩家在波次之间选择是否进化。 */
export function chooseEvolution(sim: GameSim, p: SimPlayer, yes: boolean): string | null {
  if (!canEvolve(p)) { p.evoPrompt = false; return '现在还不能进化'; }
  if (yes) {
    evolve(sim, p);
    p.evoPrompt = canEvolve(p);
  } else {
    p.evoPrompt = false;
    sim.emit(['evoCancel', p.id]);
  }
  return null;
}

/** 进化：按等级进化到下一阶段，或用进化石进化到指定形态（伊布） */
export function evolve(sim: GameSim, p: SimPlayer, to = p.stage + 1) {
  const L = LINES[p.line];
  if (isFinal(p.line, p.stage) || to >= L.forms.length || to <= p.stage) return;
  const before = formOf(p.line, p.stage).name;
  p.stage = to;
  p.stats.evolved = true;
  const f = formOf(p.line, p.stage);
  p.stats.forms.push(f.dex);
  recompute(p);
  if (p.alive && !p.down) p.hp = p.d.maxHp;
  sim.emit(['evo', p.id, f.dex, `${before}进化成了${f.name}！`]);
}

// ---------------------------------------------------------------- 升级卡片

interface StatCardDef { stat: keyof Mods; name: string; per: number }
const STAT_CARDS: StatCardDef[] = [
  { stat: 'maxHp', name: 'HP增强剂', per: 4 },
  { stat: 'atk', name: '攻击增强剂', per: 5 },
  { stat: 'spa', name: '特攻增强剂', per: 5 },
  { stat: 'def', name: '防御增强剂', per: 5 },
  { stat: 'spd', name: '特防增强剂', per: 5 },
  { stat: 'spe', name: '速度增强剂', per: 5 },
  { stat: 'crit', name: '聚气', per: 3 },
  { stat: 'haste', name: 'PP提升剂', per: 5 },
  { stat: 'dodge', name: '影子分身', per: 2 },
  { stat: 'regen', name: '树果汁', per: 2 },
  { stat: 'lifesteal', name: '吸取', per: 2 },
  { stat: 'range', name: '锐利目光', per: 8 },
  { stat: 'luck', name: '幸运草', per: 5 },
  { stat: 'harvest', name: '捡拾', per: 4 },
];

function rollTier(sim: GameSim, p: SimPlayer, wave: number, levelBased = false): number {
  const x = levelBased ? p.level / 1.2 : wave;
  const luck = 1 + Math.max(-50, p.d.luck) / 100;
  const t4 = Math.min(0.1, Math.max(0, (x - 7) * 0.012)) * luck;
  const t3 = Math.min(0.28, Math.max(0, (x - 3) * 0.025)) * luck;
  const t2 = Math.min(0.6, Math.max(0, (x - 1) * 0.06)) * luck;
  const r = sim.rng.next();
  if (r < t4) return 4;
  if (r < t4 + t3) return 3;
  if (r < t4 + t3 + t2) return 2;
  return 1;
}

function skillCard(p: SimPlayer, skillId: string): LevelCard | null {
  const owned = p.skills.find((s) => s.id === skillId);
  if (owned && owned.lv >= SKILL_MAX_LV) return null;
  return { kind: 'skill', skill: skillId, upgrade: !!owned, tier: SKILLS[skillId].tier };
}

export function makeCards(sim: GameSim, p: SimPlayer, level: number): LevelCard[] {
  const cards: LevelCard[] = [];
  const L = LINES[p.line];
  const learn = L.learnset.find((e) => e.lv === level);
  if (learn) {
    const c = skillCard(p, learn.skill);
    if (c) cards.push(c);
  }
  const pool = sim.rng.shuffle(STAT_CARDS.slice());
  for (const s of pool) {
    if (cards.length >= 4) break;
    const tier = rollTier(sim, p, sim.wave, true);
    cards.push({ kind: 'stat', stat: s.stat, amount: s.per * tier, tier, name: s.name });
  }
  return cards;
}

export function nextCards(sim: GameSim, p: SimPlayer) {
  if (p.cards || p.levelQueue.length === 0) return;
  p.cards = makeCards(sim, p, p.levelQueue[0]);
}

export function cardRerollCost(sim: GameSim, p: SimPlayer) {
  return Math.round((2 + sim.wave * 0.7) * (1 + p.cardRerolls * 0.5));
}

export function pickCard(sim: GameSim, p: SimPlayer, idx: number, slot?: number): string | null {
  if (!p.cards) return '没有待选的升级';
  const c = p.cards[idx];
  if (!c) return '无效选项';
  if (c.kind === 'stat') {
    p.levelMods[c.stat] += c.amount;
  } else {
    const err = learnSkill(p, c.skill, slot);
    if (err) return err;
  }
  p.cards = null;
  p.levelQueue.shift();
  recompute(p);
  nextCards(sim, p);
  return null;
}

export function rerollCards(sim: GameSim, p: SimPlayer): string | null {
  if (!p.cards) return '没有待选的升级';
  const cost = cardRerollCost(sim, p);
  if (p.money < cost) return '金钱不足';
  p.money -= cost;
  p.stats.moneySpent += cost;
  p.cardRerolls++;
  p.cards = makeCards(sim, p, p.levelQueue[0]);
  return null;
}

/** 学习/强化技能。技能栏满时需要指定要替换的格子。 */
export function learnSkill(p: SimPlayer, id: string, slot?: number): string | null {
  const owned = p.skills.find((s) => s.id === id);
  if (owned) {
    if (owned.lv >= SKILL_MAX_LV) return '该技能已满级';
    owned.lv++;
    return null;
  }
  const native = isNative(p.line, id);
  if (p.skills.length < p.slots) {
    p.skills.push({ id, lv: 1, cd: 0.3 });
  } else {
    if (slot === undefined || slot < 0 || slot >= p.skills.length) return '技能栏已满，请选择要遗忘的技能';
    p.skills[slot] = { id, lv: 1, cd: 0.3 };
  }
  if (!native) p.stats.foreignSkill = true;
  if (p.skills.length >= p.slots) p.stats.skillsFull = true;
  return null;
}

// ---------------------------------------------------------------- 商店

function itemAllowed(p: SimPlayer, it: ItemDef): boolean {
  if (it.only && !it.only.includes(p.line)) return false;
  if (it.max && (p.items[it.id] ?? 0) >= it.max) return false;
  const finalForm = isFinal(p.line, p.stage);
  if (it.special === 'evo_stone' && (p.stage > 0 || p.items.everstone || LINES[p.line].stones?.[it.id] === undefined)) return false;
  if ((it.special === 'eviolite' || it.special === 'everstone') && finalForm) return false;
  if (it.special === 'light_ball' && p.stage > 0) return false;
  return true;
}

function rollOffer(sim: GameSim, p: SimPlayer): ShopOffer {
  const tier = rollTier(sim, p, sim.wave);
  const pm = priceMult(sim.wave) * (1 - p.d.discount);
  const form = formOf(p.line, p.stage);
  if (sim.rng.chance(0.38)) {
    const weights: Record<string, number> = {};
    const L = LINES[p.line];
    for (const id of SKILL_IDS) {
      const s = SKILLS[id];
      if (s.tier !== tier) continue;
      const owned = p.skills.find((o) => o.id === id);
      if (owned && owned.lv >= SKILL_MAX_LV) continue;
      // 技能种类很多，本系和自己技能表里的招式要明显更容易刷到
      let w = 1;
      if (form.types.includes(s.type)) w += 4;
      else if (s.type === L.bonusType) w += 2;
      if (L.learnset.some((e) => e.skill === id)) w += 2;
      if (owned) w += 3;
      weights[id] = w;
    }
    if (Object.keys(weights).length) {
      const id = sim.rng.weighted(weights);
      return { kind: 'skill', id, tier, price: Math.round(SKILL_PRICE[tier] * pm) };
    }
  }
  const pool = ITEM_IDS.filter((id) => ITEMS[id].tier === tier && itemAllowed(p, ITEMS[id]));
  const w: Record<string, number> = {};
  for (const id of pool) {
    const it = ITEMS[id];
    let wt = 1;
    // 本系属性道具更容易刷到
    if (it.typeMods && Object.keys(it.typeMods).some((t) => form.types.includes(t as never))) wt += 1.5;
    if (it.special === 'evo_stone') wt += 3;
    w[id] = wt;
  }
  const id = pool.length ? sim.rng.weighted(w) : 'big_charm';
  return { kind: 'item', id, tier: ITEMS[id].tier, price: Math.round(ITEMS[id].price * pm) };
}

/** 商品现在还能不能买：限持一个的道具已经有了、技能已经满级，都不能再买 */
function offerAllowed(p: SimPlayer, o: ShopOffer): boolean {
  if (o.kind === 'skill') return (p.skills.find((s) => s.id === o.id)?.lv ?? 0) < SKILL_MAX_LV;
  return itemAllowed(p, ITEMS[o.id]);
}

function rollSlot(sim: GameSim, p: SimPlayer, i: number) {
  const s = p.shop;
  let o = rollOffer(sim, p);
  for (let tries = 0; tries < 6 && s.offers.some((x, j) => j !== i && x && x.id === o.id && (j < i || s.locked[j])); tries++) o = rollOffer(sim, p);
  s.offers[i] = o;
  s.locked[i] = false;
}

export function rollShop(sim: GameSim, p: SimPlayer, keepLocked = true) {
  const s = p.shop;
  for (let i = 0; i < 4; i++) {
    const cur = s.offers[i];
    if (keepLocked && s.locked[i] && cur && offerAllowed(p, cur)) continue;
    rollSlot(sim, p, i);
  }
  // 保证用进化石进化的宝可梦（皮卡丘、伊布）迟早能买到进化石
  const stones = Object.keys(LINES[p.line].stones ?? {});
  if (stones.length && p.stage === 0 && !p.items.everstone && sim.wave >= 4 && !s.offers.some((o) => o && stones.includes(o.id)) && sim.rng.chance(0.3)) {
    const i = s.locked.findIndex((l) => !l);
    const id = sim.rng.pick(stones);
    if (i >= 0) s.offers[i] = { kind: 'item', id, tier: 2, price: Math.round(ITEMS[id].price * priceMult(sim.wave)) };
  }
}

/**
 * 已经不能再买的商品换成新的（例如刚从道具球里拿到了限持一个的道具），
 * 道具球里已经拿不了的道具也重新抽一个，不再出现重复的限持道具。
 */
export function refreshOffers(sim: GameSim, p: SimPlayer) {
  const s = p.shop;
  for (let i = 0; i < s.offers.length; i++) {
    const o = s.offers[i];
    if (o && !offerAllowed(p, o)) rollSlot(sim, p, i);
  }
  p.crates = p.crates.map((id) => (itemAllowed(p, ITEMS[id]) ? id : rollCrateItem(sim, p)));
}

export function rerollCost(sim: GameSim, p: SimPlayer): number {
  if (p.shop.freeRerolls > 0) return 0;
  const base = Math.max(1, Math.round(2 + sim.wave * 0.6));
  return base + p.shop.rerolls * Math.max(1, Math.round(sim.wave * 0.45));
}

export function shopReroll(sim: GameSim, p: SimPlayer): string | null {
  const cost = rerollCost(sim, p);
  if (p.money < cost) return '金钱不足';
  p.money -= cost;
  p.stats.moneySpent += cost;
  if (p.shop.freeRerolls > 0) p.shop.freeRerolls--;
  else p.shop.rerolls++;
  rollShop(sim, p);
  return null;
}

export function shopBuy(sim: GameSim, p: SimPlayer, idx: number, slot?: number): string | null {
  const o = p.shop.offers[idx];
  if (!o) return '已售罄';
  if (p.money < o.price) return '金钱不足';
  // 神奇糖果、进化石会立刻升级/进化，买了就不能撤销
  const special = o.kind === 'item' ? ITEMS[o.id].special : undefined;
  const undo: UndoBuy | null = special === 'rare_candy' || special === 'evo_stone' ? null : {
    label: o.kind === 'item' ? ITEMS[o.id].name : `招式学习器 · ${SKILLS[o.id].name}`,
    idx, money: p.money, moneySpent: p.stats.moneySpent,
    items: { ...p.items }, skills: p.skills.map((s) => ({ ...s })), offers: p.shop.offers.slice(), locked: p.shop.locked.slice(), crates: p.crates.slice(),
    flags: { foreignSkill: p.stats.foreignSkill, skillsFull: p.stats.skillsFull, maxItems: p.stats.maxItems },
  };
  if (o.kind === 'skill') {
    const err = learnSkill(p, o.id, slot);
    if (err) return err;
  } else {
    const it = ITEMS[o.id];
    if (!itemAllowed(p, it)) return '无法再购买该道具';
    if ((it.mods?.slots ?? 0) < 0 && p.skills.length > p.slots + (it.mods?.slots ?? 0)) return '技能栏会不够用，请先遗忘一个技能';
    giveItem(sim, p, o.id);
  }
  p.money -= o.price;
  p.stats.moneySpent += o.price;
  p.shop.offers[idx] = null;
  p.shop.locked[idx] = false;
  recompute(p);
  p.undo = undo;
  return null;
}

/** 撤销上一次购买：退还金钱、收回道具/技能、商品放回原位。只能撤销一次。 */
export function undoBuy(p: SimPlayer): string | null {
  const u = p.undo;
  if (!u) return '没有可以撤销的购买';
  p.undo = null;
  p.money = u.money;
  p.stats.moneySpent = u.moneySpent;
  p.items = u.items;
  p.skills = u.skills;
  p.crates = u.crates;
  const locked = p.shop.locked.slice();
  p.shop.offers = u.offers;
  p.shop.locked = locked.map((l, i) => (i === u.idx ? u.locked[i] : l && !!u.offers[i]));
  p.stats.foreignSkill = u.flags.foreignSkill;
  p.stats.skillsFull = u.flags.skillsFull;
  recompute(p);
  p.stats.maxItems = u.flags.maxItems;
  return null;
}

export function giveItem(sim: GameSim, p: SimPlayer, id: string) {
  const it = ITEMS[id];
  if (it.special === 'rare_candy') {
    levelUp(sim, p);
    nextCards(sim, p);
    return;
  }
  if (it.special === 'evo_stone') {
    evolve(sim, p, LINES[p.line].stones?.[id] ?? p.stage + 1);
    return;
  }
  p.items[id] = (p.items[id] ?? 0) + 1;
  recompute(p);
}

export function shopLock(p: SimPlayer, idx: number) {
  if (idx < 0 || idx > 3 || !p.shop.offers[idx]) return;
  p.shop.locked[idx] = !p.shop.locked[idx];
}

/** 遗忘技能返还的金钱 */
export function forgetRefund(skillId: string, lv: number, wave: number) {
  return Math.round(SKILL_PRICE[SKILLS[skillId]?.tier ?? 1] * 0.3 * lv * priceMult(wave));
}

export function forgetSkill(sim: GameSim, p: SimPlayer, slot: number): string | null {
  if (p.skills.length <= 1) return '至少要保留一个技能';
  const s = p.skills[slot];
  if (!s) return '无效的技能栏';
  p.skills.splice(slot, 1);
  p.money += forgetRefund(s.id, s.lv, sim.wave);
  return null;
}

export function crateSellValue(sim: GameSim, id: string) {
  return Math.round(ITEMS[id].price * 0.5 * priceMult(sim.wave));
}

export function rollCrateItem(sim: GameSim, p: SimPlayer): string {
  const tier = Math.min(4, rollTier(sim, p, sim.wave + 3));
  const pool = ITEM_IDS.filter((id) => ITEMS[id].tier === tier && itemAllowed(p, ITEMS[id]) && ITEMS[id].special !== 'rare_candy');
  return pool.length ? sim.rng.pick(pool) : 'big_charm';
}

export function resolveCrate(sim: GameSim, p: SimPlayer, take: boolean) {
  const id = p.crates.shift();
  if (!id) return;
  if (take && itemAllowed(p, ITEMS[id])) giveItem(sim, p, id);
  else p.money += crateSellValue(sim, id);
}
