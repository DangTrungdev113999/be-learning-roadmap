import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Manifest } from '../../types';
import { useSearch } from '../../hooks/useSearch';
import { extractSnippet } from '../../lib/search-index';
import { Badge } from '../ui/Badge';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: Manifest;
}

export function SearchModal({ isOpen, onClose, manifest }: SearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, setQuery, results, selectedIndex, moveUp, moveDown, getSelected } =
    useSearch(manifest);

  // Autofocus when opened
  useEffect(() => {
    if (isOpen) {
      // Small delay so the input is in the DOM
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveDown();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = getSelected();
      if (selected) {
        navigate(selected.item.url);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleResultClick(url: string) {
    navigate(url);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-50 flex justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ pointerEvents: 'none' }}
          >
            <motion.div
              className="mt-[15vh] w-full max-w-lg self-start rounded-lg border border-gh-border bg-gh-bg-secondary shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ pointerEvents: 'auto' }}
              onKeyDown={handleKeyDown}
            >
              {/* Search input */}
              <div className="flex items-center border-b border-gh-border px-4 py-3">
                <svg
                  className="mr-3 h-4 w-4 flex-shrink-0 text-gh-text-secondary"
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
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search lessons..."
                  className="w-full bg-transparent text-sm text-gh-text-primary outline-none placeholder:text-gh-text-secondary"
                />
                <kbd className="ml-2 flex-shrink-0 rounded border border-gh-border bg-gh-bg-primary px-1.5 py-0.5 font-mono text-[10px] text-gh-text-secondary">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {query.trim() === '' && (
                  <p className="px-4 py-8 text-center text-sm text-gh-text-secondary">
                    Type to search across all lessons
                  </p>
                )}

                {query.trim() !== '' && results.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-gh-text-secondary">
                    No results found
                  </p>
                )}

                {results.map((result, i) => {
                  const snippet = extractSnippet(result.item.searchText, result.matches);
                  return (
                    <button
                      key={result.item.url}
                      onClick={() => handleResultClick(result.item.url)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex
                          ? 'bg-gh-accent-green/10'
                          : 'hover:bg-gh-bg-primary'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gh-text-primary">
                          {result.item.title}
                        </p>
                        <p className="truncate text-xs text-gh-text-secondary">
                          {result.item.topicTitle}
                        </p>
                        {snippet && (
                          <p className="mt-0.5 truncate text-xs italic text-gh-text-secondary/70">
                            {snippet}
                          </p>
                        )}
                      </div>
                      <Badge variant="green">L{result.item.levelId}</Badge>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
