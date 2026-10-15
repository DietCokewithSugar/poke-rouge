import { ENEMIES } from '../enemies';
import { enemyDmgMult } from '../waves';
import { PLAYER_R, hurtPlayer } from './combat';
import type { Enemy, SimPlayer } from './entities';
import type { GameSim } from './game';

const TAU = Math.PI * 2;

/** 敌人每帧行为。返回 false 表示该敌人自行消失（自爆、逃走）。 */
export function updateEnemy(sim: GameSim, e: Enemy, dt: number): boolean {
  const st = e.st;
  e.age += dt;
  for (const k of ['para', 'slow', 'freeze', 'stun'] as const) if (st[k] > 0) st[k] -= dt;

  const target = sim.nearestPlayer(e.x, e.y);
  const stopped = st.freeze > 0 || st.stun > 0;
  let mul = 1;
  if (st.para > 0) mul *= 0.5;
  if (st.slow > 0) mul *= 1 - st.slowAmt;
  if (sim.pressureAt(e.x, e.y)) mul *= 0.8;
  const spd = e.speed * mul;

  let mx = 0, my = 0;
  if (target && !stopped) {
    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const ai = e.ai;
    ai.cd -= dt;
    ai.cd2 -= dt;
    switch (e.def.ai) {
      case 'chase':
      case 'tank':
        mx = ux; my = uy;
        break;
      case 'swarm': {
        const wob = Math.sin(e.age * 4 + e.id) * 0.7;
        const a = Math.atan2(uy, ux) + wob;
        mx = Math.cos(a); my = Math.sin(a);
        break;
      }
      case 'charge':
        if (ai.state === 0) {
          mx = ux; my = uy;
          if (d < 115 && ai.cd <= 0) {
            ai.state = 1; ai.t = 0.7; ai.ax = ux; ai.ay = uy;
            sim.emit(['warn', 1, r1(e.x), r1(e.y), 8, 700, r2(Math.atan2(uy, ux)), 140]);
          }
        } else if (ai.state === 1) {
          ai.t -= dt;
          if (ai.t <= 0) { ai.state = 2; ai.t = 0.42; }
        } else {
          ai.t -= dt;
          mx = ai.ax * 4.2; my = ai.ay * 4.2;
          if (ai.t <= 0) { ai.state = 0; ai.cd = 2.6; }
        }
        break;
      case 'shooter': {
        const shot = e.def.shot!;
        const want = shot.range * 0.75;
        if (d > want + 15) { mx = ux; my = uy; }
        else if (d < want - 35) { mx = -ux; my = -uy; }
        else { mx = -uy * 0.35 * (e.id % 2 ? 1 : -1); my = ux * 0.35 * (e.id % 2 ? 1 : -1); }
        if (ai.cd <= 0 && d < shot.range) {
          ai.cd = shot.cd * sim.rng.range(0.85, 1.2);
          enemyShoot(sim, e, Math.atan2(dy, dx));
        }
        break;
      }
      case 'bomber': {
        const b = e.def.blast!;
        if (ai.state === 0) {
          mx = ux; my = uy;
          // 闪光的不会自爆：打倒它就一定能得到，不会被自己炸没
          if (d < b.radius * 0.6 && !e.shiny) {
            ai.state = 1; ai.t = 0.85;
            sim.emit(['warn', 0, r1(e.x), r1(e.y), b.radius, 850, 0, 0]);
          }
        } else {
          ai.t -= dt;
          if (ai.t <= 0) { explode(sim, e); return false; }
        }
        break;
      }
      case 'flee': {
        mx = -ux; my = -uy;
        const a = Math.sin(e.age * 1.7 + e.id) * 0.9;
        const c = Math.cos(a), s = Math.sin(a);
        [mx, my] = [mx * c - my * s, mx * s + my * c];
        if (e.age > 14) {
          sim.emit(['txt', r1(e.x), r1(e.y) - 20, `${e.def.name}逃走了…`, '#cfd8e6']);
          return false;
        }
        break;
      }
      case 'elite_beedrill':
        [mx, my] = beedrill(sim, e, target, ux, uy, d, dt);
        break;
      case 'elite_onix':
        [mx, my] = onix(sim, e, target, ux, uy);
        break;
      case 'elite_gengar':
        [mx, my] = gengar(sim, e, target, ux, uy, d, dt);
        break;
      case 'boss_snorlax':
        [mx, my] = snorlax(sim, e, target, ux, uy, dt);
        break;
      case 'boss_mew':
        [mx, my] = mew(sim, e, target, ux, uy, d, dt);
        break;
    }
    if (mx || my) e.dir = Math.atan2(my, mx);
  }

  e.x += (mx * spd + e.vx) * dt;
  e.y += (my * spd + e.vy) * dt;
  const decay = Math.exp(-7 * dt);
  e.vx *= decay; e.vy *= decay;
  const m = e.r + 4;
  e.x = Math.max(m, Math.min(sim.w - m, e.x));
  e.y = Math.max(m + 6, Math.min(sim.h - m, e.y));
  return true;
}

