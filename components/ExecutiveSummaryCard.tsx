'use client';

import { ExecutiveSummary } from '@/lib/types';

interface Props {
  summary: ExecutiveSummary;
}

export default function ExecutiveSummaryCard({ summary }: Props) {
  const riskColor = summary.riskScore >= 7 ? '#f87171' : summary.riskScore >= 4 ? '#fb923c' : '#34d399';
  const oppColor = summary.opportunityScore >= 7 ? '#34d399' : summary.opportunityScore >= 4 ? '#60a5fa' : '#94a3b8';

  return (
    <div className="executive-summary-card">
      <div className="exec-header">
        <div className="exec-header-icon">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="exec-title">Executive Summary</h2>
          <p className="exec-subtitle">AI Boardroom Decision Brief</p>
        </div>
        <div className="exec-alignment-badge">
          <span className="exec-alignment-label">Alignment</span>
          <span className="exec-alignment-score" style={{ color: summary.alignmentScore >= 70 ? '#34d399' : summary.alignmentScore >= 40 ? '#fb923c' : '#f87171' }}>
            {summary.alignmentScore}%
          </span>
        </div>
      </div>

      <div className="exec-grid">
        {/* Risk */}
        <div className="exec-card exec-risk">
          <div className="exec-card-header">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Top Risk</span>
            <div className="exec-score-pill" style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}44` }}>
              {summary.riskScore}/10
            </div>
          </div>
          <p className="exec-card-text">{summary.topRisk}</p>
        </div>

        {/* Opportunity */}
        <div className="exec-card exec-opportunity">
          <div className="exec-card-header">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Top Opportunity</span>
            <div className="exec-score-pill" style={{ background: oppColor + '22', color: oppColor, border: `1px solid ${oppColor}44` }}>
              {summary.opportunityScore}/10
            </div>
          </div>
          <p className="exec-card-text">{summary.topOpportunity}</p>
        </div>

        {/* Contested */}
        <div className="exec-card exec-contested">
          <div className="exec-card-header">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Contested Decision</span>
          </div>
          <p className="exec-card-text">{summary.contestedDecision}</p>
        </div>

        {/* Next Action */}
        <div className="exec-card exec-action">
          <div className="exec-card-header">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>Recommended Next Action</span>
          </div>
          <p className="exec-card-text">{summary.nextAction}</p>
        </div>
      </div>
    </div>
  );
}
