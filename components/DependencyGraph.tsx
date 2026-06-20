import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Node, GraphData } from '@/lib/types';

interface DependencyGraphProps {
  data: GraphData;
  onNodeSelect: (node: Node) => void;
  selectedNode: Node | null;
  onImpactChange?: (nodeId: string | null, impactedIds: Set<string>) => void;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  text: string;
  source: string;
  confidence: number;
  status: string;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
}

function getNodeLayer(node: { type: string; source: string }): number {
  if (node.type === 'claim' && node.source === 'prd') return 0; // Goals
  if (node.type === 'assumption') return 1;                     // Assumptions
  if (node.type === 'requirement' && node.source === 'prd') return 2; // Requirements
  if (node.source === 'feature_request') return 3;              // Features
  return 4;                                                     // Feedback / Evidence
}

const LAYER_LABELS = [
  'Goals (PRD Claims)',
  'Assumptions',
  'Requirements',
  'Features',
  'Feedback & Evidence'
];

function getDownstreamNodeIds(nodeId: string, edges: { from: string; to: string }[]): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visited;
}

export default function DependencyGraph({ data, onNodeSelect, selectedNode, onImpactChange }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const width = 600;
    const height = 480; // Extended height for 5 layers

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background', '#040711')
      .style('border-radius', '16px');

    // Add marker defs for arrows
    const defs = svg.append('defs');
    
    // Normal arrow
    defs.append('marker')
      .attr('id', 'arrow-normal')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#334155');

    // Highlighted downstream arrow
    defs.append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#2dd4bf');

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

    svg.call(zoom);

    // Draw background layers and lines inside the zoomed group
    const layerYCoords = [55, 140, 225, 310, 395];

    // Background horizontal divider lines
    for (let i = 0; i < layerYCoords.length - 1; i++) {
      const midY = (layerYCoords[i] + layerYCoords[i + 1]) / 2;
      g.append('line')
        .attr('x1', -500)
        .attr('x2', width + 500)
        .attr('y1', midY)
        .attr('y2', midY)
        .attr('stroke', 'rgba(255,255,255,0.03)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4, 4');
    }

    // Layer Labels in background
    layerYCoords.forEach((y, i) => {
      g.append('text')
        .attr('x', 20)
        .attr('y', y - 25)
        .attr('fill', 'rgba(255,255,255,0.15)')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .attr('text-transform', 'uppercase')
        .attr('letter-spacing', '0.08em')
        .text(LAYER_LABELS[i]);
    });

    const nodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
    const links: D3Link[] = data.edges.map((e) => ({
      source: e.from,
      target: e.to,
    }));

    // Setup coordinates based on layer
    nodes.forEach(n => {
      const layer = getNodeLayer(n);
      n.y = layerYCoords[layer];
      n.fy = layerYCoords[layer]; // Pin vertical rank positions
    });

    // Compute downstream set if a node is selected
    const selectedDownstream = selectedNode
      ? getDownstreamNodeIds(selectedNode.id, data.edges)
      : new Set<string>();

    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(90)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius((d) => (5 + d.confidence * 10) + 15));

    // Render links
    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        if (selectedNode && (sourceId === selectedNode.id || (selectedDownstream.has(sourceId) && selectedDownstream.has(targetId)))) {
          return '#2dd4bf'; // Highlight downstream path
        }
        return '#1e293b';
      })
      .attr('stroke-width', (d) => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        if (selectedNode && (sourceId === selectedNode.id || selectedDownstream.has(sourceId))) {
          return 2.5;
        }
        return 1.5;
      })
      .attr('marker-end', (d) => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        if (selectedNode && (sourceId === selectedNode.id || selectedDownstream.has(sourceId))) {
          return 'url(#arrow-highlight)';
        }
        return 'url(#arrow-normal)';
      });

    // Render nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const originalNode = data.nodes.find((n) => n.id === d.id);
        if (originalNode) {
          onNodeSelect(originalNode);
          const downstream = getDownstreamNodeIds(originalNode.id, data.edges);
          onImpactChange?.(originalNode.id, downstream);
        }
      });

    // Outer aura/glow for selected and downstream nodes
    node
      .append('circle')
      .attr('class', 'aura-circle')
      .attr('r', (d) => 12 + d.confidence * 10)
      .attr('fill', 'transparent')
      .attr('stroke', (d) => {
        if (selectedNode?.id === d.id) return 'rgba(45,212,191,0.2)';
        if (selectedDownstream.has(d.id)) return 'rgba(167,139,250,0.1)';
        return 'transparent';
      })
      .attr('stroke-width', 3)
      .style('stroke-dasharray', (d) => (selectedDownstream.has(d.id) ? '2, 2' : 'none'));

    // Core circle
    node
      .append('circle')
      .attr('r', (d) => 7 + d.confidence * 10)
      .attr('fill', (d) => {
        if (d.status === 'stale') return 'var(--color-stale)';
        if (d.status === 'contested') return 'var(--color-contested)';
        return 'var(--color-fresh)';
      })
      .attr('stroke', (d) => {
        if (selectedNode?.id === d.id) return 'var(--color-info)';
        if (selectedDownstream.has(d.id)) return 'var(--violet)';
        return '#0f172a';
      })
      .attr('stroke-width', (d) => (selectedNode?.id === d.id ? 3 : selectedDownstream.has(d.id) ? 2 : 1.5))
      .style('filter', (d) => (selectedNode?.id === d.id ? 'drop-shadow(0 0 8px rgba(45,212,191,0.5))' : 'none'));

    // Text labels
    node
      .append('text')
      .text((d) => d.id)
      .attr('dx', (d) => 12 + d.confidence * 10)
      .attr('dy', 4)
      .attr('fill', (d) => {
        if (selectedNode?.id === d.id) return '#2dd4bf';
        if (selectedDownstream.has(d.id)) return '#c4b5fd';
        return '#94a3b8';
      })
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', '700');

    // Drag behavior
    node.call(
      d3
        .drag<SVGGElement, D3Node>()
        .on('start', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
        })
        .on('drag', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          d.fx = event.x; // Drag freely on X-axis, keep Y layer pinned
        })
        .on('end', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
        })
    );

    // Dynamic animated ripple particles flowing along edges
    const pulsingLinks = links.filter((l) => {
      const sourceNode = nodes.find(n => n.id === (typeof l.source === 'object' ? l.source.id : l.source));
      return sourceNode && (sourceNode.status === 'stale' || sourceNode.status === 'contested');
    });

    const particles = g
      .append('g')
      .selectAll('circle')
      .data(pulsingLinks)
      .enter()
      .append('circle')
      .attr('r', 3.5)
      .attr('fill', (d) => {
        const sourceNode = nodes.find(n => n.id === (typeof d.source === 'object' ? d.source.id : d.source));
        return sourceNode?.status === 'stale' ? 'var(--color-stale)' : 'var(--color-contested)';
      })
      .attr('opacity', 0.95)
      .style('filter', 'drop-shadow(0 0 3px rgba(239,68,68,0.5))');

    let isAnimActive = true;
    const animate = () => {
      if (!isAnimActive) return;
      
      const duration = 1800; // time in ms to traverse edge
      const progress = (Date.now() % duration) / duration;

      particles
        .attr('cx', (d) => {
          const x1 = (d.source as D3Node).x || 0;
          const x2 = (d.target as D3Node).x || 0;
          return x1 + (x2 - x1) * progress;
        })
        .attr('cy', (d) => {
          const y1 = (d.source as D3Node).y || 0;
          const y2 = (d.target as D3Node).y || 0;
          return y1 + (y2 - y1) * progress;
        });

      requestAnimationFrame(animate);
    };

    animate();

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x || 0)
        .attr('y1', (d) => (d.source as D3Node).y || 0)
        .attr('x2', (d) => (d.target as D3Node).x || 0)
        .attr('y2', (d) => (d.target as D3Node).y || 0);

      node.attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    return () => {
      simulation.stop();
      isAnimActive = false;
    };
  }, [data, onNodeSelect, selectedNode, onImpactChange]);

  return (
    <div className="relative w-full h-[480px] border border-slate-800 rounded-xl overflow-hidden shadow-inner">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 right-3 flex flex-col space-y-1 bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-800 text-[10px] text-slate-400">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-stale)]" />
          <span>Stale (Ripple active)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-contested)]" />
          <span>Contested (Ripple active)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-fresh)]" />
          <span>Fresh (Valid)</span>
        </div>
      </div>
    </div>
  );
}
