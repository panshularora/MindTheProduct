import { NextResponse } from 'next/server';
import { RoadmapItem } from '@/lib/types';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

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
Return ONLY a valid JSON array matching this exact shape:
[
  {
    "id": "r1",
    "title": "Roadmap item title",
    "rank": 1,
    "rationale": "Detailed rationale text summarizing why this is priority #1, referencing the debate verdict for node-X and user feedback signals node-Y...",
    "relatedDebate": ["node-X"],
    "sourceNodes": ["node-Y", "node-Z"]
  }
]

Do not include conversational text, preambles, or markdown formatting blocks.`;

    let text = '';
    let parsed: unknown = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const attemptPrompt = attempts === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous response failed to parse as valid JSON. Please ensure your response is absolutely valid JSON matching the schema, with no leading or trailing text, markdown formatting, or preamble.`;

        text = await callLLMUnified({
          prompt: attemptPrompt,
          jsonMode: true,
          temperature: 0,
          maxTokens: 4000
        });

        text = text.trim();

        parsed = cleanAndParseJSON(text);
        
        if (Array.isArray(parsed)) {
          // Valid array structure
        } else if (parsed && typeof parsed === 'object' && 'roadmap' in parsed && Array.isArray((parsed as { roadmap: unknown }).roadmap)) {
          // Valid object containing roadmap array
        } else if (parsed && typeof parsed === 'object') {
          // Groq json_object mode might wrap the array in a key - find the first array value
          const values = Object.values(parsed as Record<string, unknown>);
          const firstArray = values.find(v => Array.isArray(v));
          if (firstArray) {
            parsed = firstArray;
          } else {
            throw new Error('Invalid JSON structure: expected a JSON array or an object containing a roadmap array.');
          }
        } else {
          throw new Error('Invalid JSON structure: expected a JSON array or an object containing a roadmap array.');
        }
        break; // Parse and check succeeded! Exit loop.
      } catch (parseError: unknown) {
        console.warn(`Synthesize API JSON parsing attempt ${attempts} failed.`, parseError);
        if (attempts >= maxAttempts) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error('LLM response was not valid JSON: ' + parseMsg);
        }
      }
    }

    let itemsArray: unknown[] = [];
    if (Array.isArray(parsed)) {
      itemsArray = parsed;
    } else if (parsed && typeof parsed === 'object' && 'roadmap' in parsed && Array.isArray((parsed as { roadmap: unknown }).roadmap)) {
      itemsArray = (parsed as { roadmap: unknown[] }).roadmap;
    } else {
      throw new Error('Invalid JSON structure: expected a JSON array or an object containing a roadmap array.');
    }

    // Validate roadmap items
    const validatedRoadmap: RoadmapItem[] = itemsArray.map((rawItem: unknown, idx: number) => {
      const item = (rawItem || {}) as Partial<RoadmapItem>;
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
