#!/usr/bin/env node
/**
 * 从 pokesurvivor 仓库（https://github.com/JPTER78/pokesurvivor）导入本游戏用到的
 * SpriteCollab PMD 精灵表，并生成：
 *   public/sprites/<dex>/<Anim>.png
 *   public/sprites/<dex>/s/<Anim>.png   闪光宝可梦（异色）的精灵表
 *   src/client/gfx/spriteMeta.ts   （帧尺寸、帧数、时长、脚底锚点）
 *   CREDITS.md 中的画师署名表
 *
 * 用法： node tools/import-sprites.mjs /path/to/pokesurvivor
 *
 * 精灵版权：SpriteCollab（CC BY-NC 4.0），仅限非商业用途，需署名。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** 初代 151 只全部导入：都可以成为伙伴，也都会作为野生宝可梦出现 */
const DEX = Array.from({ length: 151 }, (_, i) => i + 1);
const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Hurt', 'Faint'];

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'js/data/sprites-meta.js'))) {
  console.error('用法: node tools/import-sprites.mjs /path/to/pokesurvivor');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const ctx = { G: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(src, 'js/data/sprites-meta.js'), 'utf8'), ctx);
const META = ctx.G.SPRITE_META;

const geo = (meta) => ({ w: meta.w, h: meta.h, n: meta.n, r: meta.r, d: meta.d, ax: meta.ax, ay: meta.ay });

const out = {};
let shinies = 0;
for (const dex of DEX) {
  const m = META[dex];
  if (!m) throw new Error(`sprites-meta 中缺少 #${dex}`);
  const dir = path.join(root, 'public/sprites', String(dex));
  fs.mkdirSync(dir, { recursive: true });
  const anims = {};
  for (const a of ANIMS) {
    const meta = m.a[a];
    const file = path.join(src, 'assets/pokemon', String(dex), `${a}.png`);
    if (!meta || !fs.existsSync(file)) continue;
    fs.copyFileSync(file, path.join(dir, `${a}.png`));
    anims[a] = geo(meta);
  }
  const entry = { s: m.s, hv: m.hv ? 1 : 0, a: anims };
  // 闪光精灵表：大多数和普通的帧尺寸一样，少数不同的记在 sa 里，缺的动画记在 sm 里
  if (m.sh) {
    const sdir = path.join(dir, 's');
    fs.mkdirSync(sdir, { recursive: true });
    const sa = {}, sm = [];
    for (const a of Object.keys(anims)) {
      const file = path.join(src, 'assets/pokemon', String(dex), 's', `${a}.png`);
      if ((m.sm ?? []).includes(a) || !fs.existsSync(file)) { sm.push(a); continue; }
      fs.copyFileSync(file, path.join(sdir, `${a}.png`));
      if (m.sa?.[a]) sa[a] = geo(m.sa[a]);
    }
    if (sm.length < Object.keys(anims).length) {
      entry.sh = 1;
      if (Object.keys(sa).length) entry.sa = sa;
      if (sm.length) entry.sm = sm;
      shinies++;
    }
  }
  out[dex] = entry;
}

