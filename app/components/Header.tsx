'use client';
import { useEffect, useState } from 'react';

interface HeaderProps {
  criticalCount: number;
}

export default function Header({ criticalCount }: HeaderProps) {
  const [utcTime, setUtcTime] = useState('');
  const [live, setLive] = useState(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 19));
    };
    tick();
    const interval = setInterval(tick, 1000);
    const blink = setInterval(() => setLive(l => !l), 1000);
    return () => { clearInterval(interval); clearInterval(blink); };
  }, []);

  const getThreatLevel = () => {
    if (criticalCount >= 5) return { label: 'CRITICAL', color: '#ff0000', bars: 6 };
    if (criticalCount >= 3) return { label: 'HIGH', color: '#ff4444', bars: 4 };
    if (criticalCount >= 1) return { label: 'ELEVATED', color: '#ff8c00', bars: 3 };
    return { label: 'LOW', color: '#00ff41', bars: 1 };
  };

  const threat = getThreatLevel();

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '40px',
        borderBottom: '1px solid #0a2a0a',
        flexShrink: 0,
      }}
    >
      {/* Left: logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.2em', color: '#00ff41' }} className="glow">
          ◈ SENTINEL
        </span>
        <span style={{ fontSize: 10, color: '#1a4a1a', letterSpacing: '0.1em' }}>
          OSINT PLATFORM v1.0
        </span>
      </div>

      {/* Center: UTC clock */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: '#1a4a1a', letterSpacing: '0.15em', marginRight: 8 }}>UTC</span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.1em' }} className="glow">
          {utcTime}
        </span>
      </div>

      {/* Right: threat + live */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#1a4a1a', letterSpacing: '0.15em' }}>THREAT</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 14,
                  background: i < threat.bars ? threat.color : '#0a2a0a',
                  boxShadow: i < threat.bars ? `0 0 4px ${threat.color}` : 'none',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: threat.color, letterSpacing: '0.1em', fontWeight: 600 }}>
            {threat.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: live ? '#00ff41' : 'transparent', fontSize: 12 }}>●</span>
          <span style={{ fontSize: 10, color: '#00ff41', letterSpacing: '0.15em' }}>LIVE</span>
        </div>
      </div>
    </div>
  );
}
