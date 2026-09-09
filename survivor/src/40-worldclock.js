/* ============================================================
   WORLD CLOCK — a forty-minute day with a real sun in it.

   Twenty minutes of daylight and twenty of dark, as the design
   asks, which makes one game-day 2400 real seconds and time run
   at 36x. Everything downstream is handed *simulated* seconds, so
   a body dehydrates over game-days rather than over an afternoon
   of playing.

   The sun itself is not a rotating light. Declination, hour angle,
   elevation and azimuth are computed properly, so shadows point
   where they should, the sun climbs higher in summer than in
   winter, and the light at 05:30 is the low orange light it
   actually is. The equal day and night the design specifies is the
   equinox case, and turning on `seasonalDayLength` gives the real
   thing instead — long summer evenings and dark winter afternoons.
   ============================================================ */

const SEASON = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };

/* Solar declination, degrees. Cooper's equation — the standard
   approximation, good to well under half a degree. */
function solarDeclination(dayOfYear) {
  return 23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
}

/* Sun elevation and azimuth for a latitude, day and solar hour.
   Azimuth is measured clockwise from north, which is the convention every
   compass in the game will use. */
function solarPosition(latitudeDeg, dayOfYear, solarHour) {
  const rad = Math.PI / 180;
  const phi = latitudeDeg * rad;
  const dec = solarDeclination(dayOfYear) * rad;
  const H = (solarHour - 12) * 15 * rad;

  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const altitude = Math.asin(clampTo(sinAlt, -1, 1));

  const cosAz = (Math.sin(dec) - Math.sin(altitude) * Math.sin(phi))
    / Math.max(Math.cos(altitude) * Math.cos(phi), 1e-9);
  let azimuth = Math.acos(clampTo(cosAz, -1, 1));
  if (H > 0) azimuth = 2 * Math.PI - azimuth;    // afternoon: sun is west of south

  return {
    altitudeDeg: altitude / rad,
    azimuthDeg: azimuth / rad,
    // Unit vector toward the sun, in the engine's Y-up, Z-north frame.
    direction: {
      x: Math.cos(altitude) * Math.sin(azimuth),
      y: Math.sin(altitude),
      z: Math.cos(altitude) * Math.cos(azimuth),
    },
  };
}

/* Sunrise and sunset in solar hours, from the hour angle at which the sun
   crosses the horizon. Returns null inside a polar day or night. */
function daylightHours(latitudeDeg, dayOfYear) {
  const rad = Math.PI / 180;
  const phi = latitudeDeg * rad;
  const dec = solarDeclination(dayOfYear) * rad;
  const cosH = -Math.tan(phi) * Math.tan(dec);
  if (cosH <= -1) return { sunrise: 0, sunset: 24, length: 24 };   // midnight sun
  if (cosH >= 1) return { sunrise: 12, sunset: 12, length: 0 };    // polar night
  const H = Math.acos(cosH) / rad / 15;
  return { sunrise: 12 - H, sunset: 12 + H, length: 2 * H };
}


class WorldClock {
  constructor(opts = {}) {
    /* One game-day in real seconds. The design says forty minutes, split
       evenly, so daylight and darkness are twenty minutes each. */
    this.dayLengthRealS = opts.dayLengthRealS != null ? opts.dayLengthRealS : 2400;
    this.timeScale = 86400 / this.dayLengthRealS;      // 36x at the default

    this.latitudeDeg = opts.latitudeDeg != null ? opts.latitudeDeg : 30.3;   // Dallas-ish
    this.longitudeDeg = opts.longitudeDeg != null ? opts.longitudeDeg : -96.8;
    /* With this off, the sun is put on an equinox path all year, so day and
       night stay at exactly twenty minutes each as the design specifies.
       With it on, day length varies through the year the way it really
       does at this latitude — about ten hours in December and fourteen in
       June. */
    this.seasonalDayLength = !!opts.seasonalDayLength;

    this.simSeconds = opts.startSeconds != null ? opts.startSeconds : 6.5 * 3600;
    this.dayOfYear = opts.startDayOfYear != null ? opts.startDayOfYear : 135;   // mid-May
    this.year = 1;
    this.totalDays = 0;

    this.weather = new Weather(Object.assign({ latitudeDeg: this.latitudeDeg }, opts.weather));
    this.rng = opts.rng || Math.random;
  }

