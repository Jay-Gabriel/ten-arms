'use strict';
/* ============ the forge: blades, hafts, guards and armour plates built from cross-sections ============
   Everything comes out flat-shaded, so each facet takes its own band of the toon ramp and steel reads as ground metal. */
const FORGE = (() => {
  /* loose triangles → one closed, outward-facing geometry: slivers dropped, the whole thing turned over if it was wound inside out */
  function solid(T) {
    const out = []; let vol = 0;
    for (let i = 0; i < T.length; i += 9) {
      const ax = T[i], ay = T[i + 1], az = T[i + 2], ux = T[i + 3] - ax, uy = T[i + 4] - ay, uz = T[i + 5] - az, vx = T[i + 6] - ax, vy = T[i + 7] - ay, vz = T[i + 8] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * cx + cy * cy + cz * cz < 1e-18) continue;
      vol += ax * cx + ay * cy + az * cz; for (let k = 0; k < 9; k++) out.push(T[i + k]);
    }
    if (vol < 0) for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k++) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.computeVertexNormals(); return g;
  }
  /* rings of [x, y, z], each a closed loop of the same length, skinned in order and capped at both ends */
  function loft(rings) {
    const T = [], n = rings[0].length, tri = (a, b, c) => T.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let r = 0; r < rings.length - 1; r++) { const A = rings[r], B = rings[r + 1]; for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], B[i], B[j]); tri(A[i], B[j], A[j]); } }
    const cap = (R, flip) => { const c = [0, 0, 0]; for (const p of R) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; } for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (flip) tri(c, R[j], R[i]); else tri(c, R[i], R[j]); } };
    cap(rings[0], false); cap(rings[rings.length - 1], true);
    return solid(T);
  }
  /* an ellipse of n points about the Y axis at height y (rot turns it, so an octagon can sit flat or on a corner) */
  const ring = (rx, rz, y, n, rot) => { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rot || 0); out.push([Math.sin(a) * rx, y, Math.cos(a) * rz]); } return out; };
  /* turned about Y: profile [[r, y], …] from one end to the other; r = 0 at an end closes it. [r, y, rz] makes that ring oval. */
  const lathe = (prof, n, rot) => loft(prof.map(p => ring(p[0], p[2] === undefined ? p[0] : p[2], p[1], n, rot)));
  /* a curved plate: a closed [r, y] outline swept about Y from angle a0 to a1 (0 = +Z), so its cut ends are capped */
  function shell(outline, a0, a1, steps) {
    const rings = []; for (let s = 0; s <= steps; s++) { const a = a0 + (a1 - a0) * s / steps, sn = Math.sin(a), cs = Math.cos(a); rings.push(outline.map(([r, y]) => [sn * r, y, cs * r])); }
    return loft(rings);
  }
  /* a blade running down -Y, from stations [y, edge x, back x, half-thickness at the ridge, ridge 0..1 from the edge, half-thickness of the back].
     back thickness 0 = a second edge. The last station usually closes to a point. */
  const sect = (y, xa, xb, t, k, tb) => { const xr = xa + (xb - xa) * (k === undefined ? .5 : k); tb = tb || 0; return [[xa, y, 0], [xr, y, t], [xb, y, tb], [xb, y, -tb], [xr, y, -t]]; };
  const blade = st => loft(st.map(s => sect(s[0], s[1], s[2], s[3], s[4], s[5])));
  /* the bevel along edge a, as a sliver standing just proud of both faces: this is what glows */
  function edge(st, w, lift) {
    lift = lift || .0025;
    return loft(st.map(([y, xa, xb, t, k]) => {
      const xr = xa + (xb - xa) * (k === undefined ? .5 : k), d = Math.abs(xr - xa), f = d > 1e-5 ? Math.min(1, w / d) : 1, x = xa + (xr - xa) * f, z = t * f + lift, s = Math.sign(xr - xa) || 1;
      return [[xa - s * lift, y, 0], [x, y, z], [x, y, -z]];
    }));
  }
  const backEdge = st => st.map(([y, xa, xb, t, k, tb]) => [y, xb, xa, t, 1 - (k === undefined ? .5 : k), tb]);
  /* a groove of light down the ridge (a fuller), between two heights */
  function fuller(st, w, y0, y1, lift) {
    lift = lift || .0025; const rows = [];
    const at = y => { for (let i = 0; i < st.length - 1; i++) { const A = st[i], B = st[i + 1]; if ((y <= A[0] && y >= B[0]) || (y >= A[0] && y <= B[0])) { const k = (y - A[0]) / ((B[0] - A[0]) || 1); return A.map((v, j) => v === undefined ? undefined : v + ((B[j] === undefined ? v : B[j]) - v) * k); } } return st[st.length - 1]; };
    const N = 8; for (let i = 0; i <= N; i++) {
      const y = y0 + (y1 - y0) * i / N, [, xa, xb, t, k0, tb0] = at(y), k = k0 === undefined ? .5 : k0, tb = tb0 || 0, xr = xa + (xb - xa) * k, s = Math.sign(xb - xa) || 1;
      const ww = w * (i === 0 || i === N ? .35 : 1), za = t * (1 - ww / Math.max(1e-4, Math.abs(xr - xa))), zb = t + (tb - t) * ww / Math.max(1e-4, Math.abs(xb - xr));
      rows.push([[xr - s * ww, y, za + lift], [xr, y, t + lift], [xr + s * ww, y, zb + lift], [xr + s * ww, y, -zb - lift], [xr, y, -t - lift], [xr - s * ww, y, -za - lift]]);
    }
    return loft(rows);
  }
  /* a flat outline [[x, y], …] given depth along Z, its rim chamfered */
  function slab(pts, depth, bevel) {
    const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 1, steps: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
  }
  /* points on an arc, for outlines */
  const arc = (cx, cy, r, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
  /* a tube swept along a path of [x, y, z] points; side is a fixed direction across it; size(k) → [across, through] radii */
  function sweep(path, side, size, n) {
    const S = new THREE.Vector3().fromArray(side).normalize(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), rings = [];
    path.forEach((p, i) => {
      T.fromArray(path[Math.min(i + 1, path.length - 1)]).sub(new THREE.Vector3().fromArray(path[Math.max(i - 1, 0)])).normalize();
      B.copy(S).addScaledVector(T, -S.dot(T)).normalize(); N.crossVectors(T, B);
      const [ra, rb] = size(i / (path.length - 1)), R = [];
      for (let j = 0; j < n; j++) { const a = j / n * TAU, c = Math.cos(a) * ra, s = Math.sin(a) * rb; R.push([p[0] + B.x * c + N.x * s, p[1] + B.y * c + N.y * s, p[2] + B.z * c + N.z * s]); }
      rings.push(R);
    });
    return loft(rings);
  }
  /* a wrapped grip: an oval post with a ridge at every turn of the cord, from y0 down to y1 */
  function grip(rx, rz, y0, y1, turns, n) {
    const prof = [[0, y0]]; for (let i = 0; i <= turns * 2; i++) { const k = i % 2 ? 1.14 : 1; prof.push([rx * k, y0 + (y1 - y0) * i / (turns * 2), rz * k]); } prof.push([0, y1]);
    return lathe(prof, n || 8, Math.PI / 8);
  }
  return { solid, loft, ring, lathe, shell, sect, blade, edge, backEdge, fuller, slab, arc, sweep, grip };
})();
