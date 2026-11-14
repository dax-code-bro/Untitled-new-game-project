// A car's look while the game runs: its own palette (paint, glass, chrome, wheel colours: CarPalette)
// handed to the shared HDRP Lit car material through a MaterialPropertyBlock, and the lamps: the
// palette's emission row lights the headlights, tail lights, brake lights, siren and taxi sign
// (the web game's body shader values), plus real lights for the headlight beams and the brakes.
// The engine note and the horn are made in code (no sound files needed).
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [DisallowMultipleComponent]
    public sealed class CarBody : MonoBehaviour
    {
        public CarLook look = new CarLook();
        [Tooltip("Every renderer that uses the car palette material (the body's levels and the wheels).")]
        public Renderer[] renderers;
        [Tooltip("Brightness of an emission value of 1 (the web game's lit sign), in nits.")]
        public float emissionNits = 3000f;
        public Light[] headlights, brakeLights;
        public bool hasSiren;

        Texture2D baseTex, maskTex, coatTex, emitTex;
        MaterialPropertyBlock mpb;
        readonly float[] fBase = new float[CarPalette.Texels * 4], fMask = new float[CarPalette.Texels * 4], fCoat = new float[CarPalette.Texels * 4], fEmit = new float[CarPalette.Texels * 4];
        CarLights lights, shown = new CarLights { Head = -1 };
        public CarLights Lights => lights;
        public bool HeadlightsOn { get => lights.Head > 0.5; set => lights.Head = value ? 1 : 0; }
        public float Brake { set => lights.Brake = value; }
        public bool Siren { get; set; }

        static readonly int IdBase = Shader.PropertyToID("_BaseColorMap"), IdMask = Shader.PropertyToID("_MaskMap"),
            IdCoat = Shader.PropertyToID("_CoatMaskMap"), IdEmit = Shader.PropertyToID("_EmissiveColorMap");

        float[] brakeFull;

        void Awake()
        {
            // each brake light's full brightness, as the factory set it
            brakeFull = new float[brakeLights?.Length ?? 0];
            for (int i = 0; i < brakeFull.Length; i++) brakeFull[i] = brakeLights[i] != null && brakeLights[i].intensity > 0 ? brakeLights[i].intensity : 1;
            ApplyLook();
        }

        /// <summary>Repaint (r, g, b linear 0..1, metalness 0..1).</summary>
        public void Paint(Color c, float metal)
        {
            look.Paint = new[] { c.r, c.g, c.b };
            look.Metal = metal;
            ApplyLook();
        }

        public void ApplyLook()
        {
            CarPalette.Fill(look, fBase, fMask, fCoat);
            baseTex = Fill(baseTex, fBase, false, true);
            maskTex = Fill(maskTex, fMask, true, false);
            coatTex = Fill(coatTex, fCoat, true, false);
            shown.Head = -1; // re-upload the emission next frame
            UpdateEmission(true);
        }

        /// <summary>A palette texture: 16 x 4, point-sampled, no mipmaps (each texel is one slot).</summary>
        public static Texture2D MakeTexture(float[] f, bool linear, bool srgbEncode, bool hdr = false)
        {
            var t = new Texture2D(CarPalette.Width, CarPalette.Height, hdr ? TextureFormat.RGBAHalf : TextureFormat.RGBA32, false, linear)
            { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "car palette" };
            Write(t, f, srgbEncode);
            return t;
        }

        static void Write(Texture2D t, float[] f, bool srgbEncode)
        {
            var px = new Color[CarPalette.Texels];
            for (int i = 0; i < px.Length; i++)
            {
                var c = new Color(f[i * 4], f[i * 4 + 1], f[i * 4 + 2], f[i * 4 + 3]);
                px[i] = srgbEncode ? c.gamma : c; // the palette is linear; an sRGB texture stores it gamma-encoded
            }
            t.SetPixels(px);
            t.Apply(false, false);
        }

        static Texture2D Fill(Texture2D t, float[] f, bool linear, bool srgbEncode)
        {
            if (t == null) return MakeTexture(f, linear, srgbEncode);
            Write(t, f, srgbEncode);
            return t;
        }

        void LateUpdate() => UpdateEmission(false);

        void UpdateEmission(bool force)
        {
            if (Siren && hasSiren)
            {
                // alternating red / blue, two flashes each
                float t = Time.time * 2.4f % 2f;
                bool red = t < 1f, on = (t % 1f) < 0.22f || ((t % 1f) > 0.4f && (t % 1f) < 0.62f);
                lights.SirenRed = red && on ? 1 : 0.05; lights.SirenBlue = !red && on ? 1 : 0.05;
            }
            else lights.SirenRed = lights.SirenBlue = 0;
            if (!force && lights.Head == shown.Head && lights.Brake == shown.Brake && lights.SirenRed == shown.SirenRed && lights.SirenBlue == shown.SirenBlue) return;
            shown = lights;
            CarPalette.Emission(lights, fEmit);
            if (emitTex == null) emitTex = MakeTexture(fEmit, true, false, true); else Write(emitTex, fEmit, false);
            mpb ??= new MaterialPropertyBlock();
            if (renderers != null)
                foreach (var r in renderers)
                {
                    if (r == null) continue;
                    // the palette goes to the body's own material only (index 0): the see-through glass and the cabin keep theirs
                    r.GetPropertyBlock(mpb, 0);
                    mpb.SetTexture(IdBase, baseTex); mpb.SetTexture(IdMask, maskTex); mpb.SetTexture(IdCoat, coatTex); mpb.SetTexture(IdEmit, emitTex);
                    r.SetPropertyBlock(mpb, 0);
                }
            if (headlights != null) foreach (var l in headlights) if (l != null) l.enabled = lights.Head > 0.5;
            if (brakeLights != null)
                for (int i = 0; i < brakeLights.Length; i++)
                {
                    var l = brakeLights[i];
                    if (l == null) continue;
                    l.enabled = lights.Head > 0.5 || lights.Brake > 0.1;
                    l.intensity = (lights.Brake > 0.1 ? 1f : 0.25f) * (brakeFull != null && i < brakeFull.Length ? brakeFull[i] : 1);
                }
        }

        // ------------------------------------------------------------------ sound
        AudioSource engine, horn;
        /// <summary>Engine note: 0 idle .. 1 flat out. Set by CarController while someone drives.</summary>
        public void EngineSound(bool running, float rev, float load)
        {
            if (!running) { if (engine != null && engine.isPlaying) engine.Stop(); return; }
            if (engine == null) engine = MakeSource(EngineClip(), true, 0.35f);
            if (!engine.isPlaying) engine.Play();
            engine.pitch = 0.55f + rev * 1.35f;
            engine.volume = 0.18f + load * 0.3f;
        }

        public void HornSound(bool on)
        {
            if (on && horn == null) horn = MakeSource(HornClip(), true, 0.6f);
            if (horn == null) return;
            if (on && !horn.isPlaying) horn.Play();
            else if (!on && horn.isPlaying) horn.Stop();
        }

        AudioSource MakeSource(AudioClip clip, bool loop, float vol)
        {
            var s = gameObject.AddComponent<AudioSource>();
            s.clip = clip; s.loop = loop; s.volume = vol; s.spatialBlend = 1; s.minDistance = 4; s.maxDistance = 120; s.dopplerLevel = 0.6f;
            return s;
        }

        static AudioClip engineClip, hornClip;
        // a four-cylinder burble: firing pulses at 2x the crank rate, a few harmonics and a little roughness
        static AudioClip EngineClip()
        {
            if (engineClip != null) return engineClip;
            const int rate = 44100, n = rate; // one second, loops cleanly (whole cycles of every partial)
            var d = new float[n];
            var rnd = new System.Random(3);
            float lp = 0;
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)rate;
                double v = 0.55 * System.Math.Sin(2 * System.Math.PI * 50 * t) + 0.3 * System.Math.Sin(2 * System.Math.PI * 100 * t + 0.6)
                         + 0.16 * System.Math.Sin(2 * System.Math.PI * 150 * t + 1.1) + 0.09 * System.Math.Sin(2 * System.Math.PI * 25 * t + 0.3);
                lp += ((float)rnd.NextDouble() * 2 - 1 - lp) * 0.05f;
                d[i] = (float)(v * 0.5) + lp * 0.25f;
            }
            engineClip = AudioClip.Create("engine", n, 1, rate, false);
            engineClip.SetData(d, 0);
            return engineClip;
        }

        // a two-tone car horn (~ F# and A#, the usual pair), a buzzy square-ish wave
        static AudioClip HornClip()
        {
            if (hornClip != null) return hornClip;
            const int rate = 44100, n = rate / 2;
            var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)rate;
                double a = System.Math.Tanh(3 * System.Math.Sin(2 * System.Math.PI * 370 * t)), b = System.Math.Tanh(3 * System.Math.Sin(2 * System.Math.PI * 466 * t));
                d[i] = (float)((a + b) * 0.22);
            }
            hornClip = AudioClip.Create("horn", n, 1, rate, false);
            hornClip.SetData(d, 0);
            return hornClip;
        }

        void OnDestroy()
        {
            foreach (var t in new[] { baseTex, maskTex, coatTex, emitTex }) if (t != null) Destroy(t);
        }
    }
}
