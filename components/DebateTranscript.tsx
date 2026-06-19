import React, { useEffect, useRef } from 'react';
import { DebateTurn } from '@/lib/types';

interface DebateTranscriptProps {
  turns: DebateTurn[];
  verdict: string;
  isThinking: 'growth' | 'eng_realist' | 'user_advocate' | null;
}

export default function DebateTranscript({ turns, verdict, isThinking }: DebateTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, isThinking, verdict]);

  const getPersonaStyle = (persona: string) => {
    switch (persona) {
      case 'growth':
        return {
          bg: 'bg-sky-950/30 border-sky-900/50',
          text: 'text-sky-100',
          avatarBg: 'bg-sky-500 text-slate-950',
          badge: 'bg-sky-950 text-sky-300 border-sky-800',
          name: 'Growth Optimist',
          avatarText: 'GO',
        };
      case 'eng_realist':
        return {
          bg: 'bg-slate-900/60 border-slate-800',
          text: 'text-slate-100',
          avatarBg: 'bg-slate-500 text-slate-950',
          badge: 'bg-slate-800 text-slate-300 border-slate-700',
          name: 'Engineering Realist',
          avatarText: 'ER',
        };
      case 'user_advocate':
        return {
          bg: 'bg-violet-950/30 border-violet-900/50',
          text: 'text-violet-100',
          avatarBg: 'bg-violet-500 text-slate-950',
          badge: 'bg-violet-950 text-violet-300 border-violet-800',
          name: 'User Advocate',
          avatarText: 'UA',
        };
      default:
        return {
          bg: 'bg-slate-900 border-slate-800',
          text: 'text-slate-300',
          avatarBg: 'bg-slate-600 text-slate-100',
          badge: 'bg-slate-900 text-slate-400 border-slate-800',
          name: persona,
          avatarText: '?',
        };
    }
  };

  return (
    <div className="flex flex-col h-[400px] border border-slate-800 bg-slate-950/60 rounded-xl overflow-hidden shadow-inner">
      {/* Scrollable messages container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 && !isThinking && (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs italic text-center">
            Debate transcript will stream here once active...
          </div>
        )}

        {turns.map((turn, index) => {
          const style = getPersonaStyle(turn.persona);
          return (
            <div key={index} className="flex items-start space-x-3 max-w-[85%] animate-fadeIn">
              {/* Avatar circle */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-xs flex-shrink-0 select-none shadow-md ${style.avatarBg}`}>
                {style.avatarText}
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${style.badge}`}>
                    {style.name}
                  </span>
                  {turn.respondingTo && (
                    <span className="text-[8px] text-slate-500 font-semibold uppercase">
                      ↳ responding to {getPersonaStyle(turn.respondingTo).name}
                    </span>
                  )}
                </div>
                <div className={`p-3 rounded-2xl rounded-tl-none border text-xs leading-relaxed ${style.bg} ${style.text}`}>
                  &ldquo;{turn.text}&rdquo;
                </div>
              </div>
            </div>
          );
        })}

        {/* Bouncing Dots Thinking Indicator */}
        {isThinking && (
          <div className="flex items-start space-x-3 max-w-[80%] animate-pulse">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-xs flex-shrink-0 ${getPersonaStyle(isThinking).avatarBg}`}>
              {getPersonaStyle(isThinking).avatarText}
            </div>
            <div className="space-y-1">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getPersonaStyle(isThinking).badge}`}>
                {getPersonaStyle(isThinking).name} is formulating response...
              </span>
              <div className="p-3 rounded-2xl rounded-tl-none border bg-slate-900/40 border-slate-800/80 flex items-center space-x-1.5 h-10 w-16 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Verdict visual bubble */}
        {verdict && (
          <div className="flex items-start justify-center py-2 animate-fadeIn">
            <div className="bg-teal-950/20 border border-teal-800/40 rounded-xl px-4 py-3 text-center max-w-[90%] text-xs shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400 block mb-1">Debate Verdict</span>
              <p className="text-teal-200 font-medium font-mono leading-relaxed">&ldquo;{verdict}&rdquo;</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
