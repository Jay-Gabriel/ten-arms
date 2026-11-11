'use strict';
/* ============ four moves per weapon ============
   Every move is built the same way: run(p, w, q) fills a small timeline (q.ev) and says how the body moves (q.seq, or one of the older q.pose kinds).
   Moves 1-3 each run on their own cooldown per weapon and cost a little energy; move 4 is the weapon's ultimate. */
const COST = [12, 18, 25, 40], SKILL_KEYS = ['Q', 'E', 'R', 'RMB'];
const BUFFS = { haste: ['HASTE', 0x35d6ff], life: ['LIFESTEAL', 0xff2f52], power: ['POWER', 0x54ff62], fire: ['INNER FIRE', 0xffd23f], ambush: ['AMBUSH', 0xe8f6ff], ward: ['WARD', 0xffa726], parry: ['PARRY', 0xb14cff] };
for (const k in BUFFS) BUFFS[k].push(col(BUFFS[k][1]));
const SMOKE = col(0x8a8a9a), TOTEM_WOOD = TOON.mat(0x4d3727, HERO.rim);

/* ---- things that last a while: a zone on the ground, a thrown blade, a totem, blades circling the hero ---- */
const fields = [];
function addField(f) { f.t = 0; f.acc = 0; fields.push(f); return f; }
function fieldsUpdate(dt) {
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]; f.t += dt; f.acc += dt; if (f.move) f.move(f, dt);
    while (!f.done && f.every && f.acc >= f.every) { f.acc -= f.every; f.tick(f); }
    if (f.done || f.t >= f.dur) { if (f.end) f.end(f); fields.splice(i, 1); }
  }
}
function clearFields() { for (const f of fields) if (f.end) f.end(f); fields.length = 0; }

/* ---- helpers the moves share ---- */
const arena = (x, z) => { const r = Math.hypot(x, z); return r > ARENA_R ? [x * ARENA_R / r, z * ARENA_R / r] : [x, z]; };
const live = e => !e.dead && !e.gone && e.state !== 'spawn';
const chestOf = e => V3(e.pos.x, e.y + 1.1 * e.def.scale, e.pos.z);
function nearest(x, z, range, skip) { let best = null, bd = range; for (const e of enemies) { if (!live(e) || (skip && skip.has(e))) continue; const d = Math.hypot(e.pos.x - x, e.pos.z - z) - e.radius; if (d < bd) { bd = d; best = e; } } return best; }
function stunAround(x, z, r, dur) { for (const e of enemies) if (live(e) && !e.def.armor && Math.hypot(e.pos.x - x, e.pos.z - z) < r + e.radius) { setState(e, 'stagger'); e.stagT = dur; } }
function lineHit(p, len, width, fn) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); for (const e of enemies.slice()) { if (!live(e)) continue; const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, lx = dx * c - dz * s, lz = dx * s + dz * c; if (lz > -.5 && lz < len + e.radius && Math.abs(lx) < width + e.radius) fn(e); } }
/* cross a stretch of ground in one frame, leaving afterimages and cutting whatever stood in the way */
function dashThrough(p, w, len, width, dmg, ho, n) {
  const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), from = p.pos.clone(), out = []; while (len > 1 && Math.hypot(from.x + fx * len, from.z + fz * len) > ARENA_R) len -= .5;
  for (let i = 0; i < n; i++) { p.pos.set(from.x + fx * len * i / n, 0, from.z + fz * len * i / n); ghosts.spawn(.35 + i * .05); }
  p.pos.set(from.x + fx * len, 0, from.z + fz * len);
  const a = V3(from.x, HERO.arcY, from.z), b = V3(p.pos.x, HERO.arcY, p.pos.z); FX.streak(a, b, 1.3, w.c, .36, 4); FX.streak(a, b, .4, w.c2, .44, 5);
  for (const e of enemies.slice()) { if (!live(e)) continue; const t = clamp((e.pos.x - from.x) * fx + (e.pos.z - from.z) * fz, 0, len); if (Math.hypot(e.pos.x - (from.x + fx * t), e.pos.z - (from.z + fz * t)) < width + e.radius && hitEnemy(e, dmg, ho, fx, fz)) out.push(e); }
  return out;
}
function castFx(p, w) { FX.ring(p.pos, 2.4, w.c, { color2: w.c2, life: .4, gain: 3 }); _c1.set(p.pos.x, 1.1, p.pos.z); FX.flash(_c1, w.c, 4, .3); FX.burst(_c1, { n: 18, color: w.c, speed: 3, up: 5, life: .7, size: .12, grav: -1, r: .7 }); sfx.special(); }
const win = (clip, hand) => HERO.clips[clip].sw[hand || 'R'];
/* body follows a clip's swing: the last of its wind-up until t0, the swing itself from t0 to t1, then the recovery */
const swing = (clip, hand, t0, t1) => { const w = win(clip, hand); return [[0, clip, Math.max(0, w[0] - t0), 1], [t0, clip, w[0], (w[1] - w[0]) / (t1 - t0)], [t1, clip, w[1], .8]]; };

/* ---- buffs, the parry and the ward ---- */
let auraT = 0;
function buffsUpdate(dt) {
  const p = player, b = p.buff; auraT -= dt; const pulse = auraT <= 0; if (pulse) auraT = .45;
  for (const k in b) {
    if (b[k] <= 0) continue; b[k] -= dt;
    if (k === 'ward' && b[k] <= 0) wardBurst();
    else if (pulse && k !== 'parry') FX.ring(p.pos, k === 'ward' ? 1.6 : 1.15, BUFFS[k][2], { life: .5, from: .5, gain: 1.7, thick: .16 });
  }
  for (const c of p.cds) for (let i = 0; i < 4; i++) if (c[i] > 0) c[i] -= dt;
}
function wardBurst() {
  const p = player, c = BUFFS.ward[2]; p.buff.ward = 0; p.wardHp = 0;
  FX.ring(p.pos, 5.2, c, { life: .5, gain: 3.5 }); _c1.set(p.pos.x, 1, p.pos.z); FX.flash(_c1, c, 7, .35); FX.burst(_c1, { n: 30, color: c, speed: 9, life: .6, size: .14 }); sfx.boom(); G.shake(.5);
  aoe(p.pos.x, p.pos.z, 5.2, WEAPONS[2].dmg * 1.5, { kb: 10, launch: 4, heavy: 1, stop: .05, noEn: 1 });
}
/* the ward soaks the blow instead of the hero; returns true when it did */
function wardTake(dmg) {
  const p = player; if (p.buff.ward <= 0) return false;
  p.wardHp -= dmg; _c1.set(p.pos.x, 1.2, p.pos.z); FX.burst(_c1, { n: 12, color: BUFFS.ward[2], speed: 6, life: .3, size: .12 }); FX.ring(p.pos, 1.7, BUFFS.ward[2], { life: .25, gain: 3 }); sfx.clang(); G.shake(.25);
  if (p.wardHp <= 0) p.buff.ward = .0001; return true;
}
/* a blow landed on the raised blade: turn it, then answer with one wide cut */
function parryCounter(e) {
  const p = player, w = WEAPONS[p.wi], c = win(CLIP.s1h); p.buff.parry = 0; p.iT = 1; G.slow(.15, .55); G.focusT = .55; sfx.perfect(); GFX.post.aberr = 1; GFX.post.flash = .2;
  p.yaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z); p.state = 'special'; p.st = 0; p.vel.set(0, 0, 0); _c1.set(p.pos.x, 2.3, p.pos.z); HUD.num(_c1, 'COUNTER', 'note');
  const q = p.seq = { t: 0, ev: [], i: 0, dur: .55, seq: [[0, CLIP.s1h, c[0], (c[1] - c[0]) / .1], [.1, CLIP.s1h, c[1], .8]], move: 0, adv: 0, tg: e, side: 1, id: ++p.atkN };
  q.ev.push({ t: .05, f: () => {
    FX.arc({ follow: p.root, y: HERO.arcY, yaw: p.yaw, tilt: .08, a0: 2.4, a1: -2.6, r0: 1.4, r1: 5.8, color: w.c, color2: w.c2, sweep: .09, fade: .4, gain: 4 }); FX.ring(p.pos, 5.8, w.c, { color2: w.c2, life: .45, gain: 3 }); sfx.boom(); G.shake(.8);
    aoe(p.pos.x, p.pos.z, 5.8, w.dmg * 3.4, { kb: 11, launch: 4, heavy: 1, stun: 1.3, stop: .12, noEn: 1, blast: 1 });
  } });
}