function r1(v: number) { return Math.round(v); }
function r2(v: number) { return Math.round(v * 100) / 100; }

export function enemyShoot(sim: GameSim, e: Enemy, ang: number, override?: { count?: number; spread?: number; speed?: number; power?: number; homing?: number; fx?: string; size?: number }) {
  const shot = e.def.shot!;
  const n = override?.count ?? shot.count ?? 1;
  const spread = override?.spread ?? shot.spread ?? 0;
  const speed = override?.speed ?? shot.speed;
  const ring = spread >= TAU - 0.01;
  const power = (override?.power ?? shot.power) * enemyDmgMult(sim.wave) * 0.85;
  for (let i = 0; i < n; i++) {
    const a = ring ? ang + (i / n) * TAU : n > 1 ? ang + spread * (i / (n - 1) - 0.5) : ang;
    sim.spawnProj({
      fx: override?.fx ?? shot.fx, owner: -1, skill: null, type: e.def.types[0],
      x: e.x, y: e.y - 6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      r: override?.size ?? shot.size ?? 3, dmg: power, pierce: 0, life: (shot.range * 1.6) / Math.max(40, speed),
      homing: override?.homing ?? 0, crit: 0, knock: 0, slow: shot.slow,
    });
  }
}

function explode(sim: GameSim, e: Enemy) {
  const b = e.def.blast!;
  const dmg = b.power * enemyDmgMult(sim.wave);
  sim.emit(['boom', r1(e.x), r1(e.y), b.radius, b.cloud ? 'e_cloud' : 'e_blast']);
  for (const p of sim.players) {
    if (Math.hypot(p.x - e.x, p.y - e.y) <= b.radius + PLAYER_R) hurtPlayer(sim, p, dmg, 'spec');
  }
  if (b.cloud) {
    sim.zones.push({ id: sim.newId(), fx: 'e_cloud', owner: -1, skill: null, type: 'poison', x: e.x, y: e.y, r: b.radius * 0.9, life: 3.5, maxLife: 3.5, tick: 0.5, t: 0, dmg: dmg * 0.25 });
  }
  sim.killEnemy(e, null, true);
}

function enemyStrike(sim: GameSim, x: number, y: number, r: number, delay: number, power: number, fx: string) {
  sim.strikes.push({ owner: -1, skill: null, x, y, r, t: delay, dmg: power * enemyDmgMult(sim.wave), type: 'normal', fx, cat: 'phys', enemy: true });
  sim.emit(['warn', 0, r1(x), r1(y), r, Math.round(delay * 1000), 0, 0]);
}

// ---------------------------------------------------------------- 精英

