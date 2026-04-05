export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Flight {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  country: string;
  military: boolean;
  type?: string;
  description?: string;
  operator?: string;
}

const REGION_TTL = 120000;
const MIL_TTL = 45000;

const regionCache: Record<string, { data: Flight[]; ts: number }> = {};
let milCache: { data: Flight[]; ts: number } | null = null;

const REGIONS = [
  { key: 'na',     lat: 40,  lon: -100, radius: 250 },
  { key: 'europe', lat: 51,  lon: 10,   radius: 250 },
  { key: 'asia',   lat: 35,  lon: 120,  radius: 250 },
  { key: 'me',     lat: 25,  lon: 45,   radius: 250 },
  { key: 'sa',     lat: -15, lon: -55,  radius: 250 },
  { key: 'africa', lat: 5,   lon: 20,   radius: 250 },
];
let regionIdx = 0;

function parseCivilian(ac: Record<string, unknown>[]): Flight[] {
  return ac
    .filter(a => a.lat != null && a.lon != null)
    .map(a => ({
      id: String(a.hex || Math.random()),
      callsign: String(a.flight || '').trim() || 'UNKNOWN',
      lat: Number(a.lat),
      lng: Number(a.lon),
      altitude: Number(a.alt_baro || 0),
      country: String(a.ownOp || ''),
      military: false,
    }));
}

function parseMilitary(ac: Record<string, unknown>[]): Flight[] {
  return ac
    .filter(a => a.lat != null && a.lon != null)
    .map(a => ({
      id: String(a.hex || Math.random()),
      callsign: String(a.flight || '').trim() || String(a.r || 'MIL'),
      lat: Number(a.lat),
      lng: Number(a.lon),
      altitude: Number(a.alt_baro || 0),
      country: String(a.ownOp || ''),
      military: true,
      type: String(a.t || ''),
      description: String(a.desc || ''),
      operator: String(a.ownOp || ''),
    }));
}

export async function GET() {
  const now = Date.now();

  if (!milCache || now - milCache.ts > MIL_TTL) {
    try {
      const res = await fetch('https://api.airplanes.live/v2/mil', {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        milCache = { data: parseMilitary(data.ac || []), ts: now };
      }
    } catch { /* keep stale */ }
  }

  const region = REGIONS[regionIdx % REGIONS.length];
  regionIdx++;

  const regionStale = !regionCache[region.key] || now - regionCache[region.key].ts > REGION_TTL;
  if (regionStale) {
    try {
      const url = `https://api.airplanes.live/v2/point/${region.lat}/${region.lon}/${region.radius}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const parsed = parseCivilian(data.ac || []);
        regionCache[region.key] = { data: parsed.slice(0, 150), ts: now };
      }
    } catch { /* keep stale */ }
  }

  const seen = new Set<string>();
  const all: Flight[] = [];

  for (const r of REGIONS) {
    if (regionCache[r.key]) {
      for (const f of regionCache[r.key].data) {
        if (!seen.has(f.id)) { seen.add(f.id); all.push(f); }
      }
    }
  }

  for (const f of milCache?.data || []) {
    if (!seen.has(f.id)) { seen.add(f.id); all.push(f); }
  }

  return Response.json({ flights: all, total: all.length });
}
