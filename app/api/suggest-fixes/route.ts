import { NextResponse } from 'next/server';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { node, debateLog } = await request.json();

    if (!node || !debateLog) {
      return NextResponse.json({ error: 'Missing node or debateLog' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debateTurnsText = debateLog.turns.map((turn: any) => `[${turn.persona.toUpperCase()}]: ${turn.text}`).join('\n');

    const prompt = `You are a product manager generating quick fix proposals to unblock a feature.
The following feature node received a "Cut" or "Modify" verdict in a debate.
Node text: "${node.text}"

Debate Transcript:
${debateTurnsText}

Your task is to generate 2 to 3 concrete, specific, one-sentence fix proposals that directly address the specific objections raised in the debate (especially by the Eng-Realist and User-Advocate). Do not give generic advice. Each suggestion should target a DIFFERENT objection if multiple distinct objections exist.

Return ONLY valid JSON matching this schema:
{
  "suggestions": [
    { "text": "...", "addressesObjection": "..." }
  ]
}`;

    const llmResponse = await callLLMUnified({
      prompt,
      jsonMode: true,
      temperature: 0.7,
      maxTokens: 500
    });

    const parsed = cleanAndParseJSON(llmResponse);
    return NextResponse.json({ suggestions: parsed.suggestions || [] });
  } catch (error: unknown) {
    console.error('Suggest fixes error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
