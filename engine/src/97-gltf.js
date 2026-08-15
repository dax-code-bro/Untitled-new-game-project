/* ============================================================
   GLTF — real model files in the engine.

   Loads glTF-Binary (.glb) assets: meshes, PBR base-colour
   textures, skins and keyframe animations. This is the door to
   professional, photo-textured animals and props: the industry
   ships art as glTF, and now Legend eats it natively.

   Scope (deliberately the subset real animal assets use):
   - GLB container, embedded buffers and images
   - POSITION / NORMAL / TEXCOORD_0 / JOINTS_0 / WEIGHTS_0 + indices
   - baseColorFactor / baseColorTexture, metallic & roughness factors
   - one skin per model (inverseBindMatrices), node hierarchies
   - animations: rotation / translation / scale channels, LINEAR
   ============================================================ */

const GLTF_COMP = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const GLTF_TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb file');
  const length = dv.getUint32(8, true);
  let offset = 12, json = null, bin = null;
  while (offset < length) {
    const chunkLen = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, chunkLen)));
    } else if (chunkType === 0x004e4942) {
      bin = buffer.slice(start, start + chunkLen);
    }
    offset = start + chunkLen + (chunkLen % 4 ? 4 - (chunkLen % 4) : 0);
  }
  if (!json) throw new Error('glb has no JSON chunk');
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const comp = GLTF_COMP[acc.componentType];
  const n = GLTF_TYPE[acc.type];
  const count = acc.count;
  const bv = json.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || comp.size * n;

  if (stride === comp.size * n) {
    // Copy out of the GLB buffer into a fresh, offset-free array. Some GL
    // stacks mis-upload typed-array VIEWS with non-zero byteOffset, which
    // silently feeds the shader zeros — a skinned mesh then collapses into
    // clusters at its bone origins.
    return comp.array.from(new comp.array(bin, byteOffset, count * n));
  }
  // Interleaved: gather element by element.
  const out = new comp.array(count * n);
  const dv = new DataView(bin);
  const readers = {
    5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o),
    5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
  };
  const read = readers[acc.componentType];
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = read(byteOffset + i * stride + c * comp.size);
  }
  return out;
}

/* An asset is the loaded, GPU-ready model — shared by every instance. */
class GltfAsset {
  constructor() {
    this.meshes = [];        // { mesh: GpuMesh, material: Material }
    this.nodes = [];         // { name, parent, t, r, s, mesh, skin }
    this.order = [];         // parent-before-child traversal order
    this.skin = null;        // { joints: [nodeIdx], ibm: Float32Array }
    this.animations = new Map();   // name -> { duration, channels: [...] }
    this.bounds = new Aabb();
  }

