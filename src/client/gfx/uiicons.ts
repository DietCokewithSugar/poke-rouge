/**
 * 界面图标（12×12 像素）：齿轮、声音、奖杯、硬币、星星、王冠、好友、精灵球等取自
 * JPTER78/pokesurvivor 的 js/ui/icons.js（MIT 许可），返回、关闭、刷新、锁、撤销、暂停、门、
 * 复制、房子、问号、背包、电脑等是按同样的画风新画的。
 *   k 描边，其余字母按各自的调色板上色，. 透明
 */
const K = '#1b1528';

interface Def { pal: Record<string, string>; rows: string[] }

const MEDAL = ['.kkk....kkk.', '.krk....kqk.', '..krk..kqk..', '...krkkqk...', '....kkkk....', '...kmmmmk...',
  '..kmwmmmnk..', '.kmwmsmmmnk.', '.kmmsssmmnk.', '.kmmmsmmmnk.', '..kmmmmmnk..', '...kkkkkk...'];

const W = '#f4f8ff';

export const UI_ICONS: Record<string, Def> = {
  // ---------------- 取自 pokesurvivor ----------------
  gear: { pal: { g: '#c9d6ff', d: '#7f93c9' }, rows: [
    '....kkkk....', '.kk.kggk.kk.', '.kgkkggkkgk.', '..kggggggk..', 'kkggkkkkggkk', 'kgggk..kgddk',
    'kgggk..kgddk', 'kkggkkkkddkk', '..kggddddk..', '.kgkkddkkdk.', '.kk.kddk.kk.', '....kkkk....'] },
  full: { pal: { w: W }, rows: [
    'kkkkk..kkkkk', 'kwwwk..kwwwk', 'kwkk....kkwk', 'kwk......kwk', 'kkk......kkk', '............',
    '............', 'kkk......kkk', 'kwk......kwk', 'kwkk....kkwk', 'kwwwk..kwwwk', 'kkkkk..kkkkk'] },
  heart: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#ffd3d8' }, rows: [
    '............', '.kkk....kkk.', 'kwwrk..krrrk', 'kwrrrkkrrrsk', 'krrrrrrrrrsk', 'krrrrrrrrrsk',
    '.krrrrrrrsk.', '..krrrrrsk..', '...krrrsk...', '....krsk....', '.....kk.....', '............'] },
  up: { pal: { g: '#5fe08a', d: '#2f9a52', w: '#c8ffd8' }, rows: [
    '.....kk.....', '....kwgk....', '...kwgggk...', '..kwgggggk..', '.kwgggggggk.', 'kkkkggggkkkk',
    '...kggggk...', '...kggggk...', '...kggddk...', '...kgdddk...', '...kddddk...', '...kkkkkk...'] },
  bond: { pal: { y: '#ffd23f', w: '#fff3b0', p: '#ff8ad8', q: '#ffd3f1' }, rows: [
    '.kkkkk......', 'kwyyyyk.....', 'kykkkyk.....', 'kyk.kyk.....', 'kykkkyk.....', 'kyyyyykkkkk.',
    '.kkkkkqppppk', '.....kpkkkpk', '.....kpk.kpk', '.....kpkkkpk', '.....kpppppk', '......kkkkk.'] },
  clock: { pal: { w: '#f4f4ff', y: '#ffd23f', o: '#c9c9e0' }, rows: [
    '....kkkk....', '..kkyyyykk..', '.kyywwwwyyk.', '.kywwwkwwyk.', 'kywwwwkwwwyk', 'kywwwwkwwwyk',
    'kywwwwkkkwyk', 'kywwwwwwwwyk', '.kywwwwwwyk.', '.kyyowwwyyk.', '..kkyyyykk..', '....kkkk....'] },
  shield: { pal: { s: '#9fb1c9', d: '#5d6f8c', w: '#e6eef8', r: '#4fb4ff' }, rows: [
    '............', '.kkkkkkkkkk.', '.kwwsssssdk.', '.kwssrrssdk.', '.kwssrrssdk.', '.kssrrrrsdk.',
    '.kssrrrrsdk.', '..kssrrsdk..', '..kssssddk..', '...ksssdk...', '....kddk....', '.....kk.....'] },
  book: { pal: { c: '#4fb4ff', d: '#2a6fb0', p: '#f4f4ff', y: '#ffd23f' }, rows: [
    '............', '.kkkkkkkkkk.', '.kcccccccck.', '.kcyyyyyyck.', '.kcccccccck.', '.kccyyyyyck.',
    '.kcccccccck.', '.kcccccccck.', '.kddddddddk.', '.kppppppppk.', '.kkkkkkkkkk.', '............'] },
  coin: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
    '....kkkk....', '..kkyyyykk..', '.kyywwyyyyk.', '.kywyyyyyok.', 'kyyyyooyyyok', 'kywyoyyoyyok',
    'kyyyoyyoyyok', 'kyyyyooyyyok', '.kyyyyyyyok.', '.kooyyyyook.', '..kkooookk..', '....kkkk....'] },
  star: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
    '.....kk.....', '.....kk.....', '....kwyk....', '....kyyk....', 'kkkkwyyykkkk', 'kwyyyyyyyyok',
    '.kyyyyyyyok.', '..kyyyyyyk..', '..kyyyoyyk..', '.kyok..koyk.', '.kok....kok.', '.kk......kk.'] },
  crown: { pal: { y: '#ffd23f', o: '#c08a10', r: '#ff5f6d' }, rows: [
    '............', '............', 'k....k....k.', 'kk..kyk..kk.', 'kyk.kyk.kyk.', 'kyykyyykyyk.',
    'kyyyyyyyyyk.', 'kyyryyyryyk.', 'kyyyyyyyyyk.', 'koooooooook.', 'kkkkkkkkkkk.', '............'] },
  user: { pal: { u: '#b9cbf0', d: '#7f93c0' }, rows: [
    '............', '....kkkk....', '...kuuuuk...', '...kuuuuk...', '...kuuuuk...', '....kuuk....',
    '..kkkuukkk..', '.kuuuuuuuuk.', '.kuuuuuuuuk.', '.kdduuuuddk.', '.kkkkkkkkkk.', '............'] },
  sound: { pal: { w: '#e8eef8' }, rows: [
    '............', '.....kk.....', '....kwk..k..', '...kwwk...k.', 'kkkwwwk.k..k', 'kwwwwwk..k.k',
    'kwwwwwk..k.k', 'kkkwwwk.k..k', '...kwwk...k.', '....kwk..k..', '.....kk.....', '............'] },
  mute: { pal: { w: '#e8eef8', r: '#ff5f6d' }, rows: [
    '............', '.....kk.....', '....kwk.....', '...kwwk.....', 'kkkwwwk.r..r', 'kwwwwwk..rr.',
    'kwwwwwk..rr.', 'kkkwwwk.r..r', '...kwwk.....', '....kwk.....', '.....kk.....', '............'] },
  medal: { pal: { r: '#c47bff', q: '#7a3fb0', m: '#ffd23f', n: '#c08a10', w: '#fff3b0', s: '#fffbe0' }, rows: MEDAL },
  medalOff: { pal: { r: '#3a4870', q: '#2a3458', m: '#3a4870', n: '#2a3458', w: '#4a5a88', s: '#4a5a88' }, rows: MEDAL },
  trophy: { pal: { y: '#ffd23f', d: '#c08a10', w: '#fff3b0' }, rows: [
    '............', '..kkkkkkkk..', 'kkkwyyyydkkk', 'k.kwyyyydk.k', 'k.kwyyyydk.k', '.kkwyyyydkk.',
    '...kyyyyk...', '....kyyk....', '....kyyk....', '...kddddk...', '..kyyyyyyk..', '..kkkkkkkk..'] },
  friends: { pal: { b: '#4fb4ff', d: '#2a6fb0', g: '#5fe08a', h: '#2f9a52' }, rows: [
    '............', '..kkk..kkk..', '.kbbbkkgggk.', '.kbbbkkgggk.', '..kkk..kkk..', '............',
    '.kkkkkkkkkk.', 'kbbbbkkggggk', 'kbbbbkkggggk', 'kddddkkhhhhk', 'kkkkkkkkkkkk', '............'] },
  ball: { pal: { r: '#ff4d4d', w: '#f4f4f4', s: '#c23a3a' }, rows: [
    '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkwwkkkkk',
    'kwwwkwwkwwwk', 'kwwwwkkwwwwk', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '..kkwwwwkk..', '....kkkk....'] },
  cards: { pal: { a: '#ffd23f', b: '#4fb4ff', w: '#e6f4ff' }, rows: [
    '............', '.kkkkkk.....', '.kaaaaakkkk.', '.kaaaakbbbbk', '.kaaaakbwwbk', '.kaaaakbwwbk',
    '.kaaaakbbbbk', '.kaaaakbwwbk', '.kkkkkkbwwbk', '......kbbbbk', '......kkkkkk', '............'] },

  // ---------------- 新画的 ----------------
  back: { pal: { w: W }, rows: [
    '............', '............', '....kk......', '...kwk......', '..kwwkkkkkk.', '.kwwwwwwwwwk',
    '.kwwwwwwwwwk', '..kwwkkkkkk.', '...kwk......', '....kk......', '............', '............'] },
  next: { pal: { w: W }, rows: [
    '............', '............', '......kk....', '......kwk...', '.kkkkkkwwk..', 'kwwwwwwwwwk.',
    'kwwwwwwwwwk.', '.kkkkkkwwk..', '......kwk...', '......kk....', '............', '............'] },
  close: { pal: { w: W }, rows: [
    '............', '.kk......kk.', 'kwwk....kwwk', '.kwwk..kwwk.', '..kwwkkwwk..', '...kwwwwk...',
    '...kwwwwk...', '..kwwkkwwk..', '.kwwk..kwwk.', 'kwwk....kwwk', '.kk......kk.', '............'] },
  refresh: { pal: { w: W }, rows: [
    '...kkkkk.k..', '..kwwwwwkwk.', '.kwwkkkkwwk.', 'kwwk...kwwwk', 'kwk....kkkkk', 'kwk.........',
    'kwk.........', 'kwk.....kwk.', 'kwwk...kwwk.', '.kwwkkkkwwk.', '..kwwwwwwk..', '...kkkkkk...'] },
  undo: { pal: { w: W }, rows: [
    '............', '...k........', '..kwkkkkk...', '.kwwwwwwwk..', '..kwkkkkwwk.', '...k....kwk.',
    '.........kwk', '.........kwk', '........kwwk', '....kkkkwwk.', '....kwwwwk..', '....kkkkk...'] },
  swap: { pal: { w: W }, rows: [
    '............', '.......k....', '.kkkkkkwk...', '.kwwwwwwwk..', '.kkkkkkwk...', '.......k....',
    '....k.......', '...kwkkkkkk.', '..kwwwwwwwk.', '...kwkkkkkk.', '....k.......', '............'] },
  lock: { pal: { w: '#e8eef8', y: '#ffd23f', d: '#c08a10' }, rows: [
    '............', '....kkkk....', '...kwwwwk...', '..kwk..kwk..', '..kwk..kwk..', '.kkkkkkkkkk.',
    '.kyyyyyyyyk.', '.kyyykkyyyk.', '.kyyykkyyyk.', '.kyyyyyyyyk.', '.kddddddddk.', '.kkkkkkkkkk.'] },
  unlock: { pal: { w: '#e8eef8', y: '#c9d2de', d: '#7d8899' }, rows: [
    '....kkkk....', '...kwwwwk...', '..kwk..kwk..', '..kwk...kk..', '..kwk.......', '.kkkkkkkkkk.',
    '.kyyyyyyyyk.', '.kyyykkyyyk.', '.kyyykkyyyk.', '.kyyyyyyyyk.', '.kddddddddk.', '.kkkkkkkkkk.'] },
  pause: { pal: { w: W }, rows: [
    '............', '.kkkk..kkkk.', '.kwwk..kwwk.', '.kwwk..kwwk.', '.kwwk..kwwk.', '.kwwk..kwwk.',
    '.kwwk..kwwk.', '.kwwk..kwwk.', '.kwwk..kwwk.', '.kwwk..kwwk.', '.kkkk..kkkk.', '............'] },
  play: { pal: { w: W }, rows: [
    '............', '..kk........', '..kwkk......', '..kwwwkk....', '..kwwwwwkk..', '..kwwwwwwwk.',
    '..kwwwwwwwk.', '..kwwwwwkk..', '..kwwwkk....', '..kwkk......', '..kk........', '............'] },
  door: { pal: { b: '#b07840', d: '#7a4a24', y: '#ffd23f' }, rows: [
    '............', '...kkkkkk...', '..kbbbbbbk..', '..kbddddbk..', '..kbdbbdbk..', '..kbddddbk..',
    '..kbbbbbbk..', '..kbbbbyyk..', '..kbbbbbbk..', '..kbddddbk..', '..kbbbbbbk..', '.kkkkkkkkkk.'] },
  copy: { pal: { w: W, g: '#9fb1c9' }, rows: [
    '............', '.kkkkkk.....', '.kwwwwk.....', '.kwkkkkkkk..', '.kwkwwwwwwk.', '.kwkwgggwwk.',
    '.kwkwwwwwwk.', '.kkkwgggwwk.', '...kwwwwwwk.', '...kwggggwk.', '...kwwwwwwk.', '...kkkkkkkk.'] },
  home: { pal: { r: '#e04848', w: '#f4ecd8', b: '#a86a3a' }, rows: [
    '.....kk.....', '....krrk....', '...krrrrk...', '..krrrrrrk..', '.krrrrrrrrk.', 'krrrrrrrrrrk',
    'kkkkkkkkkkkk', '.kwwwwwwwwk.', '.kwkkwwbbwk.', '.kwkkwwbbwk.', '.kwwwwwbbwk.', '.kkkkkkkkkk.'] },
  help: { pal: { b: '#4fb4ff', w: W }, rows: [
    '...kkkkkk...', '..kbbbbbbk..', '.kbbwwwwbbk.', 'kbbwbbbbwbbk', 'kbbbbbbbwbbk', 'kbbbbbbwbbbk',
    'kbbbbbwbbbbk', 'kbbbbbwbbbbk', 'kbbbbbbbbbbk', '.kbbbbwbbbk.', '..kbbbbbbk..', '...kkkkkk...'] },
  check: { pal: { g: '#5fe08a' }, rows: [
    '............', '..........kk', '.........kgk', '........kggk', '.kk....kggk.', 'kggk..kggk..',
    'kgggkkggk...', '.kgggggk....', '..kgggk.....', '...kgk......', '....k.......', '............'] },
  eye: { pal: { w: W, b: '#4fb4ff' }, rows: [
    '............', '............', '...kkkkkk...', '..kwwwwwwk..', '.kwwwkkwwwk.', 'kwwwkbbkwwwk',
    'kwwwkbbkwwwk', '.kwwwkkwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............', '............'] },
  bag: { pal: { g: '#e09040', l: '#ffc070', d: '#a85a20', y: '#ffd23f' }, rows: [
    '....kkkk....', '...kk..kk...', '..kkkkkkkk..', '.kggggggggk.', '.kgllllllgk.', '.kggggggggk.',
    '.kgggyygggk.', '.kgggyygggk.', '.kggggggggk.', '.kddddddddk.', '.kddddddddk.', '.kkkkkkkkkk.'] },
  pc: { pal: { g: '#c9d2de', d: '#7d8899', b: '#4fb4ff', w: '#cfe8ff' }, rows: [
    '............', '.kkkkkkkkkk.', '.kggggggggk.', '.kgbbbbbbgk.', '.kgbwbbbbgk.', '.kgbbbbbbgk.',
    '.kgbbbbbbgk.', '.kggggggggk.', '.kkkkkkkkkk.', '....kddk....', '..kkkkkkkk..', '..kddddddk..'] },
  pencil: { pal: { p: '#ff8ab0', y: '#ffd23f', w: '#f4d8a8' }, rows: [
    '.........kk.', '........kppk', '.......kyykk', '......kyyk..', '.....kyyk...', '....kyyk....',
    '...kyyk.....', '..kwyk......', '.kwwk.......', '.kkk........', '............', '............'] },
  bow: { pal: { p: '#ff8ad8', q: '#c04a98' }, rows: [
    '............', '.kk......kk.', 'kppk....kppk', 'kpppk..kpppk', 'kppppkkppppk', 'kpppkqqkpppk',
    'kppppkkppppk', 'kpppk..kpppk', '.kpk.kk.kpk.', '..k.kqqk.k..', '...kqk.kqk..', '...kk...kk..'] },
  flask: { pal: { w: '#e6f4ff', g: '#5fe08a' }, rows: [
    '....kkkk....', '....kwwk....', '....kwwk....', '....kwwk....', '...kwwwwk...', '..kwwwwwwk..',
    '.kwggggggwk.', 'kwggwgggggwk', 'kggggggwgggk', 'kggggggggggk', '.kggggggggk.', '..kkkkkkkk..'] },
  sword: { pal: { w: '#f4f8ff', g: '#9fb1c9', y: '#ffd23f', b: '#a86a3a' }, rows: [
    '.........kk.', '........kwwk', '.......kwwgk', '......kwwgk.', '.....kwwgk..', '.kk.kwwgk...',
    'kyykkwgk....', '.kyykgk.....', '..kyyk......', '.kbkkyk.....', 'kbbk.kk.....', '.kk.........'] },
  sign: { pal: { b: '#c08850', d: '#7a4a24', g: '#5fb040' }, rows: [
    '............', 'kkkkkkkkkk..', 'kbbbbbbbbbk.', 'kbdddddddbbk', 'kbbbbbbbbbk.', 'kkkkkbkkkk..',
    '....kbk.....', '....kbk.....', '....kbk.....', '....kbk.....', '..kkkbkkk...', '..kgggggk...'] },
  cross: { pal: { r: '#ff5f6d' }, rows: [
    '............', '....kkkk....', '....krrk....', '....krrk....', '.kkkkrrkkkk.', '.krrrrrrrrk.',
    '.krrrrrrrrk.', '.kkkkrrkkkk.', '....krrk....', '....krrk....', '....kkkk....', '............'] },
  robot: { pal: { s: '#b9d4f0', b: '#2a6fb0', w: '#e6f4ff', y: '#ffd23f', d: '#7f93c0' }, rows: [
    '....kyyk....', '.....kk.....', '..kkkkkkkk..', '.kssssssssk.', '.ksbbssbbsk.', 'kksbwssbwskk',
    'kksssssssskk', '.ksskkkkssk.', '.kssssssssk.', '..kkkkkkkk..', '....kddk....', '..kkkkkkkk..'] },
  plus: { pal: { g: '#5fe08a' }, rows: [
    '............', '....kkkk....', '....kggk....', '....kggk....', '.kkkkggkkkk.', '.kggggggggk.',
    '.kggggggggk.', '.kkkkggkkkk.', '....kggk....', '....kggk....', '....kkkk....', '............'] },
};

const cache = new Map<string, string>();

/** 界面图标的 dataURL（12×12 像素，按 scale 放大） */
export function uiIconUrl(name: string, scale = 2): string {
  const key = `${name}@${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = UI_ICONS[name] ?? UI_ICONS.star;
  const c = document.createElement('canvas');
  c.width = 12 * scale;
  c.height = 12 * scale;
  const x = c.getContext('2d')!;
  const pal: Record<string, string> = { k: K, ...def.pal };
  def.rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const col = pal[row[rx]];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(rx * scale, ry * scale, scale, scale);
    }
  });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function uiIcon(name: string, scale = 2, cls = 'uico'): HTMLImageElement {
  const img = new Image();
  img.src = uiIconUrl(name, scale);
  img.className = cls;
  img.draggable = false;
  img.alt = '';
  img.style.setProperty('--iw', `${(12 * scale) / 16}rem`);
  return img;
}
