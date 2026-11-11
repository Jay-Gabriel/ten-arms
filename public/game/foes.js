'use strict';
/* ============ the dead: four skeleton models on one shared rig, nine kinds of trouble ============ */
const FOE_RIG = MODEL.rig(FOE_DATA.rig, { shape: BODY_SHAPE, headY: 1.35 });
/* every kind gets its own repaint of a model: the pack's crimson cloth takes the kind's colour, and bone is bleached so the dusk sun does not turn it orange */
const FOE_SKIN = {};
function foeSkin(type) {
  if (FOE_SKIN[type]) return FOE_SKIN[type];
  const def = ETYPES[type], cloth = def.cloth || [.98, .55, .9];
  return FOE_SKIN[type] = MODEL.skin(FOE_RIG, FOE_DATA.skins[def.skin], { paint(c, hsl) {
    if (hsl.s > .3 && (hsl.h > .86 || hsl.h < .02)) c.setHSL(cloth[0], cloth[1], Math.min(.55, hsl.l * cloth[2]));
    else if (hsl.h > .07 && hsl.h < .16 && hsl.s > .25) c.setHSL(.1, .15, hsl.l * .6);
    else if (hsl.h < .08 && hsl.s > .15) c.setHSL(.07, hsl.s * .5, hsl.l * .7);
    else c.setHSL(hsl.h, hsl.s, hsl.l * .78);
  } });
}
const FC = {
  idle: 'idle_combat', run: 'running_a', walk: 'walking_a', shamble: 'walking_d_skeletons', hit: 'hit_a', spawn: 'spawn_ground_skeletons', taunt: 'taunt', cheer: 'cheer',
  slice: '1h_melee_attack_slice_horizontal', stab: 'dualwield_melee_attack_stab', chop: '2h_melee_attack_chop', bash: 'block_attack', guard: 'blocking',
  raise: 'spellcast_raise', cast: 'spellcast_shoot', chant: 'spellcasting', aim: '2h_ranged_aiming', shoot: '2h_ranged_shoot',
};
const UPPER = FOE_RIG.mask(/^(spine|chest|head|upperarm|lowerarm|wrist|hand)/i);
/* kind decides the behaviour: melee, caster, slam, bomb, stalk, heal, snipe, boss */
const ETYPES = {
  grunt:   { name: 'Bone Soldier', skin: 'minion', kind: 'melee', hp: 58, scale: 1, speed: 4.0, dmg: 8, range: 2.3, wind: .5, rec: .55, eye: 0xff5a1f, score: 100, swing: 'slice' },
  mage:    { name: 'Bone Mage', skin: 'mage', kind: 'caster', hp: 44, scale: .97, speed: 3.5, dmg: 9, range: 12, wind: .8, rec: .5, eye: 0xffc21f, score: 150, cloth: [.115, .75, 1.25] },
  brute:   { name: 'Bone Brute', skin: 'warrior', kind: 'slam', hp: 300, scale: 1.5, speed: 2.6, dmg: 19, range: 3.6, wind: .95, rec: .9, armor: 1, slam: 4.3, eye: 0xff2a2a, score: 450, cloth: [.995, .7, .85] },
  shield:  { name: 'Shieldbearer', skin: 'warrior', kind: 'melee', hp: 95, scale: 1.08, speed: 3.0, dmg: 11, range: 2.5, wind: .6, rec: .8, block: 1, eye: 0x4fa8ff, score: 240, swing: 'bash', cloth: [.6, .6, 1.15] },
  bomber:  { name: 'Powder Bones', skin: 'minion', kind: 'bomb', hp: 26, scale: .92, speed: 6.4, dmg: 22, range: 2.3, wind: .65, boom: 3.5, eye: 0xff8a1f, score: 170, tint: 0x6f6259 },
  stalker: { name: 'Grave Stalker', skin: 'rogue', kind: 'stalk', hp: 42, scale: 1, speed: 6.2, dmg: 13, range: 2.4, wind: .3, rec: .35, eye: 0xc66bff, score: 260, swing: 'stab', cloth: [.77, .55, 1.15] },
  healer:  { name: 'Bone Priest', skin: 'mage', kind: 'heal', hp: 62, scale: 1.02, speed: 3.3, dmg: 6, range: 13, wind: .8, rec: .5, eye: 0x4dff9a, score: 280, cloth: [.4, .6, 1.1] },
  sniper:  { name: 'Marksman', skin: 'rogue', kind: 'snipe', hp: 46, scale: 1, speed: 3.2, dmg: 22, range: 24, wind: 1.5, rec: .7, eye: 0x39e6ff, score: 280, cloth: [.52, .65, 1.1] },
  boss:    { name: 'Bone King', skin: 'warrior', kind: 'boss', hp: 1500, scale: 2.2, speed: 3.3, dmg: 22, range: 5, wind: .85, rec: .7, armor: 1, boss: 1, slam: 6.4, eye: 0xff2a60, score: 4000, cloth: [.86, .75, .8] },
};
const enemies = [];
let meleeTokens = 0;
const RED = col(0xff2a2a), ROCKS = [col(0x3a3742), col(0x2a3320), col(0x55505e)], BONE = col(0x9a927f), BONE_DARK = col(0x3b3848);
const maxTokens = () => 2 + Math.floor(G.wave / 4);
function releaseToken(e) { if (e.token) { e.token = false; meleeTokens = Math.max(0, meleeTokens - 1); } }
function dropAim(e) { if (e.aimLine) { e.aimLine.kill(); e.aimLine = null; } }
function setGlow(e, k) { e.mats[1].color.copy(e.eye).multiplyScalar(k); e.mats[2].color.copy(e.eye).multiplyScalar(k); }
function setState(e, s) { e.state = s; e.st = 0; e.did = false; if (s === 'stagger') e.hitN++; if (s !== 'windup' && s !== 'strike') { releaseToken(e); dropAim(e); setGlow(e, 3); } }
function setStrike(e) { dropAim(e); e.state = 'strike'; e.st = 0; e.did = false; setGlow(e, 6); }

