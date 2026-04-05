/**
 * Deterministic satellite orbit computation.
 * Satellite positions are a pure function of time, so we don't capture them —
 * both the live and playback routes compute from this catalog on demand.
 */

export interface Satellite { id: string; name: string; period: number; inclination: number; raan: number }

export const SATELLITES: Satellite[] = [
  { id: 'ISS', name: 'ISS (ZARYA)', period: 92.68, inclination: 51.6, raan: 0 },
  { id: 'HUBBLE', name: 'HST', period: 95.47, inclination: 28.5, raan: 60 },
  { id: 'CSS', name: 'CSS (TIANHE)', period: 91.56, inclination: 41.5, raan: 120 },
  { id: 'TERRA', name: 'TERRA', period: 98.88, inclination: 98.2, raan: 180 },
  { id: 'AQUA', name: 'AQUA', period: 98.82, inclination: 98.2, raan: 200 },
  { id: 'LANDSAT9', name: 'LANDSAT 9', period: 98.9, inclination: 98.2, raan: 220 },
  { id: 'NOAA18', name: 'NOAA 18', period: 102.1, inclination: 99.0, raan: 240 },
  { id: 'NOAA19', name: 'NOAA 19', period: 102.1, inclination: 99.1, raan: 260 },
  { id: 'GPS01', name: 'GPS BIIA-1', period: 718, inclination: 55.0, raan: 0 },
  { id: 'GPS02', name: 'GPS BIIA-2', period: 718, inclination: 55.0, raan: 60 },
  { id: 'GPS03', name: 'GPS BIIA-3', period: 718, inclination: 55.0, raan: 120 },
  { id: 'IRIDIUM1', name: 'IRIDIUM 33', period: 100.4, inclination: 86.4, raan: 30 },
  { id: 'IRIDIUM2', name: 'IRIDIUM 43', period: 100.4, inclination: 86.4, raan: 90 },
  { id: 'IRIDIUM3', name: 'IRIDIUM 63', period: 100.4, inclination: 86.4, raan: 150 },
  { id: 'STARLNK1', name: 'STARLINK-1', period: 95.5, inclination: 53.0, raan: 10 },
  { id: 'STARLNK2', name: 'STARLINK-2', period: 95.5, inclination: 53.0, raan: 70 },
  { id: 'STARLNK3', name: 'STARLINK-3', period: 95.5, inclination: 53.0, raan: 130 },
  { id: 'METEOR', name: 'METEOR M2', period: 101.3, inclination: 98.7, raan: 190 },
  { id: 'SUOMI', name: 'SUOMI NPP', period: 101.5, inclination: 98.7, raan: 210 },
  { id: 'SENTINEL2', name: 'SENTINEL-2A', period: 100.6, inclination: 98.6, raan: 230 },
  { id: 'SENTINEL3', name: 'SENTINEL-3A', period: 100.99, inclination: 98.65, raan: 250 },
  { id: 'CBERS', name: 'CBERS-4A', period: 97.9, inclination: 98.4, raan: 270 },
  { id: 'GOES16', name: 'GOES-16', period: 1436, inclination: 0.1, raan: 0 },
  { id: 'GOES18', name: 'GOES-18', period: 1436, inclination: 0.1, raan: 120 },
  { id: 'WORLDVIEW', name: 'WORLDVIEW-3', period: 97.0, inclination: 97.9, raan: 310 },
];

export function orbitToLatLng(periodMin: number, inclinationDeg: number, raanDeg: number, now: Date) {
  const t = now.getTime() / 1000;
  const periodSec = periodMin * 60;
  const meanMotion = (2 * Math.PI) / periodSec;
  const M = (meanMotion * t) % (2 * Math.PI);

  const inc = inclinationDeg * (Math.PI / 180);
  const raan = raanDeg * (Math.PI / 180);

  const u = M;
  const xOrb = Math.cos(u);
  const yOrb = Math.sin(u);

  const xECI = Math.cos(raan) * xOrb - Math.sin(raan) * Math.cos(inc) * yOrb;
  const yECI = Math.sin(raan) * xOrb + Math.cos(raan) * Math.cos(inc) * yOrb;
  const zECI = Math.sin(inc) * yOrb;

  const J2000 = 2451545.0;
  const JD = now.getTime() / 86400000 + 2440587.5;
  const gmst = (280.46061837 + 360.98564736629 * (JD - J2000)) * (Math.PI / 180);

  const xECEF = xECI * Math.cos(gmst) + yECI * Math.sin(gmst);
  const yECEF = -xECI * Math.sin(gmst) + yECI * Math.cos(gmst);
  const zECEF = zECI;

  const lat = Math.asin(zECEF) * (180 / Math.PI);
  const lng = Math.atan2(yECEF, xECEF) * (180 / Math.PI);

  return { lat, lng };
}

export function computeSatellites(at: Date) {
  return SATELLITES.map(sat => {
    const { lat, lng } = orbitToLatLng(sat.period, sat.inclination, sat.raan, at);
    return {
      id: sat.id,
      name: sat.name,
      lat,
      lng,
      altitude: sat.period < 200 ? 400 : sat.period < 500 ? 800 : 20200,
    };
  });
}
