import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptViewProps {
  transcript: TranscriptEntry[];
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ transcript }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-12 scroll-smooth relative">
      <div className="max-w-4xl mx-auto">
        {transcript.length > 0 ? (
          <div className="text-xl md:text-2xl lg:text-3xl font-medium leading-relaxed tracking-wide text-zinc-100/90 whitespace-pre-wrap break-words font-sans">
            {transcript.map((entry) => (
              <span key={entry.id}>
                {entry.text}
                {" "}
              </span>
            ))}
            {/* Typing Cursor Indicator */}
            <span className="inline-block w-2.5 h-[1em] bg-indigo-500 ml-1 align-text-bottom animate-pulse rounded-sm opacity-80" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 opacity-50 select-none pointer-events-none">
             <p className="text-xl font-light">Waiting for speech...</p>
          </div>
        )}
        
        {/* Invisible anchor for auto-scrolling */}
        <div ref={bottomRef} className="h-16 w-full" />
      </div>
    </div>
  );
};

export default TranscriptView;