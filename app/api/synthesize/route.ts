import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { RoadmapItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { graphData, debateLogs, originalFeatureRequests } = body;

    if (!graphData || !debateLogs || !originalFeatureRequests) {
      return NextResponse.json(
        { error: 'Missing required input parameters: graphData, debateLogs, and originalFeatureRequests are required.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key is not configured.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = `You are a principal product strategist. Your task is to synthesize the results of a 4-stage product alignment analysis to construct a ranked, prioritized product roadmap.

Input Context:
1. Product Dependency Graph Nodes & Connections:
${JSON.stringify(graphData.nodes, null, 2)}
Edges (dependsOn connections):
${JSON.stringify(graphData.edges, null, 2)}

2. Persona Debate Logs & Verdicts (Alignment Decisions on Contested/Stale Nodes):
${JSON.stringify(debateLogs, null, 2)}

3. Original Feature Requests:
"${originalFeatureRequests}"

Task Instructions:
- Formulate a prioritized roadmap containing 3 to 6 logical items.
- Rank the items in order of priority (Rank #1 is the highest priority, then #2, #3, etc.) balancing customer demand, business opportunity, and engineering complexity/risks.
- For each item:
  * Assign a unique ID like "r1", "r2", etc.
  * Provide a clear title.
  * Write a detailed "rationale" explaining why it has this rank. The rationale must explicitly cite which debate verdicts and source feedback nodes influenced this decision.
  * Populate "relatedDebate" with an array of node IDs that had active debates related to this item.
  * Populate "sourceNodes" with an array of node IDs (e.g. feedback signals, requirements, or claims) that support or inform this item.

Output Format:
Return ONLY a valid JSON object matching this exact shape:
{
  "roadmap": [
    {
      "id": "r1",
      "title": "Roadmap item title",
      "rank": 1,
      "rationale": "Detailed rationale text summarizing why this is priority #1, referencing the debate verdict for node-X and user feedback signals node-Y...",
      "relatedDebate": ["node-X"],
      "sourceNodes": ["node-Y", "node-Z"]
    }
  ]
}

Do not include conversational text, preambles, or markdown formatting blocks.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Anthropic API returned a non-text response.');
    }

    let text = responseContent.text.trim();

    // Strip markdown code fences if present
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n?/, '');
      text = text.replace(/\n?```$/, '');
      text = text.trim();
    }

    let parsed: { roadmap: RoadmapItem[] };
    try {
      parsed = JSON.parse(text);
    } catch (parseError: unknown) {
      console.error('Failed to parse Claude JSON response. Raw text:', text);
      const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error('Claude response was not valid JSON: ' + parseMsg);
    }

    if (!parsed || !Array.isArray(parsed.roadmap)) {
      throw new Error('Invalid JSON structure: missing roadmap array.');
    }

    // Validate roadmap items
    const validatedRoadmap: RoadmapItem[] = parsed.roadmap.map((item: Partial<RoadmapItem>, idx: number) => {
      return {
        id: item.id || `r${idx + 1}`,
        title: item.title || 'Roadmap Item',
        rank: typeof item.rank === 'number' ? item.rank : idx + 1,
        rationale: item.rationale || '',
        relatedDebate: Array.isArray(item.relatedDebate) ? item.relatedDebate : [],
        sourceNodes: Array.isArray(item.sourceNodes) ? item.sourceNodes : []
      } as RoadmapItem;
    });

    return NextResponse.json({ roadmap: validatedRoadmap });
  } catch (error: unknown) {
    console.error('Synthesize API error:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred during synthesis.';
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
