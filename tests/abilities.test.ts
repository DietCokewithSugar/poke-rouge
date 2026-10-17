import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITIES, abFieldBurns, abMoveMod, auraRadius } from '../src/shared/abilities';
import { FIELD_CELL, fieldGrid, type FieldId } from '../src/shared/fields';
import { LINES, LINE_IDS, abilityAt } from '../src/shared/pokemon';
import { buildFor } from '../src/shared/pvp/build';
import { PvpSim } from '../src/shared/pvp/sim';
import { Rng } from '../src/shared/rng';
import { SKILLS } from '../src/shared/skills';
import { baseDamage, hitEnemy, hurtPlayer, inflict, skillNums } from '../src/shared/sim/combat';
import type { SimPlayer } from '../src/shared/sim/entities';
import { GameSim } from '../src/shared/sim/game';
import { recompute } from '../src/shared/sim/player';

/** 上传的《精灵特性》表格：按图鉴顺序，每个形态一行，只有一种形态的另有觉醒等级 10 / 18 两行 */
const TABLE: [string, string][] = [
  ['妙蛙种子', '茂盛'], ['妙蛙草', '茂盛+'], ['妙蛙花', '茂盛++'], ['小火龙', '猛火'], ['火恐龙', '猛火+'],
  ['喷火龙', '猛火++'], ['杰尼龟', '激流'], ['卡咪龟', '激流+'], ['水箭龟', '激流++'], ['绿毛虫', '鳞粉'],
  ['铁甲蛹', '蜕皮+'], ['巴大蝶', '有色眼镜'], ['独角虫', '毒刺'], ['铁壳蛹', '蜕皮+'], ['大针蜂', '虫之预感++'],
  ['波波', '锐利目光'], ['比比鸟', '锐利目光+'], ['大比鸟', '锐利目光++'], ['小拉达', '逃跑'], ['拉达', '毅力'],
  ['烈雀', '锐利目光'], ['大嘴雀', '狙击手'], ['阿柏蛇', '蜕皮'], ['阿柏怪', '威吓'], ['皮卡丘', '静电++'],
  ['雷丘', '避雷针+'], ['穿山鼠', '沙隐'], ['穿山王', '拨沙'], ['尼多兰', '斗争心'], ['尼多娜', '斗争心+'],
  ['尼多后', '斗争心++'], ['尼多朗', '斗争心'], ['尼多力诺', '斗争心+'], ['尼多王', '斗争心++'], ['皮皮', '友情防守'],
  ['皮可西', '友情防守+'], ['六尾', '引火'], ['九尾', '日照'], ['胖丁', '迷人之躯'], ['胖可丁', '迷人之躯+'],
  ['超音蝠', '穿透'], ['大嘴蝠', '穿透+'], ['走路草', '叶绿素'], ['臭臭花', '叶绿素+'], ['霸王花', '叶绿素++'],
  ['派拉斯', '孢子'], ['派拉斯特', '孢子'], ['毛球', '逃跑'], ['摩鲁蛾', '奇迹皮肤'], ['地鼠', '沙穴'],
  ['三地鼠', '沙穴'], ['喵喵', '捡拾'], ['猫老大', '技术高手'], ['可达鸭', '无关天气'], ['哥达鸭', '无关天气+'],
  ['猴怪', '愤怒穴位'], ['火爆猴', '愤怒穴位+'], ['卡蒂狗', '正义之心'], ['风速狗', '正义之心+'], ['蚊香蝌蚪', '悠游自如'],
  ['蚊香君', '悠游自如+'], ['蚊香泳士', '悠游自如++'], ['凯西', '魔法防守'], ['勇基拉', '魔法防守+'], ['胡地', '魔法防守++'],
  ['腕力', '无防守'], ['豪力', '无防守+'], ['怪力', '无防守++'], ['喇叭芽', '贪吃鬼'], ['口呆花', '贪吃鬼+'],
  ['大食花', '贪吃鬼++'], ['玛瑙水母', '恒净之躯'], ['毒刺水母', '恒净之躯+'], ['小拳石', '结实'], ['隆隆石', '结实+'],
  ['隆隆岩', '结实++'], ['小火马', '火焰之躯'], ['烈焰马', '火焰之躯+'], ['呆呆兽', '迟钝'], ['呆壳兽', '迟钝+'],
  ['小磁怪', '磁力'], ['三合一磁怪', '磁力+'], ['大葱鸭', '锐利目光++'], ['大葱鸭(觉醒等级10)', '精神力'], ['大葱鸭(觉醒等级18)', '精神力+'],
  ['嘟嘟', '逃跑'], ['嘟嘟利', '逃跑+'], ['小海狮', '厚脂肪'], ['白海狮', '厚脂肪+'], ['臭泥', '恶臭'],
  ['臭臭泥', '恶臭+'], ['大舌贝', '硬壳盔甲'], ['刺甲贝', '连续攻击'], ['鬼斯', '飘浮'], ['鬼斯通', '飘浮'],
  ['耿鬼', '诅咒之躯'], ['大岩蛇', '结实'], ['大岩蛇(觉醒等级10)', '碎裂铠甲'], ['大岩蛇(觉醒等级18)', '碎裂铠甲+'], ['催眠貘', '不眠'],
  ['引梦貘人', '预知梦'], ['大钳蟹', '硬壳盔甲'], ['巨钳蟹', '怪力钳'], ['霹雳电球', '引爆'], ['顽皮雷弹', '引爆+'],
  ['蛋蛋', '叶绿毒'], ['椰蛋树', '收获'], ['卡拉卡拉', '战斗盔甲'], ['嘎啦嘎啦', '战斗盔甲'], ['飞腿郎', '柔软'],
  ['飞腿郎(觉醒等级10)', '舍身'], ['飞腿郎(觉醒等级18)', '舍身+'], ['快拳郎', '锐利目光'], ['快拳郎(觉醒等级10)', '铁拳'], ['快拳郎(觉醒等级18)', '铁拳+'],
  ['大舌头', '迟钝'], ['大舌头(觉醒等级10)', '无关天气'], ['大舌头(觉醒等级18)', '无关天气+'], ['瓦斯弹', '飘浮'], ['双弹瓦斯', '化学变化气体'],
  ['独角犀牛', '坚硬脑袋'], ['钻角犀兽', '坚硬脑袋+'], ['吉利蛋', '自然回复'], ['吉利蛋(觉醒等级10)', '治愈之心'], ['吉利蛋(觉醒等级18)', '治愈之心+'],
  ['蔓藤怪', '叶绿素+'], ['蔓藤怪(觉醒等级10)', '再生力'], ['蔓藤怪(觉醒等级18)', '再生力+'], ['袋兽', '精神力'], ['袋兽(觉醒等级10)', '胆量'],
  ['袋兽(觉醒等级18)', '胆量+'], ['墨海马', '悠游自如+'], ['海刺龙', '狙击手'], ['角金鱼', '水幕'], ['金鱼王', '水幕+'],
  ['海星星', '自然回复'], ['宝石海星', '发光'], ['魔墙人偶', '技术高手'], ['魔墙人偶(觉醒等级10)', '过滤'], ['魔墙人偶(觉醒等级18)', '过滤+'],
  ['飞天螳螂', '虫之预感'], ['飞天螳螂(觉醒等级10)', '技术高手'], ['飞天螳螂(觉醒等级18)', '技术高手+'], ['迷唇姐', '预知梦'], ['迷唇姐(觉醒等级10)', '干燥皮肤'],
  ['迷唇姐(觉醒等级18)', '干燥皮肤'], ['电击兽', '静电'], ['电击兽(觉醒等级10)', '干劲'], ['电击兽(觉醒等级18)', '干劲+'], ['鸭嘴火兽', '火焰之躯'],
  ['鸭嘴火兽(觉醒等级10)', '干劲'], ['鸭嘴火兽(觉醒等级18)', '干劲+'], ['凯罗斯', '怪力钳'], ['凯罗斯(觉醒等级10)', '破格'], ['凯罗斯(觉醒等级18)', '破格'],
  ['肯泰罗', '威吓'], ['肯泰罗(觉醒等级10)', '愤怒穴位'], ['肯泰罗(觉醒等级18)', '愤怒穴位'], ['鲤鱼王', '悠游自如++'], ['暴鲤龙', '威吓'],
  ['拉普拉斯', '硬壳盔甲'], ['拉普拉斯(觉醒等级10)', '湿润之躯'], ['拉普拉斯(觉醒等级18)', '湿润之躯'], ['百变怪', '变身者'], ['百变怪(觉醒等级10)', '变身者'],
  ['百变怪(觉醒等级18)', '变身者'], ['伊布', '适应力'], ['水伊布', '储水'], ['雷伊布', '蓄电'], ['火伊布', '引火+'],
  ['多边兽', '复制'], ['多边兽(觉醒等级10)', '下载'], ['多边兽(觉醒等级18)', '下载+'], ['菊石兽', '悠游自如+'], ['多刺菊石兽', '悠游自如++'],
  ['化石盔', '悠游自如+'], ['镰刀盔', '悠游自如++'], ['化石翼龙', '坚硬脑袋+'], ['化石翼龙(觉醒等级10)', '压迫感'], ['化石翼龙(觉醒等级18)', '压迫感+'],
  ['卡比兽', '贪吃鬼+'], ['卡比兽(觉醒等级10)', '厚脂肪+'], ['卡比兽(觉醒等级18)', '厚脂肪++'], ['急冻鸟', '压迫感'], ['急冻鸟(觉醒等级10)', '压迫感'],
  ['急冻鸟(觉醒等级18)', '雪隐++++'], ['闪电鸟', '压迫感'], ['闪电鸟(觉醒等级10)', '压迫感'], ['闪电鸟(觉醒等级18)', '静电++++'], ['火焰鸟', '压迫感'],
  ['火焰鸟(觉醒等级10)', '压迫感'], ['火焰鸟(觉醒等级18)', '火焰之躯++++'], ['迷你龙', '蜕皮'], ['哈克龙', '蜕皮+'], ['快龙', '多重鳞片'],
  ['超梦', '压迫感'], ['超梦(觉醒等级10)', '压迫感'], ['超梦(觉醒等级18)', '压迫感'], ['梦幻', '同步'], ['梦幻(觉醒等级10)', '同步'],
  ['梦幻(觉醒等级18)', '同步'],
];

