import { useEffect, useState } from "react";
import { servingLabel, type Ranked } from "../lib/catalog";
import { macrosFor } from "../state/plate";
import type { Food } from "../types";
import { PortionStepper } from "./PortionStepper";
import { Sheet } from "./Sheet";

type Props = {
  open: boolean;
  /** Best match first; the rest are offered as alternates. */
  candidates: Ranked[];
  /** Raw text Gemini read, shown when the top match is shaky. */
  readAs?: string;
  uncertain?: boolean;
  onAdd: (food: Food, portions: number) => void;
  onClose: () => void;
  onSearchInstead: () => void;
};

const g = (n: number) => `${Math.round(n)}g`;

export function ConfirmSheet({
  open,
  candidates,
  readAs,
  uncertain,
  onAdd,
  onClose,
  onSearchInstead,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [portions, setPortions] = useState(1);

  // Reset to the top match every time a new scan or search result arrives.
  useEffect(() => {
    if (!open) return;
    setSelectedId(candidates[0]?.food.id ?? null);
    setPortions(1);
  }, [open, candidates]);

  const selected =
    candidates.find((c) => c.food.id === selectedId)?.food ?? candidates[0]?.food;

  if (!selected) return null;

  const per = macrosFor(selected, 1);
  const total = macrosFor(selected, portions);
  const alternates = candidates.filter((c) => c.food.id !== selected.id).slice(0, 3);

  return (
    <Sheet open={open} onClose={onClose} title={uncertain ? "Is this right?" : "Add to plate"}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        {readAs && uncertain && (
          <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Label read as &ldquo;{readAs}&rdquo; &mdash; pick the right dish below.
          </p>
        )}

        <div className="text-xl leading-snug font-semibold">{selected.name}</div>
        <div className="mt-1 text-sm text-neutral-500">
          1 portion = {servingLabel(selected)}
          {selected.halls.length > 0 && ` · ${selected.halls.join(", ")}`}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ["cal", Math.round(per.calories)],
            ["protein", g(per.protein)],
            ["carbs", g(per.carbs)],
            ["fat", g(per.fat)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/5 py-2">
              <div className="font-semibold tabular-nums">{value}</div>
              <div className="text-[10px] tracking-wider text-neutral-500 uppercase">
                {label}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 text-center text-[11px] text-neutral-600">
          per portion
        </div>

        <div className="mt-5 flex items-center justify-center">
          <PortionStepper portions={portions} onChange={setPortions} />
        </div>

        {alternates.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
              Not it? Try
            </div>
            <ul className="space-y-1.5">
              {alternates.map(({ food }) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(food.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-line px-3 py-2.5 text-left active:bg-white/10"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{food.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                      {food.calories} cal · {g(food.protein)} P
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onSearchInstead}
          className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium text-neutral-400 active:bg-white/5"
        >
          Search for something else
        </button>
      </div>

      <div
        className="shrink-0 border-t border-ink-line px-5 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => onAdd(selected, portions)}
          className="w-full rounded-2xl bg-uga-red py-4 text-base font-semibold text-white transition active:scale-[0.99] active:bg-uga-red-bright"
        >
          Add {Math.round(total.calories)} cal · {g(total.protein)} protein
        </button>
      </div>
    </Sheet>
  );
}
