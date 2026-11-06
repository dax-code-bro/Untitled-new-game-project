// Light you can see in the air at night: a soft cone under each nearby street lamp, and the beams
// of headlights (yours, the traffic's, the police's). Brighter in fog, haze and rain, nothing by day.
// Each is an additive cone whose brightness falls off along its length and towards its edges (by
// the angle you see its surface at), so it reads as lit air rather than a solid.
import * as THREE from 'three';
import { worldUniforms } from './terrain.js';

const MAX_LAMPS = 72, MAX_BEAMS = 48;

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 }, uTime: worldUniforms.uTime },
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vDist; varying vec3 vCol;
      void main() {
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix;
        #else
          mat4 im = mat4(1.0);
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vAlong = position.z;
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * normal);
        vV = normalize(-mv.xyz);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; uniform float uTime;
      varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vDist; varying vec3 vCol;
      void main() {
        // thick through the middle (where you look across the cone), thin at its silhouette
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.06, vAlong);
        float near = smoothstep(0.5, 4.0, vDist), far = 1.0 - smoothstep(160.0, 320.0, vDist);
        float a = edge * along * near * far * uAmount;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// a cone along +z: apex at the origin, a unit-radius open end at z = 1
function coneGeo() {
  const g = new THREE.CylinderGeometry(1, 0.02, 1, 20, 6, true);
  g.translate(0, 0.5, 0).rotateX(Math.PI / 2);
  return g;
}

export function createBeams(scene, { lamps = [], quality = 'high' } = {}) {
  if (quality === 'phone') return { update() {}, lampMesh: null, beamMesh: null };
  const geo = coneGeo();
  const lampMesh = new THREE.InstancedMesh(geo, beamMaterial(), MAX_LAMPS);
  const beamMesh = new THREE.InstancedMesh(geo, beamMaterial(), MAX_BEAMS);
  for (const m of [lampMesh, beamMesh]) {
    m.count = 0; m.frustumCulled = false; m.renderOrder = 3; m.userData.noHit = true; m.userData.noReflect = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((m === lampMesh ? MAX_LAMPS : MAX_BEAMS) * 3), 3);
    scene.add(m);
  }
  // each lamp's head (same placement as world/roads.js), pointing down
  const heads = lamps.map((l) => { const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2); return { x: l.x + Math.sin(r) * 1.9, y: l.y + 7.7, z: l.z + Math.cos(r) * 1.9 }; });
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const down = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(0, -1, 0));
  const warm = new THREE.Color(1.0, 0.72, 0.42), cool = new THREE.Color(0.85, 0.9, 1.0), red = new THREE.Color(1.0, 0.15, 0.1), blue = new THREE.Color(0.15, 0.3, 1.0);
  let near = [], scanT = 0;

  return {
    lampMesh, beamMesh,
    // vehicles: [{ v, kind: 'car' | 'police' }], haze 0..1 (fog, rain), night 0..1
    update(dt, cam, night, haze, vehicles) {
      const amount = night * (0.35 + haze * 0.9);
      lampMesh.material.uniforms.uAmount.value = amount * 0.22;
      beamMesh.material.uniforms.uAmount.value = amount * 0.3;
      lampMesh.visible = beamMesh.visible = amount > 0.01;
      if (!lampMesh.visible) return;
      // the lamps nearest the camera (re-picked twice a second)
      if ((scanT -= dt) <= 0) {
        scanT = 0.5;
        near = heads.filter((h) => Math.abs(h.x - cam.x) < 260 && Math.abs(h.z - cam.z) < 260)
          .sort((a, b) => (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2)).slice(0, MAX_LAMPS);
        near.forEach((h, i) => {
          lampMesh.setMatrixAt(i, _m.compose(_p.set(h.x, h.y, h.z), down, _s.set(3.4, 3.4, 7.6)));
          lampMesh.setColorAt(i, warm);
        });
        lampMesh.count = near.length; lampMesh.instanceMatrix.needsUpdate = true; if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
      }
      // headlights: two beams per car, forward and a touch down
      let n = 0;
      for (const { v, police } of vehicles) {
        if (n + 2 > MAX_BEAMS) break;
        if (Math.abs(v.pos.x - cam.x) > 180 || Math.abs(v.pos.z - cam.z) > 180) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
        const L = (v.spec?.len || 4.4) * 0.5, W = (v.spec?.width || 1.8) * 0.36;
        _d.set(fx, -0.07, fz).normalize();
        _q.setFromUnitVectors(Z, _d);
        for (const s of [-1, 1]) {
          _p.set(v.pos.x + fx * L + rx * W * s, v.pos.y + 0.72, v.pos.z + fz * L + rz * W * s);
          beamMesh.setMatrixAt(n, _m.compose(_p, _q, _s.set(2.2, 2.2, 16)));
          beamMesh.setColorAt(n, police && v.siren ? (Math.floor(performance.now() / 250) % 2 ? red : blue) : cool);
          n++;
        }
      }
      beamMesh.count = n; beamMesh.instanceMatrix.needsUpdate = n > 0; if (n && beamMesh.instanceColor) beamMesh.instanceColor.needsUpdate = true;
    },
  };
}
