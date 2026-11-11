'use strict';
/* ============ game state ============ */
const _c1 = V3(), _pr = V3();
const project = (x, y, z) => _pr.set(x, y, z).project(GFX.camera);
const CAM = { yaw: Math.PI * .82, pitch: .06, dist: 5.4, tgt: V3(0, 1.4, 0), trauma: 0, kick: 0, fov: 58, side: 0 };
const G = {
  state: 'title', paused: false, time: 0, real: 0, ts: 1, slowT: 0, slowS: 1, stop: 0, focusT: 0, wave: 0, score: 0, best: 0, kills: 0,
  combo: 0, comboT: 0, comboMax: 0, comboW: new Set(), used: [], runT: 0, ix: 0, iz: 0, moving: false, phase: 'rest', phaseT: 0, queue: [], spawnT: 0, afters: [], deathT: 0, lockLost: -9, camSnap: false, hitSnd: 0,
  shake(a) { CAM.trauma = Math.min(1.25, CAM.trauma + a); },
  kick(d) { CAM.kick += d; },
  slow(s, dur) { G.slowS = s; G.slowT = dur; },
  after(t, f) { G.afters.push({ t, f }); },
  addHit(dmg) {
    G.combo++; G.comboT = 3.2; G.comboW.add(player.wi); G.used[player.wi] = (G.used[player.wi] || 0) + 1; if (G.combo > G.comboMax) G.comboMax = G.combo;
    G.score += Math.round(dmg * (1 + Math.min(G.combo, 100) / 25) * G.comboW.size); HUD.combo();
  },
  breakCombo() { if (!G.combo) return; G.combo = 0; G.comboW.clear(); HUD.combo(); },
  onKill(e) {
    G.kills++; G.score += e.def.score * Math.max(1, G.comboW.size);
    const left = enemies.filter(x => !x.dead).length + G.queue.length;
    if (left === 0 || e.def.boss) { G.slow(.16, .75); G.kick(-7); GFX.post.aberr = 1; GFX.post.flash = Math.max(GFX.post.flash, .18); }
  },
  perfectDodge() {
    G.slow(.22, 1.1); G.focusT = 1.1; player.en = Math.min(player.enMax, player.en + 28); player.iT = Math.max(player.iT, .9);
    _c1.set(player.pos.x, 2.3, player.pos.z); HUD.num(_c1, 'PERFECT DODGE', 'note'); sfx.perfect(); GFX.post.aberr = 1;
  },
  onDeath() { G.slow(.2, 1.3); G.deathT = 1.6; sfx.die(); HUD.caption('DOWN', 3); G.kick(-8); },
};

