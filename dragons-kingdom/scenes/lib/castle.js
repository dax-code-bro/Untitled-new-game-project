// Procedural stone castle: curtain wall with crenellations, round towers with
// conical slate roofs, a gatehouse, a keep and a tall donjon with a banner.
import { stoneBlocks, roofShingles, boxProjectUVs, scaleRadialUVs } from 'dk/textures.js';

const srgb = (THREE, r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export function createCastle(THREE, { seed = 7, ground = 30, radius = 46, sides = 6 } = {}) {
  const group = new THREE.Group();
  group.name = 'castle';
  const stoneTex = stoneBlocks(THREE, { seed, size: 512 });
  // matte stone: Lambert (no specular) is visibly identical here and cheaper per pixel than PBR
  const stone = new THREE.MeshLambertMaterial({ map: stoneTex.map });
  const roofTex = roofShingles(THREE, { seed: seed + 4, color: [70, 80, 118] });
  const roof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.62, metalness: 0.05 });
  const redRoofTex = roofShingles(THREE, { seed: seed + 9, color: [150, 58, 40] });
  const redRoof = new THREE.MeshStandardMaterial({ map: redRoofTex, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.05, 0.045, 0.04), roughness: 1 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: srgb(THREE, 1.0, 0.62, 0.25), emissiveIntensity: 1.4 });
  const wood = new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.32, 0.2, 0.11), roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.85, 0.65, 0.22), roughness: 0.3, metalness: 1 });

  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  const merlons = [];   // matrices for one InstancedMesh
  const windows = [];
  const lit = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();

  function tower(x, z, r, h, { roofH = r * 2.0, roofMat = roof, windowsRows = 2, base = ground - 6 } = {}) {
    const H = h + (ground - base);
    const g = new THREE.CylinderGeometry(r, r * 1.06, H, 28, 1, true);
    scaleRadialUVs(g, r, H, 4);
    const body = add(new THREE.Mesh(g, stone));
    body.position.set(x, base + H / 2, z);
    // corbelled parapet ring + merlons
    const top = ground + h;
    const ringG = new THREE.CylinderGeometry(r + 0.7, r, 1.4, 28, 1, false);
    scaleRadialUVs(ringG, r, 1.4, 4);
    add(new THREE.Mesh(ringG, stone)).position.set(x, top + 0.7, z);
    const n = Math.max(8, Math.round((2 * Math.PI * (r + 0.4)) / 2.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      euler.set(0, -a + Math.PI / 2, 0); tmpQ.setFromEuler(euler);
      tmpM.compose(new THREE.Vector3(x + Math.cos(a) * (r + 0.35), top + 1.4 + 0.8, z + Math.sin(a) * (r + 0.35)), tmpQ, tmpS);
      merlons.push(tmpM.clone());
    }
    // roof cone sits inside the parapet. Closed at the bottom: its eave
    // overhangs the parapet ring by 0.2 m, and with an open cone you could
    // look up through that gap into the (back-face culled) cone and see the
    // sky - bright 1-pixel dashes under the merlons at 4K.
    const cg = new THREE.ConeGeometry(r + 0.9, roofH, 28, 1, false);
    scaleRadialUVs(cg, r + 0.9, roofH, 2.5);
    add(new THREE.Mesh(cg, roofMat)).position.set(x, top + 1.4 + roofH / 2, z);
    // finial
    add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), gold)).position.set(x, top + 1.4 + roofH + 0.2, z);
    // arrow-slit windows
    for (let row = 0; row < windowsRows; row++) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + row * 0.7 + x * 0.01;
        const y = ground + h * (0.22 + 0.62 * (row + 0.5) / windowsRows);
        euler.set(0, -a + Math.PI / 2, 0); tmpQ.setFromEuler(euler);
        tmpM.compose(new THREE.Vector3(x + Math.cos(a) * (r + 0.02), y, z + Math.sin(a) * (r + 0.02)), tmpQ, tmpS);
        ((row + k) % 5 === 0 ? lit : windows).push(tmpM.clone());
      }
    }
    return top;
  }

  function wall(x0, z0, x1, z1, h, thick = 3.2) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const H = h + 6;
    const g = new THREE.BoxGeometry(len, H, thick);
    boxProjectUVs(g, 4);
    const m = add(new THREE.Mesh(g, stone));
    const ang = Math.atan2(-dz, dx);
    m.position.set((x0 + x1) / 2, ground - 6 + H / 2, (z0 + z1) / 2);
    m.rotation.y = ang;
    // crenellations on the outer edge
    const n = Math.floor(len / 2.4);
    const nx = -Math.sin(-ang), nz = Math.cos(-ang);   // wall normal (unused sign is fine: both edges)
    for (let i = 1; i < n; i++) {
      const t = i / n;
      euler.set(0, ang, 0); tmpQ.setFromEuler(euler);
      for (const side of [-1, 1]) {
        tmpM.compose(new THREE.Vector3(x0 + dx * t + side * nx * (thick / 2 - 0.45), ground + h + 0.8, z0 + dz * t + side * nz * (thick / 2 - 0.45)), tmpQ, tmpS);
        merlons.push(tmpM.clone());
      }
    }
    return m;
  }

  // ---- curtain wall + corner towers (gate faces +z)
  const corners = [];
  for (let i = 0; i < sides; i++) {
    const a = Math.PI / 2 + (i / sides) * Math.PI * 2 + Math.PI / sides;
    corners.push([Math.cos(a) * radius, Math.sin(a) * radius * 0.85]);
  }
  for (let i = 0; i < sides; i++) {
    const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % sides];
    wall(x0, z0, x1, z1, 11);
    tower(x0, z0, 5.2, 19, { roofH: 11 });
  }

  // ---- gatehouse on the front (+z) wall
  const front = corners.reduce((best, c, i) => {
    const c2 = corners[(i + 1) % sides];
    const mz = (c[1] + c2[1]) / 2;
    return mz > best.z ? { z: mz, x: (c[0] + c2[0]) / 2, i } : best;
  }, { z: -Infinity, x: 0, i: 0 });
  {
    const gx = front.x, gz = front.z;
    const gh = new THREE.BoxGeometry(12, 22, 9); boxProjectUVs(gh, 4);
    add(new THREE.Mesh(gh, stone)).position.set(gx, ground - 6 + 11, gz);
    const door = add(new THREE.Mesh(new THREE.BoxGeometry(5, 8, 0.6), dark));
    door.position.set(gx, ground + 4, gz + 4.55);
    const arch = add(new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.6, 16, 1, false, Math.PI / 2, Math.PI), dark));
    arch.rotation.set(Math.PI / 2, 0, 0); arch.position.set(gx, ground + 8, gz + 4.55);
    tower(gx - 7.5, gz + 1.5, 3.8, 18, { roofH: 9, roofMat: redRoof, windowsRows: 1 });
    tower(gx + 7.5, gz + 1.5, 3.8, 18, { roofH: 9, roofMat: redRoof, windowsRows: 1 });
  }

  // ---- keep (great hall) with gable roof
  {
    const kx = 6, kz = -8, kw = 26, kd = 18, kh = 17;
    const kg = new THREE.BoxGeometry(kw, kh + 6, kd); boxProjectUVs(kg, 4);
    add(new THREE.Mesh(kg, stone)).position.set(kx, ground - 6 + (kh + 6) / 2, kz);
    const shape = new THREE.Shape();
    shape.moveTo(-kd / 2 - 0.8, 0); shape.lineTo(kd / 2 + 0.8, 0); shape.lineTo(0, 9); shape.lineTo(-kd / 2 - 0.8, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: kw + 1.6, bevelEnabled: false });
    rg.translate(0, 0, -(kw + 1.6) / 2);
    rg.rotateY(Math.PI / 2);
    boxProjectUVs(rg, 2.5);
    add(new THREE.Mesh(rg, redRoof)).position.set(kx, ground + kh, kz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(kx + sx * kw / 2, kz + sz * kd / 2, 2.2, kh + 4, { roofH: 6, windowsRows: 1, base: ground });
    // tall windows on the long sides
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
      euler.set(0, side > 0 ? 0 : Math.PI, 0); tmpQ.setFromEuler(euler);
      tmpM.compose(new THREE.Vector3(kx - kw / 2 + 3.5 + i * 4.75, ground + 9, kz + side * (kd / 2 + 0.02)), tmpQ, new THREE.Vector3(1.6, 2.2, 1));
      (i % 2 ? lit : windows).push(tmpM.clone());
    }
  }

  // ---- donjon: the tallest tower, with a banner
  const dx = -18, dz = -14, dr = 7, dh = 46;
  const donjonTop = tower(dx, dz, dr, dh, { roofH: 18, windowsRows: 4 });
  const poleH = 8;
  const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, poleH, 6), wood));
  const poleBase = donjonTop + 1.4 + 17;
  pole.position.set(dx, poleBase + poleH / 2 - 0.5, dz);
  const flagW = 5.5, flagH = 3.3, FX = 18, FY = 8;
  const flagGeo = new THREE.PlaneGeometry(flagW, flagH, FX, FY);
  flagGeo.translate(flagW / 2, 0, 0);
  {
    const col = new Float32Array(flagGeo.attributes.position.count * 3);
    const red = srgb(THREE, 0.72, 0.05, 0.05), yellow = srgb(THREE, 0.95, 0.75, 0.15);
    for (let i = 0; i < flagGeo.attributes.position.count; i++) {
      const x = flagGeo.attributes.position.getX(i), y = flagGeo.attributes.position.getY(i);
      // a gold band with a dragon-tooth zigzag
      const zig = Math.abs(((x * 1.4) % 2) - 1) * 0.5;
      const c = Math.abs(y + 0.2 - zig) < 0.35 ? yellow : red;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    flagGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const flag = add(new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 })));
  flag.position.set(dx, poleBase + poleH - 2.0, dz);
  flag.rotation.y = 0.6;

  // ---- instanced details
  const merlonGeo = new THREE.BoxGeometry(1.5, 1.6, 0.9); boxProjectUVs(merlonGeo, 4);
  const merlonMesh = new THREE.InstancedMesh(merlonGeo, stone, merlons.length);
  merlons.forEach((m, i) => merlonMesh.setMatrixAt(i, m));
  merlonMesh.castShadow = merlonMesh.receiveShadow = true;
  group.add(merlonMesh);
  const winGeo = new THREE.BoxGeometry(0.7, 1.8, 0.3);
  const winMesh = new THREE.InstancedMesh(winGeo, dark, windows.length);
  windows.forEach((m, i) => winMesh.setMatrixAt(i, m));
  group.add(winMesh);
  const litMesh = new THREE.InstancedMesh(winGeo, glow, lit.length);
  lit.forEach((m, i) => litMesh.setMatrixAt(i, m));
  group.add(litMesh);

  // ---- courtyard ground
  const yard = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 40), new THREE.MeshStandardMaterial({ color: srgb(THREE, 0.42, 0.38, 0.3), roughness: 1 }));
  yard.rotation.x = -Math.PI / 2; yard.scale.set(1, 0.85, 1); yard.position.y = ground + 0.05;
  yard.receiveShadow = true;
  group.add(yard);

  /** Banner animation: travelling wave, pure function of t. */
  function animate(t) {
    const p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = flagBase[i * 3], y = flagBase[i * 3 + 1];
      const k = x / flagW;
      const w = Math.sin(x * 0.9 - t * 5.2) * 0.55 + Math.sin(x * 1.7 - t * 7.9 + y * 0.6) * 0.18;
      p.setXYZ(i, x * (1 - 0.04 * k * k), y - k * k * 0.5 + Math.sin(x * 0.7 - t * 4.1) * 0.08 * k, w * k);
    }
    p.needsUpdate = true;
    flagGeo.computeVertexNormals();
    // the waving flag leaves its rest pose: keep the culling sphere in step
    // (the runtime would also do this, see "culling determinism" in dk-runtime.js)
    flagGeo.computeBoundingSphere();
  }

  // flag: the only part that moves (and casts a moving shadow)
  return { group, animate, flag, height: donjonTop + 18, donjon: new THREE.Vector3(dx, donjonTop, dz) };
}
