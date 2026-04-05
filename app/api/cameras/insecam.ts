// Insecam scraper — indexes open/unsecured IP cameras via Shodan
// Used for Middle East + Asia coverage where no official open APIs exist
// Cache: 2 hours (feeds change slowly)

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface InsecamCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  imageUrl: string;
  online: boolean;
}

// Extract camera IDs from insecam country listing page
async function getCameraIds(countryCode: string): Promise<string[]> {
  const res = await fetch(`http://www.insecam.org/en/bycountry/${countryCode}/`, {
    cache: 'no-store',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const seen: Record<string, boolean> = {};
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\/en\/view\/(\d+)\//g;
  while ((m = re.exec(html)) !== null) {
    if (!seen[m[1]]) { seen[m[1]] = true; ids.push(m[1]); }
  }
  return ids;
}

// Scrape a single camera page for the stream URL
async function getCameraStream(id: string): Promise<{ streamUrl: string; ip: string } | null> {
  const res = await fetch(`http://www.insecam.org/en/view/${id}/`, {
    cache: 'no-store',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Extract from: imageurls[0] = new String("http://...");
  const match = html.match(/imageurls\[0\]\s*=\s*new String\("([^"]+)"\)/);
  if (!match) return null;

  const streamUrl = match[1];
  const ipMatch = streamUrl.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/);
  if (!ipMatch) return null;

  return { streamUrl, ip: ipMatch[1] };
}

interface GeoResult {
  status: string;
  lat?: number;
  lon?: number;
  city?: string;
  country?: string;
}

// Batch GeoIP lookup via ip-api.com (free, 45 req/min, 100 IPs per batch)
async function batchGeoIp(ips: string[]): Promise<GeoResult[]> {
  if (ips.length === 0) return [];
  const res = await fetch('http://ip-api.com/batch?fields=lat,lon,city,country,status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ips),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return ips.map(() => ({ status: 'fail' }));
  return res.json();
}

// Country code → display label
const COUNTRY_LABELS: Record<string, string> = {
  IL: 'Israel', TR: 'Turkey', LB: 'Lebanon', EG: 'Egypt',
  JO: 'Jordan', SA: 'Saudi Arabia', IR: 'Iran', SY: 'Syria',
  IN: 'India', TH: 'Thailand', KR: 'South Korea', JP: 'Japan',
  HK: 'Hong Kong', ID: 'Indonesia', MY: 'Malaysia', TW: 'Taiwan',
  CN: 'China', PK: 'Pakistan', VN: 'Vietnam', BD: 'Bangladesh',
};

export async function fetchInsecamRegion(
  codes: string[]
): Promise<InsecamCamera[]> {
  // Step 1: get camera IDs for all countries in parallel
  const idResults = await Promise.allSettled(
    codes.map(code => getCameraIds(code).then(ids => ({ code, ids })))
  );

  const allEntries: Array<{ code: string; id: string }> = [];
  for (const r of idResults) {
    if (r.status === 'fulfilled') {
      for (const id of r.value.ids) {
        allEntries.push({ code: r.value.code, id });
      }
    }
  }

  if (allEntries.length === 0) return [];

  // Step 2: fetch stream URLs for all cameras in parallel
  const streamResults = await Promise.allSettled(
    allEntries.map(e => getCameraStream(e.id).then(s => ({ ...e, stream: s })))
  );

  const validCams: Array<{ code: string; id: string; streamUrl: string; ip: string }> = [];
  for (const r of streamResults) {
    if (r.status === 'fulfilled' && r.value.stream) {
      validCams.push({
        code: r.value.code,
        id: r.value.id,
        streamUrl: r.value.stream.streamUrl,
        ip: r.value.stream.ip,
      });
    }
  }

  if (validCams.length === 0) return [];

  // Step 3: batch GeoIP all IPs at once
  const geoData = await batchGeoIp(validCams.map(c => c.ip));

  // Step 4: combine
  const cameras: InsecamCamera[] = [];
  for (let i = 0; i < validCams.length; i++) {
    const cam = validCams[i];
    const geo = geoData[i];
    if (!geo || geo.status !== 'success' || !geo.lat || !geo.lon) continue;

    const countryLabel = COUNTRY_LABELS[cam.code] ?? geo.country ?? cam.code;
    const cityLabel = geo.city ?? countryLabel;

    cameras.push({
      id: `insecam-${cam.id}`,
      name: `${cityLabel.toUpperCase()} — ${cam.ip.split(':')[0]}`,
      lat: geo.lat,
      lng: geo.lon,
      country: countryLabel,
      city: cityLabel,
      // Replace COUNTER with timestamp so browser gets fresh frame on load
      imageUrl: cam.streamUrl.replace('COUNTER', String(Date.now())),
      online: true,
    });
  }

  return cameras;
}