/* ============ combat glue ============ */
function strikeEnemy(e, dmg, ho) {
  const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
  return hitEnemy(e, dmg, ho, dx / l, dz / l);
}
function hitEnemy(e, dmg, ho, dx, dz) {
  if (e.dead || e.gone || e.state === 'spawn') return false;
  if (e.guard > 0 && !ho.blast && (e.state === 'chase' || e.state === 'windup') && dx * fwdX(e.yaw) + dz * fwdZ(e.yaw) < -.2) return blockHit(e, ho, dx, dz);
  const w = WEAPONS[player.wi], heavy = !!ho.heavy, s = e.def.scale, B = player.buff;
  let crit = Math.random() < (ho.crit === undefined ? .12 : ho.crit); if (B.ambush > 0 && !ho.soft) { crit = true; dmg *= 1.7; B.ambush = 0; } if (crit) dmg *= 1.8;
  if (B.power > 0) dmg *= 1.4;
  dmg = Math.max(1, Math.round(dmg * rand(.92, 1.08))); e.hp -= dmg; e.flash = .09;
  if (B.life > 0) player.hp = Math.min(player.hpMax, player.hp + dmg * .12);
  if (!ho.soft && (!e.def.armor || (heavy && !e.def.boss))) {
    setState(e, 'stagger'); e.stagT = ho.stun || (heavy ? .6 : .38);
    const kb = (ho.kb === undefined ? 3.5 : ho.kb) / (e.def.armor ? 2.2 : 1);
    if (ho.pull) { e.vx = -dx * ho.pull; e.vz = -dz * ho.pull; } else { e.vx = dx * kb; e.vz = dz * kb; }
    if (ho.launch) e.vy = ho.launch / (e.def.armor ? 1.6 : 1);
  }
  _c1.set(e.pos.x, e.y + 1.15 * s, e.pos.z);
  FX.burst(_c1, { n: heavy ? 22 : 9, color: w.c, speed: heavy ? 12 : 8, life: .4, size: .11, gain: 4, dir: { x: dx, y: .3, z: dz }, bias: .6 });
  FX.burst(_c1, { n: 3, color: e.eye, speed: 5, life: .5, size: .1 });
  FX.flash(_c1, w.c, heavy ? 5 : 2.4, .18);
  _c1.y = e.y + 1.9 * s; HUD.num(_c1, dmg, crit ? 'crit' : '');
  if (G.real - G.hitSnd > .035) { G.hitSnd = G.real; sfx.hit(heavy); }
  G.stop = Math.max(G.stop, ho.stop === undefined ? .03 : ho.stop); G.shake(ho.shake === undefined ? .15 : ho.shake);
  if (heavy) GFX.post.aberr = Math.max(GFX.post.aberr, .7);
  G.addHit(dmg); if (!ho.noEn) player.en = Math.min(player.enMax, player.en + 3.2);
  if (B.fire > 0 && !ho.noEn) { FX.ring(e.pos, 2.4, BUFFS.fire[2], { life: .3, gain: 2.5 }); aoe(e.pos.x, e.pos.z, 2.4, dmg * .45, { kb: 2, stop: 0, shake: .05, noEn: 1, crit: 0 }); }   // inner fire: each blow of your own sets off a small blast
  if (e.hp <= 0) { if (e.def.boom) lobBomb(e, dx, dz); else killEnemy(e, dx, dz); }
  return true;
}
function aoe(x, z, r, dmg, ho) {
  let n = 0;
  for (const e of enemies.slice()) {
    if (e.dead) continue; const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz);
    if (d < r + e.radius) { const k = d > .01 ? 1 / d : 0; if (hitEnemy(e, dmg, ho, ho.fx === undefined ? dx * k : ho.fx, ho.fz === undefined ? dz * k : ho.fz)) n++; }
  }
  return n;
}
function groundSlam(pos, r, dmg, w, ho, k) {
  const c = pos.clone();
  FX.ring(c, r, w.c, { color2: w.c2, life: .5, gain: 2.5 }); FX.ring(c, r * .6, w.c2, { life: .35, gain: 1.8 });
  FX.arc({ pos: c, y: .06, r0: .2, r1: r * 1.05, mode: 2, color: w.c, sweep: 0, hold: 1.1, fade: .9, gain: 2.6 });
  c.y = .3; FX.burst(c, { n: Math.round(36 * k), color: w.c, speed: 10, up: 6, life: .7, size: .14, gain: 3.5, r: .5 });
  FX.chunks({ x: c.x, y: -.2, z: c.z }, Math.round(10 * k), ROCKS, 6);
  FX.flash(c, w.c, 4.5 * k, .4); WORLD.shock(c.x, c.z, 1); sfx.boom(); G.shake(.4 + .4 * k);
  aoe(c.x, c.z, r, dmg, ho);
}

