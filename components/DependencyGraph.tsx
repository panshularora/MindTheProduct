import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Node, GraphData } from '@/lib/types';

interface DependencyGraphProps {
  data: GraphData;
  onNodeSelect: (node: Node) => void;
  selectedNode: Node | null;
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

export default function DependencyGraph({ data, onNodeSelect, selectedNode }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const width = 600;
    const height = 400;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background', '#030712')
      .style('border-radius', '12px');

    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569');

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

    svg.call(zoom);

    const nodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
    const links: D3Link[] = data.edges.map((e) => ({
      source: e.from,
      target: e.to,
    }));

    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius((d) => (5 + d.confidence * 10) + 12));

    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrow)');

    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const originalNode = data.nodes.find((n) => n.id === d.id);
        if (originalNode) onNodeSelect(originalNode);
      });

    node
      .append('circle')
      .attr('r', (d) => 6 + d.confidence * 10)
      .attr('fill', (d) => {
        if (d.status === 'stale') return '#ef4444';
        if (d.status === 'contested') return '#f97316';
        return '#64748b';
      })
      .attr('stroke', (d) => {
        if (selectedNode?.id === d.id) return '#14b8a6';
        return '#1f2937';
      })
      .attr('stroke-width', (d) => (selectedNode?.id === d.id ? 3 : 1.5));

    node
      .append('text')
      .text((d) => d.id)
      .attr('dx', (d) => 10 + d.confidence * 10)
      .attr('dy', 4)
      .attr('fill', '#cbd5e1')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold');

    node.call(
      d3
        .drag<SVGGElement, D3Node>()
        .on('start', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

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
    };
  }, [data, onNodeSelect, selectedNode]);

  return (
    <div className="relative w-full h-[400px] border border-slate-800 rounded-xl overflow-hidden shadow-inner">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-2 flex flex-col space-y-1 bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-[10px] text-slate-400">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
          <span>Stale (Contradicted)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
          <span>Contested (Disagreement)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#64748b]" />
          <span>Fresh (Valid)</span>
        </div>
      </div>
    </div>
  );
}
