/** 小型芯片音乐合成器：方波/三角波/噪声，音效与两首原创循环曲。 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let vol = { sfx: 0.6, music: 0.4 };
const lastPlayed = new Map<string, number>();

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  try {
    ctx = new AudioContext();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.connect(master);
  setVolume(vol.sfx, vol.music);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (wanted) playMusic(wanted as keyof typeof TRACKS);
}

export function setVolume(sfx: number, music: number) {
  vol = { sfx, music };
  if (sfxGain) sfxGain.gain.value = sfx * 0.55;
  if (musicGain) musicGain.gain.value = music * 0.3;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slide = 0, out?: GainNode | null) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(out ?? sfxGain!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, at = 0, hp = 800, out?: GainNode | null) {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(out ?? sfxGain!);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export type Sfx = 'hit' | 'crit' | 'kill' | 'pickup' | 'level' | 'evolve' | 'buy' | 'error' | 'click' | 'wave' | 'clear' | 'hurt' | 'boss' | 'down' | 'revive' | 'heal' | 'boom' | 'ball' | 'achieve' | 'shiny';

export function sfx(name: Sfx) {
  if (!ctx || ctx.state !== 'running') return;
  const now = performance.now();
  const gap = name === 'hit' ? 45 : name === 'pickup' ? 35 : name === 'kill' ? 40 : 60;
  if (now - (lastPlayed.get(name) ?? 0) < gap) return;
  lastPlayed.set(name, now);
  switch (name) {
    case 'hit': tone(220, 0.05, 'square', 0.12, 0, 0.5); break;
    case 'crit': tone(660, 0.06, 'square', 0.14, 0, 0.6); noise(0.05, 0.1, 0, 2000); break;
    case 'kill': noise(0.08, 0.12, 0, 1200); tone(180, 0.08, 'triangle', 0.2, 0, 0.4); break;
    case 'pickup': tone(1046 + Math.random() * 60, 0.05, 'square', 0.06); break;
    case 'level': [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.12, 'square', 0.12, i * 0.07)); break;
    case 'evolve': [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.16, 'square', 0.12, i * 0.09)); break;
    case 'buy': tone(midi(84), 0.06, 'square', 0.1); tone(midi(91), 0.12, 'square', 0.1, 0.06); break;
    case 'error': tone(130, 0.15, 'square', 0.12); break;
    case 'click': tone(880, 0.03, 'square', 0.06); break;
    case 'wave': [67, 72, 79].forEach((n, i) => tone(midi(n), 0.14, 'square', 0.12, i * 0.1)); break;
    case 'clear': [72, 71, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.14, 'square', 0.12, i * 0.09)); break;
    case 'hurt': tone(300, 0.12, 'sawtooth', 0.12, 0, 0.4); break;
    case 'boss': [48, 47, 46, 45].forEach((n, i) => tone(midi(n), 0.3, 'sawtooth', 0.1, i * 0.18)); break;
    case 'down': [64, 60, 55, 48].forEach((n, i) => tone(midi(n), 0.18, 'triangle', 0.18, i * 0.12)); break;
    case 'revive': [60, 64, 67, 72].forEach((n, i) => tone(midi(n), 0.1, 'triangle', 0.18, i * 0.06)); break;
    case 'heal': [76, 79, 84].forEach((n, i) => tone(midi(n), 0.08, 'triangle', 0.12, i * 0.05)); break;
    case 'boom': noise(0.3, 0.18, 0, 200); tone(90, 0.25, 'triangle', 0.25, 0, 0.5); break;
    case 'ball': tone(midi(88), 0.05, 'square', 0.08); tone(midi(95), 0.08, 'square', 0.08, 0.05); break;
    case 'achieve': [79, 84, 88, 91].forEach((n, i) => tone(midi(n), 0.15, 'square', 0.1, i * 0.08)); break;
    // 闪光宝可梦出现时的「叮铃」：几个很高的音快速错落响起
    case 'shiny': [2093, 2637, 3136, 2349, 3520, 4186].forEach((f, i) => tone(f, 0.28, 'triangle', 0.13, i * 0.07)); break;
  }
}

// ---------------------------------------------------------------- 音乐

interface Track { bpm: number; lead: (number | null)[]; bass: (number | null)[]; drum: string }

const TRACKS: Record<string, Track> = {
  battle: {
    bpm: 148,
    lead: [
      69, null, 72, 74, 76, null, 74, 72, 74, null, 76, null, 72, null, 69, null,
      67, null, 69, 72, 74, null, 72, 69, 71, null, 72, null, 74, null, null, null,
      69, null, 72, 74, 76, null, 79, 77, 76, null, 74, null, 72, null, 74, 76,
      77, null, 76, 74, 72, null, 71, 72, 69, null, null, null, 64, null, null, null,
    ],
    bass: [
      45, null, 45, null, 52, null, 45, null, 41, null, 41, null, 48, null, 41, null,
      43, null, 43, null, 50, null, 43, null, 40, null, 40, null, 47, null, 44, null,
      45, null, 45, null, 52, null, 45, null, 41, null, 41, null, 48, null, 41, null,
      38, null, 38, null, 45, null, 40, null, 45, null, 45, null, 40, null, 44, null,
    ],
    drum: 'k.h.s.h.k.h.s.hhk.h.s.h.k.k.s.h.',
  },
  town: {
    bpm: 100,
    lead: [
      72, null, 74, null, 76, null, 79, null, 77, null, 76, null, 74, null, null, null,
      72, null, 74, null, 76, null, 72, null, 74, null, null, null, 67, null, null, null,
      69, null, 71, null, 72, null, 76, null, 74, null, 72, null, 71, null, null, null,
      72, null, 71, null, 69, null, 67, null, 72, null, null, null, null, null, null, null,
    ],
    bass: [
      48, null, null, null, 55, null, null, null, 53, null, null, null, 55, null, null, null,
      48, null, null, null, 55, null, null, null, 50, null, null, null, 55, null, null, null,
      45, null, null, null, 52, null, null, null, 53, null, null, null, 55, null, null, null,
      53, null, null, null, 55, null, null, null, 48, null, null, null, 48, null, null, null,
    ],
    drum: 'k.......h.......k.......h...h...',
  },
  shop: {
    bpm: 112,
    lead: [
      72, null, 76, null, 79, null, 76, null, 77, null, 74, null, 71, null, null, null,
      72, null, 76, null, 79, null, 84, null, 83, null, 79, null, 76, null, null, null,
      74, null, 77, null, 81, null, 77, null, 76, null, 79, null, 84, null, 79, null,
      77, null, 74, null, 71, null, 74, null, 72, null, null, null, null, null, null, null,
    ],
    bass: [
      48, null, null, null, 55, null, null, null, 50, null, null, null, 55, null, null, null,
      48, null, null, null, 55, null, null, null, 52, null, null, null, 55, null, null, null,
      50, null, null, null, 57, null, null, null, 48, null, null, null, 55, null, null, null,
      53, null, null, null, 55, null, null, null, 48, null, null, null, 43, null, null, null,
    ],
    drum: 'k...h...s...h...k...h...s...h.h.',
  },
};

let musicTimer = 0;
let current: string | null = null;
let step = 0;
let nextAt = 0;

let wanted: string | null = null;

export function playMusic(name: keyof typeof TRACKS | null) {
  wanted = name;
  if (!ctx) return;
  if (current === name) return;
  current = name;
  window.clearInterval(musicTimer);
  if (!name) return;
  step = 0;
  nextAt = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(schedule, 50);
}

function schedule() {
  if (!ctx || !current || ctx.state !== 'running') return;
  const tr = TRACKS[current];
  const stepDur = 60 / tr.bpm / 4;
  while (nextAt < ctx.currentTime + 0.2) {
    const at = nextAt - ctx.currentTime;
    const i = step % tr.lead.length;
    const l = tr.lead[i];
    if (l != null) tone(midi(l), stepDur * 1.8, 'square', 0.08, at, 0, musicGain);
    const b = tr.bass[i % tr.bass.length];
    if (b != null) tone(midi(b), stepDur * 1.9, 'triangle', 0.22, at, 0, musicGain);
    const d = tr.drum[step % tr.drum.length];
    if (d === 'k') tone(110, 0.09, 'triangle', 0.35, at, 0.35, musicGain);
    else if (d === 's') noise(0.08, 0.12, at, 1500, musicGain);
    else if (d === 'h') noise(0.025, 0.05, at, 6000, musicGain);
    step++;
    nextAt += stepDur;
  }
}
