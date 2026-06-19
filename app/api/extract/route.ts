import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Node } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prd, featureRequests, feedback } = body;

    if (!prd || !featureRequests || !feedback) {
      return NextResponse.json(
        { error: 'Missing required inputs: prd, featureRequests, and feedback must all be provided.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key is not configured on the server. Please check your env configuration.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey,
      timeout: 25000, // 25 seconds timeout
    });

    const prompt = `You are a product reasoning agent. Your task is to extract structured, atomic nodes representing the core claims, assumptions, requirements, and feedback signals from three provided text sources.

Input Sources:
1. Product Requirement Document (PRD):
[PRD_START]
${prd}
[PRD_END]

2. Feature Requests:
[FEATURE_REQUESTS_START]
${featureRequests}
[FEATURE_REQUESTS_END]

3. User Feedback:
[USER_FEEDBACK_START]
${feedback}
[USER_FEEDBACK_END]

Task Instructions:
- Extract between 8 and 20 atomic nodes total across all three sources.
- Each node must capture a single, specific point. Do not combine multiple points into one node.
- Classify each node's type into one of the following:
  * 'claim': An assertion, goal, or expectation (typically from the PRD).
  * 'assumption': A hypothesis about user behavior, needs, or capabilities (typically from the PRD).
  * 'requirement': A specific functional or technical implementation item (typically from Feature Requests).
  * 'feedback_signal': A report, quote, or metric representing direct user experience (typically from User Feedback).
- Determine the node's source based on where it came from: 'prd', 'feature_request', or 'feedback'.
- Assign a confidence score between 0.0 and 1.0 based on how explicitly the point was stated in the input (1.0 = explicitly stated verbatim; <1.0 = implied, summarized, or interpreted).
- Write a short, plain-English "text" summary of the node. Do NOT copy verbatim quotes from the input; synthesize a concise, clear description.
- Set "id" to a unique short slug like "n1", "n2", "n3", etc.
- Leave "dependsOn" as an empty array: []
- Set "status" to "fresh" for all nodes.

Output Format:
You must return ONLY a valid JSON object matching this exact shape:
{
  "nodes": [
    {
      "id": "n1",
      "type": "claim",
      "text": "Brief summary text",
      "source": "prd",
      "confidence": 0.9,
      "dependsOn": [],
      "status": "fresh"
    }
  ]
}

Do not include any surrounding conversational text, markdown code blocks, or preamble. Return ONLY the JSON object.`;

    let text = '';
    let parsed: { nodes: Node[] } | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
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

        text = responseContent.text.trim();

        // Strip markdown code fences if present
        if (text.startsWith('```')) {
          text = text.replace(/^```[a-zA-Z]*\n?/, '');
          text = text.replace(/\n?```$/, '');
          text = text.trim();
        }

        parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.nodes)) {
          throw new Error('Invalid JSON structure: missing nodes array.');
        }
        break; // Parse and check succeeded! Exit loop.
      } catch (parseError: unknown) {
        console.warn(`Extraction API JSON parsing attempt ${attempts} failed.`, parseError);
        if (attempts >= maxAttempts) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error('Claude response was not valid JSON: ' + parseMsg);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.nodes)) {
      throw new Error('Failed to extract product nodes because of a malformed AI response.');
    }

    // Validate nodes format just to be safe
    const validatedNodes: Node[] = parsed.nodes.map((node: Partial<Node>, idx: number) => {
      const type = (node.type && ['claim', 'assumption', 'requirement', 'feedback_signal'].includes(node.type))
        ? (node.type as 'claim' | 'assumption' | 'requirement' | 'feedback_signal')
        : 'claim';
      const source = (node.source && ['prd', 'feature_request', 'feedback'].includes(node.source))
        ? (node.source as 'prd' | 'feature_request' | 'feedback')
        : 'prd';

      return {
        id: node.id || `n${idx + 1}`,
        type,
        text: node.text || '',
        source,
        confidence: typeof node.confidence === 'number' ? node.confidence : 1.0,
        dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [],
        status: 'fresh'
      } as Node;
    });

    return NextResponse.json({ nodes: validatedNodes });
  } catch (error: unknown) {
    console.error('Extraction API error:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred during extraction analysis.';
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
