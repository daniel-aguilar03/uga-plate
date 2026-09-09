/**
 * Builds src/data/catalog.json from UGA's public Nutrislice menus.
 *
 * The Nutrislice API sends no CORS header, so the browser can never call it.
 * We fetch it here instead and commit the result, which keeps the app itself
 * backend-free. Per-dish nutrition barely changes, so re-running this
 * occasionally (npm run data) is enough to stay current.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "src", "data", "catalog.json");

const HALLS = [
  { slug: "dining-hall-1", name: "Bolton" },
  { slug: "dining-hall-2", name: "Oglethorpe" },
  { slug: "dining-hall-3", name: "Snelling" },
  { slug: "dining-hall-4", name: "The Niche" },
  { slug: "dining-hall-5", name: "Village Summit" },
  { slug: "hillside-dining-commons", name: "Hillside" },
];

const MENU_TYPES = ["breakfast", "lunch", "dinner"];

/** How many weeks back to sweep. More weeks means broader menu-rotation coverage. */
const WEEKS_BACK = Number(process.env.WEEKS ?? 8);
const CONCURRENCY = 6;

function weekStarts(count) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${yyyy}/${mm}/${dd}`);
  }
  return out;
}

async function fetchWeek(hall, menuType, week) {
  const url = `https://uga.api.nutrislice.com/menu/api/weeks/school/${hall.slug}/menu-type/${menuType}/${week}/`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(45_000),
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  ! ${hall.name}/${menuType}/${week}: ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return null;
}

/** Run tasks with a small concurrency cap so we stay polite to the API. */
async function pool(tasks, limit) {
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

function cleanName(raw) {
  return String(raw ?? "")
    .replace(/''/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nutrislice mixes real dishes with layout rows -- section headers wrapped in
 * asterisks, and placeholder foods with no nutrition attached.
 */
function isRealFood(name, nutrition) {
  if (!name) return false;
  if (/^\*.*\*$/.test(name)) return false;
  if (nutrition.calories == null) return false;
  return true;
}

function round(value, places = 1) {
  if (value == null) return 0;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

async function main() {
  const weeks = weekStarts(WEEKS_BACK);
  const jobs = [];
  for (const hall of HALLS) {
    for (const menuType of MENU_TYPES) {
      for (const week of weeks) {
        jobs.push({ hall, menuType, week });
      }
    }
  }

  console.log(
    `Fetching ${jobs.length} week-menus (${HALLS.length} halls x ${MENU_TYPES.length} meals x ${weeks.length} weeks)...`,
  );

  /** @type {Map<number, any>} */
  const byId = new Map();
  let done = 0;

  await pool(
    jobs.map(({ hall, menuType, week }) => async () => {
      const data = await fetchWeek(hall, menuType, week);
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${jobs.length}`);
      if (!data?.days) return;

      for (const day of data.days) {
        for (const item of day.menu_items ?? []) {
          const food = item.food;
          if (!food?.id) continue;

          const name = cleanName(food.name);
          const nutrition = food.rounded_nutrition_info ?? {};
          if (!isRealFood(name, nutrition)) continue;

          const existing = byId.get(food.id);
          if (existing) {
            existing.halls.add(hall.name);
            existing.meals.add(menuType);
            continue;
          }

          const serving = food.serving_size_info ?? {};
          byId.set(food.id, {
            id: food.id,
            name,
            calories: Math.round(nutrition.calories),
            protein: round(nutrition.g_protein),
            carbs: round(nutrition.g_carbs),
            fat: round(nutrition.g_fat),
            fiber: round(nutrition.g_fiber),
            sugar: round(nutrition.g_sugar),
            sodium: Math.round(nutrition.mg_sodium ?? 0),
            servingAmount: cleanName(serving.serving_size_amount) || "1",
            servingUnit: cleanName(serving.serving_size_unit) || "serving",
            halls: new Set([hall.name]),
            meals: new Set([menuType]),
          });
        }
      }
    }),
    CONCURRENCY,
  );

  const foods = [...byId.values()]
    .map(({ halls, meals, ...rest }) => ({
      ...rest,
      halls: [...halls].sort(),
      meals: MENU_TYPES.filter((m) => meals.has(m)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    weeksScanned: weeks.length,
    source: "https://uga.api.nutrislice.com",
    halls: HALLS.map((h) => h.name),
    foods,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(payload);
  await writeFile(OUT_FILE, json);

  const raw = Buffer.byteLength(json);
  const gz = gzipSync(json).length;
  console.log(
    `\nWrote ${foods.length} foods to src/data/catalog.json` +
      ` (${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzipped)`,
  );

  const byHall = {};
  for (const f of foods) for (const h of f.halls) byHall[h] = (byHall[h] ?? 0) + 1;
  console.log("Per hall:", byHall);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
