import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureTray } from "./components/CaptureTray";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { PlateList } from "./components/PlateList";
import { PlateTotals } from "./components/PlateTotals";
import { ReviewSheet, type ReviewRow } from "./components/ReviewSheet";
import { SearchSheet } from "./components/SearchSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { CameraIcon, GearIcon, SearchIcon, Spinner } from "./components/icons";
import { matchLabelText, type Ranked } from "./lib/catalog";
import { toBase64Jpeg } from "./lib/image";
import { storage } from "./lib/storage";
import { readLabels } from "./lib/vision";
import { usePlate } from "./state/plate";
import type { Capture, Food } from "./types";

const MAX_CAPTURES = 15;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const plate = usePlate();

  const [apiKey, setApiKey] = useState(() => storage.getApiKey());
  const [hall, setHall] = useState(() => storage.getHall());
  const [model, setModel] = useState(() => storage.getModel());

  const [captures, setCaptures] = useState<Capture[]>(() => storage.getCaptures());
  const [reading, setReading] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

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

  /** Send every snapped label at once, then hand back one list to review. */
  const readAll = useCallback(async () => {
    if (!captures.length) return;
    if (!apiKey) {
      setNotice("Scanning needs a free Gemini key. Search works without one.");
      setSettingsOpen(true);
      return;
    }

    setNotice(null);
    setReading({ done: 0, total: captures.length });

    try {
      const results = await readLabels(
        captures.map((c) => c.base64),
        apiKey,
        {
          model,
          onProgress: (done, total) => setReading({ done, total }),
        },
      );

      const rows: ReviewRow[] = [];
      let keyProblem = false;

      results.forEach((result, i) => {
        const id = captures[i]?.id ?? newId();

        if (!result.ok) {
          if (result.needsKey) keyProblem = true;
          rows.push({
            id,
            candidates: [],
            selectedId: null,
            portions: 1,
            uncertain: false,
            problem: result.error,
          });
          return;
        }

        if (!result.names.length) {
          rows.push({
            id,
            candidates: [],
            selectedId: null,
            portions: 1,
            uncertain: false,
            problem: "no dish name found",
          });
          return;
        }

        // One photo can catch more than one label; each becomes its own row.
        result.names.forEach((name, n) => {
          const { candidates, confident } = matchLabelText(name, hall);
          rows.push({
            id: n === 0 ? id : `${id}-${n}`,
            candidates,
            selectedId: candidates[0]?.food.id ?? null,
            portions: 1,
            uncertain: candidates.length > 0 && !confident,
            readAs: name,
            problem: candidates.length ? undefined : "no UGA dish matched",
          });
        });
      });

      setReviewRows(rows);
      setCaptures([]);
      if (keyProblem) setSettingsOpen(true);
    } catch {
      setNotice("Something went wrong reading those labels.");
    } finally {
      setReading(null);
    }
  }, [apiKey, captures, hall, model]);

  const addAll = useCallback(
    (items: { food: Food; portions: number }[]) => {
      for (const { food, portions } of items) plate.addFood(food, portions);
      setReviewRows(null);
    },
    [plate],
  );

  const pickFromSearch = useCallback(
    (food: Food) => {
      setSearchOpen(false);

      // Searching from a review row swaps that row's dish rather than adding.
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
  const busy = reading !== null;

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
              Snap a photo of each label as you go down the line. Nothing loads
              until you sit down and tap Read labels.
            </p>
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
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-white/10 py-4 font-semibold text-white transition active:scale-[0.99] active:bg-white/20 disabled:opacity-50"
          >
            <CameraIcon />
            {captures.length ? "Snap another" : "Snap label"}
          </button>
          <button
            type="button"
            aria-label="Search food"
            onClick={() => {
              setSearchTarget(null);
              setSearchOpen(true);
            }}
            className="rounded-2xl border border-ink-line bg-white/5 px-5 py-4 text-neutral-300 active:bg-white/15"
          >
            <SearchIcon />
          </button>
        </div>

        {captures.length > 0 && (
          <button
            type="button"
            onClick={readAll}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-uga-red py-4 font-semibold text-white transition active:scale-[0.99] active:bg-uga-red-bright disabled:opacity-70"
          >
            {busy && <Spinner className="h-5 w-5" />}
            {busy
              ? `Reading ${reading.done}/${reading.total}...`
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
            or import photos from your camera roll
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
          // Reset first so retaking the same shot still fires a change event.
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
          plate.addFood(food, portions);
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
