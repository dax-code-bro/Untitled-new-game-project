/* ============================================================
   GL — a thin, honest WebGL2 wrapper.
   No scene knowledge lives here; this layer only knows about
   shaders, buffers, textures and framebuffers.
   ============================================================ */

const GL_VERT_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const GL_FRAG_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;

class Shader {
  constructor(gl, vertSrc, fragSrc, name = 'shader', defines = null) {
    this.gl = gl;
    this.name = name;
    this.program = null;
    this.uniforms = new Map();
    this.attribs = new Map();
    // Defines must land after #version, so they are injected here rather
    // than prepended by the caller.
    this.defines = defines && defines.length
      ? defines.map((d) => `#define ${d}`).join('\n') + '\n'
      : '';
    this._compile(vertSrc, fragSrc);
  }

  _stage(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || '';
      // Point at the offending line — a raw GLSL log with no source context
      // is close to useless when the shader is generated.
      const lines = src.split('\n');
      const m = /ERROR:\s*\d+:(\d+)/.exec(log);
      let context = '';
      if (m) {
        const ln = parseInt(m[1], 10);
        for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 3); i++) {
          context += `${i + 1 === ln ? '>>' : '  '} ${i + 1}: ${lines[i]}\n`;
        }
      }
      gl.deleteShader(sh);
      throw new Error(`[LegendEngine] ${this.name} ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader failed:\n${log}\n${context}`);
    }
    return sh;
  }

  _compile(vertSrc, fragSrc) {
    const gl = this.gl;
    const vs = this._stage(gl.VERTEX_SHADER, GL_VERT_HEADER + this.defines + vertSrc);
    const fs = this._stage(gl.FRAGMENT_SHADER, GL_FRAG_HEADER + this.defines + fragSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`[LegendEngine] ${this.name} link failed: ${log}`);
    }
    this.program = p;

    // Cache every active location up front. Looking these up per-frame is a
    // classic silent framerate killer because the lookup is a string map.
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(base, { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size });
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      this.attribs.set(info.name, gl.getAttribLocation(p, info.name));
    }
    this._texUnit = 0;
  }

  use() {
    this.gl.useProgram(this.program);
    this._texUnit = 0;
    return this;
  }

  /* Uniform setters are permissive by design: shader compilers strip unused
     uniforms, so writing to a missing name is normal and must not throw. */
  f(name, v) { const u = this.uniforms.get(name); if (u) this.gl.uniform1f(u.loc, v); return this; }
  i(name, v) { const u = this.uniforms.get(name); if (u) this.gl.uniform1i(u.loc, v); return this; }
  v2(name, x, y) { const u = this.uniforms.get(name); if (u) this.gl.uniform2f(u.loc, x, y); return this; }
  v3(name, v) { const u = this.uniforms.get(name); if (u) this.gl.uniform3f(u.loc, v.x, v.y, v.z); return this; }
  v3f(name, x, y, z) { const u = this.uniforms.get(name); if (u) this.gl.uniform3f(u.loc, x, y, z); return this; }
  v4(name, x, y, z, w) { const u = this.uniforms.get(name); if (u) this.gl.uniform4f(u.loc, x, y, z, w); return this; }
  m4(name, m) { const u = this.uniforms.get(name); if (u) this.gl.uniformMatrix4fv(u.loc, false, m.e || m); return this; }
  m4v(name, arr) { const u = this.uniforms.get(name); if (u) this.gl.uniformMatrix4fv(u.loc, false, arr); return this; }
  fv(name, arr) { const u = this.uniforms.get(name); if (u) this.gl.uniform1fv(u.loc, arr); return this; }
  v3v(name, arr) { const u = this.uniforms.get(name); if (u) this.gl.uniform3fv(u.loc, arr); return this; }
  v4v(name, arr) { const u = this.uniforms.get(name); if (u) this.gl.uniform4fv(u.loc, arr); return this; }

  /* Bind a texture to the next free unit and point the sampler at it. */
  tex(name, texture, target) {
    const u = this.uniforms.get(name);
    if (!u || !texture) return this;
    const gl = this.gl;
    const unit = this._texUnit++;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target || (texture.target || gl.TEXTURE_2D), texture.handle || texture);
    gl.uniform1i(u.loc, unit);
    return this;
  }

  dispose() { this.gl.deleteProgram(this.program); this.program = null; }
}

/* ---------------- Texture ---------------- */

