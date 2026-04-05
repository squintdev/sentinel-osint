/**
 * Timeline metadata for the playback scrubber.
 * Returns the capture window (earliest/latest ts) and an event-density histogram
 * bucketed by hour. Critical events are surfaced separately so the scrubber can
 * paint amber/red spikes at high-signal moments.
 */

import { getDb } from '@/lib/playback-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BUCKET_MS = 60 * 60 * 1000; // 1 hour

interface Bucket {
  ts: number;         // bucket start (unix ms)
  flights: number;    // flight snapshots in bucket
  intel: number;
  gdelt: number;
  quakes: number;
  critical: number;   // CRITICAL intel + goldstein <= -8 GDELT
}

export async function GET() {
  const db = getDb();
  if (!db) {
    return Response.json({ earliestTs: null, latestTs: null, buckets: [], error: 'no-capture' });
  }

  try {
    // Union the min/max across all tables to find the capture window.
    const bounds = db.prepare(`
      SELECT
        MIN(mn) AS earliest,
        MAX(mx) AS latest
      FROM (
        SELECT MIN(ts) mn, MAX(ts) mx FROM flights
        UNION ALL
        SELECT MIN(first_seen_ts) mn, MAX(first_seen_ts) mx FROM earthquakes
        UNION ALL
        SELECT MIN(first_seen_ts) mn, MAX(first_seen_ts) mx FROM intel
        UNION ALL
        SELECT MIN(first_seen_ts) mn, MAX(first_seen_ts) mx FROM gdelt
      )
    `).get() as { earliest: number | null; latest: number | null };

    if (bounds.earliest == null || bounds.latest == null) {
      return Response.json({ earliestTs: null, latestTs: null, buckets: [] });
    }

    const bucketOf = (ts: number) => Math.floor(ts / BUCKET_MS) * BUCKET_MS;

    // Build histogram: one row per bucket, aggregated counts per source.
    const buckets = new Map<number, Bucket>();
    const bucketFor = (ts: number): Bucket => {
      const b = bucketOf(ts);
      let entry = buckets.get(b);
      if (!entry) {
        entry = { ts: b, flights: 0, intel: 0, gdelt: 0, quakes: 0, critical: 0 };
        buckets.set(b, entry);
      }
      return entry;
    };

    // Count unique flight snapshots per bucket (distinct ts values).
    const flightSnaps = db.prepare(`SELECT DISTINCT ts FROM flights ORDER BY ts`).all() as Array<{ ts: number }>;
    for (const row of flightSnaps) bucketFor(row.ts).flights++;

    // Count intel items — CRITICAL items bump the critical counter too.
    const intelRows = db.prepare(`SELECT first_seen_ts, priority FROM intel`).all() as Array<{ first_seen_ts: number; priority: string }>;
    for (const row of intelRows) {
      const b = bucketFor(row.first_seen_ts);
      b.intel++;
      if (row.priority === 'CRITICAL') b.critical++;
    }

    // Count GDELT events — severe ones (goldstein <= -8) bump critical.
    const gdeltRows = db.prepare(`SELECT first_seen_ts, goldstein FROM gdelt`).all() as Array<{ first_seen_ts: number; goldstein: number | null }>;
    for (const row of gdeltRows) {
      const b = bucketFor(row.first_seen_ts);
      b.gdelt++;
      if (row.goldstein != null && row.goldstein <= -8) b.critical++;
    }

    // Count earthquakes by first_seen_ts (when they were captured, not event_ts).
    const quakeRows = db.prepare(`SELECT first_seen_ts FROM earthquakes`).all() as Array<{ first_seen_ts: number }>;
    for (const row of quakeRows) bucketFor(row.first_seen_ts).quakes++;

    const orderedBuckets = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);

    return Response.json({
      earliestTs: bounds.earliest,
      latestTs: bounds.latest,
      bucketMs: BUCKET_MS,
      buckets: orderedBuckets,
    });
  } catch (err) {
    console.error('[timeline]', (err as Error).message);
    return Response.json({ earliestTs: null, latestTs: null, buckets: [], error: 'query-failed' });
  }
}
