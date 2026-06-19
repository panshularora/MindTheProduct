import { NextResponse } from 'next/server';
import { DebateTurn } from '@/lib/types';
import { getApiKey, callLLMUnified } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const { staleOrContestedNodes, allNodes, isChallenge } = body;

    if (!allNodes || !Array.isArray(allNodes)) {
      return NextResponse.json(
        { error: 'Missing required input: allNodes array.' },
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

    // Filter stale/contested nodes if not passed explicitly
    const targetNodes = (staleOrContestedNodes && staleOrContestedNodes.length > 0)
      ? staleOrContestedNodes
      : allNodes.filter((n: { status: string }) => n.status === 'stale' || n.status === 'contested');

    // Rank by lowest confidence, limit to top 5 (unless it is a specific challenge node, in which case we only debate that)
    const debateTargets = [...targetNodes]
      .sort((a: { confidence?: number }, b: { confidence?: number }) => (a.confidence || 0) - (b.confidence || 0))
      .slice(0, 5);

    if (debateTargets.length === 0) {
      return NextResponse.json({ debateLogs: [] });
    }

    // Return a ReadableStream to stream each debate turn in real-time
    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (data: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          for (const targetNode of debateTargets) {
            sendChunk({ type: 'start_debate', nodeId: targetNode.id });

            // Create context description of all nodes
            const contextStr = allNodes
              .map((n: { id: string; type: string; source: string; text: string; status: string }) =>
                `- [${n.id}] ${n.type} (${n.source}): "${n.text}" [Status: ${n.status}]`
              )
              .join('\n');

            // --- 1. GROWTH AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'growth' });
            const growthPrompt = `You are the GROWTH OPTIMIST, a product manager focused on rapid growth and shipping fast.
Your goal is to write a short, aggressive statement arguing to proceed with this node. Start with a direct assertion.
${isChallenge ? 'Since this is a CHALLENGE DEBATE, address risks but still advocate for a lean, phased growth approach.' : ''}

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

Write your argument. Be extremely concise (max 2 sentences). Format: "Ship it because [core reason]. [supporting point]."`;

            const growthText = await callLLMUnified({
              prompt: growthPrompt,
              temperature: 0.7,
              maxTokens: 150
            });
            const growthTurn: DebateTurn = {
              persona: 'growth',
              round: 1,
              text: growthText,
              respondingTo: null
            };
            sendChunk({ type: 'turn', nodeId: targetNode.id, turn: growthTurn });

            // --- 2. ENG REALIST AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'eng_realist' });
            const engPrompt = `You are the ENG REALIST, a pragmatic principal engineer focused on stability, maintainability, and engineering risk.
Your goal is to write a direct engineering rebuttal to the Growth Optimist's argument.
Start with "Disagree. [reason]" or "Agree, but [concern]". Directly reference their point.
${isChallenge ? 'Since this is a CHALLENGE DEBATE, play Devil\'s Advocate and highlight hidden architectural risks or technical debt.' : ''}

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

Growth Optimist's Argument:
"${growthText}"

Write your rebuttal. Be extremely concise (max 2 sentences).`;

            const engText = await callLLMUnified({
              prompt: engPrompt,
              temperature: 0.5,
              maxTokens: 150
            });
            const engTurn: DebateTurn = {
              persona: 'eng_realist',
              round: 1,
              text: engText,
              respondingTo: 'growth'
            };
            sendChunk({ type: 'turn', nodeId: targetNode.id, turn: engTurn });

            // --- 3. USER ADVOCATE AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'user_advocate' });
            const userPrompt = `You are the USER ADVOCATE, championing usability and customer delight.
Your goal is to review the node, weigh both arguments, and deliver a final alignment verdict: Proceed, Modify, or Cut.
Start with "[Growth/Engineering] is correct because [reason]."
${isChallenge ? 'Since this is a CHALLENGE DEBATE, be highly critical. If risks outweigh benefits, lean towards Modify or Cut.' : ''}

Context of all extracted product nodes:
${contextStr}

Node under debate:
[${targetNode.id}] ${targetNode.text}

Growth Optimist's Argument:
"${growthText}"

Engineering Realist's Argument:
"${engText}"

Write your commentary. Be extremely concise (max 2 sentences).
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
              round: 1,
              text: userText,
              respondingTo: 'eng_realist'
            };
            
            sendChunk({ type: 'turn', nodeId: targetNode.id, turn: userTurn });
            sendChunk({ type: 'verdict', nodeId: targetNode.id, verdict: verdictLine });
          }

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
    console.error('Debate API initialization error:', error);
    const errMsg = error instanceof Error ? error.message : 'An error occurred initializing the debate.';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