/* what each kind carries; lit parts flare with the eyes when a blow is coming */
const FWM = (() => { const rim = { value: new THREE.Color(0, 0, 0) }, ink = !GFX.Q.mobile; return { steel: TOON.mat(0x59606f, rim, ink), dark: TOON.mat(0x23242e, rim, ink), wood: TOON.mat(0x4d3727, rim, ink) }; })();
function armFoe(e, lit) {
  const b = e.body, t = e.type, hold = bone => { const g = new THREE.Group(); g.rotation.x = Math.PI; bone.add(g); return g; }, on = (m, bn, x, y, z) => { m.position.fromArray(b.anchor(bn, x, y, z)); bn.add(m); return m; };
  if (t === 'grunt') hold(b.part.slotR).add(ARMS.blade(FWM, lit, .95, .075, .024, .17, .24));
  else if (t === 'mage' || t === 'healer') hold(b.part.slotR).add(ARMS.staff(FWM, lit, 1.9));
  else if (t === 'brute') hold(b.part.slotR).add(ARMS.axe(FWM, lit, 1.45));
  else if (t === 'stalker') { hold(b.part.slotR).add(ARMS.blade(FWM, lit, .5, .06, .02, .1, .16)); hold(b.part.slotL).add(ARMS.blade(FWM, lit, .5, .06, .02, .1, .16)); }
  else if (t === 'shield') {
    hold(b.part.slotR).add(ARMS.blade(FWM, lit, 1, .08, .024, .18, .24));
    const s = new THREE.Group(); s.add(part(GEO.box, FWM.steel, .66, .86, .05)); s.add(part(GEO.box, FWM.dark, .56, .76, .065)); s.add(part(GEO.ico, FWM.steel, .1, .1, .06, 0, 0, .04)); s.add(part(GEO.box, lit, .03, .6, .075, -.2, 0, 0)); s.add(part(GEO.box, lit, .03, .6, .075, .2, 0, 0));
    s.rotation.set(SHIELD_ROT[0], SHIELD_ROT[1], SHIELD_ROT[2]); s.position.set(SHIELD_POS[0], SHIELD_POS[1], SHIELD_POS[2]); b.part.slotL.add(s);
  }
  else if (t === 'sniper') {       // the pack aims a crossbow along the slot's +X with the limbs across Z
    const g = new THREE.Group(); g.add(part(GEO.box, FWM.wood, .8, .07, .08, .26, 0, 0)); g.add(part(GEO.box, FWM.dark, .06, .05, .72, .58, 0, 0)); g.add(part(GEO.box, lit, .62, .025, .025, .34, .05, 0)); g.add(part(GEO.box, lit, .02, .02, .68, .44, .0, 0)); b.part.slotR.add(g);
  }
  else if (t === 'bomber') { on(part(GEO.tube, FWM.wood, .25, .56, .25), b.part.chest, 0, 1.3, -.42); on(part(GEO.tube, lit, .258, .04, .258), b.part.chest, 0, 1.42, -.42); on(part(GEO.tube, lit, .258, .04, .258), b.part.chest, 0, 1.18, -.42); on(part(GEO.sph, lit, .09, .09, .09), b.part.chest, 0, 1.66, -.42); }
  else if (t === 'boss') {
    hold(b.part.slotR).add(ARMS.blade(FWM, lit, 1.5, .2, .045, .42, .4, .3));
    for (let i = 0; i < 5; i++) { const a = (i - 2) * .5; on(part(GEO.cone, lit, .035, .2 - Math.abs(i - 2) * .04, .035), b.part.head, Math.sin(a) * .27, 1.98, Math.cos(a) * .27 - .02); }
  }
}
const SHIELD_ROT = [0, 0, 0], SHIELD_POS = [0, .1, 0];

function spawnEnemy(type, x, z, lvl, elite) {
  const base = ETYPES[type], def = elite ? Object.assign({}, base, { name: 'Elite ' + base.name, hp: base.hp * 1.9, dmg: base.dmg * 1.3, speed: base.speed * 1.15, scale: base.scale * 1.12, score: Math.round(base.score * 2.5), elite: 1 }) : base;
  const eye = col(def.eye), rim = { value: eye.clone().multiplyScalar(elite ? 1.5 : .45) };
  const mat = TOON.mat(def.tint || 0xffffff, rim, false, { skinning: true, vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, skinning: true }), lit = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const body = MODEL.spawn(FOE_RIG, foeSkin(type), { mats: { '': mat, eyes: glow }, ink: !GFX.Q.mobile });
  const root = new THREE.Group(); root.add(body.group); root.scale.setScalar(def.scale); root.position.set(x, 0, z); GFX.scene.add(root);
  const hp = Math.round(def.hp * (1 + .14 * (lvl - 1)));
  const e = { type, def, body, root, pos: root.position, yaw: Math.atan2(player.pos.x - x, player.pos.z - z), hp, hpMax: hp, lvl, radius: .5 * def.scale,
    state: 'spawn', st: 0, did: false, vx: 0, vz: 0, vy: 0, y: 0, flash: 0, cd: rand(.5, 1.5), strafe: Math.random() < .5 ? -1 : 1, mat, mats: [mat, glow, lit], eye,
    dead: false, gone: false, token: false, animT: rand(10), stagT: 0, hitDone: false, kind: 'slam', pat: 0, aimLine: null, dmg: def.dmg * (1 + .07 * (lvl - 1)), cx: 0, cz: 1, bodyC: BONE, darkC: BONE_DARK,
    hitN: 0, atkN: 0, at: 0, guard: def.block ? 2 : 0, guardT: 0, blockT: 0, blockSay: -9, healT: null, healFx: 0, bx: 0, bz: 0 };
  root.rotation.y = e.yaw; setGlow(e, 3); armFoe(e, lit);
  body.pose(FC.spawn, 0, 0); body.update(0);
  enemies.push(e); HUD.addTag(e);
  FX.ring(e.pos, 2 * def.scale, eye, { life: .8, from: 1.1, grow1: .2, gain: 2.5 });
  _v.set(x, .2, z); FX.burst(_v, { n: 22, color: eye, speed: 2.5, up: 7, life: .9, size: .12, grav: -1, r: .7 * def.scale, ry: .1 }); FX.flash(_v, eye, 3, .5); FX.chunks({ x, y: -.3, z }, 5, ROCKS, 4);
  return e;
}