const solo = (line: string, seed = 7) => {
  const sim = new GameSim([{ id: 1, name: 'a', line, meta: {} }], seed);
  const p = sim.players[0];
  sim.enemies = [];
  sim.pending = [];
  p.invuln = 0;
  return { sim, p };
};

/** 换到第几个形态（只有一种形态的用等级换觉醒） */
const setForm = (p: SimPlayer, stage: number, level = p.level) => {
  p.stage = stage;
  p.level = level;
  recompute(p);
  p.hp = p.d.maxHp;
};

/** 不带特性时的数值：暂时把特性消去 */
const without = <T>(p: SimPlayer, f: () => T): T => {
  p.suppressed = true;
  recompute(p);
  const v = f();
  p.suppressed = false;
  recompute(p);
  return v;
};

const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

/** 在 (x, y) 放一块 3×3 格的场地 */
const fieldAt = (sim: GameSim, kind: FieldId, x: number, y: number) => {
  const { cols } = fieldGrid(sim.w, sim.h);
  const gx = Math.floor(x / FIELD_CELL), gy = Math.floor(y / FIELD_CELL);
  const cells: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push((gy + dy) * cols + gx + dx);
  return sim.placeField(kind, cells);
};

test('每个形态、每次觉醒的特性都和表格一致', () => {
  const got: [string, string][] = [];
  for (const id of LINE_IDS) {
    const L = LINES[id];
    if (L.forms.length === 1) {
      const f = L.forms[0];
      L.abilities.forEach((a, i) => got.push([i === 0 ? f.name : `${f.name}(觉醒等级${[10, 18][i - 1]})`, ABILITIES[a]?.name ?? `缺少 ${a}`]));
      assert.equal(L.abilities.length, 3, `${f.name} 要有 Lv1 和两次觉醒的特性`);
    } else {
      assert.equal(L.abilities.length, L.forms.length, `${L.name} 每个形态一个特性`);
      L.forms.forEach((f, i) => got.push([f.name, ABILITIES[L.abilities[i]]?.name ?? `缺少 ${L.abilities[i]}`]));
    }
  }
  assert.equal(got.length, TABLE.length);
  for (let i = 0; i < TABLE.length; i++) assert.deepEqual(got[i], TABLE[i], `第 ${i + 1} 行`);
  for (const a of Object.values(ABILITIES)) assert.ok(a.desc.length > 4, `${a.id} 要有说明`);
});

