import { motion } from 'framer-motion';

const WAVE_EMOJI = '\u{1F44B}';

export function WelcomeSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      {/* Terminal prompt decoration */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md bg-gh-bg-secondary/80 px-2.5 py-1 font-mono text-xs">
          <span className="text-gh-accent-green">$</span>
          <span className="text-gh-text-secondary">whoami</span>
          <motion.span
            className="inline-block h-3.5 w-1.5 bg-gh-accent-green/80"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
          />
        </div>
      </div>

      <h1 className="text-3xl font-bold md:text-4xl">
        <span className="bg-gradient-to-r from-gh-text-primary via-gh-accent-green to-gh-accent-blue bg-clip-text text-transparent">
          {`Ch\u00e0o b\u1ea1n`}
        </span>
        <span className="ml-2 inline-block">
          <motion.span
            className="inline-block"
            animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
          >
            {WAVE_EMOJI}
          </motion.span>
        </span>
      </h1>

      <p className="mt-2 text-sm text-gh-text-secondary md:text-base">
        FE dev &rarr; Backend journey <span className="mx-1 text-gh-border">|</span> Finpath System
      </p>
    </motion.div>
  );
}
