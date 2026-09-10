import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptureTray } from "./components/CaptureTray";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { PlateList } from "./components/PlateList";
import { PlateTotals } from "./components/PlateTotals";
import { RecentlyScanned } from "./components/RecentlyScanned";
import { ReviewSheet, type ReviewRow } from "./components/ReviewSheet";
import { SearchSheet } from "./components/SearchSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { CameraIcon, GearIcon, SearchIcon, Spinner } from "./components/icons";
import { type Ranked } from "./lib/catalog";
import { toBase64Jpeg } from "./lib/image";
import { hashImage, matchLabelWithCache, scanCache } from "./lib/scanCache";
import { storage } from "./lib/storage";
import { readLabels } from "./lib/vision";
import { usePlate } from "./state/plate";
import type { Capture, Food } from "./types";

const MAX_CAPTURES = 12;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function rowsFromNames(
  names: string[],
  id: string,
  hall: string,
  fromCache: boolean,
): ReviewRow[] {
  if (!names.length) {
    return [
      {
        id,
        candidates: [],
        selectedId: null,
        portions: 1,
        uncertain: false,
        problem: "no dish name found",
      },
    ];
  }

  return names.map((name, n) => {
    const { candidates, confident } = matchLabelWithCache(name, hall);
    return {
      id: n === 0 ? id : `${id}-${n}`,
      candidates,
      selectedId: candidates[0]?.food.id ?? null,
      portions: 1,
      // Cached confirmations are treated as known; still flag fuzzy OCR hits.
      uncertain: candidates.length > 0 && !confident && !fromCache,
      readAs: name,
      problem: candidates.length ? undefined : "no UGA dish matched",
    };
  });
}

