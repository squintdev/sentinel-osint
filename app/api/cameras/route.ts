import { NextResponse } from 'next/server';
import { fetchInsecamRegion } from './insecam';

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  imageUrl: string;
  online: boolean;
}

// Traffic cameras: 5-minute cache
let trafficCache: { data: Camera[]; ts: number } | null = null;
const TRAFFIC_TTL = 5 * 60 * 1000;

// Insecam (open IP cams): 2-hour cache — scraping is heavy
let insecamCache: { data: Camera[]; ts: number } | null = null;
const INSECAM_TTL = 2 * 60 * 60 * 1000;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Traffic camera sources ───────────────────────────────────────────────────

async function fetchNYC(): Promise<Camera[]> {
  const res = await fetch('https://webcams.nyctmc.org/api/cameras', { cache: 'no-store' });
  if (!res.ok) return [];
  const items = await res.json();
  return (items as Array<{ id: string; name: string; latitude: string; longitude: string; isOnline: string }>)
    .filter(item => item.isOnline === 'true')
    .map(item => ({
      id: `nyc-${item.id}`,
      name: item.name,
      lat: parseFloat(item.latitude),
      lng: parseFloat(item.longitude),
      city: 'NYC',
      imageUrl: `https://webcams.nyctmc.org/api/cameras/${item.id}/image`,
      online: true,
    }))
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng));
}

async function fetchLondon(): Promise<Camera[]> {
  const res = await fetch('https://api.tfl.gov.uk/Place/Type/JamCam', { cache: 'no-store' });
  if (!res.ok) return [];
  const items = await res.json();
  return (items as Array<{
    id: string; commonName: string; lat: number; lon: number;
    additionalProperties: Array<{ key: string; value: string }>;
  }>)
    .filter(item => item.additionalProperties?.find(p => p.key === 'available')?.value === 'true')
    .map(item => {
      const imageUrl = item.additionalProperties?.find(p => p.key === 'imageUrl')?.value || '';
      return { id: `tfl-${item.id}`, name: item.commonName, lat: item.lat, lng: item.lon, city: 'London', imageUrl, online: true };
    })
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng) && Boolean(c.imageUrl));
}

interface CaltransItem {
  cctv: {
    location: { streetName?: string; locationName?: string; nearbyPlace?: string; longitude?: string; latitude?: string };
    imageData?: { static?: { currentImageURL?: string } };
    inService?: string;
  };
}

// Caltrans district JSON shape is: { data: [ { cctv: { location, imageData, inService } } ] }
// The old parser expected data.cctv (an object), which silently returned empty.
async function fetchCaltrans(district: string, city: string): Promise<Camera[]> {
  const d = district.padStart(2, '0');
  const res = await fetch(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${d}.json`, {
    cache: 'no-store',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const items: CaltransItem[] = Array.isArray(json?.data) ? json.data : [];
  return items.map((item, i) => {
    const cctv = item.cctv;
    if (cctv?.inService === 'false') return null;
    const lat = parseFloat(String(cctv?.location?.latitude ?? ''));
    const lng = parseFloat(String(cctv?.location?.longitude ?? ''));
    const imageUrl = cctv?.imageData?.static?.currentImageURL;
    const name = cctv?.location?.locationName || cctv?.location?.streetName || cctv?.location?.nearbyPlace || `CAM-${i}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !imageUrl) return null;
    return { id: `caltrans-d${d}-${i}`, name, lat, lng, city, imageUrl, online: true } as Camera;
  }).filter((c): c is Camera => c !== null);
}

interface TorontoFeature {
  properties: { _id: number; REC_ID: number; IMAGEURL: string; MAINROAD?: string; CROSSROAD?: string };
  geometry: { type: string; coordinates: number[] | number[][] };
}

async function fetchToronto(): Promise<Camera[]> {
  // New Toronto Open Data CKAN endpoint — old /opendata/cart/ URL 404s as of 2024.
  const url = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/a3309088-5fd4-4d34-8297-77c8301840ac/resource/4a568300-c7f8-496d-b150-dff6f5dc6d4f/download/traffic-camera-list-4326.geojson';
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const json = await res.json();
  const feats: TorontoFeature[] = json?.features ?? [];
  return feats.map((f, i) => {
    // Toronto uses MultiPoint geometry (coordinates = [[lng, lat]]); also handle Point.
    const coords = f.geometry?.coordinates;
    const point = Array.isArray(coords?.[0]) ? (coords[0] as number[]) : (coords as number[] | undefined);
    const lng = point?.[0];
    const lat = point?.[1];
    const img = f.properties?.IMAGEURL;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !img) return null;
    const name = [f.properties.MAINROAD, f.properties.CROSSROAD].filter(Boolean).join(' @ ') || `CAM-${i}`;
    return { id: `toronto-${f.properties.REC_ID}`, name, lat, lng, city: 'Toronto', imageUrl: img, online: true } as Camera;
  }).filter((c): c is Camera => c !== null);
}

