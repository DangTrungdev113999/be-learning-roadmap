import { useState, useCallback } from 'react';
import { storage } from '../lib/storage';

interface LastRead {
  levelId: number;
  slug: string;
  title: string;
  url: string;
}

interface StreakData {
  count: number;
  date: string; // ISO date string: YYYY-MM-DD
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function useProgress() {
  // Counter to force re-renders when localStorage changes
  const [version, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);

  const isLessonComplete = useCallback((levelId: number, slug: string): boolean => {
    return storage.get<boolean>(`progress:${levelId}:${slug}`, false);
  }, []);

  const toggleLesson = useCallback((levelId: number, slug: string): void => {
    const key = `progress:${levelId}:${slug}`;
    const current = storage.get<boolean>(key, false);
    storage.set(key, !current);
    bump();
  }, [bump]);

  /** Explicitly set lesson complete state (no toggle — safe for useEffect) */
  const setLessonDone = useCallback((levelId: number, slug: string, done: boolean): void => {
    const key = `progress:${levelId}:${slug}`;
    const current = storage.get<boolean>(key, false);
    if (current !== done) {
      storage.set(key, done);
      bump();
    }
  }, [bump]);

  const isChecklistItemDone = useCallback((levelId: number, index: number): boolean => {
    return storage.get<boolean>(`checklist:${levelId}:${index}`, false);
  }, []);

  const toggleChecklistItem = useCallback((levelId: number, index: number): void => {
    const key = `checklist:${levelId}:${index}`;
    const current = storage.get<boolean>(key, false);
    storage.set(key, !current);
    bump();
  }, [bump]);

  const setLastRead = useCallback((data: LastRead): void => {
    storage.set('last-read', data);
    bump();
  }, [bump]);

  const getLastRead = useCallback((): LastRead | null => {
    return storage.get<LastRead | null>('last-read', null);
  }, []);

  const getStreak = useCallback((): number => {
    const data = storage.get<StreakData | null>('streak', null);
    const today = todayISO();

    if (!data) {
      storage.set('streak', { count: 1, date: today });
      return 1;
    }

    if (data.date === today) {
      return data.count;
    }

    if (data.date === yesterdayISO()) {
      const newCount = data.count + 1;
      storage.set('streak', { count: newCount, date: today });
      return newCount;
    }

    // Streak broken — reset to 1
    storage.set('streak', { count: 1, date: today });
    return 1;
  }, []);

  return {
    isLessonComplete,
    toggleLesson,
    setLessonDone,
    isChecklistItemDone,
    toggleChecklistItem,
    setLastRead,
    getLastRead,
    getStreak,
    version, // changes on every localStorage update — use in useMemo deps
  };
}
