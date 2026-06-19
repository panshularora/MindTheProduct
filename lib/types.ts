export interface Node {
  id: string;
  type: 'claim' | 'assumption' | 'requirement' | 'feedback_signal';
  text: string;
  source: 'prd' | 'feature_request' | 'feedback';
  confidence: number;
  dependsOn: string[];
  status: 'fresh' | 'stale' | 'contested';
  previousConfidence?: number; // for tracking changes
}

export interface GraphData {
  nodes: Node[];
  edges: {
    from: string;
    to: string;
  }[];
}

export interface DebateTurn {
  persona: 'growth' | 'eng_realist' | 'user_advocate';
  round: number;
  text: string;
  respondingTo: string | null;
}

export interface DebateLog {
  nodeId: string;
  turns: DebateTurn[];
  verdict: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  rank: number;
  rationale: string;
  relatedDebate: string[]; // references nodeId
  sourceNodes: string[]; // references nodeId
}

export interface ExecutiveSummary {
  topRisk: string;
  topOpportunity: string;
  contestedDecision: string;
  nextAction: string;
  riskScore: number; // 0-10
  opportunityScore: number; // 0-10
  alignmentScore: number; // 0-100
}
