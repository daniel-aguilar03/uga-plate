# UGA Plate

Point your phone at a dining hall shelf label, say how many portions you took,
and watch the plate total add up. Calories and protein up front, carbs and fat
alongside.

No backend. No accounts. No app store.

## How it works

Snap first, read later. Standing in line waiting on a network round trip for
every dish is the slow part, so the app never calls anything while you are
moving.

1. Tap **Snap label** at each station and keep walking. Photos queue up on the
   device with no network calls at all.
2. Sit down, tap **Read N labels**. Every photo goes to Gemini at once, in
   parallel, so five labels take about as long as one.
3. Review the whole plate in a single list: adjust portions, fix anything the
   app flagged, drop what you do not want.
4. **Add to plate** once, and you are done.

Search is always there as the fast path -- type three letters and tap.

Queued photos survive a reload, since iOS will happily discard a backgrounded
tab and losing a line's worth of photos would be worse than the storage cost.

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
Google. There is no server to leak it. **Search works without a key.**

### If scanning says a model is busy

Google's newest flagship is heavily contended on the free tier and can return
"the model is overloaded" for days at a stretch. Reading a few words of large
printed text does not need a frontier model, so the app tries the fast, cheap
Flash-Lite models first and only falls back toward the newest one. All the
models it uses are free-tier eligible.

Settings has a model picker if you want to pin one, but **Automatic** is
almost always the right choice.

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