test('只有一种形态的宝可梦按觉醒换特性', () => {
  assert.equal(abilityAt('onix', 0, 9)?.name, '结实');
  assert.equal(abilityAt('onix', 0, 10)?.name, '碎裂铠甲');
  assert.equal(abilityAt('onix', 0, 18)?.name, '碎裂铠甲+');
  const { sim, p } = solo('articuno');
  sim.debugXp(p, 1e5);
  assert.ok(p.ab.some((a) => a.selfField?.kind === 'frost'), '急冻鸟第二次觉醒：雪隐++++');
});

test('茂盛 / 猛火：HP 低于一半时本系技能伤害提升；猛火++ 每波一次在身边生成熔岩池', () => {
  const { sim, p } = solo('charmander');
  const s = SKILLS.ember;
  const full = baseDamage(p, s, 1);
  p.hp = p.d.maxHp * 0.49;
  assert.ok(near(baseDamage(p, s, 1) / full, 1.3), '猛火 +30%');
  setForm(p, 2, 15);
  p.hp = p.d.maxHp * 0.4;
  sim.step(1 / 30);
  const lava = sim.fields.filter((f) => f.kind === 'lava' && f.by === p.id);
  assert.equal(lava.length, 1, '生成了熔岩池');
  assert.ok(lava[0].cells.length <= 9 && lava[0].until === undefined, '约 3×3 格，到波次结束');
  assert.equal(sim.fieldAt(p.x, p.y), 'lava');
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  assert.equal(sim.fields.filter((f) => f.by === p.id).length, 1, '每波只有一次');
  assert.equal(p.fieldBurn, 0, '喷火龙自己是火系，不会被灼伤');
});

