import type { PlateItem, SavedPlate } from "../types";

const KEYS = {
  apiKey: "ugaplate.apiKey",
  model: "ugaplate.model",
  hall: "ugaplate.hall",
  plate: "ugaplate.plate",
  recents: "ugaplate.recents",
  history: "ugaplate.history",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota; the app still works for this session.
  }
}

export const storage = {
  getApiKey: () => read<string>(KEYS.apiKey, ""),
  setApiKey: (v: string) => write(KEYS.apiKey, v.trim()),

  /** "auto" walks the model fallback chain; anything else pins one model. */
  getModel: () => read<string>(KEYS.model, "auto"),
  setModel: (v: string) => write(KEYS.model, v),

  getHall: () => read<string>(KEYS.hall, ""),
  setHall: (v: string) => write(KEYS.hall, v),

  getPlate: () => read<PlateItem[]>(KEYS.plate, []),
  setPlate: (v: PlateItem[]) => write(KEYS.plate, v),

  /** Food ids most recently added, newest first. */
  getRecents: () => read<number[]>(KEYS.recents, []),
  pushRecent: (id: number) => {
    const next = [id, ...read<number[]>(KEYS.recents, []).filter((x) => x !== id)];
    write(KEYS.recents, next.slice(0, 30));
  },

  getHistory: () => read<SavedPlate[]>(KEYS.history, []),
  pushHistory: (plate: SavedPlate) => {
    const next = [plate, ...read<SavedPlate[]>(KEYS.history, [])];
    write(KEYS.history, next.slice(0, 60));
  },
  clearHistory: () => write(KEYS.history, []),
};
