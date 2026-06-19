'use client';

import { Node } from '@/lib/types';

interface Props {
  nodes: Node[];
}

export default function DecisionHeatmap({ nodes }: Props) {
  if (nodes.length === 0) return null;

  // Group by source
  const sources: Array<'prd' | 'feature_request' | 'feedback'> = ['prd', 'feature_request', 'feedback'];
  const types: Array<'claim' | 'assumption' | 'requirement' | 'feedback_signal'> = ['claim', 'assumption', 'requirement', 'feedback_signal'];

  const sourceLabels = { prd: 'PRD', feature_request: 'Features', feedback: 'Feedback' };
  const typeLabels = { claim: 'Claims', assumption: 'Assumptions', requirement: 'Requirements', feedback_signal: 'Signals' };

  // Compute agreement score per (source, type) cell
  const getCell = (source: string, type: string) => {
    const cellNodes = nodes.filter(n => n.source === source && n.type === type);
    if (cellNodes.length === 0) return null;
    const freshCount = cellNodes.filter(n => n.status === 'fresh').length;
    const staleCount = cellNodes.filter(n => n.status === 'stale').length;
    const contestedCount = cellNodes.filter(n => n.status === 'contested').length;
    const avgConf = cellNodes.reduce((s, n) => s + n.confidence, 0) / cellNodes.length;
    const agreementScore = (freshCount / cellNodes.length) * avgConf;
    return { nodes: cellNodes, freshCount, staleCount, contestedCount, avgConf, agreementScore };
  };

  const getCellColor = (score: number, hasConflict: boolean) => {
    if (hasConflict) {
      if (score < 0.3) return { bg: 'rgba(248,113,113,0.25)', border: 'rgba(248,113,113,0.4)', text: '#f87171' };
      return { bg: 'rgba(251,146,60,0.2)', border: 'rgba(251,146,60,0.35)', text: '#fb923c' };
    }
    if (score > 0.7) return { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)', text: '#34d399' };
    if (score > 0.4) return { bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.25)', text: '#60a5fa' };
    return { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
  };

  // Source-level stats
  const sourceStats = sources.map(source => {
    const sourceNodes = nodes.filter(n => n.source === source);
    const stale = sourceNodes.filter(n => n.status === 'stale').length;
    const contested = sourceNodes.filter(n => n.status === 'contested').length;
    const conflictPct = sourceNodes.length ? Math.round(((stale + contested) / sourceNodes.length) * 100) : 0;
    const avgConf = sourceNodes.length ? sourceNodes.reduce((s, n) => s + n.confidence, 0) / sourceNodes.length : 0;
    return { source, total: sourceNodes.length, stale, contested, conflictPct, avgConf };
  });

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <div className="heatmap-title-row">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span>Decision Heatmap</span>
        </div>
        <p className="heatmap-subtitle">Agreement & conflict scores across sources and node types</p>
      </div>

      {/* Source stats bar */}
      <div className="heatmap-source-bars">
        {sourceStats.filter(s => s.total > 0).map(s => (
          <div key={s.source} className="heatmap-source-bar-item">
            <div className="heatmap-source-bar-label">
              <span className="heatmap-source-name">{sourceLabels[s.source]}</span>
              <span className="heatmap-source-conflict" style={{ color: s.conflictPct > 50 ? '#f87171' : s.conflictPct > 25 ? '#fb923c' : '#34d399' }}>
                {s.conflictPct}% conflict
              </span>
            </div>
            <div className="heatmap-source-bar-track">
              <div
                className="heatmap-source-bar-fill-fresh"
                style={{ width: `${s.total ? ((s.total - s.stale - s.contested) / s.total) * 100 : 0}%` }}
              />
              <div
                className="heatmap-source-bar-fill-contested"
                style={{ width: `${s.total ? (s.contested / s.total) * 100 : 0}%` }}
              />
              <div
                className="heatmap-source-bar-fill-stale"
                style={{ width: `${s.total ? (s.stale / s.total) * 100 : 0}%` }}
              />
            </div>
            <span className="heatmap-source-count">{s.total} nodes</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="heatmap-grid-wrapper">
        {/* Column headers */}
        <div className="heatmap-grid" style={{ gridTemplateColumns: `80px repeat(${types.length}, 1fr)` }}>
          <div />
          {types.map(type => (
            <div key={type} className="heatmap-col-header">{typeLabels[type]}</div>
          ))}

          {/* Rows */}
          {sources.map(source => (
            <>
              <div key={source} className="heatmap-row-header">{sourceLabels[source]}</div>
              {types.map(type => {
                const cell = getCell(source, type);
                if (!cell) return <div key={type} className="heatmap-cell heatmap-cell-empty" />;
                const hasConflict = cell.staleCount > 0 || cell.contestedCount > 0;
                const colors = getCellColor(cell.agreementScore, hasConflict);
                return (
                  <div
                    key={type}
                    className="heatmap-cell"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                    title={`${cell.nodes.length} nodes, ${(cell.agreementScore * 100).toFixed(0)}% agreement`}
                  >
                    <span className="heatmap-cell-score" style={{ color: colors.text }}>
                      {(cell.agreementScore * 100).toFixed(0)}%
                    </span>
                    <span className="heatmap-cell-count">{cell.nodes.length}n</span>
                    {hasConflict && (
                      <span className="heatmap-cell-conflict-dot" />
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <div className="heatmap-legend-item">
          <div className="heatmap-legend-dot" style={{ background: '#34d399' }} />
          <span>High agreement (fresh)</span>
        </div>
        <div className="heatmap-legend-item">
          <div className="heatmap-legend-dot" style={{ background: '#fb923c' }} />
          <span>Contested</span>
        </div>
        <div className="heatmap-legend-item">
          <div className="heatmap-legend-dot" style={{ background: '#f87171' }} />
          <span>Stale / High conflict</span>
        </div>
      </div>
    </div>
  );
}
