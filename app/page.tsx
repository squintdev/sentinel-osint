'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import BootSequence from './components/BootSequence';
import Header from './components/Header';
import IntelFeed, { IntelItem } from './components/IntelFeed';
import StatusPanel, { VisualMode } from './components/StatusPanel';
import { LayerData, CameraData } from './components/Globe';

const Globe = dynamic(() => import('./components/Globe'), { ssr: false });
const CityMapOverlay = dynamic(() => import('./components/CityMapOverlay'), { ssr: false });

interface FlightItem {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  military: boolean;
}

interface EarthquakeItem {
  id: string;
  magnitude: number;
  place: string;
  lat: number;
  lng: number;
  time: string;
}

interface SatelliteItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);

  const [flights, setFlights] = useState<FlightItem[]>([]);
  const [earthquakes, setEarthquakes] = useState<EarthquakeItem[]>([]);
  const [satellites, setSatellites] = useState<SatelliteItem[]>([]);
  const [intel, setIntel] = useState<IntelItem[]>([]);
  const [gdeltEvents, setGdeltEvents] = useState<{id:string;lat:number;lng:number;goldstein:number;location:string;actor1:string;priority:string}[]>([]);
  const [cameras, setCameras] = useState<CameraData[]>([]);

  const [activeMode, setActiveMode] = useState<VisualMode>('clear');
  const [activeLayers, setActiveLayers] = useState(['flights', 'military', 'earthquakes', 'satellites', 'news', 'cameras']);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cityView, setCityView] = useState<{ lat: number; lng: number; distance: number }>({ lat: 0, lng: 0, distance: 6 });

  const lastCityView = useRef<{ lat: number; lng: number; distance: number; ts: number } | null>(null);
  const handleCameraMove = useCallback((lat: number, lng: number, distance: number) => {
    const now = Date.now();
    const prev = lastCityView.current;
    // Throttle: skip update if nothing changed meaningfully or it's been < 150ms
    if (prev && now - prev.ts < 150 &&
        Math.abs(prev.distance - distance) < 0.03 &&
        Math.abs(prev.lat - lat) < 0.3 &&
        Math.abs(prev.lng - lng) < 0.3) return;
    lastCityView.current = { lat, lng, distance, ts: now };
    setCityView({ lat, lng, distance });
  }, []);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch('/api/flights');
      const data = await res.json();
      setFlights(data.flights || []);
    } catch {}
  }, []);

  const fetchEarthquakes = useCallback(async () => {
    try {
      const res = await fetch('/api/earthquakes');
      const data = await res.json();
      setEarthquakes(data.earthquakes || []);
    } catch {}
  }, []);

  const fetchSatellites = useCallback(async () => {
    try {
      const res = await fetch('/api/satellites');
      const data = await res.json();
      setSatellites(data.satellites || []);
    } catch {}
  }, []);

  const fetchIntel = useCallback(async () => {
    try {
      const res = await fetch('/api/intel');
      const data = await res.json();
      if (data.items?.length > 0) {
        setIntel(prev => {
          const newItems = data.items.filter((item: IntelItem) => !prev.find(p => p.headline === item.headline));
          return [...newItems, ...prev].slice(0, 20);
        });
      }
    } catch {}
  }, []);

  const fetchGdelt = useCallback(async () => {
    try {
      const res = await fetch('/api/gdelt');
      if (!res.ok) return;
      const data = await res.json();
      setGdeltEvents(data.events || []);
    } catch { /* ignore */ }
  }, []);

  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch('/api/cameras');
      const data = await res.json();
      setCameras(data.cameras || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchFlights();
    fetchEarthquakes();
    fetchSatellites();
    fetchIntel();
    fetchGdelt();
    fetchCameras();

    const intervals = [
      setInterval(fetchFlights, 30000),
      setInterval(fetchEarthquakes, 60000),
      setInterval(fetchSatellites, 10000),
      setInterval(fetchIntel, 45000),
      setInterval(fetchGdelt, 900000),
      setInterval(fetchCameras, 300000),
    ];
    return () => intervals.forEach(clearInterval);
  }, [ready, fetchFlights, fetchEarthquakes, fetchSatellites, fetchIntel, fetchGdelt, fetchCameras]);

  const handleBootComplete = useCallback(() => {
    setBooting(false);
    setTimeout(() => setReady(true), 100);
  }, []);

  const handleLayerToggle = useCallback((layer: string) => {
    setActiveLayers(prev =>
      prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]
    );
  }, []);

  const layers: LayerData = {
    flights,
    earthquakes,
    satellites,
    intel,
    gdelt: gdeltEvents,
    cameras,
  };

  const criticalCount = intel.filter(i => i.priority === 'CRITICAL').length;
  const highCount = intel.filter(i => i.priority === 'HIGH').length;
  const militaryFlights = flights.filter(f => f.military);

  const modeClass = activeMode !== 'clear' ? `mode-${activeMode}` : '';

  return (
    <>
      {booting && <BootSequence onComplete={handleBootComplete} />}
      <div
        className={modeClass}
        style={{
          position: 'fixed',
          inset: 0,
          background: '#050508',
          display: 'flex',
          flexDirection: 'column',
          opacity: booting ? 0 : 1,
          transition: 'opacity 0.5s ease',
        }}
      >
        {/* Header */}
        <Header criticalCount={criticalCount} />

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 1, padding: 1 }}>
          {/* Left panel — intel feed */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <IntelFeed items={intel} />
          </div>

          {/* Center — globe */}
          <div style={{ flex: 1, position: 'relative' }}>
            {ready && (
              <>
                <Globe layers={layers} activeLayerIds={activeLayers} autoRotate={autoRotate} onCameraMove={handleCameraMove} />
                <CityMapOverlay
                  lat={cityView.lat}
                  lng={cityView.lng}
                  distance={cityView.distance}
                  visible={cityView.distance < 2.5}
                />
              </>
            )}
            {!ready && (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#1a4a1a', fontSize: 11, letterSpacing: '0.1em',
              }}>
                INITIALIZING GLOBE...
              </div>
            )}
          </div>

          {/* Right panel — status */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <StatusPanel
              flightCount={flights.length}
              militaryCount={militaryFlights.length}
              quakeCount={earthquakes.length}
              satelliteCount={satellites.length}
              newsCount={intel.length}
              cameraCount={cameras.length}
              recentQuakes={earthquakes}
              activeMode={activeMode}
              onModeChange={setActiveMode}
              activeLayers={activeLayers}
              onLayerToggle={handleLayerToggle}
            />
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="panel"
          style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderTop: '1px solid #0a2a0a',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
              FLIGHTS: <span className="glow" style={{ fontSize: 9 }}>{flights.length}</span>
            </span>
            <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
              MIL: <span style={{ color: '#ff4444', fontSize: 9 }}>{militaryFlights.length}</span>
            </span>
            <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
              QUAKES: <span className="glow" style={{ fontSize: 9 }}>{earthquakes.length}</span>
            </span>
            <span style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
              SATS: <span className="glow" style={{ fontSize: 9 }}>{satellites.length}</span>
            </span>
            <button
              onClick={() => setAutoRotate(r => !r)}
              style={{
                background: 'none',
                border: `1px solid ${autoRotate ? '#00ff41' : '#333'}`,
                color: autoRotate ? '#00ff41' : '#555',
                cursor: 'pointer',
                fontSize: 9,
                letterSpacing: '0.1em',
                padding: '2px 8px',
                fontFamily: 'inherit',
              }}
            >
              {autoRotate ? '⟳ ROTATE ON' : '⟳ ROTATE OFF'}
            </button>
          </div>

          <div style={{ fontSize: 9, color: '#1a4a1a', letterSpacing: '0.1em' }}>
            SENTINEL OSINT PLATFORM — AUTHORIZED ACCESS ONLY — CLASSIFICATION: SECRET//NOFORN — <a href="/mobile" style={{ fontSize: 8, color: "#1a3a1a", letterSpacing: "0.1em" }}>📱 MOBILE</a>
          </div>

          <div style={{ fontSize: 9, letterSpacing: '0.1em', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: criticalCount > 0 ? '#ff0000' : '#1a4a1a' }}>
              CRITICAL: <span style={{ color: criticalCount > 0 ? '#ff0000' : '#00ff41' }}>{criticalCount}</span>
            </span>
            <span style={{ color: '#333' }}>|</span>
            <span style={{ color: highCount > 0 ? '#ff8c00' : '#1a4a1a' }}>
              HIGH: <span style={{ color: highCount > 0 ? '#ff8c00' : '#00ff41' }}>{highCount}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
