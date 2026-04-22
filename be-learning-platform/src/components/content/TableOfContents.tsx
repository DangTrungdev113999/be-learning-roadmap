import { useMemo } from 'react';
import { useProgress } from '../../hooks/useProgress';
import { ProgressBar } from '../ui/ProgressBar';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  activeId: string;
  levelId: number;
  lessonSlug: string;
  lessonTitle: string;
  lessonIndex: number;
  levelLessonSlugs: string[];
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

function cleanHeadingText(text: string): string {
  return text
    .replace(/`/g, '')
    .replace(/\s*—\s*.+$/, '')
    .replace(/\s*\(.+\)$/, '')
    .trim();
}

function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    // Skip headings inside fenced code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Only h2 headings — h3 is too noisy for TOC
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      headings.push({ id: toSlug(h2Match[1]), text: h2Match[1], level: 2 });
    }
  }
  return headings;
}

export function TableOfContents({ content, activeId, levelId, lessonSlug, lessonTitle: _lessonTitle, lessonIndex, levelLessonSlugs }: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const { isLessonComplete, setLessonDone } = useProgress();

  if (headings.length === 0) return null;

  const lessonDone = isLessonComplete(levelId, lessonSlug);
  const completedLessons = levelLessonSlugs.filter(s => isLessonComplete(levelId, s)).length;
  const totalLessons = levelLessonSlugs.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <nav className="rounded-xl border border-gh-border/40 bg-gh-bg-secondary/50 p-4 backdrop-blur-sm">
      {/* Lesson number */}
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-lg bg-gh-accent-green/15 px-3 py-1 font-mono text-sm font-extrabold text-gh-accent-green">
          Bài {lessonIndex}
        </span>
        <span className="h-px flex-1 bg-gh-border/40" />
      </div>

      {/* TOC — pure navigation */}
      <ul className="space-y-px">
        {headings.map((heading, idx) => {
          const isActive = heading.id === activeId;
          const isH3 = heading.level === 3;
          const displayText = isH3 ? cleanHeadingText(heading.text) : heading.text;

          return (
            <li key={heading.id} className={!isH3 && idx > 0 ? 'mt-0.5' : ''}>
              <a
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(heading.id);
                  if (el) {
                    const top = el.getBoundingClientRect().top + window.scrollY - 64;
                    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
                  }
                }}
                className={`block rounded-lg py-1.5 transition-all ${
                  isH3
                    ? 'border-l-2 pl-5 text-[13px] font-medium'
                    : 'pl-3 text-sm font-bold'
                } ${
                  isActive
                    ? 'border-gh-accent-green bg-gh-accent-green/10 text-gh-accent-green'
                    : 'border-transparent text-gh-text-primary hover:bg-gh-bg-primary/50 hover:text-gh-accent-green'
                }`}
              >
                {displayText}
              </a>
            </li>
          );
        })}
      </ul>

      {/* Divider */}
      <div className="my-4 h-px bg-gradient-to-r from-transparent via-gh-border/60 to-transparent" />

      {/* Mark as read button */}
      {!lessonDone ? (
        <button
          onClick={() => setLessonDone(levelId, lessonSlug, true)}
          className="w-full rounded-lg border border-gh-border py-2.5 text-sm font-semibold text-gh-text-secondary transition-all hover:border-gh-accent-green hover:bg-gh-accent-green/10 hover:text-gh-accent-green"
        >
          Đánh dấu đã đọc
        </button>
      ) : (
        <button
          onClick={() => setLessonDone(levelId, lessonSlug, false)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gh-accent-green py-2.5 text-sm font-semibold text-white transition-all hover:bg-gh-accent-green/90"
        >
          ✓ Hoàn thành
        </button>
      )}

      {/* Level progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gh-text-secondary">
            Level {levelId}
          </p>
          <p className="text-[11px] font-bold text-gh-text-primary">
            {completedLessons}/{totalLessons}
          </p>
        </div>
        <ProgressBar value={progressPercent} size="md" />
      </div>
    </nav>
  );
}

export { extractHeadings };
