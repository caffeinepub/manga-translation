import { useState, useCallback } from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
} from "../types/manga";

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadFromStorage);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const saveSettings = useCallback((updates?: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = updates ? { ...prev, ...updates } : prev;
      saveToStorage(next);
      return next;
    });
  }, []);

  return { settings, updateSettings, saveSettings };
}