test('强制进化：绿毛虫等级够了在波次结束时直接进化，也买不到不变之石', () => {
  const { sim, p } = solo('caterpie');
  sim.debugXp(p, 600);
  assert.ok(p.level >= 9, `Lv${p.level}`);
  (sim as unknown as { endWave(): void }).endWave();
  assert.equal(p.stage, 2, '连着进化成巴大蝶');
  assert.ok(!p.evoPrompt, '不再询问');
  assert.equal(p.ab[0].id, 'tinted_lens');
});

test('技术高手、无防守、迟钝：伤害与冷却倍率', () => {
  const m = solo('meowth');
  setForm(m.p, 1, 12);
  const tech = baseDamage(m.p, SKILLS.scratch, 1);
  assert.ok(near(tech / without(m.p, () => baseDamage(m.p, SKILLS.scratch, 1)), 2.5), '初级技能 +150%');
  assert.ok(near(baseDamage(m.p, SKILLS.slash, 1) / without(m.p, () => baseDamage(m.p, SKILLS.slash, 1)), 2.5), '中级技能 +150%');
  assert.ok(near(baseDamage(m.p, SKILLS.crunch, 1) / without(m.p, () => baseDamage(m.p, SKILLS.crunch, 1)), 1), '高级技能不加');

  const c = solo('machop');
  const cd = skillNums(c.sim, c.p, 'karate_chop', 1)!.cd;
  assert.ok(near(cd / without(c.p, () => skillNums(c.sim, c.p, 'karate_chop', 1)!.cd), 0.3, 0.05), `无防守冷却 -70%：${cd}`);
  assert.ok(c.p.d.def < without(c.p, () => c.p.d.def), '无防守：物防降低');

  const s = solo('slowpoke');
  const n = skillNums(s.sim, s.p, 'water_gun', 1)!, n0 = without(s.p, () => skillNums(s.sim, s.p, 'water_gun', 1)!);
  assert.ok(near(n.cd / n0.cd, 3, 0.05) && near(n.dmg! / n0.dmg!, 3, 0.05), '迟钝：冷却 ×3、伤害 ×3');
  assert.ok(s.p.d.rangeMult > without(s.p, () => s.p.d.rangeMult), '迟钝：范围 +50%');
});

