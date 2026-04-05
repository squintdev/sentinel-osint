/**
 * Flight positions from two sources:
 *  - OpenSky /states/all: global civilian ADS-B feed (~10k aircraft per call).
 *    Anonymous rate limit is 1 req per 10s, we cache for 20s.
 *  - airplanes.live /v2/mil: military aircraft with type/operator metadata.
 *    Called once per 60s — rich metadata that OpenSky doesn't expose.
 *
 * Military flights from /v2/mil override OpenSky entries on matching ICAO hex.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Flight {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;      // always feet (OpenSky meters are converted)
  speed?: number;        // knots
  heading?: number;      // degrees 0-360
  squawk?: string;
  country: string;
  military: boolean;
  type?: string;
  description?: string;
  operator?: string;
}

const METERS_TO_FEET = 3.28084;
const MPS_TO_KNOTS = 1.94384;

const CIV_TTL = 20_000;
const MIL_TTL = 60_000;
const MAX_FLIGHTS = 1500;

// Military callsign prefixes — fallback tagging for civilians that clearly
// look military but weren't in /v2/mil (different feed).
const MIL_PREFIXES = [
  'RCH', 'RRR', 'JAKE', 'DUKE', 'FORTE', 'EMARSS', 'NAVY', 'CNV', 'GHOST',
  'SHADO', 'ANVIL', 'LOBO', 'HUNTR', 'SPAR', 'SAM', 'VADER', 'DRAGN',
  'BISON', 'RAVEN', 'REACH', 'CONVOY',
];

function isMilitaryCallsign(cs: string): boolean {
  return cs ? MIL_PREFIXES.some(p => cs.startsWith(p)) : false;
}

let civCache: { data: Flight[]; ts: number } | null = null;
let milCache: { data: Flight[]; ts: number } | null = null;

async function fetchCivilian(): Promise<Flight[]> {
  const res = await fetch('https://opensky-network.org/api/states/all', {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`opensky ${res.status}`);
  const data = await res.json();
  const states = (data.states || []) as unknown[][];
  const flights: Flight[] = [];
  // State vector indices:
  // [0]=icao24 [1]=callsign [2]=country [5]=lng [6]=lat [7]=baro_alt_m
  // [8]=on_ground [9]=velocity_mps [10]=true_track [13]=geo_alt_m [14]=squawk
  for (const s of states) {
    const lng = s[5] as number | null;
    const lat = s[6] as number | null;
    if (lat == null || lng == null) continue;
    if (s[8]) continue; // skip on-ground
    const callsign = String(s[1] || '').trim().toUpperCase() || 'UNKNOWN';
    const altM = (s[13] as number | null) ?? (s[7] as number | null);
    const velMps = s[9] as number | null;
    const track = s[10] as number | null;
    const squawk = s[14] as string | null;
    flights.push({
      id: String(s[0]),
      callsign,
      lat,
      lng,
      altitude: altM != null ? Math.round(altM * METERS_TO_FEET) : 0,
      speed: velMps != null ? Math.round(velMps * MPS_TO_KNOTS) : undefined,
      heading: track != null ? track : undefined,
      squawk: squawk || undefined,
      country: String(s[2] || ''),
      military: isMilitaryCallsign(callsign),
    });
  }
  return flights;
}

async function fetchMilitary(): Promise<Flight[]> {
  const res = await fetch('https://api.airplanes.live/v2/mil', {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`airplanes.live ${res.status}`);
  const data = await res.json();
  const ac = (data.ac || []) as Array<Record<string, unknown>>;
  return ac
    .filter(a => a.lat != null && a.lon != null)
    .map(a => {
      const altBaro = Number(a.alt_baro);
      const gs = Number(a.gs);
      const track = Number(a.track);
      return {
        id: String(a.hex || Math.random()),
        callsign: String(a.flight || '').trim() || String(a.r || 'MIL'),
        lat: Number(a.lat),
        lng: Number(a.lon),
        // airplanes.live alt_baro is already in feet
        altitude: Number.isFinite(altBaro) ? Math.round(altBaro) : 0,
        speed: Number.isFinite(gs) ? Math.round(gs) : undefined,
        heading: Number.isFinite(track) ? track : undefined,
        squawk: a.squawk ? String(a.squawk) : undefined,
        country: String(a.ownOp || ''),
        military: true,
        type: String(a.t || ''),
        description: String(a.desc || ''),
        operator: String(a.ownOp || ''),
      };
    });
}

export async function GET() {
  const now = Date.now();

  const refreshes: Promise<void>[] = [];
  if (!civCache || now - civCache.ts > CIV_TTL) {
    refreshes.push(
      fetchCivilian()
        .then(d => { civCache = { data: d, ts: now }; })
        .catch(() => { /* keep stale */ })
    );
  }
  if (!milCache || now - milCache.ts > MIL_TTL) {
    refreshes.push(
      fetchMilitary()
        .then(d => { milCache = { data: d, ts: now }; })
        .catch(() => { /* keep stale */ })
    );
  }
  if (refreshes.length) await Promise.all(refreshes);

  const military = milCache?.data ?? [];
  const milHexes = new Set(military.map(f => f.id));
  const civilian = (civCache?.data ?? []).filter(f => !milHexes.has(f.id));
  const all = [...military, ...civilian].slice(0, MAX_FLIGHTS);

  return Response.json({ flights: all, total: all.length });
}
