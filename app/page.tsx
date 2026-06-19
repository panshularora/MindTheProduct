'use client';

import { useState } from 'react';
import { Node, GraphData, DebateLog, RoadmapItem } from '@/lib/types';

const STEPS = [
  { id: 1, name: 'Extracting Nodes', description: 'Parsing claims, assumptions, requirements, and feedback signals' },
  { id: 2, name: 'Building Graph', description: 'Forming dependency links and evaluating node freshness/staleness' },
  { id: 3, name: 'Running Agent Debate', description: 'Facilitating Growth vs Eng-Realist vs User-Advocate alignment' },
  { id: 4, name: 'Synthesizing Roadmap', description: 'Compiling priority ranks and drafting tactical rationale' },
];

const SAMPLE_PRD = `PRODUCT REQUIREMENT DOCUMENT: Real-time Collaborative Document Editor
Goal: Boost user retention and workspace engagement.
Key Claim: Adding real-time collaborative editing will increase monthly active user retention by 40%.
Assumption: Users want real-time cursors showing active typing positions for all document types (text, spreadsheet, notes).`;

const SAMPLE_FEATURE_REQUESTS = `FEATURE REQUESTS:
- WebSocket collaboration infrastructure for low-latency syncing.
- Multi-user editing component with color-coded user cursors.
- Document permissions and public shareable links.`;

const SAMPLE_FEEDBACK = `USER FEEDBACK SUMMARY:
- Customer feedback: "Real-time cursors are extremely annoying when several people are in the same document. It clutters the screen. We prefer threaded comment sections to communicate."
- User interview: "I just need a quick way to invite external clients to review my notes without forcing them to create an account."`;