test('受到攻击：厚脂肪减伤、飘浮免疫地面、干燥皮肤吸收、过滤+ 反弹', () => {
  const seel = solo('seel');
  const hurt = (p: SimPlayer, sim: GameSim, type: 'fire' | 'normal' | 'ground' | 'water') => {
    p.invuln = 0; p.hp = p.d.maxHp; p.d.dodge = 0;
    return hurtPlayer(sim, p, 40, 'spec', { type });
  };
  assert.ok(near(hurt(seel.p, seel.sim, 'fire') / hurt(seel.p, seel.sim, 'normal'), 0.7, 0.1), '厚脂肪：火系伤害 70%');
  const ghost = solo('gastly');
  assert.equal(hurt(ghost.p, ghost.sim, 'ground'), 0, '飘浮：地面系无效');
  assert.ok(hurt(ghost.p, ghost.sim, 'normal') > 0, '一般系照常受伤');
  const jynx = solo('jynx');
  jynx.sim.debugXp(jynx.p, 700);
  assert.equal(jynx.p.ab[0].id, 'dry_skin');
  jynx.p.invuln = 0;
  jynx.p.hp = jynx.p.d.maxHp / 2;
  const before = jynx.p.hp;
  assert.equal(hurtPlayer(jynx.sim, jynx.p, 40, 'spec', { type: 'water' }), 0);
  assert.ok(jynx.p.hp > before, '干燥皮肤：水系伤害变成回复');
  const mime = solo('mr_mime');
  mime.sim.debugXp(mime.p, 3000);
  assert.equal(mime.p.ab[0].id, 'filter_p');
  const e = mime.sim.spawnEnemy('w19', mime.p.x + 30, mime.p.y);
  mime.p.invuln = 0;
  assert.equal(hurtPlayer(mime.sim, mime.p, 40, 'phys', { type: 'normal', from: e }), 0);
  assert.ok(e.hp < e.maxHp, '过滤+：把伤害反弹给对手');
});

test('结实+：受到致命伤害保留 1 HP 并霸体 2 秒', () => {
  const { sim, p } = solo('geodude');
  setForm(p, 1, 8);
  p.d.dodge = 0;
  hurtPlayer(sim, p, 99999, 'phys', { type: 'normal' });
  assert.equal(p.hp, 1);
  assert.ok(p.at.armor >= 2 && p.invuln >= 2, '霸体 2 秒');
  assert.equal(hurtPlayer(sim, p, 99999, 'phys', { type: 'normal' }), 0, '霸体期间不受伤害');
});

test('威吓：物理技能打中的野生宝可梦伤害减半；静电：被物理攻击时麻痹对手', () => {
  const { sim, p } = solo('ekans');
  setForm(p, 1, 11);
  const e = sim.spawnEnemy('machop', p.x + 20, p.y);
  e.hp = e.maxHp = 1e6;
  hitEnemy(sim, e, p, 10, 'poison', { skill: SKILLS.poison_jab });
  assert.ok(e.st.weak > 0 && near(sim.enemyMod(e, 'phys').dmg, 0.5), '对手伤害 -50%');

  const z = solo('pikachu');
  const foe = z.sim.spawnEnemy('machop', z.p.x + 10, z.p.y);
  let para = false;
  for (let i = 0; i < 40 && !para; i++) {
    z.p.invuln = 0; z.p.hp = z.p.d.maxHp; z.p.d.dodge = 0;
    hurtPlayer(z.sim, z.p, 5, 'phys', { type: 'fighting', from: foe });
    para = foe.st.para > 0;
  }
  assert.ok(para && foe.st.paraAmt === 0.75, '静电++：麻痹后只剩 25% 的速度');
});

