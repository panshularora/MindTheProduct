import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DebateTurn } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const { staleOrContestedNodes, allNodes } = body;

    if (!allNodes || !Array.isArray(allNodes)) {
      return NextResponse.json(
        { error: 'Missing required input: allNodes array.' },
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

    // Filter stale/contested nodes if not passed explicitly
    const targetNodes = (staleOrContestedNodes && staleOrContestedNodes.length > 0)
      ? staleOrContestedNodes
      : allNodes.filter(n => n.status === 'stale' || n.status === 'contested');

    // Rank by lowest confidence, limit to top 5
    const debateTargets = [...targetNodes]
      .sort((a, b) => (a.confidence || 0) - (b.confidence || 0))
      .slice(0, 5);

    if (debateTargets.length === 0) {
      // Return empty if no nodes to debate
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
              .map(n => `- [${n.id}] ${n.type} (${n.source}): "${n.text}" [Status: ${n.status}]`)
              .join('\n');

            // --- 1. GROWTH AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'growth' });
            const growthPrompt = `You are the GROWTH OPTIMIST, a product manager laser-focused on user acquisition, engagement, product virality, and shipping fast. 
Your goal is to argue strongly for proceeding with this node. Make a concrete, aggressive, growth-oriented argument. Do not be generic.

Context of all extracted product nodes:
${contextStr}

The node under debate:
ID: ${targetNode.id}
Type: ${targetNode.type}
Source: ${targetNode.source}
Text: ${targetNode.text}
Status: ${targetNode.status}

Write your argument. Be concise (max 3-4 sentences).`;

            const growthRes = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 500,
              temperature: 0.7,
              messages: [{ role: 'user', content: growthPrompt }]
            });

            const growthText = growthRes.content[0].type === 'text' ? growthRes.content[0].text.trim() : '';
            const growthTurn: DebateTurn = {
              persona: 'growth',
              round: 1,
              text: growthText,
              respondingTo: null
            };
            sendChunk({ type: 'turn', nodeId: targetNode.id, turn: growthTurn });

            // --- 2. ENG REALIST AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'eng_realist' });
            const engPrompt = `You are the ENG REALIST, a pragmatic principal engineer focused on tech stack stability, code maintainability, engineering cost, implementation risks, scalability, and technical debt.
Your goal is to analyze the node under debate and directly respond to the Growth Optimist's argument.
You MUST quote or reference at least one specific point the Growth Optimist made, and rebut or build on it from an engineering feasibility, cost, or maintainability standpoint. Do not just state your independent opinion.

Context of all extracted product nodes:
${contextStr}

The node under debate:
ID: ${targetNode.id}
Text: ${targetNode.text}

Growth Optimist's Argument:
"${growthText}"

Write your rebuttal or engineering reality check. Be concise (max 3-4 sentences).`;

            const engRes = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 500,
              temperature: 0.5,
              messages: [{ role: 'user', content: engPrompt }]
            });

            const engText = engRes.content[0].type === 'text' ? engRes.content[0].text.trim() : '';
            const engTurn: DebateTurn = {
              persona: 'eng_realist',
              round: 1,
              text: engText,
              respondingTo: 'growth'
            };
            sendChunk({ type: 'turn', nodeId: targetNode.id, turn: engTurn });

            // --- 3. USER ADVOCATE AGENT ---
            sendChunk({ type: 'thinking', nodeId: targetNode.id, persona: 'user_advocate' });
            const userPrompt = `You are the USER ADVOCATE, a product designer and researcher championing usability, customer delight, and actual end-user feedback.
Your goal is to review the node under debate, weigh both the Growth Optimist's and Eng Realist's arguments, reference specific points they made, and deliver a final alignment verdict:
- Proceed (build as planned)
- Modify (adjust scope or direction to balance user/eng needs)
- Cut (do not build)
Provide a final verdict, then write your commentary. Weigh the arguments against user feedback signals.

Context of all extracted product nodes:
${contextStr}

The node under debate:
ID: ${targetNode.id}
Text: ${targetNode.text}

Growth Optimist's Argument:
"${growthText}"

Engineering Realist's Argument:
"${engText}"

Write your commentary. Be concise (max 3-4 sentences). Finish your response with a line "Verdict: [Proceed/Modify/Cut] - [One-sentence rationale]".`;

            const userRes = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 600,
              temperature: 0.6,
              messages: [{ role: 'user', content: userPrompt }]
            });

            const userTextFull = userRes.content[0].type === 'text' ? userRes.content[0].text.trim() : '';
            
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
