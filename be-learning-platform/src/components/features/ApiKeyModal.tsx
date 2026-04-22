import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string | null;
  onSave: (key: string) => void;
  onRemove: () => void;
}

function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
}

export function ApiKeyModal({
  isOpen,
  onClose,
  currentKey,
  onSave,
  onRemove,
}: ApiKeyModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  }

  function handleRemove() {
    onRemove();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-lg border border-gh-border bg-gh-bg-secondary p-6 shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h2 className="mb-1 text-base font-semibold text-gh-text-primary">
                Google Gemini API Key
              </h2>
              <p className="mb-4 text-xs text-gh-text-secondary">
                Your key is stored locally in the browser and never sent to any
                server other than Google.
              </p>

              {currentKey && (
                <div className="mb-3 flex items-center gap-2 rounded border border-gh-border bg-gh-bg-primary px-3 py-2">
                  <span className="flex-1 font-mono text-xs text-gh-text-secondary">
                    {maskKey(currentKey)}
                  </span>
                  <button
                    onClick={handleRemove}
                    className="rounded px-2 py-1 text-xs text-gh-accent-red hover:bg-gh-accent-red/10"
                  >
                    Remove
                  </button>
                </div>
              )}

              <input
                ref={inputRef}
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  currentKey ? 'Enter new key to replace...' : 'AIza...'
                }
                className="mb-4 w-full rounded border border-gh-border bg-gh-bg-primary px-3 py-2 text-sm text-gh-text-primary outline-none placeholder:text-gh-text-secondary focus:border-gh-accent-green"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded border border-gh-border px-3 py-1.5 text-xs text-gh-text-secondary hover:text-gh-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!value.trim()}
                  className="rounded bg-gh-accent-green px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  Save Key
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
