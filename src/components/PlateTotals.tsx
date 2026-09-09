import type { Macros } from "../types";

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

export function PlateTotals({ totals, count }: { totals: Macros; count: number }) {
  return (
    <div className="px-5 pt-2 pb-4">
      <div className="flex items-end gap-6">
        <div>
          <div className="text-6xl leading-none font-bold tracking-tight tabular-nums">
            {Math.round(totals.calories)}
          </div>
          <div className="mt-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            calories
          </div>
        </div>
        <div className="pb-1">
          <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-uga-red-bright">
            {g(totals.protein)}
          </div>
          <div className="mt-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            protein
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Secondary label="carbs" value={g(totals.carbs)} />
        <Secondary label="fat" value={g(totals.fat)} />
        <Secondary label={count === 1 ? "item" : "items"} value={String(count)} />
      </div>
    </div>
  );
}
