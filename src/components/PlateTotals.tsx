import type { Macros } from "../types";

type PlateSummary = {
  id: string;
  label: string;
  itemCount: number;
  totals: Macros;
};

type Props = {
  /** Running total for the whole meal (every plate). */
  mealTotals: Macros;
  mealItemCount: number;
  /** Totals for the plate currently being edited. */
  plateTotals: Macros;
  plateLabel: string;
  plateCount: number;
  summaries: PlateSummary[];
  activePlateId: string;
  onSelectPlate: (id: string) => void;
};

const g = (n: number) => `${Math.round(n)}g`;

function Secondary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
        {label}
      </div>
    </div>
  );
}

/**
 * Meal totals stay the hero numbers. When there are seconds/thirds, a compact
 * per-plate strip sits underneath so you can see each trip and jump to it.
 */
export function PlateTotals({
  mealTotals,
  mealItemCount,
  plateTotals,
  plateLabel,
  plateCount,
  summaries,
  activePlateId,
  onSelectPlate,
}: Props) {
  const multi = plateCount > 1;

  return (
    <div className="px-5 pt-2 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
          {multi ? "Meal total" : "This plate"}
        </div>
        {multi && (
          <div className="text-[11px] text-neutral-600 tabular-nums">
            {plateLabel}: {Math.round(plateTotals.calories)} cal ·{" "}
            {g(plateTotals.protein)} P
          </div>
        )}
      </div>

      <div className="mt-1 flex items-end gap-6">
        <div>
          <div className="text-6xl leading-none font-bold tracking-tight tabular-nums">
            {Math.round(mealTotals.calories)}
          </div>
          <div className="mt-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            calories
          </div>
        </div>
        <div className="pb-1">
          <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-uga-red-bright">
            {g(mealTotals.protein)}
          </div>
          <div className="mt-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            protein
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Secondary label="carbs" value={g(mealTotals.carbs)} />
        <Secondary label="fat" value={g(mealTotals.fat)} />
        <Secondary
          label={mealItemCount === 1 ? "item" : "items"}
          value={String(mealItemCount)}
        />
      </div>

      {multi && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {summaries.map((s) => {
            const active = s.id === activePlateId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectPlate(s.id)}
                className={`shrink-0 rounded-2xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-uga-red bg-uga-red/15"
                    : "border-ink-line bg-white/5 active:bg-white/10"
                }`}
              >
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="mt-0.5 text-[11px] text-neutral-400 tabular-nums">
                  {Math.round(s.totals.calories)} cal · {g(s.totals.protein)} P
                  {s.itemCount > 0 ? ` · ${s.itemCount}` : " · empty"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
