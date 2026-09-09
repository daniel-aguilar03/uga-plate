/**
 * Sanity-checks catalog search against realistic label reads.
 * Bundles the real src/lib/catalog.ts so this exercises shipping code.
 *
 *   node scripts/check-matching.mjs
 */
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "node_modules", ".cache", "catalog-check.mjs");

await build({
  entryPoints: [path.join(ROOT, "src", "lib", "catalog.ts")],
  outfile: OUT,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  loader: { ".json": "json" },
  logLevel: "error",
});

const { FOODS, matchLabelText, searchFoods, servingLabel } = await import(
  pathToFileURL(OUT).href
);

/**
 * [label text, expected top dish, should it auto-confirm?]
 *
 * Reads that name a real dish exactly should go straight through. Reads that
 * name a whole family of dishes (UGA has eight mashed potatoes from 80 to 300
 * calories) must stop and ask, or the plate total quietly goes wrong.
 */
const CASES = [
  ["Grilled Chicken Breast", "Grilled Chicken Breast", true],
  ["Jasmine Rice", "Jasmine Rice", true],
  ["Scrambled Eggs", "Scrambled Eggs", true],
  ["Bacon", "Bacon", true],
  ["Cheese Pizza", "Cheese Pizza", true],
  ["Black Beans", "Black Beans", true],
  ["Grilled Chicken Breast  Contains: Soy", "Grilled Chicken Breast", true],
  ["BROWN RICE", "Brown Rice", true],
  ["Tater Tots", "Tater Tots", true],
  ["Fresh Steamed Broccoli", "Fresh Steamed Broccoli", true],
  // No exact catalog entry for these, so the user has to choose the variant.
  ["Mashed Potatoes", null, false],
  ["French Fries", null, false],
];

let failures = 0;
console.log(`Catalog: ${FOODS.length} deduped foods\n`);

for (const [input, expected, wantConfident] of CASES) {
  const { candidates, confident } = matchLabelText(input);
  const top = candidates[0];

  const nameOk = expected
    ? top && top.food.name.toLowerCase() === expected.toLowerCase()
    : Boolean(top);
  const ok = nameOk && confident === wantConfident;
  if (!ok) failures++;

  const got = top ? `${top.food.name} (${top.score.toFixed(2)})` : "no match";
  console.log(
    `${ok ? "ok  " : "FAIL"} ${confident ? "auto" : "ask "}  ${input.padEnd(40)} -> ${got}`,
  );
}

console.log("\nTyping a few letters:");
for (const q of ["chick", "rice", "eggs", "pizz"]) {
  const top = searchFoods(q, "", 3);
  console.log(
    `  "${q}" -> ${top.map((r) => r.food.name).join(" | ") || "(nothing)"}`,
  );
}

console.log("\nServing labels:");
for (const name of ["Jasmine Rice", "Grilled Chicken Breast", "Plain Bagel"]) {
  const f = FOODS.find((x) => x.name === name);
  if (f) console.log(`  ${f.name}: 1 portion = ${servingLabel(f)}`);
}

await rm(OUT, { force: true });

console.log(
  failures ? `\n${failures}/${CASES.length} cases failed.` : `\nAll ${CASES.length} cases passed.`,
);
process.exit(failures ? 1 : 0);
