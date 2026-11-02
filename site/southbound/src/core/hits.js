// Exact hit detection: shots are tested against the actual triangles of each
// model (no boxes, no spheres). Static meshes use a BVH (three-mesh-bvh) so
// this stays fast; skinned characters and animals are tested in their current
// animated pose. Grass, rain, fog, markers and decals have no hitbox.
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const _sph = new THREE.Sphere(), _hits = [];

// Build BVHs for every (non-skinned) mesh under an object, once per geometry.
export function prepareHitMeshes(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry || o.geometry.boundsTree) return;
    if (o.userData.noHit) return;
    try { o.geometry.computeBoundsTree(); } catch (e) { /* non-indexed odd geometry: falls back to plain raycast */ }
  });
}

const visibleMeshes = (root, out) => {
  root.traverse((o) => { if ((o.isMesh || o.isSkinnedMesh) && o.visible && !o.userData.noHit) out.push(o); });
  return out;
};

// First hit of the ray against a list of objects.
// Coarse reject with each object's world bounding sphere, then exact triangles.
export function raycastObjects(origin, dir, far, objects) {
  ray.set(origin, dir); ray.near = 0; ray.far = far;
  let best = null;
  for (const obj of objects) {
    if (!obj) continue;
    const root = obj.root;
    root.updateWorldMatrix(true, true);
    // cheap reject: distance from the ray to the object's centre vs its size
    _sph.center.copy(obj.center); _sph.radius = obj.radius;
    if (!ray.ray.intersectsSphere(_sph)) continue;
    const dist = ray.ray.distanceToPoint(_sph.center);
    if (dist > _sph.radius) continue;
    _hits.length = 0;
    const meshes = visibleMeshes(root, []);
    for (const m of meshes) {
      if (m.isSkinnedMesh) { if (!m.boundingSphere) { m.computeBoundingSphere(); m.boundingSphere.radius *= 1.6; } }
      else if (!m.geometry.boundsTree) { try { m.geometry.computeBoundsTree(); } catch (e) { /* plain raycast */ } }
      m.raycast(ray, _hits);
    }
    for (const h of _hits) if (h.distance <= far && (!best || h.distance < best.distance)) best = { ...h, target: obj };
  }
  return best;
}

// First hit against static scenery meshes (trees, rocks, poles, furniture...)
export function raycastStatic(origin, dir, far, meshes) {
  ray.set(origin, dir); ray.near = 0; ray.far = far;
  _hits.length = 0;
  for (const m of meshes) {
    if (!m.visible || (m.isInstancedMesh && m.count === 0)) continue;
    if (!m.geometry.boundsTree) { try { m.geometry.computeBoundsTree(); } catch (e) { /* plain raycast */ } }
    if (m.isInstancedMesh) m.computeBoundingSphere(); // instances move as the pools refresh
    m.raycast(ray, _hits);
  }
  let best = null;
  for (const h of _hits) if (!best || h.distance < best.distance) best = h;
  return best;
}