function attackPlayer(e, dmg, sx, sz) {
  const p = player; if (p.dead) return false;
  if (p.buff.parry > 0 && e && !e.dead) { parryCounter(e); return false; }
  if (p.iT > 0) { if (p.state === 'dodge' && !p.perfect) { p.perfect = true; G.perfectDodge(); } return false; }
  return hurtPlayer(dmg, sx, sz);
}
function hurtPlayer(dmg, sx, sz) {
  const p = player; if (p.dead || p.iT > 0 || G.state !== 'play') return false;
  if (wardTake(dmg)) return false;
  dmg = Math.round(dmg); p.hp -= dmg; p.iT = .75; endAttack(); p.seq = null; p.jump = 0; p.state = 'hurt'; p.st = 0; p.hurtN++;
  const dx = p.pos.x - sx, dz = p.pos.z - sz, l = Math.hypot(dx, dz) || 1; p.vel.set(dx / l * 10, 0, dz / l * 10);
  GFX.post.hurt = 1; GFX.post.aberr = 1; GFX.post.radialT = 0; G.shake(.7); G.stop = Math.max(G.stop, .06); sfx.hurt(); _v.set(p.pos.x, 1.9, p.pos.z); HUD.num(_v, '-' + dmg, 'hurt'); G.breakCombo();
  _v.y = 1.2; FX.burst(_v, { n: 16, color: RED, speed: 7, life: .4, size: .12 });
  if (p.hp <= 0) { p.hp = 0; p.dead = true; G.onDeath(); }
  return true;
}
function killEnemy(e, dx, dz) {
  if (e.dead) return; e.dead = true; releaseToken(e); dropAim(e);
  HUD.removeTag(e); GFX.scene.remove(e.root);
  const s = e.def.scale; _v2.set(e.pos.x, e.y, e.pos.z);
  FX.chunks(_v2, Math.round(13 * s * s), [e.bodyC, e.bodyC, e.darkC, e.eye], 6 + s * 2, { x: dx * .7, z: dz * .7 });
  _v2.y = e.y + 1.1 * s; FX.burst(_v2, { n: Math.round(34 * s), color: e.eye, speed: 11, life: .7, size: .16, gain: 4 });
  FX.ring(e.pos, 3.2 * s, e.eye, { life: .4, gain: 2.6 }); FX.flash(_v2, e.eye, 5 * s, .35);
  sfx.kill(); e.body.dispose(); e.mats.forEach(m => m.dispose());
  G.onKill(e);
}
/* a raised shield turns a blow from the front; a heavy one cracks the guard, and the second breaks it for a while */
function blockHit(e, ho, dx, dz) {
  _v.set(e.pos.x - dx * .6, 1.25 * e.def.scale, e.pos.z - dz * .6);
  FX.burst(_v, { n: 12, color: e.eye, speed: 8, life: .3, size: .1, gain: 4, dir: { x: -dx, y: .3, z: -dz }, bias: .5 }); FX.flash(_v, e.eye, 2.5, .15); sfx.clang();
  e.blockT = .3; e.vx = dx * 2.2; e.vz = dz * 2.2; G.stop = Math.max(G.stop, .025);
  if (ho.heavy) {
    e.guard--; G.shake(.3);
    if (e.guard <= 0) { e.guardT = 4.5; setState(e, 'stagger'); e.stagT = 1.5; _v.y += .9; HUD.num(_v, 'GUARD BREAK', 'note'); FX.ring(e.pos, 2.4, e.eye, { life: .4, gain: 3 }); G.stop = Math.max(G.stop, .09); sfx.boom(); }
  } else if (G.real - e.blockSay > 1.4) { e.blockSay = G.real; _v.y += .9; HUD.num(_v, 'BLOCKED', 'note'); }
  return false;
}
/* a powder carrier that runs out of health is not dead yet: it is knocked flying and goes off where it lands */
function lobBomb(e, dx, dz) { e.hp = 1; e.gone = true; setState(e, 'thrown'); e.vx = dx * 14; e.vz = dz * 14; e.vy = 6.5; HUD.removeTag(e); }
function explode(e, hurtsPlayer) {
  if (e.dead) return; const r = e.def.boom, x = e.pos.x, z = e.pos.z, c = e.eye; e.gone = true;
  FX.ring(e.pos, r, c, { life: .5, gain: 3.5 }); FX.arc({ pos: V3(x, 0, z), y: .06, r0: .2, r1: r, mode: 2, color: c, sweep: 0, hold: .8, fade: .8, gain: 2.2 });
  _v.set(x, e.y + .8, z); FX.burst(_v, { n: 44, color: c, speed: 12, up: 4, life: .7, size: .17, gain: 4 }); FX.chunks({ x, y: -.2, z }, 8, ROCKS, 7); FX.flash(_v, c, 9, .4); WORLD.shock(x, z, 1); sfx.boom(); G.shake(.55);
  if (hurtsPlayer && Math.hypot(player.pos.x - x, player.pos.z - z) < r + .2) attackPlayer(e, e.dmg, x, z);
  for (const o of enemies.slice()) {
    if (o === e || o.dead || o.gone) continue; const ox = o.pos.x - x, oz = o.pos.z - z, d = Math.hypot(ox, oz);
    if (d < r + o.radius) hitEnemy(o, 60 * (1 + .12 * (e.lvl - 1)), { kb: 9, launch: 4, heavy: 1, stop: .04, shake: .2, noEn: 1, crit: 0, blast: 1 }, d > .01 ? ox / d : 0, d > .01 ? oz / d : 1);
  }
  killEnemy(e, 0, 0);
}

