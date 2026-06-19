'use client';

import { useState, useCallback, useEffect } from 'react';
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
  growth: { name: 'Growth Optimist', emoji: '🚀', title: 'VP of Growth', color: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.2)', desc: 'Ship fast · Capture market' },
  eng_realist: { name: 'Eng Realist', emoji: '⚙️', title: 'Principal Architect', color: '#60a5fa', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.2)', desc: 'Feasibility · Tech debt' },
  user_advocate: { name: 'User Advocate', emoji: '👤', title: 'Director of UX', color: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.2)', desc: 'Usability · Real feedback' },
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
  
  // Decision Impact Engine states
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [impactedNodeIds, setImpactedNodeIds] = useState<Set<string>>(new Set());

  // Challenge states
  const [challengingItemId, setChallengingItemId] = useState<string | null>(null);
  const [challengeHistory, setChallengeHistory] = useState<Record<string, { previous: string; current: string }>>({});

  // Walkthrough states
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);

  const [thinkingAgent, setThinkingAgent] = useState<{ nodeId: string; persona: keyof typeof PERSONA } | null>(null);
  const [expandedDebate, setExpandedDebate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'heatmap'>('graph');
  const [isJudgeMode, setIsJudgeMode] = useState(false);

  const [proposedFixes, setProposedFixes] = useState<Record<string, string>>({});
  const [rerunLogs, setRerunLogs] = useState<Record<string, DebateLog>>({});
  const [isRerunning, setIsRerunning] = useState<Record<string, boolean>>({});
  const [rerunThinkingAgent, setRerunThinkingAgent] = useState<{ nodeId: string; persona: keyof typeof PERSONA } | null>(null);
  const [fixSuggestions, setFixSuggestions] = useState<Record<string, { text: string; addressesObjection: string }[]>>({});
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<Record<string, boolean>>({});

  // GitHub Import States
  const [repoUrl, setRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedRepoName, setImportedRepoName] = useState<string | null>(null);
  const [timelineInsight, setTimelineInsight] = useState('');

  const WALKTHROUGH_STEPS = [
    {
      title: "1. Conflicting Evidence",
      description: "Feedback F4 ($4k incorrect payout, ticket auto-closes) directly contradicts PRD goals, triggering systemic risk flags.",
      action: (currentNodes: Node[]) => {
        const feedbackNode = currentNodes.find(n => n.id === 'n8' || n.text.includes('4,000') || n.source === 'feedback');
        if (feedbackNode) {
          setSelectedNode(feedbackNode);
          if (graph) {
            setImpactedNodeIds(getDownstreamNodeIds(feedbackNode.id, graph.edges));
          }
          highlightScroll(`node-card-${feedbackNode.id}`);
        }
      }
    },
    {
      title: "2. Collapsed Assumptions",
      description: "Clicking A2 (Assumption: Users prefer AI answers) reveals its confidence collapsed from 90% to 10% due to CSAT drop.",
      action: (currentNodes: Node[]) => {
        const assumptionNode = currentNodes.find(n => n.id === 'n2' || n.type === 'assumption');
        if (assumptionNode) {
          setSelectedNode(assumptionNode);
          if (graph) {
            setImpactedNodeIds(getDownstreamNodeIds(assumptionNode.id, graph.edges));
          }
          highlightScroll(`node-card-${assumptionNode.id}`);
        }
      }
    },
    {
      title: "3. Agent Disagreement",
      description: "Check the Live Boardroom debate on auto-resolve feature. Growth demands shipping fast, but Eng & UX side with the user.",
      action: () => {
        const targetDebateId = debateLogs[0]?.nodeId || 'n2';
        setExpandedDebate(targetDebateId);
        highlightScroll(`debate-session-${targetDebateId}`);
      }
    },
    {
      title: "4. Causality Roadmap",
      description: "The synthesis engine shifts the auto-resolve feature to a 'Modify/Cut' status, dropping its priority rank.",
      action: () => {
        highlightScroll(`roadmap-section`);
      }
    }
  ];

  const handleJudgeMode = () => {
    setPrd(JUDGE_PRD);
    setFeatureRequests(JUDGE_FEATURES);
    setFeedback(JUDGE_FEEDBACK);
    setIsJudgeMode(true);
  };

  const handleGithubImport = async () => {
    if (!repoUrl.trim()) return;
    setIsImporting(true);
    setImportError(null);
    setImportedRepoName(null);
    
    try {
      const res = await fetch('/api/github-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import from GitHub');
      }
      
      setPrd(data.prd || '');
      setFeatureRequests(data.featureRequests || '');
      setFeedback(data.feedback || '');
      setImportedRepoName(data.repoName);
      if (data.timelineInsight) setTimelineInsight(data.timelineInsight);
      
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };

  // Helper to highlight and scroll
  const highlightScroll = (elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('pc-highlight-flash');
        setTimeout(() => el.classList.remove('pc-highlight-flash'), 2000);
      }
    }, 100);
  };

  const highlightNode = (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (node) {
      setSelectedNode(node);
      if (graph) {
        setImpactedNodeIds(getDownstreamNodeIds(node.id, graph.edges));
      }
    }
    highlightScroll(`node-card-${id}`);
  };

  const highlightDebate = (id: string) => {
    setExpandedDebate(id);
    highlightScroll(`debate-session-${id}`);
  };

  const runAnalysis = useCallback(async () => {
    setLoading(true); setError(null); setShowResults(true);
    setNodes([]); setGraph(null); setDebateLogs([]); setRoadmap([]); setSummary(null);
    setSelectedNode(null); setThinkingAgent(null); setImpactedNodeIds(new Set()); setChallengeHistory({});
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
      
      if (isJudgeMode) {
        setWalkthroughActive(true);
        setWalkthroughStep(0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setActiveStep(0);
    } finally { setLoading(false); }
  }, [prd, featureRequests, feedback, isJudgeMode]);

  // Run automatically when judge mode is loaded and inputs are populated
  useEffect(() => {
    if (isJudgeMode && prd && featureRequests && feedback && !loading && !showResults) {
      runAnalysis();
    }
  }, [isJudgeMode, prd, featureRequests, feedback, runAnalysis, loading, showResults]);

  // Challenge Decision Logic
  const handleChallengeDecision = async (item: RoadmapItem) => {
    setChallengingItemId(item.id);
    setLoading(true);

    const relatedIds = [...item.sourceNodes, ...item.relatedDebate];
    const targetNodes = nodes.filter(n => relatedIds.includes(n.id));

    // Capture current verdicts before challenge
    const prevVerdicts: Record<string, string> = {};
    debateLogs.forEach(l => {
      if (relatedIds.includes(l.nodeId)) {
        prevVerdicts[l.nodeId] = l.verdict.split(' - ')[0] || l.verdict;
      }
    });

    try {
      setActiveStep(3);
      const r = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staleOrContestedNodes: targetNodes,
          allNodes: nodes,
          isChallenge: true
        })
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Challenge debate failed');
      }

      const reader = r.body?.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const updatedLogs = [...debateLogs];

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const d = JSON.parse(line);
              if (d.type === 'start_debate') {
                let lg = updatedLogs.find(l => l.nodeId === d.nodeId);
                if (!lg) {
                  lg = { nodeId: d.nodeId, turns: [], verdict: '' };
                  updatedLogs.push(lg);
                } else {
                  lg.turns = [];
                  lg.verdict = '';
                }
                setDebateLogs([...updatedLogs]);
                setExpandedDebate(d.nodeId);
              } else if (d.type === 'thinking') {
                setThinkingAgent({ nodeId: d.nodeId, persona: d.persona });
              } else if (d.type === 'turn') {
                setThinkingAgent(null);
                const lg = updatedLogs.find(l => l.nodeId === d.nodeId);
                if (lg) lg.turns.push(d.turn);
                setDebateLogs([...updatedLogs]);
              } else if (d.type === 'verdict') {
                const lg = updatedLogs.find(l => l.nodeId === d.nodeId);
                if (lg) {
                  lg.verdict = d.verdict;
                  const prev = prevVerdicts[d.nodeId] || 'Proceed';
                  const current = d.verdict.split(' - ')[0] || d.verdict;
                  setChallengeHistory(h => ({
                    ...h,
                    [d.nodeId]: { previous: prev, current }
                  }));
                }
                setDebateLogs([...updatedLogs]);
              } else if (d.type === 'complete') {
                setThinkingAgent(null);
              }
            } catch { /* ignore */ }
          }
        }
      }

      setActiveStep(4);
      const r4 = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphData: graph || { nodes, edges: [] }, debateLogs: updatedLogs, originalFeatureRequests: featureRequests })
      });
      if (!r4.ok) { const e = await r4.json().catch(() => ({})); throw new Error(e.error || 'Re-synthesis failed'); }
      const { roadmap: rm } = await r4.json();
      setRoadmap(rm);
      setSummary(computeSummary(nodes, updatedLogs, rm));
      setActiveStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected challenge error');
    } finally {
      setLoading(false);
      setChallengingItemId(null);
    }
  };

  const handleRerunDebate = async (nodeId: string, log: DebateLog) => {
    const fix = proposedFixes[nodeId];
    if (!fix || !fix.trim()) return;

    setIsRerunning(prev => ({ ...prev, [nodeId]: true }));
    const targetNode = nodes.find(n => n.id === nodeId);

    try {
      const r = await fetch('/api/debate-rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNode,
          allNodes: nodes,
          proposedFix: fix,
          originalDebateLog: log
        })
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Debate rerun failed');
      }

      const reader = r.body?.getReader();
      const dec = new TextDecoder();
      let buf = '';
      
      const currentRerunLog: DebateLog = { nodeId, turns: [], verdict: '' };
      setRerunLogs(prev => ({ ...prev, [nodeId]: currentRerunLog }));

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const d = JSON.parse(line);
              if (d.type === 'start_debate') {
                // Already initialized
              } else if (d.type === 'thinking') {
                setRerunThinkingAgent({ nodeId: d.nodeId, persona: d.persona as keyof typeof PERSONA });
              } else if (d.type === 'turn') {
                setRerunThinkingAgent(null);
                currentRerunLog.turns.push(d.turn);
                setRerunLogs(prev => ({ ...prev, [nodeId]: { ...currentRerunLog } }));
              } else if (d.type === 'verdict') {
                currentRerunLog.verdict = d.verdict;
                setRerunLogs(prev => ({ ...prev, [nodeId]: { ...currentRerunLog } }));
              } else if (d.type === 'complete') {
                setRerunThinkingAgent(null);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unexpected challenge error');
    } finally {
      setIsRerunning(prev => ({ ...prev, [nodeId]: false }));
      setRerunThinkingAgent(null);
    }
  };

  const generateSuggestions = useCallback(async (log: DebateLog) => {
    setIsGeneratingSuggestions(prev => ({ ...prev, [log.nodeId]: true }));
    try {
      const node = nodes.find(n => n.id === log.nodeId);
      const res = await fetch('/api/suggest-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node, debateLog: log })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions) {
          setFixSuggestions(prev => ({ ...prev, [log.nodeId]: data.suggestions }));
        }
      }
    } catch (err) {
      console.error('Failed to generate suggestions', err);
    } finally {
      setIsGeneratingSuggestions(prev => ({ ...prev, [log.nodeId]: false }));
    }
  }, [nodes]);

  useEffect(() => {
    debateLogs.forEach(log => {
      const isLive = thinkingAgent?.nodeId === log.nodeId;
      const v = log.verdict;
      if (!isLive && v && !v.toLowerCase().startsWith('proceed') && !fixSuggestions[log.nodeId] && !isGeneratingSuggestions[log.nodeId]) {
        generateSuggestions(log);
      }
    });
  }, [debateLogs, thinkingAgent, fixSuggestions, isGeneratingSuggestions, generateSuggestions]);

  const staleCount = nodes.filter(n => n.status === 'stale').length;
  const contestedCount = nodes.filter(n => n.status === 'contested').length;
  const freshCount = nodes.filter(n => n.status === 'fresh').length;

  const isGraphDone = activeStep >= 2 && graph;
  const isDebateDone = activeStep >= 4;

  const assumptions = nodes.filter(n => n.type === 'assumption');

  // Strategic Scores Calculations
  const riskScoreValue = isGraphDone && nodes.length ? Math.min(10, Math.round(((staleCount * 1.5 + contestedCount) / nodes.length) * 10)) : 0;
  const alignmentScoreValue = isGraphDone && nodes.length ? Math.round((freshCount / nodes.length) * 100) : 0;
  
  const getPostConfidence = (node: Node) => {
    const log = debateLogs.find(l => l.nodeId === node.id);
    if (!log || !log.verdict) return Math.round(node.confidence * 100);
    const v = log.verdict.toLowerCase();
    if (v.startsWith('proceed')) return Math.round(node.confidence * 100);
    if (v.startsWith('cut')) return 10;
    return 45; // Modify
  };
  
  const confidenceScoreValue = isDebateDone && nodes.length ? Math.round(nodes.reduce((acc, curr) => acc + getPostConfidence(curr), 0) / nodes.length) : 0;

  const featureRequestsNodes = nodes.filter(n => n.source === 'feature_request');
  const engCostKeywords = ['api', 'database', 'infrastructure', 'integration', 'migration', 'auth', 'security', 'backend', 'server', 'logic', 'handler'];
  let totalEngScore = 0;
  featureRequestsNodes.forEach(n => {
    const text = n.text.toLowerCase();
    const hits = engCostKeywords.filter(k => text.includes(k)).length;
    totalEngScore += Math.min(10, hits * 2);
  });
  const avgEngCost = featureRequestsNodes.length ? totalEngScore / featureRequestsNodes.length : 0;
  
  const totalDebated = debateLogs.length;
  const cutVerdicts = debateLogs.filter(l => l.verdict && l.verdict.toLowerCase().startsWith('cut')).length;
  const cutRatio = totalDebated ? cutVerdicts / totalDebated : 0;
  
  const executionDifficultyValue = isDebateDone ? Math.min(10, Math.round((cutRatio * 5) + (avgEngCost / 2))) : 0;

  // Impact Radius details
  const getImpactDetails = (nodeId: string) => {
    if (!graph) return { nodes: 0, debates: 0, roadmaps: 0 };
    const downstream = getDownstreamNodeIds(nodeId, graph.edges);
    const debatesCount = debateLogs.filter(d => downstream.has(d.nodeId) || d.nodeId === nodeId).length;
    const roadmapsCount = roadmap.filter(r => 
      r.sourceNodes.some(s => downstream.has(s) || s === nodeId) || 
      r.relatedDebate.some(d => downstream.has(d) || d === nodeId)
    ).length;

    return {
      nodes: downstream.size,
      debates: debatesCount,
      roadmaps: roadmapsCount
    };
  };

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

  const downloadRoadmapAsMarkdown = () => {
    const date = new Date().toISOString().split('T')[0];
    let md = `# Product Council AI — Roadmap Report\n\n`;
    md += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    [...roadmap].sort((a, b) => a.rank - b.rank).forEach(item => {
      md += `## #${item.rank}. ${item.title}\n\n`;
      md += `${item.rationale}\n\n`;
      md += `**Trace sources:** ${item.sourceNodes.length ? item.sourceNodes.join(', ') : 'None'} | Debate: ${item.relatedDebate.length ? item.relatedDebate.join(', ') : 'None'}\n\n`;
    });

    md += `---\n*Generated by Product Council AI*`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `product-council-roadmap-${date}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
              <div className="pc-logo-sub">Decision Intelligence System · Causality-Driven Reasoning</div>
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

          {/* JUDGE WALKTHROUGH PANEL */}
          {walkthroughActive && nodes.length > 0 && (
            <div className="pc-walkthrough-card pc-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                  👑 Interactive Judge Walkthrough
                </span>
                <button style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '0.72rem' }} onClick={() => setWalkthroughActive(false)}>✕ Skip</button>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                {WALKTHROUGH_STEPS[walkthroughStep].description}
              </p>
              <div className="pc-walkthrough-steps">
                {WALKTHROUGH_STEPS.map((step, idx) => (
                  <button
                    key={idx}
                    className={`pc-walkthrough-step-btn ${walkthroughStep === idx ? 'pc-walkthrough-step-btn-active' : ''}`}
                    onClick={() => {
                      setWalkthroughStep(idx);
                      step.action(nodes);
                    }}
                  >
                    {step.title}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  disabled={walkthroughStep === 0}
                  onClick={() => {
                    const nextIdx = walkthroughStep - 1;
                    setWalkthroughStep(nextIdx);
                    WALKTHROUGH_STEPS[nextIdx].action(nodes);
                  }}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#8b949e', padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer' }}
                >
                  Back
                </button>
                <button
                  disabled={walkthroughStep === WALKTHROUGH_STEPS.length - 1}
                  onClick={() => {
                    const nextIdx = walkthroughStep + 1;
                    setWalkthroughStep(nextIdx);
                    WALKTHROUGH_STEPS[nextIdx].action(nodes);
                  }}
                  style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 6, color: '#c4b5fd', padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Next Step
                </button>
              </div>
            </div>
          )}

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

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#c9d1d9', marginBottom: 8 }}>
                <Dot color="#a78bfa" /> Or paste a GitHub repo URL (Public)
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  style={{ flex: 1, minWidth: 200, background: 'rgba(5,8,16,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8, color: '#f0f6fc', fontSize: '0.85rem' }}
                />
                <button
                  onClick={handleGithubImport}
                  disabled={isImporting || !repoUrl.trim()}
                  style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd', padding: '0 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: isImporting || !repoUrl.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 40 }}
                >
                  {isImporting ? <><Spinner color="#c4b5fd" size={14} /> Reading repo...</> : 'Generate from Repo'}
                </button>
              </div>
              {importError && (
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#fca5a5' }}>
                  {importError}
                </div>
              )}
            </div>

            {timelineInsight && (
              <div className="pc-fade-in" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginBottom: 8 }}>
                  📅 Timeline Insight
                </div>
                <p style={{ fontSize: '0.85rem', color: '#c9d1d9', lineHeight: 1.6 }}>{timelineInsight}</p>
              </div>
            )}

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

            {importedRepoName && (
              <div style={{ marginTop: 12, textAlign: 'center', fontSize: '0.75rem', color: '#8b949e', fontStyle: 'italic' }}>
                Generated from <strong>{importedRepoName}</strong> — edit before running if needed.
              </div>
            )}

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

              {/* UPGRADED STRATEGIC SCORE DASHBOARD */}
              {nodes.length > 0 && (
                <div className="pc-score-grid">
                  <div className="pc-score-card">
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f87171' }}>Risk Score</span>
                    <span className="pc-score-value" style={{ color: isGraphDone ? (riskScoreValue >= 7 ? '#ef4444' : riskScoreValue >= 4 ? '#fb923c' : '#34d399') : '#8b949e' }}>
                      {isGraphDone ? `${riskScoreValue}/10` : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', animation: 'pcPulse 1.5s infinite' }}><Spinner color="#f87171" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: '#8b949e' }}>Stale & Contested claims</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#34d399' }}>Alignment Score</span>
                    <span className="pc-score-value" style={{ color: isGraphDone ? (alignmentScoreValue >= 70 ? '#34d399' : alignmentScoreValue >= 40 ? '#fb923c' : '#ef4444') : '#8b949e' }}>
                      {isGraphDone ? `${alignmentScoreValue}%` : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', animation: 'pcPulse 1.5s infinite' }}><Spinner color="#34d399" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: '#8b949e' }}>Fresh validated ideas</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a78bfa' }}>Confidence Score</span>
                    <span className="pc-score-value" style={{ color: isDebateDone ? (confidenceScoreValue >= 70 ? '#34d399' : confidenceScoreValue >= 40 ? '#fb923c' : '#ef4444') : '#8b949e' }}>
                      {isDebateDone ? `${confidenceScoreValue}%` : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', animation: 'pcPulse 1.5s infinite' }}><Spinner color="#a78bfa" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: '#8b949e' }}>Assumption health rating</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#60a5fa' }}>Difficulty Index</span>
                    <span className="pc-score-value" style={{ color: isDebateDone ? (executionDifficultyValue >= 7 ? '#ef4444' : executionDifficultyValue >= 4 ? '#fb923c' : '#34d399') : '#8b949e' }}>
                      {isDebateDone ? `${executionDifficultyValue}/10` : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', animation: 'pcPulse 1.5s infinite' }}><Spinner color="#60a5fa" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: '#8b949e' }}>Eng complexity weight</span>
                  </div>
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
                        const isImpacted = impactedNodeIds.has(node.id);
                        
                        return (
                          <button 
                            key={node.id} 
                            id={`node-card-${node.id}`} 
                            className={`pc-node-btn ${isImpacted ? 'pc-node-impacted' : ''}`} 
                            onClick={() => {
                              setSelectedNode(node);
                              if (graph) {
                                setImpactedNodeIds(getDownstreamNodeIds(node.id, graph.edges));
                              }
                            }}
                            style={{ 
                              background: isSelected ? 'rgba(45,212,191,0.06)' : isImpacted ? 'rgba(167,139,250,0.03)' : node.status === 'stale' ? 'rgba(251,146,60,0.04)' : node.status === 'contested' ? 'rgba(248,113,113,0.04)' : 'rgba(5,8,16,0.5)', 
                              border: `1px solid ${isSelected ? 'rgba(45,212,191,0.3)' : isImpacted ? 'rgba(167,139,250,0.3)' : node.status !== 'fresh' ? ss.border : 'rgba(255,255,255,0.06)'}` 
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.63rem', fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8b949e' }}>{node.id}</span>
                                <Badge style={src}>{node.source.replace('_', ' ')}</Badge>
                              </div>
                              <Badge style={ss}>{node.status === 'stale' ? '🔴' : node.status === 'contested' ? '🟡' : '🟢'} {node.status}</Badge>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#c9d1d9', lineHeight: 1.55 }}>{node.text}</p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
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
                            {tab === 'graph' ? 'Hierarchical Graph' : 'Decision Heatmap'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minHeight: 0, overflow: 'hidden' }}>
                      {activeTab === 'graph' ? (
                        graph ? (
                          <>
                            <DependencyGraph 
                              data={graph} 
                              onNodeSelect={(node) => {
                                setSelectedNode(node);
                                setImpactedNodeIds(getDownstreamNodeIds(node.id, graph.edges));
                              }} 
                              selectedNode={selectedNode}
                              onImpactChange={(nodeId, impactedIds) => {
                                setImpactedNodeIds(impactedIds);
                              }}
                            />
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
                                
                                {/* DECISION IMPACT ENGINE CARD */}
                                {(() => {
                                  const details = getImpactDetails(selectedNode.id);
                                  return (
                                    <div style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#c4b5fd' }}>
                                      <span>💥 Impact Radius: <strong>{details.nodes + details.debates + details.roadmaps} items</strong></span>
                                      <span style={{ color: '#8b949e' }}>({details.nodes} nodes, {details.debates} debates, {details.roadmaps} roadmap targets)</span>
                                    </div>
                                  );
                                })()}
                                
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

              {/* Stage 01.5 ASSUMPTION COLLAPSE PANEL */}
              {nodes.length > 0 && assumptions.length > 0 && (
                <div>
                  <div className="pc-stage-label">
                    <span className="pc-stage-num">01.5</span>
                    <span className="pc-stage-name">Assumption Collapse Panel & Risk Tracker</span>
                  </div>
                  <div className="pc-card">
                    <div className="pc-table-container">
                      <table className="pc-table">
                        <thead>
                          <tr>
                            <th>Assumption ID & Statement</th>
                            <th style={{ textAlign: 'center' }}>Initial Conf.</th>
                            <th style={{ textAlign: 'center' }}>Post-Debate Conf.</th>
                            <th style={{ textAlign: 'center' }}>Drop</th>
                            <th>Downstream Decisions Affected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assumptions.map(node => {
                            const beforeConf = Math.round(node.confidence * 100);
                            const afterConf = getPostConfidence(node);
                            const drop = beforeConf - afterConf;
                            
                            const downstreamSet = graph ? getDownstreamNodeIds(node.id, graph.edges) : new Set<string>();
                            const affected = nodes.filter(n => downstreamSet.has(n.id) && n.type === 'requirement').map(n => n.id);
                            const affectedRm = roadmap.filter(r => r.sourceNodes.some(s => downstreamSet.has(s) || s === node.id)).map(r => r.id);
                            const affectedList = [...affected, ...affectedRm].join(', ') || 'None';

                            return (
                              <tr key={node.id}>
                                <td>
                                  <div style={{ fontWeight: 700, color: '#f0f6fc', marginBottom: 2 }}>{node.id}</div>
                                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>{node.text}</div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600, color: '#94a3b8' }}>{beforeConf}%</td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: afterConf >= 70 ? '#34d399' : afterConf >= 40 ? '#fb923c' : '#f87171' }}>{afterConf}%</td>
                                <td style={{ textAlign: 'center' }}>
                                  {drop > 0 ? (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: drop >= 40 ? 'rgba(248,113,113,0.12)' : 'rgba(251,146,60,0.12)', color: drop >= 40 ? '#f87171' : '#fb923c', border: `1px solid ${drop >= 40 ? 'rgba(248,113,113,0.2)' : 'rgba(251,146,60,0.2)'}` }}>
                                      ↓ {drop}% {drop >= 40 ? 'CRITICAL' : ''}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#8b949e' }}>—</span>
                                  )}
                                </td>
                                <td style={{ fontFamily: 'monospace', color: '#c4b5fd' }}>{affectedList}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Separator */}
              <div className="pc-separator">
                <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #2dd4bf, #a78bfa)' }} />
                <span className="pc-sep-label">AI Boardroom Convenes</span>
                <div style={{ height: 1, width: 80, background: 'linear-gradient(90deg, #a78bfa, #60a5fa)' }} />
              </div>

              {/* Stage 02 Debate */}
              <div id="debate-section">
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
                          <div style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 600 }}>{p.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Debate sessions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {debateLogs.length > 0 ? debateLogs.map(log => {
                      const node = (graph?.nodes || nodes).find(x => x.id === log.nodeId);
                      const isExpanded = expandedDebate === log.nodeId || debateLogs.length === 1;
                      const isImpacted = impactedNodeIds.has(log.nodeId) || selectedNode?.id === log.nodeId;
                      const vkey = log.verdict?.toLowerCase().startsWith('proceed') ? 'proceed' : log.verdict?.toLowerCase().startsWith('cut') ? 'cut' : 'modify';
                      const vs = VERDICT_STYLE[vkey];
                      const isLive = thinkingAgent?.nodeId === log.nodeId;
                      const ns = node?.status ? STATUS_STYLE[node.status] : STATUS_STYLE.contested;
                      
                      return (
                        <div key={log.nodeId} id={`debate-session-${log.nodeId}`} className={`pc-debate-session ${isImpacted ? 'pc-debate-impacted' : ''}`} style={{ border: isImpacted ? '1px solid rgba(167,139,250,0.4)' : undefined }}>
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
                                  <div key={i} className="pc-fade-in" style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', gap: 10 }}>
                                    <div className="pc-chat-avatar" style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}35` }}>
                                      {p.emoji}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                                      <div className="pc-chat-title-group">
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: p.color }}>{p.name} <span className="pc-chat-role">({p.title})</span></span>
                                        {turn.respondingTo && <span style={{ fontWeight: 400, color: '#484f58', fontSize: '0.65rem' }}>↩ responding to {PERSONA[turn.respondingTo as keyof typeof PERSONA]?.name}</span>}
                                      </div>
                                      <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.6 }}>{turn.text}</p>
                                    </div>
                                  </div>
                                );
                              })}
                              
                              {/* Typing indicator */}
                              {isLive && thinkingAgent && (() => {
                                const p = PERSONA[thinkingAgent.persona];
                                return (
                                  <div style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', gap: 10 }}>
                                    <div className="pc-chat-avatar" style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}35` }}>{p.emoji}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: p.color }}>{p.name} <span className="pc-chat-role">({p.title}) is typing...</span></span>
                                      <div style={{ display: 'flex', gap: 5, padding: '4px 0' }}>
                                        <span className="pc-dot pc-dot-1" style={{ background: p.color }} />
                                        <span className="pc-dot pc-dot-2" style={{ background: p.color }} />
                                        <span className="pc-dot pc-dot-3" style={{ background: p.color }} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Verdict panel */}
                              {log.verdict && (
                                <div style={{ borderRadius: 12, padding: 12, background: vs.bg, border: `1px solid ${vs.border}` }}>
                                  <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: vs.color, marginBottom: 6 }}>👤 User Advocate Verdict</div>
                                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: vs.color }}>{log.verdict}</p>
                                </div>
                              )}

                              {/* Propose a fix input */}
                              {log.verdict && !log.verdict.toLowerCase().startsWith('proceed') && (
                                <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)' }}>
                                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c9d1d9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    ✨ AI Suggested Fixes
                                  </div>
                                  
                                  {isGeneratingSuggestions[log.nodeId] && (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                      <div style={{ height: 28, width: 200, background: 'rgba(255,255,255,0.05)', borderRadius: 14, animation: 'pcPulse 1.5s infinite' }} />
                                      <div style={{ height: 28, width: 160, background: 'rgba(255,255,255,0.05)', borderRadius: 14, animation: 'pcPulse 1.5s infinite' }} />
                                    </div>
                                  )}

                                  {!isGeneratingSuggestions[log.nodeId] && fixSuggestions[log.nodeId] && (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                      {fixSuggestions[log.nodeId].map((sug, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => {
                                            setProposedFixes(prev => ({ ...prev, [log.nodeId]: sug.text }));
                                            setTimeout(() => handleRerunDebate(log.nodeId, log), 0);
                                          }}
                                          title={`Addresses: ${sug.addressesObjection}`}
                                          style={{
                                            background: 'rgba(167,139,250,0.1)',
                                            border: '1px solid rgba(167,139,250,0.3)',
                                            color: '#c4b5fd',
                                            padding: '4px 10px',
                                            borderRadius: 14,
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          <span style={{ opacity: 0.7, marginRight: 4 }}>💡</span>
                                          {sug.text}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c9d1d9', marginBottom: 8, marginTop: fixSuggestions[log.nodeId] ? 12 : 0, borderTop: fixSuggestions[log.nodeId] ? '1px solid rgba(255,255,255,0.06)' : 'none', paddingTop: fixSuggestions[log.nodeId] ? 12 : 0 }}>Or write a manual fix:</div>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <input 
                                      value={proposedFixes[log.nodeId] || ''} 
                                      onChange={e => setProposedFixes(prev => ({ ...prev, [log.nodeId]: e.target.value }))}
                                      placeholder="e.g. add a mandatory human-handoff button..."
                                      style={{ flex: 1, minWidth: 200, background: 'rgba(5,8,16,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: 8, color: '#f0f6fc', fontSize: '0.8rem' }}
                                    />
                                    <button 
                                      onClick={() => handleRerunDebate(log.nodeId, log)}
                                      disabled={isRerunning[log.nodeId] || !proposedFixes[log.nodeId]}
                                      style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd', padding: '0 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: isRerunning[log.nodeId] || !proposedFixes[log.nodeId] ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}
                                    >
                                      {isRerunning[log.nodeId] ? <><Spinner color="#93c5fd" size={14} /> Re-running...</> : 'Re-run Debate'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Round 2 Rerun */}
                          {rerunLogs[log.nodeId] && (
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 8, paddingLeft: 14, paddingRight: 14, paddingBottom: 14 }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#93c5fd', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🔄 Round 2 (with fix applied)</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 12, color: '#c9d1d9' }}>Simulation</span>
                              </div>
                              
                              {/* Before / After comparison */}
                              {rerunLogs[log.nodeId].verdict && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'rgba(5,8,16,0.4)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#8b949e', marginBottom: 4 }}>Original Verdict</div>
                                    <Badge style={vs}>{log.verdict.split(' - ')[0]}</Badge>
                                  </div>
                                  <div style={{ color: '#8b949e', fontWeight: 800 }}>➔</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#8b949e', marginBottom: 4 }}>New Verdict</div>
                                    {(() => {
                                      const newV = rerunLogs[log.nodeId].verdict;
                                      const newVKey = newV.toLowerCase().startsWith('proceed') ? 'proceed' : newV.toLowerCase().startsWith('cut') ? 'cut' : 'modify';
                                      const newVs = VERDICT_STYLE[newVKey];
                                      return <Badge style={newVs}>{newV.split(' - ')[0]}</Badge>;
                                    })()}
                                  </div>
                                </div>
                              )}

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {rerunLogs[log.nodeId].turns.map((turn, i) => {
                                  const p = PERSONA[turn.persona];
                                  return (
                                    <div key={i} className="pc-fade-in" style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', gap: 10 }}>
                                      <div className="pc-chat-avatar" style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}35` }}>
                                        {p.emoji}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                                        <div className="pc-chat-title-group">
                                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: p.color }}>{p.name} <span className="pc-chat-role">({p.title})</span></span>
                                          {turn.respondingTo && <span style={{ fontWeight: 400, color: '#484f58', fontSize: '0.65rem' }}>↩ responding to {PERSONA[turn.respondingTo as keyof typeof PERSONA]?.name}</span>}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: '#c9d1d9', lineHeight: 1.6 }}>{turn.text}</p>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Typing indicator for rerun */}
                                {rerunThinkingAgent?.nodeId === log.nodeId && (() => {
                                  const p = PERSONA[rerunThinkingAgent.persona];
                                  return (
                                    <div style={{ borderRadius: 12, padding: 12, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', gap: 10 }}>
                                      <div className="pc-chat-avatar" style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}35` }}>{p.emoji}</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: p.color }}>{p.name} <span className="pc-chat-role">({p.title}) is typing...</span></span>
                                        <div style={{ display: 'flex', gap: 5, padding: '4px 0' }}>
                                          <span className="pc-dot pc-dot-1" style={{ background: p.color }} />
                                          <span className="pc-dot pc-dot-2" style={{ background: p.color }} />
                                          <span className="pc-dot pc-dot-3" style={{ background: p.color }} />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Verdict panel for rerun */}
                                {rerunLogs[log.nodeId].verdict && (() => {
                                  const newV = rerunLogs[log.nodeId].verdict;
                                  const newVKey = newV.toLowerCase().startsWith('proceed') ? 'proceed' : newV.toLowerCase().startsWith('cut') ? 'cut' : 'modify';
                                  const newVs = VERDICT_STYLE[newVKey];
                                  return (
                                    <div style={{ borderRadius: 12, padding: 12, background: newVs.bg, border: `1px solid ${newVs.border}` }}>
                                      <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: newVs.color, marginBottom: 6 }}>👤 User Advocate Verdict</div>
                                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: newVs.color }}>{newV}</p>
                                    </div>
                                  );
                                })()}
                              </div>
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
                <div id="roadmap-section">
                  <div className="pc-stage-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                      <span className="pc-stage-num">04</span>
                      <span className="pc-stage-name">Synthesized & Ranked Product Roadmap</span>
                      {loading && activeStep === 4 && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', marginLeft: 12 }} className="pc-blink">● SYNTHESIZING</span>}
                    </div>
                    {roadmap.length > 0 && (
                      <button 
                        onClick={downloadRoadmapAsMarkdown}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'rgba(45,212,191,0.1)',
                          border: '1px solid rgba(45,212,191,0.25)',
                          color: '#2dd4bf',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        ⬇ Export Roadmap
                      </button>
                    )}
                  </div>
                  <div className="pc-card">
                    {roadmap.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {roadmap.map((item, i) => {
                          const isChallenging = challengingItemId === item.id;
                          const hasChanged = item.sourceNodes.some(s => challengeHistory[s]) || item.relatedDebate.some(d => challengeHistory[d]);
                          const isImpacted = item.sourceNodes.some(s => impactedNodeIds.has(s) || selectedNode?.id === s);

                          return (
                            <div 
                              key={item.id} 
                              className={`pc-roadmap-item ${isImpacted ? 'pc-roadmap-impacted' : ''}`} 
                              style={{ 
                                background: 'rgba(5,8,16,0.5)', 
                                border: isImpacted ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.07)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12
                              }}
                            >
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.82rem', flexShrink: 0, background: i === 0 ? 'linear-gradient(135deg, #2dd4bf, #34d399)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fff' : '#8b949e', border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>#{item.rank}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                    <h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f0f6fc' }}>{item.title}</h3>
                                    
                                    {/* CHALLENGE BUTTON */}
                                    <button 
                                      onClick={() => handleChallengeDecision(item)} 
                                      disabled={loading} 
                                      style={{ 
                                        fontSize: '0.65rem', 
                                        fontWeight: 700, 
                                        padding: '4px 10px', 
                                        borderRadius: 6, 
                                        background: 'rgba(239,68,68,0.1)', 
                                        border: '1px solid rgba(239,68,68,0.25)', 
                                        color: '#ef4444', 
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      {isChallenging ? '⚡ Challenging...' : '🔴 Challenge Decision'}
                                    </button>
                                  </div>
                                  <p style={{ fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.6, marginTop: 4, marginBottom: 8 }}>{item.rationale}</p>
                                  
                                  {/* UPGRADED ROADMAP TRACEABILITY */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trace Sources:</span>
                                      
                                      {/* Source badge triggers */}
                                      {item.sourceNodes.map(id => {
                                        const node = nodes.find(n => n.id === id);
                                        const badgeType = node?.type || 'node';
                                        return (
                                          <button 
                                            key={id} 
                                            onClick={() => highlightNode(id)} 
                                            style={{ 
                                              fontSize: '0.62rem', 
                                              padding: '2px 8px', 
                                              borderRadius: 20, 
                                              cursor: 'pointer', 
                                              background: badgeType === 'assumption' ? 'rgba(251,146,60,0.08)' : badgeType === 'feedback_signal' ? 'rgba(167,139,250,0.08)' : 'rgba(45,212,191,0.08)', 
                                              color: badgeType === 'assumption' ? '#fb923c' : badgeType === 'feedback_signal' ? '#c4b5fd' : '#2dd4bf', 
                                              border: `1px solid ${badgeType === 'assumption' ? 'rgba(251,146,60,0.2)' : badgeType === 'feedback_signal' ? 'rgba(167,139,250,0.2)' : 'rgba(45,212,191,0.2)'}`, 
                                              fontFamily: 'JetBrains Mono, monospace' 
                                            }}
                                          >
                                            {id}
                                          </button>
                                        );
                                      })}

                                      {/* Debate triggers */}
                                      {item.relatedDebate.map(id => (
                                        <button 
                                          key={id} 
                                          onClick={() => highlightDebate(id)} 
                                          style={{ 
                                            fontSize: '0.62rem', 
                                            padding: '2px 8px', 
                                            borderRadius: 20, 
                                            cursor: 'pointer', 
                                            background: 'rgba(167,139,250,0.1)', 
                                            color: '#c4b5fd', 
                                            border: '1px solid rgba(167,139,250,0.25)',
                                            fontFamily: 'JetBrains Mono, monospace'
                                          }}
                                        >
                                          ⚡ Debate {id}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                </div>
                              </div>

                              {/* CHALLENGE VERDICT COMPARISON CARD */}
                              {hasChanged && (() => {
                                const targetId = item.sourceNodes.find(s => challengeHistory[s]) || item.relatedDebate.find(d => challengeHistory[d]);
                                if (!targetId) return null;
                                const hist = challengeHistory[targetId];
                                return (
                                  <div className="pc-challenge-comparison pc-fade-in">
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: '0.58rem', textTransform: 'uppercase', color: '#8b949e', marginBottom: 2 }}>Previous Verdict</div>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>{hist.previous}</span>
                                    </div>
                                    <div style={{ color: '#8b949e', fontSize: '0.8rem', fontWeight: 800 }}>➔</div>
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: '0.58rem', textTransform: 'uppercase', color: '#8b949e', marginBottom: 2 }}>New Verdict (Challenged)</div>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: hist.current.startsWith('Cut') ? 'rgba(239,68,68,0.1)' : 'rgba(251,146,60,0.1)', color: hist.current.startsWith('Cut') ? '#ef4444' : '#fb923c', border: `1px solid ${hist.current.startsWith('Cut') ? 'rgba(239,68,68,0.2)' : 'rgba(251,146,60,0.2)'}` }}>{hist.current}</span>
                                    </div>
                                  </div>
                                );
                              })()}

                            </div>
                          );
                        })}
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
        <span>Product Council AI · Decision Intelligence System</span>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
        <span>Powered by Groq + Gemini + Anthropic Fallbacks</span>
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
