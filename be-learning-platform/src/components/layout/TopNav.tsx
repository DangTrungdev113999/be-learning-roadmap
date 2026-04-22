import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ThemeToggle } from '../features/ThemeToggle';

const FONT_SIZES = ['text-base', 'text-lg', 'text-xl'] as const;

function useFontSize() {
  const [index, setIndex] = useState(() => {
    const saved = localStorage.getItem('font-size');
    const idx = FONT_SIZES.indexOf(saved as typeof FONT_SIZES[number]);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const html = document.documentElement;
    FONT_SIZES.forEach(cls => html.classList.remove(cls));
    html.classList.add(FONT_SIZES[index]);
    localStorage.setItem('font-size', FONT_SIZES[index]);
  }, [index]);

  return { index, setIndex };
}

interface BreadcrumbSegment {
  label: string;
  to: string;
}

interface TopNavProps {
  breadcrumb?: BreadcrumbSegment[];
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}

export function TopNav({ breadcrumb, onMenuClick, onSearchClick }: TopNavProps) {
  const fontSize = useFontSize();

  return (
    <header className="sticky top-0 z-50 bg-gh-bg-nav/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: Logo + breadcrumb/title */}
        <div className="flex items-center gap-3 overflow-hidden">
          <Link
            to="/"
            className="flex items-center gap-1 font-mono text-lg font-extrabold text-gh-accent-green transition-colors hover:text-gh-accent-green/80"
          >
            <span className="text-xl">&gt;_</span>
          </Link>

          {breadcrumb && breadcrumb.length > 0 ? (
            <nav className="flex items-center gap-1.5 overflow-hidden text-[13px]">
              {breadcrumb.map((segment, i) => {
                const isLast = i === breadcrumb.length - 1;
                return (
                  <span key={segment.to} className="flex items-center gap-1.5">
                    <span className="text-gh-text-secondary/30">›</span>
                    {isLast ? (
                      <span className="truncate font-semibold text-gh-text-primary">{segment.label}</span>
                    ) : (
                      <Link to={segment.to} className="truncate rounded-md px-1.5 py-0.5 text-gh-text-secondary transition-colors hover:bg-gh-bg-secondary/50 hover:text-gh-text-primary">
                        {segment.label}
                      </Link>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            <span className="text-sm font-medium text-gh-text-primary">BE Learning Roadmap</span>
          )}
        </div>

        {/* Right: Search + Controls */}
        <div className="flex items-center gap-2">
          {/* Mobile search icon */}
          <button
            onClick={onSearchClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gh-border/60 bg-gh-bg-secondary/50 text-gh-text-secondary transition-colors hover:border-gh-border hover:text-gh-text-primary sm:hidden"
            aria-label="Search"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {/* Desktop search button */}
          <button
            onClick={onSearchClick}
            className="hidden items-center gap-2 rounded-lg border border-gh-border/60 bg-gh-bg-primary/50 px-3 py-1.5 text-sm text-gh-text-secondary shadow-inner transition-all hover:border-gh-border hover:bg-gh-bg-secondary/50 sm:flex"
          >
            <svg
              className="h-4 w-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden rounded-md border border-gh-border/60 bg-gh-bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] text-gh-text-secondary sm:inline">
              ⌘K
            </kbd>
          </button>

          {/* Font size + Theme group */}
          <div className="flex items-center gap-1 rounded-lg border border-gh-border/60 bg-gh-bg-secondary/30 p-0.5">
            {/* Font size segmented control */}
            <div className="flex h-7 items-center overflow-hidden rounded-md">
              {(['A', 'A', 'A'] as const).map((letter, i) => (
                <button
                  key={i}
                  onClick={() => fontSize.setIndex(i)}
                  className={`flex h-full items-center justify-center px-2 font-mono font-bold transition-all ${
                    fontSize.index === i
                      ? 'bg-gh-accent-green/20 text-gh-accent-green'
                      : 'text-gh-text-secondary hover:text-gh-text-primary'
                  }`}
                  style={{ fontSize: `${11 + i * 3}px` }}
                  aria-label={`Font size ${['normal', 'large', 'extra large'][i]}`}
                  title={`${[16, 18, 20][i]}px`}
                >
                  {letter}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-gh-border/40" />

            <ThemeToggle />
          </div>

          {onMenuClick && (
            <motion.button
              onClick={onMenuClick}
              whileTap={{ scale: 0.9 }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gh-border/60 bg-gh-bg-secondary/50 text-sm text-gh-text-secondary transition-colors hover:text-gh-text-primary"
              aria-label="Open menu"
            >
              ☰
            </motion.button>
          )}
        </div>
      </div>

      {/* Bottom glow line */}
      <div className="h-px bg-gradient-to-r from-transparent via-gh-accent-green/30 to-transparent" />
    </header>
  );
}