/* clip time for an attack: the wind-up is stretched over its wait, the blow itself always takes the last 0.14 s before `hit` */
function swingTime(clip, hit, t) {
  const c = FOE_RIG.clips[clip], w = c.sw.R, pre = Math.max(.02, hit - .14);
  if (t < pre) return lerp(Math.max(0, w[0] - pre), w[0], t / pre);
  if (t < hit) return lerp(w[0], w[1], (t - pre) / (hit - pre));
  return Math.min(c.dur, w[1] + (t - hit) * .9);
}

function enemyUpdate(e, dt) {
  const def = e.def, B = e.body, P = player, S = def.scale, K = FOE_RIG.clips;
  e.st += dt; e.cd -= dt; e.animT += dt; e.at += dt; e.blockT -= dt;
  if (e.flash > -1) { e.flash -= dt; e.mat.emissive.setScalar(e.flash > 0 ? .9 : 0); if (e.flash <= 0) e.flash = -2; }
  if (e.guardT > 0) { e.guardT -= dt; if (e.guardT <= 0) e.guard = 2; }
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || .001, tx = dx / dist, tz = dz / dist;
  const face = k => { e.yaw = dampAngle(e.yaw, Math.atan2(dx, dz), k, dt); };
  const kind = def.boss ? e.kind : def.kind, tag = e.atkN;
  let mvx = 0, mvz = 0, sp = def.speed, slide = false;
  switch (e.state) {
    case 'spawn': {             // claw up out of the ground
      const c = K[FC.spawn]; B.pose(FC.spawn, lerp(.25, 2.5, clamp(e.st / 1.05, 0, 1)), 0);
      if (e.st > 1.1) { setState(e, 'chase'); e.atkN++; }
      break;
    }
    case 'chase': {
      face(7);
      if (!P.dead) {
        if (kind === 'caster' || kind === 'heal' || kind === 'snipe') {      // keep a distance and circle
          const near = kind === 'snipe' ? 13 : 8, far = kind === 'snipe' ? 21 : 13, want = dist > far ? 1 : dist < near ? -1 : 0;
          mvx = tx * want - tz * e.strafe * .55; mvz = tz * want + tx * e.strafe * .55;
          if (e.cd <= 0 && dist < 28) {
            let tg = null, worst = .9;
            if (kind === 'heal') for (const o of enemies) { if (o === e || o.dead || o.gone || o.state === 'spawn' || o.def.kind === 'heal') continue; const f = o.hp / o.hpMax; if (f < worst && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 15) { worst = f; tg = o; } }
            if (tg) { e.healT = tg; setState(e, 'channel'); e.atkN++; } else { setState(e, 'windup'); e.at = 0; e.atkN++; }
          }
        } else if (kind === 'bomb') { mvx = tx; mvz = tz; if (dist < def.range) { setState(e, 'fuse'); e.atkN++; } }
        else if (kind === 'stalk') {
          if (e.cd <= 0 && dist < 11) { setState(e, 'blink'); e.atkN++; }
          else if (dist > 7.5) { mvx = tx; mvz = tz; } else { mvx = -tz * e.strafe + tx * (dist < 5.5 ? -.6 : 0); mvz = tx * e.strafe + tz * (dist < 5.5 ? -.6 : 0); sp *= .7; }
        } else if (def.boss) {
          if (dist > 4.2) { mvx = tx; mvz = tz; }
          if (e.cd <= 0) { e.kind = dist < 7 ? 'slam' : (e.pat++ % 2 ? 'charge' : 'caster'); setState(e, 'windup'); e.at = 0; e.atkN++; }
        } else {                                                              // melee and slam: close in; only a few may swing at once
          const ready = e.cd <= 0 && dist <= def.range, free = def.slam || meleeTokens < maxTokens();
          if (ready && free) { if (!def.slam) { e.token = true; meleeTokens++; } setState(e, 'windup'); e.at = 0; e.atkN++; }
          else if (dist > def.range * .85) { if (!free && dist < 6.5) { mvx = tx * .2 - tz * e.strafe; mvz = tz * .2 + tx * e.strafe; sp *= .6; } else { mvx = tx; mvz = tz; } }
        }
      }
      const moving = e.state === 'chase' && (mvx || mvz), slow = def.slam || def.block || sp < def.speed;
      if (e.state === 'chase') {
        if (moving) B.loop(slow ? (def.slam ? FC.shamble : FC.walk) : FC.run, e.animT * (slow ? sp / (def.slam ? 1.5 : 2.6) : sp / 4.4), .15, tag); else B.loop(FC.idle, e.animT, .2, tag);
        if (e.guard > 0) B.overlay(e.blockT > 0 ? 'block_hit' : FC.guard, e.blockT > 0 ? .3 - e.blockT : e.animT, UPPER);      // shield up over whatever the legs are doing
      }
      break;
    }
    case 'windup': {
      const wind = kind === 'caster' && def.boss ? .6 : def.wind;
      face(kind === 'charge' ? 6 : kind === 'snipe' && e.st > wind - .3 ? 0 : 4);
      setGlow(e, 3 + 10 * (e.st / wind) * Math.abs(Math.sin(e.st * 26)));
      if (!e.did) {
        e.did = true; sfx.warn();
        if (kind === 'melee' || kind === 'stalk') FX.ring(e.pos, 1.5, RED, { life: .4, gain: 2 });
        else if (kind === 'slam') FX.arc({ pos: e.pos, y: .09, r0: 0, r1: def.slam, mode: 3, color: RED, sweep: wind, fade: .15, gain: 1.8 });
        else { _from.set(e.pos.x, 1.3 * S, e.pos.z); e.aimLine = FX.streak(_from, _from, kind === 'charge' ? 2.4 : .12, RED, 0, kind === 'charge' ? 1.2 : 2.2); }
      }
      if (e.aimLine) {
        if (kind === 'charge') { e.cx = fwdX(e.yaw); e.cz = fwdZ(e.yaw); _from.set(e.pos.x, .5, e.pos.z); _to.set(e.pos.x + e.cx * 18, .5, e.pos.z + e.cz * 18); }
        else if (kind === 'snipe') { e.aimLine.w = lerp(.06, .26, e.st / wind); _from.set(e.pos.x + fwdX(e.yaw) * .9, 1.3 * S, e.pos.z + fwdZ(e.yaw) * .9); _to.set(e.pos.x + fwdX(e.yaw) * 40, 1.15, e.pos.z + fwdZ(e.yaw) * 40); }
        else { _from.set(e.pos.x + fwdX(e.yaw) * .6, 1.5 * S, e.pos.z + fwdZ(e.yaw) * .6); _to.set(P.pos.x, 1.2, P.pos.z); }
        e.aimLine.set(_from, _to);
      }
      if (kind === 'melee' || kind === 'stalk') B.pose(FC[def.swing], swingTime(FC[def.swing], wind + .07, e.at), .08, tag);
      else if (kind === 'slam') B.pose(FC.chop, swingTime(FC.chop, wind, e.at), .1, tag);
      else if (kind === 'snipe') B.pose(FC.aim, Math.min(K[FC.aim].dur, e.st * 3), .1, tag);
      else if (kind === 'charge') B.pose(FC.taunt, Math.min(K[FC.taunt].dur, e.st * 1.2), .1, tag);
      else B.pose(FC.raise, Math.min(.5, e.st / wind * .5), .1, tag);
      if (e.st >= wind) setStrike(e);
      break;
    }
    case 'strike': {
      if (kind === 'melee' || kind === 'stalk') {
        if (!e.did) { e.did = true; e.hitDone = false; const v = kind === 'stalk' ? 17 : 13; e.vx = fwdX(e.yaw) * v; e.vz = fwdZ(e.yaw) * v; sfx.whoosh(.9);
          FX.arc({ follow: e.root, y: 1.2 * S, yaw: e.yaw, tilt: -.35, a0: -1.5, a1: 1.5, r0: 1, r1: 2.7 * S, color: e.eye, sweep: .12, fade: .22, gain: 2.6 }); }
        if (!e.hitDone && e.st >= .07) { e.hitDone = true; if (dist < def.range + .7 && (tx * fwdX(e.yaw) + tz * fwdZ(e.yaw)) > .25) attackPlayer(e, e.dmg, e.pos.x, e.pos.z); }
        B.pose(FC[def.swing], swingTime(FC[def.swing], def.wind + .07, e.at), .08, tag);
        if (e.st > .3) setState(e, kind === 'stalk' ? 'flee' : 'recover');
      } else if (kind === 'caster' || kind === 'heal' || kind === 'snipe') {
        if (!e.did) {
          e.did = true; const n = def.boss ? 5 : 1, fast = kind === 'snipe'; sfx.shot();
          _from.set(e.pos.x + fwdX(e.yaw) * .9 * S, 1.3 * S, e.pos.z + fwdZ(e.yaw) * .9 * S);
          const by = fast ? e.yaw : Math.atan2(P.pos.x - _from.x, P.pos.z - _from.z);
          for (let i = 0; i < n; i++) { const a = by + (i - (n - 1) / 2) * .24; fireOrb(_from, Math.sin(a), (1.15 - _from.y) / Math.max(dist, 4), Math.cos(a), fast ? 44 : def.boss ? 13 : 15, e.dmg, e); }
          FX.flash(_from, e.eye, fast ? 5 : 3, .2); FX.burst(_from, { n: fast ? 16 : 8, color: e.eye, speed: 5, life: .3, size: .1 }); if (fast) { sfx.twang(); e.vx = -fwdX(e.yaw) * 4; e.vz = -fwdZ(e.yaw) * 4; }
        }
        B.pose(kind === 'snipe' ? FC.shoot : FC.cast, e.st, .05, tag + 's');
        if (e.st > .18) setState(e, 'recover');
      } else if (kind === 'charge') {
        if (!e.did) { e.did = true; e.hitDone = false; sfx.boom(); }
        e.vx = e.cx * 34; e.vz = e.cz * 34; slide = true; B.loop(FC.run, e.animT * 2.6, .06, tag + 'c');
        _v.set(e.pos.x, .3, e.pos.z); FX.burst(_v, { n: 3, color: e.eye, speed: 3, life: .5, size: .2, grav: 1 });
        if (!e.hitDone && dist < 2.6) { e.hitDone = true; attackPlayer(e, e.dmg * 1.2, e.pos.x - e.cx, e.pos.z - e.cz); }
        if (e.st > .5 || Math.hypot(e.pos.x, e.pos.z) > ARENA_R + 1.5) { e.vx *= .15; e.vz *= .15; setState(e, 'recover'); }
      } else {                                                                // slam
        if (!e.did) {
          e.did = true; const r = def.slam;
          FX.ring(e.pos, r, e.eye, { life: .5, gain: 3 }); FX.arc({ pos: e.pos, y: .06, r0: .2, r1: r, mode: 2, color: e.eye, sweep: 0, hold: .8, fade: .8, gain: 2.2 });
          _v.set(e.pos.x, .3, e.pos.z); FX.burst(_v, { n: 30, color: e.eye, speed: 9, up: 5, life: .6, size: .14, r: .6 }); FX.chunks({ x: e.pos.x, y: -.2, z: e.pos.z }, 8, ROCKS, 6);
          FX.flash(_v, e.eye, 6, .35); WORLD.shock(e.pos.x, e.pos.z, 1); sfx.boom(); if (dist < 18) G.shake(.6);
          if (dist < r + .3) attackPlayer(e, e.dmg, e.pos.x, e.pos.z);
        }
        B.pose(FC.chop, swingTime(FC.chop, def.wind, e.at), .1, tag);
        if (e.st > .32) setState(e, 'recover');
      }
      break;
    }
    case 'recover':
      if (kind === 'melee' || kind === 'stalk') B.pose(FC[def.swing], swingTime(FC[def.swing], def.wind + .07, e.at), .08, tag);
      else if (kind === 'slam') B.pose(FC.chop, swingTime(FC.chop, def.wind, e.at), .1, tag);
      else if (kind === 'charge') B.loop(FC.idle, e.animT, .2, tag + 'r');
      else B.pose(kind === 'snipe' ? FC.shoot : FC.cast, .18 + e.st, .05, tag + 's');
      if (e.st > def.rec) { setState(e, 'chase'); e.atkN++; e.cd = kind === 'caster' || kind === 'heal' ? rand(1.8, 3.2) : kind === 'snipe' ? rand(2.6, 3.8) : def.boss ? rand(.9, 1.4) : rand(.9, 2); }
      break;
    case 'stagger':
      B.pose(FC.hit, Math.min(K[FC.hit].dur, e.st * 1.1), .05, 'h' + e.hitN);
      if (e.st > e.stagT && e.y <= 0) { setState(e, 'chase'); e.atkN++; e.cd = Math.max(e.cd, .35); }
      break;
    case 'fuse': {              // powder carrier: plant its feet, flare, go off
      const k = e.st / def.wind; setGlow(e, 3 + 14 * k * Math.abs(Math.sin(e.st * 34))); e.root.scale.setScalar(S * (1 + .1 * k * Math.abs(Math.sin(e.st * 34))));
      if (!e.did) { e.did = true; sfx.warn(); FX.arc({ pos: V3(e.pos.x, 0, e.pos.z), y: .09, r0: 0, r1: def.boom, mode: 3, color: RED, sweep: def.wind, fade: .15, gain: 1.8 }); }
      B.pose(FC.cheer, Math.min(K[FC.cheer].dur, e.st * 1.6), .08, tag);
      if (e.st >= def.wind) { explode(e, true); return; }
      break;
    }
    case 'thrown':              // batted away: tumble, then go off without hurting the one who hit it
      slide = true; e.root.rotation.x += 13 * dt; setGlow(e, 6 + 10 * Math.abs(Math.sin(e.st * 40)));
      B.pose(FC.hit, .2, .05, 'fly');
      if (e.st > .5 || (e.st > .2 && e.y <= 0)) { explode(e, false); return; }
      break;
    case 'blink':               // stalker: gone in a puff, back behind the player's shoulder
      if (!e.did) {
        e.did = true; e.gone = true; e.root.visible = false; sfx.dodge();
        _v.set(e.pos.x, 1.1, e.pos.z); FX.burst(_v, { n: 22, color: e.eye, speed: 4, life: .5, size: .16, grav: -1 }); FX.ring(e.pos, 1.6, e.eye, { life: .35, gain: 2.5 });
        const a = P.yaw + Math.PI + randS(.7); e.bx = P.pos.x + Math.sin(a) * 2.5; e.bz = P.pos.z + Math.cos(a) * 2.5; const r = Math.hypot(e.bx, e.bz); if (r > ARENA_R) { e.bx *= ARENA_R / r; e.bz *= ARENA_R / r; }
        _to.set(e.bx, 1.1, e.bz); FX.streak(_v, _to, .5, e.eye, .34, 2.6);
      }
      if (e.st > .36) {
        e.pos.x = e.bx; e.pos.z = e.bz; e.vx = e.vz = 0; e.yaw = Math.atan2(P.pos.x - e.bx, P.pos.z - e.bz); e.root.visible = true; e.gone = false;
        FX.ring(e.pos, 1.8, e.eye, { life: .3, from: 1, grow1: .2, gain: 3 }); _v.set(e.bx, 1.1, e.bz); FX.flash(_v, e.eye, 4, .25);
        setState(e, 'windup'); e.at = 0; e.atkN++;
      }
      break;
    case 'flee':                // stalker backs off after its cut
      mvx = -tx; mvz = -tz; sp *= 1.05; e.yaw = dampAngle(e.yaw, Math.atan2(-dx, -dz), 10, dt); B.loop(FC.run, e.animT * 1.5, .1, tag + 'f');
      if (e.st > .8) { setState(e, 'chase'); e.atkN++; e.cd = rand(2.2, 3.2); }
      break;
    case 'channel': {           // priest: a beam that knits another of the dead back together
      const tg = e.healT;
      if (!tg || tg.dead || tg.gone || tg.hp >= tg.hpMax || e.st > 2.4) { setState(e, 'chase'); e.atkN++; e.cd = rand(3, 4.2); e.healT = null; break; }
      e.yaw = dampAngle(e.yaw, Math.atan2(tg.pos.x - e.pos.x, tg.pos.z - e.pos.z), 8, dt); setGlow(e, 5 + 3 * Math.sin(e.st * 14));
      _from.set(e.pos.x, 2.2 * S, e.pos.z); _to.set(tg.pos.x, tg.y + 1.2 * tg.def.scale, tg.pos.z);
      if (!e.did) { e.did = true; e.aimLine = FX.streak(_from, _to, .3, e.eye, 0, 2.4); sfx.special(); }
      e.aimLine.set(_from, _to);
      tg.hp = Math.min(tg.hpMax, tg.hp + tg.hpMax * (tg.def.boss ? .02 : .11) * dt);
      e.healFx -= dt; if (e.healFx <= 0) { e.healFx = .32; FX.ring(tg.pos, 1.6 * tg.def.scale, e.eye, { life: .5, from: .3, gain: 2 }); _v.set(tg.pos.x, .3, tg.pos.z); FX.burst(_v, { n: 8, color: e.eye, speed: 1.5, up: 5, life: .7, size: .12, grav: -1, r: .6 }); }
      B.loop(FC.chant, e.animT, .12, tag);
      break;
    }
  }
  const moving = (e.state === 'chase' || e.state === 'flee') && (mvx || mvz);
  if (moving) { const l = Math.hypot(mvx, mvz); e.vx = damp(e.vx, mvx / l * sp, 8, dt); e.vz = damp(e.vz, mvz / l * sp, 8, dt); }
  else if (!slide) { const f = Math.exp(-(e.state === 'stagger' ? 4.5 : 9) * dt); e.vx *= f; e.vz *= f; }
  if (e.y > 0 || e.vy > 0) { e.vy -= 30 * dt; e.y += e.vy * dt; if (e.y <= 0) { e.y = 0; e.vy = 0; _v.set(e.pos.x, .15, e.pos.z); FX.burst(_v, { n: 8, color: ROCKS[2], speed: 3, life: .4, size: .16, gain: .8, flat: .2 }); } }
  e.pos.x += e.vx * dt; e.pos.z += e.vz * dt; e.pos.y = e.y;
  const pr = Math.hypot(e.pos.x, e.pos.z), lim = ARENA_R + 2; if (pr > lim) { e.pos.x *= lim / pr; e.pos.z *= lim / pr; }
  e.root.rotation.y = e.yaw; B.update(dt);
}

