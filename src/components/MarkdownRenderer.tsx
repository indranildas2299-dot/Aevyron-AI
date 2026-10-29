import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

interface ParsedBlock {
  type: 'code' | 'heading' | 'list' | 'paragraph';
  language?: string;
  text?: string;
  level?: number;
  items?: string[];
}

function parseSafeMarkdown(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const parseProseSegment = (segment: string) => {
    const lines = segment.split('\n');
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length > 0) {
        blocks.push({ type: 'list', items: [...currentList] });
        currentList = [];
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flushList();
        continue;
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        flushList();
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
        });
        continue;
      }

      const listMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
      if (listMatch) {
        currentList.push(listMatch[1].trim());
        continue;
      }

      flushList();
      blocks.push({
        type: 'paragraph',
        text: line.trim(),
      });
    }
    flushList();
  };

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      parseProseSegment(markdown.slice(lastIndex, match.index));
    }
    blocks.push({
      type: 'code',
      language: match[1] || 'text',
      text: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    parseProseSegment(markdown.slice(lastIndex));
  }

  return blocks;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Safely tokenize inline **bold**, *italic*, and `code` without dangerouslySetInnerHTML
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-teal-300 font-mono text-[13px] border border-slate-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const blocks = parseSafeMarkdown(content);

  const handleCopyCode = async (codeText: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <div className="space-y-3 select-text text-[15px] leading-relaxed text-slate-100">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          const isCopied = copiedIndex === index;
          return (
            <div
              key={index}
              className="rounded-xl overflow-hidden border border-slate-700/80 bg-[#070A12] my-2.5"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[11px] text-slate-300">
                  {block.language || 'code'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(block.text || '', index)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
                  aria-label={`Copy ${block.language || 'code'} snippet`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-teal-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-slate-200">
                <code>{block.text}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-lg font-bold text-white pt-1'
              : block.level === 2
              ? 'text-base font-bold text-white pt-1'
              : 'text-[15px] font-semibold text-teal-300 pt-0.5';
          return (
            <h4 key={index} className={sizeClass}>
              {renderInlineFormatting(block.text || '')}
            </h4>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={index} className="space-y-1.5 pl-4 list-disc marker:text-teal-400">
              {block.items?.map((item, itemIdx) => (
                <li key={itemIdx} className="text-slate-200 leading-relaxed">
                  {renderInlineFormatting(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-slate-100 leading-relaxed">
            {renderInlineFormatting(block.text || '')}
          </p>
        );
      })}
    </div>
  );
};