/* ============ waves ============ */
const TIPS = { 1: 'DEFEAT THE DEAD IN THE FOREST', 2: 'FULL ENERGY? UNLEASH YOUR ULTIMATE', 3: 'A SHIELD STOPS THE FRONT: GO AROUND OR HIT HARD', 4: 'KNOCK POWDER BONES INTO THE OTHERS', 6: 'A STALKER BLINKS BEHIND YOU: DODGE ON THE FLASH', 7: 'THE PRIEST HEALS THEM: CUT HIM DOWN FIRST', 8: 'SLASH A BOLT TO SEND IT BACK' };
/* each kind joins at its own wave and is capped, so no wave is all of one thing: [first wave, most at once, weight] */
const ROSTER = { grunt: [1, 99, 5], mage: [2, 4, 3], shield: [3, 3, 2.5], brute: [3, 3, 1.3], bomber: [4, 3, 2], stalker: [6, 3, 2], healer: [7, 2, 1], sniper: [8, 2, 1.4] };
function waveSpec(n) {
  const out = [], open = Object.keys(ROSTER).filter(t => ROSTER[t][0] <= n), count = t => out.filter(x => x === t).length;
  if (n % 5 === 0) { out.push('boss'); for (let i = 0; i < 2 + n / 5; i++) out.push(open[(Math.random() * open.length) | 0]); return out; }
  const total = Math.min(3 + Math.floor(n * 1.4), 15);
  for (const t of open) if (ROSTER[t][0] === n && t !== 'grunt') { out.push(t); if (t !== 'healer' && t !== 'brute') out.push(t); }        // the newcomer always shows up
  let guard = 0;
  while (out.length < total && guard++ < 200) {
    let sum = 0; const ok = open.filter(t => count(t) < Math.min(ROSTER[t][1], 1 + Math.floor((n - ROSTER[t][0]) / 2) + (t === 'grunt' ? 99 : 0))); for (const t of ok) sum += ROSTER[t][2];
    let r = Math.random() * sum, pick = 'grunt'; for (const t of ok) { r -= ROSTER[t][2]; if (r <= 0) { pick = t; break; } }
    out.push(pick);
  }
  for (let i = out.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function startWave(n) {
  G.wave = n; G.phase = 'fight'; G.queue = waveSpec(n); G.spawnT = .7; const boss = n % 5 === 0;
  HUD.banner(boss ? 'BONE KING' : 'WAVE ' + n, boss ? 'Boss of wave ' + n : G.queue.length + ' enemies', boss); sfx.wave();
  HUD.caption(boss ? 'THE BONE KING RISES' : TIPS[n] || '', 4);
}
function wavesUpdate(dt) {
  if (player.dead) return;
  if (G.phase === 'rest') { G.phaseT -= dt; if (G.phaseT <= 0) startWave(G.wave + 1); return; }
  G.spawnT -= dt; const cap = GFX.Q.mobile ? 8 : 12;
  if (G.queue.length && G.spawnT <= 0 && enemies.length < cap) {
    const type = G.queue.shift(); let x = 0, z = 0;
    for (let i = 0; i < 12; i++) { const a = rand(TAU), r = rand(11, 19); x = Math.sin(a) * r; z = Math.cos(a) * r; if (Math.hypot(x - player.pos.x, z - player.pos.z) > (type === 'boss' ? 12 : 8)) break; }
    const elite = G.wave >= 6 && type !== 'boss' && type !== 'bomber' && type !== 'healer' && Math.random() < Math.min(.3, .08 + (G.wave - 6) * .03);
    spawnEnemy(type, x, z, G.wave, elite); G.spawnT = type === 'boss' ? 1.2 : .38;
  }
  if (!G.queue.length && enemies.length === 0) {
    G.phase = 'rest'; G.phaseT = 3.4; const p = player; p.hp = Math.min(p.hpMax, p.hp + 22); p.en = Math.min(p.enMax, p.en + 30);
    G.score += 250 * G.wave; HUD.banner('FIELD CLEARED', 'Restored 22 vitality · +' + 250 * G.wave + ' points'); sfx.clear();
    _c1.set(p.pos.x, 1, p.pos.z); FX.burst(_c1, { n: 30, color: col(0x7dffb0), speed: 3, up: 5, life: .9, size: .12, grav: -1, r: .8 });
  }
}

/* ============ camera ============ */
function camUpdate(rdt, time) {
  const cam = GFX.camera, p = player, play = G.state === 'play', title = G.state === 'title';
  let want = 5.4;
  if (title) { CAM.yaw += .1 * rdt; CAM.pitch = damp(CAM.pitch, .06, 3, rdt); }
  else {
    if (!G.paused) {
      if (input.camDX || input.camDY || input.camKey) G.camSnap = false;
      CAM.yaw -= input.camDX * .0031 + input.camKey * 2.3 * rdt; CAM.pitch = clamp(CAM.pitch + input.camDY * .0024 + input.camKeyY * 1.2 * rdt, -.08, 1.2);
      if (G.camSnap) { CAM.yaw = dampAngle(CAM.yaw, p.yaw, 3.5, rdt); CAM.pitch = damp(CAM.pitch, .33, 3.5, rdt); if (Math.abs(wrapPi(CAM.yaw - p.yaw)) < .04) G.camSnap = false; }
      else if (play && performance.now() - input.mouseT > 1400) {
        if (G.moving) CAM.yaw -= input.mx * 1.15 * rdt;
        let tg = null, bd = 1e9; for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; tg = e; } }
        if (tg && bd > 1.5) { const d = wrapPi(Math.atan2(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z) - CAM.yaw); if (Math.abs(d) > .55) CAM.yaw += d * (1 - Math.exp(-1.5 * rdt)); }
      }
    }
    want = 7.6 + (p.state === 'special' ? 1.6 : 0) + Math.min(enemies.length, 8) * .12;
    if (G.state === 'over') { CAM.yaw += .15 * rdt; want = 6; }
  }
  CAM.dist = damp(CAM.dist, want, 4, rdt);
  _c1.set(p.pos.x + p.vel.x * .1, 1.5 + p.jump * .5, p.pos.z + p.vel.z * .1); CAM.tgt.lerp(_c1, 1 - Math.exp(-(play ? 11 : 4) * rdt));
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw), cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch), rx = -fz, rz = fx;
  CAM.side = damp(CAM.side, title && cam.aspect > 1.1 ? -2.7 : 0, 3, rdt);
  CAM.trauma = Math.max(0, CAM.trauma - rdt * 1.9); const tr = CAM.trauma * CAM.trauma, t = time * 38;
  const sx = (Math.sin(t * 1.3) + Math.sin(t * 2.9 + 1)) * .25 * tr, sy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.3)) * .25 * tr;
  let cd = CAM.dist; if (!title) for (let i = 0; i < 8 && cd > 2.6 && Math.hypot(CAM.tgt.x - fx * cp * cd, CAM.tgt.z - fz * cp * cd) > ARENA_R + 4; i++) cd *= .88;
  cam.position.set(CAM.tgt.x - fx * cp * cd + rx * (CAM.side + sx), Math.max(.35, CAM.tgt.y + sp * cd + sy), CAM.tgt.z - fz * cp * cd + rz * (CAM.side + sx));
  _c1.set(CAM.tgt.x + rx * CAM.side, CAM.tgt.y + (title ? (cam.aspect < 1 ? -1.5 : -.2) : .25), CAM.tgt.z + rz * CAM.side); cam.lookAt(_c1);
  cam.rotation.z += Math.sin(t * 2.1) * tr * .03;
  CAM.kick = damp(CAM.kick, 0, 5, rdt);
  const portrait = cam.aspect < 1 ? lerp(1.34, 1, clamp(cam.aspect, .5, 1) * 2 - 1) : 1;
  CAM.fov = damp(CAM.fov, (58 + CAM.kick + (p.state === 'dodge' ? 5 : 0) - (1 - G.ts) * 6) * portrait, 8, rdt);
  cam.fov = CAM.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}

