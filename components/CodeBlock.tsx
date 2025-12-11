import React from 'react';

interface CodeBlockProps {
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code }) => {
  return (
    <div className="relative group w-full max-w-full">
      <div className="absolute top-0 left-0 bg-blue-600 text-[10px] md:text-xs px-2 py-1 rounded-tl rounded-br font-bold text-white z-10">
        C++
      </div>
      {/* Mobile: p-4 with smaller text, Desktop: p-6. */}
      <pre className="bg-slate-950 text-blue-100 p-4 pt-8 md:p-6 md:pt-8 rounded-lg overflow-x-auto border border-slate-800 shadow-inner code-font text-xs md:text-sm lg:text-base leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
        <code>{code}</code>
      </pre>
    </div>
  );
};