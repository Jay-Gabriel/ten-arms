'use strict';
/* ============ math ============ */
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randS = (a = 1) => (Math.random() * 2 - 1) * a;
const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampAngle = (a, b, k, dt) => a + wrapPi(b - a) * (1 - Math.exp(-k * dt));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const col = hex => new THREE.Color(hex).convertSRGBToLinear();
const $ = id => document.getElementById(id);

/* ============ input ============ */
const input = {
  mx: 0, my: 0, tx: 0, ty: 0, camDX: 0, camDY: 0, camKey: 0, camKeyY: 0,
  attack: false, special: false, dodge: false, attackHeld: false,
  weaponDelta: 0, weaponSet: -1, skill: -1, pause: false, mute: false, full: false, lockLost: false,
  keys: {}, locked: false, wantLock: false, touch: false, mouseT: -9,
  consume() { this.attack = this.special = this.dodge = this.pause = this.mute = this.full = false; this.weaponDelta = 0; this.weaponSet = -1; this.skill = -1; this.camDX = this.camDY = 0; }
};
(function () {
  const cv = $('gl'), K = input.keys;
  const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey) return;
    if (e.target && e.target.tagName === 'INPUT') return;        // typing a callsign: these keys belong to the field
    if (block.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    K[e.code] = true;
    const c = e.code;
    if (c === 'KeyJ') input.attack = true;
    else if (c === 'KeyK') input.special = true;
    else if (c === 'Space' || c === 'ShiftLeft' || c === 'KeyL') input.dodge = true;
    else if (c === 'KeyQ' || c === 'KeyU') input.skill = 0;
    else if (c === 'KeyE' || c === 'KeyI') input.skill = 1;
    else if (c === 'KeyR' || c === 'KeyO') input.skill = 2;
    else if (c === 'KeyZ') input.weaponDelta = -1;
    else if (c === 'KeyC') input.weaponDelta = 1;
    else if (c === 'Escape' || c === 'KeyP') input.pause = true;
    else if (c === 'KeyM') input.mute = true;
    else if (c === 'KeyF') input.full = true;
    else if (c.startsWith('Digit')) { const n = +c.slice(5); input.weaponSet = n === 0 ? 9 : n - 1; }
  });
  addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'KeyJ') input.attackHeld = false; });
  addEventListener('blur', () => { for (const k in K) K[k] = false; input.attackHeld = false; });

  cv.addEventListener('mousedown', e => {
    cv.focus();
    if (e.button === 0) { input.attack = true; input.attackHeld = true; }
    if (e.button === 2) input.special = true;
    if (!input.locked && input.wantLock && cv.requestPointerLock) {
      try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
  });
  addEventListener('mouseup', e => { if (e.button === 0) input.attackHeld = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (input.locked || (e.buttons & 2)) { input.camDX += e.movementX || 0; input.camDY += e.movementY || 0; input.mouseT = performance.now(); }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); input.weaponDelta = e.deltaY > 0 ? 1 : -1; }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked; input.locked = document.pointerLockElement === cv;
    if (was && !input.locked && input.wantLock) input.lockLost = true;
  });

  /* touch: left half = stick, right half = camera drag */
  const stick = $('stick'), knob = stick.firstElementChild;
  let sid = null, sx = 0, sy = 0, cid = null, cx = 0, cy = 0;
  cv.addEventListener('touchstart', e => {
    e.preventDefault(); input.touch = true;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * .5 && sid === null) { sid = t.identifier; sx = t.clientX; sy = t.clientY; stick.hidden = false; stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; knob.style.transform = ''; }
      else if (cid === null) { cid = t.identifier; cx = t.clientX; cy = t.clientY; }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const l = Math.hypot(dx, dy), m = 48;
        if (l > m) { dx *= m / l; dy *= m / l; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        input.tx = dx / m; input.ty = -dy / m;
      } else if (t.identifier === cid) { input.camDX += (t.clientX - cx) * 1.6; input.camDY += (t.clientY - cy) * 1.2; cx = t.clientX; cy = t.clientY; input.mouseT = performance.now(); }
    }
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; input.tx = input.ty = 0; stick.hidden = true; } if (t.identifier === cid) cid = null; } };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
  const tb = (id, down, up) => {
    const b = $(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); input.touch = true; down(); }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); });
    b.addEventListener('mousedown', down); b.addEventListener('mouseup', () => { if (up) up(); });
  };
  tb('tA', () => { input.attack = true; input.attackHeld = true; }, () => { input.attackHeld = false; });
  tb('tD', () => { input.dodge = true; });
  tb('tS', () => { input.special = true; });
  ['tS1', 'tS2', 'tS3'].forEach((id, i) => tb(id, () => { input.skill = i; }));
  tb('tP', () => { input.weaponDelta = -1; });
  tb('tN', () => { input.weaponDelta = 1; });
  input.poll = function () {
    let x = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), y = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0);
    x += input.tx; y += input.ty;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    input.mx = x; input.my = y;
    input.camKey = (K.ArrowRight ? 1 : 0) - (K.ArrowLeft ? 1 : 0);
    input.camKeyY = (K.ArrowDown ? 1 : 0) - (K.ArrowUp ? 1 : 0);
    if (K.KeyJ) input.attackHeld = true;
  };
})();