/* ============ HUD ============ */
const HUD = (() => {
  const el = { hp: $('hpBar'), hpG: $('hpGhost'), en: $('enBar'), enW: $('enWrap'), vit: $('vitals'), score: $('score'), best: $('best'), wave: $('wave'), left: $('left'), combo: $('combo'), rank: $('rank'), hits: $('hits'), mult: $('mult'), cap: $('caption'), wname: $('wname'), slots: $('slots'), tags: $('tags'), nums: $('nums'), banner: $('banner'), boss: $('boss'), bossName: $('bossName'), bossBar: $('bossBar') };
  let capFull = '', capN = 0, capT = 0, capHold = 0, lastScore = -1, lastLeft = '', lastWave = -1, lastBest = -1, numCount = 0, lastNo = -9, lastPop = 0, boss = null, hpK = -1, enK = -1;
  const pool = [];
  el.nums.addEventListener('animationend', e => { e.target.remove(); pool.push(e.target); numCount--; });
  function init() {
    el.slots.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.id = 'slot' + i; b.style.setProperty('--c', w.css); b.title = w.name + ' · ' + w.sp; b.setAttribute('aria-label', w.name);
      b.innerHTML = `<kbd>${(i + 1) % 10}</kbd><svg viewBox="0 0 24 24"${w.iw ? ` style="stroke-width:${w.iw}"` : ''}><path d="${w.icon}"/></svg>`;
      b.addEventListener('click', () => { input.weaponSet = i; $('gl').focus(); }); el.slots.appendChild(b);
    });
  }
  function weapon(i, announce) {
    const w = WEAPONS[i]; [...el.slots.children].forEach((b, k) => b.classList.toggle('on', k === i));
    document.documentElement.style.setProperty('--w', w.css); el.wname.innerHTML = `${w.name}<em>${w.sp}</em>`;
    if (announce) caption(w.name.toUpperCase(), 1.6);
  }
  function caption(text, hold) { if (!text) return; capFull = text; capN = 0; capT = 0; capHold = hold || 3; el.cap.textContent = ''; el.cap.style.opacity = 1; }
  function banner(title, sub, isBoss) { const b = el.banner; b.firstElementChild.textContent = title; b.lastElementChild.textContent = sub || ''; b.classList.toggle('boss', !!isBoss); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  function addTag(e) {
    const d = document.createElement('div'); d.className = 'tag'; d.style.opacity = 0;
    d.innerHTML = `<i class="lock"></i><b>${e.def.name}</b><span class="lv">${e.lvl}</span><div class="bar"><i></i></div>`;
    el.tags.appendChild(d); e.tag = d; e.tagBar = d.querySelector('.bar i'); e.tagHp = -1; e.tagT = false;
    if (e.def.boss) { boss = e; el.boss.hidden = false; el.bossName.textContent = e.def.name.toUpperCase(); }
  }
  function removeTag(e) { if (e.tag) { e.tag.remove(); e.tag = null; } if (boss === e) { boss = null; el.boss.hidden = true; } }
  function num(pos, text, cls) {
    if (numCount > 34) return; const s = project(pos.x, pos.y, pos.z); if (s.z > 1) return;
    const d = pool.pop() || document.createElement('span'); d.className = 'num ' + (cls || ''); d.textContent = text;
    d.style.transform = `translate3d(${((s.x * .5 + .5) * GFX.W + randS(16)).toFixed(0)}px,${((-s.y * .5 + .5) * GFX.H + randS(8)).toFixed(0)}px,0) translate(-50%,-50%)`;
    el.nums.appendChild(d); numCount++;
  }
  function combo() {
    const n = G.combo; if (n < 2) { el.combo.classList.remove('on'); return; }
    el.combo.classList.add('on'); el.hits.textContent = n; el.rank.textContent = n >= 60 ? 'S' : n >= 40 ? 'A' : n >= 25 ? 'B' : n >= 12 ? 'C' : n >= 5 ? 'D' : '';
    const k = G.comboW.size; el.mult.textContent = k > 1 ? '×' + k + ' WEAPONS' : '';
    if (G.real - lastPop > .09) { lastPop = G.real; el.combo.classList.remove('pop'); void el.combo.offsetWidth; el.combo.classList.add('pop'); }
  }
  function noEnergy() { if (G.real - lastNo < .8) return; lastNo = G.real; _c1.set(player.pos.x, 2.3, player.pos.z); num(_c1, 'NOT ENOUGH ENERGY', 'note'); }
  function clear() { el.tags.textContent = ''; el.nums.textContent = ''; numCount = 0; boss = null; el.boss.hidden = true; el.combo.classList.remove('on'); }
  function update(rdt) {
    const p = player, hk = Math.max(0, p.hp / p.hpMax), ek = p.en / p.enMax;
    if (hk !== hpK) { hpK = hk; el.hp.style.transform = el.hpG.style.transform = `scaleX(${hk.toFixed(3)})`; el.vit.classList.toggle('low', hk < .3 && hk > 0); }
    if (Math.abs(ek - enK) > .004) { enK = ek; el.en.style.transform = `scaleX(${ek.toFixed(3)})`; el.enW.classList.toggle('ready', p.en >= SPECIAL_COST); }
    if (G.score !== lastScore) { lastScore = G.score; el.score.textContent = G.score.toLocaleString('en-US'); BOARD.live(); }
    const best = Math.max(G.best, G.score); if (best !== lastBest) { lastBest = best; el.best.textContent = best.toLocaleString('en-US'); }
    if (G.wave !== lastWave) { lastWave = G.wave; el.wave.textContent = 'WAVE ' + Math.max(1, G.wave); }
    const left = G.phase === 'rest' ? (G.wave ? 'GET READY' : '') : (enemies.length + G.queue.length) + ' ENEMIES'; if (left !== lastLeft) { lastLeft = left; el.left.textContent = left; }
    if (boss) el.bossBar.style.transform = `scaleX(${Math.max(0, boss.hp / boss.hpMax).toFixed(3)})`;
    if (capN < capFull.length) { capT += rdt * 30; const n = Math.min(capFull.length, capT | 0); if (n !== capN) { capN = n; el.cap.textContent = capFull.slice(0, n); } }
    else if (capHold > 0) { capHold -= rdt; if (capHold <= 0) el.cap.style.opacity = 0; }
    for (const e of enemies) {
      if (!e.tag) continue; const s = project(e.pos.x, e.y + 2.15 * e.def.scale + .2, e.pos.z);
      if (e.state === 'spawn' || e.gone) { e.tag.style.opacity = 0; continue; }
      let x = s.x, y = s.y, off = s.z > 1; if (off) { x = -x; y = -y; }
      if (off || Math.abs(x) > .95 || y > .82 || y < -.7) { off = true; const m = Math.max(Math.abs(x) / .93, y > 0 ? y / .8 : -y / .68, .001); x /= m; y /= m; }
      if (off !== e.tagOff) { e.tagOff = off; e.tag.classList.toggle('off', off); }
      e.tag.style.opacity = 1; e.tag.style.transform = `translate3d(${((x * .5 + .5) * GFX.W).toFixed(1)}px,${((-y * .5 + .5) * GFX.H).toFixed(1)}px,0) translateY(${off ? -50 : -100}%)`;
      if (e.hp !== e.tagHp) { e.tagHp = e.hp; e.tagBar.style.transform = `scaleX(${Math.max(0, e.hp / e.hpMax).toFixed(3)})`; }
      const tg = e === p.target; if (tg !== e.tagT) { e.tagT = tg; e.tag.classList.toggle('target', tg); }
    }
  }
  return { init, weapon, caption, banner, addTag, removeTag, num, combo, noEnergy, clear, update };
})();

