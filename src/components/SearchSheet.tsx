import { useEffect, useMemo, useRef, useState } from "react";
import { foodById, searchFoods, servingLabel } from "../lib/catalog";
import { storage } from "../lib/storage";
import type { Food } from "../types";
import { Sheet } from "./Sheet";

type Props = {
  open: boolean;
  hall: string;
  onPick: (food: Food) => void;
  onClose: () => void;
};

function Row({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(food)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left active:bg-white/10"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{food.name}</span>
          <span className="block truncate text-xs text-neutral-500">
            per {servingLabel(food)}
            {food.halls.length > 0 && ` · ${food.halls.join(", ")}`}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs tabular-nums">
          <span className="block font-semibold">{food.calories} cal</span>
          <span className="block text-uga-red-bright">
            {Math.round(food.protein)}g protein
          </span>
        </span>
      </button>
    </li>
  );
}

export function SearchSheet({ open, hall, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    // iOS only honours focus shortly after the sheet is painted.
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(
    () => (open ? searchFoods(query, hall, 40).map((r) => r.food) : []),
    [open, query, hall],
  );

  const recents = useMemo(() => {
    if (!open) return [];
    return storage
      .getRecents()
      .map(foodById)
      .filter((f): f is Food => Boolean(f))
      .slice(0, 12);
  }, [open]);

  const showRecents = query.trim().length < 2;
  const list = showRecents ? recents : results;

  return (
    <Sheet open={open} onClose={onClose} title="Search food" tall>
      <div className="shrink-0 px-5 pb-3">
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="rice, chicken, eggs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-ink-line bg-black/40 px-4 py-3 outline-none placeholder:text-neutral-600 focus:border-uga-red"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {showRecents && recents.length > 0 && (
          <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            Recent
          </div>
        )}

        {list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-600">
            {showRecents
              ? "Type to search 2,000+ UGA dishes."
              : `No match for "${query.trim()}".`}
          </p>
        ) : (
          <ul>
            {list.map((food) => (
              <Row key={food.id} food={food} onPick={onPick} />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