/* ============ audio: CC0 music (js/music-data.js) and samples (js/sfx-data.js) ============ */
// The music is a recorded loop, muffled between waves and opened up in a fight. Without music-data.js
// the old synthesised score plays instead. Each effect plays a recorded sample when one has decoded,
// and falls back to its synth version otherwise (first fraction of a second, or if sfx-data.js is missing).
// The forest wind stays synthesised.
const sfx = (() => {
  let ctx = null, master = null, nbuf = null, muted = false, music = null, duck = null;
  let step = 0, nextT = 0, heat = 0, voiceEnd = 0;
  let synthScore = true, trackLp = null, trackGain = null, open = 0, openK = -1;
  const scale = [146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392];   // D minor pentatonic
  const bank = {}, lastPick = {}, live = {};
  function loadBank() {
    const D = typeof SFX_DATA === 'object' ? SFX_DATA : null; if (!D) return;
    for (const k in D) {
      const list = bank[k] = [];
      for (const b64 of D[k]) {
        try {
          const bin = atob(b64), u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          const p = ctx.decodeAudioData(u.buffer, b => { if (b) list.push(b); }, () => {});   // callback form for older Safari
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
      }
    }
  }
  // music-data.js holds [end of loop | loop | start of loop]; looping pre..pre+len is seamless however much
  // silence the browser's MP3 decoder leaves at the front (see tools/build-music.js)
  function loadTrack() {
    const M = typeof MUSIC_DATA === 'object' ? MUSIC_DATA : null; if (!M) return;
    synthScore = false;
    trackLp = ctx.createBiquadFilter(); trackLp.type = 'lowpass'; trackLp.frequency.value = 450; trackLp.Q.value = .5;
    trackGain = ctx.createGain(); trackGain.gain.value = 0;
    trackLp.connect(trackGain); trackGain.connect(music);
    const fail = () => { synthScore = true; nextT = ctx.currentTime + .05; };
    try {
      const bin = atob(M.src), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const p = ctx.decodeAudioData(u.buffer, b => {
        if (!b) return fail();
        const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = M.pre; s.loopEnd = M.pre + M.len;
        s.connect(trackLp); s.start(ctx.currentTime + .05, M.pre);
      }, fail);
      if (p && p.catch) p.catch(() => {});
    } catch (_) { fail(); }
  }
  // returns false only when no sample is ready, so the caller can fall back to synthesis
  function play(k, g, o = {}) {
    const list = bank[k]; if (!ctx || !list || !list.length) return false;
    if ((live[k] || 0) >= (o.cap || 4)) return true;
    let i = (Math.random() * list.length) | 0; if (list.length > 1 && i === lastPick[k]) i = (i + 1) % list.length; lastPick[k] = i;
    const s = ctx.createBufferSource(), a = ctx.createGain();
    s.buffer = list[i]; s.playbackRate.value = (o.rate || 1) * (1 + randS(o.vary === undefined ? .05 : o.vary));
    a.gain.value = g; s.connect(a); a.connect(o.out || master);
    live[k] = (live[k] || 0) + 1; s.onended = () => { live[k]--; };
    s.start(ctx.currentTime + (o.delay || 0)); return true;
  }
  // announcer lines never overlap each other
  function say(k, g, delay = 0) {
    const list = bank[k]; if (!ctx || !list || !list.length) return;
    const t = ctx.currentTime + delay; if (t < voiceEnd) return;
    voiceEnd = t + list[0].duration; play(k, g, { delay, vary: 0, cap: 1 });
    duck.gain.setTargetAtTime(.45, Math.max(ctx.currentTime, t - .05), .04); duck.gain.setTargetAtTime(1, voiceEnd, .3);   // music steps back for the announcer
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC(); } catch (_) { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : .6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    duck = ctx.createGain(); duck.connect(master);
    music = ctx.createGain(); music.gain.value = .5; music.connect(duck);
    // forest bed: slow filtered wind
    const w = ctx.createBufferSource(); w.buffer = nbuf; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    const wg = ctx.createGain(); wg.gain.value = .05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .11; const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    w.connect(wf); wf.connect(wg); wg.connect(music); w.start();
    nextT = ctx.currentTime + .1;
    loadTrack(); loadBank();
  }
  function noise(dur, f0, f1, g, o = {}) {
    if (!ctx) return; const t = ctx.currentTime + (o.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = nbuf;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const a = ctx.createGain(); a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + .012); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(a); a.connect(o.out || master); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  function tone(type, f0, f1, dur, g, o = {}) {
    if (!ctx) return; const t = (o.at !== undefined ? o.at : ctx.currentTime) + (o.delay || 0);
    const os = ctx.createOscillator(); os.type = type;
    os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const a = ctx.createGain(); a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + .006); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
    os.connect(a); a.connect(o.out || master); os.start(t); os.stop(t + dur + .05);
  }
  function schedule(i, t) {
    const hot = heat > .25, o = { at: t, out: music };
    if (i % 8 === 0) tone('sine', 73.4, 72, 1.5, .1, o);                                          // drone
    if (hot) {
      if (i % 16 === 0 || i % 16 === 6 || i % 16 === 10) tone('sine', 130, 42, .26, .55, o);     // taiko
      if (i % 16 === 4 || i % 16 === 12) tone('triangle', 210, 90, .12, .2, o);
      if (i % 2 === 1 && heat > .6) tone('square', 2400, 1800, .03, .012, o);
      if (i % 16 === 14 && heat > .6) tone('sine', 98, 50, .2, .4, o);
    }
    if (Math.random() < (hot ? .34 : .16)) {                                                      // plucked string
      const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < .3 ? 2 : 1);
      tone('triangle', f, f * .995, .7, .06, o); tone('sine', f * 2, f * 2, .3, .02, o);
    }
  }
  return {
    init,
    tick(target, dt) {
      if (!ctx) return; heat = damp(heat, target, 1.2, dt);
      if (!synthScore) {
        // any fight (target >= .35) opens the track fully within about a second; between waves, paused or game over
        // it sits muffled and lower
        open = damp(open, clamp(target / .35, 0, 1), 2.5, dt);
        const k = Math.round(open * 100) / 100; if (k === openK) return; openK = k;
        const t = ctx.currentTime;
        trackLp.frequency.setTargetAtTime(450 * Math.pow(44, k), t, .08);   // 450 Hz -> ~20 kHz
        trackGain.gain.setTargetAtTime(.55 + .45 * k, t, .4);
        return;
      }
      const spb = 60 / 108 / 4; let guard = 0;
      if (nextT < ctx.currentTime - .5) nextT = ctx.currentTime + .05;
      while (nextT < ctx.currentTime + .12 && guard++ < 8) { schedule(step++ % 32, nextT); nextT += spb; }
    },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : .6; return muted; },
    // w < 1 is a heavy, slow swing (lower pitch); w > 1 a quick one
    whoosh(w = 1) { if (!play('swing', .5, { rate: .7 + .3 * w, vary: .06, cap: 3 })) noise(.16 + .08 / w, 500 * w, 2600 * w, .2, { q: 1.6 }); },
    hit(heavy) {
      tone('sine', heavy ? 150 : 190, 50, heavy ? .22 : .11, heavy ? .7 : .4);                          // body thump
      if (play(heavy ? 'hitH' : 'hitL', heavy ? .75 : .55, { vary: .08 })) return;
      noise(.09, 3000, 700, .3, { type: 'highpass', q: .7 }); tone('triangle', 880 + rand(200), 600, .07, .09);
    },
    kill() {
      tone('sawtooth', 320, 40, .32, .08);                                                                  // power-down whine
      if (!play('kill', .7, { cap: 3 })) { noise(.35, 1800, 120, .4, { type: 'lowpass' }); tone('triangle', 1320, 220, .25, .1); }
    },
    boom() { if (play('boom', .85, { cap: 3 })) tone('sine', 110, 28, .7, .4); else { noise(.7, 900, 60, .7, { type: 'lowpass', q: .5 }); tone('sine', 110, 28, .7, .9); } },
    special() { play('special', .65, { cap: 1 }); noise(.5, 300, 5000, .2, { q: 3 }); tone('sawtooth', 110, 440, .34, .1); tone('sine', 660, 1320, .3, .08, { delay: .05 }); },
    dodge() { if (!play('dodge', .5, { cap: 2 })) noise(.22, 1800, 400, .2, { q: .8 }); },
    perfect() { play('perfect', .45, { rate: .85, vary: 0, cap: 1 }); tone('sine', 880, 1760, .5, .2); tone('sine', 1320, 2640, .6, .1, { delay: .06 }); },
    swap(i) { const f = scale[i % scale.length] * 2, s = play('swap', .6, { cap: 2 }) ? .5 : 1; tone('triangle', f, f, .16, .16 * s); tone('sine', f * 1.5, f * 1.5, .22, .08 * s, { delay: .05 }); },
    clang() { tone('square', 1500, 950, .07, .1); tone('triangle', 2300, 1900, .14, .1); noise(.06, 5200, 2200, .16, { type: 'highpass' }); },
    hurt() { if (play('hurt', .8, { cap: 2 })) tone('sawtooth', 160, 50, .3, .15); else { tone('sawtooth', 160, 50, .3, .35); noise(.2, 500, 100, .4, { type: 'lowpass' }); } },
    shot() { if (!play('shot', .35, { cap: 3 })) tone('square', 700, 180, .16, .07); },
    twang() { if (!play('twang', .4, { vary: .08, cap: 3 })) { tone('triangle', 420, 180, .12, .2); noise(.12, 3000, 1200, .12, { q: 2 }); } },
    warn() { tone('square', 520, 520, .08, .05); },
    wave(boss) {
      tone('sine', 98, 96, 1.8, .4); tone('sine', 147, 146, 1.6, .2); tone('triangle', 294, 290, 1.2, .08); noise(.6, 200, 3000, .08, { q: 2 });
      if (boss) { play('sting', .7, { vary: 0, cap: 1 }); say('vBoss', .9, .45); } else say('vFight', .9, .3);
    },
    clear() { if (!play('clear', .55, { vary: 0, cap: 1 })) this.ui(); },
    ui() { if (!play('ui', .4, { vary: 0, cap: 1 })) tone('triangle', 660, 990, .09, .12); },
    die() { tone('sawtooth', 220, 30, 1.4, .4); noise(1.2, 800, 60, .4, { type: 'lowpass' }); say('vOver', .9, .9); },
  };
})();