class Texture {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.target = opts.cube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
    this.handle = gl.createTexture();
    this.width = opts.width || 1;
    this.height = opts.height || 1;
    this.internalFormat = opts.internalFormat || gl.RGBA8;
    this.format = opts.format || gl.RGBA;
    this.type = opts.type || gl.UNSIGNED_BYTE;
    this.mips = opts.mips !== false;
    this._configure(opts);
  }

  _configure(opts) {
    const gl = this.gl;
    gl.bindTexture(this.target, this.handle);
    const wrap = opts.wrap || gl.REPEAT;
    const min = opts.minFilter || (this.mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    const mag = opts.magFilter || gl.LINEAR;
    gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, mag);
    if (opts.compare) {
      gl.texParameteri(this.target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(this.target, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    }
    if (opts.aniso) {
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) {
        const maxA = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(this.target, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(opts.aniso, maxA));
      }
    }
  }

  /* Allocate storage without uploading pixels (render targets). */
  alloc(width, height) {
    const gl = this.gl;
    this.width = width; this.height = height;
    gl.bindTexture(this.target, this.handle);
    if (this.target === gl.TEXTURE_CUBE_MAP) {
      for (let f = 0; f < 6; f++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, this.internalFormat, width, height, 0, this.format, this.type, null);
      }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, width, height, 0, this.format, this.type, null);
    }
    return this;
  }

  upload(data, width, height) {
    const gl = this.gl;
    this.width = width; this.height = height;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, width, height, 0, this.format, this.type, data);
    if (this.mips) gl.generateMipmap(gl.TEXTURE_2D);
    return this;
  }

  uploadCubeFace(face, data, size) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.handle);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, this.internalFormat, size, size, 0, this.format, this.type, data);
    return this;
  }

  generateMips() {
    const gl = this.gl;
    gl.bindTexture(this.target, this.handle);
    gl.generateMipmap(this.target);
    return this;
  }

  dispose() { this.gl.deleteTexture(this.handle); this.handle = null; }
}

/* ---------------- Framebuffer ---------------- */

class Framebuffer {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.width = opts.width || 1;
    this.height = opts.height || 1;
    this.handle = gl.createFramebuffer();
    this.colors = [];
    this.depthTexture = null;
    this.depthBuffer = null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.handle);

    const colorSpecs = opts.colors || (opts.depthOnly ? [] : [{}]);
    const drawBuffers = [];
    colorSpecs.forEach((spec, i) => {
      const tex = new Texture(gl, {
        width: this.width, height: this.height,
        internalFormat: spec.internalFormat || gl.RGBA8,
        format: spec.format || gl.RGBA,
        type: spec.type || gl.UNSIGNED_BYTE,
        wrap: spec.wrap || gl.CLAMP_TO_EDGE,
        minFilter: spec.minFilter || gl.LINEAR,
        magFilter: spec.magFilter || gl.LINEAR,
        mips: false,
      });
      tex.alloc(this.width, this.height);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex.handle, 0);
      this.colors.push(tex);
      drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
    });

    if (drawBuffers.length > 1) gl.drawBuffers(drawBuffers);
    if (drawBuffers.length === 0) {
      // A depth-only target still needs the color outputs explicitly disabled.
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
    }

    if (opts.depthTexture) {
      this.depthTexture = new Texture(gl, {
        width: this.width, height: this.height,
        internalFormat: gl.DEPTH_COMPONENT24,
        format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_INT,
        wrap: gl.CLAMP_TO_EDGE,
        minFilter: opts.compare ? gl.LINEAR : gl.NEAREST,
        magFilter: opts.compare ? gl.LINEAR : gl.NEAREST,
        mips: false,
        compare: opts.compare,
      });
      this.depthTexture.alloc(this.width, this.height);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture.handle, 0);
    } else if (opts.depth !== false) {
      this.depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`[LegendEngine] framebuffer incomplete (0x${status.toString(16)}) at ${this.width}x${this.height}`);
    }
  }

  bind(clear = true, r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.handle);
    gl.viewport(0, 0, this.width, this.height);
    if (clear) {
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    return this;
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return this;
    const gl = this.gl;
    this.width = width; this.height = height;
    for (const c of this.colors) c.alloc(width, height);
    if (this.depthTexture) this.depthTexture.alloc(width, height);
    if (this.depthBuffer) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    }
    return this;
  }

  get color() { return this.colors[0]; }

  dispose() {
    const gl = this.gl;
    for (const c of this.colors) c.dispose();
    if (this.depthTexture) this.depthTexture.dispose();
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
    gl.deleteFramebuffer(this.handle);
  }
}

