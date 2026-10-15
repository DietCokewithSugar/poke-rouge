/**
 * 引导：
 *   tour  —— 第一次打开某个界面时，大木博士用聚光灯一步一步介绍各个部分（看过就不再出现）
 *   talk  —— 人物对话：立绘 + 名字 + 逐字出现的台词 + 选项按钮
 *   nextGoal —— 真新镇里「下一步做什么」的提示
 */
import { nextGym } from '../../shared/gyms';
import { sfx } from '../audio';
import type { PlaceId } from '../gfx/town';
import { artFull, npcArt, trainerPortrait } from '../gfx/trainers';
import { saveProfile, type Profile } from '../save';
import { clear, h, hideTip } from './dom';
import { mount } from './screens';

// ---------------------------------------------------------------- 逐字出现的台词

/** 把文字一个字一个字地打出来；点一下（或调用返回的函数）立刻显示全部 */
export function typeText(el: HTMLElement, text: string, cps = 45): () => void {
  let i = 0;
  let timer = 0;
  const done = () => { window.clearInterval(timer); el.textContent = text; el.classList.remove('typing'); };
  el.textContent = '';
  el.classList.add('typing');
  timer = window.setInterval(() => {
    i = Math.min(text.length, i + 1);
    el.textContent = text.slice(0, i);
    if (i >= text.length) done();
  }, 1000 / cps);
  return done;
}

// ---------------------------------------------------------------- 人物对话

export interface TalkOpts {
  name: string;
  /** 立绘（训练家、道馆馆主、大木博士） */
  art?: string;
  /** 只有行走图的 NPC */
  npc?: string;
  text: string;
  buttons: [string, () => void, string?][];
  /** 对话框上方额外显示的内容（例如对手的队伍） */
  extra?: Node | null;
}

