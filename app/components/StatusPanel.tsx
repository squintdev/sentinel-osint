'use client';
import { useEffect, useRef, useState } from 'react';

interface EarthquakeData {
  id: string;
  magnitude: number;
  place: string;
  time: string;
}

export type VisualMode = 'clear' | 'night' | 'crt' | 'flir';

interface StatusPanelProps {
  flightCount: number;
  militaryCount: number;
  quakeCount: number;
  satelliteCount: number;
  newsCount: number;
  cameraCount: number;
  recentQuakes: EarthquakeData[];
  activeMode: VisualMode;
  onModeChange: (mode: VisualMode) => void;
  activeLayers: string[];
  onLayerToggle: (layer: string) => void;
}

const LAYERS = [
  { id: 'flights', label: 'FLIGHTS' },
  { id: 'military', label: 'MILITARY' },
  { id: 'earthquakes', label: 'QUAKES' },
  { id: 'satellites', label: 'SATELLITES' },
  { id: 'news', label: 'NEWS' },
  { id: 'iss', label: 'ISS' },
  { id: 'cameras', label: 'CAMERAS' },
];

const MODES: { id: VisualMode; label: string }[] = [
  { id: 'clear', label: 'CLEAR' },
  { id: 'night', label: 'NIGHT' },
  { id: 'crt', label: 'CRT' },
  { id: 'flir', label: 'FLIR' },
];

function Counter({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      setAnimating(true);
      prevRef.current = value;
      // Animate count
      const start = display;
      const end = value;
      const steps = 20;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        setDisplay(Math.round(start + (end - start) * (step / steps)));
        if (step >= steps) {
          clearInterval(timer);
          setAnimating(false);
        }
      }, 20);
      return () => clearInterval(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px' }}>
      <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.12em' }}>{label}</span>
      <span
        className={`glow ${animating ? 'count-change' : ''}`}
        style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        [{String(display).padStart(4, '0')}]
      </span>
    </div>
  );
}

export default function StatusPanel({
  flightCount,
  militaryCount,
  quakeCount,
  satelliteCount,
  newsCount,
  cameraCount,
  recentQuakes,
  activeMode,
  onModeChange,
  activeLayers,
  onLayerToggle,
}: StatusPanelProps) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="panel-header">STATUS</div>

      {/* Live counters */}
      <div style={{ borderBottom: '1px solid #0a2a0a', paddingBottom: 8, paddingTop: 4 }}>
        <Counter value={flightCount} label="AIRCRAFT TRACKED" />
        <Counter value={militaryCount} label="MILITARY FLIGHTS" />
        <Counter value={quakeCount} label="SEISMIC EVENTS" />
        <Counter value={satelliteCount} label="SATELLITES" />
        <Counter value={newsCount} label="NEWS ITEMS" />
        <Counter value={cameraCount} label="CAMERAS" />
      </div>

      {/* Recent earthquakes */}
      <div style={{ borderBottom: '1px solid #0a2a0a', padding: '6px 0' }}>
        <div style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.12em', padding: '0 10px 4px' }}>
          SEISMIC ACTIVITY
        </div>
        {recentQuakes.length === 0 ? (
          <div style={{ fontSize: 9, color: '#1a4a1a', padding: '4px 10px' }}>NO RECENT EVENTS</div>
        ) : (
          recentQuakes.slice(0, 5).map(q => {
            const mag = q.magnitude;
            const color = mag > 6 ? '#ff0000' : mag > 4 ? '#ff8c00' : '#00ff41';
            const place = q.place?.replace(/^\d+km\s+\w+\s+of\s+/i, '').toUpperCase() || 'UNKNOWN';
            const time = q.time?.slice(11, 19) || '';
            return (
              <div
                key={q.id}
                style={{ display: 'flex', gap: 6, padding: '3px 10px', fontSize: 9, alignItems: 'center' }}
              >
                <span style={{ color, fontWeight: 700, minWidth: 30 }}>M{mag?.toFixed(1)}</span>
                <span style={{ color: '#00cc33', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {place.slice(0, 18)}
                </span>
                <span style={{ color: '#1a4a1a', flexShrink: 0 }}>{time}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Visual mode */}
      <div style={{ borderBottom: '1px solid #0a2a0a', padding: '6px 10px' }}>
        <div style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.12em', marginBottom: 6 }}>VISUAL MODE</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              style={{
                fontSize: 9,
                padding: '3px 8px',
                background: 'transparent',
                border: `1px solid ${activeMode === m.id ? '#00ff41' : '#0a2a0a'}`,
                color: activeMode === m.id ? '#00ff41' : '#1a4a1a',
                cursor: 'pointer',
                letterSpacing: '0.1em',
                boxShadow: activeMode === m.id ? '0 0 8px rgba(0,255,65,0.3)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles */}
      <div style={{ padding: '6px 10px', flex: 1 }}>
        <div style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.12em', marginBottom: 6 }}>DATA LAYERS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {LAYERS.map(layer => {
            const active = (activeLayers || []).includes(layer.id);
            return (
              <button
                key={layer.id}
                onClick={() => onLayerToggle(layer.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: `1px solid ${active ? '#00ff41' : '#0a2a0a'}`,
                    background: active ? 'rgba(0,255,65,0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 8,
                    color: '#00ff41',
                  }}
                >
                  {active ? '✓' : ''}
                </span>
                <span style={{ fontSize: 9, color: active ? '#00ff41' : '#1a4a1a', letterSpacing: '0.1em' }}>
                  {layer.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
