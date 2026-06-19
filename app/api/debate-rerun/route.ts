import { NextResponse } from 'next/server';
import { DebateTurn } from '@/lib/types';
import { getApiKey, callLLMUnified } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const { targetNode, allNodes, proposedFix } = body;

    if (!targetNode || !proposedFix) {
      return NextResponse.json(
        { error: 'Missing required input: targetNode and proposedFix.' },
        { status: 400 }
      );
    }

    const groqKey = getApiKey('GROQ_API_KEY');
    const anthropicKey = getApiKey('ANTHROPIC_API_KEY');
    const geminiKey = getApiKey('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;

    if (!groqKey && !anthropicKey && !geminiKey) {
      return NextResponse.json(
        { error: 'Server API key is not configured. Please set GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in the Vercel dashboard.' },
        { status: 500 }
      );
    }

    // Return a ReadableStream to stream each debate turn in real-time
    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (data: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          sendChunk({ type: 'start_debate', nodeId: targetNode.id });

          // Create context description of all nodes
          const contextStr = (allNodes || [])
            .map((n: { id: string; type: string; source: string; text: string; status: string }) =>
              `- [${n.id}] ${n.type} (${n.source}): "${n.text}" [Status: ${n.status}]`
            )
            .join('\n');

          // --- 1. GROWTH AGENT ---
          sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'growth' });
          const growthPrompt = `You are the GROWTH OPTIMIST, a product manager focused on rapid growth and shipping fast.
Your goal is to re-evaluate the feature given a proposed fix. Start with a direct assertion.

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

The team proposes this fix: "${proposedFix}".
Re-evaluate your position given this change. Write your argument. Be extremely concise (max 2 sentences). Format: "Ship it because [core reason with fix]. [supporting point]."`;

          const growthText = await callLLMUnified({
            prompt: growthPrompt,
            temperature: 0.7,
            maxTokens: 150
          });
          const growthTurn: DebateTurn = {
            persona: 'growth',
            round: 2,
            text: growthText,
            respondingTo: null
          };
          sendChunk({ type: 'turn', nodeId: targetNode.id, turn: growthTurn });

          // --- 2. ENG REALIST AGENT ---
          sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'eng_realist' });
          const engPrompt = `You are the ENG REALIST, a pragmatic principal engineer focused on stability, maintainability, and engineering risk.
Your goal is to write a direct engineering rebuttal to the Growth Optimist's argument, keeping the proposed fix in mind.
Start with "Disagree. [reason]" or "Agree, but [concern]". Directly reference their point.

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

The team proposes this fix: "${proposedFix}".

Growth Optimist's Argument:
"${growthText}"

Re-evaluate your position given this change. Write your rebuttal. Be extremely concise (max 2 sentences).`;

          const engText = await callLLMUnified({
            prompt: engPrompt,
            temperature: 0.5,
            maxTokens: 150
          });
          const engTurn: DebateTurn = {
            persona: 'eng_realist',
            round: 2,
            text: engText,
            respondingTo: 'growth'
          };
          sendChunk({ type: 'turn', nodeId: targetNode.id, turn: engTurn });

          // --- 3. USER ADVOCATE AGENT ---
          sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'user_advocate' });
          const userPrompt = `You are the USER ADVOCATE, championing usability and customer delight.
Your goal is to review the node, the proposed fix, weigh both arguments, and deliver a final alignment verdict: Proceed, Modify, or Cut.
Start with "[Growth/Engineering] is correct because [reason]."

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

The team proposes this fix: "${proposedFix}".

Growth Optimist's Argument:
"${growthText}"

Engineering Realist's Argument:
"${engText}"

Re-evaluate your position given this change. Write your commentary. Be extremely concise (max 2 sentences).
Finish your response with a line: "Verdict: [Proceed/Modify/Cut] - [One-sentence rationale]"`;

          const userTextFull = await callLLMUnified({
            prompt: userPrompt,
            temperature: 0.6,
            maxTokens: 200
          });
          
          // Extract verdict and clean up text
          let verdictLine = 'Modify - Re-evaluate based on user needs.';
          let userText = userTextFull;
          const verdictIndex = userTextFull.toLowerCase().lastIndexOf('verdict:');
          if (verdictIndex !== -1) {
            verdictLine = userTextFull.substring(verdictIndex).replace(/^verdict:\s*/i, '').trim();
            userText = userTextFull.substring(0, verdictIndex).trim();
          }

          const userTurn: DebateTurn = {
            persona: 'user_advocate',
            round: 2,
            text: userText,
            respondingTo: 'eng_realist'
          };
          
          sendChunk({ type: 'turn', nodeId: targetNode.id, turn: userTurn });
          sendChunk({ type: 'verdict', nodeId: targetNode.id, verdict: verdictLine });

          sendChunk({ type: 'complete' });
          controller.close();
        } catch (e: unknown) {
          controller.error(e);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error: unknown) {
    console.error('Debate Rerun API initialization error:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred initializing the debate rerun.';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
