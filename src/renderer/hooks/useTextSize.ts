import { useEffect, useState } from 'react';

export const MIN_TEXT_SIZE = 80;
export const MAX_TEXT_SIZE = 160;
export const DEFAULT_TEXT_SIZE = 100;
const PREFERENCE_KEY = 'rowly.textSize.v1';

export const useTextSize = () => {
  const [textSize, setTextSize] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(PREFERENCE_KEY));
      return Number.isInteger(saved) && saved >= MIN_TEXT_SIZE && saved <= MAX_TEXT_SIZE && saved % 10 === 0
        ? saved
        : DEFAULT_TEXT_SIZE;
    } catch {
      return DEFAULT_TEXT_SIZE;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCE_KEY, String(textSize));
    } catch {
      // The control remains usable when storage is unavailable.
    }
  }, [textSize]);

  return { textSize, setTextSize };
};