  static async load(engine, url) {
    const gl = engine.gl;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model fetch failed: ${res.status} ${url}`);
    const { json, bin } = parseGLB(await res.arrayBuffer());
    const asset = new GltfAsset();

    /* ---- textures ---- */
    const textures = [];
    if (json.textures) {
      for (const tex of json.textures) {
        const img = json.images[tex.source];
        let bitmap = null;
        if (img.bufferView != null) {
          const bv = json.bufferViews[img.bufferView];
          const bytes = new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength);
          bitmap = await createImageBitmap(new Blob([bytes], { type: img.mimeType || 'image/png' }));
        }
        const t = new Texture(gl, { internalFormat: gl.SRGB8_ALPHA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, wrap: gl.REPEAT, aniso: 8 });
        if (bitmap) {
          // Decode to raw RGBA and go through Texture.upload — the same
          // byte path every procedural map uses. Direct ImageBitmap
          // uploads into SRGB targets fail silently on several drivers,
          // leaving an incomplete texture that samples solid black.
          const cv = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(bitmap.width, bitmap.height)
            : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
          const ctx2d = cv.getContext('2d');
          ctx2d.drawImage(bitmap, 0, 0);
          const px = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height).data;
          t.upload(new Uint8Array(px.buffer, px.byteOffset, px.byteLength), bitmap.width, bitmap.height);
        }
        textures.push(t);
      }
    }
    const flat = (r, g2, b2) => {
      const t = new Texture(gl, { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, mips: false });
      return t.upload(new Uint8Array([r, g2, b2, 255]), 1, 1);
    };
    const flatNormal = flat(128, 128, 255);

    /* ---- materials ---- */
    const materials = (json.materials || [{}]).map((m) => {
      const pbr = m.pbrMetallicRoughness || {};
      const factor = pbr.baseColorFactor || [1, 1, 1, 1];
      const mat = new Material(gl, {
        color: [Math.pow(factor[0], 1 / 2.2), Math.pow(factor[1], 1 / 2.2), Math.pow(factor[2], 1 / 2.2)],
        roughness: pbr.roughnessFactor != null ? pbr.roughnessFactor : 0.8,
        metalness: pbr.metallicFactor != null ? pbr.metallicFactor : 0,
        doubleSided: !!m.doubleSided,
      });
      if (pbr.baseColorTexture && textures[pbr.baseColorTexture.index]) {
        // uHasMaps path: albedo from the asset, neutral normal/ORM.
        mat.maps = {
          albedo: textures[pbr.baseColorTexture.index],
          normal: flatNormal,
          orm: flat(255, 204, 255),
        };
      }
      return mat;
    });

    /* ---- meshes ---- */
    const meshDefs = (json.meshes || []).map((m) => m.primitives.map((prim) => {
      const positions = readAccessor(json, bin, prim.attributes.POSITION);
      // Some primitives (the Fox among them) carry no "indices" at all —
      // every 3 consecutive vertices is a triangle (glTF's implicit
      // draw-arrays mode). Synthesize sequential indices so normal/tangent
      // generation below (and GpuMesh's drawElements path) always have a
      // real index list to work with instead of silently no-oping.
      let indices = prim.indices != null ? Array.from(readAccessor(json, bin, prim.indices)) : null;
      if (!indices) {
        const vertCount = positions.length / 3;
        indices = new Array(vertCount);
        for (let i = 0; i < vertCount; i++) indices[i] = i;
      }
      const geo = {
        positions,
        normals: prim.attributes.NORMAL != null ? readAccessor(json, bin, prim.attributes.NORMAL) : null,
        uvs: prim.attributes.TEXCOORD_0 != null ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null,
        indices,
      };
      if (prim.attributes.JOINTS_0 != null) {
        const j = readAccessor(json, bin, prim.attributes.JOINTS_0);
        geo.joints = Float32Array.from(j);         // shader reads float indices
        geo.weights = readAccessor(json, bin, prim.attributes.WEIGHTS_0);
      }
      // Some assets (the Khronos Fox among them) ship WITHOUT normals.
      // A missing normal attribute reads as a zero vector, which NaNs the
      // lighting into solid black — so generate smooth normals ourselves.
      if (!geo.normals && geo.indices) {
        const n2 = new Float32Array(geo.positions.length);
        const pos = geo.positions, idx = geo.indices;
        for (let i = 0; i < idx.length; i += 3) {
          const a = idx[i] * 3, b2 = idx[i + 1] * 3, c2 = idx[i + 2] * 3;
          const e1x = pos[b2] - pos[a], e1y = pos[b2 + 1] - pos[a + 1], e1z = pos[b2 + 2] - pos[a + 2];
          const e2x = pos[c2] - pos[a], e2y = pos[c2 + 1] - pos[a + 1], e2z = pos[c2 + 2] - pos[a + 2];
          const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          for (const vi of [a, b2, c2]) { n2[vi] += nx; n2[vi + 1] += ny; n2[vi + 2] += nz; }
        }
        for (let i = 0; i < n2.length; i += 3) {
          const l = Math.hypot(n2[i], n2[i + 1], n2[i + 2]) || 1;
          n2[i] /= l; n2[i + 1] /= l; n2[i + 2] /= l;
        }
        geo.normals = n2;
      }
      // Tangents: the lighting shader builds a TBN frame; a missing tangent
      // attribute reads as a zero vector and NaNs the whole lighting chain
      // (that renders as solid black). Compute them like Geometry.finalize.
      if (geo.normals && geo.uvs && geo.indices) {
        const tg = new Geometry();
        tg.positions = geo.positions; tg.normals = geo.normals;
        tg.uvs = geo.uvs; tg.indices = geo.indices;
        tg.computeTangents();
        geo.tangents = tg.tangents;
      }
      // Track bounds for auto-scaling.
      const p = geo.positions;
      for (let i = 0; i < p.length; i += 3) asset.bounds.expandPoint({ x: p[i], y: p[i + 1], z: p[i + 2] });
      // Set up the instance buffer unconditionally: skinned instances draw
      // through the non-instanced/individual path and never touch it, but
      // an unskinned model (a mounted trophy, a static prop) batches through
      // the instanced path like any procedural mesh, which needs it to exist
      // up front — uploadInstances() otherwise binds a null buffer and the
      // draw silently produces nothing.
      const gpuMesh = new GpuMesh(gl, geo).setupInstancing(20);
      return { mesh: gpuMesh, material: materials[prim.material != null ? prim.material : 0] || materials[0] };
    }));

    /* ---- nodes ---- */
    asset.nodes = (json.nodes || []).map((n) => ({
      name: n.name || '',
      parent: -1,
      t: Vec3.from(n.translation || [0, 0, 0]),
      r: n.rotation ? new Quat(n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]) : new Quat(),
      s: n.scale ? Vec3.from(n.scale) : new Vec3(1, 1, 1),
      mesh: n.mesh != null ? n.mesh : -1,
      skin: n.skin != null ? n.skin : -1,
    }));
    (json.nodes || []).forEach((n, i) => { for (const c of n.children || []) asset.nodes[c].parent = i; });
    // Parent-first order via DFS from the scene roots.
    const roots = (json.scenes && json.scenes[json.scene || 0].nodes) || [];
    const visit = (i) => { asset.order.push(i); (json.nodes[i].children || []).forEach(visit); };
    roots.forEach(visit);
    asset.meshDefs = meshDefs;

    /* ---- skin ---- */
    if (json.skins && json.skins.length) {
      const skin = json.skins[0];
      asset.skin = {
        joints: skin.joints.slice(),
        ibm: skin.inverseBindMatrices != null ? readAccessor(json, bin, skin.inverseBindMatrices) : null,
      };
    }

    /* ---- animations ---- */
    for (const anim of json.animations || []) {
      const channels = [];
      let duration = 0;
      for (const ch of anim.channels) {
        const sampler = anim.samplers[ch.sampler];
        const input = readAccessor(json, bin, sampler.input);
        const output = readAccessor(json, bin, sampler.output);
        duration = Math.max(duration, input[input.length - 1]);
        channels.push({ node: ch.target.node, path: ch.target.path, times: input, values: output, cursor: 0 });
      }
      asset.animations.set(anim.name || `anim${asset.animations.size}`, { duration, channels });
    }
    return asset;
  }
}

/* A live instance: its own node pose, its own animation time, its own
   bone-matrix texture, driven through the same skinned path characters use. */
class GltfInstance {
  constructor(engine, asset, opts = {}) {
    this.engine = engine;
    this.asset = asset;
    this.time = 0;
    this.clip = null;
    this.speed = opts.timeScale || 1;

    // Local pose (copies of the bind TRS, overwritten by animation).
    this.pose = asset.nodes.map((n) => ({ t: n.t.clone(), r: n.r.clone(), s: n.s.clone() }));
    this.world = asset.nodes.map(() => new Mat4());
    const jointCount = asset.skin ? asset.skin.joints.length : 0;
    this.palette = new Float32Array(Math.max(1, jointCount) * 16);
    this.boneTexture = null;

    // Auto-scale: "height" in metres is friendlier than guessing units.
    const size = asset.bounds.max ? (asset.bounds.max.y - asset.bounds.min.y) : 1;
    const scale = opts.height ? (opts.height / Math.max(1e-6, size)) : (opts.scale || 1);

    const self = this;
    this.actors = [];
    const shimSkeleton = jointCount ? {
      bones: { length: jointCount },
      uploadTexture(gl) { return self._uploadPalette(gl); },
    } : null;

    let first = true;
    for (const nodeIdx of asset.order) {
      const node = asset.nodes[nodeIdx];
      if (node.mesh < 0) continue;
      for (const def of asset.meshDefs[node.mesh]) {
        const a = new Actor(engine, {
          name: opts.name || 'model',
          mesh: def.mesh,
          material: def.material,
          at: opts.at || [0, 0, 0],
          skeleton: shimSkeleton,
          animator: first ? { update: (dt) => self._update(dt) } : null,
          boundRadius: (opts.height || size * scale) * 1.5,
        });
        a.scale.setScalar(scale);
        engine.actors.push(a);
        this.actors.push(a);
        first = false;
      }
    }
    this.root = this.actors[0] || null;

    if (opts.animation) this.play(opts.animation);
    else if (asset.animations.size) this.play(asset.animations.keys().next().value);
  }

  get animations() { return Array.from(this.asset.animations.keys()); }

  play(name) {
    const clip = this.asset.animations.get(name);
    if (!clip) return this;
    this.clip = clip;
    this.clipName = name;
    this.time = 0;
    for (const ch of clip.channels) ch.cursor = 0;
    return this;
  }

  setPosition(p) { for (const a of this.actors) a.setPosition(p); return this; }
  setRotation(r) { for (const a of this.actors) a.setRotation(r); return this; }

  _update(dt) {
    const asset = this.asset;
    if (this.clip) {
      this.time = (this.time + dt * this.speed) % Math.max(1e-4, this.clip.duration);
      for (const ch of this.clip.channels) this._sample(ch);
    }
    // Compose world matrices parent-first.
    for (const i of asset.order) {
      const node = asset.nodes[i];
      const p = this.pose[i];
      _gTmp.compose(p.t, p.r, p.s);
      if (node.parent >= 0) this.world[i].mulMatrices(this.world[node.parent], _gTmp);
      else this.world[i].copy(_gTmp);
    }
    // Joint palette = world * inverseBind.
    if (asset.skin) {
      const ibm = asset.skin.ibm;
      for (let j = 0; j < asset.skin.joints.length; j++) {
        for (let k2 = 0; k2 < 16; k2++) _gTmp2.e[k2] = ibm[j * 16 + k2];
        _gTmp.mulMatrices(this.world[asset.skin.joints[j]], _gTmp2);
        this.palette.set(_gTmp.e, j * 16);
      }
      this._paletteDirty = true;
    }
  }

  _sample(ch) {
    const times = ch.times, values = ch.values;
    const t = Math.min(this.time, times[times.length - 1]);
    let i = ch.cursor;
    if (i > 0 && times[i] > t) i = 0;                 // looped back
    while (i < times.length - 2 && times[i + 1] < t) i++;
    ch.cursor = i;
    const t0 = times[i], t1 = times[Math.min(i + 1, times.length - 1)];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    const pose = this.pose[ch.node];
    if (ch.path === 'rotation') {
      const a = i * 4, b = Math.min(i + 1, times.length - 1) * 4;
      // nlerp with shortest-path sign flip: visually identical to slerp here.
      let dot = values[a] * values[b] + values[a + 1] * values[b + 1] + values[a + 2] * values[b + 2] + values[a + 3] * values[b + 3];
      const sgn = dot < 0 ? -1 : 1;
      const q = pose.r;
      q.x = values[a] + (values[b] * sgn - values[a]) * f;
      q.y = values[a + 1] + (values[b + 1] * sgn - values[a + 1]) * f;
      q.z = values[a + 2] + (values[b + 2] * sgn - values[a + 2]) * f;
      q.w = values[a + 3] + (values[b + 3] * sgn - values[a + 3]) * f;
      const ql = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
      q.x /= ql; q.y /= ql; q.z /= ql; q.w /= ql;
    } else if (ch.path === 'translation' || ch.path === 'scale') {
      const a = i * 3, b = Math.min(i + 1, times.length - 1) * 3;
      const v = ch.path === 'translation' ? pose.t : pose.s;
      v.x = values[a] + (values[b] - values[a]) * f;
      v.y = values[a + 1] + (values[b + 1] - values[a + 1]) * f;
      v.z = values[a + 2] + (values[b + 2] - values[a + 2]) * f;
    }
  }

  _uploadPalette(gl) {
    const joints = this.asset.skin ? this.asset.skin.joints.length : 0;
    if (!this.boneTexture) {
      this.boneTexture = new Texture(gl, {
        internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT,
        wrap: gl.CLAMP_TO_EDGE, minFilter: gl.NEAREST, magFilter: gl.NEAREST, mips: false,
      });
    }
    this.boneTexture.upload(this.palette, Math.max(1, joints * 4), 1);
    return this.boneTexture;
  }

  destroy() { for (const a of this.actors) a.destroy(); }
}

const _gTmp = new Mat4();
const _gTmp2 = new Mat4();

/* ---------------- engine surface ---------------- */

/* Load once, spawn many. game.loadModel(url) -> asset;
   game.spawnModel(asset|url, {at, height, animation}) -> instance. */
Engine.prototype.loadModel = async function (url) {
  this._modelCache = this._modelCache || new Map();
  if (!this._modelCache.has(url)) this._modelCache.set(url, GltfAsset.load(this, url));
  return this._modelCache.get(url);
};

Engine.prototype.spawnModel = async function (assetOrUrl, opts = {}) {
  const asset = typeof assetOrUrl === 'string' ? await this.loadModel(assetOrUrl) : assetOrUrl;
  return new GltfInstance(this, asset, opts);
};

/* Decode an image URL to raw RGBA and upload it as a Texture. Goes through
   canvas pixel extraction rather than a direct ImageBitmap upload — several
   GL drivers silently produce an incomplete (solid black) SRGB texture from
   a direct upload, the same failure the glTF loader's own textures hit. */
async function loadImageTexture(gl, url, opts = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`texture fetch failed: ${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob());
  const cv = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const ctx2d = cv.getContext('2d');
  ctx2d.drawImage(bitmap, 0, 0);
  const px = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const t = new Texture(gl, {
    internalFormat: opts.srgb !== false ? gl.SRGB8_ALPHA8 : gl.RGBA8,
    format: gl.RGBA, type: gl.UNSIGNED_BYTE, wrap: gl.REPEAT, aniso: 8,
  });
  t.upload(new Uint8Array(px.buffer, px.byteOffset, px.byteLength), bitmap.width, bitmap.height);
  return t;
}

/* A real AI-generated photo as a ground/prop material, instead of the
   procedural noise TextureLib synthesizes. Same Material shape either way —
   this is a drop-in for `ground({ material })` or any material slot.
   game.loadAIMaterial('a lush green meadow, top-down, seamless texture') */
Engine.prototype.loadAIMaterial = async function (prompt, opts = {}) {
  const gl = this.gl;
  const size = opts.size || 1024;
  const style = opts.style || 'seamless tileable texture, top-down flat lighting, photorealistic, no shadows, no watermark';
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', ' + style)}?width=${size}&height=${size}&model=${opts.model || 'flux'}&nologo=true`;
  const albedo = await loadImageTexture(gl, url, { srgb: true });
  const flat = (r, g2, b2) => new Texture(gl, { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, mips: false }).upload(new Uint8Array([r, g2, b2, 255]), 1, 1);
  const mat = new Material(gl, {
    color: [1, 1, 1],
    roughness: opts.roughness != null ? opts.roughness : 0.85,
    metalness: 0,
    doubleSided: !!opts.doubleSided,
  });
  mat.maps = {
    albedo,
    normal: flat(128, 128, 255),
    orm: flat(255, Math.round((opts.roughness != null ? opts.roughness : 0.85) * 255), 0),
  };
  return mat;
};
