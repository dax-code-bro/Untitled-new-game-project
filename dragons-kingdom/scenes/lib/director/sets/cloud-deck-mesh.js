// Shot director - the cloud deck card (meshes) from a location look's `deck` entry (prologue-vistas.js
// LOOKS[loc].deck): the painted tile (cloud-deck.js) as the map, the near detail as the alpha map, a
// horizontal card at D.y turned by D.yaw, optional `glow` (vertex colour by the heading from D.home
// against the sun azimuth: warm sun side, cool far side), `edgeFade` (alpha to 0 over the card's outer
// fraction) and `veil` (an opaque paler layer 450 m above). Separate from the set so Node can test it
// (pass `canvas` - a factory with the 2D-context calls used here - and a small `texSize`).
import * as THREE from 'three';
import { paintCloudDeck, paintCloudDetail } from './cloud-deck.js';

const D2R = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function cloudDeckMeshes(D, { draft = true, texSize, canvas = () => document.createElement('canvas'), name = 'cloudDeck' } = {}) {
  const paintTex = (n, fn) => {
    const cv = canvas(); cv.width = cv.height = n;
    const c2 = cv.getContext('2d'), img = c2.createImageData(n, n);
    fn(img); c2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
    return t;
  };
  const map = paintTex(texSize ?? (draft ? 512 : 1024), (img) => paintCloudDeck(img, D.paint)); map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(D.size / D.tile, D.size / D.tile);
  const detail = paintTex(Math.min(256, texSize ?? 256), (img) => paintCloudDetail(img, D.paint)); detail.repeat.set(D.size / D.detail, D.size / D.detail);
  const shaded = !!(D.glow || D.edgeFade);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(D.size, D.size, shaded ? 48 : 1, shaded ? 48 : 1),
    new THREE.MeshBasicMaterial({ map, alphaMap: detail, transparent: true, opacity: D.opacity ?? 1, depthWrite: true, side: THREE.DoubleSide, color: new THREE.Color(...D.color), fog: false, vertexColors: shaded }));
  deck.rotation.order = 'YXZ'; deck.rotation.set(Math.PI / 2, (D.yaw ?? 0) * D2R, 0);
  deck.position.set(D.center[0], D.y, D.center[1]);
  deck.name = name;
  if (shaded) {
    deck.updateMatrixWorld(true);
    const P = deck.geometry.attributes.position, col = new Float32Array(P.count * 4), v = new THREE.Vector3();
    const G = D.glow, home = D.home || [0, 0], half = D.size / 2;
    for (let i = 0; i < P.count; i++) {
      const r = Math.max(Math.abs(P.getX(i)), Math.abs(P.getY(i))) / half;
      v.fromBufferAttribute(P, i).applyMatrix4(deck.matrixWorld);
      let c = [1, 1, 1];
      if (G) {
        const da = Math.cos(Math.atan2(v.x - home[0], -(v.z - home[1])) - G.az * D2R);
        const gs = Math.pow(Math.max(0, da), G.power ?? 2), ga = Math.max(0, -da);
        c = c.map((q, k) => 1 + (G.sun[k] - 1) * gs + (G.away[k] - 1) * ga);
      }
      col.set([c[0], c[1], c[2], D.edgeFade ? smooth(1, 1 - D.edgeFade, r) : 1], i * 4);
    }
    deck.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  // `when`: shown only in the shots whose set names it (a deck added to a location after some of its
  // shots were final must not change those) - the set toggles it per shot
  if (D.when) deck.userData.when = D.when;
  let veil = null;
  if (D.veil) {
    veil = new THREE.Mesh(new THREE.PlaneGeometry(D.size * 1.5, D.size * 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(...D.veil), side: THREE.DoubleSide, fog: false }));
    veil.rotation.x = Math.PI / 2; veil.position.set(D.center[0], D.y + 450, D.center[1]);
    veil.name = `${name}:veil`;
  }
  return { deck, veil };
}