  /* Advance by real seconds; everything else in the game is fed the
     simulated seconds this returns. */
  tick(realSeconds) {
    const sim = realSeconds * this.timeScale;
    this.simSeconds += sim;
    while (this.simSeconds >= 86400) {
      this.simSeconds -= 86400;
      this.dayOfYear++;
      this.totalDays++;
      if (this.dayOfYear > 365) { this.dayOfYear = 1; this.year++; }
    }
    this.weather.step(sim / 86400, this);
    return sim;
  }

  get hourOfDay() { return this.simSeconds / 3600; }
  get effectiveDayOfYear() { return this.seasonalDayLength ? this.dayOfYear : 80; }  // 80 = equinox

  get season() {
    const d = this.dayOfYear;
    if (d < 80 || d >= 355) return SEASON.winter;
    if (d < 172) return SEASON.spring;
    if (d < 266) return SEASON.summer;
    return SEASON.autumn;
  }

  sun() { return solarPosition(this.latitudeDeg, this.effectiveDayOfYear, this.hourOfDay); }
  daylight() { return daylightHours(this.latitudeDeg, this.effectiveDayOfYear); }

  /* Ambient light, 0 to 1. Not a step at sunset: civil twilight is a real
     and useful amount of light, and the deer know it even if the player
     does not yet. */
  lightLevel() {
    const alt = this.sun().altitudeDeg;
    if (alt > 5) return 1;
    if (alt > -0.83) return 0.45 + 0.55 * ramp(alt, -0.83, 5);   // sunrise/sunset band
    if (alt > -6) return 0.16 + 0.29 * ramp(alt, -6, -0.83);     // civil twilight
    if (alt > -12) return 0.05 + 0.11 * ramp(alt, -12, -6);      // nautical twilight
    // Full dark, lit by the moon. A full moon is enough to walk by; a new
    // moon is not, and that changes what you can do with a night.
    return 0.012 + 0.09 * this.moonIllumination() * (1 - this.weather.cloudCover * 0.85);
  }

  /* Synodic month is 29.53 days. Phase drives night light and, through it,
     what is moving around out there. */
  /* The moon starts near full, so the first night of a new world is one you
     can walk in, and darkens over the fortnight after — which is long
     enough for the player to have learned what a dark night costs before
     they get one. */
  moonPhase() { return ((this.totalDays + 12) % 29.53) / 29.53; }
  moonIllumination() { return (1 - Math.cos(2 * Math.PI * this.moonPhase())) / 2; }

  /* The named periods the animals key off. */
  get period() {
    const alt = this.sun().altitudeDeg;
    const rising = this.hourOfDay < 12;
    if (alt > 10) return 'day';
    if (alt > -6) return rising ? 'dawn' : 'dusk';
    return 'night';
  }

  /* Everything downstream needs at once. */
  environment(opts = {}) {
    const w = this.weather;
    const altitudeM = opts.altitudeM || 0;
    return {
      hourOfDay: this.hourOfDay,
      dayOfYear: this.dayOfYear,
      totalDays: this.totalDays,
      season: this.season,
      period: this.period,
      light: this.lightLevel(),
      sun: this.sun(),
      moonIllumination: this.moonIllumination(),
      // Air cools about 6.5 C per kilometre of altitude, so the hills are
      // genuinely colder than the beach.
      airTempC: w.temperatureAt(this.hourOfDay, this) - altitudeM * 0.0065,
      humidity: w.humidity,
      windMs: w.windMs,
      windDirX: Math.sin(w.windDirRad),
      windDirZ: Math.cos(w.windDirRad),
      precipitation: w.precipitation,
      precipitationType: w.precipitationType,
      cloudCover: w.cloudCover,
      pressurePa: w.pressurePa,
      pressureTrend: w.pressureTrend,
      fog: w.fog,
      thunder: w.thunder,
    };
  }

