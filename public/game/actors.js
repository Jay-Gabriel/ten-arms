'use strict';
/* ============ the hero: the pack's hooded rogue, repainted as a shadow ronin ============
   midnight-violet hood and coat, charcoal sleeves and hakama, near-black leather, ash shin wraps, brass where the pack had steel, a mask where the face was */
const HERO_RIG = MODEL.rig(HERO_DATA.rig, { shape: BODY_SHAPE, headY: 1.35 });
const HERO = (() => {
  const head = HERO_RIG.index(/^head$/i), sum = [[0, 0, 0, 0], [0, 0, 0, 0]], rim = { value: new THREE.Color(0, 0, 0) }, bn = HERO_RIG.B.map(b => b.n);
  const skin = MODEL.skin(HERO_RIG, HERO_DATA.skins.hero, { paint(c, hsl, i, S) {
    const b = bn[S.ji[i * 4]], onHead = S.ji[i * 4] === head && S.jw[i * 4] > 127, { h, s, l } = hsl;
    if (onHead && l < .2 && S.pos[i * 3 + 2] > .05) { const e = sum[S.pos[i * 3] > 0 ? 0 : 1]; e[0] += S.pos[i * 3]; e[1] += S.pos[i * 3 + 1]; e[2] = Math.max(e[2], S.pos[i * 3 + 2]); e[3]++; }   // the face's own eyes: lit slits go here
    if (h > .28 && h < .5) { if (/arm/.test(b)) c.setHSL(.69, .2, .05 + l * .42); else c.setHSL(.71, .4, .04 + l * .5); }          // sleeves charcoal; hood and coat midnight violet
    else if (h < .12 && s > .2) {
      if (onHead) c.setHSL(.68, .3, .055);                                                     // the mask
      else if (/lowerleg/.test(b) && l > .45) c.setHSL(.7, .1, .1 + l * .2);                  // shin wraps: ash grey
      else if (/upperleg/.test(b)) c.setHSL(.7, .16, .06 + l * .14);                          // hakama
      else if (/hand|wrist|lowerarm/.test(b)) c.setHSL(.69, .14, .05 + l * .1);               // gloves
      else c.setHSL(.03, .42, .05 + l * .17);                                                  // belts, straps, boots
    } else if (s < .25 && l > .35) c.setHSL(.11, .7, .4 + (l - .55) * .6);                    // the pack's steel fittings → brass
  } });
  const body = MODEL.spawn(HERO_RIG, skin, { mats: { '': TOON.mat(0xffffff, rim, false, { skinning: true, vertexColors: true }) } });
  return Object.assign(body, { rim, clips: HERO_RIG.clips, mirror: HERO_RIG.mirror, arcY: HERO_RIG.arcY, nv: skin.nv, index: skin.geo.index, eyes: sum.filter(e => e[3]).map(e => [e[0] / e[3], e[1] / e[3], e[2]]) });
})();

/* ============ the hero's clips, by the short names the game uses ============ */
const CLIP = {
  idle: 'idle', idle2: '2h_melee_idle', idleFist: 'unarmed_idle', aim: '2h_ranged_aiming', shoot: '2h_ranged_shoot', run: 'running_a',
  dodgeF: 'dodge_forward', dodgeB: 'dodge_backward', hit: 'hit_a', death: 'death_a',
  s1h: '1h_melee_attack_slice_horizontal', s1d: '1h_melee_attack_slice_diagonal', c1: '1h_melee_attack_chop', t1: '1h_melee_attack_stab',
  s2: '2h_melee_attack_slice', c2: '2h_melee_attack_chop', t2: '2h_melee_attack_stab',
  dc: 'dualwield_melee_attack_chop', ds: 'dualwield_melee_attack_slice', dt: 'dualwield_melee_attack_stab',
  jabL: 'unarmed_melee_attack_punch_a', jabR: HERO.mirror('unarmed_melee_attack_punch_a'), upper: 'unarmed_melee_attack_punch_b', kick: 'unarmed_melee_attack_kick',
  toss: 'throw', cast: 'spellcast_shoot', raise: 'spellcast_raise', cheer: 'cheer', jump: 'jump_full_short',
};