test('压迫感与磁力：光环里的野生宝可梦减速、冷却变慢；电系的冷却变快', () => {
  const { sim, p } = solo('mewtwo');
  const r = auraRadius(3);
  const close = sim.spawnEnemy('w19', p.x + r, p.y), far = sim.spawnEnemy('w19', p.x + r + 40, p.y);
  assert.equal(sim.enemyPressure(close), 0.5);
  assert.equal(sim.enemyCdRate(close), 0.5, '冷却时间 +100%');
  assert.equal(sim.enemyPressure(far), 1);
  const m = solo('magnemite');
  const elec = m.sim.spawnEnemy('voltorb', m.p.x + 10, m.p.y), other = m.sim.spawnEnemy('w19', m.p.x + 10, m.p.y);
  assert.ok(near(m.sim.enemyCdRate(elec), 1 / 0.7), '光环里的电系对手冷却也变快');
  assert.equal(m.sim.enemyCdRate(other), 1);
  assert.ok(near(m.sim.cdRate(m.p), 1 / 0.7), '自己也在光环里');
});

test('斗争心：范围技能同时打中 3 个以上对手时伤害提升', () => {
  const { sim, p } = solo('nidoran_m');
  p.skills = [{ id: 'discharge', lv: 1, cd: 0 }];
  const hit = (n: number) => {
    sim.enemies = [];
    const es = Array.from({ length: n }, (_, i) => { const e = sim.spawnEnemy('w19', p.x + 10 + i, p.y); e.hp = e.maxHp = 1e6; return e; });
    p.d.crit = 0;
    p.skills[0].cd = 0;
    sim.step(1 / 30);
    return es[0].maxHp - es[0].hp;
  };
  const one = hit(1), three = hit(3);
  assert.ok(near(three / one, 1.3, 0.05), `命中 3 个：${three} / ${one}`);
});

test('连续攻击多发射 5 发；穿透直线贯穿', () => {
  const s = solo('shellder');
  setForm(s.p, 1, 11);
  assert.equal(skillNums(s.sim, s.p, 'spike_cannon', 1)!.count, 9);
  const z = solo('zubat');
  z.p.skills = [{ id: 'swift', lv: 1, cd: 0 }];
  z.sim.spawnEnemy('w19', z.p.x + 60, z.p.y);
  z.sim.step(1 / 30);
  const pr = z.sim.projs.filter((x) => x.owner === z.p.id);
  assert.ok(pr.length && pr.every((x) => x.pierce >= 2 && x.homing === 0), '穿透：不追踪、穿过 2 个');
});

test('地图道具：捡拾让橙橙果回复翻倍，贪吃鬼++ 三倍；收获每 5 秒生成树果', () => {
  const heal = (line: string, stage: number, level: number) => {
    const { sim, p } = solo(line);
    setForm(p, stage, level);
    p.hp = 1;
    sim.placeItem('berry', p.x, p.y);
    sim.step(1 / 30);
    return p.hp - 1;
  };
  const base = heal('rattata', 0, 1);
  assert.ok(heal('meowth', 0, 1) > base * 1.6, '捡拾：橙橙果翻倍');
  assert.ok(heal('bellsprout', 2, 15) > heal('bellsprout', 0, 1) * 2.4, '贪吃鬼++：三倍');
  const { sim, p } = solo('exeggcute');
  setForm(p, 1, 11);
  for (let i = 0; i < 30 * 5.2; i++) { p.hp = p.d.maxHp; sim.step(1 / 30); }
  assert.ok(sim.pickups.some((pk) => pk.kind === 'berry' || pk.kind === 'starf'), '收获：生成树果');
});

