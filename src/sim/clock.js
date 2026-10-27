// Day/night clock and weather. Pure logic.
import { clamp, smoothstep } from '../core/math.js';

export const DAWN = 5 * 60 + 30;     // 05:30 first light, creatures retreat
export const MORNING = 6 * 60;       // 06:00 new day report
export const DUSK = 18 * 60 + 30;    // 18:30 sun low
export const NIGHT = 20 * 60;        // 20:00 night systems on
export const SHOP_OPEN = 6 * 60, SHOP_CLOSE = 20 * 60;

export function phaseOf(minute) {
  if (minute >= NIGHT || minute < DAWN) return 'night';
  if (minute < 7 * 60) return 'dawn';
  if (minute >= DUSK) return 'dusk';
  return 'day';
}
export const isNightTime = (m) => m >= NIGHT || m < DAWN;

// Sun elevation in radians-ish curve: sunrise ~6:15, sunset ~19:15
export function sunState(minute) {
  const t = (minute - 6.25 * 60) / ((19.25 - 6.25) * 60); // 0 at sunrise, 1 at sunset
  const elev = Math.sin(clamp(t, -0.25, 1.25) * Math.PI) * 0.95; // -..+
  const azim = -Math.PI * 0.5 + t * Math.PI;                       // east -> west
  return { t, elevation: elev, azimuth: azim };
}

// Ambient light level used by AI perception (0 dark .. 1 full day)
export function ambientLight(minute, weather) {
  const s = sunState(minute);
  let day = smoothstep(-0.12, 0.25, s.elevation);
  const moon = 0.07;
  let l = Math.max(moon, day);
  const w = weather?.current;
  if (w === 'overcast') l *= 0.8;
  if (w === 'rain') l *= 0.7;
  if (w === 'storm') l *= 0.55;
  if (w === 'fog') l *= 0.75;
  return l;
}

export const WEATHER_TYPES = {
  clear:    { name: 'Clear', fog: 0.0, rain: 0, cloud: 0.05, wind: 0.25, sightMul: 1.0 },
  overcast: { name: 'Overcast', fog: 0.15, rain: 0, cloud: 0.8, wind: 0.45, sightMul: 0.95 },
  rain:     { name: 'Rain', fog: 0.3, rain: 0.65, cloud: 0.95, wind: 0.55, sightMul: 0.8 },
  storm:    { name: 'Thunderstorm', fog: 0.4, rain: 1.0, cloud: 1.0, wind: 1.0, sightMul: 0.65 },
  fog:      { name: 'Fog', fog: 1.0, rain: 0, cloud: 0.6, wind: 0.1, sightMul: 0.55 },
};

const TRANSITIONS = {
  clear:    [['clear', 5], ['overcast', 3], ['fog', 1.2], ['rain', 1]],
  overcast: [['clear', 3], ['overcast', 2], ['rain', 3], ['storm', 1], ['fog', 1]],
  rain:     [['overcast', 3], ['rain', 1.5], ['storm', 1.2], ['clear', 1.5]],
  storm:    [['rain', 3], ['overcast', 2], ['clear', 1]],
  fog:      [['clear', 3], ['overcast', 2], ['fog', 0.8]],
};

export function rollWeather(rng, current) {
  const t = TRANSITIONS[current] || TRANSITIONS.clear;
  return rng.weighted(t.map(([v, w]) => ({ v, w })));
}

// advance weather; schedules a change every ~5-9 game hours
export function updateWeather(state, rng, dtMin) {
  const w = state.weather;
  w.blend = Math.min(1, (w.blend ?? 1) + dtMin / 45);
  const def = WEATHER_TYPES[w.current];
  // wetness rises with rain, dries in sun
  const dryRate = state.time.minute > 8 * 60 && state.time.minute < 18 * 60 ? 1 / 300 : 1 / 900;
  w.wetness = clamp((w.wetness || 0) + (def.rain > 0 ? def.rain * dtMin / 40 : -dtMin * dryRate), 0, 1);
  w.wind = def.wind;
  const m = state.time.minute;
  if (w.changeAt != null && crossed(w._lastMin ?? m, m, w.changeAt)) {
    w.prev = w.current;
    w.current = w.next || rollWeather(rng, w.current);
    w.next = rollWeather(rng, w.current);
    w.blend = 0;
    w.changeAt = (m + rng.int(300, 560)) % 1440;
  }
  w._lastMin = m;
}

export function crossed(prev, cur, mark) {
  if (prev === cur) return false;
  if (prev < cur) return prev < mark && cur >= mark;
  return prev < mark || cur >= mark; // wrapped midnight
}