/* ============ the ten weapons ============ */
const arcDef = (a0, a1, tilt, t0, t1, o) => Object.assign({ a0: a0 * DEG, a1: a1 * DEG, tilt: tilt * DEG, t0, t1, hand: 'R' }, o);
/* a cut that follows what a clip really does: its measured plane and sweep, padded a little so the trail reads wide. rev plays it backwards. */
const cut = (clip, hand, t0, t1, o) => {
  o = o || {}; const s = HERO.clips[clip].sw[hand], pad = (o.pad === undefined ? 16 : o.pad) * DEG, d = s[4] >= s[3] ? 1 : -1;
  let a0 = s[3] - d * pad, a1 = s[4] + d * pad, c0 = s[0], c1 = s[1]; if (o.rev) { [a0, a1] = [a1, a0]; [c0, c1] = [c1, c0]; }
  return Object.assign({ a0, a1, tilt: s[2], t0, t1, hand, clip, c0, c1 }, o);
};
/* a cut drawn by hand, with the body borrowed from the swing of a clip */
const like = (clip, hand, a0, a1, tilt, t0, t1, o) => { const s = HERO.clips[clip].sw[hand]; return Object.assign(arcDef(a0, a1, tilt, t0, t1), { hand, clip, c0: s[0], c1: s[1] }, o); };
/* a whirl: one moment of a clip is held while the whole body turns through the sweep */
const whirl = (clip, hand, end, sweep, tilt, t0, t1, o) => { const s = HERO.clips[clip].sw[hand], a0 = (end ? s[4] : s[3]) + ((o && o.turn) || 0) * DEG; return Object.assign({ a0, a1: a0 + sweep * DEG, tilt: tilt * DEG, t0, t1, hand, clip, hold: end ? s[1] : s[0], spin: 1 }, o); };
const C = CLIP;
const WEAPONS = [
  { id: 'katana', name: 'Katana', sp: 'Moon Ring', hex: 0xb14cff, hex2: 0x3d5bff, reach: 3.1, dmg: 14, stance: 'one',
    icon: 'M4 20 19 5M6.5 14.5l3 3',
    combo: [
      { dur: .38, cancel: .2, lunge: 2.6, arcs: [cut(C.s1h, 'R', .05, .17, { pad: 26 })] },
      { dur: .38, cancel: .2, lunge: 2.2, arcs: [cut(C.s1d, 'R', .05, .17, { rev: 1, pad: 22 })] },
      { dur: .44, cancel: .25, lunge: 2.6, m: 1.2, arcs: [cut(C.s1h, 'R', .06, .2, { r: 1.12, pad: 40 })] },
      { dur: .7, cancel: .48, lunge: 3.2, m: 1.9, kb: 9, heavy: 1, stop: .09, shake: .5, arcs: [whirl(C.s1h, 'R', 1, 430, 8, .08, .3, { r: 1.2 })] }] },
  { id: 'dual', name: 'Twin Swords', sp: 'Flash Step', hex: 0x35d6ff, hex2: 0x2a6bff, reach: 2.5, dmg: 8, stance: 'dual',
    icon: 'M5 20 17 4M19 20 7 4',
    combo: [
      { dur: .26, cancel: .13, lunge: 2.2, arcs: [cut(C.dc, 'R', .03, .11, { pad: 24 })] },
      { dur: .26, cancel: .13, lunge: 1.8, arcs: [cut(C.dc, 'L', .03, .11, { pad: 24 })] },
      { dur: .34, cancel: .18, lunge: 2.4, m: 1.1, arcs: [cut(C.ds, 'R', .04, .14), cut(C.ds, 'L', .04, .14)] },
      { dur: .5, cancel: .3, lunge: 2.6, m: .9, arcs: [whirl(C.ds, 'R', 1, 370, 10, .05, .24), whirl(C.ds, 'L', 1, 370, -10, .05, .24)] },
      { dur: .6, cancel: .42, lunge: 3, m: 1.7, kb: 8, heavy: 1, stop: .08, shake: .45, arcs: [cut(C.c2, 'R', .08, .2, { pad: 8 }), cut(C.c2, 'L', .08, .2, { pad: 8 })] }] },
  { id: 'heavy', name: 'Greatsword', sp: 'Earthbreaker', hex: 0xffa726, hex2: 0xff4d1f, reach: 4.0, dmg: 30, stance: 'two',
    icon: 'M6 19 17.5 5.5M4 21l3-3', iw: 4,
    combo: [
      { dur: .72, cancel: .5, lunge: 2.4, kb: 7, heavy: 1, stop: .08, shake: .4, w: .55, arcs: [cut(C.s2, 'R', .16, .36, { pad: 44 })] },
      { dur: .72, cancel: .5, lunge: 2.2, m: 1.15, kb: 7, heavy: 1, stop: .08, shake: .4, w: .55, arcs: [cut(C.s2, 'R', .14, .34, { rev: 1, pad: 44 })] },
      { dur: .95, cancel: .7, lunge: 2.6, m: 2.1, kb: 10, launch: 7, heavy: 1, stop: .14, shake: .9, w: .5, arcs: [cut(C.c2, 'R', .22, .38, { pad: 6 })], slam: { t: .38, r: 4.6 } }] },
  { id: 'twin', name: 'Twin Blades', sp: 'Blood Whirl', hex: 0xff2f52, hex2: 0xff8a3d, reach: 3.2, dmg: 9, stance: 'two',
    icon: 'M3 21 21 3M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    combo: [
      { dur: .4, cancel: .24, lunge: 2.2, arcs: [whirl(C.s2, 'R', 1, 370, 12, .04, .26)] },
      { dur: .4, cancel: .24, lunge: 2.2, arcs: [whirl(C.s2, 'R', 0, -370, -12, .04, .26)] },
      { dur: .5, cancel: .32, lunge: 2.6, arcs: [cut(C.s2, 'R', .04, .16, { pad: 34 }), cut(C.s2, 'R', .2, .32, { rev: 1, pad: 34 })] },
      { dur: .75, cancel: .55, lunge: 3, m: 1.5, kb: 8, heavy: 1, stop: .07, shake: .4, arcs: [whirl(C.s2, 'R', 1, 540, 6, .06, .4, { r: 1.15 }), whirl(C.s2, 'R', 1, 540, -6, .06, .4, { r: 1.15, turn: 180 })] }] },
  { id: 'axe', name: 'Twin Axes', sp: 'Twin Crescent', hex: 0x54ff62, hex2: 0x00c46a, reach: 2.8, dmg: 16, stance: 'dual',
    icon: 'M6 21 16 5M13 4q8 1 6 9l-5-3z',
    combo: [
      { dur: .44, cancel: .27, lunge: 2.4, arcs: [cut(C.dc, 'R', .08, .2, { pad: 26 })] },
      { dur: .44, cancel: .27, lunge: 2.2, arcs: [cut(C.dc, 'L', .08, .2, { pad: 26 })] },
      { dur: .5, cancel: .3, lunge: 2.4, m: 1.1, arcs: [cut(C.ds, 'R', .08, .2), cut(C.ds, 'L', .08, .2)] },
      { dur: .8, cancel: .58, lunge: 2.8, m: 1.9, kb: 8, launch: 6, heavy: 1, stop: .11, shake: .7, arcs: [cut(C.c2, 'R', .16, .3, { pad: 8 }), cut(C.c2, 'L', .16, .3, { pad: 8 })], slam: { t: .3, r: 3.6 } }] },
  { id: 'staff', name: 'Long Staff', sp: 'Thunder Bell', hex: 0x4f7bff, hex2: 0x9fd0ff, reach: 3.7, dmg: 12, stance: 'two',
    icon: 'M5 19 19 5M2.4 20a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M18.4 4a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    combo: [
      { dur: .34, cancel: .19, lunge: 2.6, thrust: { t0: .05, t1: .14, len: 4.4, clip: C.t2 } },
      { dur: .46, cancel: .28, lunge: 2.2, arcs: [cut(C.s2, 'R', .06, .22, { pad: 50 })] },
      { dur: .5, cancel: .3, lunge: 2.2, m: 1.1, arcs: [cut(C.s2, 'R', .05, .26, { rev: 1, pad: 60 })] },
      { dur: .8, cancel: .58, lunge: 2.6, m: 1.8, kb: 9, heavy: 1, stop: .1, shake: .7, arcs: [cut(C.c2, 'R', .16, .3, { pad: 6 })], slam: { t: .3, r: 4.2 } }] },
  { id: 'fist', name: 'Gauntlets', sp: 'Hundred Fists', hex: 0xffd23f, hex2: 0xff7a1a, reach: 2.0, dmg: 9, stance: 'fist',
    icon: 'M7 8h9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7zM10 8v4M13 8v4',
    combo: [
      { dur: .2, cancel: .1, lunge: 2.2, thrust: { t0: .02, t1: .08, len: 2.7, hand: 'L', clip: C.jabL } },
      { dur: .2, cancel: .1, lunge: 1.6, thrust: { t0: .02, t1: .08, len: 2.7, clip: C.jabR } },
      { dur: .2, cancel: .1, lunge: 1.6, thrust: { t0: .02, t1: .08, len: 2.7, hand: 'L', clip: C.jabL } },
      { dur: .34, cancel: .2, lunge: 1.8, m: 1.3, arcs: [arcDef(-70, 60, 55, .06, .15, { clip: C.kick, c0: .14, c1: .36 })] },
      { dur: .42, cancel: .26, lunge: 1.8, m: 1.6, launch: 9, kb: 2, heavy: 1, stop: .07, arcs: [like(C.upper, 'R', -55, 125, 90, .05, .16)] },
      { dur: .6, cancel: .42, lunge: 3.2, m: 2.4, kb: 13, heavy: 1, stop: .12, shake: .8, thrust: { t0: .12, t1: .2, len: 3.6, big: 1, clip: C.jabR } }] },
  { id: 'bow', name: 'Bow', sp: 'Arrow Rain', hex: 0xa6ff3d, hex2: 0x2de0a0, reach: 30, dmg: 13, stance: 'bow',
    icon: 'M7 3q12 9 0 18M7 3v18M4 12h14',
    combo: [
      { dur: .36, cancel: .2, lunge: 0, shot: { t: .1, n: 1 } },
      { dur: .36, cancel: .2, lunge: 0, shot: { t: .1, n: 1 } },
      { dur: .46, cancel: .28, lunge: 0, shot: { t: .14, n: 3, spread: 9 } },
      { dur: .75, cancel: .55, lunge: 0, m: 2.6, heavy: 1, stop: .08, shake: .5, kb: 10, shot: { t: .3, n: 1, big: 1 } }] },
  { id: 'dagger', name: 'Daggers', sp: 'Shadow Strike', hex: 0xe8f6ff, hex2: 0x74d7ff, reach: 2.0, dmg: 7, stance: 'dual', crit: .35,
    icon: 'M8 16 17 7M7 13l4 4',
    combo: [
      { dur: .2, cancel: .1, lunge: 2.4, arcs: [cut(C.dc, 'R', .02, .09, { pad: 22 })] },
      { dur: .2, cancel: .1, lunge: 1.8, arcs: [cut(C.dc, 'L', .02, .09, { pad: 22 })] },
      { dur: .2, cancel: .1, lunge: 1.8, thrust: { t0: .02, t1: .08, len: 2.7, clip: C.dt } },
      { dur: .24, cancel: .12, lunge: 1.8, arcs: [cut(C.ds, 'R', .02, .1), cut(C.ds, 'L', .05, .13)] },
      { dur: .46, cancel: .3, lunge: 2.6, m: 1.8, kb: 6, heavy: 1, stop: .06, arcs: [whirl(C.ds, 'R', 1, 380, 0, .04, .2), whirl(C.ds, 'L', 1, 380, 0, .04, .2)] }] },
  { id: 'sword', name: 'Longsword', sp: 'Sword Qi', hex: 0xff3b30, hex2: 0xff9a5c, reach: 2.9, dmg: 13, stance: 'one',
    icon: 'M5 19 19 5M6 14l4 4M4 20h.01',
    combo: [
      { dur: .34, cancel: .18, lunge: 2.4, arcs: [cut(C.s1d, 'R', .04, .15, { pad: 24 })] },
      { dur: .34, cancel: .18, lunge: 2.0, arcs: [cut(C.s1h, 'R', .04, .15, { rev: 1, pad: 24 })] },
      { dur: .32, cancel: .18, lunge: 3.0, m: 1.1, thrust: { t0: .05, t1: .13, len: 3.8, clip: C.t1 } },
      { dur: .62, cancel: .44, lunge: 2.6, m: 1.9, kb: 8, launch: 5, heavy: 1, stop: .09, shake: .55, arcs: [cut(C.c1, 'R', .1, .24, { pad: 26 })] }] },
];
WEAPONS.forEach(w => { w.c = col(w.hex); w.c2 = col(w.hex2); w.css = '#' + w.hex.toString(16).padStart(6, '0'); });
const SPECIAL_COST = 40;

