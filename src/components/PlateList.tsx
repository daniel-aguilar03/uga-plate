import { servingLabel } from "../lib/catalog";
import { macrosFor } from "../state/plate";
import type { PlateItem } from "../types";
import { PortionStepper, formatPortions } from "./PortionStepper";

type Props = {
  items: PlateItem[];
  onSetPortions: (key: string, portions: number) => void;
  onRemove: (key: string) => void;
};

export function PlateList({ items, onSetPortions, onRemove }: Props) {
  return (
    <ul className="space-y-2 px-4">
      {items.map((item) => {
        const m = macrosFor(item.food, item.portions);
        return (
          <li
            key={item.key}
            className="rounded-2xl border border-ink-line bg-ink-raised px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.food.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {formatPortions(item.portions)} &times; {servingLabel(item.food)}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.food.name}`}
                onClick={() => onRemove(item.key)}
                className="-mt-1 -mr-2 shrink-0 rounded-full px-2.5 py-1 text-lg leading-none text-neutral-600 active:bg-white/10 active:text-white"
              >
                &times;
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm tabular-nums">
                <span className="font-semibold">{Math.round(m.calories)}</span>
                <span className="text-neutral-500"> cal</span>
                <span className="mx-2 text-neutral-700">|</span>
                <span className="font-semibold text-uga-red-bright">
                  {Math.round(m.protein)}g
                </span>
                <span className="text-neutral-500"> protein</span>
              </div>
              <PortionStepper
                size="sm"
                portions={item.portions}
                onChange={(next) => onSetPortions(item.key, next)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
