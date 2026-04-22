import Fuse from 'fuse.js';
import type { Manifest } from '../types';
import { getLessonUrl } from './manifest';

export interface SearchItem {
  title: string;
  slug: string;
  levelTitle: string;
  levelId: number;
  topicTitle: string;
  url: string;
  searchText: string;
}

let cachedFuse: Fuse<SearchItem> | null = null;

export function buildSearchIndex(manifest: Manifest): Fuse<SearchItem> {
  if (cachedFuse) return cachedFuse;

  const items: SearchItem[] = [];

  for (const level of manifest.levels) {
    for (const topic of level.topics) {
      for (const lesson of topic.lessons) {
        items.push({
          title: lesson.title,
          slug: lesson.slug,
          levelTitle: level.title,
          levelId: level.id,
          topicTitle: topic.title,
          url: getLessonUrl(level.id, topic, null, lesson),
          searchText: lesson.searchText,
        });
      }
      for (const subtopic of topic.subtopics) {
        for (const lesson of subtopic.lessons) {
          items.push({
            title: lesson.title,
            slug: lesson.slug,
            levelTitle: level.title,
            levelId: level.id,
            topicTitle: topic.title,
            url: getLessonUrl(level.id, topic, subtopic, lesson),
            searchText: lesson.searchText,
          });
        }
      }
    }
  }

  cachedFuse = new Fuse(items, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'topicTitle', weight: 1.5 },
      { name: 'levelTitle', weight: 1 },
      { name: 'searchText', weight: 0.5 },
    ],
    threshold: 0.3,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  return cachedFuse;
}

/** Extract a snippet around the first match in searchText */
export function extractSnippet(
  text: string,
  matches: readonly Fuse.FuseResultMatch[] | undefined,
  maxLen = 100,
): string | null {
  if (!matches) return null;

  const contentMatch = matches.find((m) => m.key === 'searchText');
  if (!contentMatch?.indices?.length) return null;

  const [start] = contentMatch.indices[0];
  const snippetStart = Math.max(0, start - 30);
  const snippetEnd = Math.min(text.length, snippetStart + maxLen);

  let snippet = text.slice(snippetStart, snippetEnd).replace(/\n/g, ' ').trim();
  if (snippetStart > 0) snippet = '...' + snippet;
  if (snippetEnd < text.length) snippet = snippet + '...';

  return snippet;
}
