"use client";

import { useEffect, useRef, useState } from "react";

/** Saves `value` to localStorage under `key`, debounced. Returns the last-saved timestamp. */
export function useAutosaveDraft<T>(key: string, value: T, enabled: boolean) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(value));
      setSavedAt(new Date());
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(value), enabled]);

  return savedAt;
}

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  localStorage.removeItem(key);
}
