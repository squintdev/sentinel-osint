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
    location: { streetName?: string; geographicName?: string; coordinates?: { latitude?: number; longitude?: number } };
    imageData?: { static?: { currentImageURL?: string } };
  };
}

async function fetchCaltrans(district: string, city: string): Promise<Camera[]> {
  const d = district.padStart(2, '0');
  const res = await fetch(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${d}.json`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const items: CaltransItem[] = json?.data?.cctv ?? [];
  return items.map((item, i) => {
    const cctv = item.cctv;
    const lat = cctv?.location?.coordinates?.latitude;
    const lng = cctv?.location?.coordinates?.longitude;
    const imageUrl = cctv?.imageData?.static?.currentImageURL;
    const name = cctv?.location?.streetName || cctv?.location?.geographicName || `CAM-${i}`;
    if (!lat || !lng || !imageUrl) return null;
    return { id: `caltrans-d${d}-${i}`, name, lat, lng, city, imageUrl, online: true } as Camera;
  }).filter((c): c is Camera => c !== null && !isNaN(c.lat) && !isNaN(c.lng));
}

async function fetchToronto(): Promise<Camera[]> {
  const res = await fetch('https://secure.toronto.ca/opendata/cart/traffic_cameras/v3?format=json', { cache: 'no-store' });
  if (!res.ok) return [];
  const items = await res.json();
  return (items as Array<{
    rec_id?: number | string; main?: string; side1?: string;
    lat?: number; lng?: number; latitude?: number; longitude?: number;
    url?: string; cameraUrl?: string;
  }>).map((item, i) => {
    const lat = item.lat ?? item.latitude;
    const lng = item.lng ?? item.longitude;
    const imageUrl = item.url ?? item.cameraUrl;
    const name = [item.main, item.side1].filter(Boolean).join(' @ ') || `CAM-${i}`;
    if (!lat || !lng || !imageUrl) return null;
    return { id: `toronto-${item.rec_id ?? i}`, name, lat, lng, city: 'Toronto', imageUrl, online: true } as Camera;
  }).filter((c): c is Camera => c !== null && !isNaN(c.lat) && !isNaN(c.lng));
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

  // Fetch traffic cams (short cache)
  if (!trafficCache || now - trafficCache.ts > TRAFFIC_TTL) {
    const [nyc, london, sf, la, toronto, sg] = await Promise.allSettled([
      fetchNYC(), fetchLondon(),
      fetchCaltrans('4', 'San Francisco'), fetchCaltrans('7', 'Los Angeles'),
      fetchToronto(), fetchSingapore(),
    ]);
    trafficCache = {
      ts: now,
      data: [
        ...(nyc.status === 'fulfilled' ? nyc.value : []),
        ...(london.status === 'fulfilled' ? london.value : []),
        ...(sf.status === 'fulfilled' ? sf.value : []),
        ...(la.status === 'fulfilled' ? la.value : []),
        ...(toronto.status === 'fulfilled' ? toronto.value : []),
        ...(sg.status === 'fulfilled' ? sg.value : []),
      ],
    };
  }

  // Fetch insecam cameras (long cache) — Middle East + Asia
  if (!insecamCache || now - insecamCache.ts > INSECAM_TTL) {
    try {
      const raw = await fetchInsecamRegion([
        // Middle East
        'IL', 'TR', 'LB', 'EG',
        // Asia
        'IN', 'TH', 'KR', 'JP', 'HK', 'ID', 'MY', 'TW', 'VN', 'CN',
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
