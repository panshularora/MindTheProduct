'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Node, GraphData, DebateLog, RoadmapItem, ExecutiveSummary } from '@/lib/types';
import DependencyGraph from '@/components/DependencyGraph';
import CodeDependencyGraph from '@/components/CodeDependencyGraph';
import RiskRadarChart from '@/components/RiskRadarChart';
import { CodeGraph, Conflict } from '@/lib/code-graph';
import { computeRiskRadar, RiskRadarData } from '@/lib/risk-radar';

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
  growth: { name: 'Growth Optimist', emoji: '🚀', title: 'VP of Growth', color: 'var(--color-fresh)', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', desc: 'Ship fast · Capture market' },
  eng_realist: { name: 'Eng Realist', emoji: '⚙️', title: 'Principal Architect', color: 'var(--color-info)', bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.2)', desc: 'Feasibility · Tech debt' },
  user_advocate: { name: 'User Advocate', emoji: '👤', title: 'Director of UX', color: 'var(--violet)', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.2)', desc: 'Usability · Real feedback' },
} as const;

const SRC_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  prd: { bg: 'rgba(96,165,250,0.1)', color: 'var(--color-info)', border: 'rgba(96,165,250,0.25)' },
  feature_request: { bg: 'rgba(251,146,60,0.1)', color: 'var(--color-contested)', border: 'rgba(251,146,60,0.25)' },
  feedback: { bg: 'rgba(167,139,250,0.1)', color: 'var(--violet)', border: 'rgba(167,139,250,0.25)' },
};
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  fresh: { bg: 'rgba(16,185,129,0.1)', color: 'var(--color-fresh)', border: 'rgba(16,185,129,0.2)' },
  stale: { bg: 'rgba(239,68,68,0.1)', color: 'var(--color-stale)', border: 'rgba(239,68,68,0.2)' },
  contested: { bg: 'rgba(245,158,11,0.1)', color: 'var(--color-contested)', border: 'rgba(245,158,11,0.2)' },
};
const VERDICT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  proceed: { bg: 'rgba(16,185,129,0.1)', color: 'var(--color-fresh)', border: 'rgba(16,185,129,0.25)' },
  modify: { bg: 'rgba(245,158,11,0.1)', color: 'var(--color-contested)', border: 'rgba(245,158,11,0.25)' },
  cut: { bg: 'rgba(239,68,68,0.1)', color: 'var(--color-stale)', border: 'rgba(239,68,68,0.25)' },
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