  serialize() {
    return {
      simSeconds: this.simSeconds, dayOfYear: this.dayOfYear, year: this.year,
      totalDays: this.totalDays, weather: this.weather.serialize(),
    };
  }
  restore(d) {
    Object.assign(this, {
      simSeconds: d.simSeconds, dayOfYear: d.dayOfYear, year: d.year, totalDays: d.totalDays,
    });
    this.weather.restore(d.weather);
    return this;
  }
}


/* ------------------------------------------------------------------
   WEATHER — pressure systems that move through, rather than dice.

   A front approaches, the glass falls, the wind backs and freshens,
   it rains, the front passes, the wind veers and the pressure comes
   back up. That sequence is worth having because the fish respond to
   it, the animals bed down ahead of it, and the player can learn to
   read it — which is a survival skill in the same sense as any other
   in this game.
   ------------------------------------------------------------------ */
class Weather {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.latitudeDeg = opts.latitudeDeg != null ? opts.latitudeDeg : 30.3;

    this.pressurePa = 101325;
    this.pressureTrend = 0;          // Pa per hour, negative before a front
    this.cloudCover = 0.25;
    this.humidity = 0.6;
    this.windMs = 3;
    this.windDirRad = this.rng() * Math.PI * 2;
    this.windGustMs = 0;
    this.precipitation = 0;          // mm/h
    this.precipitationType = 'none'; // rain | sleet | snow | hail
    this.fog = 0;
    this.thunder = false;

