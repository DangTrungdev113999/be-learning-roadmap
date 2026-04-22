export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },
};
