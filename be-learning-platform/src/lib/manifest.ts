import type { Manifest, Lesson, Level, Topic, Subtopic } from '../types';

// ─── Cached manifest ────────────────────────────────────────────────────────

let cachedManifest: Manifest | null = null;

export async function loadManifest(): Promise<Manifest> {
  if (cachedManifest) return cachedManifest;

  const response = await fetch('/content/manifest.json');
  if (!response.ok) {
    throw new Error('Failed to load manifest: ' + response.statusText);
  }
  cachedManifest = (await response.json()) as Manifest;
  return cachedManifest;
}

// ─── Breadcrumb type ─────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  href: string;
}

// ─── Lesson lookup result ────────────────────────────────────────────────────

export interface LessonLookup {
  lesson: Lesson;
  level: Level;
  topic: Topic;
  subtopic: Subtopic | null;
  breadcrumb: BreadcrumbItem[];
}

// ─── Adjacent lessons ────────────────────────────────────────────────────────

export interface AdjacentLessons {
  prev: Lesson | null;
  next: Lesson | null;
}

// ─── Flatten all lessons in order ────────────────────────────────────────────

export function flattenLessons(manifest: Manifest): Lesson[] {
  const lessons: Lesson[] = [];

  for (const level of manifest.levels) {
    for (const topic of level.topics) {
      lessons.push(...topic.lessons);
      for (const subtopic of topic.subtopics) {
        lessons.push(...subtopic.lessons);
      }
    }
  }

  return lessons;
}

// ─── Construct URL path from manifest data ───────────────────────────────────

export function getLessonUrl(
  levelId: number,
  topic: Topic,
  subtopic: Subtopic | null,
  lesson: Lesson,
): string {
  const parts = ['/level/' + levelId, topic.id];
  if (subtopic) {
    parts.push(subtopic.id);
  }
  parts.push(lesson.slug);
  return parts.join('/');
}

// ─── Find lesson by slug path ────────────────────────────────────────────────
// slugPath format: "level-1/topic-slug/lesson-slug" or "level-2/topic-slug/subtopic-slug/lesson-slug"

export function findLessonBySlugPath(
  manifest: Manifest,
  slugPath: string,
): LessonLookup | null {
  // Remove leading/trailing slashes and split
  const parts = slugPath.replace(/^\/+|\/+$/g, '').split('/');

  if (parts.length < 3) return null;

  // First part should match "level-{id}"
  const levelSlug = parts[0];
  const levelMatch = levelSlug.match(/^level-(\d+)$/);
  if (!levelMatch) return null;

  const levelId = parseInt(levelMatch[1], 10);
  const level = manifest.levels.find(l => l.id === levelId);
  if (!level) return null;

  const topicSlug = parts[1];
  const topic = level.topics.find(t => t.id === topicSlug);
  if (!topic) return null;

  // Try 4-part path first: level/topic/subtopic/lesson
  if (parts.length === 4) {
    const subtopicSlug = parts[2];
    const lessonSlug = parts[3];
    const subtopic = topic.subtopics.find(st => st.id === subtopicSlug);
    if (subtopic) {
      const lesson = subtopic.lessons.find(l => l.slug === lessonSlug);
      if (lesson) {
        const breadcrumb: BreadcrumbItem[] = [
          { label: level.title, href: '/' },
          { label: topic.title, href: getLessonUrl(level.id, topic, null, topic.lessons[0]) },
          { label: subtopic.title, href: getLessonUrl(level.id, topic, subtopic, subtopic.lessons[0]) },
          { label: lesson.title, href: getLessonUrl(level.id, topic, subtopic, lesson) },
        ];
        return { lesson, level, topic, subtopic, breadcrumb };
      }
    }
  }

  // Try 3-part path: level/topic/lesson
  if (parts.length === 3) {
    const lessonSlug = parts[2];
    const lesson = topic.lessons.find(l => l.slug === lessonSlug);
    if (lesson) {
      const breadcrumb: BreadcrumbItem[] = [
        { label: level.title, href: '/' },
        { label: topic.title, href: getLessonUrl(level.id, topic, null, topic.lessons[0]) },
        { label: lesson.title, href: getLessonUrl(level.id, topic, null, lesson) },
      ];
      return { lesson, level, topic, subtopic: null, breadcrumb };
    }
  }

  return null;
}

// ─── Get adjacent lessons for bottom navigation ─────────────────────────────

export function getAdjacentLessons(
  manifest: Manifest,
  currentSlug: string,
): AdjacentLessons {
  const allLessons = flattenLessons(manifest);
  const currentIndex = allLessons.findIndex(l => l.slug === currentSlug);

  if (currentIndex === -1) {
    return { prev: null, next: null };
  }

  return {
    prev: currentIndex > 0 ? allLessons[currentIndex - 1] : null,
    next: currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null,
  };
}
