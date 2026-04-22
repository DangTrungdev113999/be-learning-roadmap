import type { ChecklistItem } from '../../types';
import { useProgress } from '../../hooks/useProgress';

interface LessonChecklistProps {
  levelId: number;
  checklist: ChecklistItem[];
}

export function LessonChecklist({ levelId, checklist }: LessonChecklistProps) {
  const { isChecklistItemDone, toggleChecklistItem } = useProgress();

  if (checklist.length === 0) return null;

  return (
    <section className="mt-5 border-t border-gh-border pt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gh-text-secondary">
        Checklist
      </p>
      <ul className="space-y-1">
        {checklist.map((item) => {
          const done = isChecklistItemDone(levelId, item.index);
          return (
            <li key={item.index}>
              <label
                className={`flex cursor-pointer items-start gap-2 text-xs ${
                  done ? 'opacity-60' : ''
                }`}
              >
                {/* Checkbox icon */}
                <span
                  className="mt-0.5 flex-shrink-0"
                  onClick={() => toggleChecklistItem(levelId, item.index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      toggleChecklistItem(levelId, item.index);
                    }
                  }}
                  role="checkbox"
                  aria-checked={done}
                  tabIndex={0}
                >
                  {done ? (
                    <svg
                      className="h-4 w-4 text-gh-accent-green"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4 text-gh-text-secondary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    </svg>
                  )}
                </span>
                <span
                  className={`${done ? 'line-through' : ''} text-gh-text-primary`}
                >
                  {item.text}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