// Nevada DOT: image URL pattern reverse-engineered from nvroads.com tooltip markup.
// mapIcons endpoint is public (no bot protection), returns all 644 NV cameras with
// lat/lng + itemId. Image served at /map/Cctv/{id} as a JPEG.
interface NvMapIconsResponse {
  item2: Array<{ itemId: string; location: [number, number]; title: string }>;
}

// DataTables-backed /List/GetData/Cameras endpoint used by nvroads.com and fl511.com.
// Server caps each page at 100 records, so we paginate in parallel. Returns a map of
// camera id → human-readable name (e.g. "US50 @ Sand Springs Summit"). The mapIcons
// endpoint has `title: ""` for every camera, so this is the only source of real names.
interface ListDataItem {
  id?: number | string;
  DT_RowId?: string;
  roadway?: string;
  direction?: string;
  location?: string;
  images?: Array<{ description?: string }>;
}
async function fetchListNames(baseUrl: string, totalExpected: number): Promise<Map<string, string>> {
  const pageSize = 100;
  const pageCount = Math.ceil(totalExpected / pageSize);
  // Unbounded parallelism triggers rate-limiting (40/47 failures on fl511). Batch
  // at concurrency 6: safe for both endpoints, ~10s for FL's 4700 cams.
  const concurrency = 6;
  const out = new Map<string, string>();
  const pages = Array.from({ length: pageCount }, (_, i) => i);
  for (let offset = 0; offset < pages.length; offset += concurrency) {
    const batch = pages.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(i =>
      fetch(`${baseUrl}/List/GetData/Cameras`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'User-Agent': UA,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Referer': `${baseUrl}/List/Cameras`,
        },
        body: `draw=${i + 1}&start=${i * pageSize}&length=${pageSize}`,
        signal: AbortSignal.timeout(12000),
      }).then(r => r.ok ? r.json() : null)
    ));
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const items: ListDataItem[] = r.value?.data ?? [];
      for (const it of items) {
        const id = String(it.id ?? it.DT_RowId ?? '');
        if (!id) continue;
        // `roadway` is the cleanest human label ("I-15 @ Sahara", "US50 @ Sand Springs Summit").
        // `description` (images[0]) sometimes has cross-street detail; fall back to it when
        // roadway is blank. Append direction when not already present.
        const roadway = (it.roadway || '').trim();
        const description = (it.images?.[0]?.description || '').trim();
        const direction = (it.direction || '').trim();
        let name = roadway || description;
        if (name && direction && direction !== 'Unknown' && !name.toLowerCase().includes(direction.toLowerCase())) {
          name = `${name} ${direction}`;
        }
        if (name) out.set(id, name);
      }
    }
  }
  return out;
}

function cityForNevada(lat: number, lng: number): string {
  if (lat >= 39.4 && lat <= 39.75 && lng >= -120.1 && lng <= -119.6) return 'Reno';
  if (lat >= 35.9 && lat <= 36.35 && lng >= -115.5 && lng <= -114.9) return 'Las Vegas';
  if (lat >= 39.1 && lat <= 39.25 && lng >= -119.85 && lng <= -119.65) return 'Carson City';
  if (lat >= 38.95 && lat <= 39.35 && lng >= -120.2 && lng <= -119.85) return 'Lake Tahoe';
  return 'Nevada';
}