/* ============ the ten signature moves ============ */
const SPECIALS = {
  katana(p, w, q) {            // spinning moon rings
    q.dur = 1.0; q.pose = 'spin'; q.spinRate = 24;
    for (let k = 0; k < 3; k++) q.ev.push({ t: .08 + k * .15, f: () => {
      FX.arc({ follow: p.root, y: .6 + k * .45, yaw: rand(TAU), tilt: randS(.28), a0: 0, a1: TAU * 1.15, r0: 2, r1: 5.2 + k * .9, color: w.c, color2: w.c2, sweep: .2, fade: .34, gain: 3.6 });
      sfx.whoosh(.7); aoe(p.pos.x, p.pos.z, 5.4 + k * .9, w.dmg * .9, { pull: 1.5, stop: .03, shake: .25, noEn: 1 });
    } });
    q.ev.push({ t: .62, f: () => {
      FX.ring(p.pos, 8.6, w.c, { color2: w.c2, life: .55, gain: 2.8 });
      FX.arc({ follow: p.root, y: 1, yaw: rand(TAU), a0: 0, a1: TAU * 1.3, r0: 3, r1: 8.4, color: w.c, color2: w.c2, sweep: .18, fade: .4, gain: 3 });
      FX.flash(p.pos, w.c, 9, .4); sfx.boom(); G.shake(1); GFX.post.flash = .25; WORLD.shock(p.pos.x, p.pos.z, 1);
      aoe(p.pos.x, p.pos.z, 8.4, w.dmg * 2.4, { kb: 13, launch: 6, heavy: 1, stop: .12, noEn: 1 });
    } });
  },
  dual(p, w, q) {              // flash-step through a line, cuts land a beat later
    q.dur = .8; q.pose = 'dash'; const marks = [];
    q.ev.push({ t: .14, f: () => {
      const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), from = p.pos.clone(); let len = 12;
      while (len > 1 && Math.hypot(from.x + fx * len, from.z + fz * len) > ARENA_R) len -= .5;
      for (let i = 0; i < 5; i++) { p.pos.set(from.x + fx * len * i / 5, 0, from.z + fz * len * i / 5); ghosts.spawn(.45 + i * .06); }
      p.pos.set(from.x + fx * len, 0, from.z + fz * len);
      const a = V3(from.x, 1.2, from.z), b = V3(p.pos.x, 1.2, p.pos.z);
      FX.streak(a, b, 1.7, w.c, .42, 4); FX.streak(a, b, .5, w.c2, .5, 5);
      sfx.whoosh(1.6); sfx.dodge(); GFX.post.radial = 1.3; G.slow(.3, .3); G.kick(10);
      for (const e of enemies.slice()) {
        if (e.dead) continue; const t = clamp((e.pos.x - from.x) * fx + (e.pos.z - from.z) * fz, 0, len);
        if (Math.hypot(e.pos.x - (from.x + fx * t), e.pos.z - (from.z + fz * t)) < 2.4 + e.radius) { marks.push(e); hitEnemy(e, w.dmg * 1.3, { kb: 0, stop: .02, shake: .2, noEn: 1, stun: .7 }, fx, fz); }
      }
    } });
    q.ev.push({ t: .5, f: () => {
      for (const e of marks) {
        if (e.dead) continue; const c = V3(e.pos.x, e.y + 1.1 * e.def.scale, e.pos.z), yaw = rand(TAU), r = 2.7 * e.def.scale;
        FX.arc({ pos: c, yaw, tilt: .8, a0: -1.6, a1: 1.6, r0: .6, r1: r, color: w.c, color2: w.c2, sweep: .07, fade: .3, gain: 4 });
        FX.arc({ pos: c, yaw, tilt: -.8, a0: 1.6, a1: -1.6, r0: .6, r1: r, color: w.c, color2: w.c2, sweep: .07, fade: .3, gain: 4 });
        strikeEnemy(e, w.dmg * 2.4, { kb: 6, launch: 4, heavy: 1, stop: .08, shake: .5, noEn: 1 });
      }
      if (marks.length) sfx.boom();
    } });
  },
  heavy(p, w, q) {             // leap and break the ground
    q.dur = 1.05; q.pose = 'raise'; q.t0 = .3; q.t1 = .44; q.j0 = .04; q.j1 = .44; q.adv = 5;
    q.ev.push({ t: .44, f: () => {
      const pos = V3(p.pos.x + fwdX(p.yaw) * 1.6, 0, p.pos.z + fwdZ(p.yaw) * 1.6);
      FX.arc({ pos: p.pos, y: 1.3, yaw: p.yaw, tilt: Math.PI / 2, a0: 2.4, a1: -.75, r0: 1.6, r1: 5.2, color: w.c, color2: w.c2, sweep: .06, fade: .4, gain: 2.6 });
      FX.ring(pos, 10.5, w.c2, { life: .7, gain: 1.5, thick: .14 }); GFX.post.flash = .2; q.adv = 0;
      groundSlam(pos, 7.6, w.dmg * 3, w, { kb: 9, launch: 9, heavy: 1, stop: .15, shake: 1, noEn: 1 }, 1.7);
    } });
  },
  twin(p, w, q) {              // walking blood-red whirlwind
    q.dur = 1.4; q.pose = 'spin'; q.spinRate = 30; q.move = .62;
    for (let k = 0; k < 9; k++) q.ev.push({ t: .1 + k * .12, f: () => {
      FX.arc({ follow: p.root, y: .5 + rand(1.5), yaw: rand(TAU), tilt: randS(.22), a0: 0, a1: TAU, r0: 1.6, r1: 4.5, color: w.c, color2: w.c2, sweep: .11, fade: .2, gain: 3 });
      sfx.whoosh(1.2 + k * .05); _c1.set(p.pos.x, .3, p.pos.z);
      FX.burst(_c1, { n: 8, color: w.c, speed: 3, up: 9, life: .6, size: .12, r: 2.2, ry: .1, grav: -2 });
      aoe(p.pos.x, p.pos.z, 4.6, w.dmg * .6, { pull: 3, stop: .012, shake: .12, noEn: 1, stun: .3 });
    } });
    q.ev.push({ t: 1.2, f: () => {
      FX.ring(p.pos, 7, w.c, { color2: w.c2, gain: 4 }); FX.flash(p.pos, w.c, 8, .35); sfx.boom(); G.shake(.8); WORLD.shock(p.pos.x, p.pos.z, 1);
      aoe(p.pos.x, p.pos.z, 6.8, w.dmg * 2, { kb: 12, launch: 5, heavy: 1, stop: .1, noEn: 1 });
    } });
  },
  axe(p, w, q) {               // thrown crescents
    q.dur = .8; q.pose = 'throw';
    const thr = (t, off, tilt) => q.ev.push({ t, f: () => { q.side = -q.side; fireWave(p.yaw + off, tilt, 2.7, 25, .8, w.dmg * 1.4, { kb: 5, heavy: 1, stop: .05, shake: .3, noEn: 1 }, 1.25); sfx.whoosh(.8); G.kick(2); } });
    thr(.12, 0, .45); thr(.28, 0, -.45); thr(.46, -.3, .15); thr(.46, .3, -.15);
  },
  staff(p, w, q) {             // thunder bell dome
    q.dur = .95; q.pose = 'raise'; q.t0 = .12; q.t1 = .26;
    q.ev.push({ t: .26, f: () => {
      const pos = p.pos.clone();
      FX.dome(pos, 8, w.c, .4, .45, .45); FX.ring(pos, 8.4, w.c, { color2: w.c2, life: .5, gain: 3.5 });
      for (let i = 0; i < 10; i++) {
        const a = rand(TAU), r = rand(1.5, 7.5), g = V3(pos.x + Math.sin(a) * r, 0, pos.z + Math.cos(a) * r), s = V3(g.x + randS(1.5), 12, g.z + randS(1.5));
        G.after(i * .045, () => { FX.streak(s, g, .42, w.c2, .16, 4); g.y = .2; FX.burst(g, { n: 8, color: w.c2, speed: 6, life: .35, size: .12 }); FX.flash(g, w.c, 3, .15); });
      }
      sfx.boom(); G.shake(.9); GFX.post.flash = .3; WORLD.shock(pos.x, pos.z, 1);
      aoe(pos.x, pos.z, 8, w.dmg * 2.4, { kb: 14, launch: 4, heavy: 1, stun: 1.9, stop: .1, noEn: 1 });
    } });
  },
  fist(p, w, q) {              // hundred-fist barrage, then one that matters
    q.dur = 1.3; q.pose = 'flurry'; q.adv = 1.6;
    for (let k = 0; k < 11; k++) q.ev.push({ t: .1 + k * .065, f: () => {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), side = randS(.7), h = rand(.9, 1.7);
      const a = V3(p.pos.x + side * c + s * .3, h, p.pos.z - side * s + c * .3), b = V3(a.x + s * 4.2, h + randS(.2), a.z + c * 4.2);
      FX.streak(a, b, .55, k % 2 ? w.c : w.c2, .14, 4);
      FX.arc({ pos: b, yaw: p.yaw, pitch: Math.PI / 2, r0: .25, r1: .8, mode: 1, color: w.c, sweep: 0, fade: .2, grow0: .3, grow1: 1, gain: 2.6 });
      sfx.whoosh(1.7); q.side = k % 2 ? 1 : -1;
      for (const e of enemies.slice()) { if (e.dead) continue; const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, lx = dx * c - dz * s, lz = dx * s + dz * c; if (lz > -.5 && lz < 4.8 + e.radius && Math.abs(lx) < 1.7 + e.radius) strikeEnemy(e, w.dmg * .55, { kb: .6, stop: .012, shake: .14, noEn: 1, stun: .3 }); }
    } });
    q.ev.push({ t: .98, f: () => {
      const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), a = V3(p.pos.x, 1.3, p.pos.z), b = V3(p.pos.x + fx * 7, 1.3, p.pos.z + fz * 7), pos = V3(p.pos.x + fx * 3.2, 0, p.pos.z + fz * 3.2);
      FX.streak(a, b, 2.4, w.c, .36, 5); q.side = 0;
      for (const d of [2.5, 5]) FX.arc({ pos: V3(p.pos.x + fx * d, 1.3, p.pos.z + fz * d), yaw: p.yaw, pitch: Math.PI / 2, r0: 1, r1: 2.6, mode: 1, color: d > 3 ? w.c2 : w.c, sweep: 0, fade: .4, grow0: .2, grow1: 1.3, gain: 3.4 });
      FX.ring(pos, 5, w.c, { color2: w.c2, gain: 3 }); FX.flash(pos, w.c, 9, .4); sfx.boom(); G.shake(1); GFX.post.flash = .3; GFX.post.radial = 1.4; WORLD.shock(pos.x, pos.z, 1);
      aoe(pos.x, pos.z, 4.8, w.dmg * 3.2, { kb: 17, launch: 5, heavy: 1, stop: .14, noEn: 1, fx, fz });
    } });
  },
  bow(p, w, q) {               // arrow rain
    q.dur = .6; q.pose = 'shot'; const tg = q.tg;
    let zx = tg ? tg.pos.x : p.pos.x + fwdX(p.yaw) * 9, zz = tg ? tg.pos.z : p.pos.z + fwdZ(p.yaw) * 9; const zr = Math.hypot(zx, zz);
    if (zr > ARENA_R) { zx *= ARENA_R / zr; zz *= ARENA_R / zr; }
    q.ev.push({ t: .12, f: () => { const a = V3(p.pos.x, 1.5, p.pos.z); FX.streak(a, V3(a.x + fwdX(p.yaw) * 3, 18, a.z + fwdZ(p.yaw) * 3), .6, w.c, .32, 4); sfx.twang(); FX.burst(a, { n: 12, color: w.c, speed: 4, up: 6, life: .4, size: .1 }); } });
    q.ev.push({ t: .32, f: () => { zones.push({ x: zx, z: zz, r: 5.6, t: 0, dur: 1.5, tick: 0, hitT: .1, dmg: w.dmg * .75, w }); FX.arc({ pos: V3(zx, 0, zz), y: .08, r0: 0, r1: 5.6, mode: 3, color: w.c, sweep: .2, hold: 1.3, fade: .2, gain: 1.4 }); } });
  },
  dagger(p, w, q) {            // blink between targets
    q.pose = 'dash'; const pool = enemies.filter(e => !e.dead && !e.gone && e.state !== 'spawn'), list = []; let cx = p.pos.x, cz = p.pos.z;
    for (let n = 0; n < 7 && pool.length; n++) { let bi = -1, bd = 18; pool.forEach((e, i) => { const d = Math.hypot(e.pos.x - cx, e.pos.z - cz); if (d < bd) { bd = d; bi = i; } }); if (bi < 0) break; const e = pool.splice(bi, 1)[0]; list.push(e); cx = e.pos.x; cz = e.pos.z; }
    const uniq = list.length; while (uniq && list.length < 4) list.push(list[list.length % uniq]);
    list.forEach((e, i) => q.ev.push({ t: .1 + i * .1, f: () => {
      if (e.dead) return; const a = V3(p.pos.x, 1.2, p.pos.z); let dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z; const l = Math.hypot(dx, dz);
      if (l < .6) { dx = fwdX(p.yaw); dz = fwdZ(p.yaw); } else { dx /= l; dz /= l; }
      ghosts.spawn(.5); let nx = e.pos.x + dx * (e.radius + 1.3), nz = e.pos.z + dz * (e.radius + 1.3); const nr = Math.hypot(nx, nz); if (nr > ARENA_R) { nx *= ARENA_R / nr; nz *= ARENA_R / nr; }
      p.pos.set(nx, 0, nz); p.yaw = Math.atan2(-dx, -dz); FX.streak(a, V3(nx, 1.2, nz), .8, w.c, .32, 4);
      FX.arc({ pos: V3(e.pos.x, e.y + 1.1 * e.def.scale, e.pos.z), yaw: rand(TAU), tilt: randS(1), a0: -1.7, a1: 1.7, r0: .5, r1: 2.9, color: w.c, color2: w.c2, sweep: .06, fade: .28, gain: 4 });
      sfx.whoosh(1.8); GFX.post.aberr = .8; hitEnemy(e, w.dmg * 2.6, { kb: 1, stop: .03, shake: .3, crit: 1, noEn: 1, stun: .8 }, dx, dz);
    } }));
    if (!list.length) q.ev.push({ t: .1, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), a = V3(p.pos.x, 1.2, p.pos.z); ghosts.spawn(.5); p.pos.x += fx * 7; p.pos.z += fz * 7; FX.streak(a, V3(p.pos.x, 1.2, p.pos.z), .8, w.c, .32, 4); sfx.whoosh(1.8); } });
    q.dur = .1 + Math.max(1, list.length) * .1 + .22; G.slow(.6, q.dur * .9);
  },
  sword(p, w, q) {             // one great flying edge
    q.dur = .7; q.pose = 'raise'; q.t0 = .1; q.t1 = .22;
    q.ev.push({ t: .2, f: () => {
      fireWave(p.yaw, Math.PI / 2, 4.6, 32, .9, w.dmg * 3.4, { kb: 10, launch: 5, heavy: 1, stop: .1, shake: .6, noEn: 1 }, 1.3, true);
      FX.arc({ follow: p.root, y: 1.3, yaw: p.yaw, tilt: Math.PI / 2, a0: 2.3, a1: -.8, r0: 1.2, r1: 3.6, color: w.c, color2: w.c2, sweep: .07, fade: .3, gain: 4 });
      sfx.boom(); G.shake(.6); GFX.post.radial = 1.1; FX.flash(p.pos, w.c, 6, .3);
    } });
  },
};