function beedrill(sim: GameSim, e: Enemy, _t: SimPlayer, ux: number, uy: number, d: number, dt: number): [number, number] {
  const ai = e.ai;
  if (ai.state === 0) {
    if (ai.cd <= 0) { ai.cd = 2.0; enemyShoot(sim, e, Math.atan2(uy, ux)); }
    if (ai.cd2 <= 0 && d < 170) {
      ai.state = 1; ai.t = 0.55; ai.ax = ux; ai.ay = uy;
      sim.emit(['warn', 1, r1(e.x), r1(e.y), 12, 550, r2(Math.atan2(uy, ux)), 170]);
    }
    return [ux, uy];
  }
  ai.t -= dt;
  if (ai.state === 1) {
    if (ai.t <= 0) { ai.state = 2; ai.t = 0.4; }
    return [0, 0];
  }
  if (ai.t <= 0) { ai.state = 0; ai.cd2 = 3.2; }
  return [ai.ax * 5.5, ai.ay * 5.5];
}

function onix(sim: GameSim, e: Enemy, t: SimPlayer, ux: number, uy: number): [number, number] {
  const ai = e.ai;
  if (ai.cd <= 0) {
    ai.cd = 3.0;
    for (let i = 0; i < 3; i++) {
      enemyStrike(sim, t.x + sim.rng.range(-40, 40), t.y + sim.rng.range(-40, 40), 26, 1.0 + i * 0.15, e.def.shot!.power, 'e_rock');
    }
  }
  return [ux, uy];
}

function gengar(sim: GameSim, e: Enemy, t: SimPlayer, ux: number, uy: number, d: number, dt: number): [number, number] {
  const ai = e.ai;
  if (ai.state === 1) {
    ai.t -= dt;
    if (ai.t <= 0) {
      const a = sim.rng.range(0, TAU);
      e.x = Math.max(30, Math.min(sim.w - 30, t.x + Math.cos(a) * 90));
      e.y = Math.max(30, Math.min(sim.h - 30, t.y + Math.sin(a) * 90));
      e.hidden = false;
      ai.state = 0;
      enemyShoot(sim, e, 0, { count: 10, spread: TAU, speed: 95 });
    }
    return [0, 0];
  }
  if (ai.cd <= 0 && d < 220) { ai.cd = 1.6; enemyShoot(sim, e, Math.atan2(uy, ux)); }
  if (ai.cd2 <= 0) {
    ai.cd2 = 7;
    ai.state = 1; ai.t = 0.7;
    e.hidden = true;
    sim.emit(['boom', r1(e.x), r1(e.y), 20, 'e_vanish']);
    return [0, 0];
  }
  if (d > 130) return [ux, uy];
  if (d < 80) return [-ux, -uy];
  return [-uy * 0.6, ux * 0.6];
}

// ---------------------------------------------------------------- 首领

function snorlax(sim: GameSim, e: Enemy, t: SimPlayer, ux: number, uy: number, dt: number): [number, number] {
  const ai = e.ai;
  const enraged = e.hp < e.maxHp * 0.3;
  const k = enraged ? 0.65 : 1;
  switch (ai.state) {
    case 0: {
      if (!(ai.flag & 1) && e.hp < e.maxHp * 0.5) {
        ai.flag |= 1; ai.state = 3; ai.t = 4;
        sim.emit(['msg', '卡比兽睡着了……快趁现在！']);
        return [0, 0];
      }
      if (ai.cd2 <= 0) {
        ai.cd2 = 4.2 * k;
        enemyShoot(sim, e, sim.rng.range(0, TAU));
      }
      if (ai.cd <= 0) {
        ai.cd = 6 * k;
        ai.state = 1; ai.t = 0.5; ai.tx = t.x; ai.ty = t.y; ai.ax = e.x; ai.ay = e.y;
        sim.emit(['warn', 0, r1(t.x), r1(t.y), 56, 1100, 0, 0]);
        return [0, 0];
      }
      return [ux * (enraged ? 1.3 : 1), uy * (enraged ? 1.3 : 1)];
    }
    case 1:
      ai.t -= dt;
      if (ai.t <= 0) { ai.state = 2; ai.t = 0.6; e.hidden = true; }
      return [0, 0];
    case 2: {
      ai.t -= dt;
      const f = 1 - Math.max(0, ai.t) / 0.6;
      e.x = ai.ax + (ai.tx - ai.ax) * f;
      e.y = ai.ay + (ai.ty - ai.ay) * f;
      if (ai.t <= 0) {
        e.hidden = false;
        ai.state = 0;
        sim.emit(['boom', r1(e.x), r1(e.y), 56, 'e_slam']);
        for (const p of sim.players) {
          if (Math.hypot(p.x - e.x, p.y - e.y) <= 56 + PLAYER_R) hurtPlayer(sim, p, e.dmg * 1.3, 'phys', e);
        }
        enemyShoot(sim, e, 0, { count: 12, spread: TAU, speed: 120, fx: 'e_ring' });
      }
      return [0, 0];
    }
    case 3:
      ai.t -= dt;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.035 * dt);
      ai.n += dt;
      if (ai.n > 0.8) { ai.n = 0; sim.emit(['txt', r1(e.x) + 10, r1(e.y) - 40, 'Z', '#cfe6ff']); }
      if (ai.t <= 0) { ai.state = 0; sim.emit(['msg', '卡比兽醒过来了！']); }
      return [0, 0];
  }
  return [0, 0];
}

