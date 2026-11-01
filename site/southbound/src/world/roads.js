// Road surfaces, intersections, sidewalks, bridges and street lights.
import * as THREE from 'three';
import { CITY, TOWN } from './layout.js';
import { mulberry32 } from '../util.js';

function canvasTex(w, h, draw, anisotropy) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function asphalt(ctx, w, h, rnd) {
  ctx.fillStyle = '#2b2b2d';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.08; i++) {
    const v = 30 + rnd() * 40;
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // tyre wear bands
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (const f of [0.18, 0.32, 0.68, 0.82]) ctx.fillRect(w * f - w * 0.04, 0, w * 0.08, h);
  // cracks / patches
  ctx.strokeStyle = 'rgba(15,15,15,0.5)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rnd() * w, y = rnd() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

export function createRoads(graph, hm, quality, scene, collision) {
  const rnd = mulberry32(77);
  const group = new THREE.Group();
  group.name = 'roads';
  const an = quality.anisotropy;

  const hwTex = canvasTex(256, 512, (ctx, w, h) => {
    asphalt(ctx, w, h, rnd);
    ctx.fillStyle = '#d8d6cc';
    ctx.fillRect(w * 0.035, 0, w * 0.02, h);
    ctx.fillRect(w * 0.945, 0, w * 0.02, h);
    ctx.fillStyle = '#d9a11c';
    ctx.fillRect(w * 0.488, 0, w * 0.012, h);
    ctx.fillRect(w * 0.506, 0, w * 0.012, h);
  }, an);
  const stTex = canvasTex(256, 512, (ctx, w, h) => {
    asphalt(ctx, w, h, rnd);
    ctx.fillStyle = '#d9a11c';
    ctx.fillRect(w * 0.49, 0, w * 0.02, h * 0.5);
    ctx.fillStyle = '#cfcfc8';
    ctx.fillRect(w * 0.06, 0, w * 0.012, h);
    ctx.fillRect(w * 0.928, 0, w * 0.012, h);
  }, an);
  const ixTex = canvasTex(256, 256, (ctx, w, h) => asphalt(ctx, w, h, rnd), an);
  const roadMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const hwMat = roadMat(hwTex), stMat = roadMat(stTex);
  const ixMat = roadMat(ixTex);

  const ribbon = (pts, ys, width, trimStart, trimEnd, lift) => {
    const pos = [], uv = [], idx = [];
    let v = 0, count = 0;
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = acc[acc.length - 1];
    for (let i = 0; i < pts.length; i++) {
      if (acc[i] < trimStart - 0.01 || acc[i] > total - trimEnd + 0.01) continue;
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx, hw = width / 2, y = ys[i] + lift;
      pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
      v = acc[i] / width;
      uv.push(0, v, 1, v);
      if (count > 0) { const a = (count - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      count++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const lights = [];
  const hwGeos = [], stGeos = [];
  for (const e of graph.edges) {
    const isHw = e.kind === 'highway';
    // Street ribbons stop short of intersections; intersections get their own tile.
    const gridTrim = (id) => (id[0] === 'c' ? CITY.street / 2 : id[0] === 't' ? TOWN.street / 2 : 0);
    const g = ribbon(e.pts, e.ys, e.width, gridTrim(e.a), gridTrim(e.b), 0.1);
    (isHw ? hwGeos : stGeos).push(g);
    // street lights every ~40 m on alternating sides
    const step = isHw ? 6 : 5;
    for (let i = 2; i < e.pts.length - 1; i += step) {
      const p = e.pts[i], q = e.pts[i + 1];
      let dx = q[0] - p[0], dz = q[1] - p[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const side = (i / step) % 2 ? 1 : -1;
      const off = e.width / 2 + 1.2;
      lights.push({ x: p[0] - dz * off * side, z: p[1] + dx * off * side, y: e.ys[i], rot: Math.atan2(dx, dz), side });
    }
  }
  const merge = (geos) => {
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2); nrm.set(g.attributes.normal.array, vo * 3);
      const gi = g.index.array;
      for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      vo += g.attributes.position.count; io += gi.length;
      g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    m.computeBoundingSphere();
    return m;
  };
  const hwMesh = new THREE.Mesh(merge(hwGeos), hwMat);
  const stMesh = new THREE.Mesh(merge(stGeos), stMat);
  hwMesh.receiveShadow = stMesh.receiveShadow = true;
  group.add(hwMesh, stMesh);

  // Intersection tiles for street grids
  const ixGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ixNodes = [...graph.nodes.values()].filter((n) => n.id[0] === 'c' || n.id[0] === 't');
  const ix = new THREE.InstancedMesh(ixGeo, ixMat, ixNodes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  ixNodes.forEach((n, i) => {
    const G = n.id[0] === 'c' ? CITY : TOWN;
    m4.compose(p.set(n.x, G.height + 0.1, n.z), q.identity(), s.set(G.street, 1, G.street));
    ix.setMatrixAt(i, m4);
  });
  ix.receiveShadow = true;
  group.add(ix);

  // Sidewalk slabs for each city/town block
  const slabs = [];
  for (const G of [CITY, TOWN]) {
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.nz; j++) {
      const x = G.x0 + i * G.pitch + G.pitch / 2, z = G.z0 + j * G.pitch + G.pitch / 2;
      slabs.push({ x, z, w: G.pitch - G.street, y: G.height });
    }
  }
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9 });
  const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), slabMat, slabs.length);
  slabs.forEach((b, i) => { m4.compose(p.set(b.x, b.y - 0.1, b.z), q.identity(), s.set(b.w, 0.32, b.w)); slab.setMatrixAt(i, m4); });
  slab.receiveShadow = true;
  group.add(slab);
  // A curb rim (darker, slightly taller ring) gives blocks a crisp edge
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x6e6b66, roughness: 0.85 }), slabs.length);
  slabs.forEach((b, i) => { m4.compose(p.set(b.x, b.y - 0.12, b.z), q.identity(), s.set(b.w + 0.4, 0.3, b.w + 0.4)); curb.setMatrixAt(i, m4); });
  group.add(curb);

  // Bridges: deck, side walls, pillars
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const bridgeParts = [];
  for (const b of hm.bridges) {
    const dx = b.bx - b.ax, dz = b.bz - b.az, L = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2, my = (b.ya + b.yb) / 2;
    const pitch = Math.atan2(b.yb - b.ya, L);
    bridgeParts.push({ x: mx, y: my - 0.55, z: mz, sx: b.hw * 2 + 1.5, sy: 1.1, sz: L + 0.6, ry: ang, rx: -pitch });
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang) * (b.hw + 0.6) * side, oz = -Math.sin(ang) * (b.hw + 0.6) * side;
      bridgeParts.push({ x: mx + ox, y: my + 0.5, z: mz + oz, sx: 0.4, sy: 1.0, sz: L + 0.6, ry: ang, rx: -pitch });
    }
    const g = hm.height(mx, mz);
    if (my - g > 2) bridgeParts.push({ x: mx, y: (my + g) / 2 - 1, z: mz, sx: 3.0, sy: my - g + 1, sz: 2.2, ry: ang, rx: 0 });
    collision.addBridge(b);
  }
  if (bridgeParts.length) {
    const bm = new THREE.InstancedMesh(box, deckMat, bridgeParts.length);
    const e = new THREE.Euler();
    bridgeParts.forEach((b, i) => {
      e.set(b.rx, b.ry, 0, 'YXZ');
      m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e), s.set(b.sx, b.sy, b.sz));
      bm.setMatrixAt(i, m4);
    });
    bm.castShadow = bm.receiveShadow = true;
    group.add(bm);
  }

  // Street lights: pole + arm + glowing head
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc77a, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0), poleMat, lights.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), headMat, lights.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), poleMat, lights.length);
  lights.forEach((l, i) => {
    const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
    m4.compose(p.set(l.x, l.y, l.z), q, s.set(1, 1, 1)); poles.setMatrixAt(i, m4);
    const fx = Math.sin(r), fz = Math.cos(r);
    m4.compose(p.set(l.x + fx * 1.0, l.y + 7.9, l.z + fz * 1.0), q, s.set(1, 1, 1)); arms.setMatrixAt(i, m4);
    m4.compose(p.set(l.x + fx * 1.9, l.y + 7.8, l.z + fz * 1.9), q, s.set(1, 1, 1)); heads.setMatrixAt(i, m4);
    collision.addCircle(l.x, l.z, 0.25);
  });
  poles.castShadow = quality.shadows >= 2;
  group.add(poles, heads, arms);

  scene.add(group);
  return {
    group, lights,
    update(night) { headMat.emissiveIntensity = night * 6; },
  };
}