/* ============ enemy orbs (can be slashed back) ============ */
const orbs = [];
for (let i = 0; i < 28; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }), mesh = new THREE.Mesh(GEO.sph, mat);
  mesh.scale.setScalar(.3); mesh.visible = false; GFX.scene.add(mesh);
  orbs.push({ mesh, mat, pos: mesh.position, vel: V3(), live: false, life: 0, dmg: 0, friendly: false, owner: null, color: new THREE.Color() });
}
function fireOrb(from, dx, dy, dz, speed, dmg, owner) {
  const o = orbs.find(o => !o.live); if (!o) return;
  o.live = true; o.life = 3.4; o.dmg = dmg; o.friendly = false; o.owner = owner; o.pos.copy(from); o.vel.set(dx, dy, dz).normalize().multiplyScalar(speed);
  o.color.copy(owner.eye); o.mat.color.copy(o.color).multiplyScalar(5); o.mesh.visible = true; o.mesh.scale.setScalar(.3);
}
function killOrb(o, pop) { o.live = false; o.mesh.visible = false; if (pop) FX.burst(o.pos, { n: 12, color: o.color, speed: 6, life: .35, size: .12 }); }
function deflectOrb(o) {
  const w = WEAPONS[player.wi], sp = o.vel.length() * 1.9; o.friendly = true; o.life = 2.5; o.color.copy(w.c); o.mat.color.copy(w.c).multiplyScalar(6); o.mesh.scale.setScalar(.42);
  if (o.owner && !o.owner.dead) o.vel.set(o.owner.pos.x - o.pos.x, 1.1 * o.owner.def.scale - o.pos.y, o.owner.pos.z - o.pos.z).normalize().multiplyScalar(sp); else o.vel.multiplyScalar(-1.9);
  FX.burst(o.pos, { n: 14, color: w.c, speed: 8, life: .35, size: .12, gain: 4 }); FX.flash(o.pos, w.c, 4, .2); sfx.perfect(); G.stop = Math.max(G.stop, .05);
  _v.copy(o.pos); _v.y += .5; HUD.num(_v, 'COUNTER', 'note'); player.en = Math.min(player.enMax, player.en + 6);
}
function orbsUpdate(dt) {
  const p = player;
  for (const o of orbs) {
    if (!o.live) continue;
    o.life -= dt; o.pos.addScaledVector(o.vel, dt);
    if (Math.random() < .7) FX.burst(o.pos, { n: 1, color: o.color, speed: .6, life: .35, size: .13, grav: 0, gain: 2.5 });
    if (o.life <= 0 || o.pos.y < .15 || Math.hypot(o.pos.x, o.pos.z) > ARENA_R + 14) { killOrb(o, true); continue; }
    if (!o.friendly) {
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
      if (dx * dx + dz * dz < .75 && o.pos.y < 2.2 + p.jump) { if (attackPlayer(o.owner, o.dmg, o.pos.x - o.vel.x, o.pos.z - o.vel.z) || p.iT <= 0) killOrb(o, true); }
    } else for (const e of enemies) {
      if (e.dead) continue; const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, r = e.radius + .5;
      if (dx * dx + dz * dz < r * r) { const l = o.vel.length() || 1; hitEnemy(e, o.dmg * 4.5, { kb: 6, heavy: 1, stop: .06, shake: .35 }, o.vel.x / l, o.vel.z / l); killOrb(o, true); break; }
    }
  }
}