function mew(sim: GameSim, e: Enemy, t: SimPlayer, ux: number, uy: number, d: number, dt: number): [number, number] {
  const ai = e.ai;
  const enraged = sim.waveT >= sim.waveDur;
  const k = enraged ? 0.6 : 1;
  // 召唤
  for (const [bit, frac] of [[2, 0.66], [4, 0.33]] as const) {
    if (!(ai.flag & bit) && e.hp < e.maxHp * frac) {
      ai.flag |= bit;
      sim.emit(['msg', '梦幻召唤了伙伴！']);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        sim.queueSpawn('kadabra', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60);
      }
    }
  }
  if (ai.state === 2) {
    // 瞬移后的螺旋弹幕
    ai.t -= dt;
    ai.n += dt;
    if (ai.n >= 0.09) {
      ai.n = 0;
      ai.ax += 0.42;
      enemyShoot(sim, e, ai.ax, { count: 2, spread: TAU, speed: 105 });
    }
    if (ai.t <= 0) ai.state = 0;
    return [0, 0];
  }
  if (ai.state === 1) {
    ai.t -= dt;
    if (ai.t <= 0) {
      let x = 0, y = 0;
      for (let i = 0; i < 12; i++) {
        x = sim.rng.range(80, sim.w - 80); y = sim.rng.range(80, sim.h - 80);
        if (sim.players.every((p) => Math.hypot(p.x - x, p.y - y) > 130)) break;
      }
      e.x = x; e.y = y; e.hidden = false;
      ai.state = 2; ai.t = 2.2; ai.n = 0;
    }
    return [0, 0];
  }
  if (ai.flag & 8 && ai.cd2 <= 0) {
    ai.flag &= ~8;
    enemyShoot(sim, e, Math.PI / 16, { count: 16, spread: TAU, speed: 100 });
  }
  if (ai.cd <= 0) {
    ai.cd = 2.6 * k;
    const pat = ai.state === 0 ? (ai.tx++ % 4) : 0;
    switch (pat) {
      case 0:
        enemyShoot(sim, e, 0, { count: 16, spread: TAU, speed: 100 });
        ai.cd2 = 0.4; ai.flag |= 8;
        break;
      case 1:
        enemyShoot(sim, e, Math.atan2(uy, ux), { count: 3, spread: 0.7, speed: 120, homing: 1.4, size: 6, fx: 'e_star' });
        break;
      case 2:
        ai.state = 1; ai.t = 0.6; e.hidden = true;
        sim.emit(['boom', r1(e.x), r1(e.y), 22, 'e_vanish']);
        break;
      case 3:
        for (const p of sim.players) if (p.alive && !p.down) enemyStrike(sim, p.x, p.y, 40, 1.0, ENEMIES.mew.shot!.power * 1.4, 'e_psy');
        break;
    }
  }
  const orbit = e.age * 0.4 + e.id;
  const gx = t.x + Math.cos(orbit) * 120 - e.x;
  const gy = t.y + Math.sin(orbit) * 120 - e.y;
  const gl = Math.hypot(gx, gy);
  if (gl < 10 || d < 50) return [-ux * 0.5, -uy * 0.5];
  return [gx / gl, gy / gl];
}
