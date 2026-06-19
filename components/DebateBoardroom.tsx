'use client';

import { DebateLog, Node } from '@/lib/types';
import { useState } from 'react';

interface Props {
  logs: DebateLog[];
  nodes: Node[];
  thinkingAgent: { nodeId: string; persona: 'growth' | 'eng_realist' | 'user_advocate' } | null;
  isLoading: boolean;
}

const PERSONAS = {
  growth: {
    name: 'Growth',
    title: 'Growth Optimist',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.08)',
    border: 'rgba(52,211,153,0.2)',
    avatar: '🚀',
    description: 'Ship fast · Capture market · Drive retention',
  },
  eng_realist: {
    name: 'Engineering',
    title: 'Eng Realist',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.2)',
    avatar: '⚙️',
    description: 'Tech debt · Feasibility · Maintainability',
  },
  user_advocate: {
    name: 'User Advocate',
    title: 'User Advocate',
    color: '#c084fc',
    bg: 'rgba(192,132,252,0.08)',
    border: 'rgba(192,132,252,0.2)',
    avatar: '👤',
    description: 'Usability · Delight · Real feedback',
  },
};

const VERDICT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  proceed: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
  modify: { bg: 'rgba(251,146,60,0.12)', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  cut: { bg: 'rgba(248,113,113,0.12)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
};

function TypingIndicator({ persona }: { persona: 'growth' | 'eng_realist' | 'user_advocate' }) {
  const p = PERSONAS[persona];
  return (
    <div className="debate-bubble" style={{ borderColor: p.border, background: p.bg }}>
      <div className="debate-bubble-header" style={{ color: p.color }}>
        <span className="debate-avatar">{p.avatar}</span>
        <span className="debate-persona-name">{p.title}</span>
        <span className="debate-thinking-label">is thinking...</span>
      </div>
      <div className="typing-indicator">
        <span className="typing-dot" style={{ background: p.color }} />
        <span className="typing-dot" style={{ background: p.color, animationDelay: '0.2s' }} />
        <span className="typing-dot" style={{ background: p.color, animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

export default function DebateBoardroom({ logs, nodes, thinkingAgent, isLoading }: Props) {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  if (!isLoading && logs.length === 0) {
    return (
      <div className="boardroom-empty">
        <div className="boardroom-empty-icons">
          {Object.values(PERSONAS).map(p => (
            <span key={p.name} className="boardroom-empty-avatar">{p.avatar}</span>
          ))}
        </div>
        <p className="boardroom-empty-title">No Contested Decisions</p>
        <p className="boardroom-empty-sub">All nodes are aligned — no debate required. The boardroom is at peace.</p>
      </div>
    );
  }

  return (
    <div className="boardroom-container">
      {/* Persona legend */}
      <div className="boardroom-legend">
        {Object.values(PERSONAS).map(p => (
          <div key={p.name} className="boardroom-legend-item" style={{ borderColor: p.border, background: p.bg }}>
            <span>{p.avatar}</span>
            <div>
              <div className="boardroom-legend-name" style={{ color: p.color }}>{p.title}</div>
              <div className="boardroom-legend-desc">{p.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Debate sessions */}
      <div className="boardroom-sessions">
        {logs.map((log) => {
          const node = nodes.find(n => n.id === log.nodeId);
          const isExpanded = expandedLog === log.nodeId || logs.length === 1;
          const verdictKey = log.verdict ? log.verdict.toLowerCase().split(' ')[0] : '';
          const verdictStyle = VERDICT_COLORS[verdictKey] || VERDICT_COLORS.modify;
          const isCurrentlyDebating = thinkingAgent?.nodeId === log.nodeId;

          return (
            <div key={log.nodeId} className="boardroom-session">
              {/* Session header */}
              <button
                className="boardroom-session-header"
                onClick={() => setExpandedLog(isExpanded ? null : log.nodeId)}
              >
                <div className="boardroom-session-info">
                  <span className="boardroom-session-badge" style={{
                    background: node?.status === 'stale' ? 'rgba(251,146,60,0.15)' : 'rgba(248,113,113,0.15)',
                    color: node?.status === 'stale' ? '#fb923c' : '#f87171',
                    border: `1px solid ${node?.status === 'stale' ? 'rgba(251,146,60,0.3)' : 'rgba(248,113,113,0.3)'}`,
                  }}>
                    {node?.status?.toUpperCase() || 'CONTESTED'}
                  </span>
                  <span className="boardroom-session-node-id">{log.nodeId}</span>
                  <span className="boardroom-session-text">{node?.text}</span>
                </div>
                <div className="boardroom-session-right">
                  {log.verdict && (
                    <span className="boardroom-verdict-pill" style={{
                      background: verdictStyle.bg,
                      color: verdictStyle.text,
                      border: `1px solid ${verdictStyle.border}`,
                    }}>
                      {verdictKey === 'proceed' ? '✅' : verdictKey === 'cut' ? '❌' : '⚡'} {log.verdict.split(' - ')[0]}
                    </span>
                  )}
                  {isCurrentlyDebating && (
                    <span className="boardroom-live-badge">● LIVE</span>
                  )}
                  <svg
                    className="boardroom-chevron"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Debate turns */}
              {isExpanded && (
                <div className="boardroom-turns">
                  {log.turns.map((turn, i) => {
                    const p = PERSONAS[turn.persona];
                    return (
                      <div key={i} className="debate-bubble" style={{ borderColor: p.border, background: p.bg }}>
                        <div className="debate-bubble-header" style={{ color: p.color }}>
                          <span className="debate-avatar">{p.avatar}</span>
                          <span className="debate-persona-name">{p.title}</span>
                          {turn.respondingTo && (
                            <span className="debate-responding-to">↩ responding to {PERSONAS[turn.respondingTo as keyof typeof PERSONAS]?.name}</span>
                          )}
                        </div>
                        <p className="debate-bubble-text">{turn.text}</p>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {isCurrentlyDebating && thinkingAgent && (
                    <TypingIndicator persona={thinkingAgent.persona} />
                  )}

                  {/* Verdict */}
                  {log.verdict && (
                    <div className="debate-verdict" style={{
                      background: verdictStyle.bg,
                      border: `1px solid ${verdictStyle.border}`,
                    }}>
                      <div className="debate-verdict-label" style={{ color: verdictStyle.text }}>
                        👤 User Advocate Verdict
                      </div>
                      <p className="debate-verdict-text" style={{ color: verdictStyle.text }}>{log.verdict}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Active thinking indicator for new node not yet in logs */}
        {thinkingAgent && !logs.some(l => l.nodeId === thinkingAgent.nodeId) && (
          <div className="boardroom-session">
            <div className="boardroom-session-header" style={{ cursor: 'default' }}>
              <div className="boardroom-session-info">
                <span className="boardroom-live-badge">● LIVE</span>
                <span className="boardroom-session-node-id">{thinkingAgent.nodeId}</span>
                <span className="boardroom-session-text">
                  {nodes.find(n => n.id === thinkingAgent.nodeId)?.text || 'Loading...'}
                </span>
              </div>
            </div>
            <div className="boardroom-turns">
              <TypingIndicator persona={thinkingAgent.persona} />
            </div>
          </div>
        )}

        {/* Loading placeholder when no logs yet */}
        {isLoading && logs.length === 0 && (
          <div className="boardroom-session">
            <div className="boardroom-turns">
              <TypingIndicator persona="growth" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
