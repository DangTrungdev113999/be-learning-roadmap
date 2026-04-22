import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useProgress } from '../../hooks/useProgress';

export function ContinueCard() {
  const { getLastRead } = useProgress();
  const lastRead = getLastRead();

  if (!lastRead) return null;

  return (
    <Link to={lastRead.url ?? `/level/${lastRead.levelId}/${lastRead.slug}`}>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="group relative cursor-pointer overflow-hidden rounded-xl border border-gh-border/60 bg-gh-bg-secondary p-4 shadow-md shadow-black/10 transition-shadow duration-200 hover:shadow-xl hover:shadow-black/20"
      >
        {/* Gradient top accent */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-gh-accent-blue via-gh-accent-purple to-gh-accent-blue" />

        {/* Background decoration */}
        <span className="pointer-events-none absolute -bottom-2 -right-1 select-none font-mono text-6xl font-black leading-none text-gh-text-primary/[0.03]">
          &gt;_
        </span>

        <p className="relative mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-widest text-gh-accent-blue">
          <motion.span
            className="inline-block"
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            &rarr;
          </motion.span>
          Continue where you left off
        </p>
        <h3 className="relative text-sm font-bold text-gh-text-primary">{lastRead.title}</h3>
        <p className="relative mt-3 text-xs font-medium text-gh-accent-green transition-colors group-hover:text-gh-accent-green/80">
          Resume &rarr;
        </p>
      </motion.div>
    </Link>
  );
}
