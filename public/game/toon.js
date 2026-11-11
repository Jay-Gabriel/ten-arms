'use strict';
/* ============ shared scratch values ============ */
const _v = V3(), _v2 = V3(), UP = V3(0, 1, 0);

/* ============ toon look: banded light, a rim in the weapon's colour, an inked hull ============ */
const TOON = (() => {
  // light ramp read by half-lambert: shadow behind the terminator, one mid step, then full light
  const bands = [.2, .2, .2, .2, .56, .56, 1, 1], px = new Uint8Array(bands.length * 4);
  bands.forEach((v, i) => { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(v * 255); px[i * 4 + 3] = 255; });
  const ramp = new THREE.DataTexture(px, bands.length, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  // rim: a back light over the camera's left shoulder, so one edge of every form catches the weapon's colour and the other stays inked
  const RIM = 'float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);\n\tfloat rimD = clamp(dot(normal, vec3(-0.555, 0.807, -0.202)) * 0.75 + 0.42, 0.0, 1.0);\n\tgl_FragColor.rgb += uRim * smoothstep(0.6, 0.7, rimF) * rimD * rimD;\n\t#include <tonemapping_fragment>';
  // polished metal: the view reflected off each facet reads a bright horizon line, a pale sky above it and one hot glint.
  // The facets are flat, so as a blade turns whole faces flash on and off.
  const SHINE = '\n\tvec3 sR = reflect(-normalize(vViewPosition), normal);\n\tgl_FragColor.rgb += uShine * (smoothstep(-0.03, 0.03, sR.y) * (1.0 - smoothstep(0.03, 0.4, sR.y)) * 0.7 + smoothstep(0.3, 0.95, sR.y) * 0.2 + pow(max(dot(sR, vec3(-0.38, 0.62, 0.69)), 0.0), 40.0) * 2.6);\n';
  function mat(hex, rim, inked, extra, shine) {
    const m = new THREE.MeshToonMaterial(Object.assign({ color: col(hex), gradientMap: ramp }, extra));
    m.userData.ink = inked !== false;
    const uShine = shine ? { value: shine.isColor ? shine : new THREE.Color(1, 1, 1).multiplyScalar(shine) } : null;
    m.onBeforeCompile = sh => {
      sh.uniforms.uRim = rim; let fs = sh.fragmentShader.replace('#include <tonemapping_fragment>', RIM);
      if (uShine) { sh.uniforms.uShine = uShine; fs = 'uniform vec3 uShine;\n' + fs.replace('\t#include <tonemapping_fragment>', SHINE + '\t#include <tonemapping_fragment>'); }
      sh.fragmentShader = 'uniform vec3 uRim;\n' + fs;
    };
    if (uShine) m.customProgramCacheKey = () => 'shine';
    return m;
  }
  const metal = (hex, rim, shine, inked) => mat(hex, rim, inked, null, shine === undefined ? 1 : shine);
  // the outline: every inked mesh is drawn a second time, back faces only, pushed outward by a width that stays constant on screen
  const fog = GFX.scene.fog;
  const ink = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uT: { value: .0038 }, uCol: { value: col(0x0a0712) }, uFogC: { value: fog.color }, uFogD: { value: fog.density } },
    vertexShader: `attribute vec3 aOut; uniform float uT, uFogD; varying float vFog;
      void main(){
        vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        float z = -(modelViewMatrix * vec4(position, 1.0)).z;
        vec4 mv = modelViewMatrix * vec4(position + aOut * (uT * clamp(z, 1.5, 40.0) / s), 1.0);
        gl_Position = projectionMatrix * mv; vFog = 1.0 - exp(-uFogD * uFogD * mv.z * mv.z); }`,
    fragmentShader: 'uniform vec3 uCol, uFogC; varying float vFog; void main(){ gl_FragColor = vec4(mix(uCol, uFogC, vFog), 1.0); }',
  });
  // the same hull for a skinned mesh: the outline direction is carried through the bones along with the vertex
  const inkSkin = new THREE.ShaderMaterial({
    side: THREE.BackSide, skinning: true, uniforms: ink.uniforms, fragmentShader: ink.fragmentShader,
    vertexShader: `attribute vec3 aOut; uniform float uT, uFogD; varying float vFog;
      #include <skinning_pars_vertex>
      void main(){
        vec3 transformed = position; vec3 objectNormal = aOut;
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <skinning_vertex>
        vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        float z = -(modelViewMatrix * vec4(transformed, 1.0)).z;
        vec4 mv = modelViewMatrix * vec4(transformed + objectNormal * (uT * clamp(z, 1.5, 40.0) / s), 1.0);
        gl_Position = projectionMatrix * mv; vFog = 1.0 - exp(-uFogD * uFogD * mv.z * mv.z); }`,
  });
  // aOut: normals welded across hard edges and mitred, so the hull stays closed at the corners of a box
  function prep(g) {
    if (g.attributes.aOut) return g;
    const p = g.attributes.position, n = g.attributes.normal, map = new Map(), out = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const key = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      let e = map.get(key); if (!e) map.set(key, e = { ns: [], idx: [] }); e.idx.push(i);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      if (!e.ns.some(m => m[0] * nx + m[1] * ny + m[2] * nz > .999)) e.ns.push([nx, ny, nz]);
    }
    map.forEach(e => {
      let x = 0, y = 0, z = 0; for (const m of e.ns) { x += m[0]; y += m[1]; z += m[2]; }
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      let d = 0; for (const m of e.ns) d += m[0] * x + m[1] * y + m[2] * z; d = Math.max(d / e.ns.length, .5);
      for (const i of e.idx) { out[i * 3] = x / d; out[i * 3 + 1] = y / d; out[i * 3 + 2] = z / d; }
    });
    g.setAttribute('aOut', new THREE.BufferAttribute(out, 3)); return g;
  }
  function hull(m) { prep(m.geometry); const o = new THREE.Mesh(m.geometry, ink); o.matrixAutoUpdate = false; o.userData.hull = true; m.add(o); return o; }
  return { mat, metal, hull, prep, ink, inkSkin };
})();

