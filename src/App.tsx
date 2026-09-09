import { useCallback, useRef, useState } from "react";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { PlateList } from "./components/PlateList";
import { PlateTotals } from "./components/PlateTotals";
import { SearchSheet } from "./components/SearchSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { CameraIcon, GearIcon, SearchIcon, Spinner } from "./components/icons";
import { matchLabelText, type Ranked } from "./lib/catalog";
import { toBase64Jpeg } from "./lib/image";
import { storage } from "./lib/storage";
import { readLabel } from "./lib/vision";
import { usePlate } from "./state/plate";
import type { Food } from "./types";

type Confirm = {
  candidates: Ranked[];
  readAs?: string;
  uncertain: boolean;
  /** Names from the same photo still waiting to be confirmed. */
  queue: string[];
};

export default function App() {
  const plate = usePlate();

  const [apiKey, setApiKey] = useState(() => storage.getApiKey());
  const [hall, setHall] = useState(() => storage.getHall());

  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  /** Turn one label reading into a confirm sheet, skipping unmatchable names. */
  const presentName = useCallback(
    (names: string[]): boolean => {
      const remaining = [...names];
      while (remaining.length) {
        const name = remaining.shift()!;
        const { candidates, confident } = matchLabelText(name, hall);
        if (candidates.length) {
          setConfirm({
            candidates,
            readAs: name,
            uncertain: !confident,
            queue: remaining,
          });
          return true;
        }
      }
      return false;
    },
    [hall],
  );

  const onPhoto = useCallback(
    async (file: File) => {
      setNotice(null);
      setScanning(true);
      try {
        const { base64 } = await toBase64Jpeg(file);
        const result = await readLabel(base64, apiKey);

        if (!result.ok) {
          setNotice(result.error);
          if (result.needsKey) setSettingsOpen(true);
          return;
        }
        if (!result.names.length) {
          setNotice("No dish name found. Try filling the frame with the label.");
          return;
        }
        if (!presentName(result.names)) {
          setNotice(`Read "${result.names[0]}" but no UGA dish matched it.`);
          setSearchOpen(true);
        }
      } catch {
        setNotice("Could not read that photo.");
      } finally {
        setScanning(false);
      }
    },
    [apiKey, presentName],
  );

  const addAndAdvance = useCallback(
    (food: Food, portions: number) => {
      plate.addFood(food, portions);
      const queue = confirm?.queue ?? [];
      setConfirm(null);
      if (queue.length) presentName(queue);
    },
    [confirm, plate, presentName],
  );

  const pickFromSearch = useCallback(
    (food: Food) => {
      setSearchOpen(false);
      setConfirm({
        candidates: [{ food, score: 0, raw: 0, exact: true }],
        uncertain: false,
        queue: [],
      });
    },
    [],
  );

  /** Ask for the key before the camera, not after the photo is already taken. */
  const startScan = useCallback(() => {
    if (!apiKey) {
      setNotice("Scanning needs a free Gemini key. Search works without one.");
      setSettingsOpen(true);
      return;
    }
    fileRef.current?.click();
  }, [apiKey]);

  const empty = plate.items.length === 0;

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
              Scan a shelf label or search, set how many portions you took, and
              your plate adds up as you go.
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

      <footer
        className="shrink-0 border-t border-ink-line px-5 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startScan}
            disabled={scanning}
            className="flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-uga-red py-4 font-semibold text-white transition active:scale-[0.99] active:bg-uga-red-bright disabled:opacity-70"
          >
            {scanning ? <Spinner /> : <CameraIcon />}
            {scanning ? "Reading label..." : "Scan label"}
          </button>
          <button
            type="button"
            aria-label="Search food"
            onClick={() => setSearchOpen(true)}
            className="rounded-2xl border border-ink-line bg-white/5 px-5 py-4 text-neutral-300 active:bg-white/15"
          >
            <SearchIcon />
          </button>
        </div>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first so retaking the same shot still fires a change event.
          e.target.value = "";
          if (file) void onPhoto(file);
        }}
      />

      <ConfirmSheet
        open={Boolean(confirm)}
        candidates={confirm?.candidates ?? []}
        readAs={confirm?.readAs}
        uncertain={confirm?.uncertain}
        onAdd={addAndAdvance}
        onClose={() => setConfirm(null)}
        onSearchInstead={() => {
          setConfirm(null);
          setSearchOpen(true);
        }}
      />

      <SearchSheet
        open={searchOpen}
        hall={hall}
        onPick={pickFromSearch}
        onClose={() => setSearchOpen(false)}
      />

      <SettingsSheet
        open={settingsOpen}
        apiKey={apiKey}
        hall={hall}
        onSave={({ apiKey: k, hall: h }) => {
          setApiKey(k);
          storage.setApiKey(k);
          setHall(h);
          storage.setHall(h);
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
