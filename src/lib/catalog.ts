import Fuse from "fuse.js";
import rawCatalog from "../data/catalog.json";
import type { Catalog, Food } from "../types";

const catalog = rawCatalog as Catalog;

export const HALLS = catalog.halls;
export const GENERATED_AT = catalog.generatedAt;

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The same dish appears under a separate id at each hall. Collapse rows that
 * share a name and identical macros into one entry listing every hall, so
 * search doesn't show five identical "Jasmine Rice" lines.
 */
function dedupe(foods: Food[]): Food[] {
  const merged = new Map<string, Food>();
  for (const food of foods) {
    const key = `${normalize(food.name)}|${food.calories}|${food.protein}|${food.carbs}|${food.fat}`;
    const hit = merged.get(key);
    if (hit) {
      hit.halls = [...new Set([...hit.halls, ...food.halls])].sort();
      hit.meals = [...new Set([...hit.meals, ...food.meals])];
      continue;
    }
    merged.set(key, { ...food, halls: [...food.halls], meals: [...food.meals] });
  }
  return [...merged.values()];
}

export const FOODS: Food[] = dedupe(catalog.foods);

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));
export const foodById = (id: number) => BY_ID.get(id);

const SEARCH_ROWS = FOODS.map((food) => ({
  food,
  name: food.name,
  normalized: normalize(food.name),
}));

const fuse = new Fuse(SEARCH_ROWS, {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "normalized", weight: 0.3 },
  ],
  includeScore: true,
  threshold: 0.42,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export type Ranked = {
  food: Food;
  /** Sort key, lower is better. Negative for strong matches. */
  score: number;
  /** Fuse's own 0-1 distance, before any bonuses. */
  raw: number;
  /** The dish name equals the query once punctuation is stripped. */
  exact: boolean;
};

/**
 * Lower is better. Nudges results toward dishes served at the hall you picked
 * and toward names that aren't padded with extra words, without ever hiding
 * a dish from another hall the way v1 did. Deliberately unclamped -- clamping
 * at zero collapses every strong match into a tie.
 */
function rank(raw: number, food: Food, q: string, hall: string) {
  const n = normalize(food.name);
  let score = raw;

  if (n === q) score -= 1;
  else if (n.startsWith(q)) score -= 0.5;
  else if (n.includes(q)) score -= 0.25;

  if (hall && food.halls.includes(hall)) score -= 0.05;

  // Prefer "Jasmine Rice" over "Jasmine Rice with Roasted Vegetable Medley".
  score += Math.min(n.length, 90) / 2000;

  return score;
}

export function searchFoods(query: string, hall = "", limit = 25): Ranked[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  return fuse
    .search(query.trim(), { limit: limit * 6 })
    .map(({ item, score }) => {
      const raw = score ?? 1;
      return {
        food: item.food,
        raw,
        exact: normalize(item.food.name) === q,
        score: rank(raw, item.food, q, hall),
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export type LabelMatch = {
  candidates: Ranked[];
  /** True only when one dish is clearly the answer, so we can skip the prompt. */
  confident: boolean;
};

/** A near-tie between the top two means the user has to decide, not us. */
const AMBIGUITY_GAP = 0.3;

/**
 * Match one line of label text to catalog dishes. Label titles often carry
 * trailing garnish text or an allergen word the OCR swept up, so we also try
 * a trimmed version of the query before giving up.
 *
 * Confidence matters here: UGA lists eight kinds of mashed potatoes spanning
 * 80 to 300 calories, so a bare read of "Mashed Potatoes" must ask rather than
 * silently commit to one of them.
 */
export function matchLabelText(text: string, hall = "", limit = 5): LabelMatch {
  const cleaned = text
    .replace(/\b(contains|allergens?|calories?|cal|serving size)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  let candidates = searchFoods(cleaned, hall, limit);

  if (!candidates.length) {
    // Retry on the first few words, which is usually the dish proper.
    const short = cleaned.split(" ").slice(0, 4).join(" ");
    if (short !== cleaned) candidates = searchFoods(short, hall, limit);
  }

  if (!candidates.length) return { candidates, confident: false };

  const [top, second] = candidates;
  const unambiguous = !second || second.score - top.score >= AMBIGUITY_GAP;
  const confident = top.exact || (top.raw <= 0.1 && unambiguous);

  return { candidates, confident };
}

/** "3 oz" / "1 each" -> a phrase that reads naturally next to a portion count. */
export function servingLabel(food: Food) {
  const unit = food.servingUnit.toLowerCase();
  if (unit === "each" || unit === "serving") {
    return food.servingAmount === "1"
      ? "1 piece"
      : `${food.servingAmount} pieces`;
  }
  return `${food.servingAmount} ${food.servingUnit}`;
}