/* ============ plain arms for the dead (foes.js): built hanging down from the grip (the grip at the origin, the business end toward -Y); M = { steel, dark, wood } ============ */
const ARMS = {
  blade(M, glow, len, w, th, guard, grip, gw) {
    const g = new THREE.Group(); grip = grip || .22;
    g.add(part(GEO.cyl, M.dark, .024, grip, .024));
    g.add(part(GEO.box, M.dark, guard || .13, .03, .06, 0, -grip / 2, 0));
    g.add(part(GEO.box, M.steel, w, len, th, 0, -grip / 2 - len / 2, 0));
    g.add(part(GEO.box, glow, w * (gw || .3), len * .97, th * 1.5, 0, -grip / 2 - len / 2, 0));
    return g;
  },
  axe(M, glow, k) {
    const g = new THREE.Group(); k = k || 1; g.add(part(GEO.cyl, M.wood, .026 * k, .9 * k, .026 * k, 0, -.3 * k, 0));
    g.add(turned(part(ARMS.half, M.steel, .32 * k, .04 * k, .32 * k, 0, -.6 * k, .02), Math.PI / 2, 0, Math.PI / 2));
    g.add(turned(part(ARMS.half, glow, .36 * k, .014 * k, .36 * k, 0, -.6 * k, .02), Math.PI / 2, 0, Math.PI / 2));
    return g;
  },
  staff(M, glow, len) {
    const g = new THREE.Group(); g.add(part(GEO.cyl, M.wood, .026, len, .026, 0, -len / 2 + .35, 0));
    g.add(part(GEO.ico, glow, .1, .13, .1, 0, -len + .3, 0)); g.add(part(GEO.cyl, glow, .034, .12, .034, 0, -len + .52, 0));
    return g;
  },
  half: new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI),
};
/* ============ the hero's ten weapons, forged ============
   built like ARMS (grip at the origin, business end toward -Y), the flat of a blade across X with its edge toward +X, thickness along Z.
   M = { steel, dark (blackened iron), gold, wood, wrap (cord), lacq (red lacquer) }; gl = the weapon's light, g2 = its second colour */
