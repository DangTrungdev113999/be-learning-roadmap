import { useState, useCallback, useMemo } from 'react';
import type { FuseResultMatch } from 'fuse.js';
import type { Manifest } from '../types';
import { buildSearchIndex } from '../lib/search-index';
import type { SearchItem } from '../lib/search-index';

export interface SearchResult {
  item: SearchItem;
  matches: readonly FuseResultMatch[] | undefined;
}

export function useSearch(manifest: Manifest | null) {
  const [query, setQueryState] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fuse = useMemo(() => {
    if (!manifest) return null;
    return buildSearchIndex(manifest);
  }, [manifest]);

  const results: SearchResult[] = useMemo(() => {
    if (!fuse || !query.trim()) return [];
    return fuse.search(query).map((r) => ({
      item: r.item,
      matches: r.matches ?? undefined,
    }));
  }, [fuse, query]);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setSelectedIndex(0);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setQueryState('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQueryState('');
    setSelectedIndex(0);
  }, []);

  const moveUp = useCallback(() => {
    setSelectedIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i));
  }, [results.length]);

  const getSelected = useCallback((): SearchResult | null => {
    return results[selectedIndex] ?? null;
  }, [results, selectedIndex]);

  return {
    query,
    setQuery,
    results,
    isOpen,
    open,
    close,
    selectedIndex,
    moveUp,
    moveDown,
    getSelected,
  };
}