test('战斗盔甲、变身者：冒险开局带着道具，每个道具提升能力', () => {
  const { p } = solo('cubone');
  assert.equal(p.items.thick_club, 1, '开局带着一根粗骨头');
  p.items.thick_club = 3;
  recompute(p);
  assert.ok(near(p.d.atk / without(p, () => p.d.atk), 1.6), '每根粗骨头物攻 +20%');
  p.items.thick_club = 8;
  recompute(p);
  assert.ok(near(p.d.atk / without(p, () => p.d.atk), 2), '最多叠加 5 次');
  const d = solo('ditto').p;
  assert.equal((d.items.metal_powder ?? 0) + (d.items.quick_powder ?? 0), 1, '百变怪带着金属粉或速度粉');
});

test('复制：多边兽复制离自己最近的野生宝可梦的特性', () => {
  const { sim, p } = solo('porygon');
  sim.spawnEnemy('w16', p.x + 20, p.y);
  sim.spawnEnemy('w74', p.x + 200, p.y);
  sim.step(1 / 30);
  assert.deepEqual(p.copied, ['keen_eye']);
  assert.ok(p.ab.some((a) => a.id === 'keen_eye') && p.d.rangeMult > 1.2, '波波的锐利目光生效了');
});

test('引爆+：被击倒时爆炸，附近的野生宝可梦损失 40% HP', () => {
  const { sim, p } = solo('voltorb');
  setForm(p, 1, 11);
  const e = sim.spawnEnemy('machop', p.x + 10, p.y);
  e.hp = e.maxHp = 1000;
  sim.downPlayer(p);
  assert.ok(near(e.hp, 600, 0.01), `剩 ${e.hp}`);
  assert.ok(p.at.aftermath, '每波只引爆一次');
});

test('适应力：熔岩里不会灼伤，任何属性的招式都享有场地的正面加成', () => {
  const { sim, p } = solo('eevee');
  fieldAt(sim, 'lava', p.x, p.y);
  sim.step(1 / 30);
  assert.equal(p.fieldBurn, 0);
  assert.ok(!abFieldBurns('lava', ['normal'], p.ab), '适应力不会灼伤');
  assert.ok(near(sim.castMod(p, SKILLS.tackle).dmg, 1.25), '一般系招式在熔岩里也 +25%');
  assert.equal(abMoveMod('smog', 'grass', p.ab).cd, 1, '毒雾里草系招式不会变慢');
});

test('悠游自如：阵雨里移动速度提升；三圣鸟第二次觉醒定时生成场地，场地里对应属性无效', () => {
  const { sim, p } = solo('poliwag');
  const v0 = sim.moveSpeed(p);
  fieldAt(sim, 'rain', p.x, p.y);
  assert.ok(near(sim.moveSpeed(p) / v0, 1.5), '阵雨里 +50%');

  const b = solo('articuno');
  b.sim.debugXp(b.p, 1e5);
  for (let i = 0; i < 30 * 5.1; i++) { b.p.hp = b.p.d.maxHp; b.sim.step(1 / 30); }
  const f = b.sim.fields.find((x) => x.by === b.p.id);
  assert.ok(f && f.kind === 'frost' && f.until !== undefined, '生成了寒霜区域');
  b.p.invuln = 0;
  assert.equal(hurtPlayer(b.sim, b.p, 50, 'spec', { type: 'ice' }), 0, '寒霜区域里冰系技能无效');
  for (let i = 0; i < 30 * 3.2; i++) { b.p.hp = b.p.d.maxHp; b.sim.step(1 / 30); }
  assert.ok(!b.sim.fields.some((x) => x.id === f.id), '3 秒后消失');
});

test('发光：联机时野生宝可梦优先攻击宝石海星', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'staryu', meta: {} }, { id: 2, name: 'b', line: 'charmander', meta: {} }], 3);
  const [s, c] = sim.players;
  setForm(s, 1, 11);
  s.x = 100; c.x = 600;
  assert.equal(sim.targetPlayer(590, s.y), s);
});

