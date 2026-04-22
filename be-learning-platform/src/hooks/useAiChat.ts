import { useState, useCallback, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';
import { storage } from '../lib/storage';

const STORAGE_KEY_API_KEY = 'ai-chat:gemini-key';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useAiChat(lessonTitle: string, lessonContent: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const getApiKey = useCallback((): string | null => {
    return storage.get<string | null>(STORAGE_KEY_API_KEY, null);
  }, []);

  const setApiKey = useCallback((key: string): void => {
    storage.set(STORAGE_KEY_API_KEY, key);
  }, []);

  const removeApiKey = useCallback((): void => {
    storage.remove(STORAGE_KEY_API_KEY);
  }, []);

  const clearMessages = useCallback((): void => {
    setMessages([]);
    setError(null);
  }, []);

  const stopStreaming = useCallback((): void => {
    abortRef.current = true;
  }, []);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        setError('Please set your Google Gemini API key first.');
        return;
      }

      const trimmed = userMessage.trim();
      if (!trimmed) return;

      setError(null);
      abortRef.current = false;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      setMessages([...updatedMessages, assistantMsg]);
      setIsStreaming(true);

      try {
        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `You are an AI tutor helping a frontend developer learn backend development.
You are currently helping with the lesson: "${lessonTitle}".
Answer questions based on the lesson content below. Be concise. Use Vietnamese.

--- LESSON CONTENT ---
${lessonContent}`;

        const contents: Content[] = updatedMessages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const response = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
          },
        });

        let accumulated = '';

        for await (const chunk of response) {
          if (abortRef.current) {
            return;
          }
          const text = chunk.text ?? '';
          accumulated += text;
          setMessages([
            ...updatedMessages,
            { role: 'assistant', content: accumulated },
          ]);
        }
      } catch (err: unknown) {
        if (abortRef.current) {
          // User stopped streaming — not an error
          setIsStreaming(false);
          return;
        }
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, getApiKey, lessonTitle, lessonContent],
  );

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    getApiKey,
    setApiKey,
    removeApiKey,
  };
}