/** 人物对话：立绘站在对话框左上方，台词逐字出现；金色的按钮是主要选项（手柄 Y），最后一个按钮是「返回」（手柄 B） */
export function talk(root: HTMLElement, o: TalkOpts) {
  const text = h('p', { class: 'talk-text' });
  const main = Math.max(0, o.buttons.findIndex(([, , cls]) => cls?.includes('gold')));
  const box = h('div', { class: `box talk ${o.art || o.npc ? '' : 'no-art'}` },
    o.art || o.npc ? h('div', { class: 'talk-art' }, o.art ? artFull(o.art, 2) : npcArt(o.npc!, 4)) : null,
    h('div', { class: 'talk-name' }, o.name),
    o.extra ?? null,
    text,
    h('div', { class: 'row end talk-btns' }, o.buttons.map(([label, fn, cls], i) => h('button', {
      class: `btn ${cls ?? ''}`, 'data-back': i === o.buttons.length - 1 ? '1' : undefined, 'data-key': i === main && o.buttons.length > 1 ? 'y' : undefined,
      onclick: (e: Event) => { e.stopPropagation(); sfx('click'); fn(); },
    }, label))),
  );
  mount(root, h('div', { class: 'talk-wrap' }, box), 'talk');
  const finish = typeText(text, o.text);
  box.addEventListener('click', finish);
  (box.querySelector('.talk-btns .btn') as HTMLElement | null)?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- 聚光灯引导

export interface TourStep {
  /** 要照亮的元素（CSS 选择器）；没有就在画面中央说话 */
  target?: string;
  title?: string;
  text: string;
}

let active: HTMLElement | null = null;

/**
 * 第一次来时的引导（id 记在存档里，看过就不再出现）。返回是否开始了引导。
 * 引导期间屏蔽下面的界面和键盘（空格/回车翻页，Esc 跳过）。
 */
export function tour(p: Profile, id: string, steps: TourStep[], o: { force?: boolean; done?: () => void } = {}): boolean {
  if ((!o.force && p.guide[id]) || active || !steps.length) return false;
  let i = 0;
  const spot = h('div', { class: 'tour-spot' });
  const title = h('b', { class: 'tour-title' });
  const text = h('p', { class: 'tour-text' });
  const count = h('span', { class: 'small muted' });
  const next = h('button', { class: 'btn gold small', 'data-key': 'y' }) as HTMLButtonElement;
  const skip = h('button', { class: 'btn ghost small', 'data-back': '1' }, '跳过引导') as HTMLButtonElement;
  const bubble = h('div', { class: 'box tour-bubble' },
    h('div', { class: 'tour-who' }, trainerPortrait('oak', 1)),
    h('div', { class: 'tour-body' }, title, text, h('div', { class: 'row between tour-foot' }, count, h('div', { class: 'row' }, skip, next))),
  );
  const root = h('div', { class: 'modal tour' }, spot, bubble);
  active = root;
  hideTip();
  const end = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    root.remove();
    active = null;
    p.guide[id] = Date.now();
    saveProfile(p);
    o.done?.();
  };
  const place = () => {
    const s = steps[i];
    const el = s.target ? document.querySelector(s.target) as HTMLElement | null : null;
    const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    root.classList.toggle('dim', !r);
    spot.classList.toggle('hidden', !r);
    const vv = window.visualViewport;
    const W = vv?.width ?? window.innerWidth, H = vv?.height ?? window.innerHeight;
    const ox = vv?.offsetLeft ?? 0, oy = vv?.offsetTop ?? 0;
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (!r) {
      bubble.style.left = `${Math.round(ox + (W - bw) / 2)}px`;
      bubble.style.top = `${Math.round(oy + Math.max(8, (H - bh) / 2))}px`;
      return;
    }
    const pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // 放在目标下面，放不下就放上面，再放不下就放旁边
    const gap = 14;
    let top = r.bottom + gap;
    if (top + bh > H - 8) top = r.top - gap - bh;
    if (top < 8) top = Math.max(8, Math.min(H - bh - 8, r.top + r.height / 2 - bh / 2));
    let left = r.left + r.width / 2 - bw / 2;
    if (top < r.bottom && top + bh > r.top) left = r.right + gap + bw < W - 8 ? r.right + gap : r.left - gap - bw;
    bubble.style.left = `${Math.round(ox + Math.max(8, Math.min(W - bw - 8, left - ox)))}px`;
    bubble.style.top = `${Math.round(oy + Math.max(8, Math.min(H - bh - 8, top - oy)))}px`;
  };
  const show = () => {
    const s = steps[i];
    clear(title);
    if (s.title) title.textContent = s.title;
    title.classList.toggle('hidden', !s.title);
    text.textContent = s.text;
    count.textContent = steps.length > 1 ? `${i + 1} / ${steps.length}` : '';
    next.textContent = i < steps.length - 1 ? '下一步' : '知道了';
    requestAnimationFrame(place);
  };
  const go = () => { sfx('click'); if (++i >= steps.length) end(); else show(); };
  next.addEventListener('click', go);
  skip.addEventListener('click', () => { sfx('click'); end(); });
  // 点暗处也能翻页或关掉：手机上按钮被浏览器边栏挡住时，不会一直留在画面上
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest?.('.tour-bubble')) return;
    e.preventDefault();
    go();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') go();
    else if (e.code === 'Escape') end();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  document.body.appendChild(root);
  show();
  next.focus({ preventScroll: true });
  return true;
}

export const tourActive = () => !!active;

// ---------------------------------------------------------------- 各个界面第一次打开时的引导

