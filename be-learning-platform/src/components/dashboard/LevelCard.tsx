import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Level } from '../../types';
import { Badge } from '../ui/Badge';
import { useProgress } from '../../hooks/useProgress';
import { getLessonUrl } from '../../lib/manifest';

interface LevelCardProps {
  level: Level;
}

function getNextIncompleteLessonUrl(level: Level, isLessonComplete: (levelId: number, slug: string) => boolean): string | null {
  // Find first incomplete lesson
  for (const topic of level.topics) {
    for (const lesson of topic.lessons) {
      if (!isLessonComplete(level.id, lesson.slug)) {
        return getLessonUrl(level.id, topic, null, lesson);
      }
    }
    for (const subtopic of topic.subtopics) {
      for (const lesson of subtopic.lessons) {
        if (!isLessonComplete(level.id, lesson.slug)) {
          return getLessonUrl(level.id, topic, subtopic, lesson);
        }
      }
    }
  }
  // All complete — go to first lesson
  for (const topic of level.topics) {
    if (topic.lessons.length > 0) {
      return getLessonUrl(level.id, topic, null, topic.lessons[0]);
    }
    for (const subtopic of topic.subtopics) {
      if (subtopic.lessons.length > 0) {
        return getLessonUrl(level.id, topic, subtopic, subtopic.lessons[0]);
      }
    }
  }
  return null;
}

function countLessons(level: Level): number {
  let count = 0;
  for (const topic of level.topics) {
    count += topic.lessons.length;
    for (const subtopic of topic.subtopics) {
      count += subtopic.lessons.length;
    }
  }
  return count;
}

export function LevelCard({ level }: LevelCardProps) {
  const { isLessonComplete } = useProgress();

  const totalLessons = countLessons(level);

  let completedLessons = 0;
  for (const topic of level.topics) {
    for (const lesson of topic.lessons) {
      if (isLessonComplete(level.id, lesson.slug)) completedLessons++;
    }
    for (const subtopic of topic.subtopics) {
      for (const lesson of subtopic.lessons) {
        if (isLessonComplete(level.id, lesson.slug)) completedLessons++;
      }
    }
  }

  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const hasProgress = completedLessons > 0;
  const firstUrl = getNextIncompleteLessonUrl(level, isLessonComplete);

  // Determine badge variant and status
  let badgeVariant: 'green' | 'orange' | 'default' = 'default';
  let statusText = 'COMING SOON';
  let statusColor = 'text-gh-text-secondary';

  if (!level.hasContent) {
    badgeVariant = 'default';
    statusText = 'COMING SOON';
    statusColor = 'text-gh-text-secondary';
  } else if (hasProgress) {
    badgeVariant = 'green';
    statusText = 'IN PROGRESS';
    statusColor = 'text-gh-accent-green';
  } else {
    badgeVariant = 'orange';
    statusText = 'UNLOCKED';
    statusColor = 'text-gh-text-secondary';
  }

  const levelNum = String(level.id).padStart(2, '0');

  const card = (
    <motion.div
      whileHover={level.hasContent ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gh-border/60 bg-gh-bg-secondary p-4 transition-shadow duration-200 ${
        level.hasContent ? 'shadow-md shadow-black/10 hover:shadow-xl hover:shadow-black/20' : ''
      } ${!level.hasContent ? 'opacity-40' : ''}`}
    >
      {/* Gradient top border */}
      {hasProgress && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-gh-accent-green via-gh-accent-blue to-gh-accent-green" />
      )}

      {/* Background watermark number */}
      <span className="pointer-events-none absolute -bottom-3 -right-1 select-none font-mono text-7xl font-black leading-none text-gh-text-primary/[0.03]">
        {levelNum}
      </span>

      {/* Header row */}
      <div className="relative mb-3 flex items-center justify-between">
        <Badge variant={badgeVariant}>LVL {level.id}</Badge>
        <span className={`text-[10px] font-medium uppercase tracking-wide ${statusColor}`}>
          {hasProgress && (
            <motion.span
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-gh-accent-green"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          {statusText}
        </span>
      </div>

      {/* Content */}
      <h3 className="relative text-sm font-bold text-gh-text-primary">{level.title}</h3>
      <p className="relative mt-1 text-xs leading-relaxed text-gh-text-secondary">{level.description}</p>

      {/* Progress section — pushed to bottom */}
      {level.hasContent ? (
        <div className="relative mt-auto pt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gh-border/20">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gh-accent-green to-gh-accent-blue"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-gh-text-secondary">
            <span className="font-medium text-gh-text-primary">{completedLessons}</span>/{totalLessons} lessons
          </p>
        </div>
      ) : null}
    </motion.div>
  );

  if (level.hasContent && firstUrl) {
    return <Link to={firstUrl}>{card}</Link>;
  }

  return card;
}
