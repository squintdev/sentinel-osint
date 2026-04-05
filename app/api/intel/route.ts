export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TOPICS = [
  'Middle East conflict',
  'Gaza war',
  'Israel military',
  'Iran military',
  'Ukraine war',
  'Russia military operations',
  'cyber attack',
  'military strike',
  'breaking news conflict',
  'geopolitical crisis',
  'earthquake',
  'natural disaster',
  'nuclear weapons',
  'sanctions',
];

const CRITICAL_KEYWORDS = ['attack', 'killed', 'nuclear', 'missile', 'explosion', 'war', 'strike'];
const HIGH_KEYWORDS = ['military', 'crisis', 'alert', 'threat', 'weapons', 'troops'];
const SIGINT_KEYWORDS = ['cyber', 'hack', 'signal', 'intercept', 'electronic', 'network', 'satellite'];

const STOPWORDS = new Set(['The','A','An','In','On','At','By','For','With','This','That','These','Those','Is','Are','Was','Were','Has','Have','Had','Will','Would','Could','Should','May','Might','Must']);


const BLOCKED_DOMAINS = new Set([
  'wikipedia.org', 'britannica.com', 'dictionary.com', 'merriam-webster.com',
  'encyclopedia.com', 'thoughtco.com', 'reference.com', 'about.com',
  'wikimedia.org', 'wiktionary.org', 'wikiquote.org', 'wikibooks.org',
  'history.com', 'biography.com', 'investopedia.com', 'thefreedictionary.com',
  'definitions.net', 'yourdictionary.com', 'vocabulary.com', 'howstuffworks.com',
  'military.com', 'globalsecurity.org', 'cfr.org', 'brookings.edu',
]);

function extractEntities(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g) || [];
  const filtered = matches.filter(m => !STOPWORDS.has(m) && m.length > 2);
  return Array.from(new Set(filtered)).slice(0, 5);
}

function assignPriority(text: string): 'LOW' | 'MED' | 'HIGH' | 'CRITICAL' {
  const lower = text.toLowerCase();
  if (CRITICAL_KEYWORDS.some(k => lower.includes(k))) return 'CRITICAL';
  if (HIGH_KEYWORDS.some(k => lower.includes(k))) return 'HIGH';
  if (lower.includes('report') || lower.includes('warning')) return 'MED';
  return 'LOW';
}

function assignCategory(text: string, entities: string[]): 'SIGINT' | 'HUMINT' | 'OSINT' | 'GEOINT' {
  const lower = text.toLowerCase();
  if (SIGINT_KEYWORDS.some(k => lower.includes(k))) return 'SIGINT';
  if (entities.some(e => e.includes('General') || e.includes('President') || e.includes('Minister'))) return 'HUMINT';
  if (lower.includes('region') || lower.includes('border') || lower.includes('territory') || lower.includes('coast')) return 'GEOINT';
  return 'OSINT';
}

const LOCATION_HINTS: Record<string, [number, number]> = {
  'ukraine': [49, 32], 'russia': [60, 90], 'china': [35, 105], 'taiwan': [23.5, 121],
  'iran': [32, 53], 'israel': [31.5, 34.8], 'gaza': [31.5, 34.5], 'syria': [35, 38],
  'korea': [37, 127], 'japan': [36, 138], 'india': [21, 78], 'pakistan': [30, 70],
  'afghanistan': [33, 65], 'iraq': [33, 44], 'saudi': [24, 45], 'turkey': [39, 35],
  'europe': [50, 10], 'africa': [0, 20], 'pacific': [0, -160], 'atlantic': [30, -40],
  'middle east': [32, 40], 'lebanon': [33.9, 35.5], 'yemen': [15.6, 48.5],
};