/* ============ flow ============ */
function lockPointer() { const cv = GFX.canvas; if (!input.wantLock || !cv.requestPointerLock) return; try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
function startGame() {
  sfx.init(); sfx.ui();
  for (const e of enemies) { GFX.scene.remove(e.root); e.body.dispose(); e.mats.forEach(m => m.dispose()); dropAim(e); }
  enemies.length = 0; meleeTokens = 0; clearShots(); clearFields(); G.afters.length = 0; HUD.clear();
  const p = player; p.hp = p.hpMax; p.en = 60; p.dead = false; p.pos.set(0, 0, 0); p.vel.set(0, 0, 0); p.yaw = 0; p.state = 'idle'; p.atk = null; p.seq = null; p.spin = 0; p.jump = 0; p.iT = 1; p.combo = 0; p.queued = false; p.target = null;
  HERO.group.rotation.set(0, 0, 0); HERO.group.position.set(0, 0, 0); cloth.reset(); for (const k in p.buff) p.buff[k] = 0; p.wardHp = 0; for (const c of p.cds) c.fill(0);
  Object.assign(G, { state: 'play', paused: false, wave: 0, score: 0, kills: 0, combo: 0, comboMax: 0, phase: 'rest', phaseT: 1.5, ts: 1, slowT: 0, stop: 0, focusT: 0, deathT: 0, camSnap: true, runT: 0 }); G.comboW.clear(); G.queue.length = 0; G.used = WEAPONS.map(() => 0);
  $('title').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('hud').hidden = false; BOARD.start();
  input.wantLock = !input.touch && matchMedia('(pointer: fine)').matches; lockPointer(); GFX.canvas.focus();
}
function setPaused(v) {
  if (G.state !== 'play' || G.paused === v) return; G.paused = v; $('pause').hidden = !v;
  if (v) { if (document.pointerLockElement) document.exitPointerLock(); } else { lockPointer(); GFX.canvas.focus(); }
}
/* the run as the leaderboard keeps it: the weapon is the one that landed the most blows */
function runStats() { let wi = player.wi, n = 0; G.used.forEach((k, i) => { if (k > n) { n = k; wi = i; } }); return { score: G.score, wave: Math.max(1, G.wave), kills: G.kills, combo: G.comboMax, secs: Math.round(G.runT), weapon: WEAPONS[wi].id }; }
function gameOver() {
  G.state = 'over'; input.wantLock = false; if (document.pointerLockElement) document.exitPointerLock();
  const rec = G.score > G.best; if (rec) { G.best = G.score; try { localStorage.setItem('thapbinh.best', String(G.best)); } catch (_) {} }
  $('rWave').textContent = G.wave; $('rScore').textContent = G.score.toLocaleString('en-US'); $('rCombo').textContent = G.comboMax; $('rBest').textContent = G.best.toLocaleString('en-US');
  $('overTitle').textContent = rec ? 'NEW BEST' : 'GAME OVER'; $('over').hidden = false; BOARD.finish(runStats(), true);
}
function toggleFull() { const a = $('app'); try { if (document.fullscreenElement) document.exitFullscreen(); else if (a.requestFullscreen) { const r = a.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } } catch (_) {} }
function toggleMute() { $('bMute').style.opacity = sfx.toggle() ? .4 : 1; }

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(.05, Math.max(.001, (now - lastT) / 1000)); lastT = now; G.real += rdt;
  input.poll();
  if (input.mute) toggleMute(); if (input.full) toggleFull();
  if (input.lockLost) { input.lockLost = false; G.lockLost = G.real; setPaused(true); }
  else if (input.pause && G.real - G.lockLost > .4) setPaused(!G.paused);
  const p = player; let dt = 0;
  const sim = (G.state === 'play' && !G.paused) || G.state === 'over';
  if (sim) {
    G.slowT -= rdt; G.focusT -= rdt; G.ts = damp(G.ts, G.slowT > 0 ? G.slowS : 1, 16, rdt);
    dt = rdt * G.ts; if (G.stop > 0) { G.stop -= rdt; dt *= .04; }
    G.time += dt; if (G.state === 'play' && !p.dead) G.runT += rdt; GFX.post.desatT = G.focusT > 0 ? .75 : p.dead ? .6 : 0;
    const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
    G.ix = fx * input.my - fz * input.mx; G.iz = fz * input.my + fx * input.mx; G.moving = Math.hypot(G.ix, G.iz) > .15;
    if (G.state !== 'play') { G.ix = G.iz = 0; G.moving = false; input.consume(); }
    playerUpdate(dt, G.time);
    if (p.state !== 'attack' && p.state !== 'special') { const ax = G.moving ? G.ix : fwdX(p.yaw), az = G.moving ? G.iz : fwdZ(p.yaw), al = Math.hypot(ax, az) || 1, w = WEAPONS[p.wi]; p.target = pickTarget(ax / al, az / al, w.stance === 'bow' ? 34 : Math.max(8, w.reach + 5.5)); }
    for (const e of enemies) enemyUpdate(e, dt);
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i]; if (a.dead || a.gone) continue;
      for (let j = i + 1; j < enemies.length; j++) { const b = enemies[j]; if (b.gone) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius + .3; if (d < min && d > .001) { const k = (min - d) * .5 / d; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; } }
      if (p.state !== 'dodge' && p.state !== 'special' && a.state !== 'spawn') { const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, d = Math.hypot(dx, dz), min = a.radius + .42; if (d < min && d > .001) { const k = (min - d) / d; if (a.def.armor) { p.pos.x -= dx * k; p.pos.z -= dz * k; } else { a.pos.x += dx * k; a.pos.z += dz * k; } } }
    }
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    if (p.target && p.target.dead) p.target = null;
    orbsUpdate(dt); shotsUpdate(dt); fieldsUpdate(dt); buffsUpdate(dt);
    for (let i = G.afters.length - 1; i >= 0; i--) { const a = G.afters[i]; a.t -= dt; if (a.t <= 0) { G.afters.splice(i, 1); a.f(); } }
    if (G.state === 'play') { wavesUpdate(dt); if (G.combo) { G.comboT -= dt; if (G.comboT <= 0) G.breakCombo(); } }
    if (p.dead && G.state === 'play') { G.deathT -= rdt; if (G.deathT <= 0) gameOver(); }
  } else if (G.state === 'title') {
    dt = rdt; G.time += dt; heroIdle(G.time); HERO.update(dt); cloth.update(dt, G.time);
  }
  ghosts.update(dt); FX.update(dt, G.paused ? 0 : rdt);
  camUpdate(G.paused ? 0 : rdt, G.real);
  WORLD.update(G.real, G.paused ? 0 : rdt, p.pos);
  sfx.tick(G.state === 'play' && !G.paused ? clamp(enemies.length / 5, G.phase === 'fight' ? .35 : 0, 1) : 0, rdt);
  if (G.state !== 'title') { HUD.update(rdt); skillHud(); }
  GFX.render(G.real, rdt);
  input.consume();
}