/* ============ the other thirty ============ */
const SKILLS = (() => {
  const C = CLIP, pre = (x, z, o) => V3(x, o || 0, z);
  const buff = (name, cd, key, sec, extra) => ({ name, cd, run(p, w, q) { q.dur = .32; q.seq = [[0, C.cheer, .05, 1.5]]; p.buff[key] = sec; castFx(p, w); if (extra) extra(p, w); } });
  const S = {
    katana: [
      { name: 'Iaido Dash', cd: 3, inv: .4, run(p, w, q) {                                    // one step, one cut, already past them
        q.dur = .42; q.seq = swing(C.s1h, 'R', .1, .16);
        q.ev.push({ t: .1, f: () => { sfx.whoosh(1.5); GFX.post.radial = 1; G.kick(6); dashThrough(p, w, 7.5, 1.9, w.dmg * 1.7, { kb: 3, stop: .04, shake: .25, noEn: 1, stun: .5 }, 4);
          FX.arc({ follow: p.root, y: HERO.arcY, yaw: p.yaw, tilt: .1, a0: 1.2, a1: -1.6, r0: 1.2, r1: 3.4, color: w.c, color2: w.c2, sweep: .06, fade: .3, gain: 3.6 }); } }); } },
      { name: 'Crescent Wave', cd: 5, run(p, w, q) {                                          // a cut that keeps travelling
        q.dur = .5; q.seq = swing(C.s1d, 'R', .12, .2);
        q.ev.push({ t: .14, f: () => { fireWave(p.yaw, .14, 3.4, 27, .75, w.dmg * 2.3, { kb: 7, heavy: 1, stop: .06, shake: .3, noEn: 1 }, HERO.arcY); sfx.whoosh(.8); G.kick(3); } }); } },
      { name: 'Still Water', cd: 7, inv: 0, run(p, w, q) {                                    // parry: the next blow that lands is turned and answered
        q.dur = .8; q.seq = [[0, C.s1h, win(C.s1h)[0], 0]]; p.buff.parry = .7; sfx.swap(0);
        FX.ring(p.pos, 1.7, w.c, { life: .7, from: 1, grow1: .7, gain: 2.4, thick: .12 }); } },
    ],
    dual: [
      { name: 'Cross Cut', cd: 3, run(p, w, q) {                                              // two short crescents thrown as an X
        q.dur = .4; q.seq = swing(C.ds, 'L', .06, .14);
        q.ev.push({ t: .08, f: () => { for (const tl of [.55, -.55]) fireWave(p.yaw, tl, 2.5, 25, .34, w.dmg * 1.6, { kb: 4, stop: .04, shake: .2, noEn: 1 }, HERO.arcY); sfx.whoosh(1.3); } }); } },
      buff('Tailwind', 12, 'haste', 6),                                                        // faster swings, faster feet
      { name: 'Blade Dance', cd: 9, inv: .5, run(p, w, q) {                                    // nine cuts in every direction while walking
        q.dur = 1.15; q.pose = 'spin'; q.spinRate = 22; q.move = .85;
        for (let k = 0; k < 9; k++) q.ev.push({ t: .08 + k * .11, f: () => {
          FX.arc({ follow: p.root, y: .6 + rand(1.2), yaw: rand(TAU), tilt: randS(.5), a0: 0, a1: TAU * .8, r0: 1.2, r1: 3.5, color: k % 2 ? w.c : w.c2, sweep: .08, fade: .18, gain: 3 }); sfx.whoosh(1.5);
          aoe(p.pos.x, p.pos.z, 3.6, w.dmg * (k === 8 ? 1.8 : .7), k === 8 ? { kb: 9, launch: 4, heavy: 1, stop: .08, noEn: 1 } : { kb: .6, stop: .012, shake: .1, noEn: 1, stun: .3 }); } }); } },
    ],
    heavy: [
      { name: 'Shoulder Charge', cd: 4, inv: .5, run(p, w, q) {                               // run through them
        q.dur = .5; q.pose = 'dash'; q.adv = 17; q.advT = .32; GFX.post.radialT = .6; sfx.dodge(); const hit = new Set();
        for (let k = 0; k < 7; k++) q.ev.push({ t: .03 + k * .045, f: () => {
          const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), x = p.pos.x + fx * 1.2, z = p.pos.z + fz * 1.2; _c1.set(x, .3, z); FX.burst(_c1, { n: 5, color: w.c, speed: 3, life: .4, size: .16, grav: 2 });
          for (const e of enemies.slice()) { if (!live(e) || hit.has(e) || Math.hypot(e.pos.x - x, e.pos.z - z) > 1.9 + e.radius) continue; hit.add(e); hitEnemy(e, w.dmg * .9, { kb: 15, launch: 4, heavy: 1, stop: .06, shake: .4, noEn: 1 }, fx, fz); } } });
        q.ev.push({ t: .36, f: () => { GFX.post.radialT = 0; } }); } },
      { name: 'Quake Line', cd: 6, run(p, w, q) {                                              // the ground breaks open in a row
        q.dur = .8; q.pose = 'raise'; q.t0 = .1; q.t1 = .26;
        q.ev.push({ t: .26, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), ox = p.pos.x, oz = p.pos.z; G.shake(.6); sfx.boom();
          for (let i = 0; i < 5; i++) G.after(i * .09, () => { const x = ox + fx * (2.2 + i * 2.2), z = oz + fz * (2.2 + i * 2.2), c = V3(x, 0, z);
            FX.arc({ pos: c, y: .06, r0: .2, r1: 2.3, mode: 2, color: w.c, sweep: 0, hold: .9, fade: .7, gain: 2.6 }); FX.ring(c, 2.2, w.c, { color2: w.c2, life: .35, gain: 3 });
            c.y = .3; FX.burst(c, { n: 16, color: w.c, speed: 7, up: 8, life: .6, size: .14, gain: 3.5 }); FX.chunks({ x, y: -.2, z }, 5, ROCKS, 7); WORLD.shock(x, z, .7);
            aoe(x, z, 2.2, w.dmg * 1.15, { kb: 4, launch: 8, heavy: 1, stop: .04, shake: .3, noEn: 1 }); }); } }); } },
      buff('Iron Will', 14, 'ward', 6, (p, w) => { p.wardHp = 45; FX.dome(p.pos, 1.8, w.c, .2, .3, .4); }),   // a ward that soaks 45 damage, then bursts
    ],
    twin: [
      { name: 'Reaping Throw', cd: 4, run(p, w, q) {                                           // the blade goes out spinning and comes back
        q.dur = .5; q.seq = swing(C.toss, 'R', .1, .2);
        q.ev.push({ t: .14, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), sx = p.pos.x + fx * .8, sz = p.pos.z + fz * .8, o = { position: V3(sx, 1.1, sz) }; sfx.whoosh(.7);
          FX.arc({ follow: o, y: 0, tilt: .12, a0: 0, a1: TAU, r0: .5, r1: 1.7, color: w.c, color2: w.c2, sweep: .05, hold: 1.15, fade: .15, spin: 30, gain: 3.4 });
          addField({ dur: 1.2, every: .07, move(f) { const k = Math.sin(Math.PI * Math.min(1, f.t / 1.2)); o.position.set(sx + fx * 9.5 * k, 1.1, sz + fz * 9.5 * k); },
            tick() { aoe(o.position.x, o.position.z, 1.8, w.dmg * .5, { kb: 1, stop: 0, shake: .05, noEn: 1, stun: .25 }); FX.burst(o.position, { n: 2, color: w.c, speed: 3, life: .3, size: .1 }); } }); } }); } },
      buff('Blood Pact', 14, 'life', 7),                                                       // every wound dealt gives a little back
      { name: 'Vortex', cd: 10, run(p, w, q) {                                                 // a pit of wind that drags them in
        q.dur = .5; q.seq = [[0, C.raise, .1, 1.2]];
        q.ev.push({ t: .2, f: () => { const tg = q.tg && !q.tg.dead ? q.tg : null, [x, z] = arena(tg ? tg.pos.x : p.pos.x + fwdX(p.yaw) * 5.5, tg ? tg.pos.z : p.pos.z + fwdZ(p.yaw) * 5.5), c = V3(x, 0, z); sfx.special();
          FX.arc({ pos: c, y: .08, r0: 0, r1: 4.4, mode: 3, color: w.c, sweep: 3, fade: .2, gain: 1.2 });
          addField({ dur: 3, every: .25, tick() {
            FX.ring(c, 4.4, w.c, { color2: w.c2, life: .3, from: 1, grow1: .12, gain: 2.2 }); FX.arc({ pos: c, y: .5 + rand(1.2), yaw: rand(TAU), a0: 0, a1: TAU * .7, r0: 1, r1: 3.6, color: w.c, color2: w.c2, sweep: .12, fade: .18, gain: 2.4 });
            aoe(x, z, 4.4, w.dmg * .45, { pull: 5.5, stop: 0, shake: .05, noEn: 1, stun: .35 }); } }); } }); } },
    ],
    axe: [
      { name: 'Leap Cleave', cd: 4, inv: .5, run(p, w, q) {                                    // jump on them
        q.dur = .62; q.pose = 'raise'; q.t0 = .22; q.t1 = .36; q.j0 = .02; q.j1 = .36; q.jh = 1.9;
        q.adv = (q.tg ? clamp(Math.hypot(q.tg.pos.x - p.pos.x, q.tg.pos.z - p.pos.z) - 1.2, 1, 7.5) : 5) / .34; q.advT = .34;
        q.ev.push({ t: .36, f: () => { groundSlam(V3(p.pos.x + fwdX(p.yaw) * .9, 0, p.pos.z + fwdZ(p.yaw) * .9), 3.4, w.dmg * 1.7, w, { kb: 6, launch: 7, heavy: 1, stop: .09, shake: .6, noEn: 1 }, .9); } }); } },
      { name: 'Rending Toss', cd: 5, run(p, w, q) {                                            // a thrown axe that leaves them bleeding
        q.dur = .45; q.seq = swing(C.toss, 'R', .1, .18);
        q.ev.push({ t: .14, f: () => { const tg = q.tg && !q.tg.dead ? q.tg : null, a = V3(p.pos.x, HERO.arcY, p.pos.z), b = tg ? chestOf(tg) : V3(p.pos.x + fwdX(p.yaw) * 13, HERO.arcY, p.pos.z + fwdZ(p.yaw) * 13);
          FX.streak(a, b, .7, w.c, .22, 4); sfx.whoosh(.9); if (!tg) return;
          strikeEnemy(tg, w.dmg * 1.9, { kb: 6, heavy: 1, stop: .07, shake: .4, noEn: 1 });
          addField({ dur: 4, every: .5, tick(f) { if (tg.dead) { f.done = true; return; } FX.burst(chestOf(tg), { n: 6, color: w.c, speed: 3, life: .4, size: .1 }); hitEnemy(tg, w.dmg * .35, { soft: 1, kb: 0, stop: 0, shake: 0, noEn: 1, crit: 0, blast: 1 }, 0, 1); } }); } }); } },
      { name: 'War Cry', cd: 14, run(p, w, q) {                                                // a shout that stuns them and makes every blow heavier
        q.dur = .6; q.seq = [[0, C.cheer, 0, 1.3]];
        q.ev.push({ t: .15, f: () => { p.buff.power = 6; FX.ring(p.pos, 7.2, w.c, { color2: w.c2, life: .6, gain: 3, thick: .12 }); FX.ring(p.pos, 4, w.c2, { life: .4, gain: 2 }); WORLD.shock(p.pos.x, p.pos.z, 1); G.shake(.7); sfx.boom();
          _c1.set(p.pos.x, 1.2, p.pos.z); FX.flash(_c1, w.c, 7, .4); aoe(p.pos.x, p.pos.z, 7.2, w.dmg * .4, { kb: 3, stun: 1.7, stop: .03, noEn: 1 }); } }); } },
    ],
    staff: [
      { name: 'Sweep', cd: 3.5, run(p, w, q) {                                                 // legs out from under everyone nearby
        q.dur = .5; q.seq = swing(C.s2, 'R', .08, .2);
        q.ev.push({ t: .1, f: () => { FX.arc({ follow: p.root, y: .45, yaw: p.yaw, a0: 1.9, a1: 1.9 - TAU, r0: 1.4, r1: 4.5, color: w.c, color2: w.c2, sweep: .12, fade: .28, gain: 3.2 }); sfx.whoosh(.75);
          aoe(p.pos.x, p.pos.z, 4.5, w.dmg * 1.05, { kb: 4, launch: 2.5, stun: 1.1, stop: .04, shake: .3, noEn: 1 }); } }); } },
      { name: 'Chain Lightning', cd: 6, run(p, w, q) {                                         // jumps from one to the next, up to six
        q.dur = .45; q.seq = swing(C.t2, 'R', .1, .18);
        q.ev.push({ t: .14, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), seen = new Set(); let from = V3(p.pos.x + fx, HERO.arcY, p.pos.z + fz), cur = q.tg && !q.tg.dead ? q.tg : nearest(p.pos.x, p.pos.z, 11, null);
          if (!cur) { FX.streak(from, V3(from.x + fx * 8, HERO.arcY, from.z + fz * 8), .5, w.c2, .2, 4); sfx.shot(); return; }
          for (let i = 0; i < 6 && cur; i++) { const e = cur, a = from, b = chestOf(e), k = i, d = Math.hypot(b.x - a.x, b.z - a.z) || 1; seen.add(e); from = b;
            G.after(i * .07, () => { FX.streak(a, b, .6, w.c2, .22, 5); FX.flash(b, w.c, 4, .2); sfx.shot(); hitEnemy(e, w.dmg * 1.7 * Math.pow(.85, k), { kb: 1.5, stun: .6, stop: .02, shake: .15, noEn: 1 }, (b.x - a.x) / d, (b.z - a.z) / d); });
            cur = nearest(e.pos.x, e.pos.z, 7.5, seen); } } }); } },
      { name: 'Storm Totem', cd: 14, run(p, w, q) {                                            // planted, it strikes the nearest of them again and again
        q.dur = .4; q.seq = [[0, C.raise, .15, 1.2]];
        q.ev.push({ t: .15, f: () => { const [x, z] = arena(p.pos.x + fwdX(p.yaw) * 1.2, p.pos.z + fwdZ(p.yaw) * 1.2), glow = new THREE.MeshBasicMaterial({ color: w.c.clone().multiplyScalar(3) }), g = new THREE.Group(), top = V3(x, 2.5, z);
          g.add(part(GEO.cyl, TOTEM_WOOD, .07, 2.3, .07, 0, 1.15, 0)); g.add(part(GEO.ico, glow, .2, .28, .2, 0, 2.5, 0)); g.add(part(GEO.tube, glow, .1, .04, .1, 0, 1.6, 0)); g.position.set(x, 0, z); GFX.scene.add(g);
          FX.ring(g.position, 2, w.c, { life: .4, gain: 3 }); sfx.special();
          addField({ dur: 7, every: .6, tick() { const e = nearest(x, z, 9.5, null); if (!e) return; const b = chestOf(e), d = Math.hypot(b.x - x, b.z - z) || 1; FX.streak(top, b, .5, w.c2, .18, 5); FX.flash(b, w.c, 3, .15); sfx.shot();
              hitEnemy(e, w.dmg * .85, { kb: .8, stun: .35, stop: 0, shake: .08, noEn: 1 }, (b.x - x) / d, (b.z - z) / d); },
            end() { GFX.scene.remove(g); glow.dispose(); FX.burst(top, { n: 14, color: w.c, speed: 5, life: .4, size: .12 }); } }); } }); } },
    ],
    fist: [
      { name: 'Rising Dragon', cd: 3.5, inv: .4, run(p, w, q) {                                // an uppercut that sends them skyward
        q.dur = .55; q.seq = swing(C.upper, 'R', .08, .2); q.adv = 10; q.advT = .16; q.j0 = .1; q.j1 = .5; q.jh = 1.5;
        q.ev.push({ t: .12, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw); FX.arc({ follow: p.root, y: HERO.arcY, yaw: p.yaw, tilt: Math.PI / 2, a0: -1, a1: 2.3, r0: .8, r1: 2.6, color: w.c, color2: w.c2, sweep: .1, fade: .3, gain: 3.6 }); sfx.whoosh(1.2);
          aoe(p.pos.x + fx * 1.4, p.pos.z + fz * 1.4, 2.3, w.dmg * 1.5, { kb: 1.5, launch: 13, heavy: 1, stop: .07, shake: .35, noEn: 1, fx, fz }); } }); } },
      { name: 'Meteor Dive', cd: 7, inv: .8, run(p, w, q) {                                    // up, over, and down on their heads
        q.dur = .78; q.seq = [[0, C.jump, .25, 1.2], [.34, C.jabR, win(C.jabR)[0], 2.2]]; q.j0 = 0; q.j1 = .45; q.jh = 3.3;
        q.adv = (q.tg ? clamp(Math.hypot(q.tg.pos.x - p.pos.x, q.tg.pos.z - p.pos.z) - .6, .5, 8.5) : 4.5) / .43; q.advT = .43;
        q.ev.push({ t: .45, f: () => { groundSlam(p.pos.clone(), 4.3, w.dmg * 2.3, w, { kb: 7, launch: 5, heavy: 1, stun: 1.2, stop: .11, shake: .8, noEn: 1 }, 1.25); GFX.post.flash = .2; } }); } },
      buff('Inner Fire', 14, 'fire', 7),                                                       // every blow you land sets off a small blast
    ],
    bow: [
      { name: 'Backflip Shot', cd: 4, inv: .45, run(p, w, q) {                                 // spring away, loosing a fan of arrows
        q.dur = .5; q.seq = [[0, C.dodgeB, 0, 1.1], [.3, C.shoot, 0, 1.4]]; q.adv = -15; q.advT = .28; q.j0 = .02; q.j1 = .34; q.jh = 1.1; sfx.dodge();
        q.ev.push({ t: .14, f: () => { fireArrows({ n: 5, spread: 11 }, w.dmg * .95, { kb: 4, stop: .03, shake: .15, noEn: 1 }, q.tg); } }); } },
      { name: 'Piercing Shot', cd: 6, run(p, w, q) {                                           // one arrow through all of them
        q.dur = .6; q.seq = [[0, C.aim, 1, 1.5], [.25, C.shoot, 0, 1.3]];
        q.ev.push({ t: .25, f: () => { fireArrows({ n: 1, big: 1 }, w.dmg * 3.3, { kb: 11, heavy: 1, stop: .09, shake: .5, noEn: 1 }, q.tg); p.vel.x = -fwdX(p.yaw) * 6; p.vel.z = -fwdZ(p.yaw) * 6; } }); } },
      { name: 'Snare Trap', cd: 9, run(p, w, q) {                                              // left on the ground; the first to step on it sets it off
        q.dur = .35; q.seq = [[0, C.dodgeF, .12, .3]];
        q.ev.push({ t: .1, f: () => { const x = p.pos.x, z = p.pos.z, c = V3(x, 0, z); sfx.swap(3); FX.ring(c, 1.8, w.c, { life: .4, gain: 2.5 });
          addField({ dur: 14, every: .15, n: 0, tick(f) {
            if (f.n++ % 5 === 0) FX.ring(c, 1.1, w.c, { life: .7, from: .4, gain: f.t > .5 ? 2 : .8, thick: .2 }); if (f.t < .5) return;
            if (!enemies.some(e => live(e) && Math.hypot(e.pos.x - x, e.pos.z - z) < 1.7 + e.radius)) return; f.done = true;
            FX.ring(c, 3.8, w.c, { color2: w.c2, life: .5, gain: 3.5 }); const m = V3(x, .5, z); FX.burst(m, { n: 30, color: w.c, speed: 9, up: 4, life: .6, size: .14 }); FX.flash(m, w.c, 7, .35); sfx.boom(); G.shake(.4);
            aoe(x, z, 3.8, w.dmg * 2.3, { kb: 4, launch: 3, heavy: 1, stun: 2.2, stop: .05, noEn: 1 }); } }); } }); } },
    ],
    dagger: [
      { name: 'Fan of Knives', cd: 3, run(p, w, q) {                                           // seven thrown in a fan
        q.dur = .36; q.seq = swing(C.ds, 'R', .05, .13);
        q.ev.push({ t: .08, f: () => { sfx.whoosh(1.6); const o = V3(p.pos.x, HERO.arcY, p.pos.z);
          for (let i = 0; i < 7; i++) { const a = p.yaw + (i - 3) * .28, dx = Math.sin(a), dz = Math.cos(a); let best = null, bt = 9.5;
            for (const e of enemies) { if (!live(e)) continue; const ex = e.pos.x - o.x, ez = e.pos.z - o.z, t = ex * dx + ez * dz; if (t > 0 && t < bt && Math.abs(ex * dz - ez * dx) < .7 + e.radius) { bt = t; best = e; } }
            FX.streak(o, V3(o.x + dx * bt, HERO.arcY, o.z + dz * bt), .22, i % 2 ? w.c : w.c2, .16, 4); if (best) hitEnemy(best, w.dmg * 1.1, { kb: 2, crit: .4, stop: .01, shake: .08, noEn: 1 }, dx, dz); } } }); } },
      { name: 'Smoke Bomb', cd: 12, inv: 1.6, run(p, w, q) {                                   // gone in smoke; the next blow you land is an ambush
        q.dur = .3; q.seq = [[0, C.dodgeF, .1, .6]]; p.buff.ambush = 5; sfx.dodge(); _c1.set(p.pos.x, 1, p.pos.z);
        FX.burst(_c1, { n: 60, color: SMOKE, speed: 4, life: 1.3, size: .5, grav: -.6, gain: .5, r: 1.2, drag: 3 }); FX.ring(p.pos, 4.6, w.c, { life: .5, gain: 1.6 }); stunAround(p.pos.x, p.pos.z, 4.6, 1.7); ghosts.spawn(.8); } },
      { name: 'Death Mark', cd: 10, run(p, w, q) {                                             // five are marked; a moment later the marks open
        q.dur = .4; q.seq = [[0, C.cast, 0, 1.4]];
        q.ev.push({ t: .1, f: () => { const d = e => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z), list = enemies.filter(e => live(e) && d(e) < 11).sort((a, b) => d(a) - d(b)).slice(0, 5), o = V3(p.pos.x, HERO.arcY, p.pos.z); sfx.special();
          for (const e of list) { const mark = () => { if (!e.dead) FX.ring(e.pos, 1.3 * e.def.scale, w.c, { life: .45, from: 1.6, grow1: .5, gain: 2.6, thick: .14 }); }; FX.streak(o, chestOf(e), .2, w.c, .25, 3); mark(); G.after(.5, mark); G.after(1, mark);
            G.after(1.4, () => { if (e.dead) return; const c = chestOf(e), yaw = rand(TAU), r = 2.8 * e.def.scale;
              for (const s of [1, -1]) FX.arc({ pos: c, yaw, tilt: .8 * s, a0: -1.6 * s, a1: 1.6 * s, r0: .6, r1: r, color: w.c, color2: w.c2, sweep: .07, fade: .3, gain: 4 });
              strikeEnemy(e, w.dmg * 3.6 * (e.hp < e.hpMax * .5 ? 1.6 : 1), { kb: 3, heavy: 1, stop: .05, shake: .3, crit: 0, noEn: 1, blast: 1 }); }); }
          if (list.length) G.after(1.4, () => sfx.boom()); } }); } },
    ],
    sword: [
      { name: 'Guard Break', cd: 4, inv: .3, run(p, w, q) {                                    // a long thrust that goes through a raised shield
        q.dur = .5; q.seq = swing(C.t1, 'R', .1, .18); q.adv = 16; q.advT = .2;
        q.ev.push({ t: .13, f: () => { const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), a = V3(p.pos.x + fx * .4, HERO.arcY, p.pos.z + fz * .4), b = V3(a.x + fx * 6.5, HERO.arcY, a.z + fz * 6.5); FX.streak(a, b, 1, w.c, .26, 4.5);
          FX.arc({ pos: b, yaw: p.yaw, pitch: Math.PI / 2, r0: .5, r1: 1.4, mode: 1, color: w.c, color2: w.c2, sweep: 0, fade: .3, grow0: .3, grow1: 1, gain: 3 }); sfx.whoosh(.7); G.kick(4);
          lineHit(p, 6.8, 1.2, e => { if (e.guard > 0) { e.guard = 0; e.guardT = 6; _c1.set(e.pos.x, 2.2 * e.def.scale, e.pos.z); HUD.num(_c1, 'GUARD BREAK', 'note'); } hitEnemy(e, w.dmg * 2.1, { kb: 7, heavy: 1, stun: 1.2, stop: .07, shake: .4, noEn: 1, blast: 1 }, fx, fz); }); } }); } },
      { name: 'Sword Rain', cd: 7, run(p, w, q) {                                              // seven blades fall where they stand
        q.dur = .6; q.seq = [[0, C.raise, .1, 1.1]];
        q.ev.push({ t: .2, f: () => { const near = enemies.filter(e => live(e) && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 12), cx = p.pos.x + fwdX(p.yaw) * 5, cz = p.pos.z + fwdZ(p.yaw) * 5; sfx.special();
          for (let i = 0; i < 7; i++) G.after(i * .11, () => { const e = near.length ? near[i % near.length] : null, on = e && !e.dead, [x, z] = arena(on ? e.pos.x + randS(.5) : cx + randS(3.5), on ? e.pos.z + randS(.5) : cz + randS(3.5)), g = V3(x, 0, z);
            FX.streak(V3(x + 1.5, 13, z - 1), g, .55, w.c, .2, 5); FX.arc({ pos: g, y: .06, r0: .1, r1: 1.9, mode: 2, color: w.c, sweep: 0, hold: .6, fade: .6, gain: 2.4 });
            const m = V3(x, .3, z); FX.burst(m, { n: 10, color: w.c, speed: 6, up: 3, life: .4, size: .12 }); FX.flash(m, w.c, 3.5, .2); sfx.hit(true); G.shake(.15);
            aoe(x, z, 2, w.dmg * 1.25, { kb: 2, launch: 3, heavy: 1, stun: .5, stop: .02, noEn: 1 }); }); } }); } },
      { name: 'Orbiting Blades', cd: 14, run(p, w, q) {                                        // three blades circle you and cut what comes close
        q.dur = .4; q.seq = [[0, C.cast, 0, 1.4]]; castFx(p, w);
        for (let i = 0; i < 3; i++) FX.arc({ follow: p.root, y: 1.05, a0: i * TAU / 3, a1: i * TAU / 3 + 1, r0: 2.2, r1: 2.9, color: w.c, color2: w.c2, sweep: .02, hold: 7, fade: .3, spin: 7.5, gain: 3 });
        addField({ dur: 7, every: .22, tick() { aoe(p.pos.x, p.pos.z, 3, w.dmg * .42, { kb: 1.6, stop: 0, shake: .04, noEn: 1, stun: .2 }); } }); } },
    ],
  };
  for (const w of WEAPONS) S[w.id].push({ name: w.sp, cd: 10, inv: 1.7, ult: 1, run: SPECIALS[w.id] });
  return S;
})();