const HERO_ARMS = (() => {
  const F = FORGE, oct = Math.PI / 8;
  const flat = g => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; };
  const torus = (R, r, arc) => flat(new THREE.TorusGeometry(R, r, 4, Math.max(8, Math.round(R * 80)), arc || TAU));
  const gem = flat(new THREE.OctahedronGeometry(1, 0));
  const disc = (r, h, n) => F.lathe([[0, h / 2], [r, h / 2], [r, -h / 2], [0, -h / 2]], n || 8, oct);
  const put = (g, geo, mat, x, y, z, rx, ry, rz, s) => { const m = part(geo, mat, 1, 1, 1, x, y, z); if (s) m.scale.set(s[0], s[1], s[2]); m.rotation.set(rx || 0, ry || 0, rz || 0); g.add(m); return m; };
  const studs = (g, mat, x, y, z, s) => { put(g, gem, mat, x, y, z, 0, 0, 0, s); put(g, gem, mat, x, y, -z, 0, 0, 0, s); };
  /* a single-edged blade that bends back toward its spine, the point cut by the edge rising to meet the back (a katana's kissaki) */
  function curved(y0, len, w0, w1, bend, t, tip, n) {
    const st = [], at = k => [y0 - k * len, -bend * k * k];
    for (let i = 0; i <= n; i++) { const k = i / n * (1 - tip), [y, c] = at(k), w = lerp(w0, w1, k / (1 - tip)); st.push([y, c + w * .5, c - w * .5, t, .66, t * .6]); }
    for (const f of [.35, .65, .86, 1]) { const k = 1 - tip + tip * f, [y, c] = at(k), back = c - w1 * .5 - bend * .04 * f; st.push([y, back + w1 * (1 - Math.pow(f, 1.6)), back, f < 1 ? t * (1 - f * .55) : 0, .66, f < 1 ? t * .6 * (1 - f) : 0]); }
    return st;
  }
  /* a straight two-edged blade from [fraction along, half width] pairs */
  const straight = (y0, len, prof, t) => prof.map(([k, hw]) => [y0 - k * len, hw, -hw, hw > 0 ? t : 0, .5, 0]);

  const D = {
    /* curved, single-edged, an octagonal tsuba ringed in gold, the grip bound in indigo cord */
    katana(M, gl) {
      const g = new THREE.Group(), st = curved(-.205, 1.3, .084, .07, .09, .013, .1, 12);
      put(g, F.blade(st), M.steel); put(g, F.edge(st, .024), gl);
      put(g, GEO.box, M.gold, 0, -.205, 0, 0, 0, 0, [.092, .04, .034]);                                    // habaki
      put(g, disc(.078, .022), M.dark, 0, -.178, 0); put(g, torus(.078, .008), M.gold, 0, -.178, 0, Math.PI / 2);   // tsuba
      put(g, F.grip(.027, .021, .162, -.152, 6), M.wrap);
      put(g, disc(.031, .016), M.gold, 0, -.158, 0);                                                         // fuchi
      put(g, F.lathe([[0, .158], [.031, .158], [.031, .178], [.022, .198], [0, .204]], 8, oct), M.gold);   // kashira
      studs(g, M.gold, 0, .01, .025, [.012, .032, .008]);                                                    // menuki under the cord
      return { R: g };
    },
    /* butterfly swords: short broad blades swelling toward the point, a knuckle bow on the edge side */
    dual(M, gl) {
      const mk = () => {
        const g = new THREE.Group(), y0 = -.165, len = .76, st = [];
        for (const [k, w] of [[0, .06], [.25, .07], [.5, .082], [.7, .092], [.82, .087], [.91, .064], [.97, .032], [1, 0]]) {
          const back = -.03 + .05 * Math.pow(Math.max(0, (k - .7) / .3), 2);
          st.push([y0 - k * len, back + w, back, k < 1 ? .01 : 0, .7, k < 1 ? .006 : 0]);
        }
        put(g, F.blade(st), M.steel); put(g, F.edge(st, .017), gl);
        put(g, F.slab([[-.07, .012], [.07, .012], [.085, 0], [.07, -.012], [-.06, -.012], [-.085, .02]], .036, .006), M.gold, 0, -.16, 0);   // cross bar, a hook on the back
        put(g, torus(.105, .008, Math.PI), M.gold, .004, -.048, 0, 0, 0, -Math.PI / 2);                      // knuckle bow
        put(g, F.grip(.02, .017, .06, -.15, 4), M.wrap);
        put(g, F.lathe([[0, .058], [.022, .058], [.028, .075], [.015, .095], [0, .1]], 8, oct), M.gold);
        return g;
      };
      const R = mk(), L = mk(); L.scale.x = -1; return { R, L };
    },
    /* a slab of a sword: molten fuller, glowing edges, swept iron wings for a guard, a spiked pommel */
    heavy(M, gl, g2) {
      const g = new THREE.Group(), y0 = -.33, len = 1.68;
      const st = straight(y0, len, [[0, .118], [.06, .112], [.42, .094], [.62, .1], [.8, .104], [.9, .066], [1, 0]], .032);
      put(g, F.blade(st), M.steel); put(g, F.fuller(st, .026, y0 - .03, y0 - .74 * len), gl);
      put(g, F.edge(st, .011), g2); put(g, F.edge(F.backEdge(st), .011), g2);
      const wing = [[-.06, 0], [.06, 0], [.2, -.014], [.31, -.05], [.35, -.115], [.25, -.088], [.13, -.1], [.05, -.13], [0, -.15], [-.05, -.13], [-.13, -.1], [-.25, -.088], [-.35, -.115], [-.31, -.05], [-.2, -.014]];
      put(g, F.slab(wing, .05, .01), M.dark, 0, -.2, 0);
      put(g, F.slab([[-.07, 0], [.07, 0], [.052, -.1], [0, -.135], [-.052, -.1]], .07, .008), M.gold, 0, -.2, 0);
      studs(g, gl, 0, -.262, .045, [.026, .04, .012]);
      put(g, F.grip(.034, .03, .2, -.2, 8), M.wrap);
      put(g, F.lathe([[0, .19], [.042, .19], [.056, .23], [.042, .27], [.02, .3], [0, .36]], 8, oct), M.gold);
      return { R: g };
    },
    /* a double-ended glaive: two curved blades turned half about, so it reads the same from either end */
    twin(M, gl) {
      const R = new THREE.Group(), st = curved(-.29, .82, .086, .074, .11, .012, .18, 9);
      put(R, F.grip(.03, .028, .26, -.26, 9), M.wrap);
      for (const y of [.18, -.18]) put(R, disc(.034, .022), M.gold, 0, y, 0);
      for (const turn of [0, Math.PI]) {
        const h = new THREE.Group(); h.rotation.z = turn; R.add(h);
        put(h, F.blade(st), M.steel); put(h, F.edge(st, .022), gl);
        put(h, F.lathe([[0, -.255], [.04, -.255], [.055, -.28], [.03, -.3], [0, -.3]], 8, oct), M.gold);
      }
      return { R };
    },
    /* bearded axes: a crescent bit lit along its edge, a spike behind, the haft bound where the hand goes */
    axe(M, gl, g2) {
      const mk = () => {
        const g = new THREE.Group();
        put(g, F.lathe([[0, .16], [.025, .16], [.028, -.4], [.031, -.82], [0, -.82]], 8, oct), M.wood);
        put(g, F.grip(.031, .031, .12, -.2, 5), M.wrap);
        put(g, F.lathe([[0, .14], [.034, .14], [.04, .17], [.02, .2], [0, .21]], 8, oct), M.gold);
        put(g, F.lathe([[0, -.54], [.046, -.54], [.052, -.6], [.052, -.76], [.042, -.8], [0, -.8]], 6), M.dark);
        const bit = [[.03, -.6], [.12, -.585], [.19, -.475], [.215, -.445], ...F.arc(.1, -.665, .215, 50 * DEG, -62 * DEG, 12), [.15, -.79], [.08, -.758], [.03, -.752]];
        put(g, F.slab(bit, .024, .006), M.steel);
        put(g, F.slab([...F.arc(.1, -.665, .224, 47 * DEG, -60 * DEG, 12), ...F.arc(.1, -.665, .192, -60 * DEG, 47 * DEG, 12)], .046, 0), gl);
        put(g, F.slab([[-.045, -.6], [-.17, -.672], [-.045, -.735]], .03, .005), M.dark);
        studs(g, g2, .1, -.66, .022, [.02, .03, .01]);
        return g;
      };
      const R = mk(), L = mk(); L.scale.x = -1; return { R, L };
    },
    /* a thunder staff: gold-shod ends, a crystal at each, rings of light turning about them */
    staff(M, gl, g2) {
      const R = new THREE.Group(), spin = [], top = 1.02, bot = -1.52;
      put(R, F.lathe([[0, top], [.026, top], [.03, 0], [.026, bot], [0, bot]], 8, oct), M.wood);
      put(R, F.grip(.032, .032, .3, -.32, 9), M.wrap);
      for (const y of [.4, -.42, .75, -.78]) put(R, disc(.035, .03), M.gold, 0, y, 0);
      for (const [y, d] of [[top, 1], [bot, -1]]) {
        put(R, F.lathe([[0, y - d * .12], [.03, y - d * .12], [.044, y - d * .02], [.036, y + d * .035], [0, y + d * .04]], 8, oct), M.gold);
        put(R, gem, gl, 0, y + d * .14, 0, 0, .4, 0, [.042, .1, .042]);
        const pivot = new THREE.Group(); pivot.position.set(0, y + d * .14, 0); R.add(pivot); spin.push(pivot);
        for (const tilt of [.55, -.55]) put(pivot, torus(.088, .0065), g2, 0, 0, 0, Math.PI / 2 + tilt, 0, 0);
      }
      return { R, spin };
    },
    /* armoured fists: knuckles studded with light, a plate on the back of the hand, a flared cuff */
    fist(M, gl, g2) {
      const mk = () => {
        const g = new THREE.Group();
        put(g, F.slab([[-.11, -.105], [.1, -.115], [.132, -.075], [.132, .085], [.1, .115], [-.11, .105]], .19, .024), M.dark, 0, 0, -.03);
        put(g, GEO.box, M.gold, .152, 0, -.03, 0, 0, 0, [.03, .22, .12]);
        for (let i = 0; i < 4; i++) put(g, gem, gl, .175, -.075 + i * .05, -.03, 0, 0, 0, [.03, .02, .04]);
        put(g, F.slab([[-.085, -.075], [.06, -.06], [.1, 0], [.06, .06], [-.085, .075]], .03, .006), M.gold, 0, 0, -.145);
        put(g, gem, g2, .01, 0, -.165, 0, 0, 0, [.03, .03, .014]);
        const cuff = F.lathe([[0, 0], [.125, 0], [.14, -.07], [.158, -.13], [0, -.13]], 10); cuff.rotateZ(-Math.PI / 2);
        put(g, cuff, M.dark, -.1, 0, -.04);
        put(g, torus(.152, .011), M.gold, -.225, 0, -.04, 0, Math.PI / 2, 0);
        put(g, torus(.142, .006), g2, -.175, 0, -.04, 0, Math.PI / 2, 0);
        return g;
      };
      const R = mk(), L = mk(); L.scale.x = -1; return { R, L };
    },
    /* a recurve: limbs that flick forward at the tips, a lit inlay down the side that faces the archer, a string of light */
    bow(M, gl, g2) {
      const R = new THREE.Group(), yAt = u => .32 * Math.pow(u, 1.8) - 3.4 * Math.pow(Math.max(0, u - .78), 2), half = .64, path = [];
      for (let i = -18; i <= 18; i++) { const u = i / 18; path.push([0, yAt(Math.abs(u)), half * u]); }
      put(R, F.sweep(path, [1, 0, 0], k => { const u = Math.abs(k * 2 - 1); return [lerp(.034, .014, u), lerp(.024, .01, u)]; }, 6), M.dark);
      for (const s of [1, -1]) {
        const inlay = []; for (let i = 3; i <= 15; i++) { const u = i / 18, y = yAt(u), dy = yAt(u + .01) - y, dz = half * .01, l = Math.hypot(dy, dz), r = lerp(.024, .01, u) * .85; inlay.push([0, y + dz / l * r, s * (half * u - dy / l * r)]); }
        put(R, F.sweep(inlay, [1, 0, 0], () => [.011, .006], 4), gl);
        put(R, gem, M.gold, 0, yAt(1) + .012, s * (half + .012), 0, 0, 0, [.016, .03, .045]);
        put(R, F.slab([[0, 0], [.09, -.02], [.02, .05]], .012, .003), M.gold, 0, yAt(.9), s * half * .9, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      }
      put(R, F.sweep([[0, -.005, -.12], [0, -.01, 0], [0, -.005, .12]], [1, 0, 0], () => [.042, .034], 8), M.wrap);
      put(R, gem, g2, 0, -.05, 0, 0, 0, 0, [.024, .03, .024]);
      put(R, GEO.cyl, gl, 0, yAt(1), 0, Math.PI / 2, 0, 0, [.005, half * 2 + .02, .005]);
      R.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(-1, 0, 0), V3(0, 1, 0))); R.userData.bare = true;
      return { R };
    },
    /* kunai: a leaf blade lit along both edges, a corded grip, a ring for a pommel */
    dagger(M, gl) {
      const mk = () => {
        const g = new THREE.Group(), st = straight(-.125, .37, [[0, .02], [.12, .036], [.3, .047], [.55, .037], [.8, .018], [1, 0]], .011);
        put(g, F.blade(st), M.steel); put(g, F.edge(st, .011), gl); put(g, F.edge(F.backEdge(st), .011), gl);
        put(g, F.grip(.016, .014, .075, -.11, 5), M.wrap);
        put(g, disc(.022, .02, 6), M.gold, 0, -.115, 0);
        put(g, torus(.034, .007), M.gold, 0, .11, 0);
        return g;
      };
      return { R: mk(), L: mk() };
    },
    /* a longsword: runes lit down the fuller, a flared gold cross, a wheel pommel with a stone in it */
    sword(M, gl) {
      const g = new THREE.Group(), y0 = -.25, len = 1.1, st = straight(y0, len, [[0, .05], [.08, .048], [.75, .04], [.9, .026], [1, 0]], .016);
      put(g, F.blade(st), M.steel);
      for (const [a, b] of [[.03, .2], [.24, .35], [.39, .48], [.52, .59]]) put(g, F.fuller(st, .009, y0 - a * len, y0 - b * len), gl);
      put(g, F.slab([[-.16, .018], [.16, .018], [.19, .042], [.218, 0], [.19, -.042], [.16, -.018], [-.16, -.018], [-.19, -.042], [-.218, 0], [-.19, .042]], .036, .008), M.gold, 0, -.226, 0);
      put(g, F.slab([[-.045, .03], [.045, .03], [.03, -.04], [0, -.062], [-.03, -.04]], .05, .006), M.dark, 0, -.226, 0);
      studs(g, gl, 0, -.236, .034, [.016, .022, .008]);
      put(g, F.grip(.024, .021, .15, -.205, 6), M.lacq);
      const wheel = F.lathe([[0, .016], [.035, .016], [.048, 0], [.035, -.016], [0, -.016]], 8, oct); wheel.rotateX(Math.PI / 2);
      put(g, wheel, M.gold, 0, .2, 0); studs(g, gl, 0, .2, .02, [.014, .014, .006]);
      return { R: g };
    },
  };

  function build() {
    const rim = HERO.rim, M = {
      steel: TOON.metal(0xc9d3e3, rim, 1), dark: TOON.metal(0x2b2834, rim, .4), gold: TOON.metal(0xd9a54c, rim, .85),
      wood: TOON.mat(0x3d2a20, rim), wrap: TOON.mat(0x2b2444, rim), lacq: TOON.mat(0x6a1626, rim),
    };
    // the slot's own +Y runs up the blade; these models were built hanging down from the grip, so each hand gets a holder that turns them over
    const holder = b => { const g = new THREE.Group(); g.rotation.x = Math.PI; b.add(g); return g; }, HR = holder(HERO.part.slotR), HL = holder(HERO.part.slotL);
    return WEAPONS.map(w => {
      const glow = new THREE.MeshBasicMaterial({ color: w.c.clone().multiplyScalar(3.2) }), glow2 = new THREE.MeshBasicMaterial({ color: w.c2.clone().multiplyScalar(2.6) });
      const m = (D[w.id] || D.sword)(M, glow, glow2);
      for (const [o, h, slot] of [[m.R, HR, HERO.part.slotR], [m.L, HL, HERO.part.slotL]]) if (o) { o.visible = false; (o.userData.bare ? slot : h).add(o); }
      return { R: m.R || null, L: m.L || null, glow, base: glow.color.clone(), spin: m.spin || [] };
    });
  }
  /* the weapon in hand breathes: its light swells and ebbs, and whatever orbits it turns */
  function tick(dt, t, m) { if (!m) return; m.glow.color.copy(m.base).multiplyScalar(1 + Math.sin(t * 3.1) * .12); for (const s of m.spin) s.rotation.y += dt * 2.6; }
  return { build, tick };
})();
function buildWeaponModels() { return HERO_ARMS.build(); }