function boot(data) {
  HUD.init(); setWeapon(0, true); ghosts.init(); WORLD.setSteleColors(WEAPONS.map(w => w.c));
  try { G.best = +localStorage.getItem('thapbinh.best') || 0; } catch (_) {}
  if (data && data.best > G.best) G.best = data.best;
  if (data && data.wi > 0 && data.wi < WEAPONS.length) setWeapon(data.wi, true);
  if (matchMedia('(pointer: coarse)').matches) $('keysDesk').innerHTML = '<dt>Move</dt><dd>Drag the left half of the screen</dd><dt>Camera</dt><dd>Drag the right half of the screen</dd><dt>Weapon</dt><dd>Tap the weapon bar or ◀ ▶</dd>';
  $('bStart').addEventListener('click', startGame); $('bAgain').addEventListener('click', startGame);
  $('bQuit').addEventListener('click', () => { if (G.state === 'play' && !player.dead && G.score > 0) BOARD.finish(runStats(), false); startGame(); });   // a run you walk away from still counts
  BOARD.init();
  $('bResume').addEventListener('click', () => setPaused(false)); $('bPause').addEventListener('click', () => setPaused(true));
  $('bMute').addEventListener('click', toggleMute); $('bFull').addEventListener('click', toggleFull);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  GFX.resize(); heroIdle(0); HERO.update(1);
  requestAnimationFrame(frame);
}
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ best: Math.max(G.best, G.score), wi: player.wi })); } catch (_) {}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot); else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
