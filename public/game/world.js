'use strict';
/* ============ the clearing: dusk sky, wind-blown grass, pines, ten weapon steles ============ */
const ARENA_R = 22.5;
const WORLD = (() => {
  const { scene, Q } = GFX;
  const sunDir = V3(-.55, .3, -.78).normalize();
  const fogCol = col(0x4a3558);
  scene.fog = new THREE.FogExp2(0x000000, .0155); scene.fog.color.copy(fogCol);

  /* ---- sky ---- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 18), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vD;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){ vec3 d = normalize(vD); float h = max(d.y, 0.0);
        float az = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz)), 0.0);
        vec3 zen = vec3(0.012, 0.018, 0.075), mid = vec3(0.10, 0.045, 0.19);
        vec3 hor = mix(vec3(0.20, 0.09, 0.22), vec3(1.5, 0.42, 0.10), pow(az, 3.0));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, zen, smoothstep(0.15, 0.75, h));
        float sd = max(dot(d, uSun), 0.0);
        c += vec3(1.6, 0.62, 0.22) * pow(sd, 14.0) * 0.9 + vec3(5.0, 3.0, 1.6) * smoothstep(0.9985, 0.9995, sd);
        vec3 g = floor(d * 190.0); float st = step(0.9965, hash(g)) * smoothstep(0.2, 0.6, h);
        c += vec3(0.8, 0.85, 1.0) * st * (0.6 + 0.4 * sin(uTime * 2.0 + hash(g + 1.0) * 40.0));
        if (d.y < 0.0) c = mix(c, vec3(0.08, 0.05, 0.11), smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  /* ---- lights ---- */
  const hemi = new THREE.HemisphereLight(col(0x7f8ae0), col(0x3a2a22), .85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(col(0xffa25e), 1.9);
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140; sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
  scene.add(sun); scene.add(sun.target);
  const rim = new THREE.DirectionalLight(col(0x8a63ff), .3); rim.position.set(.6, .5, .8); scene.add(rim);

  /* ---- ground ---- */
  const tex = (size, draw, rep) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); } return t; };
  const groundTex = tex(512, (g, S) => {
    g.fillStyle = '#27311e'; g.fillRect(0, 0, S, S);
    const pal = ['#33401f', '#1f2a18', '#3d3a24', '#2c3a1c', '#453f2a'];
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 46, ry = r * (.5 + Math.random() * .6), rot = Math.random() * 3;
      g.globalAlpha = .12 + Math.random() * .3; g.fillStyle = pal[(Math.random() * pal.length) | 0];
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.ellipse(x + ox, y + oy, r, ry, rot, 0, TAU); g.fill(); }
    }
    g.globalAlpha = .5; for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < .5 ? '#1a2114' : '#55603a'; g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); }
  }, 16);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(170, 72), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  /* ---- the stone dial: one glyph per weapon ---- */
  const DIAL_R = 10.5;
  const dialTex = tex(1024, (g, S) => {
    const c = S / 2; g.fillStyle = '#3a3742'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { g.globalAlpha = .08 + Math.random() * .16; g.fillStyle = Math.random() < .5 ? '#2a2830' : '#4b4856'; const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 30; g.beginPath(); g.ellipse(x, y, r, r * .6, Math.random() * 3, 0, TAU); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = '#1d1b23'; g.lineWidth = 5;
    for (const r of [.98, .8, .56, .3]) { g.beginPath(); g.arc(c, c, c * r, 0, TAU); g.stroke(); }
    g.lineWidth = 3; const seg = (r0, r1, n, off) => { for (let i = 0; i < n; i++) { const a = i / n * TAU + off; g.beginPath(); g.moveTo(c + Math.cos(a) * c * r0, c + Math.sin(a) * c * r0); g.lineTo(c + Math.cos(a) * c * r1, c + Math.sin(a) * c * r1); g.stroke(); } };
    seg(.8, .98, 20, 0); seg(.56, .8, 10, .31); seg(.3, .56, 5, 0);
  });
  const glowTex = tex(1024, (g, S) => {
    const c = S / 2; g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
    g.lineWidth = 4; g.beginPath(); g.arc(c, c, c * .895, 0, TAU); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(c, c, c * .68, 0, TAU); g.stroke(); g.beginPath(); g.arc(c, c, c * .2, 0, TAU); g.stroke();
    for (let i = 0; i < 10; i++) {                      // ten glyphs on the outer band
      g.save(); g.translate(c, c); g.rotate(i / 10 * TAU); g.translate(0, -c * .79); g.lineWidth = 5;
      const n = 2 + (i % 4); g.beginPath();
      for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 13; g.moveTo(x, -22 + (k % 2) * 8); g.lineTo(x + ((i + k) % 3 - 1) * 9, 22 - ((i + k) % 2) * 10); }
      g.moveTo(-26, 30); g.lineTo(26, 30); g.stroke(); g.beginPath(); g.arc(0, -36, 4, 0, TAU); g.fill(); g.restore();
    }
    g.lineWidth = 3; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * c * .6, c + Math.sin(a) * c * .6); g.lineTo(c + Math.cos(a) * c * .64, c + Math.sin(a) * c * .64); g.stroke(); }
  });
  glowTex.encoding = THREE.LinearEncoding;
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTex, roughness: .82, metalness: .08, emissiveMap: glowTex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1 });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(DIAL_R, 64), dialMat); dial.rotation.x = -Math.PI / 2; dial.position.y = .03; dial.receiveShadow = true; scene.add(dial);

  /* ---- ten steles, one per weapon ---- */
  const stoneMat = new THREE.MeshStandardMaterial({ color: col(0x4a4654), roughness: .9, metalness: .05, flatShading: true });
  const steles = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + .31, r = ARENA_R + 3.2, g = new THREE.Group();
    g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); g.rotation.set(randS(.08), a + Math.PI, randS(.1));
    const h = rand(4.4, 6.2);
    const body = new THREE.Mesh(GEO.box, stoneMat); body.scale.set(1.25, h, .7); body.position.y = h / 2 - .2; body.castShadow = body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(GEO.box, stoneMat); cap.scale.set(1.6, .32, .95); cap.position.y = h - .1; cap.castShadow = true; g.add(cap);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const strip = new THREE.Mesh(GEO.box, mat); strip.scale.set(.12, h * .62, .04); strip.position.set(0, h * .5, .36); g.add(strip);
    const bar = new THREE.Mesh(GEO.box, mat); bar.scale.set(.6, .1, .04); bar.position.set(0, h * .86, .36); g.add(bar);
    scene.add(g); steles.push({ mat, base: new THREE.Color(), k: 0 });
  }

  /* ---- forest ring (instanced) ---- */
  const spots = [];
  const place = (n, r0, r1, minD) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 30) { const a = rand(TAU), r = Math.sqrt(rand(r0 * r0, r1 * r1)), x = Math.sin(a) * r, z = Math.cos(a) * r; let ok = true; for (const s of spots) if ((s.x - x) ** 2 + (s.z - z) ** 2 < minD * minD) { ok = false; break; } if (ok) { const p = { x, z, r }; spots.push(p); out.push(p); } } return out; };
  const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), E = new THREE.Euler(), S3 = V3(), P3 = V3(), C = new THREE.Color();
  const put = (im, i, x, y, z, sx, sy, sz, ry, rx, rz) => { E.set(rx || 0, ry || 0, rz || 0); Qn.setFromEuler(E); P3.set(x, y, z); S3.set(sx, sy, sz); M.compose(P3, Qn, S3); im.setMatrixAt(i, M); };
  const trees = place(Q.mobile ? 110 : 210, 30.5, 96, 3.4);
  const trunkGeo = new THREE.CylinderGeometry(.6, 1, 1, 6); trunkGeo.translate(0, .5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: col(0x3c2b24), roughness: 1, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: col(0xffffff), roughness: .95, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const leaves = [0, 1, 2].map(() => new THREE.InstancedMesh(GEO.cone, leafMat, trees.length));
  trees.forEach((t, i) => {
    const s = rand(.85, 1.7) * (t.r < 40 ? 1.15 : 1), th = rand(3.2, 5.2) * s, ry = rand(TAU), lx = randS(.05), lz = randS(.05);
    put(trunks, i, t.x, -.2, t.z, .42 * s, th + 2.5 * s, .42 * s, ry, lx, lz);
    C.setHSL(rand(.36, .46), rand(.3, .5), rand(.07, .13)); C.convertSRGBToLinear();
    leaves.forEach((im, k) => { put(im, i, t.x + lx * k * 2, th * .62 + k * 1.75 * s, t.z + lz * k * 2, (2.7 - k * .68) * s, 3.5 * s, (2.7 - k * .68) * s, ry + k); im.setColorAt(i, C); });
  });
  [trunks, ...leaves].forEach(im => { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); });

  const rockSpots = place(Q.mobile ? 26 : 52, ARENA_R + 6.5, 62, 2.6);
  const rocks = new THREE.InstancedMesh(GEO.dod, new THREE.MeshStandardMaterial({ color: col(0x55505e), roughness: .95, flatShading: true }), rockSpots.length);
  rockSpots.forEach((t, i) => { const s = rand(.5, 2.1); put(rocks, i, t.x, s * .22, t.z, s * rand(.8, 1.5), s * rand(.5, 1), s * rand(.8, 1.4), rand(TAU), randS(.4), randS(.4)); });
  rocks.castShadow = rocks.receiveShadow = true; rocks.frustumCulled = false; scene.add(rocks);

  const bushSpots = place(Q.mobile ? 30 : 80, ARENA_R + 5, 46, 1.8);
  const bushes = new THREE.InstancedMesh(GEO.ico, new THREE.MeshStandardMaterial({ color: col(0xffffff), roughness: 1, flatShading: true }), bushSpots.length);
  bushSpots.forEach((t, i) => { const s = rand(.6, 1.5); put(bushes, i, t.x, s * .3, t.z, s * rand(1, 1.6), s * rand(.55, .9), s * rand(1, 1.6), rand(TAU), randS(.3), randS(.3)); C.setHSL(rand(.3, .42), rand(.35, .55), rand(.08, .15)); C.convertSRGBToLinear(); bushes.setColorAt(i, C); });
  bushes.castShadow = bushes.receiveShadow = true; bushes.frustumCulled = false; scene.add(bushes);

  /* ---- grass (instanced blades, wind + footstep push in the vertex shader) ---- */
  const GN = Q.grass;
  const bg = new THREE.InstancedBufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.32, .5, 0, .32, .5, 0, 0, 1, 0], 3));
  bg.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  const gOff = new Float32Array(GN * 3), gPar = new Float32Array(GN * 4);
  for (let i = 0; i < GN; i++) {
    const near = i < GN * .72, r = Math.sqrt(near ? rand(DIAL_R * DIAL_R, 36 * 36) : rand(36 * 36, 62 * 62)), a = rand(TAU);
    gOff[i * 3] = Math.sin(a) * r; gOff[i * 3 + 2] = Math.cos(a) * r;
    const edge = clamp((r - DIAL_R) / 3, .25, 1), inArena = r < ARENA_R;
    gPar[i * 4] = rand(TAU); gPar[i * 4 + 1] = (inArena ? rand(.22, .5) : rand(.45, 1.15) * clamp(.45 + (r - ARENA_R) / 7, .45, 1)) * edge; gPar[i * 4 + 2] = Math.random(); gPar[i * 4 + 3] = inArena ? .085 : .12;
  }
  bg.setAttribute('aOff', new THREE.InstancedBufferAttribute(gOff, 3)); bg.setAttribute('aPar', new THREE.InstancedBufferAttribute(gPar, 4));
  bg.instanceCount = GN;
  const grassMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uP: { value: V3() }, uFogC: { value: fogCol }, uFogD: { value: scene.fog.density }, uBase: { value: col(0x13281a) }, uTip: { value: col(0x6c9a4a) }, uSun: { value: col(0xff9448) }, uShock: { value: new THREE.Vector4(0, 0, -99, 0) } },
    vertexShader: `attribute vec3 aOff; attribute vec4 aPar; uniform float uTime, uFogD; uniform vec3 uP; uniform vec4 uShock;
      varying float vH; varying float vR; varying float vFog;
      void main(){ float h = position.y; vec3 p = position; p.x *= aPar.w; p.y *= aPar.y;
        float c = cos(aPar.x), s = sin(aPar.x); p.xz = vec2(c * p.x, s * p.x);
        vec3 wp = p + aOff; float bend = h * h * aPar.y;
        float w = sin(uTime * 1.5 + aOff.x * 0.32 + aOff.z * 0.25) * 0.55 + sin(uTime * 2.9 + aOff.x * 0.9 - aOff.z * 0.4) * 0.2;
        wp.x += (w + 0.35) * 0.3 * bend; wp.z += cos(uTime * 1.2 + aOff.z * 0.4) * 0.14 * bend;
        vec2 d = wp.xz - uP.xz; float dist = length(d); float push = smoothstep(1.7, 0.0, dist) * h;
        wp.xz += normalize(d + 0.0001) * push * 0.55; wp.y -= push * 0.22 * aPar.y;
        vec2 ds = aOff.xz - uShock.xy; float dl = length(ds); float sw = smoothstep(2.2, 0.0, abs(dl - uShock.z)) * uShock.w * h;
        wp.xz += normalize(ds + 0.0001) * sw * 0.8; wp.y -= sw * 0.3 * aPar.y;
        vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv;
        vH = h; vR = aPar.z; float z = -mv.z; vFog = 1.0 - exp(-uFogD * uFogD * z * z); }`,
    fragmentShader: `uniform vec3 uBase, uTip, uFogC, uSun; varying float vH; varying float vR; varying float vFog;
      void main(){ vec3 c = mix(uBase, uTip, vH * vH) * (0.55 + 0.5 * vR); c += uSun * vH * vH * vH * 0.14 * (0.4 + vR);
        gl_FragColor = vec4(mix(c, uFogC, vFog), 1.0); }`,
  });
  const grass = new THREE.Mesh(bg, grassMat); grass.frustumCulled = false; scene.add(grass);

  /* ---- light shafts through the trees ---- */
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying float vS; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vS = wp.x + wp.z; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vS;
      void main(){ float w = 1.0 - abs(vUv.x * 2.0 - 1.0); float a = w * w * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        a *= 0.05 + 0.02 * sin(uTime * 0.7 + vS); gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * a, a); }`,
  });
  const shaftGeo = new THREE.PlaneGeometry(1, 1); shaftGeo.translate(0, .5, 0);
  const sunAz = Math.atan2(sunDir.x, sunDir.z);
  for (let i = 0; i < 9; i++) {
    const a = sunAz + randS(1.0), r = rand(24, 46), g = new THREE.Group();
    g.position.set(Math.sin(a) * r, -1, Math.cos(a) * r);
    for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(shaftGeo, shaftMat); m.scale.set(rand(3, 6.5), 40, 1); m.rotation.y = k * Math.PI / 2 + i; m.frustumCulled = false; m.renderOrder = 5; g.add(m); }
    g.quaternion.setFromUnitVectors(V3(0, 1, 0), sunDir); scene.add(g);
  }

  /* ---- fireflies ---- */
  const FN = Q.mobile ? 120 : 280, fPos = new Float32Array(FN * 3), fSeed = new Float32Array(FN);
  for (let i = 0; i < FN; i++) { const a = rand(TAU), r = Math.sqrt(rand(9, 44 * 44)); fPos[i * 3] = Math.sin(a) * r; fPos[i * 3 + 1] = rand(.3, 4.5); fPos[i * 3 + 2] = Math.cos(a) * r; fSeed[i] = rand(100); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 1));
  const flyMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uCol: { value: col(0xffd27a) } },
    vertexShader: `attribute float aSeed; uniform float uTime, uScale; varying float vA;
      void main(){ vec3 p = position; float t = uTime * 0.35 + aSeed;
        p.x += sin(t * 1.3 + aSeed) * 1.6; p.y += sin(t * 1.9) * 0.7; p.z += cos(t * 1.1 + aSeed * 2.0) * 1.6;
        vA = 0.35 + 0.65 * pow(max(sin(t * 3.0 + aSeed * 7.0), 0.0), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 0.11 * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a * vA; gl_FragColor = vec4(uCol * a * 4.0, a); }',
  });
  const flies = new THREE.Points(fg, flyMat); flies.frustumCulled = false; scene.add(flies);

  const accent = new THREE.Color(1, 1, 1), accentT = new THREE.Color(1, 1, 1);
  let active = 0, pulse = 0, shockT = 9;
  function setAccent(c, i) { accentT.copy(c); active = i; pulse = 1; }
  function setSteleColors(list) { list.forEach((c, i) => steles[i].base.copy(c)); }
  function shock(x, z, strength) { grassMat.uniforms.uShock.value.set(x, z, 0, strength || 1); shockT = 0; }
  function update(time, rdt, focus) {
    accent.lerp(accentT, 1 - Math.exp(-6 * rdt)); pulse = damp(pulse, 0, 2.5, rdt);
    sky.position.copy(GFX.camera.position); sky.material.uniforms.uTime.value = time;
    sun.target.position.set(focus.x, 0, focus.z); sun.position.copy(sun.target.position).addScaledVector(sunDir, 70);
    grassMat.uniforms.uTime.value = time; grassMat.uniforms.uP.value.copy(focus);
    shockT += rdt; const sh = grassMat.uniforms.uShock.value; sh.z = shockT * 26; if (shockT > 1) sh.w = 0; else sh.w *= Math.exp(-2.5 * rdt);
    shaftMat.uniforms.uTime.value = time; flyMat.uniforms.uTime.value = time; flyMat.uniforms.uScale.value = GFX.ph / (2 * Math.tan(GFX.camera.fov * DEG / 2));
    dialMat.emissive.copy(accent).multiplyScalar(.75 + .25 * Math.sin(time * 2) + pulse * 3);
    steles.forEach((s, i) => { s.k = damp(s.k, i === active ? 1 : 0, 5, rdt); s.mat.color.copy(s.base).multiplyScalar(.35 + s.k * (3.2 + Math.sin(time * 4) * .6)); });
  }
  return { update, setAccent, setSteleColors, shock, sunDir, DIAL_R };
})();
