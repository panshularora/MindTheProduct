'use client';

import { useState, useCallback } from 'react';
import { Node, GraphData, DebateLog, RoadmapItem, ExecutiveSummary } from '@/lib/types';
import DependencyGraph from '@/components/DependencyGraph';
import DebateBoardroom from '@/components/DebateBoardroom';
import RoadmapView from '@/components/RoadmapView';
import ExecutiveSummaryCard from '@/components/ExecutiveSummaryCard';
import DecisionHeatmap from '@/components/DecisionHeatmap';

// ─── Sample Data ──────────────────────────────────────────────────────────────

const JUDGE_PRD = `PRODUCT REQUIREMENT DOCUMENT: AI Customer Support Agent
Goal: Reduce support seat costs and lower first-response times by 80%.
Key Claim: Integrating an automated AI chatbot will handle 50% of incoming queries.
Assumption: Users prefer immediate AI answers over waiting 15 minutes for a human.
Success Metric: CSAT maintained above 85%, ticket resolution within 2 minutes.`;

const JUDGE_FEATURES = `FEATURE REQUESTS:
- Embeddable AI chatbot widget inside the web dashboard.
- Auto-resolve ticket logic: automatically close tickets once AI provides an answer.
- Automated API-level action handlers for AI to process refunds and plan downgrades without staff review.
- Escalation path: allow users to request human agent at any point.`;

