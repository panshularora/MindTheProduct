import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CodeGraph, Conflict } from '@/lib/code-graph';

interface ExplainedConflict {
  originalConflict: Conflict;
  platformSpecificExplanation: string;
  suggestedFix: string;
  severity: 'high' | 'medium' | 'low';
}

interface CodeDependencyGraphProps {
  graph: CodeGraph;
  conflicts: Conflict[];
  explainedConflicts: ExplainedConflict[];
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  type: 'file' | 'external_package' | 'node_builtin';
  inDegree: number;
  outDegree: number;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  importType: 'external_package' | 'internal_file' | 'node_builtin';
}

export default function CodeDependencyGraph({ graph, conflicts, explainedConflicts }: CodeDependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<D3Node | null>(null);

  // Map conflicts by file path
  const conflictMap = React.useMemo(() => {
    const map = new Map<string, Conflict>();
    conflicts.forEach(c => {
      if (c.filePath) {
        map.set(c.filePath, c);
      }
    });
    return map;
  }, [conflicts]);

  // Map explained conflicts by file path
  const explainedMap = React.useMemo(() => {
    const map = new Map<string, ExplainedConflict>();
    explainedConflicts.forEach(ec => {
      const path = ec.originalConflict?.filePath || (ec as unknown as { filePath?: string }).filePath;
      if (path) {
        map.set(path, ec);
      }
    });
    return map;
  }, [explainedConflicts]);

  // Compute in-degree and out-degree for each node
  const degrees = React.useMemo(() => {
    const inDegreeMap = new Map<string, number>();
    const outDegreeMap = new Map<string, number>();
    
    graph.nodes.forEach(n => {
      inDegreeMap.set(n.id, 0);
      outDegreeMap.set(n.id, 0);
    });

    graph.edges.forEach(e => {
      if (!inDegreeMap.has(e.from)) inDegreeMap.set(e.from, 0);
      if (!outDegreeMap.has(e.from)) outDegreeMap.set(e.from, 0);
      if (!inDegreeMap.has(e.to)) inDegreeMap.set(e.to, 0);
      if (!outDegreeMap.has(e.to)) outDegreeMap.set(e.to, 0);

      inDegreeMap.set(e.to, inDegreeMap.get(e.to)! + 1);
      outDegreeMap.set(e.from, outDegreeMap.get(e.from)! + 1);
    });

    return { inDegreeMap, outDegreeMap };
  }, [graph]);

  useEffect(() => {
    if (!svgRef.current || !graph.nodes.length) return;

    const width = 800;
    const height = 550;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background', '#030712')
      .style('border-radius', '12px');

    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom);

    // Prepare nodes and links
    const nodeMap = new Map<string, D3Node>();
    
    // 1. Add all explicit file nodes from the graph
    graph.nodes.forEach(n => {
      nodeMap.set(n.id, {
        id: n.id,
        type: 'file',
        inDegree: degrees.inDegreeMap.get(n.id) || 0,
        outDegree: degrees.outDegreeMap.get(n.id) || 0
      });
    });

    // 2. Identify and add missing nodes referenced in edges (like external packages or built-ins)
    graph.edges.forEach(e => {
      if (!nodeMap.has(e.to)) {
        let nodeType: 'file' | 'external_package' | 'node_builtin' = 'external_package';
        if (e.importType === 'node_builtin') {
          nodeType = 'node_builtin';
        } else if (e.importType === 'internal_file') {
          nodeType = 'file';
        }
        
        nodeMap.set(e.to, {
          id: e.to,
          type: nodeType,
          inDegree: degrees.inDegreeMap.get(e.to) || 0,
          outDegree: degrees.outDegreeMap.get(e.to) || 0
        });
      }
      
      if (!nodeMap.has(e.from)) {
        nodeMap.set(e.from, {
          id: e.from,
          type: 'file',
          inDegree: degrees.inDegreeMap.get(e.from) || 0,
          outDegree: degrees.outDegreeMap.get(e.from) || 0
        });
      }
    });

    const nodes: D3Node[] = Array.from(nodeMap.values());

    const links: D3Link[] = graph.edges.map(e => ({
      source: e.from,
      target: e.to,
      importType: e.importType
    }));

    // Setup simulation
    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius(d => Math.max(16, 8 + d.inDegree * 2.5)));

    // Draw links
    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', d => {
        if (d.importType === 'node_builtin') return 'var(--violet)'; 
        if (d.importType === 'internal_file') return 'var(--color-info)'; 
        return 'var(--color-neutral-dark)'; 
      })
      .attr('stroke-width', d => (d.importType === 'node_builtin' ? 2 : 1.2))
      .attr('stroke-dasharray', d => (d.importType === 'external_package' ? '3,3' : 'none'))
      .attr('opacity', 0.55);

    // Draw nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedNode(d);
      });

    // Pulsing glow for conflicts
    node
      .filter(d => conflictMap.has(d.id))
      .append('circle')
      .attr('class', 'conflict-pulse')
      .attr('fill', 'rgba(239,68,68,0.22)')
      .attr('stroke', 'var(--color-stale)')
      .attr('r', d => 11 + d.inDegree * 2.5);

    // Node core circle
    node
      .append('circle')
      .attr('r', d => 6 + d.inDegree * 2.5)
      .attr('fill', d => {
        if (conflictMap.has(d.id)) return 'var(--color-stale)'; 
        if (d.type === 'node_builtin') return '#2e1065'; 
        if (d.type === 'external_package') return '#1e293b'; 
        return '#0f172a'; 
      })
      .attr('stroke', d => {
        if (conflictMap.has(d.id)) return 'var(--color-stale-light, #fca5a5)';
        if (d.type === 'node_builtin') return 'var(--violet)'; 
        if (d.type === 'external_package') return 'var(--color-neutral-dark)'; 
        return 'var(--color-info)'; 
      })
      .attr('stroke-width', d => (conflictMap.has(d.id) ? 2 : 1.5))
      .style('filter', d => (conflictMap.has(d.id) ? 'drop-shadow(0 0 6px rgba(239,68,68,0.6))' : 'none'));

    // Label text
    node
      .append('text')
      .text(d => d.id.split('/').pop() || d.id)
      .attr('dx', d => 10 + d.inDegree * 2.5)
      .attr('dy', 4)
      .attr('fill', d => (conflictMap.has(d.id) ? 'var(--color-stale-light, #fca5a5)' : 'var(--color-neutral)'))
      .attr('font-size', '9px')
      .attr('font-family', 'var(--font-mono, monospace)')
      .attr('font-weight', d => (conflictMap.has(d.id) ? '700' : '500'));

    // Add titles/tooltips
    node.append('title').text(d => `${d.id}\nImports: ${d.outDegree}\nImported By: ${d.inDegree}`);

    // Drag handler
    node.call(
      d3
        .drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Update force positions
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x || 0)
        .attr('y1', d => (d.source as D3Node).y || 0)
        .attr('x2', d => (d.target as D3Node).x || 0)
        .attr('y2', d => (d.target as D3Node).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, conflictMap, degrees]);

  // Details calculations for selected node
  const nodeDetails = React.useMemo(() => {
    if (!selectedNode) return null;
    
    const incoming = graph.edges
      .filter(e => e.to === selectedNode.id)
      .map(e => e.from);
    
    const outgoing = graph.edges
      .filter(e => e.from === selectedNode.id)
      .map(e => ({ to: e.to, type: e.importType }));

    const conflict = conflictMap.get(selectedNode.id) || null;
    const explained = explainedMap.get(selectedNode.id) || null;

    return {
      incoming,
      outgoing,
      conflict,
      explained
    };
  }, [selectedNode, graph, conflictMap, explainedMap]);

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
      {/* CSS Pulse Style */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes conflictPulse {
          0% {
            opacity: 0.3;
            stroke-width: 1px;
            r: 10px;
          }
          50% {
            opacity: 0.85;
            stroke-width: 8px;
            r: 16px;
          }
          100% {
            opacity: 0.3;
            stroke-width: 1px;
            r: 10px;
          }
        }
        .conflict-pulse {
          animation: conflictPulse 1.8s infinite ease-in-out;
          transform-origin: center;
        }
      `}} />

      {/* SVG Canvas */}
      <div style={{ flex: '1 1 500px', minHeight: 450, position: 'relative' }}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%', border: '1px solid rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 16, fontSize: '0.7rem', color: 'var(--color-neutral)', background: 'rgba(5,8,16,0.85)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(4px)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-info)' }} /> Internal File
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--violet)' }} /> Node Built-in
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-neutral-dark)', border: '1px dashed rgba(255,255,255,0.3)' }} /> External Pack
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-stale)' }} /> Conflict
          </span>
        </div>
      </div>

      {/* Side Details Panel */}
      <div style={{ flex: '1 1 280px', background: 'rgba(30,41,59,0.2)', border: '1px solid var(--border-default, rgba(255,255,255,0.08))', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column' }}>
        {selectedNode && nodeDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ wordBreak: 'break-all', marginRight: 8 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-info)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selected File</span>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f0f6fc', marginTop: 2 }}>{selectedNode.id}</h4>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-neutral)', cursor: 'pointer', fontSize: '0.85rem', padding: 2 }}
              >
                ✕
              </button>
            </div>

            {/* Conflict Alert Section */}
            {nodeDetails.conflict && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-stale)', marginBottom: 6 }}>
                  🚨 {nodeDetails.conflict.type}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-stale-light, #fca5a5)', lineHeight: 1.4, marginBottom: 10 }}>
                  {nodeDetails.conflict.description}
                </p>
                {nodeDetails.explained && (
                  <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: 10, marginTop: 4 }}>
                    <h5 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-stale-light, #fca5a5)', marginBottom: 4 }}>Platform Impact</h5>
                    <p style={{ fontSize: '0.76rem', color: 'var(--color-neutral-light, #cbd5e1)', lineHeight: 1.4, marginBottom: 10 }}>
                      {nodeDetails.explained.platformSpecificExplanation}
                    </p>
                    <h5 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-stale-light, #fca5a5)', marginBottom: 4 }}>Suggested Fix</h5>
                    <p style={{ fontSize: '0.76rem', color: 'var(--color-info)', lineHeight: 1.4, fontWeight: 500 }}>
                      ✓ {nodeDetails.explained.suggestedFix}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Standard Stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-neutral)', textTransform: 'uppercase' }}>Imported By</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-info)' }}>{selectedNode.inDegree}</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-neutral)', textTransform: 'uppercase' }}>Imports</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-info)' }}>{selectedNode.outDegree}</div>
              </div>
            </div>

            {/* Imports list */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 220 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Imports ({nodeDetails.outgoing.length})
                </div>
                {nodeDetails.outgoing.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#57606a', fontStyle: 'italic' }}>No imports.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {nodeDetails.outgoing.map((out, idx) => (
                      <li 
                        key={idx} 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '4px 6px', 
                          borderRadius: 4, 
                          background: 'rgba(255,255,255,0.02)', 
                          marginBottom: 4, 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          border: '1px solid rgba(255,255,255,0.02)'
                        }}
                      >
                        <span style={{ color: '#c9d1d9', wordBreak: 'break-all', paddingRight: 6 }}>{out.to}</span>
                        <span 
                          style={{ 
                            fontSize: '0.55rem', 
                            fontWeight: 700, 
                            padding: '2px 5px', 
                            borderRadius: 4,
                            background: out.type === 'node_builtin' ? 'rgba(168,85,247,0.15)' : out.type === 'internal_file' ? 'rgba(6,182,212,0.15)' : 'rgba(71,85,105,0.15)',
                            color: out.type === 'node_builtin' ? '#c084fc' : out.type === 'internal_file' ? '#22d3ee' : '#94a3b8'
                          }}
                        >
                          {out.type === 'node_builtin' ? 'builtin' : out.type === 'internal_file' ? 'internal' : 'pkg'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Imported By ({nodeDetails.incoming.length})
                </div>
                {nodeDetails.incoming.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#57606a', fontStyle: 'italic' }}>Not imported by any workspace files.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {nodeDetails.incoming.map((inc, idx) => (
                      <li 
                        key={idx} 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '4px 6px', 
                          borderRadius: 4, 
                          background: 'rgba(255,255,255,0.02)', 
                          marginBottom: 4,
                          color: '#c9d1d9',
                          wordBreak: 'break-all',
                          border: '1px solid rgba(255,255,255,0.02)'
                        }}
                      >
                        {inc}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 250, textAlign: 'center', color: '#8b949e' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 10, color: '#38bdf8' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.084-1.085l-.042.022a.75.75 0 01-1.082 1.083zM12 21a9.003 9.003 0 008.313-5.558M12 3a9.003 9.003 0 018.313 5.558M12 21a9.003 9.003 0 01-8.313-5.558M12 3a9.003 9.003 0 00-8.313 5.558V21M12 13.5v.008M12 16.5v.008" />
            </svg>
            <p style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
              Click any file node in the dependency graph to inspect imports, in-degree/out-degree, and detailed deployment conflicts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
