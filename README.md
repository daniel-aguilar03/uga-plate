# UGA Plate

Point your phone at a dining hall shelf label, say how many portions you took,
and watch the plate total add up. Calories and protein up front, carbs and fat
alongside.

No backend. No accounts. No app store.

## How it works

1. Tap **Scan label** and photograph the shelf label.
2. Gemini reads the dish name off the photo, in the browser, using your key.
3. The name is matched against a bundled catalog of ~2,150 real UGA dishes.
4. Set portions with `-` / `+` in half steps and add it.
5. Repeat down the line. Tap **Finish plate** when you sit down.

Search is always there as the fast path -- type three letters and tap.

## Setup

```bash
npm install
npm run dev
```

Then open the printed Network URL on your phone. The camera needs HTTPS or
localhost, so for phone testing either deploy it or use a tunnel.

### Enable scanning

Scanning needs a free Gemini key from
[Google AI Studio](https://aistudio.google.com/apikey). Open the gear icon,
paste it, and save.

The key is kept in `localStorage` on that one device and is sent only to
Google. There is no server to leak it. Each scan costs a fraction of a cent,
and the free tier covers normal use. **Search works without a key.**

## Where the nutrition data comes from

UGA publishes full nutrition through Nutrislice, the same source behind
[Build Your Plate](https://dining.uga.edu/build-your-plate). That API sends no
CORS header, so a browser can never call it directly. Instead
`scripts/build-catalog.mjs` sweeps all six dining commons across breakfast,
lunch, and dinner for the past several weeks, dedupes, and writes
`src/data/catalog.json` (about 66 KB gzipped). The app ships that file, so
search is instant and works with no signal.

Per-dish nutrition rarely changes, so refresh it occasionally:

```bash
npm run data          # last 8 weeks
WEEKS=16 npm run data # dig deeper for rarely served dishes
```

## Portions

One portion means one serving as UGA lists it, and the app always spells that
out ("1 portion = 3 oz"). Most sides are 3-4 oz, roughly one serving spoon.

## When the app asks instead of assuming

A label reading of "Grilled Chicken Breast" matches exactly, so it goes
straight through. A reading of "Mashed Potatoes" does not -- UGA serves eight
versions ranging from 80 to 300 calories. Rather than silently pick one and
quietly corrupt your total, the app shows the alternatives with their calories
and lets you choose.

## Checks

```bash
npm run check   # label matching and confidence against the real catalog
npm run build   # typecheck + production build
```

## Deploy

Any static host works, since there is nothing to run server-side.

```bash
npm run build   # outputs dist/
```

- **Vercel:** `npx vercel --prod`
- **GitHub Pages:** push to `main`; the workflow in `.github/workflows/` builds
  and publishes `dist/`.

Paths are relative (`base: "./"`), so it works from a subdirectory too.

Once loaded, a service worker caches the app so it keeps working offline.
Add it to your home screen and it behaves like a native app.
