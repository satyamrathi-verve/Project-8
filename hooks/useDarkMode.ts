"use client";

import { useEffect, useState } from "react";

// Shared with the rest of the app's dark-mode toggle (see the theme script in app/layout.tsx).
const STORAGE_KEY = "gl_theme";

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? stored === "dark" : prefersDark;
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }

  return { dark, toggle };
}
