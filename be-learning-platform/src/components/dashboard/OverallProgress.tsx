import { motion } from 'framer-motion';
import type { Manifest } from '../../types';
import { useProgress } from '../../hooks/useProgress';
import { flattenLessons } from '../../lib/manifest';

interface OverallProgressProps {
  manifest: Manifest;
}

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex h-32 w-32 flex-shrink-0 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
        {/* Background track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-gh-border/30"
        />
        {/* Progress arc */}
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent-green)" />
            <stop offset="100%" stopColor="var(--accent-blue)" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-3xl font-bold text-gh-text-primary"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {percentage}%
        </motion.span>
      </div>
    </div>
  );
}

export function OverallProgress({ manifest }: OverallProgressProps) {
  const { isLessonComplete, getStreak } = useProgress();

  const allLessons = flattenLessons(manifest);
  let completedCount = 0;

  for (const level of manifest.levels) {
    for (const topic of level.topics) {
      for (const lesson of topic.lessons) {
        if (isLessonComplete(level.id, lesson.slug)) {
          completedCount++;
        }
      }
      for (const subtopic of topic.subtopics) {
        for (const lesson of subtopic.lessons) {
          if (isLessonComplete(level.id, lesson.slug)) {
            completedCount++;
          }
        }
      }
    }
  }

  const totalLessons = allLessons.length;
  const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const streak = getStreak();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-8 overflow-hidden rounded-xl border border-gh-border/60 bg-gradient-to-br from-gh-bg-secondary to-gh-bg-primary p-5"
    >
      <div className="flex items-center gap-6">
        {/* Circular progress */}
        <CircularProgress percentage={percentage} />

        {/* Stats */}
        <div className="flex-1">
          <p className="mb-1 font-mono text-xs font-medium uppercase tracking-widest text-gh-text-secondary">
            Overall Progress
          </p>
          <p className="text-sm text-gh-text-secondary">
            <span className="font-semibold text-gh-text-primary">{completedCount}</span>
            <span className="mx-1 text-gh-border">/</span>
            <span>{totalLessons} lessons completed</span>
          </p>

          {/* Progress bar (thin supplementary) */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gh-border/20">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gh-accent-green to-gh-accent-blue"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Streak badge */}
        <div className="flex flex-col items-center gap-1 rounded-xl border border-gh-border/40 bg-gh-bg-secondary/60 px-5 py-3">
          <motion.span
            className="text-3xl font-bold text-gh-accent-orange"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.5, type: 'spring' }}
          >
            {streak}
          </motion.span>
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-gh-text-secondary">
            day streak
          </span>
          <div className="mt-0.5 h-1 w-6 rounded-full bg-gradient-to-r from-gh-accent-orange to-gh-accent-red" />
        </div>
      </div>
    </motion.div>
  );
}