    // The current system, and how far through it we are.
    this.system = { kind: 'fair', hours: 0, durationH: 36, strength: 0.4 };
    this._tempNoise = 0;
  }

  /* Mean daily temperature for this latitude and day of year. A simple
     seasonal sinusoid with an amplitude that grows with latitude, which is
     why the tropics have one temperature and the north has four. */
  seasonalMeanC(dayOfYear) {
    const annualMean = 27 - Math.abs(this.latitudeDeg) * 0.42;
    const amplitude = 2 + Math.abs(this.latitudeDeg) * 0.36;
    const hemisphere = this.latitudeDeg >= 0 ? 1 : -1;
    // Warmest around day 200 in the north, coldest around day 20.
    return annualMean + hemisphere * amplitude * Math.sin((2 * Math.PI * (dayOfYear - 110)) / 365);
  }

  /* Air temperature now. The diurnal curve is not a sine about noon: the
     minimum is just before sunrise and the maximum is two to three hours
     after solar noon, because the ground keeps gaining heat after the sun
     has passed its peak. Getting this right is why dawn is the cold part of
     the night rather than midnight. */
  temperatureAt(hourOfDay, clock) {
    const mean = this.seasonalMeanC(clock ? clock.dayOfYear : 180);
    const dl = clock ? clock.daylight() : { sunrise: 6, sunset: 18 };
    const swing = (7 + 6 * (1 - this.cloudCover)) * 0.5;   // clear nights fall further

    let phase;
    if (hourOfDay < dl.sunrise) {
      // Still cooling all through the small hours. The coldest moment of the
      // night is the one just before the sun comes up, not midnight — the
      // ground has been radiating heat away the whole time and has not had
      // any back yet.
      phase = -0.6 - 0.4 * (hourOfDay / Math.max(dl.sunrise, 1e-6));
    } else if (hourOfDay < dl.sunset) {
      const peak = Math.min(dl.sunset - 0.5, 12 + 2.5);
      phase = hourOfDay < peak
        ? -0.85 + 1.85 * ramp(hourOfDay, dl.sunrise, peak)
        : 1 - 1.2 * ramp(hourOfDay, peak, dl.sunset);
    } else {
      phase = -0.2 - 0.8 * ramp(hourOfDay, dl.sunset, 24 + dl.sunrise);
    }

    return mean + phase * swing
      + this._tempNoise
      - this.precipitation * 0.25              // rain cools the air
      - (this.system.kind === 'cold front' ? 6 * this.system.strength : 0)
      + (this.system.kind === 'heat' ? 8 * this.system.strength : 0);
  }

  step(days, clock) {
    const hours = days * 24;
    this.system.hours += hours;

    if (this.system.hours >= this.system.durationH) this._nextSystem(clock);

    const t = clamp01(this.system.hours / this.system.durationH);
    const s = this.system.strength;

    // Where we are inside the system: rising into it, at its worst, and
    // clearing behind it.
    const arc = Math.sin(t * Math.PI);

    let targetCloud, targetPrecip, targetWind, targetPressure, targetHumidity;
    switch (this.system.kind) {
      case 'fair':
        targetCloud = 0.12 * s; targetPrecip = 0; targetWind = 1.5 + 3 * s;
        targetPressure = 102200; targetHumidity = 0.45;
        break;
      case 'overcast':
        targetCloud = 0.85; targetPrecip = 0; targetWind = 2 + 4 * s;
        targetPressure = 101100; targetHumidity = 0.72;
        break;
      case 'rain':
        targetCloud = 0.95; targetPrecip = 6 * s * arc; targetWind = 3 + 7 * s;
        targetPressure = 100400 - 700 * s * arc; targetHumidity = 0.93;
        break;
      case 'storm':
        targetCloud = 1.0; targetPrecip = 22 * s * arc; targetWind = 9 + 18 * s * arc;
        targetPressure = 99200 - 1800 * s * arc; targetHumidity = 0.97;
        break;
      case 'cold front':
        targetCloud = 0.7 * arc + 0.15; targetPrecip = 9 * s * arc; targetWind = 6 + 12 * s * arc;
        targetPressure = 100600 + 1800 * t; targetHumidity = 0.8 - 0.3 * t;
        break;
      case 'heat':
        targetCloud = 0.08; targetPrecip = 0; targetWind = 1 + 2 * s;
        targetPressure = 101900; targetHumidity = 0.3;
        break;
      case 'fogbank':
        targetCloud = 0.5; targetPrecip = 0.2; targetWind = 0.4;
        targetPressure = 101600; targetHumidity = 0.99;
        break;
      default:
        targetCloud = 0.3; targetPrecip = 0; targetWind = 3;
        targetPressure = 101325; targetHumidity = 0.6;
    }

    const k = clamp01(hours / 1.5);
    const prevPressure = this.pressurePa;
    this.cloudCover = lerpN(this.cloudCover, targetCloud, k);
    this.precipitation = lerpN(this.precipitation, targetPrecip, k);
    this.windMs = Math.max(0, lerpN(this.windMs, targetWind, k));
    this.pressurePa = lerpN(this.pressurePa, targetPressure, k * 0.6);
    this.humidity = clamp01(lerpN(this.humidity, targetHumidity, k));
    this.pressureTrend = hours > 0 ? (this.pressurePa - prevPressure) / hours : 0;

    // Wind backs ahead of a front and veers behind it, which is the oldest
    // forecast there is and works.
    const veer = this.system.kind === 'cold front' ? (t < 0.5 ? -0.35 : 0.5) : 0.06;
    this.windDirRad = (this.windDirRad + veer * hours * 0.1
      + (this.rng() - 0.5) * hours * 0.05 + Math.PI * 2) % (Math.PI * 2);
    this.windGustMs = this.windMs * (1 + 0.5 * this.rng() * s);

    // Snow rather than rain when it is cold enough, sleet in between.
    const temp = clock ? this.temperatureAt(clock.hourOfDay, clock) : 15;
    this.precipitationType = this.precipitation < 0.05 ? 'none'
      : temp < -1 ? 'snow' : temp < 2 ? 'sleet'
      : (this.system.kind === 'storm' && this.rng() < 0.06) ? 'hail' : 'rain';

    this.thunder = this.system.kind === 'storm' && arc > 0.4;

    /* Radiation fog forms on clear, calm, humid nights and burns off after
       sunrise — which is exactly when the deer are moving, and exactly when
       you cannot see them. */
    const night = clock ? clock.lightLevel() < 0.2 : false;
    const fogForms = night && this.windMs < 2.2 && this.humidity > 0.88 && this.cloudCover < 0.4;
    this.fog = clamp01(this.fog + (fogForms ? hours * 0.7 : -hours * 0.9));
    if (this.system.kind === 'fogbank') this.fog = clamp01(Math.max(this.fog, arc));

    this._tempNoise += (this.rng() - 0.5) * hours * 0.6;
    this._tempNoise = clampTo(this._tempNoise * Math.pow(0.85, hours), -3.5, 3.5);
  }

  _nextSystem(clock) {
    const season = clock ? clock.season : SEASON.summer;
    // Weighted by season, and by what just happened: fair weather usually
    // follows a front, and storms rarely arrive out of a clear sky.
    const table = {
      [SEASON.spring]: { fair: 30, overcast: 20, rain: 22, storm: 12, 'cold front': 12, fogbank: 4, heat: 0 },
      [SEASON.summer]: { fair: 38, overcast: 14, rain: 16, storm: 14, 'cold front': 6, fogbank: 2, heat: 10 },
      [SEASON.autumn]: { fair: 28, overcast: 24, rain: 22, storm: 8, 'cold front': 14, fogbank: 4, heat: 0 },
      [SEASON.winter]: { fair: 26, overcast: 28, rain: 18, storm: 6, 'cold front': 18, fogbank: 4, heat: 0 },
    }[season];

    const weights = Object.assign({}, table);
    if (this.system.kind === 'storm' || this.system.kind === 'cold front') weights.fair *= 3;
    if (this.system.kind === 'fair') weights.storm *= 0.4;

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = this.rng() * total, kind = 'fair';
    for (const [k, w] of Object.entries(weights)) { roll -= w; if (roll <= 0) { kind = k; break; } }

    const duration = { fair: [18, 60], overcast: [8, 30], rain: [3, 14], storm: [1.5, 6],
      'cold front': [4, 12], heat: [24, 96], fogbank: [3, 9] }[kind] || [12, 24];
    this.system = {
      kind, hours: 0,
      durationH: lerpN(duration[0], duration[1], this.rng()),
      strength: 0.35 + this.rng() * 0.65,
    };
  }

  /* Human-readable, for the HUD and for the player learning to read it. */
  describe() {
    const trend = this.pressureTrend < -40 ? 'falling fast'
      : this.pressureTrend < -12 ? 'falling'
      : this.pressureTrend > 40 ? 'rising fast'
      : this.pressureTrend > 12 ? 'rising' : 'steady';
    const sky = this.fog > 0.5 ? 'fog'
      : this.precipitation > 12 ? `heavy ${this.precipitationType}`
      : this.precipitation > 1.5 ? this.precipitationType
      : this.precipitation > 0.05 ? `light ${this.precipitationType}`
      : this.cloudCover > 0.85 ? 'overcast'
      : this.cloudCover > 0.4 ? 'broken cloud' : 'clear';
    const wind = this.windMs < 1.5 ? 'calm'
      : this.windMs < 5 ? 'light wind'
      : this.windMs < 11 ? 'fresh wind' : 'gale';
    return { sky, wind, trend, thunder: this.thunder };
  }

  serialize() {
    return {
      pressurePa: this.pressurePa, cloudCover: this.cloudCover, humidity: this.humidity,
      windMs: this.windMs, windDirRad: this.windDirRad, precipitation: this.precipitation,
      fog: this.fog, system: Object.assign({}, this.system),
    };
  }
  restore(d) { if (d) Object.assign(this, d, { system: Object.assign({}, d.system) }); return this; }
}