function startSkill(slot) {
  const p = player, w = WEAPONS[p.wi], sk = SKILLS[w.id][slot], cds = p.cds[p.wi];
  if (cds[slot] > 0) return;
  if (p.en < COST[slot]) { HUD.noEnergy(); return; }
  if (p.atk) endAttack();
  p.en -= COST[slot]; cds[slot] = sk.cd; p.state = 'special'; p.st = 0; p.vel.set(0, 0, 0); p.queued = false; p.iT = Math.max(p.iT, sk.inv === undefined ? .25 : sk.inv); p.buff.parry = 0;
  const ax = G.moving ? G.ix : fwdX(p.yaw), az = G.moving ? G.iz : fwdZ(p.yaw), al = Math.hypot(ax, az) || 1;
  const tg = pickTarget(ax / al, az / al, w.stance === 'bow' ? 30 : 15);
  if (tg) p.yaw = Math.atan2(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z); else if (G.moving) p.yaw = Math.atan2(G.ix, G.iz);
  const q = p.seq = { t: 0, ev: [], i: 0, dur: 1, pose: 'cast', seq: null, move: 0, adv: 0, tg, side: 1, id: ++p.atkN, ult: !!sk.ult };
  HUD.caption(sk.name.toUpperCase(), 1.4);
  if (sk.ult) { sfx.special(); GFX.post.radial = 1; G.kick(7); FX.ring(p.pos, 3.4, w.c, { from: 1, grow1: .12, life: .28, gain: 3 }); _c1.set(p.pos.x, 1, p.pos.z); FX.flash(_c1, w.c, 5, .3); }
  sk.run(p, w, q); q.ev.sort((a, b) => a.t - b.t);
}
function updateSpecial(dt) {
  const p = player, q = p.seq, st = WEAPONS[p.wi].stance, K = HERO.clips; q.t += dt;
  while (q.i < q.ev.length && q.ev[q.i].t <= q.t) { q.ev[q.i++].f(); if (p.seq !== q) return; }
  if (q.move) { p.vel.x = damp(p.vel.x, G.ix * 7.8 * q.move, 10, dt); p.vel.z = damp(p.vel.z, G.iz * 7.8 * q.move, 10, dt); }
  else if (q.adv && q.t < (q.advT || q.dur * .75)) { p.vel.x = fwdX(p.yaw) * q.adv; p.vel.z = fwdZ(p.yaw) * q.adv; }
  else { p.vel.x = damp(p.vel.x, 0, 14, dt); p.vel.z = damp(p.vel.z, 0, 14, dt); }
  if (q.j1) { const k = clamp((q.t - q.j0) / (q.j1 - q.j0), 0, 1); p.jump = k < 1 ? Math.sin(k * Math.PI * .92) * (q.jh || 2.8) : 0; }
  if (q.seq) { let i = 0; while (i + 1 < q.seq.length && q.seq[i + 1][0] <= q.t) i++; const s = q.seq[i]; HERO.pose(s[1], clamp(s[2] + (q.t - s[0]) * s[3], 0, K[s[1]].dur), .07, 'k' + q.id + '.' + i); }
  else switch (q.pose) {       // the ultimates borrow the part of a clip that reads right
    case 'spin': { p.spin += q.spinRate * dt; const c = st === 'two' ? CLIP.s2 : st === 'dual' ? CLIP.ds : CLIP.s1h; HERO.pose(c, K[c].sw.R[1], .1, 'sp'); break; }
    case 'raise': { const k = easeIO(clamp((q.t - q.t0) / (q.t1 - q.t0), 0, 1)), c = st === 'one' ? CLIP.c1 : CLIP.c2, w = K[c].sw.R; HERO.pose(c, lerp(w[0] - .1, w[1] + .04, k), .1, 'sp'); break; }
    case 'dash': HERO.pose(CLIP.dodgeF, .16, .06, 'sp'); break;
    case 'shot': HERO.pose(CLIP.raise, Math.min(.15 + q.t * 1.3, .6), .08, 'sp'); break;
    case 'flurry':
      if (q.side === 0) { const w = K[CLIP.jabR].sw.R; HERO.pose(CLIP.jabR, lerp(w[0] - .08, w[1] + .03, clamp((q.t - .9) / .1, 0, 1)), .05, 'fin'); }
      else { const u = Math.max(0, (q.t - .1) / .065), n = Math.floor(u), c = n % 2 ? CLIP.jabR : CLIP.jabL, w = K[c].sw[n % 2 ? 'R' : 'L']; HERO.pose(c, lerp(w[0], w[1], u - n), .03, 'f' + n); }
      break;
    case 'throw': { const n = q.t < .24 ? 0 : q.t < .42 ? 1 : 2, w = K[CLIP.toss].sw.R; HERO.pose(CLIP.toss, lerp(w[0] - .1, w[1] + .12, clamp((q.t - [.02, .2, .38][n]) / .2, 0, 1)), .05, 't' + n); break; }
    default: HERO.pose(CLIP.cast, Math.min(q.t, K[CLIP.cast].dur), .08, 'sp');
  }
  if (q.t >= q.dur) { p.yaw += p.spin; p.spin = 0; p.jump = 0; p.state = 'idle'; p.seq = null; p.iT = Math.max(p.iT, q.ult ? .25 : .05); GFX.post.radialT = 0; }
}