function part(geo, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true;
  if (mat.userData.ink) TOON.hull(m);
  return m;
}
const turned = (m, x, y, z) => { m.rotation.set(x || 0, y || 0, z || 0); return m; };

/* ============ a few more shared shapes ============ */
(() => {
  Object.assign(GEO, {
    tube: new THREE.CylinderGeometry(1, 1, 1, 14),
    hat: (() => { const g = new THREE.ConeGeometry(1, 1, 24); g.translate(0, .5, 0); return g; })(),
  });
})();

/* ============ cloth: a ribbon dragged along by a joint, with a little weight of its own ============ */
function makeRibbon(o) {
  const n = o.n, L = o.seg, P = [], Vel = [], pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) { P.push(V3()); Vel.push(V3()); }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
  pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', pa); geo.setAttribute('normal', na); geo.setIndex(idx);
  const uv = new Float32Array(n * 4); for (let i = 0; i < n; i++) { uv[i * 4 + 1] = uv[i * 4 + 3] = i / (n - 1); uv[i * 4 + 2] = 1; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));   // across, then root → tip
  for (const m of o.mats) { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.castShadow = !!o.shadow; GFX.scene.add(mesh); }
  const anchor = V3(), side0 = V3(), side = V3(), tan = V3(), nrm = V3(), off = V3(o.off[0], o.off[1], o.off[2]);
  let fresh = true;
  function update(dt, t, body) {
    anchor.copy(off).applyMatrix4(o.joint.matrixWorld);
    if (o.side) side0.set(o.side[0], o.side[1], o.side[2]).transformDirection(o.joint.matrixWorld);
    if (fresh) { fresh = false; for (let i = 0; i < n; i++) { P[i].set(anchor.x, Math.max(.05, anchor.y - i * L), anchor.z); Vel[i].set(0, 0, 0); } }
    P[0].copy(anchor);
    if (dt > 1e-5) {
      const dr = Math.exp(-o.drag * dt), w = o.wind;
      for (let i = 1; i < n; i++) {
        const p = P[i], v = Vel[i], q = P[i - 1], ox = p.x, oy = p.y, oz = p.z;
        v.x = (v.x + (2.2 + Math.sin(t * 2.3 + i * .5) * 2.4) * w * dt) * dr;
        v.y = (v.y - (o.grav - Math.sin(t * 4 + i * .7) * 5.2 * w) * dt) * dr;
        v.z = (v.z + Math.cos(t * 3.1 + i * .6) * 2 * w * dt) * dr;
        const sp = v.length(); if (sp > 16) v.multiplyScalar(16 / sp);
        p.addScaledVector(v, dt);
        _v.subVectors(p, q); const l = _v.length() || 1e-4; p.copy(q).addScaledVector(_v, L / l);
        if (body && p.y < body.top) { const bx = p.x - body.x, bz = p.z - body.z, r = Math.hypot(bx, bz); if (r < body.r && r > 1e-4) { p.x = body.x + bx / r * body.r; p.z = body.z + bz / r * body.r; } }
        if (p.y < .05) p.y = .05;
        v.set((p.x - ox) / dt, (p.y - oy) / dt, (p.z - oz) / dt);
      }
    }
    for (let i = 0; i < n; i++) {
      tan.subVectors(P[Math.min(i + 1, n - 1)], P[Math.max(i - 1, 0)]).normalize();
      if (o.side) side.copy(side0).addScaledVector(tan, -side0.dot(tan)); else side.crossVectors(tan, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize(); nrm.crossVectors(tan, side);
      const w = lerp(o.w0, o.w1, i / (n - 1)), tw = o.side ? 0 : w * .3, p = P[i], j = i * 6;
      pos[j] = p.x + side.x * w; pos[j + 1] = p.y + side.y * w + tw; pos[j + 2] = p.z + side.z * w;
      pos[j + 3] = p.x - side.x * w; pos[j + 4] = p.y - side.y * w - tw; pos[j + 5] = p.z - side.z * w;
      nor[j] = nor[j + 3] = nrm.x; nor[j + 1] = nor[j + 4] = nrm.y; nor[j + 2] = nor[j + 5] = nrm.z;
    }
    pa.needsUpdate = na.needsUpdate = true;
  }
  return { update, reset() { fresh = true; } };
}
