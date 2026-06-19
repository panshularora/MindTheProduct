import { NextResponse } from 'next/server';
import { DebateLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await request.json();
  } catch {
    // Ignore
  }

  // Artificial 1-second delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const mockDebateLogs: DebateLog[] = [
    {
      nodeId: 'node-2',
      turns: [
        {
          persona: 'growth',
          round: 1,
          text: 'Real-time cursors are a major driver of document virality and co-presence. When users see active cursors, their sense of workspace collaboration rises, leading to a 2x retention increase. We must build it.',
          respondingTo: null,
        },
        {
          persona: 'eng_realist',
          round: 1,
          text: 'Implementing real-time WebSocket cursors across all document types (including spreadsheets and markdown notes) will require complex state syncing and conflict resolution. It is a 3-month effort that will delay core MVP features. Is the virality actually proven for static markdown text?',
          respondingTo: 'growth',
        },
        {
          persona: 'user_advocate',
          round: 1,
          text: 'According to user feedback signals, users find real-time cursors distracting and cluttering, preferring to work asynchronously. They specifically requested robust, threaded inline comments and external invite links instead of live co-editing.',
          respondingTo: 'eng_realist',
        },
      ],
      verdict: 'Pivot away from real-time cursors as a high priority. Instead, allocate resources to build collaborative comment threads and simple document sharing links, resolving the user request without high engineering complexity.',
    },
  ];

  return NextResponse.json({ debateLogs: mockDebateLogs });
}
