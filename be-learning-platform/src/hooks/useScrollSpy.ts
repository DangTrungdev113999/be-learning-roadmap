import { useState, useEffect } from 'react';

export function useScrollSpy(headingIds: string[]): string {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (headingIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );

    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [headingIds]);

  return activeId;
}
