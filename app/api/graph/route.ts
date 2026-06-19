import { NextResponse } from 'next/server';
import { GraphData, Node } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let nodes: Node[] = [];
  try {
    const body = await request.json();
    nodes = body.nodes || [];
  } catch {
    // Ignore
  }

  // Artificial 1-second delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const baseNodes: Node[] = nodes.length > 0 ? nodes : [
    {
      id: 'node-1',
      type: 'claim',
      text: 'Collaborative editing increases user engagement by 40%.',
      source: 'prd',
      confidence: 0.85,
      dependsOn: [],
      status: 'fresh',
    },
    {
      id: 'node-2',
      type: 'assumption',
      text: 'Users want real-time cursors for all document types.',
      source: 'prd',
      confidence: 0.7,
      dependsOn: [],
      status: 'fresh',
    },
    {
      id: 'node-3',
      type: 'requirement',
      text: 'Build collaborative editor component using WebSockets.',
      source: 'feature_request',
      confidence: 0.9,
      dependsOn: ['node-2'],
      status: 'fresh',
    },
    {
      id: 'node-4',
      type: 'feedback_signal',
      text: 'Real-time cursors are annoying and clutter the UI; we prefer comment threads.',
      source: 'feedback',
      confidence: 0.95,
      dependsOn: [],
      status: 'fresh',
    },
    {
      id: 'node-5',
      type: 'feedback_signal',
      text: 'I need a way to invite external reviewers to edit documents.',
      source: 'feedback',
      confidence: 0.8,
      dependsOn: [],
      status: 'fresh',
    },
  ];

  // Update statuses to contested or stale based on dependency logic
  const updatedNodes = baseNodes.map((node) => {
    if (node.id === 'node-2') {
      return { ...node, status: 'contested' as const };
    }
    if (node.id === 'node-3') {
      return { ...node, status: 'stale' as const };
    }
    return node;
  });

  const mockGraph: GraphData = {
    nodes: updatedNodes,
    edges: [
      { from: 'node-2', to: 'node-3' },
      { from: 'node-4', to: 'node-2' }, // Feedback contests the assumption
    ],
  };

  return NextResponse.json(mockGraph);
}
