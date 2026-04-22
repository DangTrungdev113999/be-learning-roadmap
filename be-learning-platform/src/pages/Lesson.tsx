import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Manifest, Lesson as LessonType } from '../types';
import type { LessonLookup } from '../lib/manifest';
import {
  loadManifest,
  findLessonBySlugPath,
  getAdjacentLessons,
  getLessonUrl,
  flattenLessons,
} from '../lib/manifest';
import { useProgress } from '../hooks/useProgress';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { TopNav } from '../components/layout/TopNav';
import { BottomNav } from '../components/layout/BottomNav';
import { SidebarSlideOver } from '../components/layout/SidebarSlideOver';
import { Badge } from '../components/ui/Badge';

import { MarkdownRenderer, toSlug } from '../components/content/MarkdownRenderer';
import { TableOfContents } from '../components/content/TableOfContents';
import { SearchModal } from '../components/features/SearchModal';
import { AiChat } from '../components/features/AiChat';

/** Find the URL for a lesson by scanning the manifest for its context */
function findLessonUrl(manifest: Manifest, lesson: LessonType): string | null {
  for (const level of manifest.levels) {
    for (const topic of level.topics) {
      const directMatch = topic.lessons.find((l) => l.slug === lesson.slug);
      if (directMatch) {
        return getLessonUrl(level.id, topic, null, directMatch);
      }
      for (const subtopic of topic.subtopics) {
        const subMatch = subtopic.lessons.find((l) => l.slug === lesson.slug);
        if (subMatch) {
          return getLessonUrl(level.id, topic, subtopic, subMatch);
        }
      }
    }
  }
  return null;
}

/** Extract heading ids from markdown for scroll spy */
function extractHeadingIds(markdown: string): string[] {
  const ids: string[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    // Only h2 — must match what TOC shows
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      ids.push(toSlug(h2Match[1]));
    }
  }
  return ids;
}

