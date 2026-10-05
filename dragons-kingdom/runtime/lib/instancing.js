// Spatially tiled instancing (import from 'dk/instancing.js').
//
// One InstancedMesh with 20 000 trees is always drawn in full, even the parts
// behind the camera. Splitting instances into square tiles gives every tile its
// own bounding sphere, so three.js frustum-culls whole tiles - in the camera
// pass and in the shadow pass. On a CPU renderer that is a large saving.

/**
 * items: [{ matrix: Matrix4, color?: Color }]
 * returns a Group containing one InstancedMesh per non-empty tile
 */
export function createTiledInstances(THREE, geometry, material, items, { tileSize = 200, castShadow = false, receiveShadow = true, name = 'instances' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const tiles = new Map();
  const p = new THREE.Vector3();
  for (const it of items) {
    p.setFromMatrixPosition(it.matrix);
    const key = `${Math.floor(p.x / tileSize)},${Math.floor(p.z / tileSize)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    list.push(it);
  }
  for (const [key, list] of [...tiles.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const im = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.matrix); if (it.color) im.setColorAt(i, it.color); });
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    im.computeBoundingSphere();
    im.computeBoundingBox?.();
    im.name = `${name}:${key}`;
    group.add(im);
  }
  return group;
}

/**
 * Split a large indexed grid geometry (e.g. terrain from PlaneGeometry with
 * segX x segZ cells) into blocks of `block` x `block` cells, each its own mesh,
 * so off-screen terrain is culled.
 */
export function splitGrid(THREE, geometry, segX, segZ, block, material) {
  const group = new THREE.Group();
  const attrs = Object.keys(geometry.attributes);
  const row = segX + 1;
  for (let bz = 0; bz < segZ; bz += block) {
    for (let bx = 0; bx < segX; bx += block) {
      const nx = Math.min(block, segX - bx), nz = Math.min(block, segZ - bz);
      const g = new THREE.BufferGeometry();
      for (const name of attrs) {
        const src = geometry.attributes[name];
        const out = new Float32Array((nx + 1) * (nz + 1) * src.itemSize);
        let o = 0;
        for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
          const i = (bz + z) * row + (bx + x);
          for (let c = 0; c < src.itemSize; c++) out[o++] = src.array[i * src.itemSize + c];
        }
        g.setAttribute(name, new THREE.BufferAttribute(out, src.itemSize));
      }
      const idx = [];
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        const a = z * (nx + 1) + x, b = a + 1, c = a + (nx + 1), d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material);
      group.add(m);
    }
  }
  return group;
}

/** Merge geometries (indexed) and give each part a flat vertex colour. */
export function mergeColored(THREE, parts) {
  let nv = 0, ni = 0;
  const prepared = parts.map(([geo, color]) => {
    const g = geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
    return [g, color];
  });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let vo = 0, io = 0;
  for (const [g, c] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    for (let i = 0; i < n; i++) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < n; i++) index[io++] = vo + i;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