/* ---------------- GPU mesh ---------------- */

/* Vertex layout is fixed across the engine. One layout keeps VAO setup
   trivial and lets any mesh render through any shader without surprises.
      0 position   vec3
      1 normal     vec3
      2 uv         vec2
      3 tangent    vec4  (w = handedness)
      4 color      vec3
      5 joints     vec4  (skinned meshes)
      6 weights    vec4  (skinned meshes)
   Instance attributes start at 8 so they never collide. */
const ATTR = { POSITION: 0, NORMAL: 1, UV: 2, TANGENT: 3, COLOR: 4, JOINTS: 5, WEIGHTS: 6, INSTANCE: 8 };

class GpuMesh {
  constructor(gl, geometry) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.buffers = [];
    this.indexCount = geometry.indices ? geometry.indices.length : 0;
    this.vertexCount = geometry.positions.length / 3;
    this.indexType = this.vertexCount > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.instanceBuffer = null;
    this.instanceCount = 0;
    this.bounds = geometry.bounds || null;

    gl.bindVertexArray(this.vao);
    this._attrib(ATTR.POSITION, geometry.positions, 3);
    if (geometry.normals) this._attrib(ATTR.NORMAL, geometry.normals, 3);
    if (geometry.uvs) this._attrib(ATTR.UV, geometry.uvs, 2);
    if (geometry.tangents) this._attrib(ATTR.TANGENT, geometry.tangents, 4);
    if (geometry.colors) this._attrib(ATTR.COLOR, geometry.colors, 3);
    if (geometry.joints) this._attrib(ATTR.JOINTS, geometry.joints, 4);
    if (geometry.weights) this._attrib(ATTR.WEIGHTS, geometry.weights, 4);

    if (geometry.indices) {
      const ib = gl.createBuffer();
      const data = this.indexType === gl.UNSIGNED_INT
        ? new Uint32Array(geometry.indices)
        : new Uint16Array(geometry.indices);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.buffers.push(ib);
    }
    gl.bindVertexArray(null);
  }

  _attrib(loc, data, size) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    this.buffers.push(buf);
  }

  /* Per-instance data: 16 floats of model matrix + 4 of tint//custom = 20.
     Uploading one big interleaved buffer beats 20 separate uniform calls
     per object by a very wide margin once counts pass a few hundred. */
  setupInstancing(strideFloats = 20) {
    const gl = this.gl;
    this.instanceStride = strideFloats;
    this.instanceBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const bytes = strideFloats * 4;
    // Matrix occupies 4 consecutive vec4 slots.
    for (let i = 0; i < 4; i++) {
      const loc = ATTR.INSTANCE + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytes, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    if (strideFloats >= 20) {
      const loc = ATTR.INSTANCE + 4;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytes, 64);
      gl.vertexAttribDivisor(loc, 1);
    }
    if (strideFloats >= 24) {
      const loc = ATTR.INSTANCE + 5;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytes, 80);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return this;
  }

  uploadInstances(float32, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    // Allocate capacity once and update in place. Re-specifying with
    // bufferData every frame orphans the old storage, and a scene with a
    // few dozen instanced groups orphans thousands of backing buffers in
    // the first seconds — on some drivers (SwiftShader in particular) the
    // allocation pool eventually jams and every subsequent GL call syncs
    // against it, permanently. bufferSubData into a persistent allocation
    // is the canonical dynamic-data path and never touches the allocator.
    if (!this._instanceCapacity || this._instanceCapacity < float32.byteLength) {
      this._instanceCapacity = Math.max(float32.byteLength, (this._instanceCapacity || 0) * 2);
      gl.bufferData(gl.ARRAY_BUFFER, this._instanceCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, float32);
    this.instanceCount = count;
    return this;
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.indexCount) gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  drawInstanced(count = this.instanceCount) {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.indexCount) gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, this.indexType, 0, count);
    else gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, count);
  }

  dispose() {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vao);
  }
}

/* A single triangle covering the screen. Cheaper than a quad and free of
   the diagonal seam that shows up in derivative-heavy post shaders. */
class FullscreenTri {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.buf = buf;
  }
  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

const FULLSCREEN_VS = `
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
