import type { Food } from "../types";

type Props = {
  foods: Food[];
  onAdd: (food: Food) => void;
};

/**
 * One-tap seconds for dishes you already confirmed from a label this week.
 * Skips Gemini entirely — the common "I went back for more chicken" case.
 */
export function RecentlyScanned({ foods, onAdd }: Props) {
  if (!foods.length) return null;

  return (
    <div className="shrink-0 px-4 pb-2">
      <div className="mb-1.5 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
        Add seconds
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {foods.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onAdd(food)}
            className="shrink-0 rounded-full border border-ink-line bg-ink-raised px-3.5 py-2 text-left active:bg-white/10"
          >
            <span className="block max-w-[11rem] truncate text-sm font-medium">
              + {food.name}
            </span>
            <span className="block text-[11px] text-neutral-500 tabular-nums">
              {food.calories} cal · {Math.round(food.protein)}g protein
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
