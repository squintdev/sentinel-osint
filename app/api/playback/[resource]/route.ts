/**
 * Time-windowed playback queries against the capture store.
 *
 * Shapes match the corresponding live /api/* endpoint so the frontend can
 * swap data sources without changing consumer code:
 *   /api/playback/flights?t=<ms>     → { flights, total, capturedAt }
 *   /api/playback/satellites?t=<ms>  → { satellites, total } (computed)
 *   /api/playback/earthquakes?t=<ms> → { earthquakes, total }
 *   /api/playback/intel?t=<ms>       → { items }
 *   /api/playback/gdelt?t=<ms>       → { events, total }
 *
 * t defaults to "now". If the DB is empty or missing, returns empty arrays
 * with error: 'no-capture' so the client can show a friendly banner.
 */

import { NextRequest } from 'next/server';
import type Database from 'better-sqlite3';
import { getDb } from '@/lib/playback-db';
import { computeSatellites } from '@/lib/orbital';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EARTHQUAKE_WINDOW_MS = 2 * 24 * 3600 * 1000; // match live USGS "2.5_day" feed window

type Resource = 'flights' | 'satellites' | 'earthquakes' | 'intel' | 'gdelt';
const VALID = new Set<Resource>(['flights', 'satellites', 'earthquakes', 'intel', 'gdelt']);
const isResource = (r: string): r is Resource => (VALID as Set<string>).has(r);

export async function GET(req: NextRequest, { params }: { params: { resource: string } }) {
  if (!isResource(params.resource)) {
    return Response.json({ error: `unknown resource: ${params.resource}` }, { status: 404 });
  }
  const resource: Resource = params.resource;

  const tParam = req.nextUrl.searchParams.get('t');
  const t = tParam ? Number(tParam) : Date.now();
  if (!Number.isFinite(t)) {
    return Response.json({ error: 'invalid t' }, { status: 400 });
  }

  // Satellites: pure function of time, no DB needed.
  if (resource === 'satellites') {
    const sats = computeSatellites(new Date(t));
    return Response.json({ satellites: sats, total: sats.length });
  }

  const db = getDb();
  if (!db) {
    return Response.json(emptyForResource(resource, 'no-capture'));
  }

  try {
    switch (resource) {
      case 'flights': return Response.json(queryFlights(db, t));
      case 'earthquakes': return Response.json(queryEarthquakes(db, t));
      case 'intel': return Response.json(queryIntel(db, t));
      case 'gdelt': return Response.json(queryGdelt(db, t));
    }
  } catch (err) {
    console.error('[playback]', resource, (err as Error).message);
    return Response.json(emptyForResource(resource, 'query-failed'));
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────

type Db = Database.Database;

function queryFlights(db: Db, t: number) {
  // Snapshot nearest to t (prefer earlier if tied, within ±5 min otherwise empty).
  const nearest = db.prepare(`
    SELECT ts FROM flights
    WHERE ts BETWEEN ? AND ?
    ORDER BY ABS(ts - ?) ASC
    LIMIT 1
  `).get(t - 300_000, t + 300_000, t) as { ts: number } | undefined;

  if (!nearest) return { flights: [], total: 0, capturedAt: null };

  const rows = db.prepare(`
    SELECT id, callsign, lat, lng, altitude, country, military, type, description, operator
    FROM flights WHERE ts = ?
  `).all(nearest.ts) as Array<{ id: string; callsign: string; lat: number; lng: number; altitude: number | null; country: string | null; military: number; type: string | null; description: string | null; operator: string | null }>;

  const flights = rows.map(r => ({
    id: r.id,
    callsign: r.callsign ?? 'UNKNOWN',
    lat: r.lat,
    lng: r.lng,
    altitude: r.altitude ?? 0,
    country: r.country ?? '',
    military: r.military === 1,
    ...(r.type ? { type: r.type } : {}),
    ...(r.description ? { description: r.description } : {}),
    ...(r.operator ? { operator: r.operator } : {}),
  }));

  return { flights, total: flights.length, capturedAt: nearest.ts };
}

function queryEarthquakes(db: Db, t: number) {
  // Events with first_seen_ts <= t AND event_ts within window — mirrors live 2.5_day feed.
  const rows = db.prepare(`
    SELECT id, magnitude, place, lat, lng, event_time, depth
    FROM earthquakes
    WHERE first_seen_ts <= ?
      AND (event_ts IS NULL OR event_ts >= ?)
    ORDER BY event_ts DESC
    LIMIT 200
  `).all(t, t - EARTHQUAKE_WINDOW_MS) as Array<{ id: string; magnitude: number; place: string; lat: number; lng: number; event_time: string; depth: number }>;

  const earthquakes = rows.map(r => ({
    id: r.id,
    magnitude: r.magnitude,
    place: r.place,
    lat: r.lat,
    lng: r.lng,
    time: r.event_time,
    depth: r.depth,
  }));

  return { earthquakes, total: earthquakes.length };
}

function queryIntel(db: Db, t: number) {
  // Latest 20 intel items first seen at or before t.
  const rows = db.prepare(`
    SELECT id, timestamp, category, headline, source, entities, priority, lat, lng
    FROM intel
    WHERE first_seen_ts <= ?
    ORDER BY first_seen_ts DESC
    LIMIT 20
  `).all(t) as Array<{ id: string; timestamp: string; category: string; headline: string; source: string; entities: string; priority: string; lat: number | null; lng: number | null }>;

  const items = rows.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    category: r.category,
    headline: r.headline,
    source: r.source,
    entities: r.entities ? JSON.parse(r.entities) : [],
    priority: r.priority,
    ...(r.lat != null ? { lat: r.lat } : {}),
    ...(r.lng != null ? { lng: r.lng } : {}),
  }));

  return { items };
}

function queryGdelt(db: Db, t: number) {
  // Latest 200 GDELT events first seen at or before t, ordered by severity (goldstein ascending).
  const rows = db.prepare(`
    SELECT id, lat, lng, event_code, root_code, tone, goldstein, location,
           source_url, actor1, actor2, num_mentions, priority
    FROM gdelt
    WHERE first_seen_ts <= ?
    ORDER BY first_seen_ts DESC
    LIMIT 200
  `).all(t) as Array<{ id: string; lat: number; lng: number; event_code: string; root_code: string; tone: number; goldstein: number; location: string; source_url: string; actor1: string; actor2: string; num_mentions: number; priority: string }>;

  const events = rows.map(r => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    eventCode: r.event_code,
    rootCode: r.root_code,
    tone: r.tone,
    goldstein: r.goldstein,
    location: r.location,
    sourceUrl: r.source_url,
    actor1: r.actor1,
    actor2: r.actor2,
    numMentions: r.num_mentions,
    priority: r.priority,
  }));

  return { events, total: events.length };
}

function emptyForResource(resource: Resource, error: string) {
  switch (resource) {
    case 'flights': return { flights: [], total: 0, capturedAt: null, error };
    case 'earthquakes': return { earthquakes: [], total: 0, error };
    case 'intel': return { items: [], error };
    case 'gdelt': return { events: [], total: 0, error };
    case 'satellites': return { satellites: [], total: 0, error };
  }
}
