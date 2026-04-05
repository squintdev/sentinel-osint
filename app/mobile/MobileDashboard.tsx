/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useCallback } from 'react';

type Section = 'intel' | 'seismic' | 'flights' | 'military' | 'cameras' | null;

export default function MobileDashboard() {
  const [flights, setFlights]   = useState<any[]>([]);
  const [quakes, setQuakes]     = useState<any[]>([]);
  const [intel, setIntel]       = useState<any[]>([]);
  const [cameras, setCameras]   = useState<any[]>([]);
  const [utcTime, setUtcTime]   = useState('');
  const [lastUpdate, setLastUpdate] = useState('');
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [cameraModal, setCameraModal] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    const [f, q, i, c] = await Promise.allSettled([
      fetch('/api/flights').then(r => r.json()),
      fetch('/api/earthquakes').then(r => r.json()),
      fetch('/api/intel').then(r => r.json()),
      fetch('/api/cameras').then(r => r.json()),
    ]);
    if (f.status === 'fulfilled') setFlights(f.value.flights || []);
    if (q.status === 'fulfilled') setQuakes(q.value.earthquakes || []);
    if (i.status === 'fulfilled') setIntel(i.value.items || []);
    if (c.status === 'fulfilled') setCameras(c.value.cameras || []);
    setLastUpdate(new Date().toISOString().slice(11,19) + ' UTC');
  }, []);

  useEffect(() => {
    fetchAll();
    const tick = setInterval(() => setUtcTime(new Date().toISOString().slice(11,19)), 1000);
    const poll = setInterval(fetchAll, 30000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [fetchAll]);

  const military      = flights.filter((f: any) => f.military);
  const civilian      = flights.filter((f: any) => !f.military);
  const criticalItems = intel.filter((i: any) => i.priority === 'CRITICAL');
  // const highItems     = intel.filter((i: any) => i.priority === 'HIGH');
  const threatLevel   = criticalItems.length >= 5 ? 'CRITICAL' : criticalItems.length >= 2 ? 'HIGH' : criticalItems.length >= 1 ? 'ELEVATED' : 'LOW';
  const threatColor   = ({ CRITICAL: '#ff0000', HIGH: '#ff4444', ELEVATED: '#ff8c00', LOW: '#00ff41' } as Record<string,string>)[threatLevel];
  const priorityColor: Record<string, string> = { CRITICAL: '#ff0000', HIGH: '#ff4444', MED: '#ff8c00', LOW: '#446644' };

  const toggle = (s: Section) => setActiveSection(prev => prev === s ? null : s);

  const statTiles = [
    { key: 'flights',  label: 'FLIGHTS',  value: civilian.length,       color: '#ff8c00' },
    { key: 'military', label: 'MILITARY', value: military.length,       color: '#ff4444' },
    { key: 'seismic',  label: 'SEISMIC',  value: quakes.length,         color: '#00ff41' },
    { key: 'intel',    label: 'CRITICAL', value: criticalItems.length,  color: '#ff0000' },
    { key: 'intel',    label: 'INTEL',    value: intel.length,          color: '#00ff41' },
    { key: 'cameras',  label: 'CAMERAS',  value: cameras.length,        color: '#00ffff' },
  ];

  return (
    <div style={{ background: '#050508', minHeight: '100vh', fontFamily: 'JetBrains Mono, monospace', color: '#00ff41', maxWidth: 480, margin: '0 auto' }}>

      {/* Camera modal */}
      {cameraModal && (
        <div
          onClick={() => setCameraModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'rgba(0,8,0,0.98)', border: '1px solid #00ffff', boxShadow: '0 0 30px rgba(0,255,255,0.2)' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #003333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#00ffff', letterSpacing: '0.15em' }}>◈ LIVE CAMERA</span>
              <button onClick={() => setCameraModal(null)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #003333' }}>
              <div style={{ fontSize: 11, color: '#00ffff' }}>{cameraModal.name}</div>
              <div style={{ fontSize: 9, color: '#1a4a4a', marginTop: 2 }}>{cameraModal.city}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cameraModal.imageUrl}
              alt={cameraModal.name}
              style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
            <div style={{ padding: '6px 12px', fontSize: 8, color: '#1a4a4a', display: 'flex', justifyContent: 'space-between' }}>
              <span>{cameraModal.city === 'NYC' ? 'NYC DEPT OF TRANSPORTATION' : 'TRANSPORT FOR LONDON'}</span>
              <span style={{ color: '#00ffff' }}>● LIVE</span>
            </div>
          </div>
        </div>
      )}

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, background: '#050508', borderBottom: '1px solid #0a2a0a', padding: '10px 14px', zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, letterSpacing: '0.2em', textShadow: '0 0 8px #00ff41' }}>◈ SENTINEL</span>
          <span style={{ fontSize: 11, color: '#446644' }}>UTC {utcTime}</span>
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#446644', letterSpacing: '0.1em' }}>THREAT:</span>
          <span style={{ fontSize: 10, color: threatColor, letterSpacing: '0.15em', textShadow: `0 0 8px ${threatColor}` }}>{threatLevel}</span>
          {lastUpdate && <span style={{ fontSize: 8, color: '#1a3a1a', marginLeft: 'auto' }}>↻ {lastUpdate}</span>}
        </div>
      </div>

      {/* Stat tiles — tappable */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, margin: '1px', borderBottom: '1px solid #0a2a0a' }}>
        {statTiles.map((s, idx) => (
          <div
            key={idx}
            onClick={() => toggle(s.key as Section)}
            style={{
              padding: '12px 8px', textAlign: 'center',
              borderRight: '1px solid #0a2a0a', borderBottom: '1px solid #0a2a0a',
              cursor: 'pointer', touchAction: 'manipulation',
              background: activeSection === s.key ? `${s.color}11` : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ fontSize: 20, color: s.color, fontWeight: 700, textShadow: `0 0 6px ${s.color}` }}>{s.value}</div>
            <div style={{ fontSize: 7, color: activeSection === s.key ? s.color : '#446644', letterSpacing: '0.1em', marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 8, color: s.color, marginTop: 2 }}>{activeSection === s.key ? '▲' : '▼'}</div>
          </div>
        ))}
      </div>

      {/* SEISMIC section */}
      {(activeSection === 'seismic' || activeSection === null) && quakes.length > 0 && (
        <div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#446644', letterSpacing: '0.15em', borderBottom: '1px solid #0a2a0a', display: 'flex', justifyContent: 'space-between' }}>
            <span>SEISMIC ACTIVITY</span>
            <span style={{ color: '#1a3a1a' }}>{quakes.length} EVENTS</span>
          </div>
          {(activeSection === 'seismic' ? quakes : quakes.slice(0, 3)).map((q: any, i: number) => (
            <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid #050510', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: q.magnitude >= 6 ? '#ff0000' : q.magnitude >= 4 ? '#ff8c00' : '#00ff41' }}>
                  M{q.magnitude?.toFixed(1)}
                </span>
                <span style={{ fontSize: 10, color: '#446644', marginLeft: 8 }}>{q.place?.slice(0, 28)}</span>
              </div>
              <span style={{ fontSize: 8, color: '#1a3a1a' }}>{new Date(q.time).toISOString().slice(11,16)}</span>
            </div>
          ))}
        </div>
      )}

      {/* FLIGHTS section */}
      {activeSection === 'flights' && (
        <div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#446644', letterSpacing: '0.15em', borderBottom: '1px solid #0a2a0a', display: 'flex', justifyContent: 'space-between' }}>
            <span>CIVILIAN FLIGHTS</span><span style={{ color: '#1a3a1a' }}>{civilian.length} TRACKED</span>
          </div>
          {civilian.slice(0, 40).map((f: any, i: number) => (
            <div key={i} style={{ padding: '7px 14px', borderBottom: '1px solid #050510', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#ff8c00' }}>{f.callsign}</span>
              <span style={{ fontSize: 9, color: '#446644' }}>{f.country}</span>
              <span style={{ fontSize: 9, color: '#1a3a1a' }}>{f.altitude ? `${Math.round(f.altitude).toLocaleString()}ft` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* MILITARY section */}
      {activeSection === 'military' && (
        <div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#ff4444', letterSpacing: '0.15em', borderBottom: '1px solid #0a2a0a', display: 'flex', justifyContent: 'space-between' }}>
            <span>MILITARY FLIGHTS</span><span style={{ color: '#1a3a1a' }}>{military.length} TRACKED</span>
          </div>
          {military.map((f: any, i: number) => (
            <div key={i} style={{ padding: '9px 14px', borderBottom: '1px solid #1a0000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: '#ff4444', fontWeight: 700 }}>{f.callsign}</span>
                {f.description && <span style={{ fontSize: 9, color: '#446644', marginLeft: 8 }}>{f.description.slice(0,30)}</span>}
              </div>
              <span style={{ fontSize: 9, color: '#ff4444', opacity: 0.6 }}>{f.country?.slice(0,20)}</span>
            </div>
          ))}
        </div>
      )}

      {/* INTEL section */}
      {(activeSection === 'intel' || activeSection === null) && (
        <div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#446644', letterSpacing: '0.15em', borderBottom: '1px solid #0a2a0a', borderTop: '1px solid #0a2a0a', display: 'flex', justifyContent: 'space-between' }}>
            <span>INTEL FEED</span><span style={{ color: '#1a3a1a' }}>{intel.length} ITEMS</span>
          </div>
          {intel.map((item: any, i: number) => (
            <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid #0a1a0a', touchAction: 'manipulation' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 8, padding: '1px 5px', border: `1px solid ${priorityColor[item.priority] || '#446644'}`, color: priorityColor[item.priority] || '#446644', letterSpacing: '0.1em' }}>{item.priority}</span>
                <span style={{ fontSize: 8, color: '#446644', letterSpacing: '0.1em' }}>{item.category}</span>
                <span style={{ fontSize: 8, color: '#1a3a1a', marginLeft: 'auto' }}>{item.timestamp}</span>
              </div>
              <div style={{ fontSize: 12, color: '#ccffcc', lineHeight: 1.4, marginBottom: 5 }}>{item.headline}</div>
              {item.entities?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                  {item.entities.map((e: string, j: number) => (
                    <span key={j} style={{ fontSize: 8, color: '#ff8c00', border: '1px solid #3a2a00', padding: '1px 4px' }}>{e}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 9, color: '#446644' }}>{item.source}</div>
            </div>
          ))}
        </div>
      )}

      {/* CAMERAS section */}
      {activeSection === 'cameras' && (
        <div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#00ffff', letterSpacing: '0.15em', borderBottom: '1px solid #003333', display: 'flex', justifyContent: 'space-between' }}>
            <span>LIVE CAMERAS</span><span style={{ color: '#1a3a1a' }}>{cameras.length} ONLINE · TAP TO VIEW</span>
          </div>
          {cameras.map((cam: any, i: number) => (
            <div
              key={i}
              onClick={() => setCameraModal(cam)}
              style={{ padding: '10px 14px', borderBottom: '1px solid #001a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', touchAction: 'manipulation'}}
            >
              <div>
                <div style={{ fontSize: 11, color: '#00ffff' }}>{cam.name}</div>
                <div style={{ fontSize: 8, color: '#1a4a4a', marginTop: 2 }}>{cam.city}</div>
              </div>
              <span style={{ fontSize: 12, color: '#00ffff', opacity: 0.5 }}>▶</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 14px', borderTop: '1px solid #0a2a0a', fontSize: 8, color: '#1a3a1a', letterSpacing: '0.1em', textAlign: 'center' }}>
        SENTINEL OSINT PLATFORM · AUTHORIZED ACCESS ONLY · <a href="/" style={{ color: '#446644' }}>FULL DISPLAY ↗</a>
      </div>
    </div>
  );
}
