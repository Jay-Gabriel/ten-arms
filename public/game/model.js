'use strict';
/* ============ rigged models: one skeleton with its baked clips, skins that share it, and live copies of them ============
   (data comes from tools/build-assets.js) */
/* the packs' characters are short-legged and big-headed; every skeleton in the game is stretched the same way: [bones, across, along] */
const BODY_SHAPE = [[/^(upperleg|lowerleg)/i, 1.1, 1.75], [/^(upperarm|lowerarm)/i, 1, 1.2], [/^head$/i, .72, .72], [/^(spine|chest)$/i, .94, 1]];
const MODEL = (() => {
  const dec = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer, 0, u.length / T.BYTES_PER_ELEMENT); };
  const one = new THREE.Vector3(1, 1, 1), UPY = new THREE.Vector3(0, 1, 0);

  /* ---- a skeleton and its clips. Proportions are changed once, on the rest pose: limbs stretched along their bones, the head shrunk,
          then everything scaled so the neck sits at headY. Nothing is scaled at run time. ---- */
  function rig(D, o) {
    o = o || {};
    const B = D.bones.map(b => ({ n: b.n, p: b.p, t: b.t.slice(), q: b.q.slice() })), nb = B.length, tb = D.tb, FPS = D.fps, index = re => B.findIndex(b => re.test(b.n));
    const ibm = dec(D.ibm, Float32Array), inv = B.map((_, i) => new THREE.Matrix4().fromArray(ibm, i * 16)), t = new THREE.Vector3(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();
    const clips = {}; for (const n in D.clips) { const c = D.clips[n]; clips[n] = { n: c.n, dur: c.dur, rot: dec(c.rot, Int16Array), pos: dec(c.pos, Float32Array), sw: c.sw || {} }; }
    const rest = () => { const w = []; B.forEach((b, i) => { const m = new THREE.Matrix4().compose(t.fromArray(b.t), q.fromArray(b.q), one); w[i] = b.p < 0 ? m : new THREE.Matrix4().multiplyMatrices(w[b.p], m); }); return w; };
    const shape = o.shape || [], f = B.map(b => { const s = shape.find(s => s[0].test(b.n)); return s ? [s[1], s[2]] : [1, 1]; });
    const leg = index(/^upperleg/i), hips = index(/^hips$/i), foot = index(/^foot/i), head = index(/^head$/i), footH = foot >= 0 ? rest()[foot].elements[13] : 0, off = leg >= 0 ? B[leg].t[1] : 0, aLeg = leg >= 0 ? f[leg][1] : 1;
    const hipY = y => footH + aLeg * (y + off - footH) - off;                              // longer legs lift the hips; a crouch stays a crouch
    B.forEach(b => { if (b.p >= 0) { const [r, a] = f[b.p]; b.t = [b.t[0] * r, b.t[1] * a, b.t[2] * r]; } });
    if (hips >= 0) B[hips].t[1] = hipY(B[hips].t[1]);
    const now = rest(), s = o.headY && head >= 0 ? o.headY / now[head].elements[13] : 1;
    const T = B.map((b, i) => new THREE.Matrix4().makeScale(s, s, s).multiply(now[i]).multiply(new THREE.Matrix4().makeScale(f[i][0], f[i][1], f[i][0])).multiply(inv[i]));   // rest vertex → reshaped vertex, per bone
    for (const n in clips) { const P = clips[n].pos; for (let k = 0; k < P.length; k += 3) { const b = tb[(k / 3) % tb.length], [r, a] = B[b].p >= 0 ? f[B[b].p] : [1, 1]; P[k] *= r * s; P[k + 1] = (b === hips ? hipY(P[k + 1]) : P[k + 1] * a) * s; P[k + 2] *= r * s; } }
    B.forEach(b => { b.t = b.t.map(x => x * s); });
    const fin = rest(); fin.forEach((m, i) => inv[i].copy(m).invert());
    const arm = index(/^(upperarm|.*RightArm$)/i), arcY = arm >= 0 ? fin[arm].elements[13] : 1.2;

    /* a left-right reflected copy of a clip, so a move made with one hand can also be made with the other */
    function mirror(name) {
      const c = clips[name], out = name + '_m'; if (!c || clips[out]) return out;
      const twin = B.map((b, i) => { const n = /l$/.test(b.n) ? b.n.replace(/l$/, 'r') : /r$/.test(b.n) ? b.n.replace(/r$/, 'l') : b.n.replace(/Left/, '\u0001').replace(/Right/, 'Left').replace(/\u0001/, 'Right'), j = B.findIndex(x => x.n === n); return j < 0 ? i : j; });
      const X = new THREE.Matrix4().makeScale(-1, 1, 1), flip = m => new THREE.Matrix4().multiplyMatrices(X, m).multiply(X);
      const fk = (rot, P, fr) => { const w = []; B.forEach((b, i) => { const j = tb.indexOf(i); if (rot) q.set(rot[(fr * nb + i) * 4], rot[(fr * nb + i) * 4 + 1], rot[(fr * nb + i) * 4 + 2], rot[(fr * nb + i) * 4 + 3]).normalize(); else q.fromArray(b.q); if (P && j >= 0) t.set(P[(fr * tb.length + j) * 3], P[(fr * tb.length + j) * 3 + 1], P[(fr * tb.length + j) * 3 + 2]); else t.fromArray(b.t); const m = new THREE.Matrix4().compose(t, q, one); w[i] = b.p < 0 ? m : new THREE.Matrix4().multiplyMatrices(w[b.p], m); }); return w; };
      const r0 = fk(null, null, 0), fix = B.map((b, i) => flip(r0[twin[i]]).invert().multiply(r0[i])), rot = new Int16Array(c.rot.length), P = new Float32Array(c.pos.length), last = new Float32Array(nb * 4), L = new THREE.Matrix4();
      for (let fr = 0; fr < c.n; fr++) {
        const w = fk(c.rot, c.pos, fr), m = B.map((b, i) => flip(w[twin[i]]).multiply(fix[i]));
        B.forEach((b, i) => {
          (b.p < 0 ? L.copy(m[i]) : L.copy(m[b.p]).invert().multiply(m[i])).decompose(t, q, s3);
          const g = fr && q.x * last[i * 4] + q.y * last[i * 4 + 1] + q.z * last[i * 4 + 2] + q.w * last[i * 4 + 3] < 0 ? -1 : 1; last[i * 4] = q.x * g; last[i * 4 + 1] = q.y * g; last[i * 4 + 2] = q.z * g; last[i * 4 + 3] = q.w * g;
          for (let k = 0; k < 4; k++) rot[(fr * nb + i) * 4 + k] = Math.round(last[i * 4 + k] * 32767);
          const j = tb.indexOf(i); if (j >= 0) { P[(fr * tb.length + j) * 3] = t.x; P[(fr * tb.length + j) * 3 + 1] = t.y; P[(fr * tb.length + j) * 3 + 2] = t.z; }
        });
      }
      const side = a => a ? [a[0], a[1], -a[2], -a[3], -a[4]] : a;
      clips[out] = { n: c.n, dur: c.dur, rot, pos: P, sw: { R: side(c.sw.L), L: side(c.sw.R) } }; return out;
    }
    const mask = re => { const m = new Uint8Array(nb); B.forEach((b, i) => { m[i] = re.test(b.n) ? 1 : 0; }); return m; };
    return { B, nb, tb, FPS, inv, clips, T, index, mirror, mask, arcY };
  }

  /* ---- a mesh bound to that skeleton. paint(colour, hsl, vertex, skin) may repaint each vertex of the baked palette. ---- */
  function skin(R, M, o) {
    o = o || {};
    const nv = M.nv, pos = dec(M.buf.pos, Float32Array), ji = dec(M.buf.ji, Uint8Array), jw = dec(M.buf.jw, Uint8Array), v = new THREE.Vector3(), acc = new THREE.Vector3();
    for (let i = 0; i < nv; i++) {
      acc.set(0, 0, 0); for (let c = 0; c < 4; c++) { const w = jw[i * 4 + c]; if (w) acc.addScaledVector(v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(R.T[ji[i * 4 + c]]), w / 255); }
      pos[i * 3] = acc.x; pos[i * 3 + 1] = acc.y; pos[i * 3 + 2] = acc.z;
    }
    const geo = new THREE.BufferGeometry(), tags = [...new Set(M.parts.map(p => p.tag || ''))].sort(), S = { geo, nv, pos, ji, jw, tags };
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(dec(M.buf.nor, Int8Array), 3, true));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(ji, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(jw, 4, true));
    geo.setIndex(new THREE.BufferAttribute(dec(M.buf.idx, M.wide ? Uint32Array : Uint16Array), 1));
    M.parts.forEach(p => geo.addGroup(p.start, p.count, tags.indexOf(p.tag || '')));       // one material slot per tag; untagged parts share slot 0
    if (M.buf.col) {
      const src = dec(M.buf.col, Uint8Array), out = new Float32Array(nv * 3), c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
      for (let i = 0; i < nv; i++) { c.setRGB(src[i * 3] / 255, src[i * 3 + 1] / 255, src[i * 3 + 2] / 255).getHSL(hsl); if (o.paint) o.paint(c, hsl, i, S); c.convertSRGBToLinear(); out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
    }
    TOON.prep(geo); return S;
  }

  /* ---- a live copy: its own bones, pose and materials. o.mats maps a part tag to its material ('' = the body). ---- */
  function spawn(R, S, o) {
    const B = R.B, nb = R.nb, tb = R.tb, group = new THREE.Group(), bones = B.map(b => { const x = new THREE.Bone(); x.name = b.n; x.position.fromArray(b.t); x.quaternion.fromArray(b.q); return x; });
    B.forEach((b, i) => (b.p < 0 ? group : bones[b.p]).add(bones[i]));
    const skeleton = new THREE.Skeleton(bones, R.inv), bone = re => bones[R.index(re)], mats = S.tags.map(t => o.mats[t] || o.mats['']);
    const part = { hips: bone(/hips$/i), chest: bone(/(chest|spine2)$/i), head: bone(/head$/i), slotR: bone(/(handslot[._]?r|righthand)$/i), slotL: bone(/(handslot[._]?l|lefthand)$/i) };
    const mesh = new THREE.SkinnedMesh(S.geo, mats.length > 1 ? mats : mats[0]); mesh.castShadow = true; mesh.frustumCulled = false; group.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
    if (o.ink !== false) { const hull = new THREE.SkinnedMesh(S.geo, TOON.inkSkin); hull.frustumCulled = false; group.add(hull); hull.bind(skeleton, new THREE.Matrix4()); }

    const cur = new Float32Array(nb * 4), from = new Float32Array(nb * 4), curP = new Float32Array(tb.length * 3), fromP = new Float32Array(tb.length * 3), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
    let key = null, fadeT = 1, fadeD = 0, look = 0, lookT = 0;
    B.forEach((b, i) => cur.set(b.q, i * 4)); tb.forEach((b, j) => curP.set(B[b].t, j * 3));
    function sample(c, time, only) {
      const ft = clamp(time, 0, c.dur) * R.FPS, f0 = Math.min(c.n - 1, Math.floor(ft)), f1 = Math.min(c.n - 1, f0 + 1), a = ft - f0, A = c.rot, P = c.pos, o0 = f0 * nb * 4, o1 = f1 * nb * 4;
      for (let i = 0; i < nb * 4; i += 4) {
        if (only && !only[i >> 2]) continue;
        const x = A[o0 + i] + (A[o1 + i] - A[o0 + i]) * a, y = A[o0 + i + 1] + (A[o1 + i + 1] - A[o0 + i + 1]) * a, z = A[o0 + i + 2] + (A[o1 + i + 2] - A[o0 + i + 2]) * a, w = A[o0 + i + 3] + (A[o1 + i + 3] - A[o0 + i + 3]) * a, l = 1 / (Math.hypot(x, y, z, w) || 1);
        cur[i] = x * l; cur[i + 1] = y * l; cur[i + 2] = z * l; cur[i + 3] = w * l;
      }
      const p0 = f0 * tb.length * 3, p1 = f1 * tb.length * 3; for (let j = 0; j < tb.length; j++) { if (only && !only[tb[j]]) continue; for (let k = j * 3; k < j * 3 + 3; k++) curP[k] = P[p0 + k] + (P[p1 + k] - P[p0 + k]) * a; }
    }
    /* aim the skeleton at one moment of a clip. A new clip (or a new tag for the same clip) blends in from whatever is on screen. */
    function pose(name, time, fade, tag) {
      const c = R.clips[name]; if (!c) return;
      const k = tag === undefined ? name : name + '|' + tag;
      if (k !== key) {
        key = k; fadeT = 0; fadeD = fade === undefined ? .12 : fade;
        for (let i = 0; i < nb; i++) { const x = bones[i].quaternion; from[i * 4] = x.x; from[i * 4 + 1] = x.y; from[i * 4 + 2] = x.z; from[i * 4 + 3] = x.w; }
        tb.forEach((b, j) => { const p = bones[b].position; fromP[j * 3] = p.x; fromP[j * 3 + 1] = p.y; fromP[j * 3 + 2] = p.z; });
      }
      sample(c, time, null);
    }
    const loop = (name, t, fade, tag) => { const c = R.clips[name]; if (c) pose(name, ((t % c.dur) + c.dur) % c.dur, fade, tag); };
    /* after pose(): take some bones from another clip instead (a raised shield over walking legs) */
    const overlay = (name, time, only) => { const c = R.clips[name]; if (c) sample(c, ((time % c.dur) + c.dur) % c.dur, only); };
    function update(dt) {
      fadeT += dt; const w = fadeD > 1e-4 ? clamp(fadeT / fadeD, 0, 1) : 1, k = w * w * (3 - 2 * w);
      for (let i = 0; i < nb; i++) { const x = bones[i].quaternion, j = i * 4; if (k < 1) { x.set(from[j], from[j + 1], from[j + 2], from[j + 3]); q.set(cur[j], cur[j + 1], cur[j + 2], cur[j + 3]); x.slerp(q, k); } else x.set(cur[j], cur[j + 1], cur[j + 2], cur[j + 3]); }
      tb.forEach((b, j) => { const p = bones[b].position, a = j * 3; if (k < 1) p.set(lerp(fromP[a], curP[a], k), lerp(fromP[a + 1], curP[a + 1], k), lerp(fromP[a + 2], curP[a + 2], k)); else p.set(curP[a], curP[a + 1], curP[a + 2]); });
      look = damp(look, lookT, 9, dt); lookT = 0;                        // the head turns only while someone asks it to, every frame
      if (Math.abs(look) > .01 && part.head) part.head.quaternion.multiply(qy.setFromAxisAngle(UPY, look));
    }
    /* a point given in the model's rest pose, expressed in a bone's own space so it rides along with that bone */
    const anchor = (b, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(R.inv[bones.indexOf(b)]).toArray();
    const along = (b, x, y, z) => new THREE.Vector3(x, y, z).transformDirection(R.inv[bones.indexOf(b)]).toArray();
    /* the current pose frozen into plain positions, for afterimages: skinning done once on the CPU */
    const sk = bones.map(() => new THREE.Matrix4()), v = new THREE.Vector3(), acc = new THREE.Vector3();
    function freeze(out) {
      const pos = S.pos, ji = S.ji, jw = S.jw;
      for (let i = 0; i < nb; i++) sk[i].multiplyMatrices(bones[i].matrixWorld, R.inv[i]);
      for (let i = 0; i < S.nv; i++) {
        acc.set(0, 0, 0); for (let c = 0; c < 4; c++) { const w = jw[i * 4 + c]; if (w) acc.addScaledVector(v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(sk[ji[i * 4 + c]]), w / 255); }
        out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
      }
    }
    return { group, bones, part, pose, loop, overlay, update, anchor, along, freeze, lookAt(a) { lookT = clamp(a, -1.1, 1.1); }, dispose() { skeleton.dispose(); } };
  }
  return { rig, skin, spawn };
})();