/* ============ player ============ */
const player = (() => {
  const root = new THREE.Group(), accent = new THREE.MeshBasicMaterial({ color: 0xffffff }), head = HERO.part.head, rim = HERO.rim;
  root.add(HERO.group); GFX.scene.add(root);
  const on = (m, b, x, y, z) => { m.position.fromArray(HERO.anchor(b, x, y, z)); b.add(m); return m; };
  const F = FORGE, lacq = TOON.mat(0x6a1626, rim), gold = TOON.metal(0xd9a54c, rim, .85, false), iron = TOON.metal(0x1d1b26, rim, .18);
  const ringG = (R, r) => { const g = new THREE.TorusGeometry(R, r, 4, Math.round(R * 60)).toNonIndexed(); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g; };
  /* a jingasa: a shallow lacquered cone in slats, a gold rim, a band of light round the crown, a finial */
  const hat = on(turned(new THREE.Group(), .06), head, 0, 1.84, -.04);
  hat.add(part(F.lathe([[0, .255], [.2, .155], [.42, .04], [.625, -.036], [.652, -.012], [.6, .006], [.42, .07], [.2, .19], [.05, .285], [0, .3]], 22), lacq, 1, 1, 1));
  hat.add(part(ringG(.646, .013), gold, 1, 1, 1, 0, -.014, 0));
  hat.add(part(ringG(.236, .009), accent, 1, 1, 1, 0, .172, 0));
  hat.add(part(F.lathe([[0, .285], [.04, .293], [.034, .325], [.012, .35], [0, .37]], 8), gold, 1, 1, 1));
  for (const e of HERO.eyes) on(turned(part(GEO.box, accent, .1, .03, .02), 0, 0, e[0] > 0 ? .28 : -.28), head, e[0], e[1], e[2] + .012);
  /* armour rides the arm bones, built in each bone's own frame: +Y down the arm, +Z the outside of it */
  const bone = re => HERO.bones[HERO_RIG.index(re)];
  const sode = new THREE.Group(); bone(/^upperarml$/i).add(sode);                              // a lamellar shoulder guard on the off-hand side
  for (let i = 0; i < 3; i++) {
    const y0 = -.07 + i * .068, y1 = y0 + .1, r = .15 + i * .014;
    sode.add(part(F.shell([[r, y0], [r + .03, y1], [r + .046, y1], [r + .016, y0]], -1.95, 1.95, 16), lacq, 1, 1, 1));
    sode.add(part(F.shell([[r + .03, y1 - .014], [r + .033, y1 + .004], [r + .05, y1 + .004], [r + .047, y1 - .014]], -1.97, 1.97, 16), gold, 1, 1, 1));
  }
  sode.add(part(F.shell([[.172, -.02], [.18, .04], [.186, .04], [.178, -.02]], -.1, .1, 2), accent, 1, 1, 1));
  for (const re of [/^lowerarml$/i, /^lowerarmr$/i]) {                                           // kote on both forearms
    const k = new THREE.Group(); bone(re).add(k);
    k.add(part(F.shell([[.112, .07], [.118, .245], [.13, .245], [.124, .07]], -1.45, 1.45, 10), iron, 1, 1, 1));
    for (const y of [.07, .245]) k.add(part(F.shell([[.12, y - .009], [.12, y + .009], [.133, y + .009], [.133, y - .009]], -1.48, 1.48, 10), gold, 1, 1, 1));
    k.add(part(F.shell([[.127, .095], [.132, .22], [.136, .22], [.131, .095]], -.06, .06, 1), accent, 1, 1, 1));
  }
  return {
    root, pos: root.position, models: buildWeaponModels(), accent, yaw: 0, vel: V3(), state: 'idle', st: 0, animT: 0, runT: 0,
    hp: 100, hpMax: 100, en: 60, enMax: 100, wi: 0, combo: 0, comboT: 0, comboW: -1, queued: false, atk: null, seq: null, atkN: 0, dodgeN: 0, hurtN: 0,
    iT: 0, dodgeCd: 0, target: null, spin: 0, dead: false, jump: 0, radius: .5, color: new THREE.Color(1, 1, 1),
    buff: { haste: 0, life: 0, power: 0, fire: 0, ambush: 0, ward: 0, parry: 0 }, wardHp: 0, cds: WEAPONS.map(() => [0, 0, 0, 0]),      // timed boons, and a cooldown for each weapon's four moves
  };
})();

