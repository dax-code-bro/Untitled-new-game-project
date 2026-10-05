// Placeholder dragon built from primitives (a real character model comes in a
// later milestone). Everything is posed as a pure function of time t.
//
//   const dragon = createDragon(THREE, { scale: 1 });
//   scene.add(dragon.root);
//   // in update(t): place dragon.root, then
//   dragon.pose(t);
//
// Local frame: +z = forward (head), +y = up, wings along +-x.

const srgb = (THREE, r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// 1-D Catmull-Rom through (s, value) control points
function profile(points, s) {
  let i = 0;
  while (i < points.length - 2 && s > points[i + 1][0]) i++;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (s - p1[0]) / (p2[0] - p1[0])));
  const a = p1[1], b = p2[1], m1 = (p2[1] - p0[1]) * 0.5, m2 = (p3[1] - p1[1]) * 0.5;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * m2;
}

const RADIUS = [[0, 0.72], [0.16, 0.95], [0.33, 1.85], [0.47, 1.62], [0.6, 1.05], [0.8, 0.48], [1, 0.07]];

export function createDragon(THREE, opts = {}) {
  const L = 24;                 // spine length (neck base -> tail tip)
  const SEG = 48, RAD = 14;
  const flapHz = opts.flapHz ?? 0.55;
  const root = new THREE.Group();
  root.name = 'dragon';
  const body = new THREE.Group();          // everything below is in "body" space
  body.scale.setScalar(opts.scale ?? 1);
  root.add(body);

  const scaleTop = srgb(THREE, 0.40, 0.065, 0.045);
  const scaleRidge = srgb(THREE, 0.22, 0.03, 0.025);
  const belly = srgb(THREE, 0.80, 0.60, 0.34);
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12 });
  const darkSkin = new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.25, 0.04, 0.03), roughness: 0.55, metalness: 0.1 });
  const membrane = new THREE.MeshStandardMaterial({
    color: srgb(THREE, 0.55, 0.13, 0.08), roughness: 0.75, metalness: 0, side: THREE.DoubleSide,
    emissive: srgb(THREE, 0.25, 0.04, 0.0), emissiveIntensity: 0.35,   // fake light bleeding through the membrane
  });
  const ivory = new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.88, 0.83, 0.68), roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: srgb(THREE, 1.0, 0.62, 0.12), emissiveIntensity: 4 });

  // ---------------------------------------------------------------- body tube
  const nV = (SEG + 1) * RAD;
  const tubeGeo = new THREE.BufferGeometry();
  const tubePos = new Float32Array(nV * 3);
  const tubeCol = new Float32Array(nV * 3);
  const idx = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD), c = (i + 1) * RAD + j, d = (i + 1) * RAD + ((j + 1) % RAD);
    idx.push(a, c, b, b, c, d);
  }
  for (let i = 0; i <= SEG; i++) for (let j = 0; j < RAD; j++) {
    const phi = (j / RAD) * Math.PI * 2;            // 0 = right side, pi/2 = top
    const up = Math.sin(phi);
    const col = up < -0.25 ? belly.clone().lerp(scaleTop, Math.max(0, (up + 0.6) / 0.35) * 0.0) :
      (up > 0.92 ? scaleRidge : scaleTop.clone().lerp(belly, Math.max(0, -up) * 0.9));
    const k = (i * RAD + j) * 3;
    tubeCol[k] = col.r; tubeCol[k + 1] = col.g; tubeCol[k + 2] = col.b;
  }
  tubeGeo.setIndex(idx);
  tubeGeo.setAttribute('position', new THREE.BufferAttribute(tubePos, 3).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(tubeCol, 3));
  tubeGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const tube = new THREE.Mesh(tubeGeo, skin);
  tube.castShadow = true; tube.receiveShadow = true;
  tube.frustumCulled = false;
  body.add(tube);

  // dorsal spikes
  const SPIKES = 22;
  const spikeGeo = new THREE.ConeGeometry(0.28, 1.1, 6);
  spikeGeo.translate(0, 0.45, 0);
  const spikes = new THREE.InstancedMesh(spikeGeo, ivory, SPIKES);
  spikes.castShadow = true;
  spikes.frustumCulled = false;
  body.add(spikes);

  // tail spade
  const spade = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), darkSkin);
  spade.scale.set(1.3, 0.18, 1.9);
  spade.castShadow = true;
  body.add(spade);

  // ------------------------------------------------------------------- head
  const head = new THREE.Group();
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
  skull.scale.set(1.05, 0.85, 1.3); skull.position.set(0, 0.25, 0.5);
  // the skull uses vertex colours from skin material -> give it a colour attribute
  setColor(THREE, skull.geometry, scaleTop);
  const snoutGeo = new THREE.CylinderGeometry(0.42, 0.85, 2.8, 12, 1);
  snoutGeo.rotateX(Math.PI / 2);
  setColor(THREE, snoutGeo, scaleTop);
  const snout = new THREE.Mesh(snoutGeo, skin);
  snout.scale.set(1, 0.72, 1); snout.position.set(0, 0.05, 2.1);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 2.5), darkSkin);
  jaw.geometry.translate(0, 0, 1.15);
  jaw.position.set(0, -0.42, 0.75);
  const hornGeo = new THREE.ConeGeometry(0.24, 2.4, 8);
  hornGeo.translate(0, 1.2, 0);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(hornGeo, ivory);
    horn.position.set(side * 0.55, 0.75, -0.05);
    horn.rotation.set(-2.15, 0, side * -0.35);
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), eyeMat);
    eye.position.set(side * 0.62, 0.48, 1.05);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.9), darkSkin);
    brow.position.set(side * 0.55, 0.68, 1.0); brow.rotation.set(0.2, side * 0.25, 0);
    head.add(brow);
  }
  for (const m of [skull, snout, jaw]) { m.castShadow = true; head.add(m); }
  head.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  head.scale.setScalar(1.25);

  // ---------------------------------------------------------- wings + legs
  const boneGeo = (len, r0, r1, side) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
    g.rotateZ(-side * Math.PI / 2);
    g.translate(side * len / 2, 0, 0);
    return g;
  };
  const FINGERS = [ // angle back from straight-out (radians), length
    [-0.18, 10.5], [0.38, 10.0], [0.92, 8.6], [1.42, 6.8],
  ];
  const wings = [];
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    body.add(shoulder);
    const upper = new THREE.Mesh(boneGeo(5.5, 0.42, 0.3, side), darkSkin);
    shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.set(side * 5.5, 0, 0);
    shoulder.add(elbow);
    const fore = new THREE.Mesh(boneGeo(6.5, 0.3, 0.22, side), darkSkin);
    elbow.add(fore);
    const wrist = new THREE.Group(); wrist.position.set(side * 6.5, 0, 0);
    elbow.add(wrist);
    const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), ivory);
    thumb.rotation.set(Math.PI / 2, 0, 0); thumb.position.set(0, 0.1, 0.45);
    wrist.add(thumb);
    const fingers = FINGERS.map(([ang, len]) => {
      const g = new THREE.Group();
      wrist.add(g);
      const spar = new THREE.Mesh(boneGeo(len, 0.17, 0.05, side), darkSkin);
      g.add(spar);
      const tip = new THREE.Object3D(); tip.position.set(side * len, 0, 0);
      g.add(tip);
      return { g, ang, tip };
    });
    for (const o of [upper, fore, ...fingers.map((f) => f.g.children[0])]) o.castShadow = true;

    // membrane: shared vertices S,E,W,F1..F4,M1..M4,H,B
    const mGeo = new THREE.BufferGeometry();
    const MV = 13;
    mGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    mGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // indices: 0 S, 1 E, 2 W, 3..6 F1..F4, 7..9 M12 M23 M34, 10 M4H, 11 H, 12 B
    const tri = [
      [2, 3, 7], [2, 7, 4], [2, 4, 8], [2, 8, 5], [2, 5, 9], [2, 9, 6],
      [2, 6, 10], [2, 10, 11], [1, 2, 11], [1, 11, 12], [0, 1, 12],
    ];
    const ind = [];
    for (const t of tri) ind.push(...(side > 0 ? t : [t[0], t[2], t[1]]));
    mGeo.setIndex(ind);
    const mem = new THREE.Mesh(mGeo, membrane);
    mem.castShadow = true; mem.receiveShadow = true;
    mem.frustumCulled = false;
    body.add(mem);
    wings.push({ side, shoulder, elbow, wrist, fingers, mem });
  }

  const legs = [];
  const thighGeo = new THREE.CylinderGeometry(0.45, 0.6, 3.2, 8); thighGeo.translate(0, -1.6, 0);
  const shinGeo = new THREE.CylinderGeometry(0.25, 0.4, 2.8, 8); shinGeo.translate(0, -1.4, 0);
  const clawGeo = new THREE.ConeGeometry(0.12, 0.7, 5); clawGeo.rotateX(Math.PI / 2); clawGeo.translate(0, 0, 0.35);
  for (const [s, side, size] of [[0.31, 1, 0.65], [0.31, -1, 0.65], [0.5, 1, 1], [0.5, -1, 1]]) {
    const hip = new THREE.Group();
    const thigh = new THREE.Mesh(thighGeo, darkSkin);
    const knee = new THREE.Group(); knee.position.set(0, -3.2, 0);
    const shin = new THREE.Mesh(shinGeo, darkSkin);
    const foot = new THREE.Group(); foot.position.set(0, -2.8, 0);
    for (let c = -1; c <= 1; c++) { const cl = new THREE.Mesh(clawGeo, ivory); cl.rotation.y = c * 0.3; cl.position.x = c * 0.18; foot.add(cl); }
    hip.add(thigh); hip.add(knee); knee.add(shin); knee.add(foot);
    hip.scale.setScalar(size);
    thigh.castShadow = shin.castShadow = true;
    body.add(hip);
    legs.push({ s, side, hip, knee });
  }

  // ------------------------------------------------------------- posing
  const spine = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  const tangents = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  const radii = new Float32Array(SEG + 1);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const bodyInv = new THREE.Matrix4();

  function spinePoint(s, t, out) {
    const ph = 2 * Math.PI * flapHz * t;
    const z = 8 - s * L;
    let y = 1.9 * Math.pow(Math.max(0, 1 - s / 0.26), 2) - 0.35 * Math.sin(Math.PI * Math.min(1, s / 0.6));
    const tailW = Math.max(0, (s - 0.45) / 0.55);
    const x = 1.6 * tailW * tailW * Math.sin(ph * 0.5 - s * 6.0) + 0.25 * Math.sin(ph * 0.5 + 1.0) * (1 - s);
    y += 0.9 * tailW * tailW * Math.sin(ph - s * 5.0) + 0.25 * Math.sin(ph + Math.PI) * (1 - s);
    return out.set(x, y, z);
  }

  function radiusAt(s) { return profile(RADIUS, s); }

  function pose(t) {
    const ph = 2 * Math.PI * flapHz * t;
    for (let i = 0; i <= SEG; i++) { spinePoint(i / SEG, t, spine[i]); radii[i] = radiusAt(i / SEG); }
    for (let i = 0; i <= SEG; i++) {
      const a = spine[Math.max(0, i - 1)], c = spine[Math.min(SEG, i + 1)];
      tangents[i].subVectors(a, c).normalize();     // points forward (toward the head)
    }
    // tube rings
    for (let i = 0; i <= SEG; i++) {
      const T = tangents[i];
      b.crossVectors(up, T).normalize();            // side
      n.crossVectors(T, b).normalize();             // local up
      const r = radii[i];
      for (let j = 0; j < RAD; j++) {
        const phi = (j / RAD) * Math.PI * 2;
        const cx = Math.cos(phi) * r * 1.0, cy = Math.sin(phi) * r * 0.86;
        const k = (i * RAD + j) * 3;
        tubePos[k] = spine[i].x + b.x * cx + n.x * cy;
        tubePos[k + 1] = spine[i].y + b.y * cx + n.y * cy;
        tubePos[k + 2] = spine[i].z + b.z * cx + n.z * cy;
      }
    }
    tubeGeo.attributes.position.needsUpdate = true;
    tubeGeo.computeVertexNormals();
    tubeGeo.computeBoundingSphere();

    // spikes along the back
    for (let k = 0; k < SPIKES; k++) {
      const s = 0.03 + (k / (SPIKES - 1)) * 0.82;
      const i = Math.round(s * SEG);
      const T = tangents[i];
      b.crossVectors(up, T).normalize(); n.crossVectors(T, b).normalize();
      tmp.copy(spine[i]).addScaledVector(n, radii[i] * 0.8);
      m4.makeBasis(b, n, T);
      q.setFromRotationMatrix(m4);
      const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6);
      q.multiply(lean);
      const sz = 0.5 + radii[i] * 0.5;
      sc.set(sz, sz, sz);
      m4.compose(tmp, q, sc);
      spikes.setMatrixAt(k, m4);
    }
    spikes.instanceMatrix.needsUpdate = true;

    // tail spade
    spade.position.copy(spine[SEG]).addScaledVector(tangents[SEG], -1.2);
    m4.lookAt(spine[SEG - 1], spine[SEG], up);
    spade.quaternion.setFromRotationMatrix(m4);

    // head looks along the neck, slight nod
    head.position.copy(spine[0]).addScaledVector(tangents[0], 0.4);
    tmp.copy(spine[0]).add(tangents[0]);
    m4.lookAt(tmp, spine[0], up);
    head.quaternion.setFromRotationMatrix(m4);
    head.rotateX(0.15 + 0.06 * Math.sin(ph + 0.5));
    jaw.rotation.set(0.12 + 0.08 * Math.sin(ph * 0.5), 0, 0);

    // wings
    const flap = 0.22 + 0.82 * Math.sin(ph);                  // up/down
    const fold = 0.32 + 0.30 * (0.5 + 0.5 * Math.sin(ph - 0.9));
    const spread = 0.88 + 0.14 * Math.sin(ph - 1.3);
    const si = Math.round(0.3 * SEG);
    for (const w of wings) {
      const T = tangents[si];
      b.crossVectors(up, T).normalize(); n.crossVectors(T, b).normalize();
      w.shoulder.position.copy(spine[si]).addScaledVector(b, w.side * radii[si] * 0.75).addScaledVector(n, radii[si] * 0.55);
      w.shoulder.rotation.set(0, w.side * (0.12 + 0.12 * Math.sin(ph + 0.4)), w.side * flap, 'YZX');
      w.elbow.rotation.set(0, w.side * fold, w.side * -0.25 * Math.sin(ph - 0.5));
      w.wrist.rotation.set(0, w.side * (fold * 0.6), w.side * -0.2 * Math.sin(ph - 0.9));
      for (const f of w.fingers) f.g.rotation.set(0, w.side * f.ang * spread, w.side * -0.12 * Math.sin(ph - 1.2));
    }
    body.updateMatrixWorld(true);
    bodyInv.copy(body.matrixWorld).invert();
    const local = (obj, out) => out.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(bodyInv);
    for (const w of wings) {
      const p = w.mem.geometry.attributes.position;
      const set = (i, vec) => p.setXYZ(i, vec.x, vec.y, vec.z);
      const S = local(w.shoulder, new THREE.Vector3());
      const E = local(w.elbow, new THREE.Vector3());
      const W = local(w.wrist, new THREE.Vector3());
      const F = w.fingers.map((f) => local(f.tip, new THREE.Vector3()));
      const hi = Math.round(0.53 * SEG), bi = Math.round(0.42 * SEG);
      const sideV = (i) => { const T = tangents[i]; return new THREE.Vector3().crossVectors(up, T).normalize().multiplyScalar(w.side * radii[i] * 0.8).add(spine[i]); };
      const H = sideV(hi), B = sideV(bi);
      set(0, S); set(1, E); set(2, W);
      F.forEach((f, i) => set(3 + i, f));
      // scalloped trailing edge: midpoints pulled toward the wrist
      for (let i = 0; i < 3; i++) set(7 + i, tmp.lerpVectors(F[i], F[i + 1], 0.5).lerp(W, 0.28));
      set(10, tmp.lerpVectors(F[3], H, 0.5).lerp(W, 0.3));
      set(11, H); set(12, B);
      p.needsUpdate = true;
      w.mem.geometry.computeVertexNormals();
    }

    // legs tucked back, swaying a little
    for (const l of legs) {
      const i = Math.round(l.s * SEG);
      const T = tangents[i];
      b.crossVectors(up, T).normalize(); n.crossVectors(T, b).normalize();
      l.hip.position.copy(spine[i]).addScaledVector(b, l.side * radii[i] * 0.55).addScaledVector(n, -radii[i] * 0.45);
      m4.lookAt(tmp.copy(spine[i]).add(T), spine[i], up);
      l.hip.quaternion.setFromRotationMatrix(m4);
      l.hip.rotateX(1.05 + 0.08 * Math.sin(ph + l.s * 3));
      l.knee.rotation.x = -1.45;
    }
  }

  return { root, body, pose, flapHz };
}

function setColor(THREE, geometry, color) {
  const n = geometry.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
