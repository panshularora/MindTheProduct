import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
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

    const groqKey = process.env.GROQ_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!groqKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'Server API key is not configured. Please set GROQ_API_KEY or ANTHROPIC_API_KEY in the Vercel dashboard.' },
        { status: 500 }
      );
    }

    const groq = groqKey ? new Groq({ apiKey: groqKey }) : null;
    const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

    const prompt = `You are a product reasoning agent. Extract structured atomic nodes from the three input sources below.

Input Sources:
1. PRD: ${prd}
2. Feature Requests: ${featureRequests}
3. User Feedback: ${feedback}

Extract 8-20 atomic nodes. For each node classify type (claim/assumption/requirement/feedback_signal), source (prd/feature_request/feedback), confidence 0-1, and write a short plain-English text summary.

Return ONLY valid JSON:
{"nodes":[{"id":"n1","type":"claim","text":"summary","source":"prd","confidence":0.9,"dependsOn":[],"status":"fresh"}]}`;

    let text = '';
    let parsed: { nodes: Node[] } | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        if (groq) {
          const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'user',
                content: attempts === 1
                  ? prompt
                  : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no markdown, no text.`
              }
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
            max_tokens: 4000,
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
                  : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no markdown, no text.`
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
        if (!parsed || !Array.isArray(parsed.nodes)) {
          throw new Error('Invalid JSON structure: missing nodes array.');
        }
        break;
      } catch (parseError: unknown) {
        console.warn(`Extraction API attempt ${attempts} failed.`, parseError);
        if (attempts >= maxAttempts) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error('LLM response was not valid JSON: ' + parseMsg);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.nodes)) {
      throw new Error('Failed to extract product nodes: malformed AI response.');
    }

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
    const errMsg = error instanceof Error ? error.message : 'An error occurred during extraction.';
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
