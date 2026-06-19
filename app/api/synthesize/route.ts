import { NextResponse } from 'next/server';
import { RoadmapItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await request.json();
  } catch {
    // Ignore
  }

  // Artificial 1-second delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const mockRoadmap: RoadmapItem[] = [
    {
      id: 'roadmap-1',
      title: 'Threaded Comments & Rich Text Mentions',
      rank: 1,
      rationale: 'Directly requested by users as an alternative to live editing cursors. It requires significantly less engineering complexity than WebSocket state synchronization, providing high customer value quickly.',
      relatedDebate: ['node-2'],
      sourceNodes: ['node-4'],
    },
    {
      id: 'roadmap-2',
      title: 'External Reviewer Workspace Invites',
      rank: 2,
      rationale: 'Derived from user feedback signals requesting seamless external collaboration. Accelerates virality loops since external reviewers are invited directly via secure web links.',
      relatedDebate: [],
      sourceNodes: ['node-5'],
    },
    {
      id: 'roadmap-3',
      title: 'WebSocket Infrastructure Planning',
      rank: 3,
      rationale: 'Deferred real-time editor component release but maintained initial infrastructure study to support future low-latency comment notifications and typing indicators.',
      relatedDebate: ['node-2'],
      sourceNodes: ['node-3'],
    },
  ];

  return NextResponse.json({ roadmap: mockRoadmap });
}
