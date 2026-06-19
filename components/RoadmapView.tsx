import React, { useState } from 'react';
import { RoadmapItem } from '@/lib/types';

interface RoadmapViewProps {
  items: RoadmapItem[];
  onReferenceSelect: (nodeId: string) => void;
}

export default function RoadmapView({ items, onReferenceSelect }: RoadmapViewProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedItems = [...items].sort((a, b) => a.rank - b.rank);

  return (
    <div className="grid grid-cols-1 gap-6">
      {sortedItems.map((item) => {
        const isExpanded = !!expandedItems[item.id];
        return (
          <div
            key={item.id}
            className="bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-start md:space-x-6"
          >
            {/* Rank badge */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-xl font-mono flex-shrink-0 shadow-lg shadow-teal-500/10 mb-4 md:mb-0">
              #{item.rank}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h4 className="text-base font-bold text-slate-200">{item.title}</h4>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">{item.id}</span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase mb-1">Strategic Rationale</span>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">{item.rationale}</p>
              </div>

              {/* Expandable Traceability details */}
              <div className="pt-2">
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center space-x-1.5 focus:outline-none"
                >
                  <span>{isExpanded ? 'Hide Traceability Map' : 'Show Traceability Map'}</span>
                  <svg
                    className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="mt-3 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3 animate-fadeIn">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      This item was synthesized directly from the following AI pipeline nodes. Click any reference slug to jump directly to its extraction details and visual graph node:
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Related Debates */}
                      <div className="space-y-1.5">
                        <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-wider">Related Debates</span>
                        {item.relatedDebate.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.relatedDebate.map((nodeId) => (
                              <button
                                key={nodeId}
                                onClick={() => onReferenceSelect(nodeId)}
                                className="text-[10px] font-mono text-rose-300 bg-rose-950/30 border border-rose-900/40 hover:bg-rose-900/30 px-2 py-0.5 rounded transition-colors"
                              >
                                {nodeId} (Debated)
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">No active debates associated.</span>
                        )}
                      </div>

                      {/* Source Nodes */}
                      <div className="space-y-1.5">
                        <span className="text-slate-500 font-bold block text-[9px] uppercase tracking-wider">Supporting Nodes</span>
                        {item.sourceNodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.sourceNodes.map((nodeId) => (
                              <button
                                key={nodeId}
                                onClick={() => onReferenceSelect(nodeId)}
                                className="text-[10px] font-mono text-teal-300 bg-teal-950/30 border border-teal-900/40 hover:bg-teal-900/30 px-2 py-0.5 rounded transition-colors"
                              >
                                {nodeId} (Source)
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">No direct supporting nodes.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
