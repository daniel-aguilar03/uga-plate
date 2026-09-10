import { foodById, matchLabelText, type LabelMatch, type Ranked } from "./catalog";
import type { Food } from "../types";

const IMAGE_KEY = "ugaplate.imageScanCache";
const NAME_KEY = "ugaplate.nameFoodCache";
const SCANNED_KEY = "ugaplate.recentlyScanned";

const IMAGE_MAX = 80;
const NAME_MAX = 120;
const SCANNED_MAX = 20;
/** Keep scan memory for two weeks — long enough for the same station labels. */
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

type ImageEntry = { names: string[]; at: number };
type NameEntry = { foodId: number; at: number };
type ScannedEntry = { foodId: number; at: number };

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota — drop the cache rather than crash the plate flow.
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function prune<T extends { at: number }>(
  map: Record<string, T>,
  max: number,
): Record<string, T> {
  const now = Date.now();
  const fresh = Object.entries(map).filter(([, v]) => now - v.at < TTL_MS);
  fresh.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(fresh.slice(0, max));
}

/** Stable fingerprint of a downscaled JPEG so identical snaps skip Gemini. */
export async function hashImage(base64: string): Promise<string> {
  const bytes = new TextEncoder().encode(base64);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const scanCache = {
  getImageNames(hash: string): string[] | null {
    const map = prune(readMap<ImageEntry>(IMAGE_KEY), IMAGE_MAX);
    writeMap(IMAGE_KEY, map);
    const hit = map[hash];
    return hit?.names ?? null;
  },

  setImageNames(hash: string, names: string[]) {
    if (!names.length) return;
    const map = prune(readMap<ImageEntry>(IMAGE_KEY), IMAGE_MAX - 1);
    map[hash] = { names, at: Date.now() };
    writeMap(IMAGE_KEY, map);
  },

  getFoodIdForName(name: string): number | null {
    const map = prune(readMap<NameEntry>(NAME_KEY), NAME_MAX);
    writeMap(NAME_KEY, map);
    return map[normalizeName(name)]?.foodId ?? null;
  },

  /** Remember which dish the user confirmed for a given OCR string. */
  rememberName(name: string, foodId: number) {
    const key = normalizeName(name);
    if (!key) return;
    const map = prune(readMap<NameEntry>(NAME_KEY), NAME_MAX - 1);
    map[key] = { foodId, at: Date.now() };
    writeMap(NAME_KEY, map);
  },

  /** Foods confirmed from labels recently — for one-tap seconds. */
  pushScanned(foodId: number) {
    const now = Date.now();
    const list = readScanned()
      .filter((e) => e.foodId !== foodId && now - e.at < TTL_MS)
      .slice(0, SCANNED_MAX - 1);
    list.unshift({ foodId, at: now });
    try {
      localStorage.setItem(SCANNED_KEY, JSON.stringify(list));
    } catch {
      /* ignore quota */
    }
  },

  recentlyScannedFoods(): Food[] {
    return readScanned()
      .map((e) => foodById(e.foodId))
      .filter((f): f is Food => Boolean(f));
  },
};

function readScanned(): ScannedEntry[] {
  try {
    const raw = localStorage.getItem(SCANNED_KEY);
    const list = raw ? (JSON.parse(raw) as ScannedEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Match OCR text to the catalog, preferring a dish the user already confirmed
 * for this exact label string so seconds don't need another guess.
 */
export function matchLabelWithCache(name: string, hall = ""): LabelMatch {
  const base = matchLabelText(name, hall);
  const cachedId = scanCache.getFoodIdForName(name);
  if (cachedId == null) return base;

  const food = foodById(cachedId);
  if (!food) return base;

  const rest = base.candidates.filter((c) => c.food.id !== food.id);
  const preferred: Ranked = {
    food,
    score: -2,
    raw: 0,
    exact: true,
  };
  return {
    candidates: [preferred, ...rest].slice(0, 5),
    confident: true,
  };
}
