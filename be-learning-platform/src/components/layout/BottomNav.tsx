import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

interface NavItem {
  title: string;
  url: string;
}

interface BottomNavProps {
  prev: NavItem | null;
  next: NavItem | null;
  isComplete: boolean;
  onToggleComplete: () => void;
}

export function BottomNav({ prev, next, isComplete, onToggleComplete }: BottomNavProps) {
  return (
    <div className="mt-12 border-t border-gh-border pt-6">
      {/* Mark complete — prominent, above nav */}
      <motion.button
        onClick={onToggleComplete}
        whileTap={{ scale: 0.97 }}
        className={`mb-5 flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold transition-all ${
          isComplete
            ? 'bg-gh-accent-green text-white shadow-lg shadow-gh-accent-green/20'
            : 'bg-gh-bg-secondary text-gh-text-primary ring-1 ring-gh-border hover:ring-gh-accent-green/50'
        }`}
      >
        {isComplete ? (
          <>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Đã hoàn thành bài này
          </>
        ) : (
          <>
            <span className="flex h-5 w-5 items-center justify-center rounded-md ring-2 ring-gh-text-secondary/30">
              <span className="h-2.5 w-2.5 rounded-sm bg-gh-text-secondary/20" />
            </span>
            Đánh dấu hoàn thành bài này
          </>
        )}
      </motion.button>

      {/* Prev/Next nav */}
      <div className="grid grid-cols-2 gap-4">
        {prev ? (
          <Link
            to={prev.url}
            className="group flex items-center gap-3 rounded-xl border border-gh-border/60 bg-gh-bg-secondary p-4 transition-all hover:border-gh-accent-green/50 hover:bg-gh-accent-green/5"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gh-border text-gh-text-secondary transition-colors group-hover:border-gh-accent-green group-hover:text-gh-accent-green">
              ←
            </span>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-gh-text-secondary">
                Previous
              </span>
              <span className="block truncate text-sm font-semibold text-gh-text-primary group-hover:text-gh-accent-green">
                {prev.title}
              </span>
            </div>
          </Link>
        ) : (
          <div />
        )}

        {next ? (
          <Link
            to={next.url}
            className="group flex items-center justify-end gap-3 rounded-xl border border-gh-border/60 bg-gh-bg-secondary p-4 text-right transition-all hover:border-gh-accent-green/50 hover:bg-gh-accent-green/5"
          >
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-gh-text-secondary">
                Next
              </span>
              <span className="block truncate text-sm font-semibold text-gh-text-primary group-hover:text-gh-accent-green">
                {next.title}
              </span>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gh-border text-gh-text-secondary transition-colors group-hover:border-gh-accent-green group-hover:text-gh-accent-green">
              →
            </span>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
