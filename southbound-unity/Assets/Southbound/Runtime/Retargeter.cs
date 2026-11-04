// Drives John's MakeHuman skeleton with the Quaternius Universal Animation
// Library clips, the same way the web game bakes them (src/assets/retarget.js):
// every target bone copies the source bone's rotation relative to its rest
// pose, after rotating its rest direction onto the source's (A-pose arms onto
// T-pose arms), and the hips move scaled by hip height.
// The UAL skeleton (ual.glb, no mesh) plays the clips hidden; this copies the
// pose across every frame.
using System.Collections.Generic;
using UnityEngine;

namespace Southbound
{
    public sealed class Retargeter : MonoBehaviour
    {
        [Tooltip("An instance of Art/Models/anims/ual.glb (its Animation component plays the clips).")]
        public Transform sourceRoot;
        [Tooltip("An instance of the character model (Art/Models/people/hero.glb).")]
        public Transform targetRoot;

        // Quaternius UAL (Rigify DEF-*) -> MakeHuman default skeleton; names with . : / [ ] and spaces removed
        static readonly Dictionary<string, string> Map = BuildMap();
        static Dictionary<string, string> BuildMap()
        {
            var m = new Dictionary<string, string>
            {
                ["DEF-hips"] = "root", ["DEF-spine001"] = "spine04", ["DEF-spine002"] = "spine02", ["DEF-spine003"] = "spine01",
                ["DEF-neck"] = "neck01", ["DEF-head"] = "head",
                ["DEF-shoulderL"] = "clavicleL", ["DEF-upper_armL"] = "upperarm01L", ["DEF-forearmL"] = "lowerarm01L", ["DEF-handL"] = "wristL",
                ["DEF-shoulderR"] = "clavicleR", ["DEF-upper_armR"] = "upperarm01R", ["DEF-forearmR"] = "lowerarm01R", ["DEF-handR"] = "wristR",
                ["DEF-thighL"] = "upperleg01L", ["DEF-shinL"] = "lowerleg01L", ["DEF-footL"] = "footL",
                ["DEF-thighR"] = "upperleg01R", ["DEF-shinR"] = "lowerleg01R", ["DEF-footR"] = "footR",
            };
            var fingers = new[] { "thumb", "f_index", "f_middle", "f_ring", "f_pinky" };
            foreach (var side in new[] { "L", "R" })
                for (int i = 0; i < fingers.Length; i++)
                    for (int s = 1; s <= 3; s++) m[$"DEF-{fingers[i]}0{s}{side}"] = $"finger{i + 1}-{s}{side}";
            return m;
        }

        public static string Clean(string n)
        {
            var sb = new System.Text.StringBuilder(n.Length);
            foreach (char c in n) if (c != '.' && c != ':' && c != '/' && c != '[' && c != ']' && c != ' ') sb.Append(c);
            return sb.ToString();
        }

        sealed class Pair { public Transform s, d; public Quaternion srcRest, dstRest, align = Quaternion.identity; }
        readonly List<Pair> pairs = new List<Pair>();
        Pair hips;
        Vector3 srcHipsRest, dstHipsRest;
        float ratio = 1;
        Animation anim;
        string current;
        float onceUntil;
        public bool Ready => anim != null && pairs.Count > 0;