function CircularProgress({ value, size = 120, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  let color = '#10b981'; // Green
  if (value < 50) {
    color = '#ef4444'; // Red
  } else if (value <= 75) {
    color = '#f59e0b'; // Yellow/Amber
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f0f6fc', lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: '0.62rem', color: '#8b949e', textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.05em' }}>Readiness</span>
      </div>
    </div>
  );
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

  // Deployment Intelligence States
  const [activeView, setActiveView] = useState<'product-council' | 'deployment-intelligence'>('product-council');
  const [targetPlatform, setTargetPlatform] = useState<'vercel' | 'netlify' | 'railway'>('vercel');
  const [isAnalyzingDeployment, setIsAnalyzingDeployment] = useState(false);
  const [deploymentLoadingStep, setDeploymentLoadingStep] = useState<number>(0);
  const [deploymentData, setDeploymentData] = useState<{
    graph: CodeGraph;
    conflicts: Conflict[];
    explainedConflicts: {
      originalConflict: Conflict;
      platformSpecificExplanation: string;
      suggestedFix: string;
      severity: 'high' | 'medium' | 'low';
    }[];
    deploymentReadinessScore: number;
    filesCount?: number;
    dependenciesCount?: number;
  } | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [expandedConflicts, setExpandedConflicts] = useState<Record<number, boolean>>({});

  // Cross-system correlation states
  const [correlationData, setCorrelationData] = useState<{
    correlations: {
      feedbackNodeId: string;
      relatedConflict: string;
      confidence: 'high' | 'medium' | 'low';
      explanation: string;
    }[];
    noCorrelationsFound: boolean;
  } | null>(null);
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [envVarsReferenced, setEnvVarsReferenced] = useState<string[]>([]);

  // Negotiation Simulator States
  const [isNegotiationOpen, setIsNegotiationOpen] = useState(false);
  const [negotiationNode, setNegotiationNode] = useState<Node | null>(null);
  const [negotiationDebateLog, setNegotiationDebateLog] = useState<DebateLog | null>(null);
  const [negotiationHistory, setNegotiationHistory] = useState<{ role: 'user' | 'stakeholder'; text: string }[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [stakeholderStance, setStakeholderStance] = useState<'hardened' | 'unchanged' | 'softened' | 'reversed'>('unchanged');
  const [negotiationError, setNegotiationError] = useState<string | null>(null);

  // Stable conversation ID for Pendo trackAgent across the session
  const pendoConversationId = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session_${Date.now()}`);

  // Initialize Pendo Web SDK once on component mount
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof pendo !== 'undefined') {
      pendo.initialize({ visitor: { id: '' } });
    }
  }, []);

  const handleCorrelationAnalysis = async (currentNodes: Node[], currentConflicts: Conflict[], currentEnvVars: string[]) => {
    // Only target feedback signal nodes or nodes with feedback source
    const feedbackNodes = currentNodes.filter(n => n.type === 'feedback_signal' || n.source === 'feedback');
    if (feedbackNodes.length === 0 || currentConflicts.length === 0) {
      setCorrelationData({ correlations: [], noCorrelationsFound: true });
      return;
    }

    setIsCorrelating(true);
    setCorrelationError(null);
    try {
      const res = await fetch('/api/correlate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackNodes,
          codeConflicts: currentConflicts,
          envVarsReferenced: currentEnvVars
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to correlate findings');
      }
      setCorrelationData(data);
    } catch (err: unknown) {
      setCorrelationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCorrelating(false);
    }
  };

  // Trigger correlation automatically once both analyses complete
  useEffect(() => {
    if (nodes.length > 0 && deploymentData && !correlationData && !isCorrelating && !correlationError) {
      handleCorrelationAnalysis(nodes, deploymentData.conflicts, envVarsReferenced);
    }
  }, [nodes, deploymentData, correlationData, isCorrelating, correlationError, envVarsReferenced]);

  // Reset correlation states when repoUrl changes
  useEffect(() => {
    setCorrelationData(null);
    setCorrelationError(null);
    setEnvVarsReferenced([]);
  }, [repoUrl]);

  // Helper function to toggle conflict card expansion
  const toggleConflict = (idx: number) => {
    setExpandedConflicts(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Helper to color-code conflict severity badges
  const getSeverityColor = (sev: string) => {
    if (sev === 'high') return { bg: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: 'rgba(239, 68, 68, 0.4)' };
    if (sev === 'medium') return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fde047', border: 'rgba(245, 158, 11, 0.4)' };
    return { bg: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', border: 'rgba(59, 130, 246, 0.4)' };
  };

  const handleDeploymentAnalysis = async () => {
    if (!repoUrl.trim()) return;
    setIsAnalyzingDeployment(true);
    setDeploymentError(null);
    setDeploymentData(null);
    setEnvVarsReferenced([]);
    setCorrelationData(null);
    setCorrelationError(null);
    setActiveView('deployment-intelligence');
    setDeploymentLoadingStep(0);

    // Simulate loading sequence step transitions over a natural timeframe
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      if (currentStep < 3) {
        currentStep += 1;
        setDeploymentLoadingStep(currentStep);
      }
    }, 1800);

    try {
      const res = await fetch('/api/code-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repoUrl, 
          targetPlatform,
          mockConflicts: true 
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze deployment risk');
      }

      setDeploymentData({
        graph: data.graph,
        conflicts: data.conflicts,
        explainedConflicts: data.explainedConflicts || [],
        deploymentReadinessScore: data.deploymentReadinessScore ?? 100,
        filesCount: data.fileContents?.length || 0,
        dependenciesCount: Object.keys(data.packageJson?.dependencies || {}).length
      });
      
      if (data.envVarsReferenced) {
        setEnvVarsReferenced(data.envVarsReferenced);
      }
      
    } catch (err: unknown) {
      setDeploymentError(err instanceof Error ? err.message : String(err));
    } finally {
      clearInterval(stepInterval);
      setIsAnalyzingDeployment(false);
    }
  };

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
    setCorrelationData(null); setCorrelationError(null);
    setSelectedNode(null); setThinkingAgent(null); setImpactedNodeIds(new Set()); setChallengeHistory({});
    const analysisMessageId = crypto.randomUUID();
    try {
      if (typeof pendo !== 'undefined') {
        pendo.trackAgent("prompt", {
          agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
          conversationId: pendoConversationId.current,
          messageId: analysisMessageId,
          content: [prd, featureRequests, feedback].filter(Boolean).join('\n---\n'),
          suggestedPrompt: isJudgeMode,
        });
      }
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
      const computedSummary = computeSummary(gd.nodes, logs, rm);
      setSummary(computedSummary);
      setActiveStep(5);

      if (typeof pendo !== 'undefined') {
        pendo.trackAgent("agent_response", {
          agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
          conversationId: pendoConversationId.current,
          messageId: `agent_response_${analysisMessageId}`,
          content: `Extracted ${gd.nodes.length} nodes, ${logs.length} debates, ${rm.length} roadmap items. Risk: ${computedSummary.topRisk}`,
          toolsUsed: ["extract", "graph", "debate", "synthesize"],
        });
      }
      
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
    if (typeof pendo !== 'undefined') {
      pendo.trackAgent("user_reaction", {
        agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
        conversationId: pendoConversationId.current,
        messageId: `challenge_${item.id}_${Date.now()}`,
        content: "retry",
      });
    }
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

    if (typeof pendo !== 'undefined') {
      pendo.trackAgent("user_reaction", {
        agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
        conversationId: pendoConversationId.current,
        messageId: `rerun_${nodeId}_${Date.now()}`,
        content: "retry",
      });
    }
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

  // Negotiation Simulator Logic
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [negotiationHistory, isNegotiating]);

  const openNegotiation = (node: Node, log: DebateLog) => {
    setNegotiationNode(node);
    setNegotiationDebateLog(log);
    setNegotiationHistory([
      {
        role: 'stakeholder',
        text: `I saw the council decided to cut "${node.text}" (${node.id}). As a Senior Stakeholder, I am highly skeptical about keeping this. The debate raised some very critical concerns. Why do you think we should reverse this cut?`
      }
    ]);
    setCurrentMessage('');
    setStakeholderStance('unchanged');
    setIsNegotiationOpen(true);
    setNegotiationError(null);
  };

  const sendNegotiationMessage = async () => {
    if (!currentMessage.trim() || isNegotiating || !negotiationNode || !negotiationDebateLog) return;

    const newUserMsg = currentMessage.trim();
    const negotiationMsgId = crypto.randomUUID();
    setCurrentMessage('');
    
    const updatedHistory = [...negotiationHistory, { role: 'user' as const, text: newUserMsg }];
    setNegotiationHistory(updatedHistory);
    setIsNegotiating(true);
    setNegotiationError(null);

    if (typeof pendo !== 'undefined') {
      pendo.trackAgent("prompt", {
        agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
        conversationId: pendoConversationId.current,
        messageId: negotiationMsgId,
        content: newUserMsg,
      });
    }

    try {
      const res = await fetch('/api/negotiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          node: negotiationNode,
          debateLog: negotiationDebateLog,
          conversationHistory: updatedHistory,
          userMessage: newUserMsg
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      if (typeof pendo !== 'undefined') {
        pendo.trackAgent("agent_response", {
          agentId: "_LNMc6UrPXzjBlBAeI0o6oV-q70",
          conversationId: pendoConversationId.current,
          messageId: `agent_response_${negotiationMsgId}`,
          content: data.stakeholderReply,
        });
      }

      setNegotiationHistory(prev => [...prev, { role: 'stakeholder' as const, text: data.stakeholderReply }]);
      setStakeholderStance(data.stanceShift);

      if (data.stanceShift === 'reversed') {
        setDebateLogs(prev => prev.map(log => {
          if (log.nodeId === negotiationNode.id) {
            return {
              ...log,
              verdict: 'Proceed - Verdict overturned via negotiation'
            };
          }
          return log;
        }));
      }
    } catch (err: unknown) {
      console.error('Error in negotiation:', err);
      const errMsg = err instanceof Error ? err.message : 'An error occurred.';
      setNegotiationError(errMsg);
      setNegotiationHistory(prev => [...prev, { role: 'stakeholder' as const, text: 'Sorry, I got disconnected or encountered an error processing that statement.' }]);
    } finally {
      setIsNegotiating(false);
    }
  };

  const staleCount = nodes.filter(n => n.status === 'stale').length;
  const contestedCount = nodes.filter(n => n.status === 'contested').length;
  const freshCount = nodes.filter(n => n.status === 'fresh').length;

  // Risk Radar computation — pure aggregation, no API calls
  const radarData: RiskRadarData = useMemo(() => computeRiskRadar({
    nodes,
    debateLogs,
    deploymentReadinessScore: deploymentData?.deploymentReadinessScore ?? null,
    conflicts: deploymentData?.conflicts ?? null,
    codeGraphNodeCount: deploymentData?.graph?.nodes?.length ?? null,
  }), [nodes, debateLogs, deploymentData]);

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
              <div className="pc-logo-sub">Decision Intelligence System · AI Boardroom Debate, Code-Level Deployment Scanning, and Risk Radar Analytics</div>
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

          {/* TOP-LEVEL VIEW TABS */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', borderBottom: 'var(--border-default)', paddingBottom: 1 }}>
            <button
              onClick={() => setActiveView('product-council')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeView === 'product-council' ? 'var(--violet)' : 'var(--color-neutral)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 700,
                padding: '10px 18px',
                cursor: 'pointer',
                borderBottom: activeView === 'product-council' ? '3px solid var(--violet)' : '3px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)'
              }}
            >
              💼 Product Council Flow
            </button>
            <button
              onClick={() => setActiveView('deployment-intelligence')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeView === 'deployment-intelligence' ? 'var(--color-info)' : 'var(--color-neutral)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 700,
                padding: '10px 18px',
                cursor: 'pointer',
                borderBottom: activeView === 'deployment-intelligence' ? '3px solid var(--color-info)' : '3px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)'
              }}
            >
              ⚡ Deployment Intelligence
            </button>
          </div>

          {/* RISK RADAR — Executive Vitals Dashboard */}
          {(nodes.length > 0 || deploymentData) && (
            <div className="pc-card pc-fade-in" style={{ background: 'linear-gradient(135deg, rgba(13,17,23,0.95), rgba(19,25,34,0.95))', border: 'var(--border-subtle)', marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', paddingBottom: 14, borderBottom: 'var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-small)', background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(56,189,248,0.15))', border: '1px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)' }}>
                    📡
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--text-primary)' }}>Risk Radar</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Aggregated vitals across boardroom consensus and codebase scanning.</div>
                  </div>
                </div>
                {radarData.overallScore !== null && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Overall Health</span>
                      <span style={{
                        fontSize: 'var(--font-size-md)',
                        fontWeight: 900,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-small)',
                        background: radarData.overallScore >= 70 ? 'rgba(16,185,129,0.12)' : radarData.overallScore >= 45 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                        color: radarData.overallScore >= 70 ? 'var(--color-fresh)' : radarData.overallScore >= 45 ? 'var(--color-contested)' : 'var(--color-stale)',
                        border: `1px solid ${radarData.overallScore >= 70 ? 'rgba(16,185,129,0.25)' : radarData.overallScore >= 45 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      }}>
                        {radarData.overallScore}%
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Weighted overall health index</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                {/* Spider Chart */}
                <div style={{ flex: '0 0 auto' }}>
                  <RiskRadarChart data={radarData} size={300} />
                </div>

                {/* Stat Grid */}
                <div style={{ flex: '1 1 320px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, minWidth: 0 }}>
                  {radarData.axes.map(axis => {
                    const isAvailable = axis.score !== null;
                    const color = !isAvailable ? '#484f58' : axis.score! >= 70 ? '#34d399' : axis.score! >= 45 ? '#fbbf24' : '#ef4444';
                    const bgColor = !isAvailable ? 'rgba(255,255,255,0.02)' : axis.score! >= 70 ? 'rgba(52,211,153,0.04)' : axis.score! >= 45 ? 'rgba(251,191,36,0.04)' : 'rgba(239,68,68,0.04)';
                    const borderColor = !isAvailable ? 'rgba(255,255,255,0.06)' : `${color}30`;

                    return (
                      <div
                        key={axis.key}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          background: bgColor,
                          border: `1px solid ${borderColor}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          transition: 'all 0.4s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: color }}>{axis.label}</span>
                          {axis.limitedData && isAvailable && (
                            <span title="Limited data available" style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', fontWeight: 700 }}>~</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          {isAvailable ? (
                            <>
                              <span style={{ fontSize: '1.3rem', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color: color, lineHeight: 1 }}>{axis.score}</span>
                              <span style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 600 }}>/ 100</span>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#484f58', fontStyle: 'italic' }}>Awaiting data</span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.58rem', color: '#8b949e', lineHeight: 1.4, margin: 0 }}>{axis.rationale}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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

          {/* GITHUB REPOSITORY ANALYZER CARD */}
          <div className="pc-card" style={{ background: 'rgba(30,41,59,0.15)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8, color: '#f0f6fc' }}>
                🔗 GitHub Repository Analyzer
              </h2>
              {importedRepoName && (
                <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8', fontWeight: 600 }}>
                  Active: {importedRepoName}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Input & Platform select row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  style={{ flex: 1, minWidth: 260, background: 'rgba(5,8,16,0.65)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8, color: '#f0f6fc', fontSize: '0.85rem' }}
                />
                
                {/* Platform select dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.76rem', color: '#8b949e', fontWeight: 600 }}>Deployment Target:</span>
                  <select
                    value={targetPlatform}
                    onChange={e => setTargetPlatform(e.target.value as 'vercel' | 'netlify' | 'railway')}
                    style={{
                      background: 'rgba(15,23,42,0.85)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56,189,248,0.25)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="vercel">Vercel</option>
                    <option value="netlify">Netlify</option>
                    <option value="railway">Railway</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    setActiveView('product-council');
                    await handleGithubImport();
                  }}
                  disabled={isImporting || isAnalyzingDeployment || !repoUrl.trim()}
                  style={{
                    flex: '1 1 180px',
                    background: 'rgba(167,139,250,0.12)',
                    border: '1px solid rgba(167,139,250,0.3)',
                    color: '#c4b5fd',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isImporting || isAnalyzingDeployment || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                    opacity: isImporting || isAnalyzingDeployment || !repoUrl.trim() ? 0.55 : 1
                  }}
                >
                  {isImporting ? <><Spinner color="#c4b5fd" size={14} /> Reading repo...</> : <>💼 Analyze Product Risk</>}
                </button>
                
                <button
                  onClick={handleDeploymentAnalysis}
                  disabled={isImporting || isAnalyzingDeployment || !repoUrl.trim()}
                  style={{
                    flex: '1 1 180px',
                    background: 'rgba(56,189,248,0.12)',
                    border: '1px solid rgba(56,189,248,0.3)',
                    color: '#38bdf8',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isImporting || isAnalyzingDeployment || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                    opacity: isImporting || isAnalyzingDeployment || !repoUrl.trim() ? 0.55 : 1
                  }}
                >
                  {isAnalyzingDeployment ? <><Spinner color="#38bdf8" size={14} /> Scanning code...</> : <>🚀 Analyze Deployment Risk</>}
                </button>
              </div>

              {/* Warnings and errors */}
              {(importError || deploymentError) && (
                <div style={{ fontSize: '0.75rem', color: '#fca5a5', padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.18)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🚨 <strong>Error:</strong> {importError || deploymentError}
                </div>
              )}
            </div>
          </div>

          {/* PRODUCT COUNCIL FLOW CONFIGURATION CARD */}
          {activeView === 'product-council' && (
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
          )}

          {/* ERROR */}
          {activeView === 'product-council' && error && (
            <div className="pc-error" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span><strong>Pipeline Error:</strong> {error}</span>
            </div>
          )}

          {/* PIPELINE PROGRESS */}
          {activeView === 'product-council' && loading && (
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
          {activeView === 'product-council' && showResults && (
            <div className="pc-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* UPGRADED STRATEGIC SCORE DASHBOARD */}
              {nodes.length > 0 && (
                <div className="pc-score-grid">
                  <div className="pc-score-card">
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-stale)' }}>Risk Score</span>
                    <span className="pc-score-value" style={{ color: isGraphDone ? (riskScoreValue >= 7 ? 'var(--color-stale)' : riskScoreValue >= 4 ? 'var(--color-contested)' : 'var(--color-fresh)') : 'var(--color-neutral)' }}>
                      {isGraphDone ? `${riskScoreValue}/10` : <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-md)', animation: 'pcPulse 1.5s infinite' }}><Spinner color="var(--color-stale)" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textAlign: 'center' }}>Aggregated volume of stale and contested claims in the PRD.</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fresh)' }}>Alignment Score</span>
                    <span className="pc-score-value" style={{ color: isGraphDone ? (alignmentScoreValue >= 70 ? 'var(--color-fresh)' : alignmentScoreValue >= 40 ? 'var(--color-contested)' : 'var(--color-stale)') : 'var(--color-neutral)' }}>
                      {isGraphDone ? `${alignmentScoreValue}%` : <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-md)', animation: 'pcPulse 1.5s infinite' }}><Spinner color="var(--color-fresh)" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textAlign: 'center' }}>Percentage of product claims validated by positive user signals.</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--violet)' }}>Confidence Score</span>
                    <span className="pc-score-value" style={{ color: isDebateDone ? (confidenceScoreValue >= 70 ? 'var(--color-fresh)' : confidenceScoreValue >= 40 ? 'var(--color-contested)' : 'var(--color-stale)') : 'var(--color-neutral)' }}>
                      {isDebateDone ? `${confidenceScoreValue}%` : <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-md)', animation: 'pcPulse 1.5s infinite' }}><Spinner color="var(--violet)" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textAlign: 'center' }}>Average post-debate confidence score of project assumptions.</span>
                  </div>
                  <div className="pc-score-card">
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-info)' }}>Difficulty Index</span>
                    <span className="pc-score-value" style={{ color: isDebateDone ? (executionDifficultyValue >= 7 ? 'var(--color-stale)' : executionDifficultyValue >= 4 ? 'var(--color-contested)' : 'var(--color-fresh)') : 'var(--color-neutral)' }}>
                      {isDebateDone ? `${executionDifficultyValue}/10` : <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-md)', animation: 'pcPulse 1.5s infinite' }}><Spinner color="var(--color-info)" size={14} /> Calc...</span>}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textAlign: 'center' }}>Estimated engineering complexity based on roadmap features.</span>
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
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', padding: '3rem', textAlign: 'center', color: 'var(--color-neutral)' }}>
                          {activeStep === 1 ? (
                            <>
                              <Spinner color="var(--teal)" />
                              <p style={{ fontSize: 'var(--font-size-md)' }}>Extracting semantic claims & feedback...</p>
                            </>
                          ) : (
                            <>
                              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>Awaiting extraction inputs...</p>
                            </>
                          )}
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
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', padding: '2rem', textAlign: 'center', color: 'var(--color-neutral)' }}>
                            {activeStep >= 2 ? (
                              <>
                                <Spinner color="var(--color-fresh)" />
                                <p style={{ fontSize: 'var(--font-size-sm)' }}>Building dependency graph...</p>
                              </>
                            ) : (
                              <>
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.97 5.97 0 00-.75-2.985m-.938-3.197A5.971 5.971 0 0012 10.5c-2.84 0-5.36 1.972-5.999 4.73A5.965 5.965 0 006 18.72m0 0a5.97 5.97 0 01.75-2.985m0 0A5.97 5.97 0 0112 12.75" />
                                </svg>
                                <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>Convene the boardroom to build the dependency graph.</p>
                              </>
                            )}
                          </div>
                        )
                      ) : nodes.length > 0 ? <Heatmap nodes={graph?.nodes || nodes} /> : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', color: 'var(--color-neutral)', padding: '2rem' }}>
                          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                          </svg>
                          <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>Awaiting boardroom session data...</p>
                        </div>
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
                              {log.verdict && (
                                <span style={{ 
                                  fontSize: '0.68rem', 
                                  fontWeight: 700, 
                                  padding: '2px 9px', 
                                  borderRadius: 20, 
                                  background: log.verdict.includes('overturned') ? 'rgba(167,139,250,0.15)' : vs.bg, 
                                  color: log.verdict.includes('overturned') ? '#a78bfa' : vs.color, 
                                  border: `1px solid ${log.verdict.includes('overturned') ? 'rgba(167,139,250,0.3)' : vs.border}` 
                                }}>
                                  {log.verdict.includes('overturned') ? '⚖️ Overturned' : log.verdict.split(' - ')[0]}
                                </span>
                              )}
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
                                <div style={{ borderRadius: 12, padding: 12, background: vs.bg, border: `1px solid ${vs.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: vs.color, marginBottom: 6 }}>👤 User Advocate Verdict</div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: vs.color }}>{log.verdict}</p>
                                  </div>
                                  {vkey === 'cut' && (
                                    <button
                                      onClick={() => openNegotiation(node || { id: log.nodeId, type: 'claim', text: 'Target feature node', source: 'prd', confidence: 0.5, status: 'contested', dependsOn: [] }, log)}
                                      style={{
                                        alignSelf: 'flex-start',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        background: 'rgba(239,68,68,0.15)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5
                                      }}
                                    >
                                      💬 Defend This Decision
                                    </button>
                                  )}
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)', padding: '2rem', textAlign: 'center', color: 'var(--color-neutral)' }}>
                        <Spinner color="var(--violet)" />
                        <p style={{ fontSize: 'var(--font-size-sm)' }}>Debate session starting...</p>
                      </div>
                    ) : activeStep > 3 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-fresh)', padding: '2rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.2rem' }}>✅</span>
                        <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic', fontWeight: 600 }}>No contested decisions — boardroom at peace</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)', padding: '2rem', textAlign: 'center', color: 'var(--color-neutral)' }}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                        <p style={{ fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>Run analysis to initiate boardroom debates on contested claims.</p>
                      </div>
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

                          const relatedDebateLog = debateLogs.find(d => 
                            (item.relatedDebate.includes(d.nodeId) || item.sourceNodes.includes(d.nodeId)) && 
                            d.verdict?.toLowerCase().startsWith('cut')
                          );
                          const hasCutVerdict = !!relatedDebateLog;
                          const isOverturned = debateLogs.some(d => 
                            (item.relatedDebate.includes(d.nodeId) || item.sourceNodes.includes(d.nodeId)) && 
                            d.verdict?.toLowerCase().includes('overturned')
                          );

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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f0f6fc', margin: 0 }}>{item.title}</h3>
                                      {isOverturned && (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          fontSize: '0.62rem',
                                          fontWeight: 800,
                                          padding: '2px 8px',
                                          borderRadius: 6,
                                          background: 'rgba(52,211,153,0.12)',
                                          color: '#34d399',
                                          border: '1px solid rgba(52,211,153,0.25)',
                                          width: 'fit-content'
                                        }}>
                                          🎉 Verdict overturned via negotiation (Shipped)
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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

                                      {/* DEFEND BUTTON */}
                                      {hasCutVerdict && !isOverturned && relatedDebateLog && (
                                        <button 
                                          onClick={() => {
                                            const node = (graph?.nodes || nodes).find(x => x.id === relatedDebateLog.nodeId);
                                            if (node) openNegotiation(node, relatedDebateLog);
                                          }}
                                          disabled={loading} 
                                          style={{ 
                                            fontSize: '0.65rem', 
                                            fontWeight: 700, 
                                            padding: '4px 10px', 
                                            borderRadius: 6, 
                                            background: 'rgba(96,165,250,0.15)', 
                                            border: '1px solid rgba(96,165,250,0.3)', 
                                            color: '#60a5fa', 
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          💬 Defend This Decision
                                        </button>
                                      )}
                                    </div>
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

          {/* DEPLOYMENT INTELLIGENCE VIEW */}
          {activeView === 'deployment-intelligence' && (
            <div className="pc-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* LOADING STATE */}
              {isAnalyzingDeployment && (
                <div className="pc-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                  <Spinner color="#38bdf8" size={32} />
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f6fc', marginBottom: 4 }}>Analyzing Repository Deployment Risk</h3>
                    <p style={{ fontSize: '0.8rem', color: '#8b949e' }}>Running static code analysis & platform check...</p>
                  </div>
                  
                  {/* Loading Steps Sequence */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%', maxWidth: 700, marginTop: 15, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                    {[
                      { label: 'Fetching repository files...', icon: '📦' },
                      { label: 'Parsing import graph...', icon: '🧬' },
                      { label: 'Detecting conflicts...', icon: '🚨' },
                      { label: 'Generating platform-specific guidance...', icon: '🤖' }
                    ].map((step, idx) => {
                      const isActive = deploymentLoadingStep === idx;
                      const isDone = deploymentLoadingStep > idx;
                      const stepColor = isActive ? '#38bdf8' : isDone ? '#10b981' : '#484f58';
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 600, color: stepColor, background: isActive ? 'rgba(56,189,248,0.08)' : 'transparent', border: isActive ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent', whiteSpace: 'nowrap' }}>
                            <span>{isDone ? '✓' : step.icon}</span>
                            <span>{step.label}</span>
                            {isActive && <Dot color="#38bdf8" pulse />}
                          </div>
                          {idx < 3 && (
                            <div style={{ flex: 1, height: 1, background: isDone ? '#10b981' : 'rgba(255,255,255,0.06)', margin: '0 8px' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* EMPTY STATE */}
              {!isAnalyzingDeployment && !deploymentData && !deploymentError && (
                <div className="pc-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(56,189,248,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(56,189,248,0.2)', marginBottom: 8 }}>
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#38bdf8" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f0f6fc' }}>Ready for Deployment Analysis</h3>
                  <p style={{ fontSize: '0.82rem', color: '#8b949e', maxWidth: 450, lineHeight: 1.5 }}>
                    Enter a public GitHub repository URL above, choose Vercel, Netlify, or Railway, and click <strong>Analyze Deployment Risk</strong> to scan imports, detect client-side Node.js environment issues, and generate platform-specific remediation guidance.
                  </p>
                </div>
              )}

              {/* DEPLOYMENT READINESS DASHBOARD & GRAPH */}
              {!isAnalyzingDeployment && deploymentData && (
                <>
                  {/* DASHBOARD SECTION */}
                  <div className="pc-card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'stretch' }}>
                    
                    {/* Score and Stats */}
                    <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      <CircularProgress value={deploymentData.deploymentReadinessScore} />
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center', maxWidth: 180 }}>
                        Platform compatibility readiness index based on static analysis.
                      </span>
                      
                      {/* Stat Row */}
                      <div style={{ display: 'flex', gap: 14, marginTop: 16, width: '100%', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Files Scanned</span>
                          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-info)' }}>{deploymentData.filesCount ?? 0}</span>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', display: 'block' }}>parsed source files</span>
                        </div>
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Dependencies</span>
                          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-info)' }}>{deploymentData.dependenciesCount ?? 0}</span>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', display: 'block' }}>imports detected</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Conflicts list */}
                    <div style={{ flex: '2 1 450px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                          ⚠️ Platform Compatibility Issues ({deploymentData.conflicts.length})
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: '#8b949e' }}>Target: <strong style={{ color: '#38bdf8', textTransform: 'capitalize' }}>{targetPlatform}</strong></span>
                      </div>
                      
                      {deploymentData.conflicts.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: 20 }}>
                          <p style={{ fontSize: '0.8rem', color: '#a7f3d0', textAlign: 'center' }}>
                            🎉 Outstanding! No deployment conflicts or architectural compatibility issues were detected in this codebase.
                          </p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 280, paddingRight: 4 }}>
                          {(() => {
                            const sortedConflicts = [...deploymentData.explainedConflicts].sort((a, b) => {
                              const severityOrder = { high: 1, medium: 2, low: 3 };
                              const aVal = severityOrder[a.severity] || 4;
                              const bVal = severityOrder[b.severity] || 4;
                              return aVal - bVal;
                            });
                            
                            return sortedConflicts.map((c, idx) => {
                              const isOpen = expandedConflicts[idx] !== false; // Default to open
                              const badgeStyle = getSeverityColor(c.severity);
                              
                              return (
                                <div key={idx} style={{ background: 'rgba(5,8,16,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                                  {/* Card Header */}
                                  <div 
                                    onClick={() => toggleConflict(idx)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, marginRight: 12 }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: badgeStyle.bg, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}`, textTransform: 'uppercase' }}>
                                        {c.severity}
                                      </span>
                                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#c9d1d9', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                        {c.originalConflict?.filePath || 'Workspace'}
                                      </span>
                                      <span style={{ fontSize: '0.62rem', color: '#8b949e', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
                                        {c.originalConflict?.type || 'Configuration Issue'}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: '#8b949e', userSelect: 'none' }}>
                                      {isOpen ? '▲' : '▼'}
                                    </span>
                                  </div>
                                  
                                  {/* Card Body */}
                                  {isOpen && (
                                    <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.65rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700 }}>Platform Explanation</span>
                                        <p style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.45 }}>{c.platformSpecificExplanation}</p>
                                      </div>
                                      
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                                        <span style={{ fontSize: '0.65rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>Suggested Fix</span>
                                        <p style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 500, lineHeight: 1.45 }}>✓ {c.suggestedFix}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* GRAPH SECTION */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>02</span>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f0f6fc' }}>Static Code Dependency Graph</h3>
                    </div>
                    <div className="pc-card" style={{ padding: 12 }}>
                      <CodeDependencyGraph 
                        graph={deploymentData.graph} 
                        conflicts={deploymentData.conflicts} 
                        explainedConflicts={deploymentData.explainedConflicts} 
                      />
                    </div>
                  </div>

                  {/* CROSS-SYSTEM CORRELATION FINDINGS */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(56,189,248,0.15))', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.25)' }}>03</span>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f0f6fc' }}>🔗 Cross-System Findings</h3>
                      <span style={{ fontSize: '0.62rem', color: '#8b949e', fontStyle: 'italic', marginLeft: 'auto' }}>
                        Product Feedback × Code Conflicts
                      </span>
                    </div>

                    {/* Correlating Loading State */}
                    {isCorrelating && (
                      <div className="pc-card pc-fade-in" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'linear-gradient(135deg, rgba(167,139,250,0.04), rgba(56,189,248,0.04))', border: '1px solid rgba(167,139,250,0.15)' }}>
                        <div style={{ position: 'relative' }}>
                          <Spinner color="#c4b5fd" size={28} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#c4b5fd', marginBottom: 4 }}>Running Cross-System Correlation Engine</h4>
                          <p style={{ fontSize: '0.76rem', color: '#8b949e', lineHeight: 1.5 }}>
                            Analyzing feedback signals against deployment conflicts for causal connections...
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 28, marginTop: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', display: 'inline-block', animation: 'pcPulse 1.5s infinite' }} />
                            <span style={{ fontSize: '0.68rem', color: '#c4b5fd' }}>Feedback Nodes</span>
                          </div>
                          <span style={{ color: '#484f58', fontSize: '0.8rem', fontWeight: 800 }}>⇄</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', display: 'inline-block', animation: 'pcPulse 1.5s infinite 0.3s' }} />
                            <span style={{ fontSize: '0.68rem', color: '#38bdf8' }}>Code Conflicts</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Correlation Error */}
                    {correlationError && (
                      <div className="pc-card pc-fade-in" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1rem' }}>⚠️</span>
                        <div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fca5a5' }}>Correlation Engine Error</span>
                          <p style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: 2 }}>{correlationError}</p>
                        </div>
                      </div>
                    )}

                    {/* Waiting for both analyses */}
                    {!isCorrelating && !correlationData && !correlationError && (
                      <div className="pc-card" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>🔗</span>
                        <p style={{ fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.5, maxWidth: 420 }}>
                          Cross-system correlations will appear here once <strong style={{ color: '#c4b5fd' }}>Product Risk analysis</strong> and <strong style={{ color: '#38bdf8' }}>Deployment Risk analysis</strong> have both completed on the same repo.
                        </p>
                      </div>
                    )}

                    {/* No Correlations Found — honest signal */}
                    {correlationData && correlationData.noCorrelationsFound && (
                      <div className="pc-card pc-fade-in" style={{ padding: '2rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'rgba(16,185,129,0.03)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16,185,129,0.2)' }}>
                          <span style={{ fontSize: '1.1rem' }}>✅</span>
                        </div>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#a7f3d0' }}>No Strong Cross-System Correlations Detected</h4>
                        <p style={{ fontSize: '0.76rem', color: '#8b949e', maxWidth: 460, lineHeight: 1.5 }}>
                          The correlation engine found no high-confidence causal links between user feedback complaints and code-level deployment conflicts in this scan. This means feedback issues are likely unrelated to the technical conflicts detected, or the codebase is well-isolated.
                        </p>
                      </div>
                    )}

                    {/* Correlations Found — render cards */}
                    {correlationData && !correlationData.noCorrelationsFound && correlationData.correlations.length > 0 && (
                      <div className="pc-card pc-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, background: 'linear-gradient(135deg, rgba(167,139,250,0.03), rgba(56,189,248,0.03))', border: '1px solid rgba(167,139,250,0.12)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.85rem' }}>⚡</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f0f6fc' }}>
                              {correlationData.correlations.length} Causal Connection{correlationData.correlations.length !== 1 ? 's' : ''} Detected
                            </span>
                          </div>
                          <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 700, textTransform: 'uppercase' }}>
                            Cross-System
                          </span>
                        </div>

                        {correlationData.correlations.map((corr, idx) => {
                          const feedbackNode = nodes.find(n => n.id === corr.feedbackNodeId);
                          const confColor = corr.confidence === 'high' ? '#ef4444' : corr.confidence === 'medium' ? '#f59e0b' : '#3b82f6';
                          const confBg = corr.confidence === 'high' ? 'rgba(239,68,68,0.1)' : corr.confidence === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)';
                          const confBorder = corr.confidence === 'high' ? 'rgba(239,68,68,0.3)' : corr.confidence === 'medium' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)';

                          return (
                            <div key={idx} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', background: 'rgba(5,8,16,0.4)' }}>
                              {/* Connected Chips Row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '14px 16px', flexWrap: 'wrap' }}>
                                {/* Feedback Chip */}
                                <button
                                  onClick={() => {
                                    if (feedbackNode) {
                                      setActiveView('product-council');
                                      setTimeout(() => {
                                        setSelectedNode(feedbackNode);
                                        if (graph) {
                                          setImpactedNodeIds(getDownstreamNodeIds(feedbackNode.id, graph.edges));
                                        }
                                        highlightScroll(`node-card-${feedbackNode.id}`);
                                      }, 100);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 14px',
                                    borderRadius: '10px 4px 4px 10px',
                                    background: 'rgba(167,139,250,0.08)',
                                    border: '1px solid rgba(167,139,250,0.25)',
                                    cursor: feedbackNode ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                    maxWidth: '42%',
                                    minWidth: 0,
                                  }}
                                >
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                    <span style={{ fontSize: '0.58rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Feedback</span>
                                    <span style={{ fontSize: '0.72rem', color: '#c4b5fd', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{corr.feedbackNodeId}</span>
                                    {feedbackNode && (
                                      <span style={{ fontSize: '0.62rem', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'block', textAlign: 'left' }}>
                                        {feedbackNode.text.slice(0, 60)}{feedbackNode.text.length > 60 ? '...' : ''}
                                      </span>
                                    )}
                                  </div>
                                </button>

                                {/* Connecting Arrow */}
                                <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
                                  <div style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #a78bfa, #38bdf8)', borderRadius: 1 }} />
                                  <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #38bdf8' }} />
                                </div>

                                {/* Code Conflict Chip */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 14px',
                                    borderRadius: '4px 10px 10px 4px',
                                    background: 'rgba(56,189,248,0.08)',
                                    border: '1px solid rgba(56,189,248,0.25)',
                                    maxWidth: '42%',
                                    minWidth: 0,
                                  }}
                                >
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', flexShrink: 0 }} />
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                    <span style={{ fontSize: '0.58rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Code Conflict</span>
                                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'block' }}>
                                      {corr.relatedConflict}
                                    </span>
                                  </div>
                                </div>

                                {/* Confidence Badge */}
                                <div style={{ marginLeft: 'auto', paddingLeft: 8 }}>
                                  <span style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: 20,
                                    background: confBg,
                                    color: confColor,
                                    border: `1px solid ${confBorder}`,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {corr.confidence} confidence
                                  </span>
                                </div>
                              </div>

                              {/* Explanation */}
                              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}>
                                <p style={{ fontSize: '0.76rem', color: '#c9d1d9', lineHeight: 1.6, margin: 0 }}>
                                  {corr.explanation}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>

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

      {/* Negotiation Slide-In Panel */}
      {isNegotiationOpen && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsNegotiationOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(5, 8, 16, 0.75)',
              backdropFilter: 'blur(4px)',
              zIndex: 998,
              transition: 'opacity 0.3s ease'
            }}
          />
          
          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '480px',
            maxWidth: '100%',
            height: '100vh',
            backgroundColor: '#0d1117',
            borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            animation: 'pcSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#131922'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>⚖️</span>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f0f6fc' }}>Negotiation Simulator</h3>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#8b949e', marginTop: 2 }}>
                  Defending decision to cut: <span style={{ fontFamily: 'monospace', color: '#fb923c', fontWeight: 700 }}>{negotiationNode?.id}</span>
                </div>
              </div>
              <button 
                onClick={() => setIsNegotiationOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: '#8b949e',
                  fontSize: '0.9rem',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✕
              </button>
            </div>

            {/* Stance Meter */}
            <div style={{
              padding: '16px 20px',
              background: 'rgba(5, 8, 16, 0.4)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8b949e' }}>
                  Stakeholder Stance
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  background: stakeholderStance === 'reversed' ? 'rgba(52,211,153,0.12)' : stakeholderStance === 'softened' ? 'rgba(96,165,250,0.12)' : stakeholderStance === 'hardened' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)',
                  color: stakeholderStance === 'reversed' ? '#34d399' : stakeholderStance === 'softened' ? '#60a5fa' : stakeholderStance === 'hardened' ? '#ef4444' : '#fb923c'
                }}>
                  {stakeholderStance}
                </span>
              </div>

              {/* Slider Track */}
              <div style={{ position: 'relative', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', margin: '14px 0 6px 0' }}>
                <div style={{
                  position: 'absolute',
                  left: 0,
                  width: `${stakeholderStance === 'hardened' ? 10 : stakeholderStance === 'unchanged' ? 40 : stakeholderStance === 'softened' ? 70 : 100}%`,
                  height: '100%',
                  background: stakeholderStance === 'reversed' ? 'linear-gradient(90deg, #fb923c, #60a5fa, #34d399)' : stakeholderStance === 'softened' ? 'linear-gradient(90deg, #fb923c, #60a5fa)' : stakeholderStance === 'hardened' ? '#ef4444' : '#fb923c',
                  borderRadius: '3px',
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
                }} />
                
                {/* Pointer marker */}
                <div style={{
                  position: 'absolute',
                  left: `calc(${stakeholderStance === 'hardened' ? 10 : stakeholderStance === 'unchanged' ? 40 : stakeholderStance === 'softened' ? 70 : 100}% - 7px)`,
                  top: '-4px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 0 10px rgba(255, 255, 255, 0.9)',
                  border: '2px solid #0d1117',
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  zIndex: 2
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#484f58', fontWeight: 700, padding: '0 2px' }}>
                <span>😡 HARDENED</span>
                <span>NEUTRAL</span>
                <span>😌 SOFTENED</span>
                <span>🎉 REVERSED</span>
              </div>
            </div>

            {/* Conversation Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              background: '#0a0d14'
            }}>
              {/* Feature summary card inside chat */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 4
              }}>
                <div style={{ fontSize: '0.62rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 4 }}>Target Feature</div>
                <p style={{ fontSize: '0.78rem', color: '#c9d1d9', margin: 0, lineHeight: 1.4 }}>{negotiationNode?.text}</p>
              </div>

              {negotiationHistory.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div 
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      gap: 10,
                      alignItems: 'flex-start',
                      maxWidth: '85%',
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      animation: 'pcFadeIn 0.3s ease'
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isUser ? 'rgba(45,212,191,0.15)' : 'rgba(251,146,60,0.15)',
                      color: isUser ? '#2dd4bf' : '#fb923c',
                      border: `1px solid ${isUser ? 'rgba(45,212,191,0.3)' : 'rgba(251,146,60,0.3)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>
                      {isUser ? '👤' : '👔'}
                    </div>

                    {/* Bubble */}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: isUser ? 'rgba(45,212,191,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isUser ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      color: isUser ? '#e6fcf9' : '#c9d1d9',
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {/* Stakeholder Typing Loader */}
              {isNegotiating && (
                <div style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  maxWidth: '85%',
                  alignSelf: 'flex-start'
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'rgba(251,146,60,0.15)',
                    color: '#fb923c',
                    border: '1px solid rgba(251,146,60,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    flexShrink: 0
                  }}>
                    👔
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <span className="pc-dot pc-dot-1" style={{ background: '#fb923c', width: 5, height: 5, borderRadius: '50%' }} />
                    <span className="pc-dot pc-dot-2" style={{ background: '#fb923c', width: 5, height: 5, borderRadius: '50%' }} />
                    <span className="pc-dot pc-dot-3" style={{ background: '#fb923c', width: 5, height: 5, borderRadius: '50%' }} />
                  </div>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Error Banner */}
            {negotiationError && (
              <div style={{
                padding: '10px 16px',
                background: 'rgba(239,68,68,0.1)',
                borderTop: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171',
                fontSize: '0.72rem',
                fontWeight: 600
              }}>
                ⚠️ {negotiationError}
              </div>
            )}

            {/* Bottom Actions / Input */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#131922',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              {stakeholderStance === 'reversed' ? (
                /* Success banner */
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(52,211,153,0.12)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  color: '#34d399',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textAlign: 'center',
                  animation: 'pcFadeIn 0.4s ease'
                }}>
                  {"🎉 You've convinced the stakeholder — this item's verdict has been updated to Ship!"}
                </div>
              ) : (
                /* Text Input Box */
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={currentMessage}
                    onChange={e => setCurrentMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendNegotiationMessage();
                      }
                    }}
                    disabled={isNegotiating}
                    placeholder="Argue your case with specifics..."
                    style={{
                      flex: 1,
                      background: 'rgba(5, 8, 16, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      color: '#f0f6fc',
                      fontSize: '0.8rem',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                  />
                  <button
                    onClick={sendNegotiationMessage}
                    disabled={isNegotiating || !currentMessage.trim()}
                    style={{
                      background: isNegotiating || !currentMessage.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(45,212,191,0.15)',
                      border: `1px solid ${isNegotiating || !currentMessage.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(45,212,191,0.3)'}`,
                      color: isNegotiating || !currentMessage.trim() ? '#484f58' : '#2dd4bf',
                      padding: '0 16px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: isNegotiating || !currentMessage.trim() ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Slide-in slide animations keyframes */}
      <style>{`
        @keyframes pcSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pcFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
