'use client';
import { useEffect, useRef, useMemo } from 'react';

interface Props {
  lat: number;
  lng: number;
  distance: number;
  visible: boolean;
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

function colorize(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.pow(b / 255, 0.65) * 255;
    d[i]     = Math.min(255, v * 0.04);
    d[i + 1] = Math.min(255, v * 0.88);
    d[i + 2] = Math.min(255, v * 0.75);
  }
}

export default function CityMapOverlay({ lat, lng, distance, visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoom = useMemo(() => {
    if (distance > 1.85) return 7;
    if (distance > 1.7)  return 9;
    if (distance > 1.55) return 10;
    if (distance > 1.4)  return 11;
    return 12;
  }, [distance]);

  // Draw tiles onto canvas with circular clip + vignette — looks like the globe opening up
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure canvas has real dimensions (ResizeObserver may not have fired yet)
    if (!canvas.width || !canvas.height) {
      canvas.width  = container.clientWidth  || 900;
      canvas.height = container.clientHeight || 700;
    }
    const W = canvas.width;
    const H = canvas.height;
    if (W < 10 || H < 10) return;
    const cx = W / 2;
    const cy = H / 2;
    // Radius: covers most of the center — tight enough to show globe edges
    const radius = Math.min(W, H) * 0.38;

    ctx.clearRect(0, 0, W, H);

    const ct = latLngToTile(lat, lng, zoom);
    const { subX, subY } = latLngToSubPixel(lat, lng, zoom);
    const GRID = 5;
    const half = Math.floor(GRID / 2);
    const maxTile = Math.pow(2, zoom);
    const offX = cx - half * TILE_SIZE - subX;
    const offY = cy - half * TILE_SIZE - subY;

    // Save state, clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Draw tiles
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
            const tmp = document.createElement('canvas');
            tmp.width = TILE_SIZE; tmp.height = TILE_SIZE;
            const tctx = tmp.getContext('2d', { willReadFrequently: true });
            if (!tctx) { resolve(); return; }
            tctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
            try {
              const id = tctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
              colorize(id);
              tctx.putImageData(id, 0, 0);
            } catch { /* CORS taint — draw uncolored */ }
            ctx.drawImage(tmp, destX, destY, TILE_SIZE, TILE_SIZE);
            resolve();
          };
          img.onerror = () => resolve();
          // ArcGIS Dark Gray Base: /z/y/x (row then col)
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${zoom}/${ty}/${tx}`;
        });
        tilePromises.push(p);
      }
    }

    // After all tiles load, apply vignette to soft-edge the circle
    Promise.all(tilePromises).then(() => {
      // Soft vignette: erase toward edges using radial gradient
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.65, cx, cy, radius);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Subtle crosshair at center — no chrome, just a targeting indicator
      ctx.save();
      ctx.strokeStyle = 'rgba(0,255,65,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 6, cy);
      ctx.moveTo(cx + 6,  cy); ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 6);
      ctx.moveTo(cx, cy + 6);  ctx.lineTo(cx, cy + 18);
      ctx.stroke();
      // Tiny coord label
      ctx.fillStyle = 'rgba(0,255,65,0.3)';
      ctx.font = '8px monospace';
      ctx.fillText(`${lat.toFixed(2)}° ${lng.toFixed(2)}°`, cx - 32, cy + 28);
      ctx.restore();
    });
  }, [lat, lng, zoom, visible]);

  // Keep canvas pixel dimensions in sync with the container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
        zIndex: 5,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
