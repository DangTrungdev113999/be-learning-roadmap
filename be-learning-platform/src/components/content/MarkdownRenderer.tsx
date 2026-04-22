import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { Element } from 'hast';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { CodeBlock } from './CodeBlock';
import { StyledTable } from './StyledTable';

interface MarkdownRendererProps {
  content: string;
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

/** Extract text content from React children recursively */
function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

const components: Components = {
  // Override `pre` to intercept fenced code blocks
  pre({ children, node: _node, ...rest }) {
    // Fenced code blocks render as <pre><code class="language-xxx">...</code></pre>
    // Check if the sole child is a <code> element
    if (
      children &&
      typeof children === 'object' &&
      'props' in children
    ) {
      const child = children as { props: { className?: string; children?: ReactNode }; type?: unknown };
      const className = child.props.className ?? '';
      const langMatch = className.match(/language-(\S+)/);
      const language = langMatch ? langMatch[1] : undefined;
      const code = extractText(child.props.children);
      return <CodeBlock language={language}>{code}</CodeBlock>;
    }

    return <pre {...rest}>{children}</pre>;
  },

  // Inline code only (block code is handled by `pre` override above)
  code({ children, node: _node, ...rest }) {
    return (
      <code
        className="rounded-md bg-gh-bg-secondary px-1.5 py-0.5 text-[0.9em] font-semibold text-gh-text-primary"
        style={{ fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace' }}
        {...rest}
      >
        {children}
      </code>
    );
  },

  table({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'table'> & { node?: Element }) {
    return (
      <StyledTable>
        <table className="w-full border-collapse text-sm" {...rest}>
          {children}
        </table>
      </StyledTable>
    );
  },

  // Override StyledTable's inner table styling: apply to th/td directly
  th({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'th'> & { node?: Element }) {
    return (
      <th
        className="border-b-2 border-gh-accent-green/30 bg-gh-bg-secondary px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gh-accent-green"
        {...rest}
      >
        {children}
      </th>
    );
  },

  tr({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'tr'> & { node?: Element }) {
    return (
      <tr className="transition-colors hover:bg-gh-bg-secondary/50" {...rest}>
        {children}
      </tr>
    );
  },

  td({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'td'> & { node?: Element }) {
    return (
      <td className="border-b border-gh-border/50 px-4 py-3 text-sm leading-relaxed text-gh-text-primary" {...rest}>
        {children}
      </td>
    );
  },

  h2({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'h2'> & { node?: Element }) {
    const text = extractText(children);
    const id = toSlug(text);
    return (
      <h2
        id={id}
        className="mt-10 mb-4 scroll-mt-16 border-b border-gh-border pb-2 text-xl font-extrabold text-gh-text-primary"
        {...rest}
      >
        {children}
      </h2>
    );
  },

  h3({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'h3'> & { node?: Element }) {
    const text = extractText(children);
    const id = toSlug(text);
    return (
      <h3
        id={id}
        className="mt-8 mb-3 scroll-mt-16 rounded-md bg-gh-bg-secondary px-4 py-2.5 text-lg font-bold text-gh-text-primary"
        style={{ borderLeft: '4px solid var(--accent-green)' }}
        {...rest}
      >
        {children}
      </h3>
    );
  },

  blockquote({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'blockquote'> & { node?: Element }) {
    return (
      <blockquote
        className="my-3 border-l-3 border-gh-accent-blue pl-4 italic text-gh-text-secondary"
        {...rest}
      >
        {children}
      </blockquote>
    );
  },

  p({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'p'> & { node?: Element }) {
    return (
      <p className="my-3 leading-relaxed" {...rest}>
        {children}
      </p>
    );
  },

  ul({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'ul'> & { node?: Element }) {
    return (
      <ul className="my-3 list-disc space-y-1 pl-6" {...rest}>
        {children}
      </ul>
    );
  },

  ol({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'ol'> & { node?: Element }) {
    return (
      <ol className="my-3 list-decimal space-y-1 pl-6" {...rest}>
        {children}
      </ol>
    );
  },

  strong({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'strong'> & { node?: Element }) {
    return (
      <strong className="font-bold text-gh-text-primary" {...rest}>
        {children}
      </strong>
    );
  },

  a({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'a'> & { node?: Element }) {
    return (
      <a className="text-gh-accent-blue hover:underline" {...rest}>
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Strip first h1 heading — it's already shown by the Lesson page title
  const stripped = content.replace(/^#\s+.+\n+/, '');

  return (
    <div className="text-gh-text-primary">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {stripped}
      </Markdown>
    </div>
  );
}

export { toSlug };
