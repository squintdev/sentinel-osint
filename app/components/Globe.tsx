'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// @ts-expect-error - three examples not typed
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export interface FlightData {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  military: boolean;
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

export interface LayerData {
  flights: FlightData[];
  earthquakes: EarthquakeData[];
  satellites: SatelliteData[];
  intel: IntelData[];
  gdelt?: GdeltData[];
  cameras?: CameraData[];
}

interface GlobeProps {
  layers: LayerData;
  activeLayerIds: string[];
  autoRotate: boolean;
  onCameraMove?: (lat: number, lng: number, distance: number) => void;
}

interface ClickedItem {
  type: 'flight' | 'earthquake' | 'satellite' | 'news' | 'camera';
  data: FlightData | EarthquakeData | SatelliteData | IntelData | GdeltData;
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

  const lines: string[] = [];
  if (type === 'flight') {
    const f = data as FlightData;
    lines.push(`CALLSIGN: ${f.callsign || 'UNKNOWN'}`);
    lines.push(`TYPE: ${f.military ? 'MILITARY' : 'CIVILIAN'}`);
    lines.push(`LAT: ${f.lat?.toFixed(2)} / LNG: ${f.lng?.toFixed(2)}`);
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
  } else if (type === 'camera') {
    const c = data as unknown as CameraData;
    lines.push(`__CAM_NAME__${c.name}`);
    lines.push(`__CAM_CITY__${c.city}`);
    lines.push(`__CAM_IMG__${c.imageUrl}`);
  } else {
    // Check if this is a GDELT event (has goldstein field) or SearXNG intel
    const n = data as (IntelData & { goldstein?: number; location?: string; actor1?: string; actor2?: string; sourceUrl?: string; tone?: number; numMentions?: number; headline?: string });
    if (n.goldstein !== undefined) {
      // GDELT event
      lines.push(`SEVERITY: ${n.goldstein?.toFixed(1)} (${n.goldstein <= -8 ? 'EXTREME' : n.goldstein <= -5 ? 'HIGH' : 'MED'})`);
      if (n.location) lines.push(`LOCATION: ${n.location}`);
      if (n.actor1) lines.push(`ACTOR 1: ${n.actor1}`);
      if (n.actor2) lines.push(`ACTOR 2: ${n.actor2}`);
      if (n.numMentions) lines.push(`MENTIONS: ${n.numMentions}`);
      if (n.sourceUrl) lines.push('__URL__' + n.sourceUrl);
    } else {
      // SearXNG intel item
      if (n.headline) lines.push(`${n.headline.slice(0, 80)}`);
      lines.push(`PRIORITY: ${n.priority}`);
      if (n.lat && n.lng) lines.push(`LAT: ${n.lat?.toFixed(2)} / LNG: ${n.lng?.toFixed(2)}`);
    }
  }

  // Camera type gets a full centered modal
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
          width: 640, background: 'rgba(0,8,0,0.97)',
          border: '1px solid #00ffff',
          boxShadow: '0 0 40px rgba(0,255,255,0.2)',
          fontFamily: 'JetBrains Mono, monospace',
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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={camImg} alt={camName}
              style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = 'Feed unavailable'; }}
            />
          )}
          <div style={{ padding: '6px 12px', fontSize: 8, color: '#1a4a4a', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
            <span>SOURCE: {camCity === 'NYC' ? 'NYC DOT' : camCity === 'London' ? 'TRANSPORT FOR LONDON' : camCity === 'San Francisco' || camCity === 'Los Angeles' ? 'CALTRANS' : camCity === 'Toronto' ? 'CITY OF TORONTO' : camCity === 'Singapore' ? 'LTA DATA.GOV.SG' : 'INSECAM // OPEN IP CAM'}</span>
            <span style={{ color: '#00ffff' }}>● LIVE</span>
          </div>
        </div>
      </div>
    );
  }

  const left = Math.min(screenX + 10, window.innerWidth - 300);
  const top = Math.min(screenY - 10, window.innerHeight - 140);

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'fixed',
      left,
      top,
      width: 280,
      background: 'rgba(0,8,0,0.95)',
      border: '1px solid #ff8c00',
      boxShadow: '0 0 20px rgba(255,140,0,0.3)',
      padding: '8px 10px',
      zIndex: 1000,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid #1a3a0a', paddingBottom: 4 }}>
        <span style={{ fontSize: 9, color: '#ff8c00', letterSpacing: '0.15em' }}>◈ {type.toUpperCase()} DETAIL</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
        >✕</button>
      </div>
      {lines.map((line, i) => {
        if (line.startsWith('__URL__')) {
          const url = line.slice(7);
          let hostname = url;
          try { hostname = new URL(url).hostname.replace('www.',''); } catch {}
          return (
            <div key={i} style={{ fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: '#1a4a1a', letterSpacing: '0.1em' }}>SOURCE: </span>
              <a href={url} target="_blank" rel="noreferrer"
                style={{ color: '#ff8c00', letterSpacing: '0.1em', textDecoration: 'underline', cursor: 'pointer' }}>
                {hostname} ↗
              </a>
            </div>
          );
        }
        if (line.startsWith('__CAM_NAME__') || line.startsWith('__CAM_CITY__') || line.startsWith('__CAM_IMG__')) return null;
        return <div key={i} style={{ fontSize: 9, color: '#00ff41', letterSpacing: '0.1em', marginBottom: 3 }}>{line}</div>;
      })}
    </div>
  );
}