export default function Home() {
  const [prd, setPrd] = useState('');
  const [featureRequests, setFeatureRequests] = useState('');
  const [feedback, setFeedback] = useState('');

  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  
  // Results states
  const [nodes, setNodes] = useState<Node[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [debateLogs, setDebateLogs] = useState<DebateLog[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleLoadSampleData = () => {
    setPrd(SAMPLE_PRD);
    setFeatureRequests(SAMPLE_FEATURE_REQUESTS);
    setFeedback(SAMPLE_FEEDBACK);
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setShowResults(false);
    setNodes([]);
    setGraph(null);
    setDebateLogs([]);
    setRoadmap([]);

    try {
      // Step 1: Extract
      setActiveStep(1);
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prd, featureRequests, feedback }),
      });
      if (!extractRes.ok) throw new Error('Failed in Node Extraction phase');
      const extractData = await extractRes.json();
      setNodes(extractData.nodes);

      // Step 2: Graph
      setActiveStep(2);
      const graphRes = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: extractData.nodes }),
      });
      if (!graphRes.ok) throw new Error('Failed in Graph Construction phase');
      const graphData = await graphRes.json();
      setGraph(graphData);

      // Step 3: Debate
      setActiveStep(3);
      const debateRes = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: graphData }),
      });
      if (!debateRes.ok) throw new Error('Failed in Agent Debate phase');
      const debateData = await debateRes.json();
      setDebateLogs(debateData.debateLogs);

      // Step 4: Synthesize
      setActiveStep(4);
      const synthRes = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: graphData, debateLogs: debateData.debateLogs }),
      });
      if (!synthRes.ok) throw new Error('Failed in Roadmap Synthesis phase');
      const synthData = await synthRes.json();
      setRoadmap(synthData.roadmap);

      setActiveStep(5); // Finished
      setShowResults(true);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred during analysis.');
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'prd': return 'bg-blue-900/40 text-blue-300 border-blue-800';
      case 'feature_request': return 'bg-amber-900/40 text-amber-300 border-amber-800';
      case 'feedback': return 'bg-purple-900/40 text-purple-300 border-purple-800';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'fresh': return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'stale': return 'bg-amber-950 text-amber-300 border-amber-800/80';
      case 'contested': return 'bg-rose-950 text-rose-300 border-rose-800';
      default: return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  const getPersonaBadgeColor = (persona: string) => {
    switch (persona) {
      case 'growth': return 'bg-sky-950 text-sky-300 border-sky-800';
      case 'eng_realist': return 'bg-slate-800 text-slate-200 border-slate-700';
      case 'user_advocate': return 'bg-violet-950 text-violet-300 border-violet-800';
      default: return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  const getPersonaName = (persona: string) => {
    switch (persona) {
      case 'growth': return 'Growth Optimist';
      case 'eng_realist': return 'Eng Realist';
      case 'user_advocate': return 'User Advocate';
      default: return persona;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-teal-500/30 selection:text-teal-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/10">
              <svg className="w-6 h-6 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Product Council AI
              </h1>
              <p className="text-xs text-slate-400">4-Stage AI Pipeline for Strategic Feature Alignment</p>
            </div>
          </div>
          <button
            onClick={handleLoadSampleData}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-all"
          >
            Load Sample Data
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Input Forms */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center space-x-2">
            <span>Inputs Configuration</span>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="flex flex-col space-y-2">
              <label htmlFor="prd-input" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Paste your PRD
              </label>
              <textarea
                id="prd-input"
                rows={7}
                value={prd}
                onChange={(e) => setPrd(e.target.value)}
                placeholder="Paste key claims, metrics, and core assumptions from your Product Requirement Document..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300 placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all font-mono"
              />
            </div>

            <div className="flex flex-col space-y-2">
              <label htmlFor="features-input" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Paste Feature Requests
              </label>
              <textarea
                id="features-input"
                rows={7}
                value={featureRequests}
                onChange={(e) => setFeatureRequests(e.target.value)}
                placeholder="Paste product ideas, backlog requirements, or technical specs..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300 placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all font-mono"
              />
            </div>

            <div className="flex flex-col space-y-2">
              <label htmlFor="feedback-input" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Paste User Feedback
              </label>
              <textarea
                id="feedback-input"
                rows={7}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Paste raw customer interview notes, Support tickets, or App Store reviews..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300 placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all font-mono"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={runAnalysis}
              disabled={loading || !prd.trim() || !featureRequests.trim() || !feedback.trim()}
              className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center space-x-2 border border-teal-400/20 ${
                loading || !prd.trim() || !featureRequests.trim() || !feedback.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-transparent'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 hover:from-teal-400 hover:to-emerald-300 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Run Pipeline Analysis</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-200 text-sm flex items-center space-x-3">
            <svg className="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Loading Pipeline Steps */}
        {loading && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 shadow-inner max-w-2xl mx-auto space-y-6">
            <h3 className="text-center text-sm font-semibold tracking-wider text-slate-400 uppercase">
              AI Decision Council Running
            </h3>
            <div className="relative">
              {/* Central connection line */}
              <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-800" />

              <div className="space-y-6 relative">
                {STEPS.map((step) => {
                  const isActive = activeStep === step.id;
                  const isCompleted = activeStep > step.id;

                  return (
                    <div key={step.id} className="flex items-start space-x-4 transition-opacity duration-300">
                      <div className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
                        isActive
                          ? 'bg-teal-500/20 border-teal-400 text-teal-400 shadow-lg shadow-teal-400/10 scale-105'
                          : isCompleted
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'bg-slate-950 border-slate-800 text-slate-600'
                      }`}>
                        {isCompleted ? (
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isActive ? (
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                          </span>
                        ) : (
                          <span className="text-sm font-bold">{step.id}</span>
                        )}
                      </div>
                      <div className="pt-1.5">
                        <p className={`text-sm font-semibold transition-colors ${
                          isActive ? 'text-teal-400' : isCompleted ? 'text-slate-200' : 'text-slate-500'
                        }`}>
                          {step.name}
                        </p>
                        <p className="text-xs text-slate-400/80 mt-0.5">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Results Sections */}
        {showResults && (
          <div className="space-y-8 animate-fadeIn">
            {/* Stage 1 & 2: Nodes & Dependency Graph */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Extraction list */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-[500px]">
                <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400" />
                  <span>Stage 1: Extracted Structured Nodes</span>
                </h3>
                <div className="overflow-y-auto pr-2 space-y-4 flex-1">
                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className={`p-4 rounded-xl border transition-all ${
                        node.status === 'contested'
                          ? 'bg-rose-950/20 border-rose-900/40 hover:border-rose-800'
                          : node.status === 'stale'
                          ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-800'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                            {node.id}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded ${getSourceBadgeColor(node.source)}`}>
                            {node.source}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {(node.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${getStatusBadgeColor(node.status)}`}>
                          {node.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200">{node.text}</p>
                      <div className="mt-2 text-[10px] font-mono text-slate-400">
                        Type: <span className="text-slate-300 font-semibold">{node.type}</span>
                        {node.dependsOn.length > 0 && (
                          <span className="ml-2">
                            Depends on: <span className="text-teal-400">{node.dependsOn.join(', ')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dependency Graph visual list */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-[500px]">
                <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Stage 2: Dependency Graph & Conflicts</span>
                </h3>
                <div className="overflow-y-auto pr-2 space-y-4 flex-1">
                  {graph?.edges && graph.edges.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                        The pipeline identified requirements linked to assumptions, mapping potential contradictions.
                      </div>
                      <div className="space-y-3">
                        {graph.edges.map((edge, index) => {
                          const fromNode = nodes.find(n => n.id === edge.from);
                          const toNode = nodes.find(n => n.id === edge.to);

                          return (
                            <div key={index} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden">
                              {/* Highlight red-ish if a contested node is involved */}
                              {(fromNode?.status === 'contested' || toNode?.status === 'contested') && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
                              )}
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSourceBadgeColor(fromNode?.source || '')}`}>
                                  {fromNode?.source.toUpperCase()}
                                </span>
                                <span className="text-xs font-mono text-slate-300">{edge.from}</span>
                                <span className="text-slate-500">→</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSourceBadgeColor(toNode?.source || '')}`}>
                                  {toNode?.source.toUpperCase()}
                                </span>
                                <span className="text-xs font-mono text-slate-300">{edge.to}</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/40">
                                  <span className="text-slate-400 font-bold block text-[10px] uppercase mb-1">Source Node ({edge.from})</span>
                                  <span className="text-slate-300 line-clamp-2">{fromNode?.text}</span>
                                </div>
                                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/40">
                                  <span className="text-slate-400 font-bold block text-[10px] uppercase mb-1">Target Node ({edge.to})</span>
                                  <span className="text-slate-300 line-clamp-2">{toNode?.text}</span>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center space-x-2 text-[10px]">
                                <span className="text-slate-400">Impact:</span>
                                {toNode?.status === 'stale' ? (
                                  <span className="text-amber-400 font-medium">Target node marked STALE due to dependency resolution.</span>
                                ) : fromNode?.status === 'contested' ? (
                                  <span className="text-rose-400 font-medium">Contested Node triggers active agent review.</span>
                                ) : (
                                  <span className="text-slate-400">Normal Dependency</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                      No dependency links resolved.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stage 3: Sequential Agent Debate */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <h3 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                <span>Stage 3: 3-Agent Alignment Debate Logs</span>
              </h3>

              <div className="space-y-6">
                {debateLogs.map((log, index) => {
                  const disputedNode = nodes.find(n => n.id === log.nodeId);
                  return (
                    <div key={index} className="space-y-4">
                      <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-950 border border-rose-800 flex items-center justify-center flex-shrink-0 text-rose-300 font-mono text-xs">
                          !
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Debate Topic: Contested Item ({log.nodeId})</p>
                          <p className="text-sm text-slate-200 mt-1">{disputedNode?.text}</p>
                        </div>
                      </div>

                      <div className="space-y-4 pl-4 border-l border-slate-800">
                        {log.turns.map((turn, turnIdx) => (
                          <div key={turnIdx} className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getPersonaBadgeColor(turn.persona)}`}>
                                {getPersonaName(turn.persona)}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Round {turn.round} {turn.respondingTo ? `(Responding to ${getPersonaName(turn.respondingTo)})` : ''}
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 italic leading-relaxed">&ldquo;{turn.text}&rdquo;</p>
                          </div>
                        ))}
                      </div>

                      {/* Debate Verdict */}
                      <div className="p-4 rounded-xl border border-teal-800/40 bg-teal-950/20 text-teal-300 text-sm">
                        <p className="text-xs font-bold uppercase tracking-wider text-teal-400 mb-1">Debate Verdict</p>
                        <p>{log.verdict}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Stage 4: Synthesized Roadmap */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <h3 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Stage 4: Synthesized & Ranked Roadmap</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {roadmap.map((item) => (
                  <div key={item.id} className="bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-5 flex flex-col h-full relative overflow-hidden transition-all">
                    {/* Rank Indicator */}
                    <div className="absolute top-0 right-0 w-12 h-12 bg-slate-900 border-b border-l border-slate-800 flex items-center justify-center text-sm font-bold text-teal-400 font-mono">
                      #{item.rank}
                    </div>

                    <div className="pr-10 mb-4">
                      <h4 className="font-bold text-slate-200 text-sm">{item.title}</h4>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">{item.id}</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Strategic Rationale</p>
                        <p className="text-xs text-slate-300 leading-relaxed">{item.rationale}</p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-900">
                        {item.sourceNodes.length > 0 && (
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Source Nodes:</span>
                            {item.sourceNodes.map(nodeId => (
                              <span key={nodeId} className="text-[9px] font-mono text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                {nodeId}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.relatedDebate.length > 0 && (
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Debates:</span>
                            {item.relatedDebate.map(nodeId => (
                              <span key={nodeId} className="text-[9px] font-mono text-rose-300 bg-rose-950/20 border border-rose-900/30 px-1.5 py-0.5 rounded">
                                {nodeId}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
