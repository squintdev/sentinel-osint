'use client';
import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { IntelItem } from './IntelFeed';

interface EntityGraphProps {
  item: IntelItem | null;
  allItems?: IntelItem[];
  onClose: () => void;
  onFilterByEntity?: (entity: string | null) => void;
}

type EntityType = 'place' | 'org' | 'person' | 'keyword';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: EntityType;
  freq: number;       // mentions across all items
  isFocused: boolean; // appears in clicked item
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  weight: number; // co-occurrence count
}

const TYPE_COLORS: Record<string, string> = {
  place:   '#4488ff',
  org:     '#ff8c00',
  person:  '#00ff41',
  keyword: '#888888',
};

function classifyEntity(entity: string): EntityType {
  const places = ['US','USA','Iran','Russia','China','Ukraine','Israel','NATO','Korea','Syria','Iraq','Afghanistan','Europe','Asia','Africa','Lebanon','Yemen','Gaza','Pakistan','Saudi','Turkey','UK','France','Germany','Japan','India'];
  const orgs   = ['Army','Navy','CIA','FBI','Pentagon','Congress','Senate','Agency','Command','Force','Corps','Department','Ministry','Council','Government','Police','Military','Coalition','Alliance','UN','EU'];
  if (places.some(w => entity.includes(w))) return 'place';
  if (orgs.some(w => entity.includes(w))) return 'org';
  if (entity.split(' ').length >= 2 && /^[A-Z]/.test(entity.split(' ')[1])) return 'person';
  return 'keyword';
}

export default function EntityGraph({ item, allItems = [], onClose, onFilterByEntity }: EntityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handleNodeClick = useCallback((entity: string) => {
    onFilterByEntity?.(entity);
    onClose();
  }, [onFilterByEntity, onClose]);

  useEffect(() => {
    if (!svgRef.current || allItems.length === 0) return;

    const W = 680;
    const H = 460;
    const focusedEntities = new Set(item?.entities || []);

    // --- Build frequency map across ALL items ---
    const freq = new Map<string, number>();
    const coOccur = new Map<string, number>(); // "A||B" -> count

    allItems.forEach(intel => {
      const ents = intel.entities.filter(e => e.length > 2);
      ents.forEach(e => freq.set(e, (freq.get(e) || 0) + 1));
      // co-occurrence
      for (let i = 0; i < ents.length; i++) {
        for (let j = i + 1; j < ents.length; j++) {
          const key = [ents[i], ents[j]].sort().join('||');
          coOccur.set(key, (coOccur.get(key) || 0) + 1);
        }
      }
    });

    // Keep top 20 entities by frequency
    const topEntities = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, f]) => ({
        id,
        label: id,
        type: classifyEntity(id),
        freq: f,
        isFocused: focusedEntities.has(id),
      } as GraphNode));

    const nodeIds = new Set(topEntities.map(n => n.id));

    // Links: co-occurrences between top entities only
    const links: GraphLink[] = [];
    coOccur.forEach((weight, key) => {
      const [a, b] = key.split('||');
      if (nodeIds.has(a) && nodeIds.has(b) && weight >= 2) {
        links.push({ source: a, target: b, weight });
      }
    });

    // --- D3 ---
    d3.select(svgRef.current).selectAll('*').remove();
    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H);

    // Background
    svg.append('rect').attr('width', W).attr('height', H)
      .attr('fill', 'rgba(0,8,0,0.0)');

    const sim = d3.forceSimulation<GraphNode>(topEntities)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => 80 - d.weight * 5).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => nodeRadius(d) + 8));

    const nodeRadius = (d: GraphNode) => Math.max(6, Math.min(24, 5 + d.freq * 3));

    // Links
    const linkSel = svg.append('g').selectAll('line')
      .data(links).enter().append('line')
      .attr('stroke', '#1a3a1a')
      .attr('stroke-width', d => Math.min(4, 1 + d.weight * 0.5))
      .attr('stroke-opacity', 0.6);

    // Nodes
    const nodeSel = svg.append('g').selectAll('g')
      .data(topEntities).enter().append('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', (_, d) => handleNodeClick(d.id));

    nodeSel.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => TYPE_COLORS[d.type] + (d.isFocused ? 'ff' : '55'))
      .attr('stroke', d => d.isFocused ? TYPE_COLORS[d.type] : '#1a3a1a')
      .attr('stroke-width', d => d.isFocused ? 2 : 1);

    // Glow on focused nodes
    topEntities.filter(d => d.isFocused).forEach(d => {
      svg.select(`circle[data-id="${d.id}"]`);
    });

    nodeSel.append('text')
      .text(d => d.label.slice(0, 14))
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 11)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '9px')
      .attr('fill', d => d.isFocused ? TYPE_COLORS[d.type] : '#446644')
      .attr('pointer-events', 'none');

    // Freq badge
    nodeSel.append('text')
      .text(d => String(d.freq))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8px')
      .attr('fill', '#000')
      .attr('pointer-events', 'none');

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => { sim.stop(); };
  }, [item, allItems, handleNodeClick]);

  const totalItems = allItems.length;
  const topEntity = allItems.flatMap(i => i.entities)
    .reduce((acc, e) => { acc[e] = (acc[e]||0)+1; return acc; }, {} as Record<string,number>);
  const hottest = Object.entries(topEntity).sort((a,b)=>b[1]-a[1])[0];

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 720, background: 'rgba(0,8,0,0.97)',
        border: '1px solid #00ff41',
        boxShadow: '0 0 40px rgba(0,255,65,0.15)',
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        {/* Header */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #0a2a0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 9, color: '#00ff41', letterSpacing: '0.15em' }}>◈ ACTOR FREQUENCY MAP</span>
            {item && <span style={{ fontSize: 9, color: '#446644', marginLeft: 12 }}>FOCUS: {item.headline.slice(0, 50)}…</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stats bar */}
        <div style={{ padding: '5px 12px', borderBottom: '1px solid #0a2a0a', display: 'flex', gap: 24 }}>
          <span style={{ fontSize: 9, color: '#446644' }}>FEED ITEMS: <span style={{ color: '#00ff41' }}>{totalItems}</span></span>
          {hottest && <span style={{ fontSize: 9, color: '#446644' }}>HOTTEST ACTOR: <span style={{ color: '#ff8c00' }}>{hottest[0]}</span> <span style={{ color: '#00ff41' }}>×{hottest[1]}</span></span>}
          <span style={{ fontSize: 9, color: '#446644' }}>NODE SIZE = mention frequency · BRIGHTNESS = in current item · CLICK = filter feed</span>
        </div>

        {/* Legend */}
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #0a2a0a', display: 'flex', gap: 16 }}>
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <span key={t} style={{ fontSize: 8, color: c, letterSpacing: '0.1em' }}>■ {t.toUpperCase()}</span>
          ))}
        </div>

        {/* Graph */}
        <svg ref={svgRef} style={{ display: 'block', width: '100%', height: 460 }} />
      </div>
    </div>
  );
}
