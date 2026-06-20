import { NextResponse } from 'next/server';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { feedbackNodes, codeConflicts, envVarsReferenced } = body;

    if (!feedbackNodes || !codeConflicts) {
      return NextResponse.json({ error: 'Missing feedbackNodes or codeConflicts parameter.' }, { status: 400 });
    }

    const prompt = `You are a deployment and product risk correlation engine.
You will receive two independently-generated datasets: user feedback signals from a product analysis, and code-level technical findings (conflicts) from a deployment analysis.
Your job is to find genuine, specific, plausible causal connections between them.
For example:
- A feedback complaint about a specific broken behavior (e.g., billing refund failures or Stripe payouts issue) that could be explained by a specific missing environment variable (e.g. STRIPE_SECRET_KEY missing from .env.example) or package mismatch.
- A feedback complaint about the application crashing or repeating links (e.g. the chatbot module failing) that matches a client-side Node.js built-in module import (e.g. 'fs' or 'path' imported in a client component components/RoadmapView.tsx).
- Outdated dependency issues that directly relate to user complaints about performance or browser incompatibilities.

ONLY report a connection if there is a real, specific, and highly plausible link. If you find none, explicitly set "noCorrelationsFound": true rather than forcing a weak or vague match. Do not invent technical details not present in the provided data.

Dataset 1: User Feedback Nodes
${JSON.stringify(feedbackNodes, null, 2)}

Dataset 2: Code-Level Technical Conflicts
${JSON.stringify(codeConflicts, null, 2)}

Dataset 3: Environment Variables Referenced in Code
${JSON.stringify(envVarsReferenced || [], null, 2)}

Return ONLY valid JSON matching this format:
{
  "correlations": [
    {
      "feedbackNodeId": "string (the exact ID of the feedback node, e.g., 'n8')",
      "relatedConflict": "string (the file path or conflict type, e.g., 'components/RoadmapView.tsx' or 'MISSING_ENV_VAR')",
      "confidence": "high" | "medium" | "low",
      "explanation": "Provide a concrete, specific description explaining how the technical code conflict or missing configuration directly explains or causes the user feedback symptom."
    }
  ],
  "noCorrelationsFound": boolean
}
Do not include any markdown formatting blocks like \`\`\`json outside the JSON object. Just the raw JSON.`;

    let correlations = [];
    let noCorrelationsFound = true;

    try {
      const text = await callLLMUnified({ prompt, jsonMode: true, temperature: 0.2 });
      const parsed = cleanAndParseJSON(text);
      if (parsed && typeof parsed === 'object') {
        correlations = parsed.correlations || [];
        noCorrelationsFound = parsed.noCorrelationsFound ?? (correlations.length === 0);
      }
    } catch (err: unknown) {
      console.error('Correlation LLM error:', err);
      noCorrelationsFound = true;
    }

    return NextResponse.json({
      correlations,
      noCorrelationsFound
    });

  } catch (error: unknown) {
    console.error('Correlate endpoint error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
