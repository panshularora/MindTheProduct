import { NextResponse } from 'next/server';
import { getApiKey, callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DebateTurnInput {
  persona: string;
  text: string;
}

interface ConversationTurnInput {
  role: string;
  text: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { node, debateLog, conversationHistory = [], userMessage } = body;

    if (!node || !debateLog || !userMessage) {
      return NextResponse.json(
        { error: 'Missing required input: node, debateLog, or userMessage.' },
        { status: 400 }
      );
    }

    const groqKey = getApiKey('GROQ_API_KEY');
    const anthropicKey = getApiKey('ANTHROPIC_API_KEY');
    const geminiKey = getApiKey('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;

    if (!groqKey && !anthropicKey && !geminiKey) {
      return NextResponse.json(
        { error: 'No API key configured.' },
        { status: 500 }
      );
    }

    // Context formatting
    const debateTurnsStr = debateLog.turns
      ? debateLog.turns.map((t: DebateTurnInput) => `[${t.persona.toUpperCase()}]: ${t.text}`).join('\n')
      : 'No debate logs available';

    const historyStr = conversationHistory
      ? conversationHistory.map((c: ConversationTurnInput) => `[${c.role === 'user' ? 'USER' : 'STAKEHOLDER'}]: ${c.text}`).join('\n')
      : '';

    const prompt = `You are a tough, skeptical Senior Stakeholder reviewing a council decision to cut a feature.
You have access to the full debate transcript below. The user is now trying to convince you to reverse the cut.
Push back with SPECIFIC references to the actual debate arguments and feedback data already provided — do not concede easily, but if the user makes a genuinely strong point that directly addresses a specific objection raised in the debate, acknowledge it and soften your position. Stay in character as a real stakeholder, not an assistant.

--- NODE INFORMATION ---
ID: ${node.id}
Type: ${node.type}
Source: ${node.source}
Text: ${node.text}

--- DEBATE TRANSCRIPT ---
Verdict: ${debateLog.verdict}
Turns:
${debateTurnsStr}

--- CONVERSATION HISTORY ---
${historyStr}
[USER]: ${userMessage}

Please analyze the user's argument in this conversation turn. If their argument is weak, repetitive, or ignores the engineering/user issues brought up in the debate, stanceShift should be 'hardened' or 'unchanged'. If they bring up a strong, logical point that solves a specific engineering blocker, resource limitation, or user concern raised in the debate, shift the stance to 'softened'. If they completely address and resolve the core objection and make a compelling business/product case, shift the stance to 'reversed'.

Respond ONLY with a valid JSON object in this format (do not include markdown codeblocks or other formatting outside the JSON):
{
  "stakeholderReply": "Your conversational response as the tough Senior Stakeholder.",
  "stanceShift": "hardened" | "unchanged" | "softened" | "reversed"
}`;

    const rawResponse = await callLLMUnified({
      prompt,
      jsonMode: true,
      temperature: 0.7,
      maxTokens: 500
    });

    try {
      const parsed = cleanAndParseJSON(rawResponse);
      return NextResponse.json(parsed);
    } catch (parseErr) {
      console.error('Error parsing negotiation response JSON:', rawResponse, parseErr);
      // Fallback
      return NextResponse.json({
        stakeholderReply: "I'm not fully convinced by that argument. We still have the original objections to consider.",
        stanceShift: "unchanged"
      });
    }
  } catch (error: unknown) {
    console.error('Error in negotiate route:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred during negotiation simulation.';
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
