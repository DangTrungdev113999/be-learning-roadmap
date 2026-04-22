import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAiChat } from '../../hooks/useAiChat';
import { ApiKeyModal } from './ApiKeyModal';

interface AiChatProps {
  lessonTitle: string;
  content: string;
}

export function AiChat({ lessonTitle, content }: AiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    getApiKey,
    setApiKey,
    removeApiKey,
  } = useAiChat(lessonTitle, content);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (!getApiKey()) {
      setKeyModalOpen(true);
      return;
    }
    setInput('');
    sendMessage(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button — glowing pulse when closed */}
      <motion.button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all ${
          isOpen
            ? 'bg-gh-bg-secondary text-gh-text-secondary hover:text-gh-text-primary'
            : 'bg-gradient-to-br from-gh-accent-green to-gh-accent-blue text-white shadow-gh-accent-green/25'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
      >
        {isOpen ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <span className="font-mono text-sm font-extrabold">AI</span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-24 right-6 z-40 flex h-[520px] w-[400px] flex-col overflow-hidden rounded-2xl border border-gh-border/50 bg-gh-bg-primary shadow-2xl shadow-black/30"
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            {/* Header — gradient accent */}
            <div className="relative border-b border-gh-border/50 px-4 py-3">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gh-accent-green/50 via-gh-accent-blue/50 to-gh-accent-green/50" />
              <div className="flex items-center gap-3">
                {/* AI avatar */}
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gh-accent-green to-gh-accent-blue">
                  <span className="font-mono text-[10px] font-extrabold text-white">AI</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gh-text-primary">AI Tutor</h3>
                  <p className="truncate text-[11px] text-gh-text-secondary">{lessonTitle}</p>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setKeyModalOpen(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gh-text-secondary transition-colors hover:bg-gh-bg-secondary hover:text-gh-text-primary"
                    title="API Key"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>
                  <button
                    onClick={clearMessages}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gh-text-secondary transition-colors hover:bg-gh-bg-secondary hover:text-gh-text-primary"
                    title="Clear"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gh-accent-green/20 to-gh-accent-blue/20">
                    <span className="font-mono text-lg font-bold text-gh-accent-green">?</span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gh-text-primary">Hỏi gì về bài này?</p>
                    <p className="mt-1 text-[11px] text-gh-text-secondary">AI sẽ trả lời dựa trên nội dung bài học</p>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="mr-2 mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-gh-accent-green to-gh-accent-blue">
                      <span className="font-mono text-[8px] font-bold text-white">AI</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-gh-accent-blue/15 text-gh-text-primary'
                        : 'rounded-bl-sm bg-gh-bg-secondary text-gh-text-primary'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                      {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                        <motion.span
                          className="ml-0.5 inline-block h-4 w-0.5 rounded-full bg-gh-accent-green"
                          animate={{ opacity: [1, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity }}
                        />
                      )}
                    </p>
                  </div>
                </motion.div>
              ))}

              {error && (
                <div className="mb-3 rounded-xl border border-gh-accent-red/20 bg-gh-accent-red/5 px-3.5 py-2.5 text-[12px] text-gh-accent-red">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input — clean bottom bar */}
            <div className="border-t border-gh-border/50 bg-gh-bg-secondary/30 px-3 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Hỏi về bài học này..."
                  rows={1}
                  className="max-h-20 flex-1 resize-none rounded-xl border-0 bg-gh-bg-primary px-3.5 py-2.5 text-sm text-gh-text-primary outline-none ring-1 ring-gh-border/50 placeholder:text-gh-text-secondary/60 focus:ring-gh-accent-green/50"
                />
                {isStreaming ? (
                  <motion.button
                    onClick={stopStreaming}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gh-accent-red text-white"
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gh-accent-green to-gh-accent-blue text-white disabled:opacity-30"
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-5 5m5-5l5 5" />
                    </svg>
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ApiKeyModal
        isOpen={keyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        currentKey={getApiKey()}
        onSave={setApiKey}
        onRemove={removeApiKey}
      />
    </>
  );
}
