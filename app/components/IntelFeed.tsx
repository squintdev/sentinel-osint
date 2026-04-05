'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const EntityGraph = dynamic(() => import('./EntityGraph'), { ssr: false });

export interface IntelItem {
  id: string;
  timestamp: string;
  category: 'SIGINT' | 'HUMINT' | 'OSINT' | 'GEOINT';
  headline: string;
  source: string;
  entities: string[];
  lat?: number;
  lng?: number;
  priority: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
}

interface IntelFeedProps {
  items: IntelItem[];
  onItemClick?: (item: IntelItem) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff0000',
  HIGH: '#ff4444',
  MED: '#ff8c00',
  LOW: '#1a4a1a',
};

const CATEGORY_COLORS: Record<string, string> = {
  SIGINT: '#00ff41',
  HUMINT: '#ff8c00',
  OSINT: '#4488ff',
  GEOINT: '#ff44ff',
};

export default function IntelFeed({ items, onItemClick }: IntelFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);
  const [selectedItem, setSelectedItem] = useState<IntelItem | null>(null);
  const [entityFilter, setEntityFilter] = useState<string | null>(null);

  const displayItems = entityFilter
    ? items.filter(i => i.entities.includes(entityFilter))
    : items;

  useEffect(() => {
    if (items.length !== prevLen.current) {
      prevLen.current = items.length;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [items]);

  return (
    <>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="panel-header">INTEL FEED</div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {items.length === 0 && (
            <div style={{ padding: 16, color: '#1a4a1a', fontSize: 10, textAlign: 'center' }}>
              AWAITING INTELLIGENCE FEED...
            </div>
          )}
          {items.map((item, i) => (
            <div
              key={item.id}
              className={i === 0 ? 'intel-item-new' : ''}
              data-intel-item="true"
              onClick={() => {
                setSelectedItem(item);
                onItemClick?.(item);
              }}
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid #030d03',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,255,65,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Priority + timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: PRIORITY_COLORS[item.priority],
                    border: `1px solid ${PRIORITY_COLORS[item.priority]}`,
                    padding: '1px 4px',
                    lineHeight: 1.4,
                  }}
                >
                  {item.priority}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    color: CATEGORY_COLORS[item.category],
                    letterSpacing: '0.08em',
                  }}
                >
                  {item.category}
                </span>
                <span style={{ fontSize: 8, color: '#1a4a1a', marginLeft: 'auto' }}>
                  {item.timestamp}
                </span>
              </div>

              {/* Headline */}
              <div
                style={{
                  fontSize: 10,
                  color: '#00cc33',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {item.headline}
              </div>

              {/* Source + entities */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: '#1a4a1a' }}>{item.source}</span>
                {(item.entities || []).slice(0, 3).map(entity => (
                  <span
                    key={entity}
                    style={{
                      fontSize: 8,
                      color: '#ff8c00',
                      background: 'rgba(255,140,0,0.08)',
                      padding: '0 3px',
                    }}
                  >
                    [{entity}]
                  </span>
                ))}
                {item.lat != null && (
                  <span style={{ fontSize: 8, color: '#446644', marginLeft: 'auto' }}>◈</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {entityFilter && (
        <div onClick={() => setEntityFilter(null)} style={{
          padding: '4px 8px', background: 'rgba(255,140,0,0.1)',
          borderBottom: '1px solid #ff8c00', cursor: 'pointer',
          fontSize: 9, color: '#ff8c00', letterSpacing: '0.1em',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>FILTER: {entityFilter} ({displayItems.length} items)</span>
          <span>✕ CLEAR</span>
        </div>
      )}
      {selectedItem && (
        <EntityGraph
          item={selectedItem}
          allItems={items}
          onClose={() => setSelectedItem(null)}
          onFilterByEntity={(e) => { setEntityFilter(e); setSelectedItem(null); }}
        />
      )}
    </>
  );
}
