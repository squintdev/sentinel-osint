/**
 * SENTINEL capture daemon
 * Polls live /api/* endpoints on their natural refresh intervals and writes
 * snapshots to data/sentinel.db so the frontend can scrub through history.
 *
 * Design notes:
 * - Hits localhost:3201 (the Next.js app must be running). If a fetch fails
 *   we log and skip — the app keeps running, we just lose that sample.
 * - Satellites are NOT captured: their positions are computed deterministically
 *   from time via orbitToLatLng, so playback can recompute on demand.
 * - Cameras are NOT captured: positions are static and images are live-only.
 * - Prunes flights/positions older than RETENTION_DAYS on startup and hourly.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DB_PATH = process.env.SENTINEL_DB ?? join(ROOT, 'data', 'sentinel.db');
const BASE_URL = process.env.SENTINEL_BASE_URL ?? 'http://localhost:3201';
const RETENTION_DAYS = Number(process.env.SENTINEL_RETENTION_DAYS ?? 7);

const log = (...args: unknown[]) => console.log(new Date().toISOString(), '[capture]', ...args);

// ─── DB init ──────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
log('db ready at', DB_PATH);

// ─── Prepared statements ─────────────────────────────────────────────────
const insFlight = db.prepare(`
  INSERT OR REPLACE INTO flights
    (ts, id, callsign, lat, lng, altitude, country, military, type, description, operator)
  VALUES (@ts, @id, @callsign, @lat, @lng, @altitude, @country, @military, @type, @description, @operator)
`);

const insQuake = db.prepare(`
  INSERT OR IGNORE INTO earthquakes
    (id, first_seen_ts, magnitude, place, lat, lng, event_time, event_ts, depth)
  VALUES (@id, @first_seen_ts, @magnitude, @place, @lat, @lng, @event_time, @event_ts, @depth)
`);

const insIntel = db.prepare(`
  INSERT OR IGNORE INTO intel
    (id, first_seen_ts, timestamp, category, headline, source, entities, priority, lat, lng)
  VALUES (@id, @first_seen_ts, @timestamp, @category, @headline, @source, @entities, @priority, @lat, @lng)
`);

const insGdelt = db.prepare(`
  INSERT OR IGNORE INTO gdelt
    (id, first_seen_ts, lat, lng, event_code, root_code, tone, goldstein,
     location, source_url, actor1, actor2, num_mentions, priority)
  VALUES (@id, @first_seen_ts, @lat, @lng, @event_code, @root_code, @tone, @goldstein,
          @location, @source_url, @actor1, @actor2, @num_mentions, @priority)
`);

// Dedup intel: SearXNG regenerates ids each fetch, so use headline as stable key.
const intelSeenQ = db.prepare('SELECT 1 FROM intel WHERE headline = ? LIMIT 1');

// ─── Fetch helpers ───────────────────────────────────────────────────────
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(BASE_URL + path, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      log(path, 'status', res.status);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log(path, 'error', (err as Error).message);
    return null;
  }
}

// ─── Capture tasks ───────────────────────────────────────────────────────
interface FlightRow { id: string; callsign: string; lat: number; lng: number; altitude?: number; country?: string; military?: boolean; type?: string; description?: string; operator?: string }

async function captureFlights() {
  const data = await fetchJson<{ flights: FlightRow[] }>('/api/flights');
  if (!data?.flights?.length) return;
  const ts = Date.now();
  const insertMany = db.transaction((rows: FlightRow[]) => {
    for (const f of rows) {
      if (f.lat == null || f.lng == null) continue;
      insFlight.run({
        ts,
        id: f.id,
        callsign: f.callsign ?? null,
        lat: f.lat,
        lng: f.lng,
        altitude: f.altitude ?? null,
        country: f.country ?? null,
        military: f.military ? 1 : 0,
        type: f.type ?? null,
        description: f.description ?? null,
        operator: f.operator ?? null,
      });
    }
  });
  insertMany(data.flights);
  log('flights', data.flights.length, 'rows @', ts);
}

interface QuakeRow { id: string; magnitude: number; place: string; lat: number; lng: number; time: string; depth: number }

async function captureEarthquakes() {
  const data = await fetchJson<{ earthquakes: QuakeRow[]; simulated?: boolean }>('/api/earthquakes');
  if (!data?.earthquakes?.length || data.simulated) return;
  const now = Date.now();
  let inserted = 0;
  const insertMany = db.transaction((rows: QuakeRow[]) => {
    for (const q of rows) {
      const eventTs = Date.parse(q.time);
      const result = insQuake.run({
        id: q.id,
        first_seen_ts: now,
        magnitude: q.magnitude ?? null,
        place: q.place ?? null,
        lat: q.lat,
        lng: q.lng,
        event_time: q.time ?? null,
        event_ts: Number.isFinite(eventTs) ? eventTs : null,
        depth: q.depth ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });
  insertMany(data.earthquakes);
  if (inserted > 0) log('earthquakes', inserted, 'new');
}

interface IntelRow { id: string; timestamp: string; category: string; headline: string; source: string; entities: string[]; priority: string; lat?: number; lng?: number }

async function captureIntel() {
  const data = await fetchJson<{ items: IntelRow[]; simulated?: boolean }>('/api/intel');
  if (!data?.items?.length || data.simulated) return;
  const now = Date.now();
  let inserted = 0;
  const insertMany = db.transaction((rows: IntelRow[]) => {
    for (const item of rows) {
      if (intelSeenQ.get(item.headline)) continue;
      const result = insIntel.run({
        id: item.id,
        first_seen_ts: now,
        timestamp: item.timestamp ?? null,
        category: item.category ?? null,
        headline: item.headline ?? null,
        source: item.source ?? null,
        entities: JSON.stringify(item.entities ?? []),
        priority: item.priority ?? null,
        lat: item.lat ?? null,
        lng: item.lng ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });
  insertMany(data.items);
  if (inserted > 0) log('intel', inserted, 'new');
}

interface GdeltRow { id: string; lat: number; lng: number; eventCode: string; rootCode: string; tone: number; goldstein: number; location: string; sourceUrl: string; actor1: string; actor2: string; numMentions: number; priority: string }

async function captureGdelt() {
  const data = await fetchJson<{ events: GdeltRow[] }>('/api/gdelt');
  if (!data?.events?.length) return;
  const now = Date.now();
  let inserted = 0;
  const insertMany = db.transaction((rows: GdeltRow[]) => {
    for (const e of rows) {
      const result = insGdelt.run({
        id: e.id,
        first_seen_ts: now,
        lat: e.lat,
        lng: e.lng,
        event_code: e.eventCode ?? null,
        root_code: e.rootCode ?? null,
        tone: e.tone ?? null,
        goldstein: e.goldstein ?? null,
        location: e.location ?? null,
        source_url: e.sourceUrl ?? null,
        actor1: e.actor1 ?? null,
        actor2: e.actor2 ?? null,
        num_mentions: e.numMentions ?? null,
        priority: e.priority ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });
  insertMany(data.events);
  if (inserted > 0) log('gdelt', inserted, 'new');
}

// ─── Retention / pruning ─────────────────────────────────────────────────
function prune() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;
  const f = db.prepare('DELETE FROM flights WHERE ts < ?').run(cutoff);
  const q = db.prepare('DELETE FROM earthquakes WHERE first_seen_ts < ?').run(cutoff);
  const i = db.prepare('DELETE FROM intel WHERE first_seen_ts < ?').run(cutoff);
  const g = db.prepare('DELETE FROM gdelt WHERE first_seen_ts < ?').run(cutoff);
  log('prune: removed', { flights: f.changes, quakes: q.changes, intel: i.changes, gdelt: g.changes });
}

// ─── Main loop ───────────────────────────────────────────────────────────
// Match the frontend's polling intervals (app/page.tsx:129-136).
const INTERVALS = {
  flights: 30_000,
  earthquakes: 60_000,
  intel: 45_000,
  gdelt: 900_000,
  prune: 3_600_000,
};

function scheduleRepeating(name: string, fn: () => Promise<void> | void, ms: number) {
  const tick = async () => {
    try {
      await fn();
    } catch (err) {
      log(name, 'tick error', (err as Error).message);
    } finally {
      setTimeout(tick, ms);
    }
  };
  tick();
}

log('starting with base url', BASE_URL, 'retention', RETENTION_DAYS, 'days');
scheduleRepeating('flights', captureFlights, INTERVALS.flights);
scheduleRepeating('earthquakes', captureEarthquakes, INTERVALS.earthquakes);
scheduleRepeating('intel', captureIntel, INTERVALS.intel);
scheduleRepeating('gdelt', captureGdelt, INTERVALS.gdelt);
scheduleRepeating('prune', prune, INTERVALS.prune);

process.on('SIGINT', () => { log('shutting down'); db.close(); process.exit(0); });
process.on('SIGTERM', () => { log('shutting down'); db.close(); process.exit(0); });
