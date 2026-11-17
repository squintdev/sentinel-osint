'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// @ts-expect-error - three examples not typed
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export interface FlightData {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  military: boolean;
  altitude?: number;       // feet
  speed?: number;          // knots
  heading?: number;        // degrees
  squawk?: string;
  country?: string;
  type?: string;           // ICAO type code (military feed only)
  description?: string;    // full aircraft name (military feed only)
  operator?: string;       // military feed only
}

export interface EarthquakeData {
  id: string;
  magnitude: number;
  place?: string;
  lat: number;
  lng: number;
  depth?: number;
}

export interface SatelliteData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  altitude?: number;
}

export interface IntelData {
  id: string;
  lat?: number;
  lng?: number;
  priority: string;
  category?: string;
}

export interface GdeltData {
  id: string;
  lat: number;
  lng: number;
  goldstein: number;
  location: string;
  actor1: string;
  priority: string;
}

export interface CameraData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  imageUrl: string;
  online: boolean;
}

export interface CyberAttackData {
  id: string;
  lat: number | null;
  lng: number | null;
  victim: string;
  sector: string;
  country: string;
  countryCode: string;
  group: string;
  date: string;
  website?: string;
}

export interface CyberSourceData {
  id: string;
  lat: number;
  lng: number;
  country: string;
  countryCode: string;
  blocks: number;
  hits: number;
}

export interface LayerData {
  flights: FlightData[];
  earthquakes: EarthquakeData[];
  satellites: SatelliteData[];
  intel: IntelData[];
  gdelt?: GdeltData[];
  cameras?: CameraData[];
  cyberAttacks?: CyberAttackData[];
  cyberSources?: CyberSourceData[];
}

interface GlobeProps {
  layers: LayerData;
  activeLayerIds: string[];
  autoRotate: boolean;
  onCameraMove?: (lat: number, lng: number, distance: number) => void;
}

interface ClickedItem {
  type: 'flight' | 'earthquake' | 'satellite' | 'news' | 'camera' | 'attack' | 'cybersrc';
  data: FlightData | EarthquakeData | SatelliteData | IntelData | GdeltData | CyberAttackData | CyberSourceData;
  screenX: number;
  screenY: number;
}

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function makePlaneSprite(color: string, size = 0.07): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = color;
  ctx.font = 'bold 44px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✈', 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  sprite.userData.baseScale = size;
  return sprite;
}

