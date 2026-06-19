'use client';

import { useState, useCallback } from 'react';
import { Node, GraphData, DebateLog, RoadmapItem, ExecutiveSummary } from '@/lib/types';
import DependencyGraph from '@/components/DependencyGraph';

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

const PERSONA = {
  growth: { name: 'Growth Optimist', emoji: '🚀', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', desc: 'Ship fast · Capture market' },
  eng_realist: { name: 'Eng Realist', emoji: '⚙️', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', desc: 'Feasibility · Tech debt' },
  user_advocate: { name: 'User Advocate', emoji: '👤', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', desc: 'Usability · Real feedback' },
} as const;

const SRC_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  prd: { bg: 'rgba(96,165,250,0.1)', color: '#93c5fd', border: 'rgba(96,165,250,0.25)' },
  feature_request: { bg: 'rgba(251,146,60,0.1)', color: '#fdba74', border: 'rgba(251,146,60,0.25)' },
  feedback: { bg: 'rgba(167,139,250,0.1)', color: '#c4b5fd', border: 'rgba(167,139,250,0.25)' },
};
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  fresh: { bg: 'rgba(52,211,153,0.1)', color: '#6ee7b7', border: 'rgba(52,211,153,0.25)' },
  stale: { bg: 'rgba(251,146,60,0.12)', color: '#fdba74', border: 'rgba(251,146,60,0.3)' },
  contested: { bg: 'rgba(248,113,113,0.1)', color: '#fca5a5', border: 'rgba(248,113,113,0.25)' },
};
const VERDICT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  proceed: { bg: 'rgba(52,211,153,0.1)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  modify: { bg: 'rgba(251,146,60,0.1)', color: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  cut: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
};

function computeSummary(nodes: Node[], logs: DebateLog[], roadmap: RoadmapItem[]): ExecutiveSummary {
  const stale = nodes.filter(n => n.status === 'stale');
  const contested = nodes.filter(n => n.status === 'contested');
  const fresh = nodes.filter(n => n.status === 'fresh');
  const alignment = nodes.length ? Math.round((fresh.length / nodes.length) * 100) : 0;
  const topRisk = [...stale, ...contested].sort((a, b) => a.confidence - b.confidence)[0];
  return {
    topRisk: topRisk?.text || 'No critical risks detected.',
    topOpportunity: roadmap[0]?.title || fresh[0]?.text || 'Strong alignment.',
    contestedDecision: logs[0] ? `Node ${logs[0].nodeId}: ${nodes.find(n => n.id === logs[0].nodeId)?.text?.slice(0, 80)}...` : 'No contested decisions.',
    nextAction: roadmap[0]?.rationale?.split('.')[0] + '.' || 'Proceed with roadmap.',
    riskScore: Math.min(10, Math.round(((stale.length + contested.length) / Math.max(nodes.length, 1)) * 10)),
    opportunityScore: Math.min(10, Math.round((fresh.length / Math.max(nodes.length, 1)) * 10)),
    alignmentScore: alignment,
  };
}

function Badge({ children, style }: { children: React.ReactNode; style: { bg: string; color: string; border: string } }) {
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: style.bg, color: style.color, border: `1px solid ${style.border}`, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Spinner({ color, size = 24 }: { color: string; size?: number }) {
  return <span className="pc-spinner" style={{ width: size, height: size, borderWidth: 2, borderColor: `${color}30`, borderTopColor: color, flexShrink: 0 }} />;
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', animation: pulse ? 'pcPulse 1.5s infinite' : undefined, flexShrink: 0 }} />;
}

export default function Home() {
  const [prd, setPrd] = useState('');
  const [featureRequests, setFeatureRequests] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [debateLogs, setDebateLogs] = useState<DebateLog[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<{ nodeId: string; persona: keyof typeof PERSONA } | null>(null);
  const [expandedDebate, setExpandedDebate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'heatmap'>('graph');
  const [isJudgeMode, setIsJudgeMode] = useState(false);

  const handleJudgeMode = () => { setPrd(JUDGE_PRD); setFeatureRequests(JUDGE_FEATURES); setFeedback(JUDGE_FEEDBACK); setIsJudgeMode(true); };

  const runAnalysis = useCallback(async () => {
    setLoading(true); setError(null); setShowResults(true);
    setNodes([]); setGraph(null); setDebateLogs([]); setRoadmap([]); setSummary(null);
    setSelectedNode(null); setThinkingAgent(null);
    try {
      setActiveStep(1);
      const r1 = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prd, featureRequests, feedback }) });
      if (!r1.ok) { const e = await r1.json().catch(() => ({})); throw new Error(e.error || 'Extraction failed'); }
      const { nodes: n } = await r1.json();
      setNodes(n);

      setActiveStep(2);
      const r2 = await fetch('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: n }) });
      if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.error || 'Graph failed'); }
      const gd: GraphData = await r2.json();
      setGraph(gd);

      setActiveStep(3);
      const r3 = await fetch('/api/debate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staleOrContestedNodes: gd.nodes.filter((x: Node) => x.status === 'stale' || x.status === 'contested'), allNodes: gd.nodes }) });
      if (!r3.ok) { const e = await r3.json().catch(() => ({})); throw new Error(e.error || 'Debate failed'); }

      const reader = r3.body?.getReader(); const dec = new TextDecoder(); let buf = ''; const logs: DebateLog[] = [];
      if (reader) {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const d = JSON.parse(line);
              if (d.type === 'start_debate') { if (!logs.some(l => l.nodeId === d.nodeId)) logs.push({ nodeId: d.nodeId, turns: [], verdict: '' }); setDebateLogs([...logs]); setExpandedDebate(d.nodeId); }
              else if (d.type === 'thinking') { setThinkingAgent({ nodeId: d.nodeId, persona: d.persona }); }
              else if (d.type === 'turn') { setThinkingAgent(null); const lg = logs.find(l => l.nodeId === d.nodeId); if (lg) lg.turns.push(d.turn); setDebateLogs([...logs]); }
              else if (d.type === 'verdict') { const lg = logs.find(l => l.nodeId === d.nodeId); if (lg) lg.verdict = d.verdict; setDebateLogs([...logs]); }
              else if (d.type === 'complete') { setThinkingAgent(null); }
            } catch { /* ignore */ }
          }
        }
      }

      setActiveStep(4);
      const r4 = await fetch('/api/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graphData: gd, debateLogs: logs, originalFeatureRequests: featureRequests }) });
      if (!r4.ok) { const e = await r4.json().catch(() => ({})); throw new Error(e.error || 'Synthesis failed'); }
      const { roadmap: rm } = await r4.json();
      setRoadmap(rm);
      setSummary(computeSummary(gd.nodes, logs, rm));
      setActiveStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setActiveStep(0);
    } finally { setLoading(false); }
  }, [prd, featureRequests, feedback]);

  const staleCount = nodes.filter(n => n.status === 'stale').length;
  const contestedCount = nodes.filter(n => n.status === 'contested').length;
  const freshCount = nodes.filter(n => n.status === 'fresh').length;

  const STEPS = [
    { id: 1, label: 'Extract', icon: '📊', color: '#2dd4bf' },
    { id: 2, label: 'Graph', icon: '🕸️', color: '#34d399' },
    { id: 3, label: 'Debate', icon: '⚡', color: '#a78bfa' },
    { id: 4, label: 'Roadmap', icon: '🗺️', color: '#60a5fa' },
  ];

  const INPUT_FIELDS = [
    { id: 'prd-input', label: 'Product Requirement Document', placeholder: 'Paste key claims, metrics, and assumptions from your PRD...', value: prd, setter: setPrd, color: '#60a5fa' },
    { id: 'features-input', label: 'Feature Requests', placeholder: 'Paste backlog items, feature ideas, or technical specs...', value: featureRequests, setter: setFeatureRequests, color: '#fb923c' },
    { id: 'feedback-input', label: 'User Feedback & Signals', placeholder: 'Paste CSAT data, support tickets, customer interviews...', value: feedback, setter: setFeedback, color: '#a78bfa' },
  ];

  return (
    <div className="pc-root">
      {/* HEADER */}
      <header className="pc-header">
        <div className="pc-header-inner">
          <div className="pc-logo">
            <div className="pc-logo-icon">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="pc-logo-title">Product Council AI</div>
              <div className="pc-logo-sub">AI Executive Boardroom · 4-Stage Decision Engine</div>
            </div>
          </div>
          <button className="pc-btn-judge" onClick={handleJudgeMode} disabled={loading}>
            ⚡ Judge Mode Demo
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="pc-main">
        <div className="pc-content">

          {/* INPUT CARD */}
          <div className="pc-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 Configure Your Product Council
              </h2>
              {isJudgeMode && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot color="#a78bfa" pulse /> Judge Mode Active
                </span>
              )}
            </div>

            <div className="pc-input-grid">
              {INPUT_FIELDS.map(({ id, label, placeholder, value, setter, color }) => (
                <div key={id} className="pc-input-field">
                  <label htmlFor={id} className="pc-input-label" style={{ color }}>
                    <Dot color={color} />
                    {label}
                  </label>
                  <textarea
                    id={id} className="pc-textarea" rows={9}
                    value={value} onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    onFocus={e => (e.target.style.borderColor = color)}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  />
                  {value.length > 0 && (
                    <span style={{ fontSize: '0.65rem', textAlign: 'right', fontFamily: 'monospace', color }}>{value.length} chars</span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button className="pc-btn-run" id="run-analysis-btn" onClick={runAnalysis}
                disabled={loading || !prd.trim() || !featureRequests.trim() || !feedback.trim()}>
                {loading ? (
                  <><Spinner color="#fff" size={16} /> Council in session...</>
                ) : (
                  <>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Convene the AI Boardroom
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="pc-error" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span><strong>Pipeline Error:</strong> {error}</span>
            </div>
          )}

          {/* PIPELINE PROGRESS */}
          {loading && (
            <div className="pc-pipeline">
              {STEPS.map((step, i) => {
                const done = activeStep > step.id; const active = activeStep === step.id;
                return (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, color: done || active ? step.color : '#484f58', background: active ? `${step.color}18` : 'transparent', whiteSpace: 'nowrap' }}>
                      <span>{done ? '✓' : step.icon}</span>
                      <span>{step.label}</span>
                      {active && <Dot color={step.color} pulse />}
                    </div>
                    {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: done ? step.color : 'rgba(255,255,255,0.06)', margin: '0 4px', transition: 'background 0.4s' }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* RESULTS */}
          {showResults && (
            <div className="pc-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Stats Bar */}
              {nodes.length > 0 && (
                <div className="pc-stats-bar">
                  {[
                    { label: 'Total Nodes', val: nodes.length, color: '#f0f6fc' },
                    { label: 'Fresh', val: freshCount, color: '#34d399' },
                    { label: 'Contested', val: contestedCount, color: '#fb923c' },
                    { label: 'Stale', val: staleCount, color: '#f87171' },
                    { label: 'Debates', val: debateLogs.length, color: '#a78bfa' },
                    { label: 'Roadmap', val: roadmap.length, color: '#60a5fa' },
                  ].map((s, i, arr) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 20px' }}>
                        <span style={{ fontWeight: 900, fontSize: '1.8rem', lineHeight: 1, color: s.color, fontFamily: 'monospace', letterSpacing: '-0.04em' }}>{s.val}</span>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#484f58' }}>{s.label}</span>
                      </div>
                      {i < arr.length - 1 && <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.06)' }} />}
                    </div>
                  ))}
                </div>
              )}

              {/* Stage 01 */}
              <div>
                <div className="pc-stage-label">
                  <span className="pc-stage-num">01</span>
                  <span className="pc-stage-name">Intelligence Extraction & Dependency Graph</span>
                </div>
                <div className="pc-two-col">
                  {/* Nodes List */}
                  <div className="pc-card pc-scroll-card" style={{ padding: 0 }}>
                    <div className="pc-card-header">
                      <Dot color="#2dd4bf" pulse />
                      <span>Extracted Nodes</span>
                      {nodes.length > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#8b949e', fontFamily: 'monospace' }}>{nodes.length}</span>}
                    </div>
                    <div className="pc-scroll-inner">
                      {nodes.length > 0 ? nodes.map(node => {
                        const ss = STATUS_STYLE[node.status]; const src = SRC_STYLE[node.source];
                        const isSelected = selectedNode?.id === node.id;
                        return (
                          <button key={node.id} className="pc-node-btn" onClick={() => setSelectedNode(node)}
                            style={{ background: isSelected ? 'rgba(45,212,191,0.06)' : node.status === 'stale' ? 'rgba(251,146,60,0.04)' : node.status === 'contested' ? 'rgba(248,113,113,0.04)' : 'rgba(5,8,16,0.5)', border: `1px solid ${isSelected ? 'rgba(45,212,191,0.3)' : node.status !== 'fresh' ? ss.border : 'rgba(255,255,255,0.06)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.63rem', fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b949e' }}>{node.id}</span>
                                <Badge style={src}>{node.source.replace('_', ' ')}</Badge>
                              </div>
                              <Badge style={ss}>{node.status === 'stale' ? '🔴' : node.status === 'contested' ? '🟡' : '🟢'} {node.status}</Badge>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#c9d1d9', lineHeight: 1.55 }}>{node.text}</p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#484f58' }}>{node.type}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${node.confidence * 100}%`, height: '100%', background: node.confidence >= 0.7 ? '#34d399' : node.confidence >= 0.4 ? '#fb923c' : '#f87171', borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#484f58' }}>{(node.confidence * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          </button>
                        );
                      }) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '3rem', textAlign: 'center' }}>
                          {activeStep === 1 ? <><Spinner color="#2dd4bf" /><p style={{ fontSize: '0.82rem', color: '#8b949e' }}>Extracting nodes...</p></> : <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#484f58' }}>Awaiting extraction...</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Graph / Heatmap */}
                  <div className="pc-card pc-scroll-card" style={{ padding: 0 }}>
                    <div className="pc-card-header">
                      <Dot color="#34d399" pulse />
                      <div className="pc-tabs">
                        {(['graph', 'heatmap'] as const).map(tab => (
                          <button key={tab} className={`pc-tab ${activeTab === tab ? 'pc-tab-active' : 'pc-tab-inactive'}`} onClick={() => setActiveTab(tab)}>
                            {tab === 'graph' ? 'Dependency Graph' : 'Decision Heatmap'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minHeight: 0, overflow: 'hidden' }}>
                      {activeTab === 'graph' ? (
                        graph ? (
                          <>
                            <DependencyGraph data={graph} onNodeSelect={setSelectedNode} selectedNode={selectedNode} />
                            {selectedNode && (
                              <div style={{ borderRadius: 12, padding: 14, background: 'rgba(5,8,16,0.7)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'pcFadeIn 0.3s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.63rem', fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b949e' }}>{selectedNode.id}</span>
                                    <Badge style={SRC_STYLE[selectedNode.source]}>{selectedNode.source.replace('_', ' ')}</Badge>
                                  </div>
                                  <Badge style={STATUS_STYLE[selectedNode.status]}>{selectedNode.status}</Badge>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.6 }}>{selectedNode.text}</p>
                                <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', flexWrap: 'wrap' }}>
                                  <span style={{ color: '#484f58' }}>Type: <span style={{ color: '#8b949e' }}>{selectedNode.type}</span></span>
                                  <span style={{ color: '#484f58' }}>Confidence: <span style={{ color: '#8b949e' }}>{(selectedNode.confidence * 100).toFixed(0)}%</span></span>
                                  <span style={{ color: '#484f58' }}>Depends: <span style={{ color: '#2dd4bf', fontFamily: 'monospace' }}>{selectedNode.dependsOn.join(', ') || '—'}</span></span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                            {activeStep >= 2 ? <><Spinner color="#34d399" /><p style={{ fontSize: '0.82rem', color: '#8b949e' }}>Building graph...</p></> : <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#484f58' }}>Awaiting extraction...</p>}
                          </div>
                        )
                      ) : nodes.length > 0 ? <Heatmap nodes={graph?.nodes || nodes} /> : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#484f58' }}>Awaiting data...</p></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Separator */}
              <div className="pc-separator">
                <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #2dd4bf, #a78bfa)' }} />
                <span className="pc-sep-label">AI Boardroom Convenes</span>
                <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #a78bfa, #60a5fa)' }} />
              </div>

              {/* Stage 02 Debate */}
              <div>
                <div className="pc-stage-label">
                  <span className="pc-stage-num">02</span>
                  <span className="pc-stage-name">AI Boardroom Debate · 3-Agent Alignment Council</span>
                  {thinkingAgent && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }} className="pc-blink">● LIVE</span>}
                </div>
                <div className="pc-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Persona legend */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.values(PERSONA).map(p => (
                      <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10, background: p.bg, border: `1px solid ${p.border}`, fontSize: '0.72rem' }}>
                        <span style={{ fontSize: '1rem' }}>{p.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: p.color }}>{p.name}</div>
                          <div style={{ fontSize: '0.6rem', color: '#484f58' }}>{p.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Debate sessions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {debateLogs.length > 0 ? debateLogs.map(log => {
                      const node = (graph?.nodes || nodes).find(x => x.id === log.nodeId);
                      const isExpanded = expandedDebate === log.nodeId || debateLogs.length === 1;
                      const vkey = log.verdict?.toLowerCase().startsWith('proceed') ? 'proceed' : log.verdict?.toLowerCase().startsWith('cut') ? 'cut' : 'modify';
                      const vs = VERDICT_STYLE[vkey];
                      const isLive = thinkingAgent?.nodeId === log.nodeId;
                      const ns = node?.status ? STATUS_STYLE[node.status] : STATUS_STYLE.contested;
                      return (
                        <div key={log.nodeId} className="pc-debate-session">
                          <button className="pc-debate-session-btn" onClick={() => setExpandedDebate(isExpanded ? null : log.nodeId)}>
                            <Badge style={ns}>{node?.status?.toUpperCase() || 'CONTESTED'}</Badge>
                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#484f58', flexShrink: 0 }}>{log.nodeId}</span>
                            <span style={{ fontSize: '0.75rem', color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node?.text}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              {log.verdict && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: vs.bg, color: vs.color, border: `1px solid ${vs.border}` }}>{log.verdict.split(' - ')[0]}</span>}
                              {isLive && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#f87171' }} className="pc-blink">● LIVE</span>}
                              <svg style={{ color: '#484f58', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                          </button>
                          {isExpanded && (
                            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {log.turns.map((turn, i) => {
                                const p = PERSONA[turn.persona];
                                return (
                                  <div key={i} style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.72rem', fontWeight: 700, color: p.color }}>
                                      <span style={{ fontSize: '0.95rem' }}>{p.emoji}</span>
                                      <span>{p.name}</span>
                                      {turn.respondingTo && <span style={{ fontWeight: 400, color: '#484f58', fontSize: '0.65rem' }}>↩ responding to {PERSONA[turn.respondingTo as keyof typeof PERSONA]?.name}</span>}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.65 }}>{turn.text}</p>
                                  </div>
                                );
                              })}
                              {/* Typing indicator */}
                              {isLive && thinkingAgent && (() => {
                                const p = PERSONA[thinkingAgent.persona];
                                return (
                                  <div style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.72rem', fontWeight: 700, color: p.color, marginBottom: 8 }}>
                                      <span>{p.emoji}</span><span>{p.name}</span><span style={{ fontWeight: 400, color: '#484f58' }}>is thinking...</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                      <span className="pc-dot pc-dot-1" style={{ background: p.color }} />
                                      <span className="pc-dot pc-dot-2" style={{ background: p.color }} />
                                      <span className="pc-dot pc-dot-3" style={{ background: p.color }} />
                                    </div>
                                  </div>
                                );
                              })()}
                              {log.verdict && (
                                <div style={{ borderRadius: 12, padding: 12, background: vs.bg, border: `1px solid ${vs.border}` }}>
                                  <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: vs.color, marginBottom: 6 }}>👤 User Advocate Verdict</div>
                                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: vs.color }}>{log.verdict}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }) : loading && activeStep === 3 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '2rem', textAlign: 'center' }}>
                        <Spinner color="#a78bfa" />
                        <p style={{ fontSize: '0.82rem', color: '#8b949e' }}>Debate session starting...</p>
                      </div>
                    ) : activeStep > 3 ? (
                      <p style={{ fontSize: '0.82rem', fontStyle: 'italic', color: '#484f58', textAlign: 'center', padding: '2rem' }}>No contested decisions — boardroom at peace ✅</p>
                    ) : (
                      <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#484f58', textAlign: 'center', padding: '1.5rem' }}>Awaiting graph analysis...</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stage 03 Executive Summary */}
              {summary && (
                <>
                  <div className="pc-separator">
                    <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #a78bfa, #60a5fa)' }} />
                    <span className="pc-sep-label">Synthesis Complete</span>
                    <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #60a5fa, #2dd4bf)' }} />
                  </div>
                  <div>
                    <div className="pc-stage-label">
                      <span className="pc-stage-num">03</span>
                      <span className="pc-stage-name">Executive Decision Brief</span>
                    </div>
                    <div className="pc-card" style={{ background: 'linear-gradient(135deg, rgba(13,17,23,0.95), rgba(19,25,34,0.95))', border: '1px solid rgba(45,212,191,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2dd4bf', flexShrink: 0 }}>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Executive Summary</div>
                          <div style={{ fontSize: '0.65rem', color: '#484f58' }}>AI Boardroom Decision Brief</div>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#484f58', marginBottom: 2 }}>Alignment</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1, fontFamily: 'monospace', color: summary.alignmentScore >= 70 ? '#34d399' : summary.alignmentScore >= 40 ? '#fb923c' : '#f87171' }}>{summary.alignmentScore}%</div>
                        </div>
                      </div>
                      <div className="pc-exec-grid">
                        {[
                          { icon: '⚠️', label: 'Top Risk', text: summary.topRisk, color: '#f87171', border: 'rgba(248,113,113,0.15)', score: summary.riskScore },
                          { icon: '🚀', label: 'Top Opportunity', text: summary.topOpportunity, color: '#34d399', border: 'rgba(52,211,153,0.15)', score: summary.opportunityScore },
                          { icon: '❓', label: 'Contested Decision', text: summary.contestedDecision, color: '#fb923c', border: 'rgba(251,146,60,0.15)', score: null },
                          { icon: '✅', label: 'Recommended Next Action', text: summary.nextAction, color: '#60a5fa', border: 'rgba(96,165,250,0.15)', score: null },
                        ].map(c => (
                          <div key={c.label} style={{ borderRadius: 12, padding: 14, background: 'rgba(5,8,16,0.3)', border: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.color }}>
                              {c.icon} {c.label}
                              {c.score !== null && <span style={{ marginLeft: 'auto', fontSize: '0.62rem', fontFamily: 'monospace', padding: '1px 7px', borderRadius: 20, background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }}>{c.score}/10</span>}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.6 }}>{c.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Stage 04 Roadmap */}
              {(roadmap.length > 0 || activeStep === 4) && (
                <div>
                  <div className="pc-stage-label">
                    <span className="pc-stage-num">04</span>
                    <span className="pc-stage-name">Synthesized & Ranked Product Roadmap</span>
                    {loading && activeStep === 4 && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa' }} className="pc-blink">● SYNTHESIZING</span>}
                  </div>
                  <div className="pc-card">
                    {roadmap.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {roadmap.map((item, i) => (
                          <div key={item.id} className="pc-roadmap-item" style={{ background: 'rgba(5,8,16,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.82rem', flexShrink: 0, background: i === 0 ? 'linear-gradient(135deg, #2dd4bf, #34d399)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fff' : '#8b949e', border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>#{item.rank}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f0f6fc', marginBottom: 6 }}>{item.title}</h3>
                              <p style={{ fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.6, marginBottom: 10 }}>{item.rationale}</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.relatedDebate.map(id => (
                                  <button key={id} onClick={() => setExpandedDebate(id)} style={{ fontSize: '0.65rem', padding: '2px 9px', borderRadius: 20, cursor: 'pointer', background: 'rgba(167,139,250,0.1)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.25)', fontFamily: 'inherit' }}>⚡ {id}</button>
                                ))}
                                {item.sourceNodes.map(id => (
                                  <button key={id} onClick={() => { const n = nodes.find(x => x.id === id); if (n) setSelectedNode(n); }} style={{ fontSize: '0.65rem', padding: '2px 9px', borderRadius: 20, cursor: 'pointer', background: 'rgba(45,212,191,0.08)', color: '#5eead4', border: '1px solid rgba(45,212,191,0.2)', fontFamily: 'inherit' }}>→ {id}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '3rem', textAlign: 'center' }}>
                        <Spinner color="#60a5fa" />
                        <p style={{ fontSize: '0.82rem', color: '#8b949e' }}>Synthesizing roadmap...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="pc-footer">
        <span>Product Council AI · Built for Hackathon</span>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
        <span>Powered by Groq + Llama 3.3 70B</span>
      </footer>
    </div>
  );
}

// Heatmap component
function Heatmap({ nodes }: { nodes: Node[] }) {
  const sources = ['prd', 'feature_request', 'feedback'] as const;
  const types = ['claim', 'assumption', 'requirement', 'feedback_signal'] as const;
  const SL = { prd: 'PRD', feature_request: 'Features', feedback: 'Feedback' };
  const TL = { claim: 'Claims', assumption: 'Assump.', requirement: 'Require.', feedback_signal: 'Signals' };

  const getCell = (src: string, typ: string) => {
    const c = nodes.filter(n => n.source === src && n.type === typ);
    if (!c.length) return null;
    const fresh = c.filter(n => n.status === 'fresh').length;
    const conflicts = c.filter(n => n.status !== 'fresh').length;
    const agreement = (fresh / c.length) * (c.reduce((s, n) => s + n.confidence, 0) / c.length);
    return { count: c.length, agreement, hasConflict: conflicts > 0 };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b949e' }}>Agreement & Conflict Scores by Source × Type</p>
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(4, 1fr)', gap: 4, minWidth: 360 }}>
        <div />
        {types.map(t => <div key={t} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#484f58', padding: '4px 2px' }}>{TL[t]}</div>)}
        {sources.map(src => (
          <>
            <div key={src} style={{ display: 'flex', alignItems: 'center', fontSize: '0.62rem', fontWeight: 700, color: '#8b949e' }}>{SL[src]}</div>
            {types.map(typ => {
              const cell = getCell(src, typ);
              if (!cell) return <div key={typ} style={{ borderRadius: 8, background: 'rgba(255,255,255,0.02)', minHeight: 50 }} />;
              const c = cell.hasConflict ? '#f87171' : cell.agreement > 0.6 ? '#34d399' : '#fb923c';
              return (
                <div key={typ} className="pc-heatmap-cell" style={{ background: `${c}18`, border: `1px solid ${c}30` }}>
                  <span style={{ fontWeight: 900, fontSize: '0.8rem', fontFamily: 'monospace', color: c }}>{(cell.agreement * 100).toFixed(0)}%</span>
                  <span style={{ fontSize: '0.58rem', color: '#484f58' }}>{cell.count}n</span>
                  {cell.hasConflict && <span style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#f87171' }} />}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[['#34d399', 'High agreement'], ['#fb923c', 'Contested'], ['#f87171', 'Conflict/Stale']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: '#484f58' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}