const ts = `/* 由 tools/import-sprites.mjs 生成，请勿手改。
 * 数据来自 SpriteCollab 的 AnimData.xml（经 pokesurvivor 整理出脚底锚点）。
 * 每个动画： w,h 帧尺寸 · n 帧数 · r 方向行数 · d 每帧时长(1/60 秒) · ax,ay 脚底锚点
 * 方向行： 0 下 · 1 右下 · 2 右 · 3 右上 · 4 上 · 5 左上 · 6 左 · 7 左下
 * sh 有闪光精灵表（sprites/<dex>/s/）· sa 闪光精灵表里帧尺寸不同的动画 · sm 闪光精灵表缺的动画
 */
export interface AnimMeta { w: number; h: number; n: number; r: number; d: number[]; ax: number; ay: number }
export interface SpriteMeta { s: number; hv: number; a: Record<string, AnimMeta>; sh?: number; sa?: Record<string, AnimMeta>; sm?: string[] }
export const SPRITE_META: Record<number, SpriteMeta> = ${JSON.stringify(out)};
`;
fs.mkdirSync(path.join(root, 'src/client/gfx'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/client/gfx/spriteMeta.ts'), ts);

// 画师署名：只保留用到的图鉴编号
const credits = fs.readFileSync(path.join(src, 'CREDITS.md'), 'utf8').split('\n');
const used = new Set(DEX);
const rows = [];
for (const line of credits) {
  const m = line.match(/^\| (.+?) \| (.*?) \| ([\d, ]+) \|$/);
  if (!m) continue;
  const nums = m[3].split(',').map((s) => Number(s.trim())).filter((n) => used.has(n));
  if (nums.length) rows.push(`| ${m[1]} | ${m[2]} | ${nums.join(', ')} |`);
}
const md = `# 致谢 / Credits

## 精灵图（Sprites）

宝可梦像素精灵（包括闪光宝可梦的异色精灵图）来自 [PMDCollab / SpriteCollab](https://github.com/PMDCollab/SpriteCollab)，
采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可：**仅限非商业用途，并需署名**。
动画锚点数据整理自 [JPTER78/pokesurvivor](https://github.com/JPTER78/pokesurvivor)（MIT）。

本游戏使用的图鉴编号：${DEX.slice().sort((a, b) => a - b).join(', ')}

| 画师 | 联系方式 | 本游戏用到的精灵（图鉴编号） |
|---|---|---|
${rows.join('\n')}

## 界面图标（UI icons）

齿轮、声音、奖杯、硬币、星星、王冠、好友、精灵球等界面图标取自
[JPTER78/pokesurvivor](https://github.com/JPTER78/pokesurvivor) 的 \`js/ui/icons.js\`（MIT），其余界面图标为本项目绘制。

## 真新镇与训练家（Town & trainers）

- 真新镇的图块（含从常磐市搬来的宝可梦中心与道馆）、训练家与 NPC（含道馆向导）的行走图、开场大木博士的立绘取自《宝可梦 火红 / 叶绿》，
  由 [pret/pokefirered](https://github.com/pret/pokefirered) 反编译项目整理的原版素材导入（\`tools/build-town.mjs\`、\`tools/import-trainers.mjs\`）；
  原版素材的权利属于 Nintendo / Creatures Inc. / GAME FREAK，本项目仅作非营利粉丝作品使用。
- 训练家、道馆馆主与道馆训练家的立绘来自 [PokéRogue](https://github.com/pagefaultgames/pokerogue-assets)（pagefaultgames/pokerogue-assets），
  按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 使用（源自官方作品的部分以原权利人为准）。

## 局部属性场地特效（Field effects）

- 火苗、熔岩喷柱与熔岩块、毒泡与毒云、雨点与落雷、嫩芽与落叶、共鸣波与光球、旋风、冰刺与寒气等动画帧，
  以及烟雾、暴风雪、狂风、沙尘、精神场地的纹理，取自 [PokéRogue](https://github.com/pagefaultgames/pokerogue-assets)
  的战斗动画图（\`images/battle_anims/\`），这批动画图最早出自 [Pokémon Reborn](https://www.rebornevo.com/)。
  由 \`tools/import-field-fx.mjs\` 裁切、换色后拼成 \`public/fx/\` 下的图集与纹理，
  按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 使用，改动后的 \`public/fx/\` 素材同样按此许可提供。
- 熔岩池、寒霜区域的液面画法（按到岸边的距离分出岸边、泡沫、浅处、深处，外角削圆）参考了
  [JPTER78/pokesurvivor](https://github.com/JPTER78/pokesurvivor) 的 \`js/world/tiles.js\`，代码为本项目重写。

## 字体（Font）

[缝合像素字体 Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（12px 比例 简体中文），
SIL Open Font License 1.1，许可文本见 \`public/fonts/OFL.txt\` 与 \`public/fonts/LICENSES/\`。

## 商标（Trademarks）

Pokémon 及相关名称、角色是 Nintendo、Creatures Inc.、GAME FREAK 与 The Pokémon Company 的商标与财产。
本项目为非营利粉丝作品，与上述公司无关，也未获其认可。
`;
fs.writeFileSync(path.join(root, 'CREDITS.md'), md);
console.log(`导入 ${DEX.length} 只宝可梦（其中 ${shinies} 只有闪光精灵图），署名 ${rows.length} 位画师。`);
