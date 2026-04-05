export const dynamic = 'force-dynamic';
export const revalidate = 0;

import AdmZip from 'adm-zip';

export interface GdeltEvent {
  id: string;
  lat: number;
  lng: number;
  eventCode: string;
  rootCode: string;
  tone: number;
  goldstein: number;
  location: string;
  sourceUrl: string;
  actor1: string;
  actor2: string;
  numMentions: number;
  priority: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
}

let cache: { data: GdeltEvent[]; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;
const RELEVANT_ROOT_CODES = new Set(['14','15','16','17','18','19','20']);

function priorityFromGoldstein(score: number, mentions: number): 'LOW' | 'MED' | 'HIGH' | 'CRITICAL' {
  if (score <= -8 || (score <= -5 && mentions > 10)) return 'CRITICAL';
  if (score <= -5 || mentions > 20) return 'HIGH';
  if (score <= -2) return 'MED';
  return 'LOW';
}

async function fetchAndParse(): Promise<GdeltEvent[]> {
  const updateRes = await fetch('http://data.gdeltproject.org/gdeltv2/lastupdate.txt', {
    signal: AbortSignal.timeout(10000),
  });
  const updateText = await updateRes.text();
  const csvUrl = updateText.split('\n')
    .find((l: string) => l.includes('.export.CSV.zip'))
    ?.split(' ')[2]?.trim();

  if (!csvUrl) throw new Error('No CSV URL found');

  const zipRes = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!zipRes.ok) throw new Error(`Fetch failed: ${zipRes.status}`);

  const buffer = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith('.CSV'));
  if (!entry) throw new Error('No CSV entry in zip');

  const csvText = entry.getData().toString('utf8');
  const events: GdeltEvent[] = [];

  for (const line of csvText.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 61) continue;

    const rootCode = cols[28]?.trim();
    const lat = parseFloat(cols[56]);
    const lng = parseFloat(cols[57]);
    const goldstein = parseFloat(cols[30]);
    const tone = parseFloat(cols[34]);
    const numMentions = parseInt(cols[31]) || 0;

    if (!RELEVANT_ROOT_CODES.has(rootCode)) continue;
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;
    if (numMentions < 8) continue;

    events.push({
      id: cols[0] || String(Math.random()),
      lat, lng,
      eventCode: cols[26]?.trim() || '',
      rootCode,
      tone: isNaN(tone) ? 0 : tone,
      goldstein: isNaN(goldstein) ? 0 : goldstein,
      location: cols[53]?.trim() || '',
      sourceUrl: cols[60]?.trim() || '',
      actor1: cols[6]?.trim() || '',
      actor2: cols[16]?.trim() || '',
      numMentions,
      priority: priorityFromGoldstein(goldstein, numMentions),
    });
  }

  return events.sort((a, b) => a.goldstein - b.goldstein).slice(0, 200);
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) {
    return Response.json({ events: cache.data, total: cache.data.length, cached: true });
  }
  try {
    const events = await fetchAndParse();
    cache = { data: events, ts: now };
    return Response.json({ events, total: events.length });
  } catch (err) {
    if (cache) return Response.json({ events: cache.data, total: cache.data.length, stale: true });
    return Response.json({ events: [], total: 0, error: String(err) });
  }
}