/* what flows: a crimson scarf whose tails burn in the weapon's colour, and a split coat with a lining in it */
const cloth = (() => {
  const P = HERO.part, fog = GFX.scene.fog;
  const scarf = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uBase: { value: col(0x7a1424) }, uGlow: { value: new THREE.Color(1, 1, 1) }, uFogC: { value: fog.color }, uFogD: { value: fog.density } },
    vertexShader: `uniform float uFogD; varying vec2 vUv; varying float vFog;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vFog = 1.0 - exp(-uFogD * uFogD * mv.z * mv.z); }`,
    fragmentShader: `uniform vec3 uBase, uGlow, uFogC; varying vec2 vUv; varying float vFog;
      void main(){
        float v = vUv.y, e = abs(vUv.x * 2.0 - 1.0);
        vec3 c = uBase * (gl_FrontFacing ? 1.0 : 0.62) * (0.8 + 0.2 * step(0.5, fract(v * 7.0)));
        float tip = smoothstep(0.5, 1.0, v), hem = smoothstep(0.78, 0.98, e) * smoothstep(0.08, 0.35, v);
        c = mix(c, uGlow, tip * tip) + uGlow * hem * 0.55;
        gl_FragColor = vec4(mix(c, uFogC, vFog), 1.0); }`,
  });
  const coat = TOON.mat(0x1d1733, HERO.rim, false), lining = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  const body = { x: 0, z: 0, r: .31, top: 1 }, torso = { x: 0, z: 0, r: .34, top: 1.5 };
  const free = [
    makeRibbon({ joint: P.chest, off: HERO.anchor(P.chest, .08, 1.37, -.24), n: 13, seg: .13, w0: .1, w1: .05, grav: 9, drag: 4, wind: 1.5, mats: [scarf] }),
    makeRibbon({ joint: P.chest, off: HERO.anchor(P.chest, -.08, 1.36, -.24), n: 10, seg: .12, w0: .085, w1: .04, grav: 10, drag: 4, wind: 1.7, mats: [scarf] }),
  ];
  const tail = (x, z, side, w0, w1) => makeRibbon({ joint: P.hips, off: HERO.anchor(P.hips, x, .8, z), side: HERO.along(P.hips, side[0], side[1], side[2]), n: 6, seg: .085, w0, w1, grav: 24, drag: 3, wind: .3, mats: [coat, lining], shadow: true });
  const tails = [tail(0, -.27, [-1, 0, 0], .1, .15), tail(.2, -.2, [-.7, 0, -.7], .08, .12), tail(-.2, -.2, [-.7, 0, .7], .08, .12)];
  return {
    update(dt, t) {
      const p = player; p.root.updateMatrixWorld(true);
      body.x = torso.x = p.pos.x; body.z = torso.z = p.pos.z; body.top = p.pos.y + p.jump + .78; torso.top = p.pos.y + p.jump + 1.32;
      for (const r of free) r.update(dt, t, torso); for (const r of tails) r.update(dt, t, body);
      HERO_ARMS.tick(dt, t, p.models[p.wi]);
    },
    tint(c) { scarf.uniforms.uGlow.value.copy(c).multiplyScalar(2.2); lining.color.copy(c).multiplyScalar(.42); },
    reset() { for (const r of free) r.reset(); for (const r of tails) r.reset(); },
  };
})();

