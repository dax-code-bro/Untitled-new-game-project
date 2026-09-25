#include "game/AnimalModel.h"
#include "core/Noise.h"
#include "render/Animation.h"
#include <functional>

namespace ps {

int AnimalRig::add(const std::string& name, int parent, vec3 pos) {
    bones.push_back({name, parent, pos});
    return int(bones.size()) - 1;
}

namespace {

// ---------------------------------------------------------------------------
// Lofting: a smooth tube through key cross-sections, skinned to a bone chain.
// ---------------------------------------------------------------------------
struct Key {
    vec3 c;              // center
    float rx, ry;        // half width (along side), half height (along ring up)
    float bone;          // position in the bone chain (fractional = blend)
    float sub = 0.5f;    // coat region coordinate
    float fur = 0.0f;    // hair length (m)
    int region = REG_BODY;
};

struct LoftOpts {
    int segs = 20;
    bool capStart = true, capEnd = true;
    float capStartScale = 1.0f, capEndScale = 1.0f;   // cap length relative to radius
    vec3 side{1, 0, 0};                                // reference side axis
    float rough = 0.85f;
    bool coat = true;                                  // false: fixed albedo (vertex color)
    vec3 color{1, 1, 1};
    int ringsPerKey = 4;
    // Optional per-vertex hook: (vertex, ring parameter 0..1 along loft, angle)
    std::function<void(SkinVertex&, float, float)> modify;
    // Optional ring-radius tweak: (angle, t) -> radial multiplier
    std::function<float(float, float)> radial;
};

float smooth01(float t) { return t * t * (3.0f - 2.0f * t); }

void setBones(SkinVertex& v, const std::vector<int>& chain, float bp) {
    bp = clampf(bp, 0.0f, float(chain.size() - 1));
    int i0 = int(std::floor(bp));
    int i1 = std::min(i0 + 1, int(chain.size()) - 1);
    float w = bp - float(i0);
    v.bones = vec4(float(chain[size_t(i0)]), float(chain[size_t(i1)]), 0, 0);
    v.weights = vec4(1.0f - w, w, 0, 0);
}

void loft(SkinBuilder& b, const std::vector<Key>& keys, const std::vector<int>& chain, const LoftOpts& o) {
    if (keys.size() < 2) return;
    // 1. Densify keys into rings (Catmull-Rom centers, smooth radii)
    struct Ring { vec3 c; float rx, ry, bone, sub, fur; int region; float t; };
    std::vector<Ring> rings;
    const size_t n = keys.size();
    for (size_t i = 0; i + 1 < n; ++i) {
        const Key& k0 = keys[i > 0 ? i - 1 : 0];
        const Key& k1 = keys[i];
        const Key& k2 = keys[i + 1];
        const Key& k3 = keys[std::min(i + 2, n - 1)];
        int steps = o.ringsPerKey;
        for (int s = 0; s < steps; ++s) {
            float t = float(s) / float(steps);
            float st = smooth01(t);
            Ring r;
            r.c = catmullRom(k0.c, k1.c, k2.c, k3.c, t);
            float lo = std::min(k1.rx, k2.rx) * 0.8f, hi = std::max(k1.rx, k2.rx) * 1.05f;
            r.rx = clampf(catmullRom(k0.rx, k1.rx, k2.rx, k3.rx, t), lo, hi);
            lo = std::min(k1.ry, k2.ry) * 0.8f; hi = std::max(k1.ry, k2.ry) * 1.05f;
            r.ry = clampf(catmullRom(k0.ry, k1.ry, k2.ry, k3.ry, t), lo, hi);
            r.bone = lerpf(k1.bone, k2.bone, t);
            r.sub = lerpf(k1.sub, k2.sub, t);
            r.fur = lerpf(k1.fur, k2.fur, st);
            r.region = t < 0.5f ? k1.region : k2.region;
            rings.push_back(r);
        }
    }
    {
        const Key& k = keys.back();
        rings.push_back({k.c, k.rx, k.ry, k.bone, k.sub, k.fur, k.region, 0});
    }
    const size_t R = rings.size();
    for (size_t i = 0; i < R; ++i) rings[i].t = float(i) / float(R - 1);

    // 2. Frames
    std::vector<vec3> tang(R), up(R), side(R);
    for (size_t i = 0; i < R; ++i) {
        vec3 a = rings[i > 0 ? i - 1 : 0].c, c = rings[std::min(i + 1, R - 1)].c;
        vec3 t = c - a;
        tang[i] = length(t) > 1e-6f ? normalize(t) : (i ? tang[i - 1] : vec3(0, 0, 1));
        vec3 s = o.side - tang[i] * dot(o.side, tang[i]);
        if (length(s) < 1e-4f) s = i ? side[i - 1] : vec3(0, 1, 0);
        side[i] = normalize(s);
        up[i] = normalize(cross(tang[i], side[i]));
    }

    const int S = o.segs;
    auto makeVertex = [&](vec3 center, vec3 sd, vec3 u, float rx, float ry, float a, const Ring& r, float bone) {
        float ca = std::cos(a), sa = std::sin(a);
        float rm = o.radial ? o.radial(a, r.t) : 1.0f;
        vec3 off = sd * (rx * ca * rm) + u * (ry * sa * rm);
        SkinVertex v{};
        v.pos = center + off;
        v.normal = length(off) > 1e-7f ? normalize(off) : tang[0];
        float wy = length(off) > 1e-7f ? normalize(off).y : 0.0f;
        v.uv = vec2(float(r.region), r.sub);
        v.color = vec4(o.color, clampf(0.5f - 0.5f * wy, 0.0f, 1.0f));
        v.mat = vec4(o.rough, 0.0f, o.coat ? r.fur : 0.0f, o.coat ? float(PAT_COAT) : float(PAT_PLAIN));
        if (!o.coat) v.uv = vec2(float(REG_FIXED), 0.0f);
        setBones(v, chain, bone);
        if (o.modify) o.modify(v, r.t, a);
        return v;
    };

    const uint32_t base = uint32_t(b.verts.size());
    // Start cap rings (reverse order so indices run tip -> body)
    const int capRings = 4;
    std::vector<uint32_t> ringStart;
    uint32_t tipStart = UINT32_MAX, tipEnd = UINT32_MAX;
    if (o.capStart) {
        const Ring& r = rings.front();
        float cl = std::min(r.rx, r.ry) * o.capStartScale;
        SkinVertex tip = makeVertex(r.c - tang[0] * cl, side[0], up[0], 0, 0, 0, r, r.bone);
        tip.normal = -tang[0];
        tipStart = b.add(tip);
        for (int k = capRings - 1; k >= 1; --k) {
            float th = float(k) / float(capRings) * kPi * 0.5f;
            vec3 cc = r.c - tang[0] * (cl * std::sin(th));
            ringStart.push_back(uint32_t(b.verts.size()));
            for (int j = 0; j < S; ++j) {
                float a = float(j) / float(S) * 2.0f * kPi;
                b.add(makeVertex(cc, side[0], up[0], r.rx * std::cos(th), r.ry * std::cos(th), a, r, r.bone));
            }
        }
    }
    for (size_t i = 0; i < R; ++i) {
        ringStart.push_back(uint32_t(b.verts.size()));
        for (int j = 0; j < S; ++j) {
            float a = float(j) / float(S) * 2.0f * kPi;
            b.add(makeVertex(rings[i].c, side[i], up[i], rings[i].rx, rings[i].ry, a, rings[i], rings[i].bone));
        }
    }
    if (o.capEnd) {
        const Ring& r = rings.back();
        float cl = std::min(r.rx, r.ry) * o.capEndScale;
        for (int k = 1; k < capRings; ++k) {
            float th = float(k) / float(capRings) * kPi * 0.5f;
            vec3 cc = r.c + tang[R - 1] * (cl * std::sin(th));
            ringStart.push_back(uint32_t(b.verts.size()));
            for (int j = 0; j < S; ++j) {
                float a = float(j) / float(S) * 2.0f * kPi;
                b.add(makeVertex(cc, side[R - 1], up[R - 1], r.rx * std::cos(th), r.ry * std::cos(th), a, r, r.bone));
            }
        }
        SkinVertex tip = makeVertex(r.c + tang[R - 1] * cl, side[R - 1], up[R - 1], 0, 0, 0, r, r.bone);
        tipEnd = b.add(tip);
    }
    // 3. Triangles
    const size_t idx0 = b.idx.size();
    for (size_t i = 0; i + 1 < ringStart.size(); ++i)
        for (int j = 0; j < S; ++j) {
            uint32_t a = ringStart[i] + uint32_t(j), bb = ringStart[i] + uint32_t((j + 1) % S);
            uint32_t c = ringStart[i + 1] + uint32_t(j), d = ringStart[i + 1] + uint32_t((j + 1) % S);
            b.tri(a, c, d);
            b.tri(a, d, bb);
        }
    if (tipStart != UINT32_MAX)
        for (int j = 0; j < S; ++j) b.tri(tipStart, ringStart.front() + uint32_t((j + 1) % S), ringStart.front() + uint32_t(j));
    if (tipEnd != UINT32_MAX)
        for (int j = 0; j < S; ++j) b.tri(tipEnd, ringStart.back() + uint32_t(j), ringStart.back() + uint32_t((j + 1) % S));
    // 4. Make sure faces point outward (check one quad in the middle)
    size_t mid = ringStart.size() / 2;
    if (mid + 1 < ringStart.size()) {
        const SkinVertex& va = b.verts[ringStart[mid]];
        const SkinVertex& vc = b.verts[ringStart[mid + 1]];
        const SkinVertex& vd = b.verts[ringStart[mid + 1] + 1];
        vec3 fn = cross(vc.pos - va.pos, vd.pos - va.pos);
        if (dot(fn, va.normal) < 0.0f)
            for (size_t k = idx0; k + 2 < b.idx.size(); k += 3) std::swap(b.idx[k + 1], b.idx[k + 2]);
    }
    (void)base;
}

// Rigid ellipsoid attached to one bone (eyes, noses, toes...)
void blob(SkinBuilder& b, vec3 c, vec3 r, int bone, vec3 color, float rough, int segs = 12, int rings = 8,
          const mat4* orient = nullptr) {
    uint32_t start = uint32_t(b.verts.size());
    for (int y = 0; y <= rings; ++y) {
        float phi = float(y) / float(rings) * kPi;
        for (int x = 0; x <= segs; ++x) {
            float th = float(x) / float(segs) * 2.0f * kPi;
            vec3 d{std::sin(phi) * std::cos(th), std::cos(phi), std::sin(phi) * std::sin(th)};
            vec3 p = d * r, n = normalize(vec3(d.x / r.x, d.y / r.y, d.z / r.z));
            if (orient) { p = orient->transformDir(p); n = normalize(orient->transformDir(n)); }
            SkinVertex v{};
            v.pos = c + p;
            v.normal = n;
            v.uv = vec2(float(REG_FIXED), 0.0f);
            v.color = vec4(color, 0.5f);
            v.mat = vec4(rough, 0.0f, 0.0f, float(PAT_PLAIN));
            v.bones = vec4(float(bone), 0, 0, 0);
            v.weights = vec4(1, 0, 0, 0);
            b.add(v);
        }
    }
    for (int y = 0; y < rings; ++y)
        for (int x = 0; x < segs; ++x) {
            uint32_t a = start + uint32_t(y * (segs + 1) + x), c = a + uint32_t(segs + 1);
            b.tri(a, a + 1, c + 1);
            b.tri(a, c + 1, c);
        }
}

// Rotation that maps +Y to `dir` (for orienting blobs)
mat4 alignY(vec3 dir) {
    dir = normalize(dir);
    vec3 up{0, 1, 0};
    vec3 ax = cross(up, dir);
    float s = length(ax), c = dot(up, dir);
    if (s < 1e-5f) return c > 0 ? mat4() : mat4::rotate(quat::axisAngle({1, 0, 0}, kPi));
    return mat4::rotate(quat::axisAngle(ax / s, std::atan2(s, c)));
}

// A tapered tube along a polyline (horns, antlers, toes, beaks, whisker-free details)
void tube(SkinBuilder& b, const std::vector<vec3>& pts, float r0, float r1, int bone, vec3 color, float rough,
          int segs = 8, bool coat = false, int region = REG_FIXED, float fur = 0.0f, vec3 side = {1, 0, 0}) {
    std::vector<Key> keys;
    for (size_t i = 0; i < pts.size(); ++i) {
        float t = float(i) / float(pts.size() - 1);
        Key k;
        k.c = pts[i];
        k.rx = k.ry = lerpf(r0, r1, t);
        k.bone = 0;
        k.sub = t;
        k.fur = fur;
        k.region = region;
        keys.push_back(k);
    }
    LoftOpts o;
    o.segs = segs;
    o.coat = coat;
    o.color = color;
    o.rough = rough;
    o.ringsPerKey = 2;
    o.side = side;
    o.capEndScale = 0.6f;
    loft(b, keys, {bone}, o);
}

vec3 jitterColor(vec3 c, Rng& r, float amt) {
    float k = 1.0f + r.range(-amt, amt);
    return vec3(clampf(c.x * k, 0, 1), clampf(c.y * k, 0, 1), clampf(c.z * k, 0, 1));
}

// Colors shared by many parts
const vec3 kClaw{0.12f, 0.10f, 0.09f};
const vec3 kHoof{0.10f, 0.08f, 0.07f};
const vec3 kHorn{0.55f, 0.48f, 0.38f};
const vec3 kAntler{0.52f, 0.42f, 0.30f};
const vec3 kIvory{0.88f, 0.84f, 0.72f};
const vec3 kMouth{0.45f, 0.14f, 0.15f};
const vec3 kTongue{0.80f, 0.36f, 0.40f};
const vec3 kPink{0.86f, 0.58f, 0.56f};

// Eye: iris ball + pupil (round / slit / horizontal) + bright wet highlight comes from the shader.
void eye(SkinBuilder& b, vec3 c, float r, vec3 look, int bone, vec3 iris, Pupil pupil, bool bigSclera = false) {
    look = normalize(look);
    blob(b, c, vec3(r), bone, bigSclera ? vec3(0.92f, 0.90f, 0.86f) : iris * 0.9f, 0.04f, 14, 10);
    if (bigSclera) blob(b, c + look * r * 0.62f, vec3(r * 0.62f), bone, iris, 0.04f, 12, 8);
    mat4 o = alignY(look);
    vec3 pr = pupil == Pupil::Round ? vec3(r * 0.42f, r * 0.12f, r * 0.42f)
            : pupil == Pupil::Slit ? vec3(r * 0.13f, r * 0.12f, r * 0.55f)
            : vec3(r * 0.55f, r * 0.12f, r * 0.2f);
    // slit: vertical (along world up) -> rotate so the long axis is vertical after alignY
    mat4 po = o;
    if (pupil == Pupil::Slit || pupil == Pupil::Horizontal) {
        // Build a frame: y = look, z = world up projected
        vec3 upv = vec3(0, 1, 0) - look * look.y;
        if (length(upv) < 1e-3f) upv = {0, 0, 1};
        upv = normalize(upv);
        vec3 xv = cross(look, upv);
        po = mat4();
        po.m[0][0] = xv.x; po.m[0][1] = xv.y; po.m[0][2] = xv.z;
        po.m[1][0] = look.x; po.m[1][1] = look.y; po.m[1][2] = look.z;
        po.m[2][0] = upv.x; po.m[2][1] = upv.y; po.m[2][2] = upv.z;
    }
    blob(b, c + look * r * (bigSclera ? 0.96f : 0.9f), pr, bone, vec3(0.01f, 0.01f, 0.012f), 0.03f, 12, 6, &po);
}

// ---------------------------------------------------------------------------
// Ears: flattened, cupped lofts with a coat-colored back and skin-colored inside
// ---------------------------------------------------------------------------
void buildEar(SkinBuilder& b, Ear type, vec3 base, float len, float hw, float side, vec3 fwd, vec3 upH,
              int earBone, int headBone, float fur, float youth) {
    if (type == Ear::None) return;
    vec3 out{side, 0, 0};
    vec3 axis, cupN;
    float width = len * 0.55f, droop = 0.0f, thick = std::max(len * 0.04f, 0.0015f);
    int n = 7;
    std::vector<float> widths;
    switch (type) {
    case Ear::Erect:   axis = normalize(upH * 1.0f + out * 0.35f - fwd * 0.1f); width = len * 0.75f; break;
    case Ear::Pointed: axis = normalize(upH * 1.0f + out * 0.45f - fwd * 0.05f); width = len * 0.7f; break;
    case Ear::Tufted:  axis = normalize(upH * 1.0f + out * 0.35f); width = len * 0.6f; break;
    case Ear::Round:   axis = normalize(upH * 1.0f + out * 0.6f); width = len * 0.95f; break;
    case Ear::Small:   axis = normalize(upH * 0.6f + out * 0.8f - fwd * 0.3f); width = len * 0.7f; break;
    case Ear::Wide:    axis = normalize(upH * 0.4f + out * 1.0f); width = len * 0.8f; break;
    case Ear::Long:    axis = normalize(upH * 1.0f + out * 0.18f - fwd * 0.35f); width = len * 0.42f; break;
    case Ear::Rose:    axis = normalize(upH * 0.55f + out * 0.8f - fwd * 0.55f); width = len * 0.6f; droop = 0.5f; break;
    case Ear::Folded:  axis = normalize(upH * 0.7f + out * 0.45f + fwd * 0.2f); width = len * 0.62f; droop = 0.9f; break;
    case Ear::Floppy:  axis = normalize(-upH * 0.9f + out * 0.35f + fwd * 0.05f); width = len * 0.55f; break;
    case Ear::Lop:     axis = normalize(-upH * 1.0f + out * 0.18f); width = len * 0.32f; break;
    default: axis = upH; break;
    }
    if (youth > 0.3f && (type == Ear::Erect || type == Ear::Pointed)) {
        // puppies/kittens: ears flop a little until they grow
        droop = std::max(droop, youth * 0.5f);
    }
    cupN = normalize(cross(axis, out));
    if (dot(cupN, fwd) < 0) cupN = -cupN;
    bool hanging = type == Ear::Floppy || type == Ear::Lop;
    if (hanging) {
        // cup faces the head (inward)
        cupN = -out;
    }
    vec3 widthAxis = normalize(cross(cupN, axis));
    std::vector<Key> keys;
    for (int i = 0; i <= n; ++i) {
        float t = float(i) / float(n);
        float w;
        switch (type) {
        case Ear::Round: w = std::sqrt(std::max(0.0f, 1.0f - (t * 1.9f - 0.9f) * (t * 1.9f - 0.9f))) * 0.95f + 0.05f; break;
        case Ear::Floppy: case Ear::Lop: w = 0.75f + 0.25f * std::sin(t * kPi) - 0.35f * t * t * t; break;
        case Ear::Long: w = 0.6f + 0.4f * std::sin(t * kPi * 0.9f); break;
        default: w = 1.0f - t * 0.92f; w = w * (0.8f + 0.2f * std::sin(t * kPi)); break;
        }
        w = std::max(w, 0.08f);
        vec3 p = base + axis * (len * t);
        if (hanging) p += out * (len * 0.12f * std::sin(t * kPi * 0.5f)) + fwd * (len * 0.05f * t);
        if (droop > 0.0f) {
            float bend = std::max(0.0f, t - 0.45f) / 0.55f;
            p += (-upH * 0.7f + fwd * 0.3f) * (len * droop * bend * bend * 0.6f);
        }
        Key k;
        k.c = p;
        k.rx = width * 0.5f * w;
        k.ry = thick * (1.0f - t * 0.5f) + (i == 0 ? thick : 0.0f);
        k.bone = t < 0.15f ? t / 0.15f * 0.6f : 0.6f + (t - 0.15f) / 0.85f * 0.4f;
        k.sub = t;
        k.fur = fur * 0.3f;
        k.region = REG_EAR;
        keys.push_back(k);
    }
    LoftOpts o;
    o.segs = 14;
    o.side = widthAxis;
    o.ringsPerKey = 2;
    o.capStartScale = 0.3f;
    o.capEndScale = 0.4f;
    float cup = hanging ? 0.1f : 0.35f;
    o.radial = [cup](float a, float) { return 1.0f; (void)cup; (void)a; };
    vec3 cupDir = cupN;
    float cupAmt = width * 0.18f * (hanging ? 0.4f : 1.0f);
    o.modify = [cupDir, cupAmt, type](SkinVertex& v, float t, float a) {
        // Inner face (toward cupN) is skin-colored, bent into a cup
        float s = std::sin(a);
        float c = std::cos(a);
        if (s > 0.0f) v.uv.x = float(REG_EAR_INNER);
        v.pos = v.pos - cupDir * (cupAmt * (1.0f - c * c) * (1.0f - t * 0.6f));
        if (type == Ear::Tufted && t > 0.9f) v.mat.z = 0.03f;
    };
    // bones: 0 = head, 1 = ear
    loft(b, keys, {headBone, earBone}, o);
    if (type == Ear::Tufted) {
        vec3 tip = base + axis * len;
        tube(b, {tip, tip + axis * len * 0.35f}, len * 0.05f, len * 0.01f, earBone, vec3(0.05f, 0.04f, 0.04f), 0.8f, 6);
    }
}

// ---------------------------------------------------------------------------
// Horns and antlers
// ---------------------------------------------------------------------------
void buildHorns(SkinBuilder& b, Horns type, vec3 base, float size, float side, vec3 fwd, vec3 upH, int bone, Rng& rng) {
    vec3 out{side, 0, 0};
    switch (type) {
    case Horns::Antlers: {
        // Main beam sweeps back, out and up, then forward; tines rise from the front of the beam.
        std::vector<vec3> beam;
        for (int i = 0; i <= 8; ++i) {
            float t = float(i) / 8.0f;
            vec3 p = base + upH * (size * (0.15f + 0.65f * t)) + out * (size * 0.45f * std::sin(t * kPi * 0.6f))
                   - fwd * (size * 0.35f * std::sin(t * kPi)) + fwd * (size * 0.25f * t * t);
            beam.push_back(p);
        }
        tube(b, beam, size * 0.05f, size * 0.018f, bone, kAntler, 0.7f, 8);
        int tines = 3 + int(rng.uniform() * 2.0f);
        for (int k = 0; k < tines; ++k) {
            float t = 0.25f + 0.6f * float(k) / float(tines);
            vec3 p = beam[size_t(t * 8.0f)];
            tube(b, {p, p + upH * size * 0.3f + fwd * size * 0.08f, p + upH * size * 0.45f + fwd * size * 0.12f},
                 size * 0.028f, size * 0.01f, bone, kAntler, 0.7f, 6);
        }
        tube(b, {beam[1], beam[1] + fwd * size * 0.22f + upH * size * 0.12f}, size * 0.03f, size * 0.01f, bone, kAntler, 0.7f, 6);
        break;
    }
    case Horns::Palmate: {  // moose: wide flat palm with points
        std::vector<vec3> stem{base, base + out * size * 0.35f + upH * size * 0.1f};
        tube(b, stem, size * 0.06f, size * 0.05f, bone, kAntler, 0.7f, 8);
        vec3 pc = stem.back() + out * size * 0.35f + upH * size * 0.1f;
        std::vector<Key> keys;
        for (int i = 0; i <= 4; ++i) {
            float t = float(i) / 4.0f;
            Key k;
            k.c = stem.back() + (pc - stem.back()) * (t * 2.0f) + upH * (size * 0.15f * t);
            k.rx = size * (0.18f + 0.25f * std::sin(t * kPi));
            k.ry = size * 0.025f;
            k.bone = 0;
            k.region = REG_FIXED;
            keys.push_back(k);
        }
        LoftOpts o;
        o.coat = false;
        o.color = kAntler;
        o.rough = 0.7f;
        o.segs = 12;
        o.side = normalize(fwd + upH * 0.6f);
        loft(b, keys, {bone}, o);
        for (int k = 0; k < 5; ++k) {
            float t = float(k) / 4.0f;
            vec3 p = stem.back() + (pc - stem.back()) * (0.6f + t * 1.4f) + upH * size * 0.12f;
            tube(b, {p, p + upH * size * 0.14f + fwd * size * (0.1f - 0.2f * t)}, size * 0.02f, size * 0.006f, bone, kAntler, 0.7f, 6);
        }
        break;
    }
    case Horns::Curled: {  // bighorn ram: spiral curling back and down around the ear
        std::vector<vec3> pts;
        for (int i = 0; i <= 14; ++i) {
            float t = float(i) / 14.0f;
            float ang = t * kPi * 1.5f;
            float rad = size * (0.12f + 0.28f * t);
            vec3 p = base + out * (size * 0.12f * t + 0.02f) + upH * (rad * std::cos(ang) - size * 0.05f) -
                     fwd * (rad * std::sin(ang)) + out * (size * 0.15f * t);
            pts.push_back(p);
        }
        tube(b, pts, size * 0.11f, size * 0.03f, bone, kHorn, 0.75f, 10);
        break;
    }
    case Horns::Swept: {   // goats: back-swept arcs
        std::vector<vec3> pts;
        for (int i = 0; i <= 8; ++i) {
            float t = float(i) / 8.0f;
            pts.push_back(base + upH * (size * 0.6f * std::sin(t * 1.2f)) - fwd * (size * 0.7f * t * t) + out * (size * 0.15f * t));
        }
        tube(b, pts, size * 0.07f, size * 0.012f, bone, kHorn * 0.6f, 0.7f, 8);
        break;
    }
    case Horns::Cow: {
        std::vector<vec3> pts;
        for (int i = 0; i <= 8; ++i) {
            float t = float(i) / 8.0f;
            pts.push_back(base + out * (size * 0.7f * t) + upH * (size * 0.35f * t * t) + fwd * (size * 0.15f * t * t));
        }
        tube(b, pts, size * 0.08f, size * 0.015f, bone, kHorn * 1.1f, 0.6f, 8);
        break;
    }
    case Horns::Pronghorn: {
        tube(b, {base, base + upH * size * 0.5f, base + upH * size * 0.8f - fwd * size * 0.15f}, size * 0.07f, size * 0.015f, bone,
             vec3(0.08f, 0.07f, 0.06f), 0.6f, 8);
        vec3 p = base + upH * size * 0.45f;
        tube(b, {p, p + fwd * size * 0.14f + upH * size * 0.05f}, size * 0.04f, size * 0.01f, bone, vec3(0.08f, 0.07f, 0.06f), 0.6f, 6);
        break;
    }
    case Horns::Short:
        tube(b, {base, base + upH * size * 0.35f + out * size * 0.05f}, size * 0.08f, size * 0.03f, bone, kHorn, 0.7f, 8);
        break;
    case Horns::Spiral: {
        std::vector<vec3> pts;
        for (int i = 0; i <= 12; ++i) {
            float t = float(i) / 12.0f;
            float ang = t * kPi * 3.0f;
            pts.push_back(base + upH * (size * 0.8f * t) - fwd * (size * 0.3f * t) + out * (size * 0.1f * (1.0f + std::cos(ang)) + size * 0.2f * t) +
                          fwd * (size * 0.08f * std::sin(ang)));
        }
        tube(b, pts, size * 0.07f, size * 0.01f, bone, kHorn, 0.7f, 8);
        break;
    }
    default: break;
    }
}

// ---------------------------------------------------------------------------
// Quadrupeds (dogs, cats, rabbits, rodents, ungulates, bears, primates...)
// ---------------------------------------------------------------------------
void buildQuadruped(const Species& sp, const AnimalIndividual& ind, AnimalBuild& out, Rng& rng, float sc, float youth) {
    const AnimalShape& S = sp.shape;
    AnimalRig& rig = out.rig;
    SkinBuilder& b = out.mesh;
    const float age = 1.0f - youth;
    const float wf = ind.weightFactor;
    const bool male = ind.male;

    const float H = S.height * sc;
    const float L = S.length * sc * (1.0f - 0.12f * youth);
    const float legRatio = S.legRatio * (1.0f - 0.12f * youth);
    const float D = H * (1.0f - legRatio);                      // chest depth
    const float W = S.girth * S.length * sc * std::sqrt(wf) * (1.0f + 0.1f * youth);
    const float rumpTop = H * S.rumpRatio;
    const float Dr = D * (0.82f + 0.1f * (wf - 1.0f));
    const float fluff = S.fluff * (1.0f + 0.6f * youth);
    const float fur = S.fur * (1.0f + 0.3f * youth);
    const float furPad = std::min(fur * fluff * 0.55f, S.height * sc * 0.07f);   // silhouette added by long coats
    const float HL = S.headLen * S.height * sc * (1.0f + 0.35f * youth);
    const float snout = S.snoutLen * (1.0f - 0.4f * youth);
    const float SL = HL * (1.0f - snout), ML = HL * snout;
    const float hw = HL * S.headWidth * 0.5f;
    const float tuck = S.tuck * (1.2f - 0.4f * wf);
    const bool hoofed = S.foot == Foot::Hoof || S.foot == Foot::Cloven;
    const bool hopper = S.gait == Gait::Hop;
    const bool primate = S.plan == BodyPlan::Primate;
    const float neckAngle = radians(S.neckAngle);
    const float headPitch = radians(S.headPitch);

    // ---- Skeleton (bind pose, +Z forward, feet on y = 0) ----
    rig.root = rig.add("root", -1, {0, 0, 0});
    float ycRump = rumpTop - Dr * 0.5f, ycChest = H - D * 0.5f;
    float ycWaist = (ycRump + ycChest) * 0.5f + D * tuck * 0.12f;
    rig.pelvis = rig.add("pelvis", rig.root, {0, ycRump, -L * 0.3f});
    rig.spine = rig.add("spine", rig.pelvis, {0, ycWaist, 0.0f});
    rig.chest = rig.add("chest", rig.spine, {0, ycChest, L * 0.28f});
    vec3 NB{0, H - D * 0.28f, L * 0.47f};
    vec3 dn{0, std::sin(neckAngle), std::cos(neckAngle)};
    float NL = S.neckLen * H;
    vec3 NE = NB + dn * NL;
    rig.neck1 = rig.add("neck1", rig.chest, NB);
    rig.neck2 = rig.add("neck2", rig.neck1, NB + dn * (NL * 0.55f));
    vec3 dh{0, -std::sin(headPitch), std::cos(headPitch)};
    vec3 upH{0, std::cos(headPitch), std::sin(headPitch)};
    vec3 HB = NE + upH * (hw * 0.15f);
    rig.head = rig.add("head", rig.neck2, HB);
    vec3 jawPivot = HB + dh * (SL * 0.55f) - upH * (hw * 0.55f);
    rig.jaw = rig.add("jaw", rig.head, jawPivot);
    rig.tongue = rig.add("tongue", rig.jaw, jawPivot + dh * (SL * 0.45f + ML * 0.3f) + upH * (hw * 0.12f));
    vec3 earBaseL = HB + dh * (SL * 0.32f) + upH * (hw * 0.78f) + vec3(hw * 0.55f, 0, 0);
    vec3 earBaseR = earBaseL; earBaseR.x = -earBaseL.x;
    if (S.ear == Ear::Floppy || S.ear == Ear::Lop) {
        earBaseL = HB + dh * (SL * 0.25f) + upH * (hw * 0.62f) + vec3(hw * 0.78f, 0, 0);
        earBaseR = earBaseL; earBaseR.x = -earBaseL.x;
    }
    if (S.ear == Ear::Long) {   // rabbits: ears rise from the top of the head
        earBaseL = HB + dh * (SL * 0.3f) + upH * (hw * 0.85f) + vec3(hw * 0.3f, 0, 0);
        earBaseR = earBaseL; earBaseR.x = -earBaseL.x;
    }
    if (S.plan == BodyPlan::Primate) {
        earBaseL = HB + dh * (SL * 0.3f) + upH * (hw * 0.2f) + vec3(hw * 0.92f, 0, 0);
        earBaseR = earBaseL; earBaseR.x = -earBaseL.x;
    }
    rig.earL = rig.add("earL", rig.head, earBaseL);
    rig.earR = rig.add("earR", rig.head, earBaseR);

    // Tail chain
    vec3 TB{0, rumpTop - Dr * 0.22f, -L * 0.5f - Dr * 0.12f};
    float TLen = S.tailLen * L * (0.7f + 0.3f * age);
    float carry = radians(S.tailCarry);
    std::vector<vec3> tailPts;
    int tailN = 6;
    {
        // Each tail type has an absolute pitch profile along its length
        // (0 = straight back, +90 = straight up, -90 = hanging down).
        vec3 p = TB;
        float step = TLen / float(tailN);
        for (int i = 0; i <= tailN; ++i) {
            tailPts.push_back(p);
            float t = (float(i) + 0.5f) / float(tailN);
            float a;
            switch (S.tail) {
            case Tail::CurledUp: a = carry + radians(230.0f) * t; break;                       // curls over the back
            case Tail::Normal: case Tail::Bushy: case Tail::Thick: a = carry - radians(60.0f) * std::pow(t, 1.2f); break;
            case Tail::LongThin: a = carry - radians(95.0f) * t + radians(120.0f) * t * t * t; break;   // J-hook
            case Tail::Thin: case Tail::Tufted: a = carry - radians(115.0f) * std::min(1.0f, t * 2.2f); break;
            case Tail::HorseHair: a = carry - radians(110.0f) * std::min(1.0f, t * 1.8f); break;
            default: a = carry - radians(30.0f) * t; break;
            }
            a = clampf(a, -radians(100.0f), radians(250.0f));
            p += vec3(0, std::sin(a), -std::cos(a)) * step;
        }
    }
    if (S.tail != Tail::None) {
        int parent = rig.pelvis;
        rig.tailCount = tailN;
        for (int i = 0; i < tailN; ++i) {
            rig.tail[i] = rig.add("tail" + std::to_string(i), parent, tailPts[size_t(i)]);
            parent = rig.tail[i];
        }
    }

    // Legs: FL FR HL HR, each: upper, mid, lower, foot
    float xF = W * 0.62f, xH = W * 0.66f;
    float elbowY = legRatio * H * 1.02f;
    float lowerR = std::max(W * S.legThick * 0.42f, 0.004f);
    float pawR = lowerR * (hoofed ? 1.15f : 1.35f) * (S.foot == Foot::Hand ? 1.3f : 1.0f);
    vec3 legPts[4][4];
    for (int s = 0; s < 2; ++s) {
        // Joint offsets scale with leg length, so short-legged breeds stand straight.
        float x = s == 0 ? xF : -xF;
        float zS = L * 0.38f, lf = elbowY;
        legPts[s][0] = {x, H - D * 0.45f, zS};
        legPts[s][1] = {x, elbowY, zS - lf * 0.16f};
        legPts[s][2] = {x, elbowY * (hoofed ? 0.42f : 0.26f), zS - lf * 0.12f};
        legPts[s][3] = {x, pawR * (hoofed ? 0.9f : 0.55f), zS - lf * 0.08f};
        float xh = s == 0 ? xH : -xH;
        float hipY = rumpTop - Dr * 0.42f;
        float zH = -L * 0.36f;
        legPts[2 + s][0] = {xh, hipY, zH};
        legPts[2 + s][1] = {xh, hipY * 0.55f, zH + hipY * 0.2f};
        legPts[2 + s][2] = {xh, hipY * (hoofed ? 0.32f : 0.24f), zH - hipY * 0.14f};
        legPts[2 + s][3] = {xh, pawR * (hoofed ? 0.9f : 0.55f), zH - hipY * 0.1f};
        if (hopper) {
            // Rabbits and hares rest with the hind legs folded: knee forward, heel on the ground
            // behind, long foot flat under the haunch.
            float hy = rumpTop * 0.52f;
            legPts[2 + s][0] = {xh, hy, -L * 0.3f};
            legPts[2 + s][1] = {xh * 1.05f, hy * 0.4f, -L * 0.12f};
            legPts[2 + s][2] = {xh, pawR * 1.1f, -L * 0.42f};
            legPts[2 + s][3] = {xh, pawR * 0.5f, -L * 0.4f};
        }
        if (primate) {
            // Knuckle-walking: long straight arms, bent legs, flat feet
            legPts[s][0] = {x * 1.25f, H - D * 0.3f, L * 0.42f};
            legPts[s][1] = {x * 1.3f, H * 0.52f, L * 0.36f};
            legPts[s][2] = {x * 1.3f, H * 0.14f, L * 0.42f};
            legPts[s][3] = {x * 1.3f, pawR * 0.7f, L * 0.46f};
            float hy = rumpTop - Dr * 0.45f;
            legPts[2 + s][0] = {xh, hy, -L * 0.4f};
            legPts[2 + s][1] = {xh * 1.2f, hy * 0.55f, -L * 0.12f};
            legPts[2 + s][2] = {xh * 1.1f, hy * 0.18f, -L * 0.36f};
            legPts[2 + s][3] = {xh * 1.1f, pawR * 0.5f, -L * 0.34f};
        }
    }
    const char* legNames[4] = {"FL", "FR", "HL", "HR"};
    const char* seg[4] = {"upper", "mid", "lower", "foot"};
    for (int l = 0; l < 4; ++l) {
        int parent = l < 2 ? rig.chest : rig.pelvis;
        for (int j = 0; j < 4; ++j) {
            rig.leg[l][j] = rig.add(std::string(legNames[l]) + seg[j], parent, legPts[l][j]);
            parent = rig.leg[l][j];
        }
    }
    rig.shoulderH = H;
    rig.hipH = rumpTop;
    rig.bodyLen = L;
    rig.legLen = elbowY;
    rig.headLen = HL;
    rig.scale = sc;

    // ---- Torso loft: rump -> waist -> chest -> shoulders ----
    const std::vector<int> body{rig.pelvis, rig.spine, rig.chest, rig.neck1, rig.neck2, rig.head};
    float hump = (S.extras & X_HUMP) ? D * 0.22f : 0.0f;
    float pad = furPad;
    // Silhouette defined as (z, top line, bottom line, half width) from buttock to shoulders:
    // rounded rump with thigh mass, dipping loin, tucked-up belly, deep chest and brisket.
    std::vector<Key> torso;
    {
        struct Prof { float z, top, bot, w, bone; };
        float loinTop = lerpf(rumpTop, H, 0.5f) - D * 0.03f;
        float bellyBot = lerpf(H - D, rumpTop - Dr * 0.55f, 0.35f) + D * 0.45f * tuck;
        float hipMass = hoofed ? 1.05f : 1.0f;
        const Prof pr[] = {
            {-L * 0.54f, rumpTop * 0.94f - Dr * 0.08f, rumpTop - Dr * 0.55f, W * 0.5f, 0.0f},        // buttocks
            {-L * 0.42f, rumpTop * 1.0f, rumpTop - Dr * 0.98f * hipMass, W * 0.92f, 0.1f},          // hips + thighs
            {-L * 0.22f, rumpTop * 0.99f, rumpTop - Dr * 0.8f + D * 0.2f * tuck, W * 0.86f, 0.45f},  // flank
            {-L * 0.02f, loinTop, bellyBot, W * (0.86f - 0.08f * tuck), 1.0f},                        // loin / waist
            {L * 0.18f, H * 0.995f + hump * 0.4f, H - D * 0.97f, W * 0.98f, 1.6f},                    // ribs
            {L * 0.34f, H + hump, H - D * 1.02f, W, 2.0f},                                             // chest behind elbows
            {L * 0.47f, H - D * 0.08f + hump * 0.6f, H - D * 0.9f, W * 0.82f, 2.3f},                  // shoulders / brisket
        };
        std::vector<Prof> prof(std::begin(pr), std::end(pr));
        if (hopper) {
            float g = H * 0.06f;   // haunches almost touch the ground
            prof = {{-L * 0.52f, rumpTop * 0.82f, g * 2.5f, W * 0.7f, 0.0f},
                    {-L * 0.36f, rumpTop, g, W * 1.08f, 0.1f},
                    {-L * 0.15f, rumpTop * 0.98f, g * 1.4f, W * 1.0f, 0.45f},
                    {L * 0.08f, lerpf(rumpTop, H, 0.6f), H - D * 0.95f, W * 0.9f, 1.0f},
                    {L * 0.3f, H * 0.98f, H - D * 1.0f, W * 0.82f, 1.8f},
                    {L * 0.46f, H * 0.9f, H - D * 0.85f, W * 0.65f, 2.3f}};
        }
        if (primate) {
            prof = {{-L * 0.5f, rumpTop * 0.95f, rumpTop - Dr * 0.75f, W * 0.62f, 0.0f},
                    {-L * 0.38f, rumpTop, rumpTop - Dr * 0.95f, W * 0.8f, 0.1f},
                    {-L * 0.12f, lerpf(rumpTop, H, 0.4f), lerpf(rumpTop, H, 0.4f) - D * 0.95f, W * 0.8f, 0.6f},
                    {L * 0.15f, lerpf(rumpTop, H, 0.75f), lerpf(rumpTop, H, 0.75f) - D * 1.05f, W * 0.95f, 1.4f},
                    {L * 0.36f, H, H - D * 1.05f, W * 1.08f, 2.0f},
                    {L * 0.48f, H - D * 0.05f, H - D * 0.8f, W * 1.0f, 2.3f}};
        }
        for (const Prof& q : prof)
            torso.push_back({{0, (q.top + q.bot) * 0.5f, q.z}, q.w + pad, (q.top - q.bot) * 0.5f + pad, q.bone, 0.5f, fur, REG_BODY});
    }
    {
        LoftOpts o;
        o.segs = 28;
        o.ringsPerKey = 4;
        o.capStartScale = 1.0f;
        o.capEndScale = 0.6f;
        // Flatter back and flanks, rounder belly: a superellipse-ish cross-section
        o.radial = [](float a, float) {
            float c = std::fabs(std::cos(a)), sn = std::sin(a);
            return 1.0f + 0.07f * c * (1.0f - c) * 4.0f * (sn > 0 ? 1.0f : 0.6f);
        };
        loft(b, torso, body, o);
    }
    float bodyFur = fur;
    // ---- Neck loft: from inside the chest up into the skull ----
    // a neck is never much thicker than the skull it carries (long necks get depth instead)
    float rN = std::min(W * S.neckThick, HL * S.headWidth * 0.5f * (hoofed ? 1.6f : 1.2f)) + pad;
    bool maneCrest = (S.extras & X_MANE) != 0;
    bool lionMane = (S.extras & X_LION_MANE) && male && age > 0.6f;
    bool ruff = (S.extras & X_RUFF) != 0;
    {
        std::vector<Key> neck;
        neck.push_back({NB - dn * (D * 0.15f), std::min(W * 0.72f, rN * 1.3f) + pad, std::min(D * 0.36f, rN * 1.4f) + pad, 2.3f, 0.5f, bodyFur, REG_BODY});
        // long necks (horses, deer, camelids) are deep and narrow
        float deepN = 1.0f + std::max(0.0f, S.neckLen - 0.35f) * 1.6f;
        neck.push_back({NB + dn * (NL * 0.35f), rN * (deepN > 1.0f ? 0.85f : 1.0f), rN * 1.15f * deepN, 3.0f, 0.5f, bodyFur * (ruff ? 1.8f : 1.0f), REG_BODY});
        neck.push_back({NE, rN * 0.75f, rN * (deepN > 1.0f ? 0.85f : 1.0f), 4.0f, 0.5f, bodyFur, REG_BODY});
        neck.push_back({HB + dh * (SL * 0.25f), rN * 0.8f, rN * 0.85f, 5.0f, 0.5f, bodyFur, REG_BODY});
        LoftOpts o;
        o.segs = 20;
        o.ringsPerKey = 4;
        float maneFur = lionMane ? 0.14f * sc : (maneCrest ? std::max(0.05f * sc, fur * 3.0f) : 0.0f);
        o.modify = [maneCrest, lionMane, maneFur](SkinVertex& v, float t, float a) {
            float s = std::sin(a);
            if (maneCrest && s > 0.55f && t > 0.15f) { v.uv.x = float(REG_MANE); v.mat.z = maneFur; }
            if (lionMane) { v.uv.x = float(REG_MANE); v.mat.z = maneFur * (0.6f + 0.4f * t); }
        };
        if (lionMane) { for (auto& k : neck) { k.rx *= 1.45f; k.ry *= 1.35f; } }
        loft(b, neck, body, o);
    }
    // ---- Head loft: occiput -> skull -> stop -> muzzle -> nose ----
    {
        float sw = S.snoutWidth;
        float stop = S.stop;
        float headFur = fur * 0.35f;
        std::vector<Key> head;
        head.push_back({HB - dh * (hw * 0.25f) + upH * (hw * 0.05f), hw * 0.72f, hw * 0.72f, 0, 0.0f, headFur, REG_HEAD});
        head.push_back({HB + dh * (SL * 0.42f) + upH * (hw * 0.05f), hw, hw * 0.92f, 0, 0.25f, headFur, REG_HEAD});
        head.push_back({HB + dh * (SL * 0.88f) - upH * (hw * 0.12f * stop), hw * (0.78f + 0.12f * sw), hw * (0.84f - 0.3f * stop), 0, 0.5f, headFur, REG_HEAD});
        head.push_back({HB + dh * (SL + ML * 0.45f) - upH * (hw * (0.18f + 0.22f * stop)), hw * sw * 0.85f, hw * (0.6f + 0.1f * (1 - stop)), 0, 0.75f, headFur * 0.6f, REG_HEAD});
        head.push_back({HB + dh * (SL + ML * 0.95f) - upH * (hw * (0.22f + 0.24f * stop)), hw * sw * 0.72f, hw * (0.5f + 0.06f * (1 - stop)), 0, 1.0f, headFur * 0.4f, REG_HEAD});
        if (S.nose == Nose::Horse || S.nose == Nose::Cow) {   // broad, blunt muzzle
            head[3].ry *= 1.35f; head[4].ry *= 1.55f; head[4].rx *= 1.2f;
        }
        if (S.extras & X_JOWLS) {
            head[3].rx *= 1.12f; head[3].ry *= 1.15f;
            head[4].rx *= 1.1f; head[4].ry *= 1.12f;
        }
        if (lionMane) { head[0].rx *= 1.9f; head[0].ry *= 1.8f; head[0].fur = 0.12f * sc; head[0].region = REG_MANE; }
        LoftOpts o;
        o.segs = 22;
        o.ringsPerKey = 4;
        o.capStartScale = 0.9f;
        o.capEndScale = S.nose == Nose::Pig ? 0.15f : 0.55f;
        const vec3 faceSkin{0.3f, 0.22f, 0.18f};
        if (primate) {
            // Bare face below the brow; hair on the crown and back of the head
            o.modify = [faceSkin](SkinVertex& v, float t, float a) {
                float up = std::sin(a);
                if ((t > 0.42f && up < 0.5f) || t > 0.72f) {
                    v.uv.x = float(REG_FIXED); v.mat.w = float(PAT_PLAIN); v.mat.z = 0.0f; v.mat.x = 0.6f;
                    v.color = vec4(faceSkin, v.color.w);
                }
            };
        }
        loft(b, head, {rig.head}, o);
        if (primate)   // heavy brow ridge
            tube(b, {HB + dh * (SL * 0.62f) + upH * (hw * 0.55f) + vec3(hw * 0.7f, 0, 0),
                     HB + dh * (SL * 0.72f) + upH * (hw * 0.62f),
                     HB + dh * (SL * 0.62f) + upH * (hw * 0.55f) - vec3(hw * 0.7f, 0, 0)},
                 hw * 0.16f, hw * 0.16f, rig.head, faceSkin, 0.6f, 10);

        // Lower jaw (mouth inside is pink, visible when the mouth opens)
        std::vector<Key> jaw;
        float jy = hw * (0.25f + 0.2f * stop);
        jaw.push_back({HB + dh * (SL * 0.55f) - upH * (hw * 0.45f), hw * 0.55f, hw * 0.25f, 0, 0.6f, headFur, REG_HEAD});
        jaw.push_back({HB + dh * (SL + ML * 0.45f) - upH * (jy + hw * 0.22f), hw * sw * 0.66f, hw * 0.2f, 0, 0.8f, headFur, REG_HEAD});
        jaw.push_back({HB + dh * (SL + ML * 0.9f) - upH * (jy + hw * 0.2f), hw * sw * 0.5f, hw * 0.15f, 0, 1.0f, headFur, REG_HEAD});
        LoftOpts oj;
        oj.segs = 16;
        oj.ringsPerKey = 3;
        oj.modify = [](SkinVertex& v, float, float a) {
            if (std::sin(a) > 0.8f) { v.uv.x = float(REG_FIXED); v.mat.w = float(PAT_PLAIN); v.mat.z = 0; v.color = vec4(kMouth, 0.5f); }
        };
        for (auto& k : jaw) { k.rx *= 0.9f; k.c -= upH * (hw * 0.04f); }   // tucks inside the upper lip when closed
        loft(b, jaw, {rig.jaw}, oj);
        // Tongue
        vec3 tp = HB + dh * (SL + ML * 0.35f) - upH * (jy + hw * 0.1f);
        std::vector<Key> tongue;
        tongue.push_back({tp - dh * (ML * 0.3f), hw * sw * 0.35f, hw * 0.05f, 0, 0, 0, REG_FIXED});
        tongue.push_back({tp + dh * (ML * 0.45f), hw * sw * 0.3f, hw * 0.04f, 1, 0, 0, REG_FIXED});
        LoftOpts ot;
        ot.coat = false;
        ot.color = kTongue;
        ot.rough = 0.35f;
        ot.segs = 10;
        ot.ringsPerKey = 3;
        loft(b, tongue, {rig.jaw, rig.tongue}, ot);

        // Nose
        vec3 tip = HB + dh * (SL + ML) - upH * (hw * (0.22f + 0.24f * stop));
        float nr = hw * sw * 0.36f;
        mat4 no = alignY(dh);
        switch (S.nose) {
        case Nose::Dog: case Nose::Bear:
            blob(b, tip - dh * (nr * 0.35f) + upH * (nr * 0.35f), vec3(nr * 1.05f, nr * 0.6f, nr * 0.75f), rig.head, S.noseColor, 0.25f, 14, 8, &no);
            break;
        case Nose::Cat: case Nose::Rabbit: case Nose::Rodent:
            blob(b, tip - dh * (nr * 0.3f) + upH * (nr * 0.55f), vec3(nr * 0.55f, nr * 0.35f, nr * 0.4f), rig.head, S.noseColor, 0.3f, 10, 6, &no);
            break;
        case Nose::Pig: {
            float pr = hw * sw * 0.62f;
            blob(b, tip, vec3(pr, nr * 0.25f, pr * 0.8f), rig.head, S.noseColor, 0.45f, 16, 6, &no);
            for (float sx : {-1.0f, 1.0f})
                blob(b, tip + dh * (nr * 0.2f) + vec3(sx * pr * 0.35f, 0, 0), vec3(pr * 0.16f, nr * 0.12f, pr * 0.22f), rig.head, vec3(0.1f, 0.05f, 0.05f), 0.6f, 8, 4, &no);
            break;
        }
        case Nose::Horse: case Nose::Cow:
            for (float sx : {-1.0f, 1.0f})
                blob(b, tip - dh * (nr * 0.2f) + upH * (nr * 0.2f) + vec3(sx * hw * sw * 0.4f, 0, 0), vec3(nr * 0.35f, nr * 0.2f, nr * 0.55f), rig.head,
                     S.nose == Nose::Cow ? S.noseColor : vec3(0.05f, 0.04f, 0.04f), 0.4f, 10, 6, &no);
            if (S.nose == Nose::Cow) blob(b, tip - dh * (nr * 0.4f), vec3(hw * sw * 0.7f, nr * 0.35f, nr * 0.9f), rig.head, S.noseColor, 0.35f, 14, 6, &no);
            break;
        case Nose::Primate:
            blob(b, tip - dh * (nr * 0.5f) + upH * (nr * 0.2f), vec3(nr * 0.7f, nr * 0.4f, nr * 0.45f), rig.head, S.noseColor, 0.4f, 10, 6, &no);
            break;
        default: break;
        }

        // Eyes
        bool predator = S.pupil == Pupil::Slit || S.nose == Nose::Cat || S.nose == Nose::Dog || S.nose == Nose::Bear || S.nose == Nose::Primate;
        float eyeFwd = predator ? 0.55f : (S.nose == Nose::Rabbit || S.nose == Nose::Horse || S.nose == Nose::Cow || S.nose == Nose::Rodent ? 0.15f : 0.35f);
        float er = S.eyeSize * hw * (1.0f + 0.35f * youth);
        // Eyes sit on the skull surface: find the head cross-section where the eye is
        float eyeZ = SL * (0.7f + 0.1f * eyeFwd);
        float et = clampf((eyeZ - SL * 0.42f) / (SL * 0.46f), 0.0f, 1.0f);
        float hrx = lerpf(hw, hw * (0.78f + 0.12f * sw), et);
        float hry = lerpf(hw * 0.92f, hw * (0.84f - 0.3f * stop), et);
        float hcy = lerpf(hw * 0.05f, -hw * 0.12f * stop, et);
        float el = radians(28.0f);
        float az = radians(90.0f * (1.0f - eyeFwd * 0.75f));    // 90 = straight out the side
        for (float sx : {1.0f, -1.0f}) {
            vec3 outDir = normalize(vec3(sx * std::sin(az) * std::cos(el), 0, 0) + upH * std::sin(el) + dh * (std::cos(az) * std::cos(el)));
            vec3 ec = HB + dh * eyeZ + upH * (hcy + hry * std::sin(el)) + vec3(sx * hrx * std::cos(el) * std::sin(az), 0, 0) +
                      dh * (hrx * std::cos(el) * std::cos(az) * 0.5f);
            vec3 look = normalize(outDir + dh * 0.25f);
            ec -= outDir * (er * 0.35f);
            eye(b, ec, er, look, rig.head, ind.male ? S.eyeColor : S.eyeColor * 1.05f, S.pupil, S.nose == Nose::Primate);
        }

        // Ears
        float earLen = S.earSize * HL * (1.0f + 0.25f * youth);
        size_t ear0 = b.verts.size();
        buildEar(b, S.ear, earBaseL, earLen, hw, 1.0f, dh, upH, rig.earL, rig.head, fur, youth);
        buildEar(b, S.ear, earBaseR, earLen, hw, -1.0f, dh, upH, rig.earR, rig.head, fur, youth);
        if (primate)   // bare, skin-colored ears
            for (size_t vi = ear0; vi < b.verts.size(); ++vi) {
                SkinVertex& v = b.verts[vi];
                v.uv.x = float(REG_FIXED); v.mat.w = float(PAT_PLAIN); v.mat.z = 0.0f; v.color = vec4(faceSkin * 1.1f, v.color.w);
            }

        // Horns / antlers (males only for most deer; both sexes for goats, cattle...)
        bool hasHorns = S.horns != Horns::None && (!S.hornsMaleOnly || male) && age > 0.35f;
        if (hasHorns) {
            float hs = S.hornSize * HL * (0.4f + 0.6f * age) * (male ? 1.0f : 0.6f);
            for (float sx : {1.0f, -1.0f}) {
                vec3 base = HB + dh * (SL * 0.3f) + upH * (hw * 0.85f) + vec3(sx * hw * 0.38f, 0, 0);
                Rng hr(ind.seed * 7u + (sx > 0 ? 1u : 2u));
                buildHorns(b, S.horns, base, hs, sx, dh, upH, rig.head, hr);
            }
        }
        if (S.extras & X_TUSKS) {
            float ts = HL * (male ? 0.22f : 0.12f) * age;
            for (float sx : {1.0f, -1.0f}) {
                vec3 tb = HB + dh * (SL + ML * 0.75f) - upH * (hw * 0.35f) + vec3(sx * hw * sw * 0.55f, 0, 0);
                tube(b, {tb, tb + upH * ts * 0.6f + vec3(sx * ts * 0.25f, 0, 0), tb + upH * ts - dh * ts * 0.2f}, ts * 0.12f, ts * 0.03f,
                     rig.head, kIvory, 0.35f, 6);
            }
        }
        if (S.extras & X_BEARD) {
            vec3 cb = HB + dh * (SL + ML * 0.6f) - upH * (hw * 0.75f);
            tube(b, {cb + dh * HL * 0.05f, cb - upH * HL * 0.14f + dh * HL * 0.04f}, hw * 0.3f, hw * 0.12f, rig.jaw, vec3(1), 0.9f, 10, true, REG_MANE, fur * 2.0f);
        }
    }

    // ---- Legs ----
    for (int l = 0; l < 4; ++l) {
        bool front = l < 2;
        const vec3* P = legPts[l];
        float top = W * S.legThick * (front ? 1.2f : 1.75f) * std::sqrt(wf) + pad * 0.6f;
        float mid = W * S.legThick * (front ? 0.64f : 0.8f) + pad * 0.3f;
        float low = lowerR;
        std::vector<Key> keys;
        vec3 inside = P[0] + vec3(0, D * 0.12f, 0) - vec3(P[0].x * 0.35f, 0, 0);
        // Thighs and upper arms are flattened side-to-side and deep front-to-back
        float deep = front ? 1.35f : 1.6f;
        keys.push_back({inside, top * 0.75f, top * deep, 0.4f, 1.0f, fur, REG_LEG});
        keys.push_back({P[0], top * 0.8f, top * deep, 1.0f, 0.95f, fur, REG_LEG});
        keys.push_back({(P[0] + P[1]) * 0.5f, (top + mid) * 0.42f, (top + mid) * 0.5f * (front ? 1.1f : 1.3f), 1.4f, 0.8f, fur * 0.8f, REG_LEG});
        keys.push_back({P[1], mid, mid * 1.05f, 2.0f, 0.62f, fur * 0.6f, REG_LEG});
        keys.push_back({(P[1] + P[2]) * 0.5f, (mid + low) * 0.5f, (mid + low) * 0.5f, 2.5f, 0.45f, fur * 0.45f, REG_LEG});
        keys.push_back({P[2], low, low * 1.05f, 3.0f, 0.28f, fur * 0.35f, REG_LEG});
        keys.push_back({P[3] + vec3(0, pawR * 0.4f, 0), low * 1.05f, low * 1.1f, 3.8f, 0.08f, fur * 0.3f, REG_LEG});
        LoftOpts o;
        o.segs = 14;
        o.ringsPerKey = 3;
        o.capStartScale = 0.8f;
        o.capEndScale = 0.4f;
        o.side = {1, 0, 0};
        loft(b, keys, {front ? rig.chest : rig.pelvis, rig.leg[l][0], rig.leg[l][1], rig.leg[l][2], rig.leg[l][3]}, o);

        // Feet
        vec3 fp = P[3];
        int fb = rig.leg[l][3];
        if (hoofed) {
            float hr = pawR * 1.05f;
            if (S.foot == Foot::Cloven) {
                for (float sx : {-1.0f, 1.0f}) {
                    std::vector<Key> hk;
                    vec3 c = fp + vec3(sx * hr * 0.45f, 0, hr * 0.15f);
                    hk.push_back({c + vec3(0, hr * 0.9f, 0), hr * 0.5f, hr * 0.62f, 0, 0, 0, REG_FIXED});
                    hk.push_back({c - vec3(0, hr * 0.85f, -hr * 0.2f), hr * 0.62f, hr * 0.85f, 0, 0, 0, REG_FIXED});
                    LoftOpts oh; oh.coat = false; oh.color = kHoof; oh.rough = 0.45f; oh.segs = 12; oh.ringsPerKey = 3; oh.capEndScale = 0.2f;
                    loft(b, hk, {fb}, oh);
                }
            } else {
                std::vector<Key> hk;
                hk.push_back({fp + vec3(0, hr * 0.9f, 0), hr * 0.95f, hr * 0.95f, 0, 0, 0, REG_FIXED});
                hk.push_back({fp - vec3(0, hr * 0.85f, -hr * 0.15f), hr * 1.15f, hr * 1.25f, 0, 0, 0, REG_FIXED});
                LoftOpts oh; oh.coat = false; oh.color = kHoof; oh.rough = 0.45f; oh.segs = 14; oh.ringsPerKey = 3; oh.capEndScale = 0.2f;
                loft(b, hk, {fb}, oh);
            }
        } else {
            float pr = pawR;
            float len = pr * (S.foot == Foot::Hand ? 2.0f : 1.45f);
            if (!front && (S.nose == Nose::Rabbit || S.nose == Nose::Rodent)) len *= 1.9f;   // long hind feet
            std::vector<Key> pk;
            pk.push_back({fp + vec3(0, pr * 0.1f, -pr * 0.35f), pr * 0.85f, pr * 0.55f, 0, 0.02f, fur * 0.3f, REG_LEG});
            pk.push_back({fp + vec3(0, 0, len * 0.35f), pr * 1.0f, pr * 0.52f, 0, 0.0f, fur * 0.3f, REG_LEG});
            pk.push_back({fp + vec3(0, -pr * 0.1f, len * 0.75f), pr * 0.85f, pr * 0.38f, 0, 0.0f, fur * 0.3f, REG_LEG});
            LoftOpts op; op.segs = 14; op.ringsPerKey = 3; op.capEndScale = 0.6f; op.capStartScale = 0.7f;
            loft(b, pk, {fb}, op);
            // Toes + claws
            int toes = S.foot == Foot::Hand ? 5 : 4;
            for (int t = 0; t < toes; ++t) {
                float u = (float(t) + 0.5f) / float(toes) * 2.0f - 1.0f;
                vec3 tc = fp + vec3(u * pr * 0.7f, -pr * 0.12f, len * 0.78f + pr * 0.1f * (1.0f - std::fabs(u)));
                if (S.foot == Foot::Claw || S.foot == Foot::Hand || S.foot == Foot::Paw) {
                    float cl = pr * (S.foot == Foot::Claw ? 0.7f : 0.28f);
                    if (S.nose != Nose::Cat)
                        tube(b, {tc + vec3(0, pr * 0.05f, 0), tc + vec3(0, -pr * 0.12f, cl)}, pr * 0.1f, pr * 0.02f, fb, kClaw, 0.4f, 6);
                }
            }
        }
    }

    // ---- Tail ----
    if (S.tail != Tail::None && rig.tailCount > 0) {
        float tr = std::max(W * S.tailThick, 0.004f);
        float tailFur = fur;
        std::vector<Key> keys;
        for (size_t i = 0; i < tailPts.size(); ++i) {
            float t = float(i) / float(tailPts.size() - 1);
            float r;
            switch (S.tail) {
            case Tail::Bushy: r = tr * (1.0f + 0.6f * std::sin(t * kPi * 0.8f)) * (1.0f - 0.5f * t * t); tailFur = fur * 2.2f; break;
            case Tail::Puff: r = tr * 1.6f * std::sin(std::max(t, 0.15f) * kPi); break;
            case Tail::Flat: r = tr * (0.6f + 0.8f * std::sin(t * kPi * 0.85f)); break;
            case Tail::Stub: r = tr * (1.0f - 0.4f * t); break;
            case Tail::HorseHair: r = tr * (1.0f - 0.5f * t) + 0.02f * sc * std::sin(t * kPi); tailFur = std::max(fur * 3.0f, 0.06f * sc); break;
            default: r = tr * (1.0f - 0.82f * t); break;
            }
            Key k;
            k.c = tailPts[i];
            k.rx = std::max(r, tr * 0.12f) + pad * 0.5f * (S.tail == Tail::Bushy ? 1.5f : 0.5f);
            k.ry = S.tail == Tail::Flat ? k.rx * 0.25f : k.rx;
            k.bone = float(i) * float(rig.tailCount) / float(tailPts.size() - 1);
            k.sub = t;
            k.fur = tailFur;
            k.region = REG_TAIL;
            keys.push_back(k);
        }
        if (S.tail == Tail::Stub || S.tail == Tail::Puff) keys.resize(std::min<size_t>(keys.size(), 3));
        std::vector<int> chain{rig.pelvis};
        for (int i = 0; i < rig.tailCount; ++i) chain.push_back(rig.tail[i]);
        for (auto& k : keys) k.bone = std::min(k.bone + 0.0f, float(rig.tailCount));
        LoftOpts o;
        o.segs = 12;
        o.ringsPerKey = 3;
        o.capStartScale = 0.6f;
        o.capEndScale = S.tail == Tail::Puff ? 1.0f : 0.8f;
        o.side = {1, 0, 0};
        loft(b, keys, chain, o);
        if (S.tail == Tail::Tufted) {
            vec3 end = tailPts.back();
            blob(b, end, vec3(tr * 1.4f), rig.tail[rig.tailCount - 1], vec3(0.08f, 0.06f, 0.05f), 0.9f, 10, 6);
        }
    }
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------
void buildBird(const Species& sp, const AnimalIndividual& ind, AnimalBuild& out, Rng& rng, float sc, float youth) {
    const AnimalShape& S = sp.shape;
    AnimalRig& rig = out.rig;
    SkinBuilder& b = out.mesh;
    (void)rng;
    const float H = S.height * sc;
    const float L = S.length * sc;
    const float R = L * S.girth * (1.0f + 0.2f * youth);
    const float tilt = radians(S.neckAngle);            // body tilt (0 horizontal .. 70 upright)
    const float legLen = H * S.legRatio;
    vec3 fwd{0, std::sin(tilt), std::cos(tilt)};         // body axis (tail -> breast)
    vec3 bup{0, std::cos(tilt), -std::sin(tilt)};
    vec3 C{0, legLen + R * 0.8f, 0};
    rig.root = rig.add("root", -1, {0, 0, 0});
    rig.pelvis = rig.add("pelvis", rig.root, C - fwd * (L * 0.2f));
    rig.spine = rig.add("body", rig.pelvis, C);
    rig.chest = rig.add("chest", rig.spine, C + fwd * (L * 0.25f));
    float NL = S.neckLen * L;
    vec3 NB = C + fwd * (L * 0.4f) + bup * (R * 0.35f);
    vec3 NE = NB + normalize(vec3(0, 1, 0.25f)) * NL;
    rig.neck1 = rig.add("neck1", rig.chest, NB);
    rig.neck2 = rig.add("neck2", rig.neck1, NB + (NE - NB) * 0.5f);
    float HR = S.headLen * L * 0.25f * (1.0f + 0.3f * youth);
    vec3 HC = NE + vec3(0, HR * 0.4f, HR * 0.3f);
    rig.head = rig.add("head", rig.neck2, NE);
    float BL = S.snoutLen * HR * 2.0f;
    vec3 beakBase = HC + vec3(0, -HR * 0.1f, HR * 0.8f);
    rig.jaw = rig.add("jaw", rig.head, beakBase - vec3(0, HR * 0.2f, 0));
    // wings
    for (int s = 0; s < 2; ++s) {
        float sx = s == 0 ? 1.0f : -1.0f;
        vec3 sh = C + fwd * (L * 0.28f) + bup * (R * 0.45f) + vec3(sx * R * 0.85f, 0, 0);
        rig.wing[s][0] = rig.add(s ? "wingR1" : "wingL1", rig.chest, sh);
        rig.wing[s][1] = rig.add(s ? "wingR2" : "wingL2", rig.wing[s][0], sh - fwd * (L * S.wingLen * 0.35f));
        rig.wing[s][2] = rig.add(s ? "wingR3" : "wingL3", rig.wing[s][1], sh - fwd * (L * S.wingLen * 0.65f));
    }
    // legs: thigh (in body), shank, foot
    for (int s = 0; s < 2; ++s) {
        float sx = s == 0 ? 1.0f : -1.0f;
        vec3 hip = C - fwd * (L * 0.05f) + vec3(sx * R * 0.45f, -R * 0.4f, 0);
        vec3 knee = vec3(sx * R * 0.45f, legLen * 0.95f, C.z - L * 0.02f);
        vec3 ankle = vec3(sx * R * 0.5f, legLen * 0.45f, C.z - L * 0.06f);
        vec3 foot = vec3(sx * R * 0.5f, 0.004f * sc, C.z);
        rig.leg[2 + s][0] = rig.add(s ? "HRupper" : "HLupper", rig.pelvis, hip);
        rig.leg[2 + s][1] = rig.add(s ? "HRmid" : "HLmid", rig.leg[2 + s][0], knee);
        rig.leg[2 + s][2] = rig.add(s ? "HRlower" : "HLlower", rig.leg[2 + s][1], ankle);
        rig.leg[2 + s][3] = rig.add(s ? "HRfoot" : "HLfoot", rig.leg[2 + s][2], foot);
    }
    rig.legCount = 2;
    vec3 TB = C - fwd * (L * 0.48f);
    rig.tail[0] = rig.add("tail0", rig.pelvis, TB);
    rig.tail[1] = rig.add("tail1", rig.tail[0], TB - fwd * (L * S.tailLen * 0.5f));
    rig.tailCount = 2;
    rig.shoulderH = C.y + R;
    rig.hipH = C.y;
    rig.bodyLen = L;
    rig.legLen = legLen;
    rig.headLen = HR * 2.0f;
    rig.scale = sc;
    rig.plan = BodyPlan::Bird;
    const float fur = S.fur;

    // Body (egg) + neck + head
    float neckR = std::min(R * 0.42f, HR * 0.85f);
    std::vector<Key> body;
    body.push_back({C - fwd * (L * 0.48f), R * 0.35f, R * 0.3f, 0.0f, 0.5f, fur, REG_BODY});
    body.push_back({C - fwd * (L * 0.25f), R * 0.85f, R * 0.8f, 0.5f, 0.5f, fur, REG_BODY});
    body.push_back({C + fwd * (L * 0.05f), R, R, 1.0f, 0.5f, fur, REG_BODY});
    body.push_back({C + fwd * (L * 0.3f), R * 0.9f, R * 0.95f, 2.0f, 0.5f, fur, REG_BODY});
    body.push_back({NB, std::max(R * 0.55f, neckR * 1.2f), std::max(R * 0.58f, neckR * 1.2f), 2.5f, 0.5f, fur, REG_BODY});
    body.push_back({NB + (NE - NB) * 0.5f, neckR, neckR * 1.05f, 3.2f, 0.5f, fur, REG_BODY});
    body.push_back({NE, HR * 0.78f, HR * 0.8f, 4.0f, 0.5f, fur, REG_HEAD});
    body.push_back({HC, HR, HR * 0.95f, 5.0f, 0.5f, fur, REG_HEAD});
    body.push_back({HC + vec3(0, 0, HR * 0.6f), HR * 0.78f, HR * 0.75f, 5.0f, 0.8f, fur, REG_HEAD});
    LoftOpts o;
    o.segs = 20;
    o.ringsPerKey = 4;
    o.capStartScale = 1.0f;
    o.capEndScale = 0.8f;
    loft(b, body, {rig.pelvis, rig.spine, rig.chest, rig.neck1, rig.neck2, rig.head}, o);

    // Beak
    vec3 beakCol = S.noseColor;
    {
        float bw = HR * 0.32f;
        std::vector<vec3> up{beakBase};
        switch (S.beak) {
        case Beak::Hook: case Beak::Raptor:
            up = {beakBase, beakBase + vec3(0, bw * 0.3f, BL * 0.5f), beakBase + vec3(0, -bw * 0.1f, BL * 0.95f), beakBase + vec3(0, -bw * 0.9f, BL * 1.0f)};
            break;
        case Beak::Duck:
            up = {beakBase, beakBase + vec3(0, -bw * 0.2f, BL * 0.6f), beakBase + vec3(0, -bw * 0.25f, BL)};
            break;
        default:
            up = {beakBase, beakBase + vec3(0, -bw * 0.15f, BL * 0.6f), beakBase + vec3(0, -bw * 0.35f, BL)};
            break;
        }
        std::vector<Key> bk;
        for (size_t i = 0; i < up.size(); ++i) {
            float t = float(i) / float(up.size() - 1);
            Key k;
            k.c = up[i];
            k.rx = bw * (S.beak == Beak::Duck ? 1.2f - 0.2f * t : (1.0f - 0.8f * t));
            k.ry = bw * (S.beak == Beak::Duck ? 0.35f : (0.8f - 0.6f * t));
            k.bone = 0;
            k.region = REG_FIXED;
            bk.push_back(k);
        }
        LoftOpts ob;
        ob.coat = false;
        ob.color = beakCol;
        ob.rough = 0.4f;
        ob.segs = 12;
        ob.ringsPerKey = 3;
        ob.capEndScale = 0.3f;
        loft(b, bk, {rig.head}, ob);
        // lower mandible
        tube(b, {beakBase - vec3(0, bw * 0.45f, 0), beakBase - vec3(0, bw * 0.55f, BL * -0.7f)}, bw * 0.6f, bw * 0.15f, rig.jaw, beakCol * 0.85f, 0.45f, 10);
    }
    // Eyes
    bool forwardEyes = S.beak == Beak::Raptor && S.ear == Ear::Tufted;   // owls
    float er = HR * S.eyeSize * (forwardEyes ? 2.0f : 1.2f);
    for (float sx : {1.0f, -1.0f}) {
        vec3 look = forwardEyes ? normalize(vec3(sx * 0.25f, 0.05f, 1.0f)) : normalize(vec3(sx, 0.1f, 0.35f));
        vec3 ec = HC + vec3(sx * HR * (forwardEyes ? 0.45f : 0.72f), HR * 0.2f, HR * (forwardEyes ? 0.62f : 0.35f));
        eye(b, ec, er, look, rig.head, S.eyeColor, Pupil::Round);
    }
    // Crest / comb / wattle / ear tufts / snood
    if (S.extras & X_CREST) {
        for (int i = 0; i < 5; ++i) {
            float a = float(i - 2) * 0.12f;
            vec3 base = HC + vec3(a * HR, HR * 0.85f, HR * 0.2f);
            tube(b, {base, base + vec3(a * HR, HR * 1.1f, -HR * 0.3f), base + vec3(a * HR * 1.5f, HR * 1.6f, -HR * 0.9f)}, HR * 0.08f, HR * 0.02f, rig.head,
                 vec3(1), 0.8f, 6, true, REG_MANE, 0.0f);
        }
    }
    if (S.extras & X_COMB) {
        float cs = ind.male ? 1.0f : 0.5f;
        for (int i = 0; i < 5; ++i) {
            vec3 cc = HC + vec3(0, HR * (0.95f + 0.25f * cs * std::sin(float(i) / 4.0f * kPi)), HR * (0.45f - float(i) * 0.25f));
            blob(b, cc, vec3(HR * 0.1f, HR * 0.28f * cs, HR * 0.16f), rig.head, vec3(0.8f, 0.08f, 0.06f), 0.45f, 8, 6);
        }
    }
    if (S.extras & X_WATTLE) {
        float ws = ind.male ? 1.0f : 0.5f;
        for (float sx : {-1.0f, 1.0f})
            blob(b, beakBase + vec3(sx * HR * 0.15f, -HR * 0.7f * ws, -HR * 0.05f), vec3(HR * 0.14f, HR * 0.3f * ws, HR * 0.12f), rig.jaw, vec3(0.8f, 0.08f, 0.06f), 0.45f, 8, 6);
    }
    if (S.extras & X_SNOOD)
        tube(b, {beakBase + vec3(0, HR * 0.2f, -HR * 0.1f), beakBase + vec3(HR * 0.1f, -HR * 0.6f, BL * 0.5f)}, HR * 0.1f, HR * 0.05f, rig.head,
             vec3(0.75f, 0.1f, 0.1f), 0.5f, 6);
    if (S.ear == Ear::Tufted)
        for (float sx : {1.0f, -1.0f}) {
            vec3 base = HC + vec3(sx * HR * 0.5f, HR * 0.75f, 0);
            tube(b, {base, base + vec3(sx * HR * 0.25f, HR * 0.7f, -HR * 0.1f)}, HR * 0.18f, HR * 0.03f, rig.head, vec3(1), 0.8f, 6, true, REG_HEAD, 0.0f);
        }

    // Wings folded against the body: a thin feathered blade following the body's side,
    // widest at the shoulder, primaries crossing over the rump toward the tail.
    for (int sd = 0; sd < 2; ++sd) {
        float sx = sd == 0 ? 1.0f : -1.0f;
        vec3 sh = out.rig.bones[size_t(rig.wing[sd][0])].bindPos;
        float wl = L * S.wingLen;
        std::vector<Key> wk;
        for (int i = 0; i <= 6; ++i) {
            float t = float(i) / 6.0f;
            // body radius at this point along the body (egg: fullest near the middle)
            float bodyR = R * (0.55f + 0.45f * std::sin(clampf(0.35f + t * 0.75f, 0.0f, 1.0f) * kPi)) * (t > 0.7f ? (1.0f - (t - 0.7f) * 1.6f) : 1.0f);
            Key k;
            k.c = sh - fwd * (wl * t) + bup * (R * (0.1f - 0.25f * t)) + vec3(sx * (std::max(bodyR, R * 0.2f) * 0.92f + R * 0.06f - sh.x * sx), 0, 0) * 1.0f;
            k.c.x = sx * (std::max(bodyR, R * 0.2f) * 0.9f + R * 0.07f);
            k.rx = R * (0.2f + 0.3f * std::sin(std::min(t * 1.8f + 0.15f, 1.0f) * kPi * 0.5f)) * (1.0f - 0.75f * t * t);
            k.ry = R * 0.045f;
            k.bone = t * 2.0f;
            k.sub = t;
            k.region = REG_WING;
            wk.push_back(k);
        }
        LoftOpts ow;
        ow.segs = 12;
        ow.ringsPerKey = 3;
        ow.side = bup;               // blade width runs dorsal-ventral
        ow.capEndScale = 3.0f;       // pointed primaries
        ow.capStartScale = 1.0f;
        loft(b, wk, {rig.wing[sd][0], rig.wing[sd][1], rig.wing[sd][2]}, ow);
    }
    // Tail feathers (fan)
    {
        float tl = L * S.tailLen;
        std::vector<Key> tk;
        for (int i = 0; i <= 4; ++i) {
            float t = float(i) / 4.0f;
            Key k;
            k.c = TB - fwd * (tl * t) - bup * (tl * 0.1f * t);
            float wide = S.tail == Tail::Fan ? 0.9f : (S.tail == Tail::LongThin ? 0.05f : 0.3f);
            k.rx = R * (0.3f + wide * t) * (S.tail == Tail::LongThin ? (1.0f - 0.6f * t) : 1.0f);
            k.ry = R * 0.04f;
            k.bone = t * 2.0f;
            k.sub = t;
            k.region = REG_TAIL;
            tk.push_back(k);
        }
        LoftOpts ot;
        ot.segs = 10;
        ot.ringsPerKey = 2;
        ot.side = {1, 0, 0};
        ot.capEndScale = 0.3f;
        loft(b, tk, {rig.pelvis, rig.tail[0], rig.tail[1]}, ot);
    }
    // Legs + toes (scaly, fixed color)
    vec3 legCol = S.beak == Beak::Duck ? vec3(0.95f, 0.55f, 0.1f) : (S.beak == Beak::Chicken ? vec3(0.85f, 0.72f, 0.3f) : vec3(0.45f, 0.42f, 0.4f));
    for (int s = 0; s < 2; ++s) {
        const auto& bn = rig.bones;
        vec3 k = bn[size_t(rig.leg[2 + s][1])].bindPos, a = bn[size_t(rig.leg[2 + s][2])].bindPos, f = bn[size_t(rig.leg[2 + s][3])].bindPos;
        float lr = std::max(R * 0.08f, 0.002f);
        tube(b, {k, a}, lr * 1.5f, lr, rig.leg[2 + s][1], legCol, 0.6f, 8);
        tube(b, {a, f + vec3(0, lr, 0)}, lr, lr * 0.9f, rig.leg[2 + s][2], legCol, 0.6f, 8);
        // thigh feathers
        size_t thigh0 = b.verts.size();
        blob(b, k + vec3(0, lr * 3.0f, 0), vec3(lr * 3.0f, lr * 4.0f, lr * 3.0f), rig.leg[2 + s][0], vec3(1), 0.9f, 10, 6);
        for (size_t vi = thigh0; vi < b.verts.size(); ++vi) { b.verts[vi].uv = vec2(float(REG_BODY), 0.5f); b.verts[vi].mat.w = float(PAT_COAT); }
        float tl = R * 0.55f;
        int foot = rig.leg[2 + s][3];
        bool webbed = S.foot == Foot::Webbed;
        for (int t = 0; t < 3; ++t) {
            float ang = radians(-30.0f + 30.0f * float(t));
            vec3 tip = f + vec3(std::sin(ang) * tl, 0, std::cos(ang) * tl);
            tube(b, {f, tip}, lr * 0.8f, lr * 0.4f, foot, legCol, 0.6f, 6);
            if (S.foot == Foot::Talon) tube(b, {tip, tip + vec3(0, -lr, lr * 2.0f)}, lr * 0.5f, lr * 0.1f, foot, kClaw, 0.3f, 6);
        }
        tube(b, {f, f + vec3(0, 0, -tl * 0.5f)}, lr * 0.7f, lr * 0.4f, foot, legCol, 0.6f, 6);
        if (webbed) blob(b, f + vec3(0, 0.001f, tl * 0.55f), vec3(tl * 0.5f, lr * 0.2f, tl * 0.4f), foot, legCol, 0.6f, 10, 4);
    }
    out.furLen = 0.0f;
    // All the bird body regions use the feather pattern (set by the species coat)
}

// ---------------------------------------------------------------------------
// Lizards and crocodilians
// ---------------------------------------------------------------------------
void buildLizard(const Species& sp, const AnimalIndividual& ind, AnimalBuild& out, Rng& rng, float sc, float youth) {
    const AnimalShape& S = sp.shape;
    AnimalRig& rig = out.rig;
    SkinBuilder& b = out.mesh;
    (void)rng; (void)ind;
    const float L = S.length * sc;               // snout-vent length
    const float W = L * S.girth;
    const float Ht = W * 0.75f;                  // body half-height
    const float legH = S.height * sc;            // belly clearance while standing
    const float y0 = legH + Ht;
    rig.plan = BodyPlan::Lizard;
    rig.root = rig.add("root", -1, {0, 0, 0});
    // spine chain along z: pelvis .. chest .. neck .. head
    rig.pelvis = rig.add("pelvis", rig.root, {0, y0, -L * 0.3f});
    rig.spine = rig.add("spine", rig.pelvis, {0, y0, 0});
    rig.chest = rig.add("chest", rig.spine, {0, y0, L * 0.25f});
    rig.neck1 = rig.add("neck1", rig.chest, {0, y0, L * 0.42f});
    rig.neck2 = rig.neck1;
    float HL = S.headLen * L * (1.0f + 0.3f * youth);
    vec3 HB{0, y0 + Ht * 0.1f, L * 0.5f};
    rig.head = rig.add("head", rig.neck1, HB);
    rig.jaw = rig.add("jaw", rig.head, HB + vec3(0, -Ht * 0.3f, HL * 0.15f));
    rig.tongue = rig.add("tongue", rig.jaw, HB + vec3(0, -Ht * 0.1f, HL * 0.6f));
    // tail
    float TL = S.tailLen * L;
    rig.tailCount = 6;
    int parent = rig.pelvis;
    for (int i = 0; i < 6; ++i) {
        rig.tail[i] = rig.add("tail" + std::to_string(i), parent, {0, y0 - Ht * 0.3f * float(i) / 6.0f - legH * 0.6f * float(i) / 6.0f, -L * 0.5f - TL * float(i) / 6.0f});
        parent = rig.tail[i];
    }
    // sprawled legs: upper goes out sideways, elbow bends down
    for (int l = 0; l < 4; ++l) {
        bool front = l < 2;
        float sx = (l % 2 == 0) ? 1.0f : -1.0f;
        float z = front ? L * 0.28f : -L * 0.32f;
        float ul = W * 1.1f;
        vec3 s{sx * W * 0.8f, y0 - Ht * 0.2f, z};
        vec3 e{sx * (W * 0.8f + ul), y0 - Ht * 0.1f, z + (front ? W * 0.3f : -W * 0.3f)};
        vec3 w{sx * (W * 0.8f + ul * 1.25f), W * 0.15f, z + (front ? W * 0.5f : -W * 0.2f)};
        vec3 f{sx * (W * 0.8f + ul * 1.3f), 0.004f * sc, z + (front ? W * 0.7f : W * 0.1f)};
        int pb = front ? rig.chest : rig.pelvis;
        const char* nm[4] = {"FL", "FR", "HL", "HR"};
        rig.leg[l][0] = rig.add(std::string(nm[l]) + "upper", pb, s);
        rig.leg[l][1] = rig.add(std::string(nm[l]) + "mid", rig.leg[l][0], e);
        rig.leg[l][2] = rig.add(std::string(nm[l]) + "lower", rig.leg[l][1], w);
        rig.leg[l][3] = rig.add(std::string(nm[l]) + "foot", rig.leg[l][2], f);
    }
    rig.shoulderH = y0 + Ht;
    rig.hipH = y0;
    rig.bodyLen = L;
    rig.legLen = legH;
    rig.headLen = HL;
    rig.scale = sc;
    bool croc = S.extras & X_SCUTES;

    // Body: head-less torso + tail as one loft (pelvis->chest), tail separate
    std::vector<Key> body;
    body.push_back({{0, y0 - Ht * 0.05f, -L * 0.52f}, W * 0.75f, Ht * 0.9f, 0.0f, 0.5f, 0, REG_BODY});
    body.push_back({{0, y0, -L * 0.25f}, W, Ht, 0.3f, 0.5f, 0, REG_BODY});
    body.push_back({{0, y0, L * 0.05f}, W * 1.05f, Ht * 1.02f, 1.0f, 0.5f, 0, REG_BODY});
    body.push_back({{0, y0, L * 0.3f}, W * 0.92f, Ht * 0.95f, 2.0f, 0.5f, 0, REG_BODY});
    body.push_back({{0, y0 + Ht * 0.05f, L * 0.45f}, W * 0.62f, Ht * 0.75f, 3.0f, 0.5f, 0, REG_BODY});
    body.push_back({HB + vec3(0, 0, HL * 0.15f), W * 0.62f, Ht * 0.72f, 4.0f, 0.5f, 0, REG_HEAD});
    LoftOpts o;
    o.segs = 20;
    o.ringsPerKey = 4;
    loft(b, body, {rig.pelvis, rig.spine, rig.chest, rig.neck1, rig.head}, o);
    // Head: flat wedge (croc: long snout)
    float sn = S.snoutLen;
    std::vector<Key> head;
    head.push_back({HB, W * 0.6f, Ht * 0.7f, 0, 0.1f, 0, REG_HEAD});
    head.push_back({HB + vec3(0, 0, HL * (1 - sn) * 0.8f), W * 0.62f * S.headWidth * 1.6f, Ht * 0.62f, 0, 0.4f, 0, REG_HEAD});
    head.push_back({HB + vec3(0, -Ht * 0.1f, HL * (1 - sn) + HL * sn * 0.5f), W * 0.45f * S.headWidth * 1.6f, Ht * (croc ? 0.35f : 0.45f), 0, 0.75f, 0, REG_HEAD});
    head.push_back({HB + vec3(0, -Ht * 0.12f, HL), W * 0.32f * S.headWidth * 1.6f, Ht * (croc ? 0.25f : 0.3f), 0, 1.0f, 0, REG_HEAD});
    LoftOpts oh;
    oh.segs = 18;
    oh.ringsPerKey = 4;
    oh.capEndScale = 0.5f;
    loft(b, head, {rig.head}, oh);
    // Jaw
    std::vector<Key> jaw;
    jaw.push_back({HB + vec3(0, -Ht * 0.35f, HL * 0.2f), W * 0.5f, Ht * 0.25f, 0, 0.4f, 0, REG_HEAD});
    jaw.push_back({HB + vec3(0, -Ht * 0.4f, HL * 0.95f), W * 0.28f * S.headWidth * 1.6f, Ht * 0.14f, 0, 1.0f, 0, REG_HEAD});
    LoftOpts oj;
    oj.segs = 14;
    oj.ringsPerKey = 3;
    oj.modify = [](SkinVertex& v, float, float a) {
        if (std::sin(a) > 0.35f) { v.uv.x = float(REG_FIXED); v.mat.w = float(PAT_PLAIN); v.mat.z = 0; v.color = vec4(kPink, 0.5f); }
    };
    loft(b, jaw, {rig.jaw}, oj);
    // tongue (forked for monitors) - pink
    tube(b, {HB + vec3(0, -Ht * 0.2f, HL * 0.4f), HB + vec3(0, -Ht * 0.2f, HL * 0.95f)}, W * 0.08f, W * 0.04f, rig.tongue, vec3(0.8f, 0.35f, 0.4f), 0.4f, 6);
    if (croc)  // teeth along the jaw line
        for (int i = 0; i < 12; ++i) {
            float t = float(i) / 11.0f;
            for (float sx : {-1.0f, 1.0f}) {
                vec3 p = HB + vec3(sx * W * (0.45f - 0.2f * t) * S.headWidth * 1.6f, -Ht * 0.32f, HL * (0.3f + 0.65f * t));
                tube(b, {p, p + vec3(0, -Ht * 0.18f, 0)}, W * 0.025f, W * 0.005f, rig.head, kIvory, 0.4f, 5);
            }
        }
    // Eyes (on top for crocs)
    for (float sx : {1.0f, -1.0f}) {
        float er = W * S.eyeSize;
        vec3 ec = HB + vec3(sx * W * (croc ? 0.3f : 0.48f), Ht * (croc ? 0.62f : 0.35f), HL * (croc ? 0.28f : 0.38f));
        eye(b, ec, er, normalize(vec3(sx, croc ? 0.6f : 0.2f, 0.4f)), rig.head, S.eyeColor, S.pupil);
    }
    // Tail
    std::vector<Key> tail;
    std::vector<int> chain{rig.pelvis};
    for (int i = 0; i < rig.tailCount; ++i) chain.push_back(rig.tail[i]);
    for (int i = 0; i <= 6; ++i) {
        float t = float(i) / 6.0f;
        vec3 c = rig.bones[size_t(i == 0 ? rig.pelvis : rig.tail[std::min(i, 5)])].bindPos;
        if (i == 0) c = {0, y0 - Ht * 0.05f, -L * 0.45f};
        if (i == 6) c = c + vec3(0, -legH * 0.1f, -TL / 6.0f);
        Key k;
        k.c = c;
        k.rx = W * 0.75f * (1.0f - 0.9f * t);
        k.ry = Ht * 0.9f * (1.0f - 0.85f * t) * (croc ? 1.15f : 1.0f);
        k.bone = float(i);
        k.sub = t;
        k.region = REG_TAIL;
        tail.push_back(k);
    }
    LoftOpts ot;
    ot.segs = 14;
    ot.ringsPerKey = 3;
    ot.capEndScale = 1.5f;
    if (croc) ot.radial = [](float a, float) { return 1.0f - 0.25f * std::fabs(std::cos(a)); };   // vertical tail flattened
    loft(b, tail, chain, ot);
    // Legs
    for (int l = 0; l < 4; ++l) {
        const auto& bn = rig.bones;
        vec3 s = bn[size_t(rig.leg[l][0])].bindPos, e = bn[size_t(rig.leg[l][1])].bindPos, w = bn[size_t(rig.leg[l][2])].bindPos, f = bn[size_t(rig.leg[l][3])].bindPos;
        float lr = W * (l < 2 ? 0.28f : 0.34f);
        std::vector<Key> lk;
        lk.push_back({s - vec3(s.x * 0.4f, 0, 0), lr * 1.2f, lr * 1.2f, 0.3f, 1.0f, 0, REG_LEG});
        lk.push_back({s, lr * 1.1f, lr * 1.1f, 1.0f, 0.9f, 0, REG_LEG});
        lk.push_back({e, lr * 0.8f, lr * 0.85f, 2.0f, 0.6f, 0, REG_LEG});
        lk.push_back({w, lr * 0.6f, lr * 0.6f, 3.0f, 0.2f, 0, REG_LEG});
        lk.push_back({f + vec3(0, lr * 0.3f, 0), lr * 0.55f, lr * 0.4f, 4.0f, 0.0f, 0, REG_LEG});
        LoftOpts ol;
        ol.segs = 10;
        ol.ringsPerKey = 3;
        ol.side = {0, 0, 1};
        loft(b, lk, {l < 2 ? rig.chest : rig.pelvis, rig.leg[l][0], rig.leg[l][1], rig.leg[l][2], rig.leg[l][3]}, ol);
        for (int t = 0; t < 5; ++t) {
            float ang = radians(-50.0f + 25.0f * float(t)) + (l % 2 == 0 ? 0.3f : -0.3f);
            vec3 tip = f + vec3(std::sin(ang) * lr * 2.2f, 0, std::cos(ang) * lr * 2.2f);
            tube(b, {f + vec3(0, lr * 0.2f, 0), tip}, lr * 0.25f, lr * 0.12f, rig.leg[l][3], S.noseColor * 0.0f + vec3(0.25f, 0.22f, 0.18f), 0.6f, 5, true, REG_LEG, 0.0f);
            tube(b, {tip, tip + vec3(std::sin(ang) * lr * 0.4f, -lr * 0.2f, std::cos(ang) * lr * 0.4f)}, lr * 0.1f, lr * 0.02f, rig.leg[l][3], kClaw, 0.4f, 5);
        }
    }
    // Back scutes (crocodilians) / spiny beard (bearded dragon)
    if (croc)
        for (int i = 0; i < 22; ++i) {
            float t = float(i) / 21.0f;
            float z = lerpf(L * 0.35f, -L * 0.5f - TL * 0.8f, t);
            int bone = t < 0.4f ? (t < 0.2f ? rig.chest : rig.spine) : (t < 0.55f ? rig.pelvis : rig.tail[std::min(5, int((t - 0.55f) / 0.45f * 6.0f))]);
            float y = t < 0.45f ? y0 + Ht * 0.95f : y0 + Ht * (0.95f - (t - 0.45f) * 1.2f) - legH * 0.5f * (t - 0.45f);
            for (float sx : {-1.0f, 1.0f}) {
                vec3 p{sx * W * (0.25f - 0.15f * t), y, z};
                tube(b, {p, p + vec3(0, Ht * 0.18f, 0)}, W * 0.07f, W * 0.02f, bone, vec3(0.2f, 0.22f, 0.15f), 0.8f, 5, true, REG_BODY, 0.0f);
            }
        }
    if (S.extras & X_FRILL)
        for (int i = 0; i < 9; ++i) {
            float a = radians(-80.0f + 20.0f * float(i));
            vec3 p = HB + vec3(std::sin(a) * W * 0.55f, -Ht * 0.4f + std::cos(a) * Ht * 0.1f, HL * 0.3f);
            tube(b, {p, p + vec3(std::sin(a) * W * 0.3f, -Ht * 0.25f, -HL * 0.05f)}, W * 0.05f, W * 0.01f, rig.jaw, vec3(1), 0.8f, 5, true, REG_HEAD, 0.0f);
        }
}

// ---------------------------------------------------------------------------
// Turtles and tortoises
// ---------------------------------------------------------------------------
void buildTurtle(const Species& sp, const AnimalIndividual& ind, AnimalBuild& out, Rng& rng, float sc, float youth) {
    const AnimalShape& S = sp.shape;
    AnimalRig& rig = out.rig;
    SkinBuilder& b = out.mesh;
    (void)rng; (void)ind; (void)youth;
    const float L = S.length * sc;               // shell length
    const float W = L * S.girth;
    const float Hs = L * S.chestDepth;           // shell height
    const float legH = S.height * sc;
    rig.plan = BodyPlan::Turtle;
    rig.root = rig.add("root", -1, {0, 0, 0});
    rig.pelvis = rig.add("pelvis", rig.root, {0, legH + Hs * 0.3f, -L * 0.2f});
    rig.spine = rig.add("shell", rig.pelvis, {0, legH + Hs * 0.3f, 0});
    rig.chest = rig.add("chest", rig.spine, {0, legH + Hs * 0.3f, L * 0.25f});
    rig.neck1 = rig.add("neck1", rig.chest, {0, legH + Hs * 0.25f, L * 0.4f});
    rig.neck2 = rig.add("neck2", rig.neck1, {0, legH + Hs * 0.3f, L * 0.5f});
    float HL = S.headLen * L;
    vec3 HB{0, legH + Hs * 0.35f, L * 0.55f};
    rig.head = rig.add("head", rig.neck2, HB);
    rig.jaw = rig.add("jaw", rig.head, HB + vec3(0, -HL * 0.2f, HL * 0.2f));
    rig.tailCount = 1;
    rig.tail[0] = rig.add("tail0", rig.pelvis, {0, legH + Hs * 0.2f, -L * 0.5f});
    for (int l = 0; l < 4; ++l) {
        bool front = l < 2;
        float sx = (l % 2 == 0) ? 1.0f : -1.0f;
        float z = front ? L * 0.32f : -L * 0.3f;
        vec3 s{sx * W * 0.62f, legH + Hs * 0.05f, z};
        vec3 e{sx * W * 0.8f, legH * 0.75f, z + (front ? L * 0.04f : -L * 0.02f)};
        vec3 w{sx * W * 0.84f, legH * 0.3f, z + (front ? L * 0.05f : -L * 0.03f)};
        vec3 f{sx * W * 0.86f, 0.004f * sc, z + (front ? L * 0.06f : -L * 0.02f)};
        const char* nm[4] = {"FL", "FR", "HL", "HR"};
        int pb = front ? rig.chest : rig.pelvis;
        rig.leg[l][0] = rig.add(std::string(nm[l]) + "upper", pb, s);
        rig.leg[l][1] = rig.add(std::string(nm[l]) + "mid", rig.leg[l][0], e);
        rig.leg[l][2] = rig.add(std::string(nm[l]) + "lower", rig.leg[l][1], w);
        rig.leg[l][3] = rig.add(std::string(nm[l]) + "foot", rig.leg[l][2], f);
    }
    rig.shoulderH = legH + Hs;
    rig.hipH = legH + Hs * 0.5f;
    rig.bodyLen = L;
    rig.legLen = legH;
    rig.headLen = HL;
    rig.scale = sc;

    // Shell: a domed carapace (scute pattern) over a flat plastron, one rigid piece on the
    // shell bone. Built directly as a lat-long surface: u around the rim, v from rim to crown.
    {
        const bool tort = S.foot == Foot::Hoof;
        const int U = 40, V = 12;
        const float yRim = legH + Hs * 0.12f;
        const float a = W, c = L * 0.5f;                  // rim half-width / half-length
        const float dome = Hs * 0.88f, belly = Hs * 0.2f;
        uint32_t start = uint32_t(b.verts.size());
        auto put = [&](vec3 p, vec3 n, int region, float under) {
            SkinVertex v{};
            v.pos = p; v.normal = n;
            v.uv = vec2(float(region), 0.5f);
            v.color = vec4(1, 1, 1, under);
            v.mat = vec4(region == REG_SHELL ? 0.55f : 0.7f, 0.0f, 0.0f, float(PAT_COAT));
            v.bones = vec4(float(rig.spine), 0, 0, 0);
            v.weights = vec4(1, 0, 0, 0);
            b.add(v);
        };
        // carapace: rows from the rim (v=0) to the crown (v=V); flared rim, tortoises are taller
        for (int j = 0; j <= V; ++j) {
            float vv = float(j) / float(V);
            float ang = vv * kPi * 0.5f;
            float rr = std::cos(ang);
            float h = std::pow(std::sin(ang), tort ? 0.8f : 1.2f);
            for (int i = 0; i <= U; ++i) {
                float u = float(i) / float(U) * 2.0f * kPi;
                float flare = 1.0f + 0.06f * (1.0f - vv) * (1.0f - vv);
                vec3 p{a * rr * std::cos(u) * flare, yRim + dome * h, c * rr * std::sin(u) * flare};
                put(p, normalize(vec3(p.x / (a * a), (p.y - yRim) / (dome * dome), p.z / (c * c))), REG_SHELL, 0.0f);
            }
        }
        for (int j = 0; j < V; ++j)
            for (int i = 0; i < U; ++i) {
                uint32_t r0 = start + uint32_t(j * (U + 1) + i), r1 = r0 + uint32_t(U + 1);
                b.tri(r0, r0 + 1, r1 + 1);
                b.tri(r0, r1 + 1, r1);
            }
        // rim edge (a short vertical band) and the plastron underneath
        uint32_t p0 = uint32_t(b.verts.size());
        for (int j = 0; j <= 3; ++j) {
            float vv = float(j) / 3.0f;
            float rr = 1.0f - vv * vv * 0.15f;
            for (int i = 0; i <= U; ++i) {
                float u = float(i) / float(U) * 2.0f * kPi;
                vec3 p{a * rr * std::cos(u) * 1.06f, yRim - belly * vv, c * rr * std::sin(u) * 1.06f};
                vec3 n = normalize(vec3(std::cos(u) / a, -vv * 2.0f / belly, std::sin(u) / c));
                put(p, n, j == 0 ? REG_SHELL : REG_BELLY, 0.6f + 0.4f * vv);
            }
        }
        for (int j = 0; j < 3; ++j)
            for (int i = 0; i < U; ++i) {
                uint32_t r0 = p0 + uint32_t(j * (U + 1) + i), r1 = r0 + uint32_t(U + 1);
                b.tri(r0, r1 + 1, r0 + 1);
                b.tri(r0, r1, r1 + 1);
            }
        uint32_t center = uint32_t(b.verts.size());
        put({0, yRim - belly, 0}, {0, -1, 0}, REG_BELLY, 1.0f);
        uint32_t last = p0 + uint32_t(3 * (U + 1));
        for (int i = 0; i < U; ++i) b.tri(center, last + uint32_t(i + 1), last + uint32_t(i));
    }
    // Neck + head (retractable: animator slides neck bones back)
    std::vector<Key> neck;
    neck.push_back({{0, legH + Hs * 0.25f, L * 0.3f}, HL * 0.3f, HL * 0.28f, 0.0f, 0.2f, 0, REG_BODY});
    neck.push_back({{0, legH + Hs * 0.3f, L * 0.48f}, HL * 0.26f, HL * 0.26f, 1.0f, 0.4f, 0, REG_BODY});
    neck.push_back({HB, HL * 0.3f, HL * 0.3f, 2.0f, 0.6f, 0, REG_HEAD});
    neck.push_back({HB + vec3(0, 0, HL * 0.55f), HL * 0.3f, HL * 0.28f, 2.0f, 0.8f, 0, REG_HEAD});
    neck.push_back({HB + vec3(0, -HL * 0.05f, HL * 0.9f), HL * 0.18f, HL * 0.18f, 2.0f, 1.0f, 0, REG_HEAD});
    LoftOpts on;
    on.segs = 14;
    on.ringsPerKey = 3;
    loft(b, neck, {rig.neck1, rig.neck2, rig.head}, on);
    for (float sx : {1.0f, -1.0f})
        eye(b, HB + vec3(sx * HL * 0.2f, HL * 0.08f, HL * 0.55f), HL * 0.08f, normalize(vec3(sx, 0.2f, 0.5f)), rig.head, S.eyeColor, Pupil::Round);
    tube(b, {HB + vec3(0, -HL * 0.1f, HL * 0.7f), HB + vec3(0, -HL * 0.05f, HL * 0.95f)}, HL * 0.1f, HL * 0.05f, rig.head, vec3(0.2f, 0.18f, 0.12f), 0.4f, 8);
    // Legs (elephantine for tortoises)
    bool tortoise = S.foot == Foot::Hoof;
    for (int l = 0; l < 4; ++l) {
        const auto& bn = rig.bones;
        vec3 s = bn[size_t(rig.leg[l][0])].bindPos, e = bn[size_t(rig.leg[l][1])].bindPos, w = bn[size_t(rig.leg[l][2])].bindPos, f = bn[size_t(rig.leg[l][3])].bindPos;
        float lr = W * (tortoise ? 0.22f : 0.15f);
        std::vector<Key> lk;
        lk.push_back({s, lr, lr, 1.0f, 0.9f, 0, REG_LEG});
        lk.push_back({e, lr * 0.95f, lr * 0.95f, 2.0f, 0.6f, 0, REG_LEG});
        lk.push_back({w, lr * 0.9f, lr * 0.9f, 3.0f, 0.3f, 0, REG_LEG});
        lk.push_back({f + vec3(0, lr * 0.5f, 0), lr * (tortoise ? 1.0f : 1.3f), lr * (tortoise ? 0.9f : 0.4f), 4.0f, 0.0f, 0, REG_LEG});
        LoftOpts ol;
        ol.segs = 10;
        ol.ringsPerKey = 2;
        loft(b, lk, {rig.pelvis, rig.leg[l][0], rig.leg[l][1], rig.leg[l][2], rig.leg[l][3]}, ol);
        for (int t = 0; t < (tortoise ? 4 : 5); ++t) {
            float u = (float(t) + 0.5f) / (tortoise ? 4.0f : 5.0f) * 2.0f - 1.0f;
            vec3 cp = f + vec3(u * lr * 0.8f, lr * 0.2f, lr * 0.9f);
            tube(b, {cp, cp + vec3(u * lr * 0.2f, -lr * 0.25f, lr * 0.4f)}, lr * 0.12f, lr * 0.03f, rig.leg[l][3], kClaw, 0.5f, 5);
        }
    }
    tube(b, {rig.bones[size_t(rig.tail[0])].bindPos, rig.bones[size_t(rig.tail[0])].bindPos + vec3(0, -Hs * 0.1f, -L * 0.12f)}, W * 0.08f, W * 0.02f,
         rig.tail[0], vec3(1), 0.8f, 8, true, REG_TAIL, 0.0f);
}

// ---------------------------------------------------------------------------
// Snakes
// ---------------------------------------------------------------------------
void buildSnake(const Species& sp, const AnimalIndividual& ind, AnimalBuild& out, Rng& rng, float sc, float youth) {
    const AnimalShape& S = sp.shape;
    AnimalRig& rig = out.rig;
    SkinBuilder& b = out.mesh;
    (void)rng; (void)ind; (void)youth;
    const float L = S.length * sc;
    const float R = S.height * sc * 0.5f;        // body radius
    rig.plan = BodyPlan::Snake;
    rig.root = rig.add("root", -1, {0, 0, 0});
    const int N = 22;
    rig.chainCount = N;
    int parent = rig.root;
    // chain from tail (index 0) to head (N-1), along +Z
    for (int i = 0; i < N; ++i) {
        float t = float(i) / float(N - 1);
        rig.chain[i] = rig.add("seg" + std::to_string(i), parent, {0, R, lerpf(-L * 0.5f, L * 0.5f, t)});
        parent = rig.chain[i];
    }
    rig.head = rig.add("head", rig.chain[N - 1], {0, R, L * 0.5f});
    float HL = S.headLen * L;
    rig.jaw = rig.add("jaw", rig.head, {0, R * 0.7f, L * 0.5f + HL * 0.2f});
    rig.tongue = rig.add("tongue", rig.head, {0, R * 0.8f, L * 0.5f + HL * 0.9f});
    rig.pelvis = rig.chain[N / 3];
    rig.chest = rig.chain[N * 2 / 3];
    rig.spine = rig.chain[N / 2];
    rig.shoulderH = R * 2.0f;
    rig.bodyLen = L;
    rig.headLen = HL;
    rig.scale = sc;
    bool hood = S.extras & X_HOOD;
    std::vector<Key> body;
    std::vector<int> chain;
    for (int i = 0; i < N; ++i) chain.push_back(rig.chain[i]);
    chain.push_back(rig.head);
    for (int i = 0; i < N; ++i) {
        float t = float(i) / float(N - 1);
        float r = R * (0.15f + 0.85f * std::sqrt(std::sin(std::min(t * 1.25f, 1.0f) * kPi * 0.5f))) * (t > 0.92f ? 0.75f : 1.0f);
        Key k;
        k.c = {0, r, lerpf(-L * 0.5f, L * 0.5f, t)};
        k.rx = r * 1.1f;
        k.ry = r;
        k.bone = float(i);
        k.sub = t;
        k.region = t < 0.15f ? REG_TAIL : REG_BODY;
        if (hood && t > 0.8f && t < 0.97f) k.rx *= 1.0f;   // the hood is spread by the animator
        body.push_back(k);
    }
    // head
    body.push_back({{0, R * 0.9f, L * 0.5f + HL * 0.35f}, R * S.headWidth * 1.4f, R * 0.75f, float(N), 0.5f, 0, REG_HEAD});
    body.push_back({{0, R * 0.85f, L * 0.5f + HL * 0.85f}, R * S.headWidth * 0.9f, R * 0.55f, float(N), 1.0f, 0, REG_HEAD});
    LoftOpts o;
    o.segs = 16;
    o.ringsPerKey = 3;
    o.capStartScale = 2.0f;
    o.capEndScale = 0.6f;
    o.modify = [](SkinVertex& v, float, float) { v.mat.x = 0.35f; };
    loft(b, body, chain, o);
    for (float sx : {1.0f, -1.0f})
        eye(b, {sx * R * S.headWidth * 0.85f, R * 1.15f, L * 0.5f + HL * 0.55f}, R * 0.22f, normalize(vec3(sx, 0.3f, 0.5f)), rig.head, S.eyeColor, S.pupil);
    // forked tongue
    vec3 tb{0, R * 0.7f, L * 0.5f + HL * 0.9f};
    for (float sx : {1.0f, -1.0f})
        tube(b, {tb, tb + vec3(0, 0, HL * 0.5f), tb + vec3(sx * R * 0.2f, 0, HL * 0.75f)}, R * 0.06f, R * 0.02f, rig.tongue, vec3(0.75f, 0.1f, 0.15f), 0.4f, 5);
    if (S.extras & X_RATTLE)
        for (int i = 0; i < 5; ++i) {
            vec3 c{0, R * 0.3f, -L * 0.5f - R * 0.3f * float(i)};
            blob(b, c, vec3(R * (0.45f - 0.05f * float(i)), R * 0.3f, R * 0.22f), rig.chain[0], vec3(0.55f, 0.48f, 0.36f), 0.6f, 10, 6);
        }
}

}  // namespace

// ---------------------------------------------------------------------------
AnimalBuild buildAnimal(const Species& sp, const AnimalIndividual& ind) {
    AnimalBuild out;
    Rng rng(ind.seed * 2654435761u + uint32_t(ind.species) * 97u);
    float age = saturate(ind.age);
    float youth = 1.0f - age;
    float sc = (ind.male ? 1.0f : sp.shape.femaleScale) * (0.3f + 0.7f * std::pow(age, 0.8f)) * rng.range(0.96f, 1.04f);
    switch (sp.shape.plan) {
    case BodyPlan::Bird: buildBird(sp, ind, out, rng, sc, youth); break;
    case BodyPlan::Lizard: buildLizard(sp, ind, out, rng, sc, youth); break;
    case BodyPlan::Turtle: buildTurtle(sp, ind, out, rng, sc, youth); break;
    case BodyPlan::Snake: buildSnake(sp, ind, out, rng, sc, youth); break;
    default: buildQuadruped(sp, ind, out, rng, sc, youth); break;
    }
    out.rig.plan = sp.shape.plan;
    out.mesh.recomputeNormals();

    // Coat for this individual
    const CoatVariant& cv = sp.coats.empty() ? CoatVariant{"Default", {0.5f, 0.4f, 0.3f}, {0.1f, 0.1f, 0.1f}, {0.95f, 0.95f, 0.9f}}
                                             : sp.coats[size_t(ind.coat) % sp.coats.size()];
    Rng cr(ind.seed * 31u + 7u);
    out.coat.a = jitterColor(cv.a, cr, 0.06f);
    out.coat.b = jitterColor(cv.b, cr, 0.06f);
    out.coat.c = jitterColor(cv.c, cr, 0.03f);
    out.coat.pattern = cv.pattern;
    out.coat.amount = clampf(cv.amount + cr.range(-0.06f, 0.06f), 0.0f, 1.0f);
    out.coat.contrast = cv.contrast;
    out.coat.seed = cr.range(0.0f, 10.0f);
    auto mark = [&](float m) { return m > 0.0f && cr.uniform() < 0.65f ? m * cr.range(0.35f, 1.0f) : 0.0f; };
    out.coat.marks = vec4(mark(cv.marks.x), mark(cv.marks.y), mark(cv.marks.z), mark(cv.marks.w));
    // Babies of spotted-fawn species wear spots
    if (youth > 0.55f && sp.category == "Deer") { out.coat.pattern = FAWN; out.coat.amount = 1.0f; }
    out.coat.scale = std::max(out.rig.bodyLen, 0.05f);

    // Fur shells only render the outer fuzz; long coats get their volume from the lofted shape.
    float furCap = std::min(0.018f, std::max(0.003f, 0.03f * out.rig.bodyLen));
    for (auto& v : out.mesh.verts) v.mat.z = std::min(v.mat.z, furCap);
    float maxFur = 0.0f;
    AABB bb(out.mesh.verts.empty() ? vec3(0.0f) : out.mesh.verts[0].pos, out.mesh.verts.empty() ? vec3(0.0f) : out.mesh.verts[0].pos);
    for (const auto& v : out.mesh.verts) {
        maxFur = std::max(maxFur, v.mat.z);
        bb.min = vmin(bb.min, v.pos);
        bb.max = vmax(bb.max, v.pos);
    }
    out.furLen = maxFur;
    // Fur shells extrude by (mat.z * shellOffset): normalize so shellOffset = 1 means full fur length.
    out.bounds = bb;
    return out;
}

}  // namespace ps