test('对战：魔法防守不会陷入异常状态，魔法防守++ 把状态反弹回去；同步消去附近对手的特性', () => {
  const mk = (line: string, level: number) => buildFor(new Rng(1), line, level);
  const sim = new PvpSim('4v4', [
    { id: 1, name: 'A', team: 0, build: mk('abra', 20), meta: {} },
    { id: 2, name: 'B', team: 1, build: mk('charmander', 20), meta: {} },
  ], 3);
  const [a, b] = sim.players;
  assert.equal(a.ab[0].id, 'magic_guard_pp');
  sim.phase = 'wave';
  assert.ok(!inflict(sim, sim.proxyOf(a.id)!, { kind: 'para', chance: 1, dur: 2 }, 0, b), '不会麻痹');
  assert.ok(b.st.para > 0, '麻痹反弹给了对手');

  const sync = new PvpSim('4v4', [
    { id: 1, name: 'A', team: 0, build: mk('mew', 20), meta: {} },
    { id: 2, name: 'B', team: 1, build: mk('geodude', 20), meta: {} },
  ], 3);
  const [m, g] = sync.players;
  sync.countdown = 0;
  sync.step(1 / 30);
  g.x = m.x + 10; g.y = m.y;
  g.bot = false; m.bot = false;
  sync.step(1 / 30);
  assert.ok(g.suppressed, '靠近梦幻的对手特性被消去');
  assert.equal(g.ab.length, 0);
  g.x = m.x + 200;
  sync.step(1 / 30);
  assert.ok(!g.suppressed, '离开范围后恢复');
  assert.equal(g.ab.length, 1);
});

test('孢子、诅咒之躯：被技能打中时让出手的野生宝可梦陷入状态', () => {
  const { sim, p } = solo('paras');
  const e = sim.spawnEnemy('w19', p.x + 30, p.y);
  p.d.dodge = 0;
  hurtPlayer(sim, p, 5, 'phys', { type: 'normal', from: e });
  assert.ok(!e.st.para && !e.st.sleep, '物理攻击不触发孢子');
  p.invuln = 0;
  hurtPlayer(sim, p, 5, 'spec', { type: 'normal', from: e });
  assert.ok(e.st.para > 0 || e.st.sleep > 0, '特殊攻击：麻痹或睡眠');

  const g = solo('gastly');
  setForm(g.p, 2, 15);
  const foe = g.sim.spawnEnemy('w19', g.p.x + 30, g.p.y);
  for (let i = 0; i < 40 && foe.st.cdUp <= 0; i++) {
    g.p.invuln = 0; g.p.hp = g.p.d.maxHp; g.p.d.dodge = 0;
    hurtPlayer(g.sim, g.p, 5, 'spec', { type: 'normal', from: foe });
  }
  assert.ok(near(g.sim.enemyCdRate(foe), 1 / 3), '诅咒之躯：对手冷却时间 +200%');
});

test('治愈之心+ 替范围里的队友分担伤害；友情防守让给队友的回复更多并加双防', () => {
  const sim = new GameSim([{ id: 1, name: 'a', line: 'chansey', meta: {} }, { id: 2, name: 'b', line: 'charmander', meta: {} }], 4);
  const [c, d] = sim.players;
  sim.debugXp(c, 3000);
  assert.equal(c.ab[0].id, 'healer_p');
  d.x = c.x + 10; d.y = c.y; d.invuln = 0; d.d.dodge = 0;
  c.invuln = 0;
  const c0 = c.hp;
  const dealt = hurtPlayer(sim, d, 60, 'spec', { type: 'normal' });
  assert.ok(c.hp < c0 && dealt > 0, `吉利蛋分担了 ${c0 - c.hp}`);

  const fg = new GameSim([{ id: 1, name: 'a', line: 'clefairy', meta: {} }, { id: 2, name: 'b', line: 'charmander', meta: {} }], 4);
  const [f, q] = fg.players;
  fg.enemies = []; fg.pending = [];
  f.skills = [{ id: 'aromatherapy', lv: 1, cd: 0 }];
  q.skills = [];
  q.x = f.x + 20; q.y = f.y;
  q.hp = 1;
  fg.step(1 / 30);
  assert.ok(q.at.guard > 0 && q.at.guardAmt === 30, '被回复的队友双防 +30%');
  assert.ok(q.hp - 1 > q.d.maxHp * 0.12 * 1.25, '给队友的回复 +30%');
});