/* afterimages: the pose of that instant, frozen into a plain mesh */
const ghosts = (() => {
  const list = [];
  function init() {
    for (let i = 0; i < 7; i++) {
      const g = new THREE.BufferGeometry(), a = new THREE.BufferAttribute(new Float32Array(HERO.nv * 3), 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', a); g.setIndex(HERO.index);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; GFX.scene.add(m); list.push({ m, mat, a, life: 0, max: 1 });
    }
  }
  function spawn(life) {
    let h = list[0]; for (const x of list) if (x.life < h.life) h = x;
    player.root.updateMatrixWorld(true); HERO.freeze(h.a.array); h.a.needsUpdate = true;
    h.m.visible = true; h.life = h.max = life || .32; h.mat.color.copy(player.color).multiplyScalar(1.4);
  }
  function update(dt) { for (const h of list) if (h.life > 0) { h.life -= dt; h.mat.opacity = Math.max(0, h.life / h.max) * .6; if (h.life <= 0) h.m.visible = false; } }
  return { init, spawn, update };
})();

function setWeapon(i, silent) {
  const p = player; if (i === p.wi && !silent) return;
  p.models.forEach((m, k) => { if (m.R) m.R.visible = k === i; if (m.L) m.L.visible = k === i; });
  p.wi = i; const w = WEAPONS[i];
  p.color.copy(w.c); p.accent.color.copy(w.c).multiplyScalar(2.6); HERO.rim.value.copy(w.c).multiplyScalar(1.15); cloth.tint(w.c);
  WORLD.setAccent(w.c, i);
  if (!silent) {
    p.combo = 0; _v2.copy(p.pos); _v2.y = 1;
    FX.ring(p.pos, 2.6, w.c, { life: .35, color2: w.c2, gain: 2.5 }); FX.burst(_v2, { n: 16, color: w.c, speed: 5, life: .4, size: .1, grav: 2 }); FX.flash(_v2, w.c, 2.5, .3);
    sfx.swap(i); HUD.weapon(i, true);
  } else HUD.weapon(i, false);
}

/* ============ the hero's body in each state ============ */
const idleClip = st => st === 'two' ? CLIP.idle2 : st === 'fist' ? CLIP.idleFist : CLIP.idle;
function heroIdle(t) { HERO.loop(idleClip(WEAPONS[player.wi].stance), t, .2); }
/* game time → clip time: show the last of the wind-up, run the swing across its window, then let the recovery play on */
function warp(t, t0, t1, c0, c1, len) {
  const d = c1 >= c0 ? 1 : -1;
  if (t < t0) return clamp(c0 - d * (t0 - t), 0, len);
  if (t < t1) { const k = (t - t0) / (t1 - t0); return lerp(c0, c1, 1 - (1 - k) * (1 - k)); }
  return clamp(c1 + d * (t - t1) * .8, 0, len);
}

const dirFrom = (th, tilt, out) => { const s = Math.sin(th); out.x = s * Math.cos(tilt); out.y = s * Math.sin(tilt); out.z = Math.cos(th); return out; };
const fwdX = yaw => Math.sin(yaw), fwdZ = yaw => Math.cos(yaw);
/* has a sweep (a0 → theta, in a plane tilted about the forward axis) passed over a point? */
function arcHits(ox, oz, yaw, tilt, a0, a1, theta, reach, x, z, rad) {
  const dx = x - ox, dz = z - oz, c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const px = lx * Math.cos(tilt), oy = -lx * Math.sin(tilt), r = Math.hypot(px, lz);
  if (r > reach + rad || Math.abs(oy) > 1.15 + rad) return false;
  if (r < .9 + rad) return true;
  const dir = a1 >= a0 ? 1 : -1; let rel = (Math.atan2(px, lz) - a0) * dir; rel = ((rel % TAU) + TAU) % TAU;
  const pad = .22; return rel <= Math.abs(theta - a0) + pad || rel >= TAU - pad;
}

function pickTarget(dx, dz, range) {
  let best = null, bs = 1e9; const p = player.pos;
  for (const e of enemies) {
    if (e.dead || e.gone || e.state === 'spawn') continue;
    const ex = e.pos.x - p.x, ez = e.pos.z - p.z, d = Math.hypot(ex, ez); if (d > range + e.radius) continue;
    const dot = d > .01 ? (ex * dx + ez * dz) / d : 1, sc = d * (1.7 - dot);
    if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}

function endAttack() { const p = player; if (p.spin) { p.yaw += p.spin; p.spin = 0; } p.atk = null; }
function startAttack(ix, iz, moving) {
  const p = player, w = WEAPONS[p.wi];
  if (p.comboT <= 0 || p.comboW !== p.wi) p.combo = 0;
  const step = w.combo[p.combo], bow = w.stance === 'bow';
  const ax = moving ? ix : fwdX(p.yaw), az = moving ? iz : fwdZ(p.yaw), al = Math.hypot(ax, az) || 1;
  const tg = pickTarget(ax / al, az / al, bow ? 34 : Math.max(8, w.reach + 5.5));
  if (tg) p.yaw = Math.atan2(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z); else if (moving) p.yaw = Math.atan2(ix, iz);
  let travel = step.lunge === undefined ? 2 : step.lunge;
  if (travel > 0) {
    if (tg) { const gap = Math.hypot(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z) - tg.radius - Math.min(w.reach * .55, 1.7); travel = clamp(gap, 0, Math.max(travel, 6.2)); }
    else travel *= moving ? 1 : .45;
  }
  p.atk = { step, t: 0, started: [], done: [], hits: step.arcs ? step.arcs.map(() => new Set()) : [], thr: false, shot: false, slam: false, v: travel / .12, lead: p.combo % 2 ? -1 : 1, tg };
  p.atkN++; p.atk.id = p.atkN; p.target = tg; p.state = 'attack'; p.st = 0; p.spin = 0; p.comboW = p.wi; p.combo = (p.combo + 1) % w.combo.length;
}

const _dR = { x: 0, y: 0, z: 1 }, _dL = { x: 0, y: 0, z: 1 }, _tip = V3(), _from = V3(), _to = V3();

function updateAttack(dt) {
  const p = player, a = p.atk, s = a.step, w = WEAPONS[p.wi], fx = fwdX(p.yaw), fz = fwdZ(p.yaw);
  a.t += dt * (p.buff.haste > 0 ? 1.35 : 1); const t = a.t;
  if (t < .12) { p.vel.x = fx * a.v; p.vel.z = fz * a.v; } else { p.vel.x = damp(p.vel.x, 0, 20, dt); p.vel.z = damp(p.vel.z, 0, 20, dt); }
  const base = w.dmg * (s.m || 1);
  const ho = { kb: s.kb === undefined ? 3.5 : s.kb, launch: s.launch || 0, stop: s.stop === undefined ? .035 : s.stop, shake: s.shake === undefined ? .16 : s.shake, heavy: s.heavy, crit: w.crit };
  if (s.arcs) {
    let lead = 0;
    for (let i = 0; i < s.arcs.length; i++) {
      const ar = s.arcs[i], reach = w.reach * (ar.r || 1);
      if (t >= ar.t0 && !a.started[i]) {
        a.started[i] = true;
        FX.arc({ follow: p.root, y: HERO.arcY, yaw: p.yaw, tilt: ar.tilt, a0: ar.a0, a1: ar.a1, r0: reach * .4, r1: reach, color: w.c, color2: w.c2, sweep: ar.t1 - ar.t0, fade: .26, gain: 3.4 });
        sfx.whoosh(s.w || (w.reach > 3 ? .8 : 1.15));
      }
      if (a.started[i]) lead = i;
      const k = clamp((t - ar.t0) / (ar.t1 - ar.t0), 0, 1), th = lerp(ar.a0, ar.a1, 1 - (1 - k) * (1 - k));
      if (a.started[i] && !a.done[i]) {
        if (k >= 1) a.done[i] = true;
        for (const e of enemies) {
          if (e.dead || a.hits[i].has(e)) continue;
          if (arcHits(p.pos.x, p.pos.z, p.yaw, ar.tilt, ar.a0, ar.a1, th, reach, e.pos.x, e.pos.z, e.radius)) { a.hits[i].add(e); strikeEnemy(e, base * (ar.m || 1), ho); }
        }
        for (const o of orbs) if (o.live && !o.friendly && arcHits(p.pos.x, p.pos.z, p.yaw, ar.tilt, ar.a0, ar.a1, th, reach, o.pos.x, o.pos.z, .6)) deflectOrb(o);
        // glitter off the blade tip
        dirFrom(th, ar.tilt, _dR); const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
        _tip.set(p.pos.x + (_dR.x * c + _dR.z * sn) * reach, Math.max(.1, HERO.arcY + _dR.y * reach), p.pos.z + (-_dR.x * sn + _dR.z * c) * reach);
        FX.burst(_tip, { n: 2, color: w.c, speed: 2.5, life: .35, size: .09, grav: 4, gain: 4 });
      }
    }
    // the body follows whichever cut began last; a whirl holds its pose and turns the whole figure with the trail
    const ar = s.arcs[lead], first = s.arcs[0];
    if (first.spin) { const k = clamp((t - first.t0) / (first.t1 - first.t0), 0, 1); p.spin = (first.a1 - first.a0) * (1 - (1 - k) * (1 - k)); HERO.pose(first.clip, first.hold, .08, a.id); }
    else { p.spin = 0; HERO.pose(ar.clip, warp(t, ar.t0, ar.t1, ar.c0, ar.c1, HERO.clips[ar.clip].dur), .07, a.id + '.' + lead); }
  }
  if (s.thrust) {
    const th = s.thrust, left = th.hand === 'L';
    if (t >= th.t0 && !a.thr) {
      a.thr = true; const side = left ? .25 : -.25, c = Math.cos(p.yaw), sn = Math.sin(p.yaw), big = th.big, y = HERO.arcY + .05;
      _from.set(p.pos.x + side * c + fx * .4, y, p.pos.z - side * sn + fz * .4); _to.set(_from.x + fx * th.len, y, _from.z + fz * th.len);
      FX.streak(_from, _to, big ? 1.5 : .6, w.c, big ? .3 : .16, big ? 5 : 3.5);
      FX.arc({ pos: _to, yaw: p.yaw, pitch: Math.PI / 2, r0: big ? .9 : .35, r1: big ? 2.2 : .9, mode: 1, color: w.c, color2: w.c2, sweep: 0, fade: big ? .4 : .22, grow0: .3, grow1: 1, gain: 3 });
      if (big) { FX.arc({ pos: _from, yaw: p.yaw, pitch: Math.PI / 2, r0: .5, r1: 1.4, mode: 1, color: w.c2, sweep: 0, fade: .3, grow0: .3, grow1: 1.6, gain: 3 }); FX.flash(_to, w.c, 5, .3); sfx.boom(); GFX.post.radial = .8; }
      sfx.whoosh(big ? .6 : 1.5);
      for (const e of enemies.slice()) {
        if (e.dead) continue; const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (lz > -.6 && lz < th.len + .5 + e.radius && Math.abs(lx) < (big ? 1.7 : 1.05) + e.radius) strikeEnemy(e, base, ho);
      }
    }
    const cl = HERO.clips[th.clip], win = cl.sw[left ? 'L' : 'R'];
    HERO.pose(th.clip, warp(t, th.t0, th.t1, win[0], win[1], cl.dur), .06, a.id);
  } else if (s.shot) {
    const sh = s.shot;
    if (t >= sh.t && !a.shot) { a.shot = true; fireArrows(sh, base, ho, a.tg); }
    if (a.shot) HERO.pose(CLIP.shoot, (t - sh.t) * 1.4, .04, a.id); else HERO.pose(CLIP.aim, HERO.clips[CLIP.aim].dur, .08, 'aim');   // draw and hold, then let the recoil play
  }
  if (s.slam && t >= s.slam.t && !a.slam) {
    a.slam = true; _to.set(p.pos.x + fx * w.reach * .7, 0, p.pos.z + fz * w.reach * .7);
    groundSlam(_to, s.slam.r, base * .55, w, { kb: 6, launch: 5, heavy: 1, stop: .05, shake: .5 }, .7);
  }
  if (p.atk !== a) return;
  if (t >= s.cancel && p.queued) { p.queued = false; endAttack(); p.comboT = .5; startAttack(G.ix, G.iz, G.moving); return; }
  if (t >= s.dur) { endAttack(); p.state = 'idle'; p.comboT = .5; }
}

function startDodge(ix, iz, moving) {
  const p = player; if (p.atk) endAttack(); p.seq = null; p.jump = 0;
  let dx, dz; if (moving) { const l = Math.hypot(ix, iz); dx = ix / l; dz = iz / l; p.yaw = Math.atan2(dx, dz); } else { dx = -fwdX(p.yaw); dz = -fwdZ(p.yaw); }
  p.state = 'dodge'; p.st = 0; p.dx = dx; p.dz = dz; p.back = !moving; p.iT = .36; p.dodgeCd = .46; p.perfect = false; p.gT = 0; p.queued = false; p.dodgeN++;
  sfx.dodge(); GFX.post.radialT = .7; _v2.copy(p.pos); _v2.y = .2;
  FX.burst(_v2, { n: 10, color: p.color, speed: 3, life: .4, size: .14, grav: 1, gain: 1.2, flat: .3 });
}

function playerUpdate(dt, time) {
  const p = player, w = WEAPONS[p.wi], st = w.stance;
  p.st += dt; p.animT += dt; p.iT -= dt; p.dodgeCd -= dt; p.comboT -= dt;
  if (p.dead) {
    p.vel.multiplyScalar(Math.exp(-6 * dt)); p.pos.addScaledVector(p.vel, dt);
    HERO.pose(CLIP.death, Math.min(p.st, HERO.clips[CLIP.death].dur), .08, 'dead'); HERO.update(dt); cloth.update(dt, time); return;
  }
  if (input.weaponSet >= 0) setWeapon(input.weaponSet); else if (input.weaponDelta) setWeapon((p.wi + input.weaponDelta + WEAPONS.length) % WEAPONS.length);
  const ix = G.ix, iz = G.iz, moving = G.moving;
  const busy = p.state === 'special' || p.state === 'hurt';
  if (input.dodge && p.dodgeCd <= 0 && !busy) startDodge(ix, iz, moving);
  else if ((input.special || input.skill >= 0) && !busy && p.state !== 'dodge') startSkill(input.special ? 3 : input.skill);
  if (input.attack || input.attackHeld) p.queued = true;
  switch (p.state) {
    case 'idle': case 'run': {
      if (p.queued) { p.queued = false; startAttack(ix, iz, moving); updateAttack(0); break; }
      const sp = p.buff.haste > 0 ? 9.8 : 7.8; p.vel.x = damp(p.vel.x, ix * sp, 13, dt); p.vel.z = damp(p.vel.z, iz * sp, 13, dt);
      if (moving) { p.yaw = dampAngle(p.yaw, Math.atan2(ix, iz), 15, dt); p.state = 'run'; p.runT += dt * 1.45; HERO.loop(CLIP.run, p.runT, .12); }
      else {
        p.state = 'idle'; HERO.loop(idleClip(st), p.animT, .18);
        if (p.target) HERO.lookAt(wrapPi(Math.atan2(p.target.pos.x - p.pos.x, p.target.pos.z - p.pos.z) - p.yaw));   // keep an eye on whoever is closest
      }
      break;
    }
    case 'attack': updateAttack(dt); break;
    case 'dodge': {
      const k = p.st / .28, sp = 27 * (1 - k * .75); p.vel.x = p.dx * sp; p.vel.z = p.dz * sp;
      p.gT -= dt; if (p.gT <= 0) { p.gT = .05; ghosts.spawn(.3); }
      const c = p.back ? CLIP.dodgeB : CLIP.dodgeF; HERO.pose(c, k * HERO.clips[c].dur * .85, .04, p.dodgeN);
      if (p.st >= .28) { p.state = 'idle'; GFX.post.radialT = 0; p.vel.multiplyScalar(.35); }
      break;
    }
    case 'special': updateSpecial(dt); break;
    case 'hurt': p.vel.multiplyScalar(Math.exp(-7 * dt)); HERO.pose(CLIP.hit, p.st * 1.5, .05, 'h' + p.hurtN); if (p.st > .34) p.state = 'idle'; break;
  }
  p.pos.addScaledVector(p.vel, dt);
  const pr = Math.hypot(p.pos.x, p.pos.z); if (pr > ARENA_R) { p.pos.x *= ARENA_R / pr; p.pos.z *= ARENA_R / pr; }
  p.root.rotation.y = p.yaw; HERO.group.rotation.y = p.spin; HERO.group.position.y = p.jump;
  HERO.update(dt);
  p.en = Math.min(p.enMax, p.en + 2.2 * dt);
  cloth.update(dt, time);
}
