import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { Node, GraphData } from '@/lib/types';

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

    const groqKey = process.env.GROQ_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!groqKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'Server API key is not configured. Please set GROQ_API_KEY or ANTHROPIC_API_KEY in the Vercel dashboard.' },
        { status: 500 }
      );
    }

    const groq = groqKey ? new Groq({ apiKey: groqKey, timeout: 25000 }) : null;
    const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey, timeout: 25000 }) : null;

    const prompt = `You are a product reasoning agent specializing in dependency graph mapping and conflict resolution.
You will be provided with an array of product nodes (claims, assumptions, requirements, and feedback signals).

Your task is to analyze these nodes holistically to:
1. Identify dependency relationships ("dependsOn"):
   - Decide which requirements depend on which assumptions or claims.
   - Decide which assumptions depend on which claims.
   - Populate the "dependsOn" array of each node with the parent node ID(s) it depends on.
2. Evaluate feedback contradictions:
   - Check if any "feedback_signal" node (source = 'feedback') contradicts, undermines, or opposes a node sourced from 'prd' or 'feature_request'.
   - Classify the "status" of each node:
     * 'stale': The node is directly contradicted, invalidated, or rejected by user feedback (e.g. feedback shows users explicitly dislike or do not want it).
     * 'contested': The feedback and PRD/feature request disagree, but neither is clearly incorrect (representing a tension, trade-off, or differing views).
     * 'fresh': The node is not contradicted or undermined by any feedback signals.
3. Build the flattened "edges" list representing dependency links:
   - For every dependency link (where node B depends on node A), create an edge object: { "from": "A", "to": "B" }. 
   - Note: Edges must only represent the "dependsOn" links.

Here is the input array of nodes:
${JSON.stringify(nodes, null, 2)}

Output Format:
You must respond ONLY with a valid JSON object matching this exact shape:
{
  "nodes": [
    {
      "id": "n1",
      "type": "claim",
      "text": "...",
      "source": "prd",
      "confidence": 0.9,
      "dependsOn": ["n2"],
      "status": "fresh"
    }
  ],
  "edges": [
    {
      "from": "n2",
      "to": "n1"
    }
  ]
}

Ensure all nodes from the input are returned in the output with their status and dependsOn updated. Do not introduce any text other than the JSON object. Do not include markdown code blocks.`;

    let text = '';
    let parsed: GraphData | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        if (groq) {
          const completion = await groq.chat.completions.create({
            model: 'llama3-70b-8192',
            messages: [
              {
                role: 'user',
                content: attempts === 1
                  ? prompt
                  : `${prompt}\n\nIMPORTANT: Your previous response failed to parse as valid JSON. Please ensure your response is absolutely valid JSON matching the schema, with no leading or trailing text, markdown formatting, or preamble.`
              }
            ],
            temperature: 0,
            response_format: { type: 'json_object' }
          });
          text = completion.choices[0]?.message?.content || '';
        } else if (anthropic) {
          const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: attempts === 1
                  ? prompt
                  : `${prompt}\n\nIMPORTANT: Your previous response failed to parse as valid JSON. Please ensure your response is absolutely valid JSON matching the schema, with no leading or trailing text, markdown formatting, or preamble.`
              }
            ]
          });

          const responseContent = message.content[0];
          if (responseContent.type !== 'text') {
            throw new Error('Anthropic API returned a non-text response.');
          }
          text = responseContent.text;
        }

        text = text.trim();

        // Strip markdown code fences if present
        if (text.startsWith('```')) {
          text = text.replace(/^```[a-zA-Z]*\n?/, '');
          text = text.replace(/\n?```$/, '');
          text = text.trim();
        }

        parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('Invalid JSON structure: missing nodes or edges array.');
        }
        break; // Parse and check succeeded! Exit loop.
      } catch (parseError: unknown) {
        console.warn(`Graph API JSON parsing attempt ${attempts} failed.`, parseError);
        if (attempts >= maxAttempts) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error('LLM response was not valid JSON: ' + parseMsg);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error('Failed to generate dependency graph because of a malformed AI response.');
    }

    // Validate nodes format
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

    // Validate edges format
    const validatedEdges = parsed.edges.map((edge: Partial<{ from: string; to: string }>) => {
      return {
        from: String(edge.from || ''),
        to: String(edge.to || '')
      };
    }).filter(edge => edge.from && edge.to);

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
