import React from 'react';

interface CodeBlockProps {
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code }) => {
  return (
    <div className="relative group">
      <div className="absolute top-0 left-0 bg-blue-600 text-xs px-2 py-1 rounded-tl rounded-br font-bold text-white z-10">
        C++
      </div>
      <pre className="bg-slate-950 text-blue-100 p-6 pt-8 rounded-lg overflow-x-auto border border-slate-800 shadow-inner code-font text-sm md:text-base leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};