/* ============ player arrows, flying crescents, arrow-rain zones ============ */
const arrows = [], waves = [], zones = [];
function fireArrows(sh, base, ho, tg) {
  const p = player, w = WEAPONS[p.wi], n = sh.n || 1, big = !!sh.big;
  const ox = p.pos.x + fwdX(p.yaw) * .7, oz = p.pos.z + fwdZ(p.yaw) * .7, oy = 1.4;
  let yaw = p.yaw, dy = 0;
  if (tg && !tg.dead) { const ddx = tg.pos.x - ox, ddz = tg.pos.z - oz; yaw = Math.atan2(ddx, ddz); dy = (tg.y + 1.1 * tg.def.scale - oy) / Math.max(1, Math.hypot(ddx, ddz)); }
  for (let i = 0; i < n; i++) {
    const a = yaw + (i - (n - 1) / 2) * (sh.spread || 0) * DEG, sp = big ? 95 : 72;
    const vel = V3(Math.sin(a), dy, Math.cos(a)).normalize().multiplyScalar(sp), pos = V3(ox, oy, oz);
    arrows.push({ pos, vel, life: .7, dmg: base, ho, big, hit: new Set(), len: big ? 5 : 2.6, streak: FX.streak(pos, pos, big ? .7 : .26, w.c, 0, big ? 5 : 3.6), color: w.c });
  }
  sfx.twang(); _v.set(ox, oy, oz); FX.burst(_v, { n: big ? 18 : 6, color: w.c, speed: 5, life: .3, size: .1 });
  if (big) { FX.arc({ pos: _v, yaw: p.yaw, pitch: Math.PI / 2, r0: .5, r1: 1.6, mode: 1, color: w.c, sweep: 0, fade: .3, grow0: .3, grow1: 1, gain: 3 }); FX.flash(_v, w.c, 5, .25); sfx.boom(); GFX.post.radial = .8; }
}
function fireWave(yaw, tilt, r, speed, life, dmg, ho, y, vertical) {
  const p = player, w = WEAPONS[p.wi], dx = fwdX(yaw), dz = fwdZ(yaw), pos = V3(p.pos.x + dx * .4, y, p.pos.z + dz * .4);
  FX.arc({ pos, yaw, tilt, a0: vertical ? 1.9 : -1.15, a1: vertical ? -.85 : 1.15, r0: r * .42, r1: r, color: w.c, color2: w.c2, sweep: .05, hold: life, fade: .2, gain: 4, vel: V3(dx * speed, 0, dz * speed) });
  waves.push({ x: pos.x, z: pos.z, dx, dz, speed, life, r, dmg, ho, hit: new Set(), color: w.c, vertical });
}
function shotsUpdate(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i]; a.life -= dt; const px = a.pos.x, pz = a.pos.z;
    a.pos.addScaledVector(a.vel, dt); let dead = a.life <= 0 || a.pos.y < 0;
    const sx = a.pos.x - px, sz = a.pos.z - pz, sl = Math.hypot(sx, sz) || 1e-4, ux = sx / sl, uz = sz / sl;
    for (const e of enemies) {
      if (dead || e.dead || a.hit.has(e)) continue;
      const t = clamp((e.pos.x - px) * ux + (e.pos.z - pz) * uz, 0, sl), d = Math.hypot(e.pos.x - (px + ux * t), e.pos.z - (pz + uz * t));
      if (d < e.radius + (a.big ? .7 : .4)) { a.hit.add(e); hitEnemy(e, a.dmg, a.ho, ux, uz); if (!a.big) dead = true; }
    }
    _v.copy(a.vel).normalize().multiplyScalar(-a.len).add(a.pos); a.streak.set(_v, a.pos);
    if (dead) { a.streak.kill(); FX.burst(a.pos, { n: 6, color: a.color, speed: 4, life: .3, size: .1 }); arrows.splice(i, 1); }
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.life -= dt; w.x += w.dx * w.speed * dt; w.z += w.dz * w.speed * dt;
    const c = w.dz, s = w.dx;                       // cos/sin of heading
    for (const e of enemies) {
      if (e.dead || w.hit.has(e)) continue;
      const ex = e.pos.x - w.x, ez = e.pos.z - w.z, lx = ex * c - ez * s, lz = ex * s + ez * c;
      const ok = w.vertical ? (Math.abs(lx) < 1.5 + e.radius && lz > -1 && lz < w.r + e.radius) : (Math.hypot(lx, lz) < w.r + e.radius && lz > -.6);
      if (ok) { w.hit.add(e); hitEnemy(e, w.dmg, w.ho, w.dx, w.dz); }
    }
    _v.set(w.x + w.dx * w.r * .8 + randS(1), .15, w.z + w.dz * w.r * .8 + randS(1)); FX.burst(_v, { n: 2, color: w.color, speed: 2, up: 3, life: .45, size: .12, grav: 3 });
    if (w.life <= 0 || Math.hypot(w.x, w.z) > ARENA_R + 16) waves.splice(i, 1);
  }
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t += dt; z.tick -= dt; z.hitT -= dt;
    while (z.tick <= 0) {
      z.tick += .03; const a = rand(TAU), r = Math.sqrt(Math.random()) * z.r, gx = z.x + Math.sin(a) * r, gz = z.z + Math.cos(a) * r;
      _from.set(gx + 2, 14, gz - 1.5); _to.set(gx, 0, gz); FX.streak(_from, _to, .24, z.w.c, .1, 3.6); _to.y = .1; FX.burst(_to, { n: 2, color: z.w.c, speed: 4, life: .3, size: .1 });
    }
    if (z.hitT <= 0) { z.hitT = .16; aoe(z.x, z.z, z.r, z.dmg, { kb: .4, stop: 0, shake: .06, noEn: 1, stun: .25 }); }
    if (z.t >= z.dur) zones.splice(i, 1);
  }
}
function clearShots() {
  orbs.forEach(o => { o.live = false; o.mesh.visible = false; }); arrows.forEach(a => a.streak.kill()); arrows.length = 0; waves.length = 0; zones.length = 0;
}
