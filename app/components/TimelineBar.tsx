'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Mode = 'live' | 'playback';

interface TimelineBucket {
  ts: number;
  flights: number;
  intel: number;
  gdelt: number;
  quakes: number;
  critical: number;
}

interface TimelineMeta {
  earliestTs: number | null;
  latestTs: number | null;
  bucketMs: number;
  buckets: TimelineBucket[];
  error?: string;
}

interface Props {
  // Mode + playback controls
  mode: Mode;
  onModeChange: (m: Mode) => void;
  playbackTs: number;
  onPlaybackTsChange: (ts: number) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (s: number) => void;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;

  // Existing bottom-bar content (preserved from previous design)
  flightCount: number;
  militaryCount: number;
  quakeCount: number;
  satCount: number;
  criticalCount: number;
  highCount: number;
  autoRotate: boolean;
  onAutoRotateToggle: () => void;
}

const SPEEDS = [1, 10, 60, 600];

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatOffset(ts: number, now: number): string {
  const deltaSec = Math.max(0, Math.floor((now - ts) / 1000));
  const h = Math.floor(deltaSec / 3600);
  const m = Math.floor((deltaSec % 3600) / 60);
  const s = deltaSec % 60;
  return `T-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimelineBar({
  mode, onModeChange, playbackTs, onPlaybackTsChange, playbackSpeed, onPlaybackSpeedChange,
  isPlaying, onPlayPauseToggle,
  flightCount, militaryCount, quakeCount, satCount, criticalCount, highCount,
  autoRotate, onAutoRotateToggle,
}: Props) {
  const scrubberRef = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta] = useState<TimelineMeta | null>(null);
  // Start at 0 to avoid SSR/client hydration mismatch — populated in useEffect below.
  const [now, setNow] = useState(0);
  const isDraggingRef = useRef(false);

  // Refresh "now" each second so the T- offset display and scrubber playhead move.
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Fetch timeline metadata on mount and when mode switches to playback.
  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/timeline');
      const data = await res.json();
      setMeta(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => {
    if (mode !== 'playback') return;
    fetchMeta();
    const i = setInterval(fetchMeta, 30_000);
    return () => clearInterval(i);
  }, [mode, fetchMeta]);

  // Derive scrubber bounds: earliest capture → "now" (so LIVE aligns with right edge).
  const bounds = {
    start: meta?.earliestTs ?? now - 3600_000,
    end: now,
  };

  // ─── Scrubber canvas draw ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = scrubberRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background strip
    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#0a2a0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    const span = bounds.end - bounds.start;
    if (span <= 0) return;

    const xFor = (ts: number) => ((ts - bounds.start) / span) * W;

    // Event density histogram
    if (meta?.buckets?.length) {
      const maxActivity = Math.max(1, ...meta.buckets.map(b => b.flights + b.intel + b.gdelt + b.quakes));
      const bucketW = Math.max(2, (meta.bucketMs / span) * W);
      for (const b of meta.buckets) {
        const x = xFor(b.ts);
        if (x < -bucketW || x > W) continue;
        const activity = b.flights + b.intel + b.gdelt + b.quakes;
        const barH = (activity / maxActivity) * (H - 2);
        ctx.fillStyle = 'rgba(0, 255, 65, 0.25)';
        ctx.fillRect(x, H - barH - 1, bucketW - 1, barH);
        if (b.critical > 0) {
          // Red spike for CRITICAL / severe-gdelt events
          ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.fillRect(x, 1, bucketW - 1, H - 2);
        }
      }
    }

    // Playhead — green if playing, amber if paused/scrubbing
    const ts = mode === 'live' ? now : playbackTs;
    const px = xFor(ts);
    ctx.strokeStyle = mode === 'live' ? '#00ff41' : (isPlaying ? '#00ff41' : '#ff8c00');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();

    // LIVE edge marker
    if (mode === 'live') {
      ctx.fillStyle = '#00ff41';
      ctx.fillRect(W - 2, 0, 2, H);
    }
  }, [meta, bounds.start, bounds.end, mode, playbackTs, now, isPlaying]);

  // ─── Scrub interactions ───────────────────────────────────────────────
  const seekFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = scrubberRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const frac = x / rect.width;
    const ts = Math.round(bounds.start + frac * (bounds.end - bounds.start));
    onPlaybackTsChange(ts);
    if (mode !== 'playback') onModeChange('playback');
  }, [bounds.start, bounds.end, onPlaybackTsChange, onModeChange, mode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    seekFromEvent(e);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  // Canvas sizing
  useEffect(() => {
    const canvas = scrubberRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(100, Math.floor(rect.width));
      canvas.height = Math.max(16, Math.floor(rect.height));
    });
    ro.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(100, Math.floor(rect.width));
    canvas.height = Math.max(16, Math.floor(rect.height));
    return () => ro.disconnect();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────
  const btn = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: `1px solid ${active ? '#00ff41' : '#1a3a1a'}`,
    color: active ? '#00ff41' : '#446644',
    cursor: 'pointer',
    fontSize: 9,
    letterSpacing: '0.1em',
    padding: '2px 8px',
    fontFamily: 'inherit',
    boxShadow: active ? '0 0 8px rgba(0,255,65,0.4)' : 'none',
  });

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid #0a2a0a',
        flexShrink: 0,
      }}
    >
      {/* Row 1: counters (preserved from existing bottom bar) */}
      <div style={{
        height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid #0a2a0a',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
            FLIGHTS: <span className="glow" style={{ fontSize: 9 }}>{flightCount}</span>
          </span>
          <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
            MIL: <span style={{ color: '#ff4444', fontSize: 9 }}>{militaryCount}</span>
          </span>
          <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
            QUAKES: <span className="glow" style={{ fontSize: 9 }}>{quakeCount}</span>
          </span>
          <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
            SATS: <span className="glow" style={{ fontSize: 9 }}>{satCount}</span>
          </span>
          <button onClick={onAutoRotateToggle} style={btn(autoRotate)}>
            {autoRotate ? '⟳ ROTATE ON' : '⟳ ROTATE OFF'}
          </button>
        </div>

        <div style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
          SENTINEL OSINT PLATFORM — CLASSIFICATION: SECRET//NOFORN — <a href="/mobile" style={{ fontSize: 8, color: '#1a3a1a', letterSpacing: '0.1em' }}>📱 MOBILE</a>
        </div>

        <div style={{ fontSize: 9, letterSpacing: '0.1em', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: criticalCount > 0 ? '#ff0000' : '#1a4a1a' }}>
            CRIT: <span style={{ color: criticalCount > 0 ? '#ff0000' : '#00ff41' }}>{criticalCount}</span>
          </span>
          <span style={{ color: '#333' }}>|</span>
          <span style={{ color: highCount > 0 ? '#ff8c00' : '#1a4a1a' }}>
            HIGH: <span style={{ color: highCount > 0 ? '#ff8c00' : '#00ff41' }}>{highCount}</span>
          </span>
        </div>
      </div>

      {/* Row 2: playback controls + scrubber */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px',
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onModeChange('live')} style={btn(mode === 'live')}>
            {mode === 'live' && <span className="blink" style={{ color: '#ff0000' }}>●</span>} LIVE
          </button>
          <button onClick={() => onModeChange('playback')} style={btn(mode === 'playback')}>
            ▶ PLAYBACK
          </button>
        </div>

        {/* Play/pause (only meaningful in playback) */}
        <button
          onClick={onPlayPauseToggle}
          disabled={mode !== 'playback'}
          style={{
            ...btn(isPlaying && mode === 'playback'),
            opacity: mode === 'playback' ? 1 : 0.3,
            cursor: mode === 'playback' ? 'pointer' : 'not-allowed',
            minWidth: 28,
          }}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        {/* Speed selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onPlaybackSpeedChange(s)}
              disabled={mode !== 'playback'}
              style={{
                ...btn(playbackSpeed === s && mode === 'playback'),
                opacity: mode === 'playback' ? 1 : 0.3,
                cursor: mode === 'playback' ? 'pointer' : 'not-allowed',
                minWidth: 32,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Scrubber canvas */}
        <canvas
          ref={scrubberRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            flex: 1,
            height: 22,
            cursor: 'pointer',
            touchAction: 'none',
          }}
        />

        {/* Timestamp readout — blank until client useEffect populates `now` to avoid hydration mismatch */}
        <div style={{
          fontSize: 9, letterSpacing: '0.12em',
          color: mode === 'live' ? '#00ff41' : '#ff8c00',
          minWidth: 180, textAlign: 'right',
          textShadow: `0 0 6px ${mode === 'live' ? '#00ff41' : '#ff8c00'}`,
        }}>
          {now === 0 ? null : mode === 'live' ? (
            <>● LIVE &nbsp; {formatTs(now)}</>
          ) : (
            <>{formatOffset(playbackTs, now)} &nbsp; {formatTs(playbackTs)}</>
          )}
        </div>
      </div>
    </div>
  );
}
