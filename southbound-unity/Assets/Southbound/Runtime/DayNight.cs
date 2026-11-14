// Day and night: the sun and the moon where they really are over the upper Gulf Coast at the game's
// hour (Core/NightSky: latitude ~29.7 N, the season from the game day), so dawn comes up low in the
// east, noon is high, and the sun sets in the west with HDRP's physically based sky reddening it on the
// way down. At night the moon takes over the shadows, as bright as its phase, and the stars come out
// (PhotoLook's sky). Night (0 day .. 1 dark) is shared for street lights, windows and headlights.
using Southbound.Core;
using UnityEngine;

namespace Southbound
{
    [DefaultExecutionOrder(-50)]
    public sealed class DayNight : MonoBehaviour
    {
        public Light sun, moon;
        [Tooltip("Sunlight at the top of the atmosphere in lux; HDRP's sky dims and reddens it near the horizon.")]
        public float sunLux = 120000f;
        [Tooltip("A full moon's light in lux.")]
        public float moonLux = 0.35f;
        [Tooltip("Day of the year when the game starts (172 = midsummer).")]
        public int startDayOfYear = 172;
        [Tooltip("Map yaw of north in degrees (Unity +z = 0).")]
        public float north;

        /// <summary>0 in daylight, 1 in full night (civil twilight between).</summary>
        public static float Night { get; private set; }
        public static float SunElevation { get; private set; } = 45f;
        public static float MoonIllumination { get; private set; }

        void LateUpdate()
        {
            var game = SouthboundGame.Instance;
            double hour = game != null ? game.Profile.Hour : 14, day = game != null ? game.Profile.Day : 0;
            int doy = (int)((startDayOfYear + day) % 365);
            var (el, az) = NightSky.Sun(hour, doy);
            var (phase, lit) = NightSky.Moon(day + hour / 24.0);
            var (mel, maz) = NightSky.MoonPosition(hour, doy, phase);
            SunElevation = (float)el; MoonIllumination = (float)lit;
            Night = (float)NightSky.Night(el);
            if (sun != null)
            {
                Aim(sun, el, az);
                // fade out just below the horizon (the sky keeps glowing a while: twilight)
                float k = Mathf.Clamp01(((float)el + 3f) / 3f);
                sun.enabled = k > 0;
                sun.intensity = sunLux * k;
                sun.shadows = el > 0.5 ? LightShadows.Soft : LightShadows.None;
            }
            if (moon != null)
            {
                Aim(moon, mel, maz);
                float k = Mathf.Clamp01(((float)mel + 2f) / 4f) * (float)lit;
                moon.enabled = k > 0.01f;
                moon.intensity = moonLux * k;
                // one shadow-casting directional light at a time: the moon only once the sun is down
                moon.shadows = el < -2 && mel > 2 ? LightShadows.Soft : LightShadows.None;
            }
        }

        void Aim(Light l, double elevation, double azimuth) =>
            // a directional light shines along its forward: from the body toward the ground
            l.transform.rotation = Quaternion.Euler((float)elevation, (float)azimuth + 180f + north, 0f);
    }
}