function DetailPopup({ item, onClose }: { item: ClickedItem; onClose: () => void }) {
  const { type, data, screenX, screenY } = item;
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState<string>('');
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (type !== 'camera') return;
    const i = setInterval(() => setRefreshTick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, [type]);

  const lines: string[] = [];
  if (type === 'flight') {
    const f = data as FlightData;
    const fmt = (n: number) => n.toLocaleString('en-US');
    lines.push(`CALLSIGN: ${f.callsign || 'UNKNOWN'}`);
    if (f.description) lines.push(`AIRCRAFT: ${f.description}`);
    else if (f.type) lines.push(`TYPE CODE: ${f.type}`);
    if (f.operator) lines.push(`OPERATOR: ${f.operator}`);
    else if (f.country) lines.push(`COUNTRY: ${f.country.toUpperCase()}`);
    const altSpd: string[] = [];
    if (f.altitude != null && f.altitude > 0) altSpd.push(`ALT ${fmt(f.altitude)} FT`);
    if (f.speed != null && f.speed > 0) altSpd.push(`SPD ${Math.round(f.speed)} KT`);
    if (altSpd.length) lines.push(altSpd.join('  '));
    const hdgSq: string[] = [];
    if (f.heading != null) hdgSq.push(`HDG ${String(Math.round(f.heading)).padStart(3, '0')}°`);
    if (f.squawk) hdgSq.push(`SQ ${f.squawk}`);
    if (hdgSq.length) lines.push(hdgSq.join('  '));
    lines.push(`POS: ${f.lat?.toFixed(2)}° / ${f.lng?.toFixed(2)}°`);
    lines.push(`[${f.military ? 'MILITARY' : 'CIVILIAN'}]`);
  } else if (type === 'earthquake') {
    const e = data as EarthquakeData;
    lines.push(`MAGNITUDE: ${e.magnitude?.toFixed(1)}`);
    lines.push(`LOCATION: ${e.place || 'UNKNOWN'}`);
    lines.push(`DEPTH: ${e.depth?.toFixed(1) ?? '?'} km`);
  } else if (type === 'satellite') {
    const s = data as SatelliteData;
    lines.push(`NAME: ${s.name}`);
    lines.push(`ALT: ${s.altitude ?? '?'} km`);
    lines.push(`LAT: ${s.lat?.toFixed(2)} / LNG: ${s.lng?.toFixed(2)}`);
  } else if (type === 'attack') {
    const a = data as CyberAttackData;
    lines.push(`VICTIM: ${a.victim}`);
    lines.push(`THREAT GROUP: ${a.group}`);
    lines.push(`SECTOR: ${a.sector}`);
    lines.push(`COUNTRY: ${a.country}`);
    if (a.date) lines.push(`OBSERVED: ${a.date.slice(0, 16)}`);
    lines.push(a.lat != null && a.lng != null ? `POS: ${a.lat.toFixed(2)}° / ${a.lng.toFixed(2)}°` : 'POS: UNRESOLVED');
    if (a.website) lines.push('__URL__' + (a.website.startsWith('http') ? a.website : `https://${a.website}`));
  } else if (type === 'cybersrc') {
    const s = data as CyberSourceData;
    lines.push(`SOURCE COUNTRY: ${s.country}`);
    lines.push(`BLOCK HITS (24H): ${s.hits.toLocaleString('en-US')}`);
    lines.push(`TOP NETBLOCKS: ${s.blocks}`);
    lines.push('SRC: DSHIELD BLOCKLIST');
  } else if (type === 'camera') {
    const c = data as unknown as CameraData;
    lines.push(`__CAM_NAME__${c.name}`);
    lines.push(`__CAM_CITY__${c.city}`);
    lines.push(`__CAM_IMG__${c.imageUrl}`);
  } else {
    const n = data as (IntelData & { goldstein?: number; location?: string; actor1?: string; actor2?: string; sourceUrl?: string; tone?: number; numMentions?: number; headline?: string });
    if (n.goldstein !== undefined) {
      lines.push(`SEVERITY: ${n.goldstein?.toFixed(1)} (${n.goldstein <= -8 ? 'EXTREME' : n.goldstein <= -5 ? 'HIGH' : 'MED'})`);
      if (n.location) lines.push(`LOCATION: ${n.location}`);
      if (n.actor1) lines.push(`ACTOR 1: ${n.actor1}`);
      if (n.actor2) lines.push(`ACTOR 2: ${n.actor2}`);
      if (n.numMentions) lines.push(`MENTIONS: ${n.numMentions}`);
      if (n.sourceUrl) lines.push('__URL__' + n.sourceUrl);
    } else {
      if (n.headline) lines.push(`${n.headline.slice(0, 80)}`);
      lines.push(`PRIORITY: ${n.priority}`);
      if (n.lat && n.lng) lines.push(`LAT: ${n.lat?.toFixed(2)} / LNG: ${n.lng?.toFixed(2)}`);
    }
  }

  if (type === 'camera') {
    const camName = lines.find(l => l.startsWith('__CAM_NAME__'))?.slice(12) || '';
    const camCity = lines.find(l => l.startsWith('__CAM_CITY__'))?.slice(12) || '';
    const camImg  = lines.find(l => l.startsWith('__CAM_IMG__'))?.slice(11) || '';
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: '80vw', maxWidth: 1400, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,8,0,0.97)', border: '1px solid #00ffff',
          boxShadow: '0 0 40px rgba(0,255,255,0.2)', fontFamily: 'JetBrains Mono, monospace',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #003333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 9, color: '#00ffff', letterSpacing: '0.15em' }}>◈ LIVE CAMERA FEED</span>
              <span style={{ fontSize: 9, color: '#1a4a4a', marginLeft: 12 }}>{camCity}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #003333' }}>
            <span style={{ fontSize: 10, color: '#00ffff' }}>{camName}</span>
          </div>
          {camImg && (
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/camera-image?url=${encodeURIComponent(camImg)}&_t=${refreshTick}`}
                alt={camName}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; (e.target as HTMLImageElement).alt = 'Feed unavailable'; }}
                onLoad={e => {
                  (e.target as HTMLImageElement).style.opacity = '1';
                  setLastFrameAt(new Date().toISOString().slice(11, 19));
                  setFlashKey(k => k + 1);
                }}
              />
              <div key={flashKey} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'rgba(0,255,255,0.15)', animation: 'cam-flash 0.4s ease-out forwards' }} />
              <style>{`@keyframes cam-flash { from { opacity: 1; } to { opacity: 0; } }`}</style>
            </div>
          )}
          <div style={{ padding: '6px 12px', fontSize: 8, color: '#1a4a4a', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
            <span>SOURCE: {
              camCity === 'NYC' ? 'NYC DOT' :
              camCity === 'London' ? 'TRANSPORT FOR LONDON' :
              camCity === 'San Francisco' || camCity === 'Los Angeles' || camCity === 'Orange County' || camCity === 'San Diego' || camCity === 'Sacramento / Truckee' ? 'CALTRANS' :
              camCity === 'Reno' || camCity === 'Las Vegas' || camCity === 'Carson City' || camCity === 'Lake Tahoe' || camCity === 'Nevada' ? 'NEVADA DOT' :
              camCity === 'Miami' || camCity === 'Orlando' || camCity === 'Tampa' || camCity === 'Jacksonville' || camCity === 'Fort Lauderdale' || camCity === 'West Palm Beach' || camCity === 'Tallahassee' || camCity === 'Florida' ? 'FDOT / FL511' :
              camCity === 'Toronto' ? 'CITY OF TORONTO' :
              camCity === 'Singapore' ? 'LTA DATA.GOV.SG' :
              'INSECAM // OPEN IP CAM'
            }</span>
            <span style={{ color: '#00ffff' }}>
              {lastFrameAt ? `FRAME: ${lastFrameAt} UTC` : 'LOADING...'} · ● LIVE
            </span>
          </div>
        </div>
      </div>
    );
  }

  const left = Math.min(screenX + 10, window.innerWidth - 300);
  const top = Math.min(screenY - 10, window.innerHeight - 140);
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'fixed', left, top, width: 280, background: 'rgba(0,8,0,0.95)',
      border: '1px solid #ff8c00', boxShadow: '0 0 20px rgba(255,140,0,0.3)',
      padding: '8px 10px', zIndex: 1000, fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid #1a3a0a', paddingBottom: 4 }}>
        <span style={{ fontSize: 9, color: '#ff8c00', letterSpacing: '0.15em' }}>◈ {type.toUpperCase()} DETAIL</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
      </div>
      {lines.map((line, i) => {
        if (line.startsWith('__URL__')) {
          const url = line.slice(7);
          let hostname = url;
          try { hostname = new URL(url).hostname.replace('www.',''); } catch {}
          return (<div key={i} style={{ fontSize: 9, marginBottom: 3 }}>
            <span style={{ color: '#1a4a1a', letterSpacing: '0.1em' }}>SOURCE: </span>
            <a href={url} target="_blank" rel="noreferrer" style={{ color: '#ff8c00', letterSpacing: '0.1em', textDecoration: 'underline', cursor: 'pointer' }}>{hostname} ↗</a>
          </div>);
        }
        if (line.startsWith('__CAM_NAME__') || line.startsWith('__CAM_CITY__') || line.startsWith('__CAM_IMG__')) return null;
        return <div key={i} style={{ fontSize: 9, color: '#00ff41', letterSpacing: '0.1em', marginBottom: 3 }}>{line}</div>;
      })}
    </div>
  );
}

function shortLabel(item: ClickedItem): { title: string; sub: string; color: string } {
  if (item.type === 'flight') {
    const f = item.data as FlightData;
    return { title: f.callsign || f.type || 'UNKNOWN', sub: f.military ? 'MILITARY' : (f.country?.toUpperCase() || 'CIVILIAN'), color: f.military ? '#ff4444' : '#ff8c00' };
  }
  if (item.type === 'camera') {
    const c = item.data as unknown as CameraData;
    return { title: c.name, sub: c.city, color: '#00ffff' };
  }
  if (item.type === 'earthquake') {
    const e = item.data as EarthquakeData;
    return { title: `M ${e.magnitude?.toFixed(1)}`, sub: e.place || '—', color: '#00ff41' };
  }
  if (item.type === 'satellite') {
    const s = item.data as SatelliteData;
    return { title: s.name, sub: `${s.altitude ?? '?'} km`, color: '#ffffff' };
  }
  if (item.type === 'attack') {
    const a = item.data as CyberAttackData;
    return { title: a.victim.slice(0, 40), sub: `${a.group} · ${a.countryCode || a.country}`, color: '#ff2244' };
  }
  if (item.type === 'cybersrc') {
    const s = item.data as CyberSourceData;
    return { title: `${s.country} ATTACK SOURCE`, sub: `${s.hits.toLocaleString('en-US')} BLOCK HITS`, color: '#ffee00' };
  }
  const n = item.data as IntelData & { goldstein?: number; location?: string; headline?: string };
  return { title: n.headline?.slice(0, 40) || n.location || 'EVENT', sub: n.goldstein !== undefined ? `SEV ${n.goldstein.toFixed(1)}` : (n.priority || ''), color: '#4488ff' };
}

function ItemPicker({ items, screenX, screenY, onSelect, onClose }: { items: ClickedItem[]; screenX: number; screenY: number; onSelect: (item: ClickedItem) => void; onClose: () => void }) {
  const width = 240; const rowH = 32; const maxH = Math.min(items.length, 8) * rowH + 28;
  const left = Math.min(screenX + 10, window.innerWidth - width - 10);
  const top = Math.min(screenY - 10, window.innerHeight - maxH - 10);
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left, top, width, background: 'rgba(0,8,0,0.95)', border: '1px solid #00ffff', boxShadow: '0 0 20px rgba(0,255,255,0.25)', zIndex: 1500, fontFamily: 'JetBrains Mono, monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #003333' }}>
        <span style={{ fontSize: 9, color: '#00ffff', letterSpacing: '0.15em' }}>◈ {items.length} ITEMS AT CURSOR</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
      </div>
      <div style={{ maxHeight: 8 * rowH, overflowY: 'auto' }}>
        {items.map((it, i) => {
          const { title, sub, color } = shortLabel(it);
          return (
            <div key={i} onClick={() => onSelect(it)} style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: i < items.length - 1 ? '1px solid #002222' : 'none', display: 'flex', flexDirection: 'column', gap: 2 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: 10, color, letterSpacing: '0.1em' }}><span style={{ color: '#1a4a4a', marginRight: 6 }}>{it.type.toUpperCase()}</span>{title}</div>
              <div style={{ fontSize: 8, color: '#1a4a4a', letterSpacing: '0.1em' }}>{sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ViewInfo { lat: number; lng: number; distance: number; nearest?: { name: string; city: string; kmAway: number }; }

function LocationHUD({ info }: { info: ViewInfo }) {
  const altKm = Math.max(0, (info.distance - 2) * 6371 / 2);
  const latHemi = info.lat >= 0 ? 'N' : 'S';
  const lngHemi = info.lng >= 0 ? 'E' : 'W';
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(0,8,0,0.75)', border: '1px solid #1a4a4a', padding: '6px 10px', pointerEvents: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#00ffff', letterSpacing: '0.12em', minWidth: 180 }}>
      <div style={{ color: '#1a4a4a', fontSize: 8, marginBottom: 3 }}>◈ VIEW CENTER</div>
      <div>{Math.abs(info.lat).toFixed(2)}°{latHemi} {Math.abs(info.lng).toFixed(2)}°{lngHemi}</div>
      <div style={{ color: '#1a4a4a', fontSize: 8, marginTop: 2 }}>ALT {altKm > 999 ? `${(altKm / 1000).toFixed(1)}Mm` : `${Math.round(altKm)}km`}</div>
      {info.nearest && (
        <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px solid #003333' }}>
          <div style={{ color: '#1a4a4a', fontSize: 8 }}>◉ NEAREST CAM</div>
          <div style={{ color: '#00ffff', marginTop: 2 }}>{info.nearest.city}</div>
          <div style={{ color: '#1a4a4a', fontSize: 8, marginTop: 1 }}>{info.nearest.kmAway < 10 ? `${info.nearest.kmAway.toFixed(1)} km` : `${Math.round(info.nearest.kmAway)} km`} away</div>
        </div>
      )}
    </div>
  );
}

// ── Container helpers (module scope) ──
type ContType = 'inst' | 'sprites' | 'gdelt' | 'points';

interface Container {
  readonly kind: ContType;
  maxCount: number;
  count: number;
  itemCounts?: number[];
  // Unified fields — populated depending on kind
  mesh?: THREE.InstancedMesh | null;       // for 'inst' and news (single InstancedMesh)
  meshes?: THREE.InstancedMesh[];           // for 'gdelt' (3 severity groups)
  sprites?: THREE.Sprite[];                 // for 'sprites' (flight/military)
  points?: THREE.Points;                    // for 'points' (cameras)
}

function isInst(c: Container): c is Container & { mesh: THREE.InstancedMesh } {
  return c.kind === 'inst';
}
function isGdelt(c: Container): c is Container & { meshes: THREE.InstancedMesh[]; itemCounts: number[] } {
  return c.kind === 'gdelt';
}
function isSprites(c: Container): c is Container & { sprites: THREE.Sprite[] } {
  return c.kind === 'sprites';
}
function isPoints(c: Container): boolean {
  return c.kind === 'points';
}

function makeRenderables(c: Container): THREE.Object3D[] {
  switch (c.kind) {
    case 'inst':     return [c.mesh!];
    case 'gdelt':    return c.meshes ?? [];
    case 'sprites':  return c.sprites ?? [];
    case 'points':   return c.points ? [c.points] : [];
  }
}

function activeLayerIdsToKeySet(activeLayers: string[], gdeltCount: number): Array<string> {
  const keys: string[] = [];
  if (activeLayers.includes('earthquakes')) keys.push('earthquake');
  if (activeLayers.includes('flights'))      keys.push('flight_civilian');
  if (activeLayers.includes('military'))     keys.push('military');
  if (activeLayers.includes('satellites'))   keys.push('satellite');
  if (activeLayers.includes('iss'))          keys.push('iss');
  if (activeLayers.includes('news')) {
    keys.push('news');
    if (gdeltCount > 0) keys.push('news_gdelt');
  }
  if (activeLayers.includes('cameras'))      keys.push('cameras');
  if (activeLayers.includes('cyber')) {
    keys.push('cyber_attacks');
    keys.push('cyber_sources');
  }
  return keys;
}

function initContainer(key: string): Container {
  switch (key) {
    case 'earthquake': {
      const geo = new THREE.SphereGeometry(0.016, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
      const mesh = new THREE.InstancedMesh(geo, mat, 200);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 200, count: 0, mesh };
    }
    case 'flight_civilian':
    case 'military':
      return { kind: 'sprites', maxCount: 2500, count: 0, sprites: [], mesh: null };
    case 'satellite': {
      const geo = new THREE.SphereGeometry(0.014, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, 32);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 32, count: 0, mesh };
    }
    case 'iss': {
      const geo = new THREE.SphereGeometry(0.028, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00cc33 });
      const mesh = new THREE.InstancedMesh(geo, mat, 2);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 2, count: 0, mesh };
    }
    case 'news': {
      const geo = new THREE.SphereGeometry(0.015, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
      const mesh = new THREE.InstancedMesh(geo, mat, 50);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 50, count: 0, mesh };
    }
    case 'news_gdelt': {
      const caps = [32, 32, 32];
      const colors = [0xff2222, 0xff6600, 0xff9944];
      const meshes: THREE.InstancedMesh[] = [];
      for (let g = 0; g < 3; g++) {
        const geo = new THREE.SphereGeometry(0.012, 5, 5);
        const mat = new THREE.MeshBasicMaterial({ color: colors[g] });
        meshes.push(new THREE.InstancedMesh(geo, mat, caps[g]));
      }
      return { kind: 'gdelt', maxCount: 96, count: 0, meshes, itemCounts: [0, 0, 0], mesh: null };
    }
    case 'cyber_attacks': {
      const geo = new THREE.OctahedronGeometry(0.022, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
      const mesh = new THREE.InstancedMesh(geo, mat, 96);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 96, count: 0, mesh };
    }
    case 'cyber_sources': {
      const geo = new THREE.TetrahedronGeometry(0.018, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
      const mesh = new THREE.InstancedMesh(geo, mat, 32);
      mesh.userData.noScale = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind: 'inst', maxCount: 32, count: 0, mesh };
    }
    case 'cameras': {
      const caps = 512;
      const positions = new Float32Array(caps * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const camCanvas = document.createElement('canvas');
      camCanvas.width = 16; camCanvas.height = 16;
      const ctx = camCanvas.getContext('2d')!;
      ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#003333'; ctx.beginPath(); ctx.arc(8, 8, 3, 0, Math.PI * 2); ctx.fill();
      const tex = new THREE.CanvasTexture(camCanvas);
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, map: tex, transparent: true, sizeAttenuation: true, alphaTest: 0.1 });
      const points = new THREE.Points(geo, mat);
      points.userData.noScale = true;
      return { kind: 'points', maxCount: caps, count: 0, points, mesh: null };
    }
    default: return { kind: 'inst', maxCount: 0, count: 0, mesh: null };
  }
}

function disposeContainer(c: Container) {
  if (isGdelt(c) && c.meshes) {
    for (const m of c.meshes) { m.geometry.dispose(); ((m.material as THREE.Material) as THREE.Material).dispose(); }
  } else if (isInst(c) && c.mesh?.isInstancedMesh) {
    c.mesh.geometry.dispose();
    const ma = c.mesh.material;
    if (Array.isArray(ma)) { for (const m of ma) m.dispose(); } else { ma.dispose(); }
    } else if (isSprites(c) && c.sprites) {
    for (const s of c.sprites) { (s as THREE.Sprite).material.dispose(); }
  } else if (isPoints(c) && (c as Container & { points: THREE.Points }).points) {
    const p = (c as Container & { points: THREE.Points }).points;
    p.geometry.dispose();
   }
}

function growInstancedMesh(container: Container & { mesh: THREE.InstancedMesh }, pointsGroup: THREE.Group, newCapacity: number) {
  const oldMesh = container.mesh;
  const geo = oldMesh.geometry;
  const mat = oldMesh.material as THREE.Material;
  const newMesh = new THREE.InstancedMesh(geo.clone(), mat.clone(), newCapacity);
  newMesh.userData.noScale = true;
  newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < container.count; i++) {
    const om = new THREE.Matrix4(); oldMesh.getMatrixAt(i, om); newMesh.setMatrixAt(i, om);
  }
  pointsGroup.remove(oldMesh);
  geo.dispose(); mat.dispose();
  pointsGroup.add(newMesh);
  container.mesh = newMesh;
}

export default function Globe({ layers, activeLayerIds, autoRotate, onCameraMove }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef(autoRotate);
  const onCameraMoveRef = useRef(onCameraMove);
  onCameraMoveRef.current = onCameraMove;
  const layersRef = useRef(layers);
  const activeLayerIdsRef = useRef(activeLayerIds);
  layersRef.current = layers;
  activeLayerIdsRef.current = activeLayerIds;

  // Persistent containers keyed by unique layer id string
  // Created once when a toggle turns ON, disposed when it turns OFF.
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: InstanceType<typeof OrbitControls>;
    earthMesh: THREE.Mesh;
    globeGroup: THREE.Group;
    pointsGroup: THREE.Group;
    bordersGroup: THREE.Group;
    atmMesh: THREE.Mesh;
    containers: Record<string, Container>;
    _prevLayerKeys: string[];
    pointMeta: Array<{ mesh: THREE.Object3D; type: 'flight' | 'earthquake' | 'satellite' | 'news' | 'camera' | 'attack' | 'cybersrc'; data: FlightData | EarthquakeData | SatelliteData | IntelData | GdeltData | CameraData | CyberAttackData | CyberSourceData; instanceId?: number }>;
    animId: number;
  } | null>(null);

  const [clickedItem, setClickedItem] = useState<ClickedItem | null>(null);
  const [pickerItems, setPickerItems] = useState<{ items: ClickedItem[]; screenX: number; screenY: number } | null>(null);
  const [viewInfo, setViewInfo] = useState<{ lat: number; lng: number; distance: number; nearest?: { name: string; city: string; kmAway: number } } | null>(null);
  const viewInfoRef = useRef(viewInfo);
  viewInfoRef.current = viewInfo;

  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sceneRef.current || !mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const vi = viewInfoRef.current;
    // Map mode (2D overlay active)
    if (vi && vi.distance < 3.5) {
      const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
      const W = rect.width, H = rect.height;
      const cx = W / 2, cy = H / 2, d = vi.distance;
      const zoom = d > 2.2 ? 8 : d > 2.0 ? 9 : d > 1.85 ? 10 : d > 1.7 ? 11 : d > 1.55 ? 12 : d > 1.4 ? 13 : 14;
      const totalPx = Math.pow(2, zoom) * 256;
      const cLngPx = (vi.lng + 180) / 360 * totalPx;
      const cLatRad = vi.lat * Math.PI / 180;
      const cLatPx = (1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2 * totalPx;
      const toScreen = (lat: number, lng: number) => {
        const mLngPx = (lng + 180) / 360 * totalPx;
        const mLatRad = lat * Math.PI / 180;
        const mLatPx = (1 - Math.log(Math.tan(mLatRad) + 1 / Math.cos(mLatRad)) / Math.PI) / 2 * totalPx;
        return { x: cx + (mLngPx - cLngPx), y: cy + (mLatPx - cLatPx) };
      };
      const threshold = 15;
      const matched: ClickedItem[] = [];
      const ly = layersRef.current, active = activeLayerIdsRef.current;
      const check = (lat: number, lng: number, type: ClickedItem['type'], data: ClickedItem['data']) => {
        if (lat == null || lng == null) return;
        const p = toScreen(lat, lng);
        if (Math.abs(p.x - clickX) > threshold || Math.abs(p.y - clickY) > threshold) return;
        if (Math.hypot(p.x - clickX, p.y - clickY) < threshold) matched.push({ type, data, screenX: e.clientX, screenY: e.clientY });
      };
      if (active.includes('cameras') && ly.cameras) for (const cItem of ly.cameras) check(cItem.lat, cItem.lng, 'camera', cItem as unknown as ClickedItem['data']);
      if (active.includes('flights')) for (const f of ly.flights) if (!f.military) check(f.lat, f.lng, 'flight', f);
      if (active.includes('military')) for (const f of ly.flights) if (f.military) check(f.lat, f.lng, 'flight', f);
      if (active.includes('earthquakes')) for (const eq of ly.earthquakes) check(eq.lat, eq.lng, 'earthquake', eq);
      if (active.includes('news')) { if (ly.gdelt) for (const g of ly.gdelt) check(g.lat, g.lng, 'news', g as unknown as ClickedItem['data']); if (ly.intel) for (const n of ly.intel) if (n.lat != null && n.lng != null) check(n.lat, n.lng, 'news', n); }
      if (active.includes('cyber')) {
        if (ly.cyberAttacks) for (const a of ly.cyberAttacks) if (a.lat != null && a.lng != null) check(a.lat, a.lng, 'attack', a as unknown as ClickedItem['data']);
        if (ly.cyberSources) for (const s of ly.cyberSources) check(s.lat, s.lng, 'cybersrc', s as unknown as ClickedItem['data']);
      }
       matched.sort((a, b) => { const pa = toScreen((a.data as { lat: number }).lat, (a.data as { lng: number }).lng), pb = toScreen((b.data as { lat: number }).lat, (b.data as { lng: number }).lng); return Math.hypot(pa.x - clickX, pa.y - clickY) - Math.hypot(pb.x - clickX, pb.y - clickY); });
      if (matched.length > 15) matched.length = 15;
      if (matched.length === 0) { setClickedItem(null); setPickerItems(null); }
      else if (matched.length === 1) { setClickedItem(matched[0]); setPickerItems(null); }
      else { setClickedItem(null); setPickerItems({ items: matched, screenX: e.clientX, screenY: e.clientY }); }
      return;
    }
    // Globe mode: 3D raycasting
    const { camera, pointMeta } = sceneRef.current!;
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    raycaster.params.Points = { threshold: 0.04 };
    const seen = new Set<THREE.Object3D>(), uniqueMeshes: THREE.Object3D[] = [];
    pointMeta.forEach(p => { if (!seen.has(p.mesh)) { seen.add(p.mesh); uniqueMeshes.push(p.mesh); } });
    const hits = raycaster.intersectObjects(uniqueMeshes, false);
    const matched: ClickedItem[] = [], seenKeys = new Set<string>();
    for (const hit of hits) {
      const hitObj = hit.object;
      const hitIdx = (hit as unknown as { instanceId?: number; index?: number }).instanceId ?? (hit as unknown as { index?: number }).index;
      const meta = pointMeta.find(p => { if (p.mesh !== hitObj) return false; if (hitIdx !== undefined) return p.instanceId === hitIdx; return p.instanceId === undefined; });
      if (!meta) continue;
      const id = (meta.data as { id?: string }).id ?? '', key = `${meta.type}-${id}-${meta.instanceId ?? ''}`;
      if (seenKeys.has(key)) continue; seenKeys.add(key);
      matched.push({ type: meta.type, data: meta.data as ClickedItem['data'], screenX: e.clientX, screenY: e.clientY });
      if (matched.length >= 15) break;
    }
    if (matched.length === 0) { setClickedItem(null); setPickerItems(null); }
    else if (matched.length === 1) { setClickedItem(matched[0]); setPickerItems(null); }
    else { setClickedItem(null); setPickerItems({ items: matched, screenX: e.clientX, screenY: e.clientY }); }
  }, []);

  // ── Scene setup (mount/unmount) ──
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const W = container.clientWidth, H = container.clientHeight;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050508);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100); camera.position.set(0, 0, 6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); container.appendChild(renderer.domElement);

    const starsGeo = new THREE.BufferGeometry(); const starCount = 3000; const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 100;
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0x446644, size: 0.05 })));

    const globeGroup = new THREE.Group(); scene.add(globeGroup);
    const earthGeo = new THREE.SphereGeometry(2, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({ color: 0x1a3a1a, emissive: 0x0a1a0a, specular: 0x224422, shininess: 10 });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat); globeGroup.add(earthMesh);

    new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg', (tex) => {
      (earthMesh.material as THREE.MeshPhongMaterial).map = tex; (earthMesh.material as THREE.MeshPhongMaterial).needsUpdate = true;
    }, undefined, () => {
      const wireGeo = new THREE.SphereGeometry(2.01, 24, 24); const wireMat = new THREE.MeshBasicMaterial({ color: 0x003300, wireframe: true });
      earthMesh.add(new THREE.Mesh(wireGeo, wireMat));
    });

    const atmGeo = new THREE.SphereGeometry(2.15, 64, 64);
    const atmMat = new THREE.ShaderMaterial({ side: 1, transparent: true, opacity: 0.15,
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main() { float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0); gl_FragColor = vec4(0.0, 1.0, 0.25, 1.0) * intensity; }`,
    }); const atmMesh = new THREE.Mesh(atmGeo, atmMat); globeGroup.add(atmMesh);

    scene.add(new THREE.AmbientLight(0x112211, 0.5));
    const dirLight = new THREE.DirectionalLight(0x44ff44, 0.8); dirLight.position.set(5, 3, 5); scene.add(dirLight);

    const pointsGroup = new THREE.Group(); globeGroup.add(pointsGroup);
    const bordersGroup = new THREE.Group(); globeGroup.add(bordersGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.enablePan = false; controls.minDistance = 1.2; controls.maxDistance = 8;
    controls.zoomSpeed = 1.4; controls.rotateSpeed = 0.4; controls.autoRotate = false;

    controls.addEventListener('change', () => {
      const dist = camera.position.length(), camNorm = camera.position.clone().normalize();
      const invQ = globeGroup.quaternion.clone().invert(), localDir = camNorm.clone().applyQuaternion(invQ);
      const lat = 90 - Math.acos(Math.max(-1, Math.min(1, localDir.y))) * 180 / Math.PI;
      let lng = Math.atan2(localDir.z, -localDir.x) * 180 / Math.PI - 180;
      if (lng < -180) lng += 360;
      requestAnimationFrame(() => {
        if (onCameraMoveRef.current) onCameraMoveRef.current(lat, lng, dist);
        let nearest: ViewInfo['nearest'];
        if (activeLayerIdsRef.current.includes('cameras') && layersRef.current.cameras) {
          let bestD2 = Infinity, bestCam: CameraData | null = null; const cosLat = Math.cos(lat * Math.PI / 180);
          for (const citem of layersRef.current.cameras) {
            if (citem.lat == null || citem.lng == null) continue;
            const dLat = citem.lat - lat; let dLng = citem.lng - lng;
            if (dLng > 180) dLng -= 360; if (dLng < -180) dLng += 360;
            const d2 = dLat * dLat + (dLng * cosLat) * (dLng * cosLat);
            if (d2 < bestD2) { bestD2 = d2; bestCam = citem; }
          }
          if (bestCam) nearest = { name: bestCam.name, city: bestCam.city, kmAway: Math.sqrt(bestD2) * 111 };
        }
        setViewInfo({ lat, lng, distance: dist, nearest });
      });
    });

    const onResize = () => { const w = container.clientWidth, h = container.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    window.addEventListener('resize', onResize);

    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json()).then((geoData: { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }) => {
        const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff41, opacity: 0.22, transparent: true });
        geoData.features.forEach(feature => {
          const { type, coordinates } = feature.geometry;
          const polys = type === 'Polygon' ? [coordinates as number[][][]] : coordinates as number[][][][];
          polys.forEach(polygon => { polygon.forEach(ring => { const pts: THREE.Vector3[] = []; (ring as number[][]).forEach(([lng, lat]) => { const phi2 = (90 - lat) * Math.PI / 180, theta2 = (lng + 180) * Math.PI / 180; pts.push(new THREE.Vector3(-(2.02 * Math.sin(phi2) * Math.cos(theta2)), 2.02 * Math.cos(phi2), 2.02 * Math.sin(phi2) * Math.sin(theta2))); }); if (pts.length > 1) bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat)); }); });
        });
      }).catch(() => {
        const gridMat = new THREE.LineBasicMaterial({ color: 0x0a3a0a, opacity: 0.3, transparent: true });
        for (let lat2 = -80; lat2 <= 80; lat2 += 20) { const pts: THREE.Vector3[] = []; for (let lng2 = -180; lng2 <= 180; lng2 += 5) pts.push(latLngToVec3(lat2, lng2, 2.02)); bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat)); }
        for (let lng2 = -180; lng2 <= 180; lng2 += 30) { const pts: THREE.Vector3[] = []; for (let lat2 = -90; lat2 <= 90; lat2 += 5) pts.push(latLngToVec3(lat2, lng2, 2.02)); bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat)); }
      });

    let animId = 0; const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate); const t = clock.getElapsedTime();
      if (autoRotateRef.current) globeGroup.rotation.y += 0.0005;
      const camDist = camera.position.length(); atmMesh.visible = camDist >= 2.1;
      bordersGroup.visible = camDist >= 2.5;
      const zoomT = Math.min(1, (camDist - 1.2) / 5); controls.rotateSpeed = 0.02 + zoomT * zoomT * 0.48; controls.zoomSpeed = 0.3 + zoomT * 1.1;
      controls.update();
      pointsGroup.children.forEach((child, i) => {
        if (child instanceof THREE.Sprite && !child.userData.noScale && child.userData.baseScale) child.scale.setScalar(child.userData.baseScale * (1 + 0.1 * Math.sin(t * 2 + i * 0.5)));
        if (child instanceof THREE.Points) { const ptMat = child.material as THREE.PointsMaterial; const lerp2 = Math.max(0, Math.min(1, (camDist - 1.5) / 3.5)); ptMat.size = 0.005 + lerp2 * 0.030; }
      });
      renderer.render(scene, camera);
    }; animate();

    sceneRef.current = { scene, camera, renderer, controls, earthMesh, globeGroup, pointsGroup, bordersGroup, atmMesh, containers: {}, _prevLayerKeys: [], pointMeta: [], animId };

    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(animId); renderer.dispose(); if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement); };
  }, []);

  // ── Layer toggle effect (useLayoutEffect): fires only when user toggles layers ON/OFF, NOT on data polls ──
  useLayoutEffect(() => {
    if (!sceneRef.current) return;
    const { pointsGroup, containers } = sceneRef.current;
    const gdeltCount = layers.gdelt?.filter(g2 => g2.lat != null && g2.lng != null).length ?? 0;
    const curKeys = activeLayerIdsToKeySet(activeLayerIds, gdeltCount);

    // Remove keys that were unselected (toggle OFF)
    for (const key of sceneRef.current._prevLayerKeys) {
      if (!curKeys.includes(key)) {
        const c = containers[key];
        if (!c) continue;
        disposeContainer(c);
        
        // Remove from scene - use makeRenderables to get all Three.js objects
        for (const obj of makeRenderables(c)) {
          pointsGroup.remove(obj as THREE.Object3D);
        }
        
        delete containers[key];
      }
    }
    // Add keys that were selected (toggle ON)
    for (const key of Array.from(curKeys)) {
      if (!containers[key]) {
        containers[key] = initContainer(key);
        // Attach immediately — otherwise meshes only reach the scene graph
        // via growInstancedMesh() and layers at initial capacity never render.
        for (const obj of makeRenderables(containers[key])) {
          pointsGroup.add(obj as THREE.Object3D);
        }
      }
    }
    sceneRef.current._prevLayerKeys = curKeys;
  }, [activeLayerIds, layers.gdelt]);

  // ── Data update effect: fires on every [layers] poll — ZERO Three.js object allocation ──
  useEffect(() => {
    if (!sceneRef.current || !sceneRef.current.containers) return;
    const sc = sceneRef.current!;
    const { containers, pointsGroup, pointMeta } = sc;
    pointMeta.length = 0;
    const dummy = new THREE.Object3D();
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    function updateEarthquakeLayer() {
      const c = containers['earthquake'];
      if (!c || !isInst(c)) return;
      const ic = c;
      const imesh = ic.mesh!;
      const valid = layers.earthquakes.filter(i => i.lat != null && i.lng != null);
      const newCount = Math.min(valid.length, 200);
      if (newCount > imesh.count) {
        const cap = Math.max(newCount + 4, imesh.count * 2, 200);
        growInstancedMesh(ic, pointsGroup, cap);
      }
      ic.count = newCount;
      for (let i = 0; i < newCount; i++) { dummy.position.copy(latLngToVec3(valid[i].lat, valid[i].lng, 2.05)); dummy.updateMatrix(); imesh.setMatrixAt(i, dummy.matrix); }
      for (let i = newCount; i < ic.maxCount; i++) imesh.setMatrixAt(i, zeroMatrix);
      imesh.instanceMatrix.needsUpdate = true;
      const validEarthquakeData = layers.earthquakes.filter(i => i.lat != null && i.lng != null);
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: imesh as unknown as THREE.Object3D, type: 'earthquake', data: validEarthquakeData[i], instanceId: i });
    }
    updateEarthquakeLayer();

    function updateFlightsLayer(filterFn: (f: FlightData) => boolean, color: string, offsetZ: number) {
      const c = containers[filterFn === ((f: FlightData) => !f.military) ? 'flight_civilian' : 'military'];
      if (!c || !isSprites(c)) return;
      const sprites = c.sprites!;
      const valid = layers.flights.filter(filterFn).filter((f: FlightData) => f.lat != null && f.lng != null);
      const newCount = valid.length;
      while (sprites.length < newCount) { sprites.push(makePlaneSprite(color, 0.033)); }
      c.count = newCount;
      for (let i = 0; i < newCount; i++) { sprites[i].position.copy(latLngToVec3(valid[i].lat, valid[i].lng, offsetZ)); sprites[i].visible = true; pointMeta.push({ mesh: sprites[i] as unknown as THREE.Object3D, type: 'flight', data: valid[i] }); }
      for (let i = newCount; i < c.maxCount && i < sprites.length; i++) { sprites[i].position.set(0, 0, 0); sprites[i].visible = false; }
    }
    updateFlightsLayer((f: FlightData) => !f.military, '#ff8c00', 2.06);
    updateFlightsLayer((f: FlightData) => f.military, '#ff4444', 2.07);

    function updateSatelliteLayer(hasIds: (id: string) => boolean, isIss: boolean) {
      const key = isIss ? 'iss' : 'satellite';
      const c = containers[key];
      if (!c || !isInst(c)) return;
      const ic = c;
      const imesh = ic.mesh!;
      const valid = layers.satellites.filter(s => hasIds(s.id)).filter((s: SatelliteData) => s.lat != null && s.lng != null);
      const newCount = Math.min(valid.length, isIss ? 2 : 32);
      if (newCount > imesh.count) growInstancedMesh(ic, pointsGroup, Math.max(newCount + 4, ic.count * 1.5));
      ic.count = newCount;
      for (let i = 0; i < newCount; i++) { dummy.position.copy(latLngToVec3(valid[i].lat, valid[i].lng, 2.3)); dummy.updateMatrix(); imesh.setMatrixAt(i, dummy.matrix); }
      for (let i = newCount; i < ic.maxCount; i++) imesh.setMatrixAt(i, zeroMatrix);
      imesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: imesh as unknown as THREE.Object3D, type: isIss ? 'satellite' : 'satellite', data: valid[i], instanceId: i });
    }
    updateSatelliteLayer((id) => id !== 'ISS', false);
    updateSatelliteLayer((id) => id === 'ISS', true);

    function updateNewsIntelLayer() {
      const c = containers['news'];
      if (!c || !isInst(c)) return;
      const ic = c;
      const imesh = ic.mesh!;
      const valid = layers.intel.filter(i => i.lat != null && i.lng != null && i.category !== 'CYBER');
      const newCount = Math.min(valid.length, 50);
      if (newCount > imesh.count) growInstancedMesh(ic, pointsGroup, Math.max(newCount + 4, ic.count * 1.5));
      ic.count = newCount;
      for (let i = 0; i < newCount; i++) { const latVal = valid[i].lat!; const lngVal = valid[i].lng!; dummy.position.copy(latLngToVec3(latVal, lngVal, 2.05)); dummy.updateMatrix(); imesh.setMatrixAt(i, dummy.matrix); }
      for (let i = newCount; i < ic.maxCount; i++) imesh.setMatrixAt(i, zeroMatrix);
      imesh.instanceMatrix.needsUpdate = true;
      const validIntelData = layers.intel.filter(i => i.lat != null && i.lng != null && i.category !== 'CYBER');
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: imesh as unknown as THREE.Object3D, type: 'news', data: validIntelData[i], instanceId: i });
    }
    updateNewsIntelLayer();

    function updateGdeltLayer() {
      const c = containers['news_gdelt'];
      const gdeltLayers = layers.gdelt;
      if (!c || !gdeltLayers || gdeltLayers.length === 0) return;
      const gc = c as Container & { meshes: THREE.InstancedMesh[]; itemCounts: number[] };
      // Initialize meshes on first tick if containers exists but not yet created
      if (!gc.meshes || gc.meshes.length === 0) {
        gc.meshes = []; gc.itemCounts = [0, 0, 0];
        const caps = [32, 32, 32];
        const colors = [0xff2222, 0xff6600, 0xff9944];
        for (let g = 0; g < 3; g++) {
          const geo = new THREE.SphereGeometry(0.012, 5, 5);
          const mat = new THREE.MeshBasicMaterial({ color: colors[g] });
          gc.meshes.push(new THREE.InstancedMesh(geo, mat, caps[g]));
        }
      }

      // Group by severity color bucket
      const redItems: GdeltData[] = [], orangeItems: GdeltData[] = [], greenItems: GdeltData[] = [];
      for (const item of gdeltLayers) {
        if (item.lat == null || item.lng == null) continue;
        if (item.goldstein <= -8) redItems.push(item);
        else if (item.goldstein <= -5) orangeItems.push(item);
        else greenItems.push(item);
      }

      // Process each severity group independently
      const allCounts: number[] = [];
      const groups = [redItems, orangeItems, greenItems];
      for (let g = 0; g < 3; g++) {
        const mesh = gc.meshes[g]; if (!mesh) continue;
        const cap = groups[g].length;
        if (cap > mesh.count) {
          growInstancedMesh({ ...gc, mesh: gc.meshes[0] } as Container & { mesh: THREE.InstancedMesh }, pointsGroup, Math.max(cap + 4, mesh.count * 1.5));
        }
        const effectiveMesh = gc.meshes[g]; if (!effectiveMesh) continue;
        allCounts.push(groups[g].length);
        for (let i = 0; i < groups[g].length; i++) {
          const latVal = groups[g][i].lat!;
          const lngVal = groups[g][i].lng!;
          dummy.position.copy(latLngToVec3(latVal, lngVal, 2.05));
          dummy.updateMatrix();
          effectiveMesh.setMatrixAt(i, dummy.matrix);
        }
        for (let i = groups[g].length; i < effectiveMesh.count; i++) effectiveMesh.setMatrixAt(i, zeroMatrix);
        effectiveMesh.instanceMatrix.needsUpdate = true;
      }

      gc.itemCounts = allCounts;
      let globalIdx = 0;
      for (let g = 0; g < 3; g++) {
        const mesh = gc.meshes[g]; if (!mesh) continue;
        allCounts[g] = Math.min(groups[g].length, mesh.count);
        for (let i = 0; i < allCounts[g]; i++, globalIdx++) {
          pointMeta.push({ mesh: mesh as unknown as THREE.Object3D, type: 'news', data: groups[g][i], instanceId: i });
        }
      }
    }
    updateGdeltLayer();

    function updateCamerasLayer() {
      const c2 = containers['cameras'];
      const camLayers = layers.cameras;
      if (!c2 || !camLayers || !isPoints(c2)) return;
      const camMesh = c2.points!;
      const geo = camMesh.geometry as THREE.BufferGeometry;
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const validCams = camLayers.filter(item => item.lat != null && item.lng != null);
      const newCount = validCams.length;
      if (newCount > c2.maxCount) {
        const newPos = new Float32Array(Math.max(newCount * 1.5, c2.maxCount + 128) * 3);
        for (let i = 0; i < Math.min(posAttr.array.length, newPos.length); i++) newPos[i] = posAttr.array[i];
        geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        c2.maxCount = newPos.length / 3;
      }
      c2.count = newCount;
      for (let i = 0; i < newCount; i++) {
        const pos = latLngToVec3(validCams[i].lat!, validCams[i].lng!, 2.065);
        posAttr.array[i * 3]     = pos.x;
        posAttr.array[i * 3 + 1] = pos.y;
        posAttr.array[i * 3 + 2] = pos.z;
      }
      for (let i = newCount * 3; i < posAttr.array.length; i++) posAttr.array[i] = 0;
      posAttr.needsUpdate = true;
      const validCameraData = camLayers.filter(item => item.lat != null && item.lng != null);
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: camMesh as unknown as THREE.Object3D, type: 'camera', data: validCameraData[i], instanceId: i });
    }
    updateCamerasLayer();

    function updateCyberAttacksLayer() {
      const c = containers['cyber_attacks'];
      if (!c || !isInst(c)) return;
      const ic = c;
      const imesh = ic.mesh!;
      const valid = (layers.cyberAttacks ?? []).filter(a => a.lat != null && a.lng != null);
      const newCount = Math.min(valid.length, 96);
      if (newCount > imesh.count) growInstancedMesh(ic, pointsGroup, Math.max(newCount + 4, ic.maxCount));
      ic.count = newCount;
      for (let i = 0; i < newCount; i++) { dummy.position.copy(latLngToVec3(valid[i].lat!, valid[i].lng!, 2.08)); dummy.updateMatrix(); imesh.setMatrixAt(i, dummy.matrix); }
      for (let i = newCount; i < ic.maxCount; i++) imesh.setMatrixAt(i, zeroMatrix);
      imesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: imesh as unknown as THREE.Object3D, type: 'attack', data: valid[i], instanceId: i });
    }
    updateCyberAttacksLayer();

    function updateCyberSourcesLayer() {
      const c = containers['cyber_sources'];
      if (!c || !isInst(c)) return;
      const ic = c;
      const imesh = ic.mesh!;
      const valid = (layers.cyberSources ?? []).filter(s => s.lat != null && s.lng != null);
      const newCount = Math.min(valid.length, 32);
      if (newCount > imesh.count) growInstancedMesh(ic, pointsGroup, Math.max(newCount + 4, ic.maxCount));
      ic.count = newCount;
      for (let i = 0; i < newCount; i++) { dummy.position.copy(latLngToVec3(valid[i].lat, valid[i].lng, 2.065)); dummy.updateMatrix(); imesh.setMatrixAt(i, dummy.matrix); }
      for (let i = newCount; i < ic.maxCount; i++) imesh.setMatrixAt(i, zeroMatrix);
      imesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < newCount; i++) pointMeta.push({ mesh: imesh as unknown as THREE.Object3D, type: 'cybersrc', data: valid[i], instanceId: i });
    }
    updateCyberSourcesLayer();

    sc.pointMeta = pointMeta;
  }, [layers]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={handleCanvasClick}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {viewInfo && viewInfo.distance < 4 && <LocationHUD info={viewInfo} />}
      {pickerItems && (<ItemPicker items={pickerItems.items} screenX={pickerItems.screenX} screenY={pickerItems.screenY} onSelect={(it) => { setPickerItems(null); setClickedItem(it); }} onClose={() => setPickerItems(null)} />)}
      {clickedItem && <DetailPopup item={clickedItem} onClose={() => setClickedItem(null)} />}
    </div>
  );
}