export const TOURS: Record<string, TourStep[]> = {
  town: [
    { title: '欢迎来到真新镇！', text: '用 WASD / 方向键走动（手机上在屏幕上拖动），走到建筑门口按空格或点下方的提示就能进去。' },
    { target: '.th-goal', title: '下一步做什么', text: '这里会提示你接下来该做什么。点一下就能直接过去。' },
    { target: '.th-quick', title: '快捷栏', text: '不想走路的话，右下角的快捷栏可以直接打开冒险、联机、对战、道馆、研究所和我的家（数字键 1~6）。' },
    { target: '.th-card', title: '训练家卡片', text: '左上角是你的训练家和跟随的伙伴。点开可以查看已经拥有的宝可梦、更换伙伴和训练家。' },
    { target: '.th-dust', title: '收集进度', text: '星之沙、宝可梦、道馆徽章和成就。点一下可以去对应的地方查看。' },
    { title: '出发吧！', text: '先去 1 号道路完成第一次冒险。冒险结束时把宝可梦放进背包，就能挑战道馆、和其他训练家对战了！' },
  ],
  route: [
    { target: '.route-team', title: '你和伙伴', text: '冒险会带着跟随你的伙伴出发。想换别的宝可梦，点右边的「换伙伴」。' },
    { target: '.diff-row', title: '难度', text: '一共三档难度，通关上一档才能解锁下一档。难度越高，星之沙越多。' },
    { target: '.route-foot .go', title: '出发', text: '一局 20 波：每波撑到倒计时结束就过关，波次之间在商店里升级技能、买道具。准备好了就出发吧！' },
  ],
  shop: [
    { target: '.inter-stage', title: '升级与商店', text: '升级时先选一项强化；之后是商店：买道具、学招式。技能会自动释放，你只要专心构筑。' },
    { target: '.shop-btns', title: '刷新与撤销', text: '不满意可以花钱刷新商店；买错了可以撤销上一次购买。' },
    { target: '.inter-side', title: '你的宝可梦', text: '右边是当前的能力、技能和道具。鼠标指到上面可以看详细说明。' },
    { target: '.go-wrap .go', title: '下一波', text: '准备好了就出发去下一波！' },
  ],
  results: [
    { target: '.btn.store', title: '放进背包', text: '把这只宝可梦放进背包吧！等级、技能、道具都会保留下来，可以用来挑战道馆、和其他训练家对战。' },
  ],
  gym: [
    { target: '.gym-list', title: '八个道馆', text: '关都地区有八个道馆，要按顺序挑战。赢了馆主就能得到徽章。' },
    { target: '.gym-team', title: '馆主的队伍', text: '每个道馆的队伍都是固定的：先打败道馆训练家，再挑战馆主。输了可以研究一下属性克制再来。' },
    { target: '.gym-reward', title: '徽章', text: '每枚徽章永久提升一项能力和对应属性的技能伤害，冒险和对战里都生效。' },
    { target: '.gym-you', title: '你的队伍', text: '和单挑一样，三只宝可梦同时上场：队长由你操作，另外两只由 AI 操作。也可以打开「自动」整场观战。' },
  ],
  pvp: [
    { target: '.pvp-party', title: '背包', text: '冒险结束时放进来的宝可梦。点一下查看详情，可以设为队长或者让它上场。' },
    { target: '.pvp-team', title: '出战队伍', text: '单挑时三只同时上场：队长由你操作，另外两只由 AI 操作。右边的「自动」开关可以整场交给 AI。' },
    { target: '.pvp-go', title: '开始匹配', text: '优先匹配积分接近的训练家，等不到人时由 AI 训练家补位。也可以先打一场不计分的练习赛。' },
    { target: '.pvp-board', title: '排行榜', text: '赢了加分、输了扣分，段位从精灵球级一路升到冠军。' },
  ],
  lab: [
    { target: '.lab .tabbar', title: '大木研究所', text: '「研究」用星之沙永久提升所有宝可梦；「图鉴」记录你拥有的宝可梦；「成就」可以解锁新的宝可梦和训练家。' },
  ],
};

// ---------------------------------------------------------------- 下一步做什么

export interface Goal { text: string; place: PlaceId; icon: string }

/** 镇上左上角的目标：第一次冒险 → 放进背包 → 按顺序挑战道馆（等级不够就先去练级）→ 通关 → 排位 */
export function nextGoal(p: Profile): Goal {
  if (!p.stats.runs) return { text: '去 1 号道路完成第一次冒险', place: 'route', icon: 'sign' };
  if (!p.party.length) return { text: '冒险结束时，把宝可梦放进背包', place: 'route', icon: 'bag' };
  const g = nextGym(p.badges);
  if (g) {
    const best = Math.max(...p.party.map((m) => m.build.level));
    if (best < g.leader.level - 6) return { text: `去冒险练级：${g.name}推荐 Lv${g.leader.level}`, place: 'route', icon: 'sign' };
    return { text: `挑战${g.name}：馆主${g.leader.name}（推荐 Lv${g.leader.level}）`, place: 'gym', icon: g.badge.icon };
  }
  if (!p.achievements.victory) return { text: '通关一次冒险，击败梦幻', place: 'route', icon: 'trophy' };
  return { text: '在对战场冲击更高的段位', place: 'battle', icon: 'sword' };
}