export default function App() {
  const plate = usePlate();

  const [apiKey, setApiKey] = useState(() => storage.getApiKey());
  const [hall, setHall] = useState(() => storage.getHall());
  const [model, setModel] = useState(() => storage.getModel());

  const [captures, setCaptures] = useState<Capture[]>(() => storage.getCaptures());
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scannedTick, setScannedTick] = useState(0);

  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  /** When set, a search result replaces this review row instead of adding directly. */
  const [searchTarget, setSearchTarget] = useState<string | null>(null);

  const [confirmFood, setConfirmFood] = useState<Ranked[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storage.setCaptures(captures);
  }, [captures]);

  const recentlyScanned = useMemo(
    () => scanCache.recentlyScannedFoods(),
    // Refresh when the user confirms new label dishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scannedTick, plate.items],
  );

  const openSearch = useCallback(() => {
    setSearchTarget(null);
    setSearchOpen(true);
  }, []);

  const addPhotos = useCallback(async (files: File[]) => {
    setNotice(null);
    try {
      const shots = await Promise.all(
        files.map(async (file) => {
          const { base64 } = await toBase64Jpeg(file);
          return { id: newId(), base64, takenAt: Date.now() } satisfies Capture;
        }),
      );
      setCaptures((prev) => {
        const next = [...prev, ...shots];
        if (next.length > MAX_CAPTURES) {
          setNotice(`Keeping the last ${MAX_CAPTURES} labels.`);
          return next.slice(-MAX_CAPTURES);
        }
        return next;
      });
    } catch {
      setNotice("Could not read that photo.");
    }
  }, []);

  /**
   * Read the plate: reuse Gemini results for photos we've seen before, and only
   * call the model for the rest — so seconds of the same label are instant.
   */
  const readAll = useCallback(async () => {
    if (!captures.length) return;

    setNotice(null);
    setReading(true);

    try {
      const hashes = await Promise.all(captures.map((c) => hashImage(c.base64)));
      const photoNames: (string[] | null)[] = hashes.map((h) =>
        scanCache.getImageNames(h),
      );

      const missIndexes: number[] = [];
      photoNames.forEach((names, i) => {
        if (!names) missIndexes.push(i);
      });

      if (missIndexes.length) {
        if (!apiKey) {
          setNotice(
            "Reading new labels needs a free Gemini key. Search and cached labels still work.",
          );
          setSettingsOpen(true);
          if (missIndexes.length === captures.length) return;
        } else {
          const result = await readLabels(
            missIndexes.map((i) => captures[i].base64),
            apiKey,
            { model },
          );

          if (!result.ok) {
            setNotice(result.error);
            if (result.needsKey) setSettingsOpen(true);
            if (missIndexes.length === captures.length) return;
          } else {
            result.photos.forEach((names, j) => {
              const index = missIndexes[j];
              photoNames[index] = names;
              if (names.length) scanCache.setImageNames(hashes[index], names);
            });
          }
        }
      }

      const rows: ReviewRow[] = [];
      let cachedCount = 0;

      photoNames.forEach((names, i) => {
        const id = captures[i]?.id ?? newId();
        if (names == null) {
          rows.push({
            id,
            candidates: [],
            selectedId: null,
            portions: 1,
            uncertain: false,
            problem: "could not be read",
          });
          return;
        }
        const fromCache = !missIndexes.includes(i);
        if (fromCache) cachedCount++;
        rows.push(...rowsFromNames(names, id, hall, fromCache));
      });

      setReviewRows(rows);
      setCaptures([]);
      if (cachedCount && cachedCount === captures.length) {
        setNotice(
          cachedCount === 1
            ? "Loaded from cache — no wait."
            : `All ${cachedCount} labels loaded from cache — no wait.`,
        );
      } else if (cachedCount) {
        setNotice(`${cachedCount} of ${captures.length} labels came from cache.`);
      }
    } catch {
      setNotice("Something went wrong reading those labels.");
    } finally {
      setReading(false);
    }
  }, [apiKey, captures, hall, model]);

  const rememberAndAdd = useCallback(
    (items: { food: Food; portions: number; readAs?: string }[]) => {
      for (const { food, portions, readAs } of items) {
        plate.addFood(food, portions);
        scanCache.pushScanned(food.id);
        if (readAs) scanCache.rememberName(readAs, food.id);
      }
      setScannedTick((n) => n + 1);
    },
    [plate],
  );

  const addAll = useCallback(
    (items: { food: Food; portions: number }[]) => {
      const withNames = items.map((item) => {
        const row = (reviewRows ?? []).find(
          (r) =>
            r.selectedId === item.food.id ||
            r.candidates[0]?.food.id === item.food.id,
        );
        return { ...item, readAs: row?.readAs };
      });
      rememberAndAdd(withNames);
      setReviewRows(null);
    },
    [rememberAndAdd, reviewRows],
  );

  const pickFromSearch = useCallback(
    (food: Food) => {
      setSearchOpen(false);

      if (searchTarget) {
        setReviewRows((rows) =>
          (rows ?? []).map((r) =>
            r.id === searchTarget
              ? {
                  ...r,
                  candidates: [{ food, score: 0, raw: 0, exact: true }],
                  selectedId: food.id,
                  uncertain: false,
                  problem: undefined,
                }
              : r,
          ),
        );
        setSearchTarget(null);
        return;
      }

      setConfirmFood([{ food, score: 0, raw: 0, exact: true }]);
    },
    [searchTarget],
  );

  const empty = plate.items.length === 0;
  const busy = reading;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header
        className="shrink-0 px-5 pb-1"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-widest text-uga-red uppercase">
              UGA Plate
            </span>
            {hall && <span className="text-xs text-neutral-600">{hall}</span>}
          </div>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            className="-mr-2 rounded-full p-2 text-neutral-500 active:bg-white/10 active:text-white"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <PlateTotals totals={plate.totals} count={plate.items.length} />

      <main className="min-h-0 flex-1 overflow-y-auto pb-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-10 text-center">
            <p className="text-sm leading-relaxed text-neutral-500">
              Search for what you put on your plate — type a few letters, tap,
              set portions. Snap labels later if you want; reading waits until
              you sit down.
            </p>
            <button
              type="button"
              onClick={openSearch}
              className="mt-6 rounded-2xl bg-uga-red px-6 py-3.5 text-sm font-semibold text-white active:bg-uga-red-bright"
            >
              Search food
            </button>
          </div>
        ) : (
          <>
            <PlateList
              items={plate.items}
              onSetPortions={plate.setPortions}
              onRemove={plate.removeItem}
            />
            <div className="mt-4 flex justify-center gap-6 text-xs">
              <button
                type="button"
                onClick={plate.finish}
                className="rounded-lg px-3 py-2 font-medium text-neutral-400 active:bg-white/10"
              >
                Finish plate
              </button>
              <button
                type="button"
                onClick={plate.clear}
                className="rounded-lg px-3 py-2 font-medium text-neutral-600 active:bg-white/10"
              >
                Clear
              </button>
            </div>
          </>
        )}
      </main>

      {notice && (
        <div className="shrink-0 px-4 pb-2">
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="w-full rounded-xl bg-amber-500/15 px-4 py-2.5 text-left text-xs text-amber-200"
          >
            {notice}
            <span className="ml-1 text-amber-500/60">(tap to dismiss)</span>
          </button>
        </div>
      )}

      <RecentlyScanned
        foods={recentlyScanned}
        onAdd={(food) => {
          plate.addFood(food, 1);
          scanCache.pushScanned(food.id);
          setScannedTick((n) => n + 1);
          setNotice(`Added another ${food.name}.`);
        }}
      />

      <CaptureTray
        captures={captures}
        onRemove={(id) => setCaptures((prev) => prev.filter((c) => c.id !== id))}
      />

      <footer
        className="shrink-0 border-t border-ink-line px-5 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openSearch}
            className="flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-uga-red py-4 font-semibold text-white transition active:scale-[0.99] active:bg-uga-red-bright"
          >
            <SearchIcon />
            Search food
          </button>
          <button
            type="button"
            aria-label={captures.length ? "Snap another label" : "Snap label"}
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="rounded-2xl border border-ink-line bg-white/5 px-5 py-4 text-neutral-300 active:bg-white/15 disabled:opacity-50"
          >
            <CameraIcon />
          </button>
        </div>

        {captures.length > 0 && (
          <button
            type="button"
            onClick={readAll}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white/10 py-3.5 text-sm font-semibold text-white transition active:scale-[0.99] active:bg-white/20 disabled:opacity-70"
          >
            {busy && <Spinner className="h-5 w-5" />}
            {busy
              ? "Reading labels..."
              : `Read ${captures.length} label${captures.length === 1 ? "" : "s"}`}
          </button>
        )}

        {captures.length === 0 && (
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            disabled={busy}
            className="mt-2 w-full py-1.5 text-xs font-medium text-neutral-600 active:text-neutral-300"
          >
            optional: import label photos
          </button>
        )}
      </footer>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void addPhotos(files);
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void addPhotos(files);
        }}
      />

      <ReviewSheet
        open={reviewRows !== null && !searchOpen}
        rows={reviewRows ?? []}
        onChange={setReviewRows}
        onAddAll={addAll}
        onSearchFor={(rowId) => {
          setSearchTarget(rowId);
          setSearchOpen(true);
        }}
        onClose={() => setReviewRows(null)}
      />

      <ConfirmSheet
        open={confirmFood !== null}
        candidates={confirmFood ?? []}
        onAdd={(food, portions) => {
          rememberAndAdd([{ food, portions }]);
          setConfirmFood(null);
        }}
        onClose={() => setConfirmFood(null)}
        onSearchInstead={() => {
          setConfirmFood(null);
          setSearchOpen(true);
        }}
      />

      <SearchSheet
        open={searchOpen}
        hall={hall}
        onPick={pickFromSearch}
        onClose={() => {
          setSearchOpen(false);
          setSearchTarget(null);
        }}
      />

      <SettingsSheet
        open={settingsOpen}
        apiKey={apiKey}
        hall={hall}
        model={model}
        onSave={({ apiKey: k, hall: h, model: m }) => {
          setApiKey(k);
          storage.setApiKey(k);
          setHall(h);
          storage.setHall(h);
          setModel(m);
          storage.setModel(m);
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
