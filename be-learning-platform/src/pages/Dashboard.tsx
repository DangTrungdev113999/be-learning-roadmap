import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Manifest } from '../types';
import { loadManifest } from '../lib/manifest';
import { TopNav } from '../components/layout/TopNav';
import { WelcomeSection } from '../components/dashboard/WelcomeSection';
import { OverallProgress } from '../components/dashboard/OverallProgress';
import { LevelCard } from '../components/dashboard/LevelCard';
import { ContinueCard } from '../components/dashboard/ContinueCard';
import { SearchModal } from '../components/features/SearchModal';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function Dashboard() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    loadManifest().then(setManifest);
  }, []);

  // Global Cmd+K / Ctrl+K listener
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  if (!manifest) return null;

  return (
    <div className="min-h-screen bg-gh-bg-primary">
      <TopNav onSearchClick={() => setSearchOpen(true)} />

      {/* Search modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        manifest={manifest}
      />

      <motion.main
        className="mx-auto max-w-5xl px-5 py-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <WelcomeSection />
        <OverallProgress manifest={manifest} />

        <motion.div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {manifest.levels.map(level => (
            <motion.div key={level.id} variants={itemVariants}>
              <LevelCard level={level} />
            </motion.div>
          ))}
          <motion.div variants={itemVariants}>
            <ContinueCard />
          </motion.div>
        </motion.div>
      </motion.main>
    </div>
  );
}