const JUDGE_FEEDBACK = `USER FEEDBACK & METRICS:
- CSAT Report: Score dropped from 92% to 68% since launching the AI agent.
- Support Ticket #4820: "The chatbot kept repeating the same useless link and then closed my ticket. I couldn't find any button to speak to a human."
- Support Team Review: Users are creating duplicate tickets because the bot auto-closes threads before issues are resolved. Billing refund API actions executed by the bot led to $4,000 in incorrect payouts due to lack of verification.
- Positive: 23% of simple how-to queries were correctly resolved by the bot.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeExecutiveSummary(nodes: Node[], debateLogs: DebateLog[], roadmap: RoadmapItem[]): ExecutiveSummary {
  const staleNodes = nodes.filter(n => n.status === 'stale');
  const contestedNodes = nodes.filter(n => n.status === 'contested');
  const freshNodes = nodes.filter(n => n.status === 'fresh');
  const alignmentScore = nodes.length ? Math.round((freshNodes.length / nodes.length) * 100) : 0;

  const topRiskNode = [...staleNodes, ...contestedNodes].sort((a, b) => a.confidence - b.confidence)[0];
  const topFreshNode = freshNodes.sort((a, b) => b.confidence - a.confidence)[0];
  const topDebate = debateLogs[0];
  const topRoadmapItem = roadmap[0];

  return {
    topRisk: topRiskNode?.text || 'No critical risks detected — all assumptions appear validated.',
    topOpportunity: topRoadmapItem?.title || topFreshNode?.text || 'Strong alignment across all product nodes.',
    contestedDecision: topDebate
      ? `Node ${topDebate.nodeId}: ${nodes.find(n => n.id === topDebate.nodeId)?.text || topDebate.nodeId} — ${topDebate.verdict}`
      : 'No contested decisions requiring debate.',
    nextAction: topRoadmapItem?.rationale?.split('.')[0] + '.' || 'Proceed with roadmap execution.',
    riskScore: Math.min(10, Math.round(((staleNodes.length + contestedNodes.length) / Math.max(nodes.length, 1)) * 10)),
    opportunityScore: Math.min(10, Math.round((freshNodes.length / Math.max(nodes.length, 1)) * 10)),
    alignmentScore,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [prd, setPrd] = useState('');
  const [featureRequests, setFeatureRequests] = useState('');
  const [feedback, setFeedback] = useState('');

  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [debateLogs, setDebateLogs] = useState<DebateLog[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<{ nodeId: string; persona: 'growth' | 'eng_realist' | 'user_advocate' } | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'heatmap'>('graph');
  const [isJudgeMode, setIsJudgeMode] = useState(false);

  const handleJudgeMode = () => {
    setPrd(JUDGE_PRD);
    setFeatureRequests(JUDGE_FEATURES);
    setFeedback(JUDGE_FEEDBACK);
    setIsJudgeMode(true);
  };

  const handleReferenceSelect = (nodeId: string) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (targetNode) {
      setSelectedNode(targetNode);
      document.getElementById('graph-stage-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShowResults(true);
    setNodes([]);
    setGraph(null);
    setDebateLogs([]);
    setRoadmap([]);
    setExecutiveSummary(null);
    setSelectedNode(null);
    setThinkingAgent(null);

    try {
      // ── Step 1: Extract ────────────────────────────────────────────────────
      setActiveStep(1);
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prd, featureRequests, feedback }),
      });
      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed in Node Extraction phase');
      }
      const extractData = await extractRes.json();
      setNodes(extractData.nodes);

      // ── Step 2: Graph ──────────────────────────────────────────────────────
      setActiveStep(2);
      const graphRes = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: extractData.nodes }),
      });
      if (!graphRes.ok) {
        const errData = await graphRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed in Graph Construction phase');
      }
      const graphData: GraphData = await graphRes.json();
      setGraph(graphData);

      // ── Step 3: Debate ─────────────────────────────────────────────────────
      setActiveStep(3);
      const debateRes = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staleOrContestedNodes: graphData.nodes.filter((n: Node) => n.status === 'stale' || n.status === 'contested'),
          allNodes: graphData.nodes,
        }),
      });

      if (!debateRes.ok) {
        const errData = await debateRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start agent debate');
      }

      const reader = debateRes.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const localDebateLogs: DebateLog[] = [];

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'start_debate') {
                if (!localDebateLogs.some(log => log.nodeId === data.nodeId)) {
                  localDebateLogs.push({ nodeId: data.nodeId, turns: [], verdict: '' });
                }
                setDebateLogs([...localDebateLogs]);
              } else if (data.type === 'thinking') {
                setThinkingAgent({ nodeId: data.nodeId, persona: data.persona });
              } else if (data.type === 'turn') {
                setThinkingAgent(null);
                const log = localDebateLogs.find(l => l.nodeId === data.nodeId);
                if (log) log.turns.push(data.turn);
                setDebateLogs([...localDebateLogs]);
              } else if (data.type === 'verdict') {
                const log = localDebateLogs.find(l => l.nodeId === data.nodeId);
                if (log) log.verdict = data.verdict;
                setDebateLogs([...localDebateLogs]);
              } else if (data.type === 'complete') {
                setThinkingAgent(null);
              }
            } catch { /* ignore malformed lines */ }
          }
        }
      }

      // ── Step 4: Synthesize ─────────────────────────────────────────────────
      setActiveStep(4);
      const synthRes = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphData,
          debateLogs: localDebateLogs,
          originalFeatureRequests: featureRequests,
        }),
      });
      if (!synthRes.ok) {
        const errData = await synthRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed in Roadmap Synthesis phase');
      }
      const synthData = await synthRes.json();
      setRoadmap(synthData.roadmap);

      // ── Executive Summary ──────────────────────────────────────────────────
      const summary = computeExecutiveSummary(graphData.nodes, localDebateLogs, synthData.roadmap);
      setExecutiveSummary(summary);

      setActiveStep(5);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  }, [prd, featureRequests, feedback]);

  const staleCount = nodes.filter(n => n.status === 'stale').length;
  const contestedCount = nodes.filter(n => n.status === 'contested').length;
  const freshCount = nodes.filter(n => n.status === 'fresh').length;

  const STEPS = [
    { id: 1, name: 'Extracting Nodes', icon: '📊', color: '#2dd4bf' },
    { id: 2, name: 'Building Graph', icon: '🕸️', color: '#34d399' },
    { id: 3, name: 'Agent Debate', icon: '⚡', color: '#a78bfa' },
    { id: 4, name: 'Synthesizing Roadmap', icon: '🗺️', color: '#60a5fa' },
  ];

  return (
    <div className="app-root">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="header-logo">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="header-title">Product Council AI</h1>
              <p className="header-tagline">AI Executive Boardroom · 4-Stage Decision Engine</p>
            </div>
          </div>
          <div className="header-actions">
            <button onClick={handleJudgeMode} className="btn-judge" disabled={loading}>
              <span>⚡</span> Judge Mode Demo
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* ── Input Section ─────────────────────────────────────────────────── */}
        <section className="card input-section">
          <div className="input-section-header">
            <h2 className="section-title">
              <span className="section-title-icon">📝</span>
              Configure Your Product Council
            </h2>
            {isJudgeMode && (
              <div className="judge-mode-badge">
                <span className="judge-mode-dot" />
                Judge Mode Active
              </div>
            )}
          </div>

          <div className="input-grid">
            {[
              { id: 'prd-input', label: 'Product Requirement Document', placeholder: 'Paste key claims, metrics, and core assumptions from your PRD...', value: prd, setter: setPrd, color: '#60a5fa' },
              { id: 'features-input', label: 'Feature Requests', placeholder: 'Paste product ideas, backlog items, or technical specs...', value: featureRequests, setter: setFeatureRequests, color: '#fb923c' },
              { id: 'feedback-input', label: 'User Feedback & Signals', placeholder: 'Paste raw customer feedback, CSAT data, support tickets...', value: feedback, setter: setFeedback, color: '#a78bfa' },
            ].map(({ id, label, placeholder, value, setter, color }) => (
              <div key={id} className="input-field-wrapper">
                <label htmlFor={id} className="input-label" style={{ color }}>
                  <span className="input-label-dot" style={{ background: color }} />
                  {label}
                </label>
                <textarea
                  id={id}
                  rows={8}
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  className="input-textarea"
                  style={{ '--focus-color': color } as React.CSSProperties}
                />
                <div className="input-char-count" style={{ color: value.length > 0 ? color : '#475569' }}>
                  {value.length > 0 ? `${value.length} chars` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="input-actions">
            <button
              onClick={runAnalysis}
              disabled={loading || !prd.trim() || !featureRequests.trim() || !feedback.trim()}
              className="btn-run"
              id="run-analysis-btn"
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  <span>Council in session...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Convene the AI Boardroom</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <div className="error-banner">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span><strong>Pipeline Error:</strong> {error}</span>
          </div>
        )}

        {/* ── Pipeline Progress ──────────────────────────────────────────────── */}
        {loading && (
          <div className="pipeline-progress-bar">
            {STEPS.map((step, i) => {
              const isDone = activeStep > step.id;
              const isActive = activeStep === step.id;
              return (
                <div key={step.id} className="pipeline-step-wrapper">
                  <div className={`pipeline-step ${isActive ? 'pipeline-step-active' : isDone ? 'pipeline-step-done' : ''}`}
                    style={{ '--step-color': step.color } as React.CSSProperties}
                  >
                    <span className="pipeline-step-icon">{isDone ? '✓' : step.icon}</span>
                    <span className="pipeline-step-name">{step.name}</span>
                    {isActive && <span className="pipeline-step-pulse" style={{ background: step.color }} />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="pipeline-connector" style={{ background: isDone ? step.color : '#1e293b' }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────────── */}
        {showResults && (
          <div className="results-container">
            {/* Node Stats Bar */}
            {nodes.length > 0 && (
              <div className="stats-bar">
                <div className="stats-bar-item">
                  <span className="stats-number">{nodes.length}</span>
                  <span className="stats-label">Total Nodes</span>
                </div>
                <div className="stats-divider" />
                <div className="stats-bar-item">
                  <span className="stats-number" style={{ color: '#34d399' }}>{freshCount}</span>
                  <span className="stats-label">Fresh</span>
                </div>
                <div className="stats-divider" />
                <div className="stats-bar-item">
                  <span className="stats-number" style={{ color: '#fb923c' }}>{contestedCount}</span>
                  <span className="stats-label">Contested</span>
                </div>
                <div className="stats-divider" />
                <div className="stats-bar-item">
                  <span className="stats-number" style={{ color: '#f87171' }}>{staleCount}</span>
                  <span className="stats-label">Stale</span>
                </div>
                <div className="stats-divider" />
                <div className="stats-bar-item">
                  <span className="stats-number" style={{ color: '#a78bfa' }}>{debateLogs.length}</span>
                  <span className="stats-label">Debates</span>
                </div>
                <div className="stats-divider" />
                <div className="stats-bar-item">
                  <span className="stats-number" style={{ color: '#60a5fa' }}>{roadmap.length}</span>
                  <span className="stats-label">Roadmap Items</span>
                </div>
              </div>
            )}

            {/* ── Stage 1&2: Nodes + Graph ───────────────────────────────────── */}
            <div className="stage-section-label">
              <span className="stage-number">01</span>
              <span className="stage-name">Structured Intelligence Extraction & Dependency Graph</span>
            </div>

            <div id="graph-stage-section" className="two-col-grid">
              {/* Nodes List */}
              <div className="card node-list-card">
                <div className="card-header">
                  <span className="card-header-dot" style={{ background: '#2dd4bf' }} />
                  <span>Extracted Nodes</span>
                  {nodes.length > 0 && <span className="card-header-count">{nodes.length}</span>}
                </div>
                <div className="node-list-scroll">
                  {nodes.length > 0 ? nodes.map(node => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`node-card ${selectedNode?.id === node.id ? 'node-card-selected' : ''} node-card-${node.status}`}
                    >
                      <div className="node-card-top">
                        <div className="node-card-badges">
                          <span className="badge badge-id">{node.id}</span>
                          <span className={`badge badge-source-${node.source}`}>{node.source.replace('_', ' ')}</span>
                        </div>
                        <span className={`badge badge-status-${node.status}`}>
                          {node.status === 'stale' ? '🔴' : node.status === 'contested' ? '🟡' : '🟢'} {node.status}
                        </span>
                      </div>
                      <p className="node-card-text">{node.text}</p>
                      <div className="node-card-footer">
                        <span className="node-card-type">{node.type}</span>
                        <div className="node-confidence-bar-wrapper">
                          <div className="node-confidence-bar">
                            <div
                              className="node-confidence-fill"
                              style={{
                                width: `${node.confidence * 100}%`,
                                background: node.confidence >= 0.7 ? '#34d399' : node.confidence >= 0.4 ? '#fb923c' : '#f87171'
                              }}
                            />
                          </div>
                          <span className="node-confidence-pct">{(node.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </button>
                  )) : (
                    <div className="card-loading-state">
                      {activeStep === 1 ? (
                        <>
                          <div className="loading-spinner" style={{ borderTopColor: '#2dd4bf' }} />
                          <p>Extracting structured nodes...</p>
                        </>
                      ) : (
                        <p className="card-pending">Awaiting extraction...</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Graph / Heatmap */}
              <div className="card graph-card">
                <div className="card-header">
                  <span className="card-header-dot" style={{ background: '#34d399' }} />
                  <div className="tab-group">
                    <button
                      onClick={() => setActiveTab('graph')}
                      className={`tab-btn ${activeTab === 'graph' ? 'tab-btn-active' : ''}`}
                    >
                      Dependency Graph
                    </button>
                    <button
                      onClick={() => setActiveTab('heatmap')}
                      className={`tab-btn ${activeTab === 'heatmap' ? 'tab-btn-active' : ''}`}
                    >
                      Decision Heatmap
                    </button>
                  </div>
                </div>

                <div className="graph-card-body">
                  {activeTab === 'graph' ? (
                    graph ? (
                      <>
                        <DependencyGraph data={graph} onNodeSelect={setSelectedNode} selectedNode={selectedNode} />
                        {selectedNode && (
                          <div className="node-detail-panel">
                            <div className="node-detail-header">
                              <div className="node-card-badges">
                                <span className="badge badge-id">{selectedNode.id}</span>
                                <span className={`badge badge-source-${selectedNode.source}`}>{selectedNode.source.replace('_', ' ')}</span>
                              </div>
                              <span className={`badge badge-status-${selectedNode.status}`}>{selectedNode.status}</span>
                            </div>
                            <p className="node-detail-text">{selectedNode.text}</p>
                            <div className="node-detail-meta">
                              <div>
                                <span className="node-detail-meta-label">Type</span>
                                <span className="node-detail-meta-val">{selectedNode.type}</span>
                              </div>
                              <div>
                                <span className="node-detail-meta-label">Confidence</span>
                                <span className="node-detail-meta-val">{(selectedNode.confidence * 100).toFixed(0)}%</span>
                              </div>
                              <div>
                                <span className="node-detail-meta-label">Depends On</span>
                                <span className="node-detail-meta-val">
                                  {selectedNode.dependsOn.length > 0 ? selectedNode.dependsOn.join(', ') : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="card-loading-state">
                        {activeStep >= 2 ? (
                          <>
                            <div className="loading-spinner" style={{ borderTopColor: '#34d399' }} />
                            <p>Building dependency matrix...</p>
                          </>
                        ) : (
                          <p className="card-pending">Awaiting node extraction...</p>
                        )}
                      </div>
                    )
                  ) : (
                    nodes.length > 0 ? (
                      <DecisionHeatmap nodes={graph?.nodes || nodes} />
                    ) : (
                      <div className="card-loading-state">
                        <p className="card-pending">Awaiting node extraction...</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* ── Pipeline Connector ─────────────────────────────────────────── */}
            <div className="pipeline-connector-visual">
              <div className="pipeline-connector-line gradient-teal-violet" />
              <span className="pipeline-connector-label">AI Boardroom Convenes</span>
              <div className="pipeline-connector-line gradient-violet-blue" />
            </div>

            {/* ── Stage 3: Debate Boardroom ──────────────────────────────────── */}
            <div className="stage-section-label">
              <span className="stage-number">02</span>
              <span className="stage-name">AI Boardroom Debate · 3-Agent Alignment Council</span>
            </div>

            <div className="card boardroom-card">
              <div className="card-header">
                <span className="card-header-dot" style={{ background: '#a78bfa' }} />
                <span>Live Debate Transcripts</span>
                {debateLogs.length > 0 && <span className="card-header-count">{debateLogs.length} sessions</span>}
                {thinkingAgent && <span className="live-badge">● LIVE</span>}
              </div>
              <DebateBoardroom
                logs={debateLogs}
                nodes={graph?.nodes || nodes}
                thinkingAgent={thinkingAgent}
                isLoading={loading && activeStep === 3}
              />
            </div>

            {/* ── Stage 4: Executive Summary ────────────────────────────────── */}
            {executiveSummary && (
              <>
                <div className="pipeline-connector-visual">
                  <div className="pipeline-connector-line gradient-violet-blue" />
                  <span className="pipeline-connector-label">Synthesis Complete</span>
                  <div className="pipeline-connector-line gradient-blue-teal" />
                </div>

                <div className="stage-section-label">
                  <span className="stage-number">03</span>
                  <span className="stage-name">Executive Decision Brief</span>
                </div>

                <ExecutiveSummaryCard summary={executiveSummary} />
              </>
            )}

            {/* ── Stage 4: Roadmap ───────────────────────────────────────────── */}
            {(roadmap.length > 0 || activeStep === 4) && (
              <>
                <div className="stage-section-label" style={{ marginTop: '0.5rem' }}>
                  <span className="stage-number">04</span>
                  <span className="stage-name">Synthesized & Ranked Product Roadmap</span>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-header-dot" style={{ background: '#60a5fa' }} />
                    <span>Priority Roadmap</span>
                    {roadmap.length > 0 && <span className="card-header-count">{roadmap.length} items</span>}
                    {loading && activeStep === 4 && <span className="live-badge" style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}>● SYNTHESIZING</span>}
                  </div>
                  {roadmap.length > 0 ? (
                    <RoadmapView items={roadmap} onReferenceSelect={handleReferenceSelect} />
                  ) : (
                    <div className="card-loading-state">
                      <div className="loading-spinner" style={{ borderTopColor: '#60a5fa' }} />
                      <p>Synthesizing strategic roadmap...</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <span>Product Council AI · Built for Hackathon</span>
        <span className="footer-dot">·</span>
        <span>Powered by Groq + Llama 3.3 70B</span>
      </footer>
    </div>
  );
}
