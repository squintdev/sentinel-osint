'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import BootSequence from './components/BootSequence';
import Header from './components/Header';
import IntelFeed, { IntelItem } from './components/IntelFeed';
import StatusPanel, { VisualMode } from './components/StatusPanel';
import TimelineBar, { Mode } from './components/TimelineBar';
import { LayerData, CameraData, FlightData } from './components/Globe';

const Globe = dynamic(() => import('./components/Globe'), { ssr: false });
const CityMapOverlay = dynamic(() => import('./components/CityMapOverlay'), { ssr: false });

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

  const [flights, setFlights] = useState<FlightData[]>([]);
  const [earthquakes, setEarthquakes] = useState<EarthquakeItem[]>([]);
  const [satellites, setSatellites] = useState<SatelliteItem[]>([]);
  const [intel, setIntel] = useState<IntelItem[]>([]);
  const [gdeltEvents, setGdeltEvents] = useState<{id:string;lat:number;lng:number;goldstein:number;location:string;actor1:string;priority:string}[]>([]);
  const [cameras, setCameras] = useState<CameraData[]>([]);

  const [activeMode, setActiveMode] = useState<VisualMode>('clear');
  const [activeLayers, setActiveLayers] = useState(['flights', 'military', 'earthquakes', 'satellites', 'news', 'cameras']);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cityView, setCityView] = useState<{ lat: number; lng: number; distance: number }>({ lat: 0, lng: 0, distance: 6 });

  // Playback mode state — separate from live fetching.
  const [mode, setMode] = useState<Mode>('live');
  const [playbackTs, setPlaybackTs] = useState<number>(() => Date.now());
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState(true);
  const playbackTsRef = useRef(playbackTs);
  playbackTsRef.current = playbackTs;

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

  // Live polling: only active when mode === 'live'.
  useEffect(() => {
    if (!ready || mode !== 'live') return;
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
  }, [ready, mode, fetchFlights, fetchEarthquakes, fetchSatellites, fetchIntel, fetchGdelt, fetchCameras]);

  // Playback driver: advance playbackTs by (speed * dt) every 100ms while playing.
  // Pauses automatically when we reach "now" (the LIVE edge).
  useEffect(() => {
    if (mode !== 'playback' || !isPlaying) return;
    const i = setInterval(() => {
      setPlaybackTs(prev => {
        const next = prev + 100 * playbackSpeed;
        if (next >= Date.now()) {
          setIsPlaying(false);
          return Date.now();
        }
        return next;
      });
    }, 100);
    return () => clearInterval(i);
  }, [mode, isPlaying, playbackSpeed]);

  // Playback data fetcher: refetch all /api/playback/* every 500ms.
  // Cameras are NOT refetched — they're live-only (see plan). Whatever was
  // last-fetched in live mode stays on the globe.
  useEffect(() => {
    if (!ready || mode !== 'playback') return;
    const fetchPlayback = async () => {
      const t = playbackTsRef.current;
      try {
        const [f, e, s, iRes, g] = await Promise.all([
          fetch(`/api/playback/flights?t=${t}`).then(r => r.json()),
          fetch(`/api/playback/earthquakes?t=${t}`).then(r => r.json()),
          fetch(`/api/playback/satellites?t=${t}`).then(r => r.json()),
          fetch(`/api/playback/intel?t=${t}`).then(r => r.json()),
          fetch(`/api/playback/gdelt?t=${t}`).then(r => r.json()),
        ]);
        setFlights(f.flights || []);
        setEarthquakes(e.earthquakes || []);
        setSatellites(s.satellites || []);
        setIntel(iRes.items || []);
        setGdeltEvents(g.events || []);
      } catch { /* ignore */ }
    };
    fetchPlayback();
    const interval = setInterval(fetchPlayback, 500);
    return () => clearInterval(interval);
  }, [ready, mode]);

  const handleModeChange = useCallback(async (newMode: Mode) => {
    setMode(newMode);
    if (newMode !== 'playback') return;
    // Switching INTO playback: seek to 30min back IF we have that much capture,
    // otherwise to earliestTs (so we always land on data, not an empty window).
    const now = Date.now();
    const preferred = now - 30 * 60 * 1000;
    try {
      const res = await fetch('/api/timeline');
      const data = await res.json();
      if (data.earliestTs) {
        setPlaybackTs(Math.max(preferred, data.earliestTs));
      } else {
        // No capture yet — fall back to 5min back; playback APIs will return empty.
        setPlaybackTs(now - 5 * 60 * 1000);
      }
    } catch {
      setPlaybackTs(preferred);
    }
    setIsPlaying(true);
  }, []);

  const handlePlaybackTsChange = useCallback((ts: number) => {
    setPlaybackTs(ts);
    // Pause while user is scrubbing — they can hit play to resume.
    setIsPlaying(false);
  }, []);

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
                  visible={cityView.distance < 3.5}
                  layers={layers}
                  activeLayerIds={activeLayers}
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

        <TimelineBar
          mode={mode}
          onModeChange={handleModeChange}
          playbackTs={playbackTs}
          onPlaybackTsChange={handlePlaybackTsChange}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={setPlaybackSpeed}
          isPlaying={isPlaying}
          onPlayPauseToggle={() => setIsPlaying(p => !p)}
          flightCount={flights.length}
          militaryCount={militaryFlights.length}
          quakeCount={earthquakes.length}
          satCount={satellites.length}
          criticalCount={criticalCount}
          highCount={highCount}
          autoRotate={autoRotate}
          onAutoRotateToggle={() => setAutoRotate(r => !r)}
        />
      </div>
    </>
  );
}
