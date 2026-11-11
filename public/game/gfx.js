'use strict';
/* ============ renderer + HDR bloom pipeline ============ */
const GFX = (() => {
  const canvas = $('gl');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); }
  catch (e) { $('fail').hidden = false; $('title').hidden = true; throw e; }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const Q = { mobile: coarse, dprMax: Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2), grass: coarse ? 14000 : 46000, shadow: coarse ? 1024 : 2048 };
  let dpr = Q.dprMax, W = 0, H = 0, lastDpr = 0;
  const gl2 = renderer.capabilities.isWebGL2;
  const hdr = gl2 && renderer.extensions.has('EXT_color_buffer_float');
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, .1, 420);

  const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, stencilBuffer: false };
  const mkRT = depth => new THREE.WebGLRenderTarget(4, 4, Object.assign({ depthBuffer: depth }, rtOpts));
  let sceneRT;
  if (gl2 && !Q.mobile) { sceneRT = new THREE.WebGLMultisampleRenderTarget(4, 4, Object.assign({ depthBuffer: true }, rtOpts)); sceneRT.samples = 4; }
  else sceneRT = mkRT(true);
  const LV = 5, down = [], up = [];
  for (let i = 0; i < LV; i++) { down.push(mkRT(false)); if (i < LV - 1) up.push(mkRT(false)); }

  const pScene = new THREE.Scene(), pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false; pScene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const mBright = mk(`uniform sampler2D tD; uniform float uTh; varying vec2 vUv;
    void main(){ vec3 c = max(texture2D(tD, vUv).rgb, 0.0); float l = max(c.r, max(c.g, c.b));
      float k = max(l - uTh, 0.0) / max(l, 1e-4); gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0); }`,
    { tD: { value: null }, uTh: { value: hdr ? 1.0 : .72 } });
  const mDown = mk(`uniform sampler2D tD; uniform vec2 px; varying vec2 vUv;
    void main(){ vec4 s = texture2D(tD, vUv) * 4.0;
      s += texture2D(tD, vUv - px); s += texture2D(tD, vUv + px);
      s += texture2D(tD, vUv + vec2(px.x, -px.y)); s += texture2D(tD, vUv - vec2(px.x, -px.y));
      gl_FragColor = s / 8.0; }`, { tD: { value: null }, px: { value: new THREE.Vector2() } });
  const mUp = mk(`uniform sampler2D tD, tAdd; uniform vec2 px; varying vec2 vUv;
    void main(){ vec4 s = texture2D(tD, vUv + vec2(-px.x*2.0, 0.0)) + texture2D(tD, vUv + vec2(px.x*2.0, 0.0))
        + texture2D(tD, vUv + vec2(0.0, px.y*2.0)) + texture2D(tD, vUv + vec2(0.0, -px.y*2.0));
      s += (texture2D(tD, vUv + px) + texture2D(tD, vUv - px) + texture2D(tD, vUv + vec2(px.x, -px.y)) + texture2D(tD, vUv + vec2(-px.x, px.y))) * 2.0;
      gl_FragColor = s / 12.0 + texture2D(tAdd, vUv); }`, { tD: { value: null }, tAdd: { value: null }, px: { value: new THREE.Vector2() } });
  const mFinal = mk(`#define TAPS ${Q.mobile ? 3 : 8}
    uniform sampler2D tScene, tBloom; uniform float uBloom, uAberr, uRadial, uVig, uFlash, uHurt, uDesat, uTime, uExpo;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      float jit = hash(vUv * 913.0 + fract(uTime));
      vec3 c = vec3(0.0);
      for (int i = 0; i < TAPS; i++) {
        float k = 1.0 - uRadial * (float(i) + jit) / float(TAPS) * (0.25 + r2 * 2.2);
        vec2 uv = 0.5 + d * k; vec2 off = d * uAberr * (0.25 + r2 * 3.0);
        c.r += texture2D(tScene, uv + off).r; c.g += texture2D(tScene, uv).g; c.b += texture2D(tScene, uv - off).b;
      }
      c /= float(TAPS);
      c += texture2D(tBloom, vUv).rgb * uBloom;
      c *= uExpo * (1.0 - uVig * smoothstep(0.1, 0.8, r2 * 1.7));
      c = aces(c);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l) * vec3(0.82, 0.92, 1.12), uDesat);
      c = pow(c, vec3(1.0 / 2.2));
      c += (hash(vUv * 731.0 + fract(uTime) * 17.0) - 0.5) * 0.03;
      c = mix(c, vec3(1.0), uFlash);
      float hv = uHurt * smoothstep(0.06, 0.5, r2);
      c = mix(c, vec3(0.9, 0.05, 0.12), hv * 0.75);
      gl_FragColor = vec4(c, 1.0);
    }`, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: .68 }, uAberr: { value: 0 }, uRadial: { value: 0 }, uVig: { value: .5 }, uFlash: { value: 0 }, uHurt: { value: 0 }, uDesat: { value: 0 }, uTime: { value: 0 }, uExpo: { value: 1.05 } });

  const post = { aberr: 0, radial: 0, radialT: 0, flash: 0, hurt: 0, desat: 0, desatT: 0 };

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (w === W && h === H && dpr === lastDpr) return;
    W = w; H = h; lastDpr = dpr;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    const pw = Math.max(4, Math.floor(w * dpr)), ph = Math.max(4, Math.floor(h * dpr));
    sceneRT.setSize(pw, ph);
    for (let i = 0; i < LV; i++) { const bw = Math.max(2, pw >> (i + 1)), bh = Math.max(2, ph >> (i + 1)); down[i].setSize(bw, bh); if (up[i]) up[i].setSize(bw, bh); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    api.W = W; api.H = H; api.ph = ph;
  }
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(pScene, pCam); };
  let facc = 0, fn = 0, warm = 0;
  function render(time, rdt) {
    resize();
    // adaptive resolution: drop pixel ratio if the frame rate cannot hold
    warm += rdt; if (warm > 3) { facc += rdt; fn++; if (facc > 1.5) { if (fn / facc < 38 && dpr > .6) dpr = Math.max(.6, dpr - .25); facc = 0; fn = 0; } }
    post.aberr = damp(post.aberr, 0, 7, rdt); post.flash = damp(post.flash, 0, 9, rdt); post.hurt = damp(post.hurt, 0, 2.2, rdt);
    post.radial = damp(post.radial, post.radialT, 9, rdt); post.desat = damp(post.desat, post.desatT, 8, rdt);
    const u = mFinal.uniforms; u.uAberr.value = post.aberr * .03; u.uRadial.value = post.radial * .1; u.uFlash.value = post.flash; u.uHurt.value = post.hurt; u.uDesat.value = post.desat; u.uTime.value = time;
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    mBright.uniforms.tD.value = sceneRT.texture; run(mBright, down[0]);
    for (let i = 1; i < LV; i++) { mDown.uniforms.tD.value = down[i - 1].texture; mDown.uniforms.px.value.set(.5 / down[i - 1].width, .5 / down[i - 1].height); run(mDown, down[i]); }
    let src = down[LV - 1];
    for (let i = LV - 2; i >= 0; i--) { mUp.uniforms.tD.value = src.texture; mUp.uniforms.tAdd.value = down[i].texture; mUp.uniforms.px.value.set(.5 / src.width, .5 / src.height); run(mUp, up[i]); src = up[i]; }
    u.tScene.value = sceneRT.texture; u.tBloom.value = up[0].texture; run(mFinal, null);
  }
  const api = { renderer, scene, camera, canvas, Q, post, render, resize, W: 1, H: 1, ph: 1, hdr };
  return api;
})();

