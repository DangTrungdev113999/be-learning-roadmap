import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Manifest } from '../../types';
import { getLessonUrl } from '../../lib/manifest';
import { Badge } from '../ui/Badge';

interface SidebarSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: Manifest;
  currentSlug: string;
}

export function SidebarSlideOver({
  isOpen,
  onClose,
  manifest,
  currentSlug,
}: SidebarSlideOverProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.nav
            className="fixed left-0 top-0 z-50 flex h-full w-[420px] max-w-[85vw] flex-col border-r border-gh-border/50 bg-gh-bg-primary"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gh-border/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-extrabold text-gh-accent-green">&gt;_</span>
                <span className="text-sm font-bold text-gh-text-primary">Navigation</span>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gh-text-secondary transition-colors hover:bg-gh-bg-secondary hover:text-gh-text-primary"
                aria-label="Close sidebar"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav tree — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {manifest.levels.map((level) => (
                <div key={level.id} className="mb-6">
                  {/* Level header */}
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="green">L{level.id}</Badge>
                    <span className="text-sm font-bold text-gh-text-primary">{level.title}</span>
                  </div>

                  {/* Topics */}
                  {level.topics.map((topic) => (
                    <div key={topic.id} className="mb-3 ml-1">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gh-text-secondary">
                        {topic.title}
                      </p>

                      {topic.lessons.map((lesson) => {
                        const url = getLessonUrl(level.id, topic, null, lesson);
                        const isCurrent = currentSlug === url.replace(/^\//, '');
                        return (
                          <Link
                            key={lesson.slug}
                            to={url}
                            onClick={onClose}
                            className={`block rounded-md py-1.5 pl-3 text-[13px] leading-snug transition-colors ${
                              isCurrent
                                ? 'border-l-2 border-gh-accent-green bg-gh-accent-green/10 font-semibold text-gh-accent-green'
                                : 'border-l-2 border-gh-border/30 font-medium text-gh-text-primary hover:bg-gh-bg-secondary hover:text-gh-accent-green'
                            }`}
                          >
                            {lesson.title}
                          </Link>
                        );
                      })}

                      {topic.subtopics.map((subtopic) => (
                        <div key={subtopic.id} className="ml-2 mt-2">
                          <p className="mb-1 text-[11px] font-semibold text-gh-text-secondary">
                            {subtopic.title}
                          </p>
                          {subtopic.lessons.map((lesson) => {
                            const url = getLessonUrl(level.id, topic, subtopic, lesson);
                            const isCurrent = currentSlug === url.replace(/^\//, '');
                            return (
                              <Link
                                key={lesson.slug}
                                to={url}
                                onClick={onClose}
                                className={`block rounded-md py-1.5 pl-3 text-[13px] leading-snug transition-colors ${
                                  isCurrent
                                    ? 'border-l-2 border-gh-accent-green bg-gh-accent-green/10 font-semibold text-gh-accent-green'
                                    : 'border-l-2 border-gh-border/30 font-medium text-gh-text-primary hover:bg-gh-bg-secondary hover:text-gh-accent-green'
                                }`}
                              >
                                {lesson.title}
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