/* ============ the bar that shows them ============ */
const skillHud = (() => {
  const row = $('skills'), buffsEl = $('buffs'), touch = ['tS1', 'tS2', 'tS3', 'tS'].map($), chips = [], last = [-1, -1, -1, -1], state = ['', '', '', '']; let wi = -1, buffText = '';
  for (let i = 0; i < 4; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'skill' + (i === 3 ? ' ult' : ''); b.id = 'skill' + i; b.innerHTML = `<kbd>${SKILL_KEYS[i]}</kbd><span></span><i></i>`;
    b.addEventListener('click', () => { input.skill = i; $('gl').focus(); }); row.appendChild(b); chips.push(b);
  }
  return function () {
    const p = player, list = SKILLS[WEAPONS[p.wi].id];
    if (p.wi !== wi) { wi = p.wi; chips.forEach((b, i) => { b.children[1].textContent = list[i].name; b.title = list[i].name + ' · ' + COST[i] + ' energy · ' + list[i].cd + ' s'; if (touch[i]) touch[i].textContent = list[i].name; last[i] = -1; }); }
    for (let i = 0; i < 4; i++) {
      const cd = Math.max(0, p.cds[wi][i]), k = Math.round(cd / list[i].cd * 50) / 50, s = cd > 0 ? 'cd' : p.en < COST[i] ? 'no' : '';
      if (k !== last[i]) { last[i] = k; chips[i].children[2].style.transform = `scaleY(${k})`; if (touch[i]) touch[i].style.setProperty('--cd', k); }
      if (s !== state[i]) { state[i] = s; chips[i].className = 'skill' + (i === 3 ? ' ult' : '') + (s ? ' ' + s : ''); if (touch[i]) touch[i].classList.toggle('off', !!s); }
    }
    let t = ''; for (const k in p.buff) if (p.buff[k] > 0 && k !== 'parry') t += `<b style="color:#${BUFFS[k][1].toString(16).padStart(6, '0')}">${BUFFS[k][0]} ${Math.ceil(p.buff[k])}</b>`;
    if (t !== buffText) { buffText = t; buffsEl.innerHTML = t; }
  };
})();