export default function Globe({ layers, activeLayerIds, autoRotate, onCameraMove }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef(autoRotate);
  const onCameraMoveRef = useRef(onCameraMove);
  onCameraMoveRef.current = onCameraMove;
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
    pointMeta: Array<{ mesh: THREE.Object3D; type: 'flight' | 'earthquake' | 'satellite' | 'news' | 'camera'; data: FlightData | EarthquakeData | SatelliteData | IntelData | GdeltData | CameraData; instanceId?: number }>;
    animId: number;
  } | null>(null);

  const [clickedItem, setClickedItem] = useState<ClickedItem | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sceneRef.current || !mountRef.current) return;
    const { camera, pointMeta } = sceneRef.current;
    const rect = mountRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    raycaster.params.Points = { threshold: 0.04 };

    // Deduplicate meshes for raycasting (InstancedMesh/Points appear multiple times in meta)
    const seen = new Set<THREE.Object3D>();
    const uniqueMeshes: THREE.Object3D[] = [];
    pointMeta.forEach(p => { if (!seen.has(p.mesh)) { seen.add(p.mesh); uniqueMeshes.push(p.mesh); } });

    const hits = raycaster.intersectObjects(uniqueMeshes, false);
    if (hits.length > 0) {
      const hit = hits[0];
      const hitObj = hit.object;
      // For InstancedMesh: hit.instanceId; for Points: hit.index; for Mesh/Sprite: undefined
      const hitIdx = (hit as { instanceId?: number; index?: number }).instanceId ?? (hit as { instanceId?: number; index?: number }).index;
      const meta = pointMeta.find(p => {
        if (p.mesh !== hitObj) return false;
        if (hitIdx !== undefined) return p.instanceId === hitIdx;
        return p.instanceId === undefined;
      });
      if (meta) {
        setClickedItem({ type: meta.type, data: meta.data, screenX: e.clientX, screenY: e.clientY });
      }
    } else {
      setClickedItem(null);
    }
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 100;
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0x446644, size: 0.05 })));

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const earthGeo = new THREE.SphereGeometry(2, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1a3a1a,
      emissive: 0x0a1a0a,
      specular: 0x224422,
      shininess: 10,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    textureLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
      (texture) => {
        (earthMesh.material as THREE.MeshPhongMaterial).map = texture;
        (earthMesh.material as THREE.MeshPhongMaterial).needsUpdate = true;
      },
      undefined,
      () => {
        const wireGeo = new THREE.SphereGeometry(2.01, 24, 24);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0x003300, wireframe: true });
        earthMesh.add(new THREE.Mesh(wireGeo, wireMat));
      }
    );

    const atmGeo = new THREE.SphereGeometry(2.15, 64, 64);
    const atmMat = new THREE.ShaderMaterial({
      side: 1,
      transparent: true,
      opacity: 0.15,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(0.0, 1.0, 0.25, 1.0) * intensity;
        }
      `,
    });
    const atmMesh = new THREE.Mesh(atmGeo, atmMat);
    globeGroup.add(atmMesh);

    scene.add(new THREE.AmbientLight(0x112211, 0.5));
    const dirLight = new THREE.DirectionalLight(0x44ff44, 0.8);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const pointsGroup = new THREE.Group();
    globeGroup.add(pointsGroup);

    const bordersGroup = new THREE.Group();
    globeGroup.add(bordersGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // damping causes residual spin after drag release
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.zoomSpeed = 1.4;
    controls.rotateSpeed = 0.4; // fixed — dynamic per-frame speed causes drag jank
    controls.autoRotate = false;
    // Fire onCameraMove on zoom/pan
    // Wrapped in RAF so React state update is deferred until after OrbitControls
    // finishes processing its synchronous change event — prevents mid-drag re-render jumps
    controls.addEventListener('change', () => {
      if (!onCameraMoveRef.current) return;
      const dist = camera.position.length();
      const camNorm = camera.position.clone().normalize();
      const invQ = globeGroup.quaternion.clone().invert();
      const localDir = camNorm.clone().applyQuaternion(invQ);
      const lat = 90 - Math.acos(Math.max(-1, Math.min(1, localDir.y))) * 180 / Math.PI;
      let lng = Math.atan2(localDir.z, -localDir.x) * 180 / Math.PI - 180;
      if (lng < -180) lng += 360;
      const capturedLat = lat, capturedLng = lng, capturedDist = dist;
      requestAnimationFrame(() => {
        if (onCameraMoveRef.current) onCameraMoveRef.current(capturedLat, capturedLng, capturedDist);
      });
    });

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json())
      .then((geoData: { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }) => {
        const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff41, opacity: 0.22, transparent: true });
        geoData.features.forEach(feature => {
          const { type, coordinates } = feature.geometry;
          const polys: number[][][][] = type === 'Polygon'
            ? [coordinates as number[][][]]
            : coordinates as number[][][][];

          polys.forEach(polygon => {
            polygon.forEach(ring => {
              const points: THREE.Vector3[] = [];
              (ring as number[][]).forEach(([lng, lat]) => {
                const phi = (90 - lat) * (Math.PI / 180);
                const theta = (lng + 180) * (Math.PI / 180);
                points.push(new THREE.Vector3(
                  -(2.02 * Math.sin(phi) * Math.cos(theta)),
                  2.02 * Math.cos(phi),
                  2.02 * Math.sin(phi) * Math.sin(theta)
                ));
              });
              if (points.length > 1) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                bordersGroup.add(new THREE.Line(geo, borderMat));
              }
            });
          });
        });
      })
      .catch(() => {
        const gridMat = new THREE.LineBasicMaterial({ color: 0x0a3a0a, opacity: 0.3, transparent: true });
        for (let lat = -80; lat <= 80; lat += 20) {
          const pts: THREE.Vector3[] = [];
          for (let lng = -180; lng <= 180; lng += 5) {
            pts.push(latLngToVec3(lat, lng, 2.02));
          }
          bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
        }
        for (let lng = -180; lng <= 180; lng += 30) {
          const pts: THREE.Vector3[] = [];
          for (let lat = -90; lat <= 90; lat += 5) {
            pts.push(latLngToVec3(lat, lng, 2.02));
          }
          bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
        }
      });

    let animId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (autoRotateRef.current) globeGroup.rotation.y += 0.0005;
      // Hide atmosphere when camera is inside it — prevents solid green screen fill
      const camDist = camera.position.length();
      atmMesh.visible = camDist >= 2.1;
      controls.update();
      // Pulse flight sprites relative to their stored baseScale
      pointsGroup.children.forEach((child, i) => {
        if (child instanceof THREE.Sprite && !child.userData.noScale && child.userData.baseScale) {
          const s = child.userData.baseScale * (1 + 0.1 * Math.sin(t * 2 + i * 0.5));
          child.scale.setScalar(s);
        }
      });
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { scene, camera, renderer, controls, earthMesh, globeGroup, pointsGroup, bordersGroup, atmMesh, pointMeta: [], animId };

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { pointsGroup } = sceneRef.current;
    const pointMeta: typeof sceneRef.current.pointMeta = [];

    // Dispose and clear all previous objects
    while (pointsGroup.children.length > 0) {
      const child = pointsGroup.children[0] as THREE.Mesh;
      if ((child as THREE.InstancedMesh).isInstancedMesh) {
        (child.material as THREE.Material).dispose();
        (child.geometry as THREE.BufferGeometry).dispose();
      } else if (child instanceof THREE.Points) {
        (child.material as THREE.Material).dispose();
        (child.geometry as THREE.BufferGeometry).dispose();
      } else if (child instanceof THREE.Sprite) {
        // shared material — don't dispose
        (child.geometry as THREE.BufferGeometry)?.dispose();
      } else {
        (child.material as THREE.Material)?.dispose();
        (child.geometry as THREE.BufferGeometry)?.dispose();
      }
      pointsGroup.remove(child);
    }

    // ── InstancedMesh helper: single draw call for N points of the same color ──
    const addInstanced = <T extends { lat: number; lng: number }>(
      items: T[],
      color: number,
      type: 'flight' | 'earthquake' | 'satellite' | 'news' | 'camera',
      radius = 2.05,
      size = 0.015
    ) => {
      const valid = items.filter(i => i.lat != null && i.lng != null);
      if (valid.length === 0) return;
      const geo = new THREE.SphereGeometry(size, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color });
      const iMesh = new THREE.InstancedMesh(geo, mat, valid.length);
      iMesh.userData.noScale = true;
      const dummy = new THREE.Object3D();
      valid.forEach((item, i) => {
        dummy.position.copy(latLngToVec3(item.lat, item.lng, radius));
        dummy.updateMatrix();
        iMesh.setMatrixAt(i, dummy.matrix);
        pointMeta.push({ mesh: iMesh, type, data: item as unknown as FlightData, instanceId: i });
      });
      iMesh.instanceMatrix.needsUpdate = true;
      pointsGroup.add(iMesh);
    };

    if (activeLayerIds.includes('earthquakes')) {
      addInstanced(layers.earthquakes, 0x00ff41, 'earthquake', 2.05, 0.016);
    }

    if (activeLayerIds.includes('flights')) {
      // Flights are sprites with directional icons — keep individual but they\'re low count
      layers.flights.filter(f => !f.military).forEach((item) => {
        if (item.lat == null || item.lng == null) return;
        const sprite = makePlaneSprite('#ff8c00', 0.018);
        sprite.position.copy(latLngToVec3(item.lat, item.lng, 2.06));
        pointsGroup.add(sprite as unknown as THREE.Object3D);
        pointMeta.push({ mesh: sprite as unknown as THREE.Object3D, type: 'flight', data: item });
      });
    }

    if (activeLayerIds.includes('military')) {
      layers.flights.filter(f => f.military).forEach((item) => {
        if (item.lat == null || item.lng == null) return;
        const sprite = makePlaneSprite('#ff4444', 0.03);
        sprite.position.copy(latLngToVec3(item.lat, item.lng, 2.07));
        pointsGroup.add(sprite as unknown as THREE.Object3D);
        pointMeta.push({ mesh: sprite as unknown as THREE.Object3D, type: 'flight', data: item });
      });
    }

    if (activeLayerIds.includes('satellites')) {
      addInstanced(layers.satellites, 0xffffff, 'satellite', 2.3, 0.014);
    }

    if (activeLayerIds.includes('news')) {
      const newsPoints = layers.intel.filter(i => i.lat != null && i.lng != null) as unknown as Array<IntelData & { lat: number; lng: number }>;
      addInstanced(newsPoints, 0x4488ff, 'news', 2.05, 0.015);
    }

    // GDELT — group by severity color → 3 InstancedMeshes instead of N individual meshes
    if (activeLayerIds.includes('news') && layers.gdelt && layers.gdelt.length > 0) {
      const byColor: Record<number, GdeltData[]> = { 0xff2222: [], 0xff6600: [], 0xff9944: [] };
      layers.gdelt.forEach(item => {
        if (item.lat == null || item.lng == null) return;
        const c = item.goldstein <= -8 ? 0xff2222 : item.goldstein <= -5 ? 0xff6600 : 0xff9944;
        byColor[c].push(item);
      });
      Object.entries(byColor).forEach(([colorStr, items]) => {
        addInstanced(items, parseInt(colorStr), 'news', 2.05, 0.012);
      });
    }

    // ── Cameras: single THREE.Points draw call (1700+ → 1 draw call) ──
    if (activeLayerIds.includes('cameras') && layers.cameras && layers.cameras.length > 0) {
      const validCams = layers.cameras.filter(c => c.lat && c.lng);
      const positions = new Float32Array(validCams.length * 3);
      validCams.forEach((cam, i) => {
        const pos = latLngToVec3(cam.lat, cam.lng, 2.065);
        positions[i * 3]     = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      // Use a circular point texture for camera dots
      const camCanvas = document.createElement('canvas');
      camCanvas.width = 16; camCanvas.height = 16;
      const ctx = camCanvas.getContext('2d')!;
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(8, 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#003333';
      ctx.beginPath();
      ctx.arc(8, 8, 3, 0, Math.PI * 2);
      ctx.fill();
      const tex = new THREE.CanvasTexture(camCanvas);
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, map: tex, transparent: true, sizeAttenuation: true, alphaTest: 0.1 });
      const camPoints = new THREE.Points(geo, mat);
      camPoints.userData.noScale = true;
      pointsGroup.add(camPoints);
      validCams.forEach((cam, i) => {
        pointMeta.push({ mesh: camPoints as unknown as THREE.Object3D, type: 'camera', data: cam as unknown as FlightData, instanceId: i });
      });
    }

    sceneRef.current.pointMeta = pointMeta;
  }, [layers, activeLayerIds]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={handleCanvasClick}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {clickedItem && <DetailPopup item={clickedItem} onClose={() => setClickedItem(null)} />}
    </div>
  );
}
