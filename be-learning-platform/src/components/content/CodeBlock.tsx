import { useState, useEffect, useCallback, useRef } from 'react';
import { createHighlighter } from 'shiki';
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki';

interface CodeBlockProps {
  children: string;
  language?: string;
  filename?: string;
}

// Shared highlighter instance — loaded once, reused across all CodeBlocks
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript', 'bash', 'shell', 'json', 'yaml', 'css', 'html', 'markdown', 'text', 'sql', 'graphql', 'diff', 'dockerfile', 'nginx'],
    });
  }
  return highlighterPromise!;
}

export function CodeBlock({ children, language, filename }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    getHighlighter()
      .then((highlighter) => {
        if (!mountedRef.current) return;

        // Normalize language
        let lang = language ?? 'text';
        const loaded = highlighter.getLoadedLanguages();
        if (!loaded.includes(lang)) {
          lang = 'text';
        }

        const result = highlighter.codeToHtml(children, {
          lang,
          theme: 'github-dark',
        });
        setHtml(result);
      })
      .catch((err) => {
        console.warn('[CodeBlock] Shiki error:', err);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [children, language]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-[#30363d]" style={{ background: '#0d1117' }}>
      {/* Header bar — always dark regardless of theme */}
      <div className="flex items-center justify-between border-b border-[#30363d] px-3 py-2" style={{ background: '#010409' }}>
        <div className="flex items-center gap-2">
          {/* Terminal dots */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gh-accent-red" />
            <span className="h-2.5 w-2.5 rounded-full bg-gh-accent-orange" />
            <span className="h-2.5 w-2.5 rounded-full bg-gh-accent-green" />
          </div>
          {filename && (
            <span className="font-mono text-xs text-[#e6edf3]">
              {filename}
            </span>
          )}
          {!filename && language && language !== 'text' && (
            <span className="font-mono text-xs text-[#8b949e]">
              {language}
            </span>
          )}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="rounded px-2 py-0.5 text-xs text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#e6edf3]"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>

      {/* Code body — always dark */}
      <div className="overflow-x-auto" style={{ background: '#161b22' }}>
        {html ? (
          <div
            className="[&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed [&_code]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="p-4 text-sm leading-relaxed text-[#e6edf3]">
            <code>{children}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