async function fetchNevada(): Promise<Camera[]> {
  const res = await fetch('https://www.nvroads.com/map/mapIcons/Cameras', {
    cache: 'no-store',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as NvMapIconsResponse;
  const items = json?.item2 ?? [];
  // Enrich in parallel with real names from the List endpoint. If this fails,
  // we still return cameras — just with the NV-CAM-{id} fallback.
  const names = await fetchListNames('https://www.nvroads.com', items.length).catch(() => new Map<string, string>());
  return items
    .map(c => {
      const [lat, lng] = c.location ?? [NaN, NaN];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: `ndot-${c.itemId}`,
        name: names.get(c.itemId) || c.title || `NV-CAM-${c.itemId}`,
        lat,
        lng,
        city: cityForNevada(lat, lng),
        imageUrl: `https://www.nvroads.com/map/Cctv/${c.itemId}`,
        online: true,
      } as Camera;
    })
    .filter((c): c is Camera => c !== null);
}

// Florida DOT: same GoLive Traffic platform as Nevada. Discovered by probing
// /map/mapIcons/Cameras on fl511.com. 4695 cameras statewide.
function cityForFlorida(lat: number, lng: number): string {
  if (lat >= 25.4 && lat <= 26.0 && lng >= -80.55 && lng <= -80.1) return 'Miami';
  if (lat >= 26.0 && lat <= 26.5 && lng >= -80.35 && lng <= -80.05) return 'Fort Lauderdale';
  if (lat >= 26.5 && lat <= 26.9 && lng >= -80.15 && lng <= -80.0) return 'West Palm Beach';
  if (lat >= 28.3 && lat <= 28.75 && lng >= -81.6 && lng <= -81.1) return 'Orlando';
  if (lat >= 27.75 && lat <= 28.1 && lng >= -82.75 && lng <= -82.2) return 'Tampa';
  if (lat >= 30.15 && lat <= 30.5 && lng >= -81.95 && lng <= -81.35) return 'Jacksonville';
  if (lat >= 30.3 && lat <= 30.55 && lng >= -84.45 && lng <= -84.15) return 'Tallahassee';
  return 'Florida';
}

async function fetchFlorida(): Promise<Camera[]> {
  const res = await fetch('https://fl511.com/map/mapIcons/Cameras', {
    cache: 'no-store',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as NvMapIconsResponse;
  const items = json?.item2 ?? [];
  // FL has ~4700 cameras → ~47 parallel list requests. Cached 5 min at call site.
  const names = await fetchListNames('https://fl511.com', items.length).catch(() => new Map<string, string>());
  return items
    .map(c => {
      const [lat, lng] = c.location ?? [NaN, NaN];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: `fdot-${c.itemId}`,
        name: names.get(c.itemId) || c.title || `FL-CAM-${c.itemId}`,
        lat,
        lng,
        city: cityForFlorida(lat, lng),
        imageUrl: `https://fl511.com/map/Cctv/${c.itemId}`,
        online: true,
      } as Camera;
    })
    .filter((c): c is Camera => c !== null);
}

async function fetchSingapore(): Promise<Camera[]> {
  const res = await fetch('https://api.data.gov.sg/v1/transport/traffic-images', { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const cameras: Array<{ camera_id: string; image: string; location: { latitude: number; longitude: number } }> =
    json?.items?.[0]?.cameras ?? [];
  return cameras
    .filter(c => c.image && c.location?.latitude && c.location?.longitude)
    .map(c => ({
      id: `sg-${c.camera_id}`,
      name: `SG-${c.camera_id}`,
      lat: c.location.latitude,
      lng: c.location.longitude,
      city: 'Singapore',
      imageUrl: c.image,
      online: true,
    }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();

  // Fetch traffic cams (short cache). Caltrans returns 500 intermittently per district,
  // so request several and use Promise.allSettled to survive partial failures.
  if (!trafficCache || now - trafficCache.ts > TRAFFIC_TTL) {
    const results = await Promise.allSettled([
      fetchNYC(),
      fetchLondon(),
      fetchCaltrans('4', 'San Francisco'),
      fetchCaltrans('7', 'Los Angeles'),
      fetchCaltrans('3', 'Sacramento / Truckee'),
      fetchCaltrans('11', 'San Diego'),
      fetchCaltrans('12', 'Orange County'),
      fetchNevada(),
      fetchFlorida(),
      fetchToronto(),
      fetchSingapore(),
    ]);
    trafficCache = {
      ts: now,
      data: results.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    };
  }

  // Fetch insecam cameras (long cache) — priority countries user asked for.
  // No TR/LB/EG/IN/TH/JP/HK/ID/MY/VN (dropped from prior set — not in priorities).
  if (!insecamCache || now - insecamCache.ts > INSECAM_TTL) {
    try {
      const raw = await fetchInsecamRegion([
        // Priority non-US countries
        'MX', 'CA', 'FR', 'DE', 'CN', 'IR', 'IL', 'IQ', 'SA', 'AE', 'TW', 'KR',
      ]);
      insecamCache = {
        ts: now,
        data: raw.map(c => ({
          id: c.id,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          city: c.city,
          imageUrl: c.imageUrl,
          online: c.online,
        })),
      };
    } catch {
      insecamCache = { ts: now, data: [] };
    }
  }

  return NextResponse.json({
    cameras: [...(trafficCache?.data ?? []), ...(insecamCache?.data ?? [])],
  });
}
