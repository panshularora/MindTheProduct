import { Node, DebateLog } from '@/lib/types';
import { Conflict } from '@/lib/code-graph';

export interface RadarAxis {
  key: string;
  label: string;
  /** 0-100 score, or null if data source hasn't been computed yet */
  score: number | null;
  /** Human explanation of what drove this score */
  rationale: string;
  /** If true, this axis has limited/incomplete data */
  limitedData: boolean;
}

export interface RiskRadarData {
  axes: RadarAxis[];
  /** Weighted overall score 0-100, or null if fewer than 2 axes have data */
  overallScore: number | null;
}

/**
 * Derives 6 normalized 0-100 "risk" scores from existing application state.
 * Higher = healthier/better. Lower = more risk.
 * Each score gracefully defaults to null if source data is unavailable.
 */
export function computeRiskRadar(inputs: {
  nodes: Node[];
  debateLogs: DebateLog[];
  deploymentReadinessScore: number | null;
  conflicts: Conflict[] | null;
  codeGraphNodeCount: number | null;
}): RiskRadarData {
  const { nodes, debateLogs, deploymentReadinessScore, conflicts, codeGraphNodeCount } = inputs;

  const hasProductData = nodes.length > 0;
  const hasDeploymentData = deploymentReadinessScore !== null;
  const hasDebateData = debateLogs.length > 0;

  // --- 1. Technical Debt ---
  // Inverted deploymentReadinessScore + conflict severity weight
  let technicalDebt: RadarAxis;
  if (hasDeploymentData && conflicts !== null) {
    let score = deploymentReadinessScore!;
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const medCount = conflicts.filter(c => c.severity === 'medium').length;
    const penalty = Math.min(30, highCount * 12 + medCount * 5);
    score = Math.max(0, score - penalty);

    const severityBreakdown = `${highCount} high, ${medCount} medium severity issues`;
    technicalDebt = {
      key: 'technical_debt',
      label: 'Technical Health',
      score: Math.round(score),
      rationale: conflicts.length === 0
        ? 'No technical conflicts detected.'
        : `Readiness ${deploymentReadinessScore}%, degraded by ${severityBreakdown}.`,
      limitedData: false,
    };
  } else {
    technicalDebt = {
      key: 'technical_debt',
      label: 'Technical Health',
      score: null,
      rationale: 'Run Deployment Intelligence to compute.',
      limitedData: true,
    };
  }

  // --- 2. Team Health ---
  let teamHealth: RadarAxis;
  if (hasDeploymentData && codeGraphNodeCount !== null && codeGraphNodeCount > 0 && conflicts !== null) {
    const lowRatio = conflicts.length > 0
      ? conflicts.filter(c => c.severity === 'low').length / conflicts.length
      : 1;
    const score = Math.round(50 + lowRatio * 30 + (conflicts.length === 0 ? 20 : 0));
    teamHealth = {
      key: 'team_health',
      label: 'Team Health',
      score: Math.min(100, score),
      rationale: conflicts.length === 0
        ? 'Codebase well-maintained with no conflicts.'
        : `${Math.round(lowRatio * 100)}% of conflicts are low-severity.`,
      limitedData: true,
    };
  } else {
    teamHealth = {
      key: 'team_health',
      label: 'Team Health',
      score: null,
      rationale: 'Requires deployment analysis or org chart data.',
      limitedData: true,
    };
  }

  // --- 3. Feedback Severity ---
  let feedbackSeverity: RadarAxis;
  if (hasProductData) {
    const feedbackNodes = nodes.filter(n => n.type === 'feedback_signal' || n.source === 'feedback');
    if (feedbackNodes.length > 0) {
      const freshFeedback = feedbackNodes.filter(n => n.status === 'fresh').length;
      const avgConfidence = feedbackNodes.reduce((s, n) => s + n.confidence, 0) / feedbackNodes.length;
      const freshnessRatio = freshFeedback / feedbackNodes.length;
      const score = Math.round(freshnessRatio * 60 + avgConfidence * 40);

      const staleCount = feedbackNodes.filter(n => n.status === 'stale').length;
      const contestedCount = feedbackNodes.filter(n => n.status === 'contested').length;
      feedbackSeverity = {
        key: 'feedback_severity',
        label: 'Feedback Health',
        score: Math.min(100, Math.max(0, score)),
        rationale: staleCount + contestedCount > 0
          ? `${staleCount} stale, ${contestedCount} contested of ${feedbackNodes.length} signals.`
          : `All ${feedbackNodes.length} feedback signals validated.`,
        limitedData: false,
      };
    } else {
      feedbackSeverity = {
        key: 'feedback_severity',
        label: 'Feedback Health',
        score: 50,
        rationale: 'No feedback signals were extracted.',
        limitedData: true,
      };
    }
  } else {
    feedbackSeverity = {
      key: 'feedback_severity',
      label: 'Feedback Health',
      score: null,
      rationale: 'Run Product Council to extract feedback signals.',
      limitedData: true,
    };
  }

  // --- 4. Deployment Risk ---
  let deploymentRisk: RadarAxis;
  if (hasDeploymentData && conflicts !== null) {
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const medCount = conflicts.filter(c => c.severity === 'medium').length;
    const lowCount = conflicts.filter(c => c.severity === 'low').length;
    const totalPenalty = Math.min(100, highCount * 25 + medCount * 12 + lowCount * 4);
    const score = 100 - totalPenalty;

    deploymentRisk = {
      key: 'deployment_risk',
      label: 'Deploy Safety',
      score: Math.max(0, score),
      rationale: conflicts.length === 0
        ? 'No deployment conflicts — clear for launch.'
        : `${highCount} critical, ${medCount} warning, ${lowCount} info-level issues.`,
      limitedData: false,
    };
  } else {
    deploymentRisk = {
      key: 'deployment_risk',
      label: 'Deploy Safety',
      score: null,
      rationale: 'Run Deployment Intelligence to assess.',
      limitedData: true,
    };
  }

  // --- 5. Decision Velocity ---
  let decisionVelocity: RadarAxis;
  if (hasDebateData) {
    let totalTension = 0;
    for (const log of debateLogs) {
      const turnCount = log.turns.length;
      const verdict = log.verdict?.toLowerCase() || '';
      let tension = Math.min(1, turnCount / 9);
      if (verdict.startsWith('cut')) tension = Math.max(tension, 0.9);
      else if (verdict.startsWith('modify')) tension = Math.max(tension, 0.5);
      else if (verdict.startsWith('proceed')) tension = Math.min(tension, 0.3);
      totalTension += tension;
    }
    const avgTension = totalTension / debateLogs.length;
    const score = Math.round((1 - avgTension) * 100);

    const cutCount = debateLogs.filter(l => l.verdict?.toLowerCase().startsWith('cut')).length;
    const modCount = debateLogs.filter(l => l.verdict?.toLowerCase().startsWith('modify')).length;
    decisionVelocity = {
      key: 'decision_velocity',
      label: 'Decision Speed',
      score: Math.min(100, Math.max(0, score)),
      rationale: `${debateLogs.length} debates: ${cutCount} cut, ${modCount} modify — ${avgTension > 0.6 ? 'high' : avgTension > 0.3 ? 'moderate' : 'low'} tension.`,
      limitedData: false,
    };
  } else {
    decisionVelocity = {
      key: 'decision_velocity',
      label: 'Decision Speed',
      score: null,
      rationale: 'Run Product Council debate stage to measure.',
      limitedData: true,
    };
  }

  // --- 6. Assumption Freshness ---
  let assumptionFreshness: RadarAxis;
  if (hasProductData) {
    const freshCount = nodes.filter(n => n.status === 'fresh').length;
    const score = Math.round((freshCount / nodes.length) * 100);

    const staleCount = nodes.filter(n => n.status === 'stale').length;
    const contestedCount = nodes.filter(n => n.status === 'contested').length;
    assumptionFreshness = {
      key: 'assumption_freshness',
      label: 'Assumption Health',
      score,
      rationale: `${freshCount}/${nodes.length} validated (${staleCount} stale, ${contestedCount} contested).`,
      limitedData: false,
    };
  } else {
    assumptionFreshness = {
      key: 'assumption_freshness',
      label: 'Assumption Health',
      score: null,
      rationale: 'Run Product Council extraction to assess.',
      limitedData: true,
    };
  }

  const axes: RadarAxis[] = [
    technicalDebt,
    feedbackSeverity,
    deploymentRisk,
    decisionVelocity,
    assumptionFreshness,
    teamHealth,
  ];

  const available = axes.filter(a => a.score !== null);
  const overallScore = available.length >= 2
    ? Math.round(available.reduce((s, a) => s + a.score!, 0) / available.length)
    : null;

  return { axes, overallScore };
}