/* ============ shared primitive geometry ============ */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  limb: (() => { const g = new THREE.CylinderGeometry(1, .76, 1, 7); g.translate(0, -.5, 0); return g; })(),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dod: new THREE.DodecahedronGeometry(1, 0),
  sph: new THREE.SphereGeometry(1, 14, 10),
  cone: (() => { const g = new THREE.ConeGeometry(1, 1, 9); g.translate(0, .5, 0); return g; })(),
};

/* ============ VFX: slash arcs, rings, streaks, domes, sparks, debris, light flashes ============ */
const FX = (() => {
  const { scene, Q } = GFX;
  const ADD = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide };
  let time = 0;

  /* ---- sparks (CPU points) ---- */
  const PN = Q.mobile ? 1400 : 3400;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pS0 = new Float32Array(PN), pG = new Float32Array(PN), pDr = new Float32Array(PN);
  let pHead = 0;
  const pGeo = new THREE.BufferGeometry();
  const dyn = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  pGeo.setAttribute('position', dyn(pPos, 3)); pGeo.setAttribute('aColor', dyn(pCol, 3)); pGeo.setAttribute('aSize', dyn(pSize, 1));
  const pMat = new THREE.ShaderMaterial(Object.assign({
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 220.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; gl_FragColor = vec4(vC * a, a); }`,
  }, ADD));
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 10; scene.add(points);
  function emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav, drag) {
    const i = pHead, j = i * 3; pHead = (pHead + 1) % PN;
    pPos[j] = x; pPos[j + 1] = y; pPos[j + 2] = z; pVel[j] = vx; pVel[j + 1] = vy; pVel[j + 2] = vz;
    pCol[j] = r; pCol[j + 1] = g; pCol[j + 2] = b; pS0[i] = size; pLife[i] = pMax[i] = life; pG[i] = grav; pDr[i] = drag;
  }
  function burst(pos, o) {
    const n = Q.mobile ? Math.ceil((o.n || 12) * .6) : (o.n || 12), c = o.color, sp = o.speed || 6, gain = o.gain || 3, R = o.r || 0;
    for (let k = 0; k < n; k++) {
      let dx = randS(), dy = randS() * (o.flat || 1), dz = randS(); const l = Math.hypot(dx, dy, dz) || 1, s = sp * (.25 + Math.random() * .75) / l;
      let vx = dx * s, vy = dy * s + (o.up || 0), vz = dz * s;
      if (o.dir) { const b = sp * (o.bias || 1) * (.4 + Math.random() * .6); vx += o.dir.x * b; vy += (o.dir.y || 0) * b; vz += o.dir.z * b; }
      const g = gain * (.5 + Math.random());
      emit(pos.x + randS(R), pos.y + randS(R) * (o.ry === undefined ? 1 : o.ry), pos.z + randS(R), vx, vy, vz, c.r * g, c.g * g, c.b * g,
        (o.size || .12) * (.5 + Math.random()), (o.life || .5) * (.5 + Math.random() * .8), o.grav === undefined ? 14 : o.grav, o.drag === undefined ? 2 : o.drag);
    }
  }

  /* ---- arcs: crescent slashes / shockwave rings / ground cracks / telegraph discs ---- */
  const arcGeo = new THREE.PlaneGeometry(1, 1, 72, 1);
  const ARC_VS = `uniform float uA0, uA1, uR0, uR1, uLift; varying vec2 vUv;
    void main(){ vUv = uv; float th = mix(uA0, uA1, uv.x); float r = mix(uR0, uR1, uv.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(th) * r, uLift * uv.y, cos(th) * r, 1.0); }`;
  const ARC_FS = `uniform vec3 uCol, uCol2; uniform float uHead, uTail, uAlpha, uSeed, uTime, uMode, uGain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
    void main(){
      float u = vUv.x, v = vUv.y, a = 0.0; vec3 c = uCol;
      if (uMode < 0.5) {
        float span = max(uHead - uTail, 0.001);
        float s = clamp((u - uTail) / span, 0.0, 1.0);
        float vis = step(uTail, u) * step(u, uHead);
        float prof = pow(max(sin(3.14159 * pow(s, 0.6)), 0.0), 0.75);
        float inner = 1.0 - prof;
        float body = smoothstep(inner, inner + 0.3, v);
        float fl = noise(vec2(u * 16.0 + uSeed * 7.0 - uTime * 4.0, v * 7.0 + uSeed));
        float streak = smoothstep(0.32, 0.8, noise(vec2(u * 2.5 + uSeed, v * 26.0 + uSeed * 5.0)));
        float edge = smoothstep(0.8, 0.95, v) * smoothstep(1.0, 0.975, v);
        float fade = mix(0.2, 1.0, s * s);
        a = vis * body * fade * (0.22 + 0.9 * streak * fl + edge * 1.8);
        c = mix(uCol2, uCol, smoothstep(0.15, 0.85, v)) + vec3(1.0) * edge * s * 0.9;
      } else if (uMode < 1.5) {
        float band = smoothstep(0.0, 0.55, v) * smoothstep(1.0, 0.8, v);
        float n = noise(vec2(u * 46.0 + uSeed, v * 3.0 - uTime * 3.0));
        float edge = smoothstep(0.7, 0.88, v) * smoothstep(1.0, 0.9, v);
        a = band * (0.35 + n * 0.9) + edge * 1.1;
        c = mix(uCol2, uCol, v) + vec3(1.0) * edge * 0.6;
      } else if (uMode < 2.5) {
        float n = noise(vec2(u * 64.0 + uSeed * 13.0, v * 2.5));
        float n2 = noise(vec2(u * 21.0 + uSeed, v * 7.0));
        a = (smoothstep(0.74, 0.86, n) + smoothstep(0.8, 0.92, n2) * 0.7) * (1.0 - v) * (1.0 - v) * 2.0;
      } else {
        float rim = smoothstep(0.93, 0.965, v);
        float fill = step(v, uHead) * (0.22 + 0.14 * sin(uTime * 22.0));
        a = max(rim, fill) + smoothstep(uHead - 0.06, uHead, v) * step(v, uHead) * 0.8;
      }
      a *= uAlpha;
      gl_FragColor = vec4(c * a * uGain, a);
    }`;
  const arcs = [];
  for (let i = 0; i < (Q.mobile ? 30 : 48); i++) {
    const mat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uA0: { value: 0 }, uA1: { value: 1 }, uR0: { value: 1 }, uR1: { value: 2 }, uLift: { value: 0 }, uCol: { value: new THREE.Color() }, uCol2: { value: new THREE.Color() }, uHead: { value: 0 }, uTail: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: 0 }, uTime: { value: 0 }, uMode: { value: 0 }, uGain: { value: 3 } },
      vertexShader: ARC_VS, fragmentShader: ARC_FS }, ADD));
    const mesh = new THREE.Mesh(arcGeo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.rotation.order = 'YXZ'; mesh.renderOrder = 8; scene.add(mesh);
    arcs.push({ mesh, u: mat.uniforms, live: false, t: 0, total: 1 });
  }
  function arc(o) {
    let a = null;
    for (const b of arcs) if (!b.live) { a = b; break; }
    if (!a) { a = arcs[0]; for (const b of arcs) if (b.t / b.total > a.t / a.total) a = b; }
    a.live = true; a.t = 0; a.sweep = o.sweep === undefined ? .12 : o.sweep; a.hold = o.hold || 0; a.fade = o.fade === undefined ? .24 : o.fade; a.total = a.sweep + a.hold + a.fade;
    a.follow = o.follow || null; a.y = o.y || 0; a.grow0 = o.grow0 === undefined ? 1 : o.grow0; a.grow1 = o.grow1 === undefined ? 1 : o.grow1;
    a.mode = o.mode || 0; a.spin = o.spin || 0; a.delay = o.delay || 0; a.vel = o.vel || null;
    const u = a.u; u.uA0.value = o.a0 === undefined ? 0 : o.a0; u.uA1.value = o.a1 === undefined ? TAU : o.a1; u.uR0.value = o.r0; u.uR1.value = o.r1; u.uLift.value = o.lift || 0;
    u.uCol.value.copy(o.color); u.uCol2.value.copy(o.color2 || o.color); u.uSeed.value = Math.random() * 10; u.uMode.value = a.mode; u.uGain.value = o.gain === undefined ? 3 : o.gain;
    u.uHead.value = 0; u.uTail.value = 0; u.uAlpha.value = 1;
    a.mesh.position.copy(o.pos || o.follow.position); a.mesh.position.y += a.y;
    a.mesh.rotation.set(o.pitch || 0, o.yaw || 0, o.tilt || 0); a.mesh.scale.setScalar(a.grow0); a.mesh.visible = a.delay <= 0;
    return a;
  }
  const ring = (pos, r, color, o = {}) => arc(Object.assign({ pos, y: .1, r0: r * (1 - (o.thick || .3)), r1: r, mode: 1, color, sweep: 0, fade: o.life || .45, grow0: o.from === undefined ? .12 : o.from, grow1: 1 }, o));

  /* ---- streaks: thrusts, arrows, dash lines, lightning ---- */
  const stGeo = (() => {
    const g = new THREE.BufferGeometry(), p = [], uv = [], idx = [];
    for (let ax = 0; ax < 2; ax++) { const b = p.length / 3; for (const [s, t] of [[-.5, 0], [.5, 0], [.5, 1], [-.5, 1]]) { p.push(ax ? 0 : s, ax ? s : 0, t); uv.push(s + .5, t); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  })();
  const streaks = [];
  for (let i = 0; i < (Q.mobile ? 40 : 70); i++) {
    const mat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uCol: { value: new THREE.Color() }, uAlpha: { value: 1 }, uGain: { value: 3 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uCol; uniform float uAlpha, uGain; varying vec2 vUv;
        void main(){ float w = max(1.0 - abs(vUv.x * 2.0 - 1.0), 0.0); float a = pow(w, 2.5) * smoothstep(0.0, 0.7, vUv.y) * smoothstep(1.0, 0.94, vUv.y) * uAlpha;
          vec3 c = mix(uCol, vec3(1.0), pow(w, 9.0) * 0.8); gl_FragColor = vec4(c * a * uGain, a); }` }, ADD));
    const mesh = new THREE.Mesh(stGeo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 9; scene.add(mesh);
    const s = { mesh, u: mat.uniforms, live: false, t: 0, life: 1, w: 1, keep: false };
    s.set = (from, to) => { mesh.position.copy(from); mesh.lookAt(to); mesh.scale.set(s.w, s.w, Math.max(.01, from.distanceTo(to))); };
    s.kill = () => { s.keep = false; s.t = 0; s.life = .12; };
    streaks.push(s);
  }
  function streak(from, to, w, color, life, gain) {
    let s = null;
    for (const b of streaks) if (!b.live) { s = b; break; }
    if (!s) s = streaks[(Math.random() * streaks.length) | 0];
    s.live = true; s.t = 0; s.keep = life === 0; s.life = life || .2; s.w = w; s.u.uCol.value.copy(color); s.u.uGain.value = gain || 3; s.u.uAlpha.value = 1;
    s.set(from, to); s.mesh.visible = true; return s;
  }

  /* ---- domes ---- */
  const domeGeo = new THREE.SphereGeometry(1, 40, 18, 0, TAU, 0, Math.PI / 2);
  const domes = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uCol: { value: new THREE.Color() }, uAlpha: { value: 1 }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vUv = uv; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uCol; uniform float uAlpha, uTime; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){ float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), 2.2);
          float bands = smoothstep(0.86, 1.0, sin(vUv.y * 70.0 - uTime * 10.0) * 0.5 + 0.5);
          float ribs = smoothstep(0.94, 1.0, sin(vUv.x * 150.0) * 0.5 + 0.5) * 0.35;
          float a = (f * 1.6 + bands * 0.55 + ribs + 0.05) * uAlpha;
          gl_FragColor = vec4(mix(uCol, vec3(1.0), f * 0.5) * a * 2.6, a); }` }, ADD));
    const mesh = new THREE.Mesh(domeGeo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 7; scene.add(mesh);
    domes.push({ mesh, u: mat.uniforms, live: false, t: 0 });
  }
  function dome(pos, r, color, grow, hold, fade) {
    const d = domes.find(d => !d.live) || domes[0];
    d.live = true; d.t = 0; d.r = r; d.grow = grow; d.hold = hold; d.fade = fade; d.u.uCol.value.copy(color); d.mesh.position.copy(pos); d.mesh.position.y = 0; d.mesh.visible = true; d.mesh.scale.setScalar(.01);
  }

  /* ---- debris chunks ---- */
  const DN = Q.mobile ? 120 : 300;
  const debris = new THREE.InstancedMesh(GEO.box, new THREE.MeshStandardMaterial({ roughness: .55, metalness: .35, flatShading: true }), DN);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.castShadow = true; debris.frustumCulled = false; scene.add(debris);
  const dS = [], dM = new THREE.Matrix4(), dQ = new THREE.Quaternion(), dE = new THREE.Euler(), dV = V3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < DN; i++) { dS.push({ p: V3(), v: V3(), r: V3(), w: V3(), s: V3(), life: 0 }); debris.setMatrixAt(i, ZERO); debris.setColorAt(i, white); }
  let dHead = 0;
  function chunks(pos, n, colors, speed, dir) {
    if (Q.mobile) n = Math.ceil(n * .6);
    for (let k = 0; k < n; k++) {
      const i = dHead; dHead = (dHead + 1) % DN; const d = dS[i];
      d.p.set(pos.x + randS(.35), pos.y + rand(.3, 1.6), pos.z + randS(.35));
      d.v.set(randS(speed) + (dir ? dir.x * speed : 0), rand(2, speed * 1.2), randS(speed) + (dir ? dir.z * speed : 0));
      d.r.set(rand(TAU), rand(TAU), rand(TAU)); d.w.set(randS(14), randS(14), randS(14));
      const s = rand(.07, .24); d.s.set(s * rand(.6, 1.6), s * rand(.6, 1.6), s * rand(.6, 1.6)); d.life = rand(1.4, 2.6);
      debris.setColorAt(i, colors[(Math.random() * colors.length) | 0]);
    }
    debris.instanceColor.needsUpdate = true;
  }

  /* ---- light flashes ---- */
  const lights = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 16, 2); l.position.set(0, -50, 0); scene.add(l); lights.push({ l, t: 0, dur: 1, i0: 0 }); }
  let lHead = 0;
  function flash(pos, color, intensity, dur) { const L = lights[lHead]; lHead = (lHead + 1) % lights.length; L.l.color.copy(color); L.l.position.set(pos.x, pos.y + .6, pos.z); L.i0 = intensity; L.t = 0; L.dur = dur || .25; }

  function update(dt, rdt) {
    time += rdt;
    // sparks
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt; const j = i * 3;
      if (pLife[i] <= 0) { pSize[i] = 0; continue; }
      const dr = Math.exp(-pDr[i] * dt);
      pVel[j] *= dr; pVel[j + 2] *= dr; pVel[j + 1] = pVel[j + 1] * dr - pG[i] * dt;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      if (pPos[j + 1] < .04 && pVel[j + 1] < 0) { pPos[j + 1] = .04; pVel[j + 1] *= -.35; pVel[j] *= .6; pVel[j + 2] *= .6; }
      pSize[i] = pS0[i] * Math.sqrt(pLife[i] / pMax[i]);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.aColor.needsUpdate = pGeo.attributes.aSize.needsUpdate = true;
    pMat.uniforms.uScale.value = GFX.ph / (2 * Math.tan(GFX.camera.fov * DEG / 2));
    // arcs
    for (const a of arcs) {
      if (!a.live) continue;
      if (a.delay > 0) { a.delay -= dt; if (a.delay > 0) continue; a.mesh.visible = true; }
      a.t += dt; const u = a.u, k = clamp(a.t / a.total, 0, 1);
      if (a.follow) { a.mesh.position.copy(a.follow.position); a.mesh.position.y += a.y; }
      if (a.vel) a.mesh.position.addScaledVector(a.vel, dt);
      if (a.spin) a.mesh.rotation.y += a.spin * dt;
      if (a.mode === 0) {
        const h = a.sweep > 0 ? clamp(a.t / a.sweep, 0, 1) : 1; u.uHead.value = 1 - (1 - h) * (1 - h);
        const f = clamp((a.t - a.sweep - a.hold) / a.fade, 0, 1); u.uTail.value = f * f * .8; u.uAlpha.value = 1 - f;
      } else if (a.mode === 3) {
        u.uHead.value = clamp(a.t / Math.max(.01, a.sweep + a.hold), 0, 1); u.uAlpha.value = 1 - clamp((a.t - a.sweep - a.hold) / a.fade, 0, 1);
      } else if (a.mode === 2) {
        u.uAlpha.value = (1 - clamp((a.t - a.sweep - a.hold) / a.fade, 0, 1)) * Math.min(1, a.t * 12);
      } else u.uAlpha.value = Math.pow(1 - k, 1.4);
      a.mesh.scale.setScalar(lerp(a.grow0, a.grow1, easeOut(k)));
      u.uTime.value = time;
      if (a.t >= a.total) { a.live = false; a.mesh.visible = false; a.follow = null; a.vel = null; }
    }
    for (const s of streaks) {
      if (!s.live) continue;
      if (!s.keep) { s.t += dt; s.u.uAlpha.value = 1 - s.t / s.life; if (s.t >= s.life) { s.live = false; s.mesh.visible = false; } }
    }
    for (const d of domes) {
      if (!d.live) continue; d.t += dt;
      d.mesh.scale.setScalar(d.r * easeOut(clamp(d.t / d.grow, 0, 1)) + .01);
      d.u.uAlpha.value = 1 - clamp((d.t - d.grow - d.hold) / d.fade, 0, 1); d.u.uTime.value = time;
      if (d.t > d.grow + d.hold + d.fade) { d.live = false; d.mesh.visible = false; }
    }
    // debris
    let any = false;
    for (let i = 0; i < DN; i++) {
      const d = dS[i]; if (d.life <= 0) continue; any = true;
      d.life -= dt; d.v.y -= 26 * dt; d.p.addScaledVector(d.v, dt); d.r.addScaledVector(d.w, dt);
      const fl = d.s.y * .5;
      if (d.p.y < fl) { d.p.y = fl; if (d.v.y < -2) { d.v.y *= -.4; d.w.multiplyScalar(.6); } else { d.v.y = 0; d.w.multiplyScalar(.85); } d.v.x *= .7; d.v.z *= .7; }
      if (d.life <= 0) { debris.setMatrixAt(i, ZERO); continue; }
      const k = Math.min(1, d.life * 2.5);
      dE.set(d.r.x, d.r.y, d.r.z); dQ.setFromEuler(dE); dV.copy(d.s).multiplyScalar(k); dM.compose(d.p, dQ, dV); debris.setMatrixAt(i, dM);
    }
    if (any) debris.instanceMatrix.needsUpdate = true;
    for (const L of lights) { if (L.i0 <= 0) continue; L.t += rdt; const k = 1 - L.t / L.dur; L.l.intensity = k > 0 ? L.i0 * k * k : 0; if (k <= 0) { L.i0 = 0; L.l.position.y = -50; } }
  }
  return { arc, ring, streak, dome, burst, chunks, flash, update, get time() { return time; } };
})();
