import type {
  Capture,
  Meal,
  Plate,
  PlateItem,
  SavedMeal,
  SavedPlate,
} from "../types";

const KEYS = {
  apiKey: "ugaplate.apiKey",
  model: "ugaplate.model",
  hall: "ugaplate.hall",
  meal: "ugaplate.meal",
  /** Legacy single-plate key — migrated on read. */
  plate: "ugaplate.plate",
  captures: "ugaplate.captures",
  recents: "ugaplate.recents",
  favorites: "ugaplate.favorites",
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

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function plateLabel(index: number) {
  if (index === 0) return "Plate 1";
  if (index === 1) return "Seconds";
  if (index === 2) return "Thirds";
  return `Plate ${index + 1}`;
}

export function emptyPlate(index = 0): Plate {
  return { id: newId(), label: plateLabel(index), items: [] };
}

export function emptyMeal(): Meal {
  const plate = emptyPlate(0);
  return { plates: [plate], activePlateId: plate.id };
}

function migrateMeal(): Meal {
  const meal = read<Meal | null>(KEYS.meal, null);
  if (meal?.plates?.length && meal.activePlateId) {
    const active =
      meal.plates.find((p) => p.id === meal.activePlateId)?.id ??
      meal.plates[0].id;
    return { plates: meal.plates, activePlateId: active };
  }

  // Older builds stored a flat item list.
  const legacy = read<PlateItem[]>(KEYS.plate, []);
  if (legacy.length) {
    const plate = { ...emptyPlate(0), items: legacy };
    const next = { plates: [plate], activePlateId: plate.id };
    write(KEYS.meal, next);
    localStorage.removeItem(KEYS.plate);
    return next;
  }

  return emptyMeal();
}

export const storage = {
  getApiKey: () => read<string>(KEYS.apiKey, ""),
  setApiKey: (v: string) => write(KEYS.apiKey, v.trim()),

  /** "auto" walks the model fallback chain; anything else pins one model. */
  getModel: () => read<string>(KEYS.model, "auto"),
  setModel: (v: string) => write(KEYS.model, v),

  getHall: () => read<string>(KEYS.hall, ""),
  setHall: (v: string) => write(KEYS.hall, v),

  getMeal: () => migrateMeal(),
  setMeal: (v: Meal) => write(KEYS.meal, v),

  /**
   * Label photos waiting to be read. Persisted because iOS can discard a
   * backgrounded tab, and losing a line's worth of photos would be far worse
   * than the storage cost.
   */
  getCaptures: () => read<Capture[]>(KEYS.captures, []),
  setCaptures: (v: Capture[]) => {
    try {
      localStorage.setItem(KEYS.captures, JSON.stringify(v));
    } catch {
      try {
        localStorage.setItem(KEYS.captures, JSON.stringify(v.slice(-4)));
      } catch {
        localStorage.removeItem(KEYS.captures);
      }
    }
  },

  /** Food ids most recently added, newest first. */
  getRecents: () => read<number[]>(KEYS.recents, []),
  pushRecent: (id: number) => {
    const next = [id, ...read<number[]>(KEYS.recents, []).filter((x) => x !== id)];
    write(KEYS.recents, next.slice(0, 30));
  },

  /** Food ids the user starred for fast pickup in line. */
  getFavorites: () => read<number[]>(KEYS.favorites, []),
  isFavorite: (id: number) => read<number[]>(KEYS.favorites, []).includes(id),
  toggleFavorite: (id: number) => {
    const current = read<number[]>(KEYS.favorites, []);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [id, ...current];
    write(KEYS.favorites, next.slice(0, 40));
    return next.includes(id);
  },

  getHistory: (): SavedMeal[] => {
    const raw = read<Array<SavedMeal | SavedPlate>>(KEYS.history, []);
    return raw.map((entry) => {
      if ("plates" in entry && Array.isArray(entry.plates)) return entry;
      // Legacy single-plate history row.
      const legacy = entry as SavedPlate;
      return {
        id: legacy.id,
        savedAt: legacy.savedAt,
        plates: [{ label: "Plate 1", items: legacy.items, totals: legacy.totals }],
        totals: legacy.totals,
      };
    });
  },
  pushHistory: (meal: SavedMeal) => {
    const next = [meal, ...storage.getHistory()];
    write(KEYS.history, next.slice(0, 60));
  },
  clearHistory: () => write(KEYS.history, []),
};