        void Start()
        {
            if (sourceRoot == null || targetRoot == null) { enabled = false; return; }
            anim = sourceRoot.GetComponentInChildren<Animation>();
            if (anim == null)
            {
                Debug.LogWarning("Southbound: ual.glb has no Animation component. In its import settings set glTFast's Animation to Legacy.");
                enabled = false;
                return;
            }
            var src = new Dictionary<string, Transform>();
            foreach (var t in sourceRoot.GetComponentsInChildren<Transform>(true)) src[Clean(t.name)] = t;
            var srcByDst = new Dictionary<string, Transform>();
            foreach (var kv in Map) if (src.TryGetValue(kv.Key, out var s)) srcByDst[kv.Value] = s;
            // parent-first order
            foreach (var d in targetRoot.GetComponentsInChildren<Transform>(true))
                if (srcByDst.TryGetValue(Clean(d.name), out var s)) pairs.Add(new Pair { s = s, d = d });
            if (pairs.Count == 0) { Debug.LogWarning("Southbound: no matching bones between the animation skeleton and the character."); enabled = false; return; }

            // rest poses, relative to each root so moving and turning the character doesn't matter
            var bySrc = new Dictionary<Transform, Pair>();
            foreach (var p in pairs) { p.srcRest = RelRot(sourceRoot, p.s); p.dstRest = RelRot(targetRoot, p.d); bySrc[p.s] = p; }
            foreach (var p in pairs)
            {
                var sc = MappedChild(p.s, bySrc);
                if (sc == null)
                {
                    var parent = pairs.Find(o => o.d == p.d.parent);
                    if (parent != null) p.align = parent.align;
                    continue;
                }
                var dc = bySrc[sc].d;
                Vector3 ds = sourceRoot.InverseTransformPoint(sc.position) - sourceRoot.InverseTransformPoint(p.s.position);
                Vector3 dd = targetRoot.InverseTransformPoint(dc.position) - targetRoot.InverseTransformPoint(p.d.position);
                if (ds.sqrMagnitude < 1e-8f || dd.sqrMagnitude < 1e-8f) continue;
                p.align = Quaternion.FromToRotation(dd.normalized, ds.normalized);
            }
            hips = pairs.Find(p => Clean(p.d.name) == "root") ?? pairs[0];
            srcHipsRest = sourceRoot.InverseTransformPoint(hips.s.position);
            dstHipsRest = targetRoot.InverseTransformPoint(hips.d.position);
            ratio = dstHipsRest.y / Mathf.Max(1e-3f, srcHipsRest.y);
            foreach (var r in sourceRoot.GetComponentsInChildren<Renderer>(true)) r.enabled = false;
            Loop("Idle_Loop", 1);
        }

        static Quaternion RelRot(Transform root, Transform t) => Quaternion.Inverse(root.rotation) * t.rotation;

        static Transform MappedChild(Transform bone, Dictionary<Transform, Pair> mapped)
        {
            // first mapped descendant, depth-first like three.js traverse
            foreach (Transform c in bone)
            {
                if (mapped.ContainsKey(c)) return c;
                var deeper = MappedChild(c, mapped);
                if (deeper != null) return deeper;
            }
            return null;
        }

        /// <summary>Keep a looping clip going (cross-fades when it changes).</summary>
        public void Loop(string clip, float speed)
        {
            if (anim == null || Time.time < onceUntil) return;
            var st = anim[clip];
            if (st == null) return;
            st.wrapMode = WrapMode.Loop;
            st.speed = Mathf.Max(0.05f, speed);
            if (current != clip) { anim.CrossFade(clip, 0.2f); current = clip; }
        }

        /// <summary>Play a one-shot clip (jump, shoot, reload, hit, death) over the loop.</summary>
        public void Play(string clip, float fade = 0.15f)
        {
            if (anim == null) return;
            var st = anim[clip];
            if (st == null) return;
            bool hold = clip == "Death01";
            st.wrapMode = hold ? WrapMode.ClampForever : WrapMode.Once;
            st.speed = 1;
            anim.CrossFade(clip, fade);
            current = clip;
            onceUntil = hold ? float.MaxValue : Time.time + st.length * 0.9f;
        }

        void LateUpdate()
        {
            if (pairs.Count == 0) return;
            Quaternion srcInv = Quaternion.Inverse(sourceRoot.rotation);
            foreach (var p in pairs)
            {
                Quaternion sW = srcInv * p.s.rotation;
                p.d.rotation = targetRoot.rotation * (sW * Quaternion.Inverse(p.srcRest) * p.align * p.dstRest);
            }
            Vector3 delta = (sourceRoot.InverseTransformPoint(hips.s.position) - srcHipsRest) * ratio;
            hips.d.position = targetRoot.TransformPoint(dstHipsRest + delta);
        }
    }
}