export function Lesson() {
  const { levelId, '*': restPath } = useParams();
  const slugPath = levelId && restPath ? `level-${levelId}/${restPath}` : undefined;
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [lookup, setLookup] = useState<LessonLookup | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const { setLastRead, isLessonComplete, setLessonDone } = useProgress();

  // Global Cmd+K / Ctrl+K listener
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Load manifest
  useEffect(() => {
    loadManifest()
      .then((m) => setManifest(m))
      .catch(() => setNotFound(true));
  }, []);

  // Scroll to top instantly when lesson changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [slugPath]);

  // Find lesson when manifest or slugPath changes
  useEffect(() => {
    if (!manifest || !slugPath) {
      if (manifest && !slugPath) setNotFound(true);
      return;
    }

    const result = findLessonBySlugPath(manifest, slugPath);
    if (!result) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLookup(result);
    setNotFound(false);

    // Fetch markdown content
    fetch(`/content/${result.lesson.filePath}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load content');
        return res.text();
      })
      .then((md) => {
        setContent(md);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });

    // Set last-read in localStorage
    setLastRead({
      levelId: result.level.id,
      slug: result.lesson.slug,
      title: result.lesson.title,
      url: getLessonUrl(result.level.id, result.topic, result.subtopic ?? null, result.lesson),
    });
  }, [manifest, slugPath, setLastRead]);

  // Extract heading ids for scroll spy
  const headingIds = useMemo(() => extractHeadingIds(content), [content]);
  const activeId = useScrollSpy(headingIds);

  // Adjacent lessons for bottom nav
  const adjacent = useMemo(() => {
    if (!manifest || !lookup) return { prev: null, next: null };
    const adj = getAdjacentLessons(manifest, lookup.lesson.slug);
    return {
      prev: adj.prev
        ? { title: adj.prev.title, url: findLessonUrl(manifest, adj.prev) ?? '/' }
        : null,
      next: adj.next
        ? { title: adj.next.title, url: findLessonUrl(manifest, adj.next) ?? '/' }
        : null,
    };
  }, [manifest, lookup]);

  // All lesson slugs for current level — passed to TOC for progress calculation
  const levelLessonSlugs = useMemo(() => {
    if (!manifest || !lookup) return [];
    const levelLessons = flattenLessons({
      ...manifest,
      levels: manifest.levels.filter((l) => l.id === lookup.level.id),
    });
    return levelLessons.map(l => l.slug);
  }, [manifest, lookup]);

  // Breadcrumb items for TopNav (convert href to to)
  const breadcrumbSegments = useMemo(() => {
    if (!lookup) return undefined;
    return lookup.breadcrumb.map((b) => ({ label: b.label, to: b.href }));
  }, [lookup]);

  // Loading state
  if (loading && !notFound) {
    return (
      <div className="min-h-screen bg-gh-bg-primary">
        <TopNav />
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-gh-text-secondary">Loading...</div>
        </div>
      </div>
    );
  }

  // Not found state
  if (notFound || !lookup) {
    return (
      <div className="min-h-screen bg-gh-bg-primary">
        <TopNav />
        <div className="flex flex-col items-center justify-center py-20">
          <h1 className="text-xl font-bold text-gh-text-primary">Lesson not found</h1>
          <p className="mt-2 text-sm text-gh-text-secondary">
            The lesson you are looking for does not exist.
          </p>
          <Link
            to="/"
            className="mt-4 text-sm text-gh-accent-blue hover:underline"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gh-bg-primary">
      <TopNav
        breadcrumb={breadcrumbSegments}
        onMenuClick={() => setSidebarOpen(true)}
        onSearchClick={() => setSearchOpen(true)}
      />

      {/* Sidebar slide-over navigation */}
      {manifest && (
        <SidebarSlideOver
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          manifest={manifest}
          currentSlug={slugPath ?? ''}
        />
      )}

      {/* Search modal */}
      {manifest && (
        <SearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          manifest={manifest}
        />
      )}

      <motion.main
        className="mx-auto flex max-w-[1400px] py-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* LEFT sidebar — flush to left edge */}
        <aside className="sticky top-16 hidden w-80 flex-shrink-0 self-start pl-[10px] pr-8 lg:block">
          <TableOfContents
            content={content}
            activeId={activeId}
            levelId={lookup.level.id}
            lessonSlug={lookup.lesson.slug}
            lessonTitle={lookup.lesson.title}
            lessonIndex={levelLessonSlugs.indexOf(lookup.lesson.slug) + 1}
            levelLessonSlugs={levelLessonSlugs}
          />
        </aside>

        {/* RIGHT content column */}
        <article className="min-w-0 max-w-[920px] flex-1 pr-8">
          {/* Meta tags */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="green">Level {lookup.level.id}</Badge>
            <Badge variant="default">{lookup.lesson.readTime} min read</Badge>
            <Badge variant="blue">{lookup.topic.title}</Badge>
          </div>

          {/* Title */}
          <h1 className="mb-1 text-2xl font-extrabold text-gh-text-primary">
            {lookup.lesson.title}
          </h1>

          {/* Mobile TOC toggle */}
          <div className="mb-4 lg:hidden">
            <button
              onClick={() => setTocOpen((prev) => !prev)}
              className="flex items-center gap-1 rounded border border-gh-border bg-gh-bg-secondary px-3 py-1.5 text-xs text-gh-text-secondary hover:text-gh-text-primary"
            >
              On this page {tocOpen ? '\u25B2' : '\u25BC'}
            </button>
            {tocOpen && (
              <div className="mt-2 rounded border border-gh-border bg-gh-bg-secondary p-3">
                <TableOfContents
                  content={content}
                  activeId={activeId}
                  levelId={lookup.level.id}
                  lessonSlug={lookup.lesson.slug}
                  lessonTitle={lookup.lesson.title}
                  lessonIndex={levelLessonSlugs.indexOf(lookup.lesson.slug) + 1}
                  levelLessonSlugs={levelLessonSlugs}
                />
              </div>
            )}
          </div>

          {/* Markdown content */}
          <MarkdownRenderer content={content} />

          {/* Bottom navigation */}
          <BottomNav
            prev={adjacent.prev}
            next={adjacent.next}
            isComplete={isLessonComplete(lookup.level.id, lookup.lesson.slug)}
            onToggleComplete={() => setLessonDone(lookup.level.id, lookup.lesson.slug, !isLessonComplete(lookup.level.id, lookup.lesson.slug))}
          />
        </article>
      </motion.main>

      {/* AI Chat widget */}
      <AiChat lessonTitle={lookup.lesson.title} content={content} />
    </div>
  );
}