function extractLocation(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [key, coords] of Object.entries(LOCATION_HINTS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

function pickRandomTopics(count: number): string[] {
  const shuffled = TOPICS.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function GET() {
  try {
    const topics = pickRandomTopics(2);

    const fetchTopic = async (topic: string) => {
      const searxUrl = `http://localhost:8080/search?q=${encodeURIComponent(topic)}&format=json&categories=news&time_range=day`;
      const res = await fetch(searxUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('SearXNG unavailable');
      const data = await res.json();
      return (data.results || []) as Array<{ title: string; content?: string; url: string }>;
    };

    const [results1, results2] = await Promise.all(topics.map(fetchTopic));

    // Merge and deduplicate by URL
    const seen = new Set<string>();
    const merged: Array<{ title: string; content?: string; url: string }> = [];
    for (const r of [...results1, ...results2]) {
      try {
        const hostname = new URL(r.url).hostname.replace('www.', '');
        if (!seen.has(r.url) && !BLOCKED_DOMAINS.has(hostname)) {
          seen.add(r.url);
          merged.push(r);
        }
      } catch { /* skip invalid URLs */ }
    }

    const now = new Date();
    const items = merged.slice(0, 30).map((r, i) => {
      const text = `${r.title} ${r.content || ''}`;
      const entities = extractEntities(r.title);
      const priority = assignPriority(text);
      const category = assignCategory(text, entities);
      const loc = extractLocation(text);

      return {
        id: `intel-${Date.now()}-${i}`,
        timestamp: now.toISOString().slice(11, 19) + ' UTC',
        category,
        headline: r.title.slice(0, 100),
        source: new URL(r.url).hostname.replace('www.', '').toUpperCase(),
        entities,
        priority,
        lat: loc?.[0],
        lng: loc?.[1],
      };
    });

    // Sort by priority: CRITICAL > HIGH > MED > LOW
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return Response.json({ items: items.slice(0, 20) });
  } catch {
    const simItems = [
      { headline: 'UNIDENTIFIED AIRCRAFT DETECTED NEAR RESTRICTED AIRSPACE', category: 'SIGINT', priority: 'HIGH', lat: 38.9, lng: -77.0 },
      { headline: 'SEISMIC ANOMALY DETECTED PACIFIC NORTHWEST REGION', category: 'GEOINT', priority: 'MED', lat: 47.6, lng: -122.3 },
      { headline: 'ENCRYPTED COMMUNICATIONS SURGE DETECTED EASTERN EUROPE', category: 'SIGINT', priority: 'CRITICAL', lat: 50, lng: 30 },
      { headline: 'NAVAL VESSEL MOVEMENTS OBSERVED SOUTH CHINA SEA', category: 'GEOINT', priority: 'HIGH', lat: 15, lng: 115 },
      { headline: 'SATELLITE IMAGERY SHOWS INFRASTRUCTURE CHANGES', category: 'GEOINT', priority: 'MED', lat: 35, lng: 105 },
      { headline: 'DIPLOMATIC COMMUNICATIONS INTERCEPTED MIDDLE EAST', category: 'HUMINT', priority: 'HIGH', lat: 32, lng: 35 },
      { headline: 'CYBER INTRUSION ATTEMPT ON CRITICAL INFRASTRUCTURE', category: 'SIGINT', priority: 'CRITICAL', lat: 40.7, lng: -74 },
      { headline: 'MILITARY CONVOY SPOTTED BORDER REGION', category: 'GEOINT', priority: 'HIGH', lat: 49, lng: 32 },
    ];

    const now = new Date();
    const items = simItems.map((s, i) => ({
      id: `sim-intel-${Date.now()}-${i}`,
      timestamp: now.toISOString().slice(11, 19) + ' UTC',
      category: s.category as 'SIGINT' | 'HUMINT' | 'OSINT' | 'GEOINT',
      headline: s.headline,
      source: ['REUTERS', 'AP', 'OSINT-NET', 'SIGINT-HUB', 'GEOINT-DB'][i % 5],
      entities: extractEntities(s.headline),
      priority: s.priority as 'LOW' | 'MED' | 'HIGH' | 'CRITICAL',
      lat: s.lat,
      lng: s.lng,
    }));

    return Response.json({ items, simulated: true });
  }
}
