// Shot director sets - shared pieces for interiors and skies (pure setup helpers; nothing here
// changes over time unless its update() is called with t).
import * as THREE from 'three';
import { frame, sub, xf, tube, block } from '../../architecture/core.js';
import { oilLamp } from '../../architecture/interiors.js';

/** A wall frame like interiors.js roomWalls(): origin `o`, along `X`, normal into the room (Z = X x Y). */
export function wallFrame(o, X) { return sub(frame([0, 0, 0]), o, X, [0, 1, 0]); }

/**
 * A gradient sky dome (no sun disk): zenith, horizon and below-horizon colours (linear HDR) and a
 * soft glow toward `glowDir` (the hidden sun). Drawn behind everything (depthWrite off, renderOrder low).
 */
export function skyDome({ zenith = [0.18, 0.24, 0.36], horizon = [0.6, 0.62, 0.66], ground = [0.08, 0.09, 0.1], glow = [0, 0, 0], glowDir = [1, 0.05, 0], glowPow = 6, radius = 4000 } = {}) {
  const U = {
    uZ: { value: new THREE.Color(...zenith) }, uH: { value: new THREE.Color(...horizon) }, uG: { value: new THREE.Color(...ground) },
    uGlow: { value: new THREE.Color(...glow) }, uGD: { value: new THREE.Vector3(...glowDir).normalize() }, uGP: { value: glowPow },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uZ, uH, uG, uGlow, uGD; uniform float uGP; varying vec3 vD;
      void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(uH, uZ, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uH, uG, clamp(-y * 6.0, 0.0, 1.0));
        c += uGlow * pow(max(0.0, dot(normalize(vD), uGD)), uGP); gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10; m.name = 'sky-dome';
  m.castShadow = false; m.receiveShadow = false;
  m.userData.uniforms = U;
  return m;
}

/** A plain emissive card (a bright doorway, a window's sky): w x h, colour (linear HDR). */
export function lightCard(w, h, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }));
  m.castShadow = false; m.receiveShadow = false;
  return m;
}

/**
 * An environment map for an interior (gold, glass and the IBL fill must see THIS room, not a sky):
 * a box of the room's colour with bright patches where its windows / door are. patches:
 * [{ at: [x, y, z], size: [w, h], color: [r, g, b] }] in room coordinates.
 */
export function roomEnvironment(renderer, scene, { size = [6, 4, 6], wall = [0.05, 0.035, 0.022], patches = [], intensity = 0.4 } = {}) {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(...wall), side: THREE.BackSide })).translateY(size[1] / 2 - 0.4));
  for (const p of patches) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...p.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.color), side: THREE.DoubleSide }));
    m.position.set(...p.at); m.lookAt(0, 1.2, 0); es.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(es, 0, 0.05, 40).texture;
  pm.dispose();
  scene.environmentIntensity = intensity;
}

/**
 * An oil lamp on an iron bracket fixed to a wall (architecture kit geometry into `kit`) and its light.
 * F: the wall frame at the bracket's root (x along the wall, y up, z out of the wall). Returns the light.
 */
export function wallLamp(kit, Fw, x, y, rnd, { intensity = 1.6, distance = 8, color = [1.0, 0.52, 0.2] } = {}) {
  const Fb = sub(Fw, [x, y, 0], [1, 0, 0], [0, 1, 0]);
  tube(kit.get('iron'), [xf(Fb, 0, 0, 0), xf(Fb, 0, 0, 0.36)], 0.012, { sides: 6 });
  tube(kit.get('iron'), [xf(Fb, 0, -0.18, 0), xf(Fb, 0, -0.01, 0.26)], 0.01, { sides: 6 });
  block(kit.get('iron'), sub(Fb, [0, 0.004, 0.31]), 0.16, 0.008, 0.14, { r: 0.002, seg: [0.16, 0.008, 0.14], seed: rnd() });
  const Fl = sub(Fb, [0, 0.008, 0.3], [0, 0, 1], [0, 1, 0]);
  const fp = oilLamp(kit, Fl, rnd);
  const p = xf(Fl, ...fp);
  const L = new THREE.PointLight(new THREE.Color(...color), intensity, distance, 2);
  L.position.set(p[0], p[1] + 0.03, p[2]);
  L.castShadow = false;
  return L;
}

/** Remove the triangles of named material meshes whose centroid lies in a world box (a merged door leaf). */
export function cutBox(group, names, box) {
  let removed = 0;
  group.traverse((m) => {
    if (!m.isMesh || !names.some((n) => m.name.endsWith(':' + n))) return;
    const g = m.geometry, P = g.attributes.position.array, I = g.index.array;
    const o = m.position;
    const keep = [];
    for (let i = 0; i < I.length; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const j = I[i + k] * 3; cx += P[j]; cy += P[j + 1]; cz += P[j + 2]; }
      cx = cx / 3 + o.x; cy = cy / 3 + o.y; cz = cz / 3 + o.z;
      if (cx > box[0][0] && cx < box[1][0] && cy > box[0][1] && cy < box[1][1] && cz > box[0][2] && cz < box[1][2]) { removed++; continue; }
      keep.push(I[i], I[i + 1], I[i + 2]);
    }
    g.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  });
  return removed;
}
