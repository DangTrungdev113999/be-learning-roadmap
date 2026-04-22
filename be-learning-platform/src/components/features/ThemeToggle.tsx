import { motion } from 'framer-motion';
import { useTheme } from '../../hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <motion.button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded border border-gh-border bg-gh-bg-secondary text-sm"
      whileTap={{ scale: 0.9 }}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </motion.span>
    </motion.button>
  );
}
