'use client';
import { useEffect, useState } from 'react';

const LINES = [
  '> INITIALIZING SENTINEL OSINT PLATFORM...',
  '> CONNECTING TO DATA FEEDS...',
  '> FLIGHT TRACKER: ONLINE [6,742 AIRCRAFT]',
  '> SEISMIC MONITOR: ONLINE',
  '> SATELLITE TRACKER: ONLINE [482 OBJECTS]',
  '> INTEL AGGREGATOR: ONLINE',
  '> ENCRYPTION: AES-256 ACTIVE',
  '> ALL SYSTEMS NOMINAL',
  '> LAUNCHING INTERFACE...',
];

interface BootSequenceProps {
  onComplete: () => void;
}

export default function BootSequence({ onComplete }: BootSequenceProps) {
  const [lineCount, setLineCount] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setLineCount(prev => {
        if (prev < LINES.length) return prev + 1;
        return prev;
      });
    }, 220);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lineCount >= LINES.length) {
      const timeout = setTimeout(() => {
        setFading(true);
        setTimeout(onComplete, 600);
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [lineCount, onComplete]);

  const visibleLines = LINES.slice(0, lineCount);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#050508',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
      }}
    >
      <div style={{ maxWidth: 600, width: '100%', padding: 40 }}>
        <div style={{ fontSize: 11, lineHeight: 2, letterSpacing: '0.05em' }}>
          {visibleLines.map((line, i) => (
            <div
              key={i}
              style={{
                color: line.includes('ONLINE') ? '#00ff41' :
                       line.includes('CRITICAL') ? '#ff0000' :
                       '#00cc33',
                textShadow: '0 0 8px #00ff41',
                fontWeight: line.includes('ALL SYSTEMS') ? 700 : 400,
              }}
            >
              {line}
            </div>
          ))}
          {lineCount < LINES.length && (
            <span style={{ color: '#00ff41' }} className="boot-cursor" />
          )}
        </div>
      </div>
    </div>
  );
}
