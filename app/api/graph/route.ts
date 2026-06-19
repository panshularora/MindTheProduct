import { NextResponse } from 'next/server';
import { Node, GraphData } from '@/lib/types';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nodes } = body;

    if (!nodes || !Array.isArray(nodes)) {
      return NextResponse.json(
        { error: 'Missing required input: nodes array must be provided.' },
        { status: 400 }
      );
    }

    const prompt = `You are a product reasoning agent. Analyze these product nodes holistically.

Nodes: ${JSON.stringify(nodes, null, 2)}

Tasks:
1. Determine dependsOn relationships (which requirements depend on which assumptions/claims)
2. Detect staleness: mark status as 'stale' (directly contradicted by feedback), 'contested' (tension between feedback and PRD), or 'fresh'
3. Build edges list from dependsOn relationships

Return ONLY valid JSON:
{"nodes":[{"id":"n1","type":"claim","text":"...","source":"prd","confidence":0.9,"dependsOn":["n2"],"status":"fresh"}],"edges":[{"from":"n2","to":"n1"}]}`;

    let text = '';
    let parsed: GraphData | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const attemptPrompt = attempts === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no markdown, no text.`;
        
        text = await callLLMUnified({
          prompt: attemptPrompt,
          jsonMode: true,
          temperature: 0,
          maxTokens: 4000
        });

        text = text.trim();

        parsed = cleanAndParseJSON(text);
        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('Invalid JSON structure: missing nodes or edges array.');
        }
        break;
      } catch (parseError: unknown) {
        console.warn(`Graph API attempt ${attempts} failed.`, parseError);
        if (attempts >= maxAttempts) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error('LLM response was not valid JSON: ' + parseMsg);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error('Failed to generate dependency graph: malformed AI response.');
    }

    const validatedNodes: Node[] = parsed.nodes.map((node: Partial<Node>, idx: number) => {
      const type = (node.type && ['claim', 'assumption', 'requirement', 'feedback_signal'].includes(node.type))
        ? (node.type as 'claim' | 'assumption' | 'requirement' | 'feedback_signal')
        : 'claim';
      const source = (node.source && ['prd', 'feature_request', 'feedback'].includes(node.source))
        ? (node.source as 'prd' | 'feature_request' | 'feedback')
        : 'prd';
      const status = (node.status && ['fresh', 'stale', 'contested'].includes(node.status))
        ? (node.status as 'fresh' | 'stale' | 'contested')
        : 'fresh';

      return {
        id: node.id || `n${idx + 1}`,
        type,
        text: node.text || '',
        source,
        confidence: typeof node.confidence === 'number' ? node.confidence : 1.0,
        dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [],
        status
      } as Node;
    });

    const validatedEdges = parsed.edges.map((edge: Partial<{ from: string; to: string }>) => ({
      from: String(edge.from || ''),
      to: String(edge.to || '')
    })).filter(edge => edge.from && edge.to);

    return NextResponse.json({
      nodes: validatedNodes,
      edges: validatedEdges
    });
  } catch (error: unknown) {
    console.error('Graph API error:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred during graph analysis.';
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
