interface ProgressBarProps {
  value: number;
  color?: string;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
} as const;

export function ProgressBar({
  value,
  color = 'bg-gh-accent-green',
  size = 'sm',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`w-full overflow-hidden rounded-full bg-gh-bg-secondary ${sizeClasses[size]}`}>
      <div
        className={`${sizeClasses[size]} rounded-full ${color} transition-all duration-300 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
