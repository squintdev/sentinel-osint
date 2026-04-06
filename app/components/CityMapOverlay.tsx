'use client';
import { useEffect, useRef, useMemo } from 'react';
import type { LayerData } from './Globe';

interface Props {
  lat: number;
  lng: number;
  distance: number;
  visible: boolean;
  layers?: LayerData;
  activeLayerIds?: string[];
}

const TILE_SIZE = 256;

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function latLngToSubPixel(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const globalPx = (lng + 180) / 360 * n * TILE_SIZE;
  const latRad = lat * Math.PI / 180;
  const globalPy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * TILE_SIZE;
  const ct = latLngToTile(lat, lng, zoom);
  return { subX: globalPx - ct.x * TILE_SIZE, subY: globalPy - ct.y * TILE_SIZE };
}

function latLngToCanvas(
  markerLat: number, markerLng: number,
  centerLat: number, centerLng: number,
  zoom: number, cx: number, cy: number,
): { x: number; y: number } {
  const n = Math.pow(2, zoom) * TILE_SIZE;
  const mLngPx = (markerLng + 180) / 360 * n;
  const mLatRad = markerLat * Math.PI / 180;
  const mLatPx = (1 - Math.log(Math.tan(mLatRad) + 1 / Math.cos(mLatRad)) / Math.PI) / 2 * n;
  const cLngPx = (centerLng + 180) / 360 * n;
  const cLatRad = centerLat * Math.PI / 180;
  const cLatPx = (1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2 * n;
  return { x: cx + (mLngPx - cLngPx), y: cy + (mLatPx - cLatPx) };
}

function colorize(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.pow(b / 255, 0.5) * 255;
    d[i]     = Math.min(255, v * 0.05);
    d[i + 1] = Math.min(255, v * 1.1);
    d[i + 2] = Math.min(255, v * 0.9);
  }
}

export default function CityMapOverlay({ lat, lng, distance, visible, layers, activeLayerIds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);
  const lastDrawDistRef = useRef(0);

  const zoom = useMemo(() => {
    if (distance > 2.2)  return 8;
    if (distance > 2.0)  return 9;
    if (distance > 1.85) return 10;
    if (distance > 1.7)  return 11;
    if (distance > 1.55) return 12;
    if (distance > 1.4)  return 13;
    return 14;
  }, [distance]);

  useEffect(() => {
    const gen = ++genRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Immediate: CSS-scale old tiles to track globe zoom
    const lastDist = lastDrawDistRef.current;
    if (lastDist > 0) {
      const lastAlt = Math.max(0.05, lastDist - 2);
      const curAlt  = Math.max(0.05, distance - 2);
      const scale = Math.max(0.5, Math.min(3, lastAlt / curAlt));
      canvas.style.transform = `scale(${scale.toFixed(3)})`;
    }

    // Debounced: load tiles + draw markers after view stabilises
    const timer = setTimeout(() => {
      if (gen !== genRef.current) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.style.transform = 'scale(1)';
      lastDrawDistRef.current = distance;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
        canvas.width = cw;
        canvas.height = ch;
      }

      const W = canvas.width;
      const H = canvas.height;
      if (W < 10 || H < 10) return;
      const cx = W / 2;
      const cy = H / 2;

      // Fill with scene background so there's no flash of globe during tile load
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);

      const ct = latLngToTile(lat, lng, zoom);
      const { subX, subY } = latLngToSubPixel(lat, lng, zoom);
      // 7x7 tile grid — enough to cover even wide panels at any sub-pixel offset
      const GRID = 7;
      const half = Math.floor(GRID / 2);
      const maxTile = Math.pow(2, zoom);
      const offX = cx - half * TILE_SIZE - subX;
      const offY = cy - half * TILE_SIZE - subY;

      const tilePromises: Promise<void>[] = [];
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const tx = ((ct.x + dx) % maxTile + maxTile) % maxTile;
          const ty = ct.y + dy;
          if (ty < 0 || ty >= maxTile) continue;
          const destX = Math.round(offX + (dx + half) * TILE_SIZE);
          const destY = Math.round(offY + (dy + half) * TILE_SIZE);
          if (destX + TILE_SIZE < 0 || destX > W || destY + TILE_SIZE < 0 || destY > H) continue;

          const p = new Promise<void>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              if (gen !== genRef.current) { resolve(); return; }
              const tmp = document.createElement('canvas');
              tmp.width = TILE_SIZE; tmp.height = TILE_SIZE;
              const tctx = tmp.getContext('2d', { willReadFrequently: true });
              if (!tctx) { resolve(); return; }
              tctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
              try {
                const id = tctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
                colorize(id);
                tctx.putImageData(id, 0, 0);
              } catch { /* CORS taint */ }
              ctx.drawImage(tmp, destX, destY, TILE_SIZE, TILE_SIZE);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = `https://basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}.png`;
          });
          tilePromises.push(p);
        }
      }

      Promise.all(tilePromises).then(() => {
        if (gen !== genRef.current) return;

        // Draw markers at correct Mercator positions
        const active = activeLayerIds ?? [];
        const pad = 4;

        const drawDot = (mLat: number, mLng: number, color: string, r: number) => {
          if (mLat == null || mLng == null) return;
          const p = latLngToCanvas(mLat, mLng, lat, lng, zoom, cx, cy);
          if (p.x < -pad || p.x > W + pad || p.y < -pad || p.y > H + pad) return;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        };

        if (active.includes('cameras') && layers?.cameras) {
          for (const c of layers.cameras) drawDot(c.lat, c.lng, '#00ffff', 3);
        }
        if (active.includes('flights') && layers?.flights) {
          for (const f of layers.flights) {
            if (!f.military) drawDot(f.lat, f.lng, '#ff8c00', 3);
          }
        }
        if (active.includes('military') && layers?.flights) {
          for (const f of layers.flights) {
            if (f.military) drawDot(f.lat, f.lng, '#ff4444', 3);
          }
        }
        if (active.includes('earthquakes') && layers?.earthquakes) {
          for (const e of layers.earthquakes) drawDot(e.lat, e.lng, '#00ff41', 4);
        }
        if (active.includes('news')) {
          if (layers?.gdelt) {
            for (const g of layers.gdelt) {
              const c = g.goldstein <= -8 ? '#ff2222' : g.goldstein <= -5 ? '#ff6600' : '#ff9944';
              drawDot(g.lat, g.lng, c, 3);
            }
          }
          if (layers?.intel) {
            for (const n of layers.intel) {
              if (n.lat != null && n.lng != null) drawDot(n.lat, n.lng, '#4488ff', 3);
            }
          }
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [lat, lng, zoom, distance, visible, layers, activeLayerIds]);

  // Initial canvas size sync
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        zIndex: 5,
        overflow: 'hidden',
        background: visible ? '#050508' : 'transparent',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          display: 'block', transformOrigin: 'center center',
        }}
      />
    </div>
  );
}
