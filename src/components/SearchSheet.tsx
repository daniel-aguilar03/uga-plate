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

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

function Row({
  food,
  favorite,
  onPick,
  onToggleFavorite,
}: {
  food: Food;
  favorite: boolean;
  onPick: (f: Food) => void;
  onToggleFavorite: (id: number) => void;
}) {
  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => onPick(food)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-3 py-3.5 text-left active:bg-white/10"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{food.name}</span>
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
      <button
        type="button"
        aria-label={favorite ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
        onClick={() => onToggleFavorite(food.id)}
        className={`shrink-0 rounded-xl px-2.5 ${
          favorite ? "text-uga-red-bright" : "text-neutral-600"
        } active:bg-white/10`}
      >
        <Star filled={favorite} />
      </button>
    </li>
  );
}

export function SearchSheet({ open, hall, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setFavoriteIds(storage.getFavorites());
    // iOS only honours focus shortly after the sheet is painted.
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(
    () => (open ? searchFoods(query, hall, 40).map((r) => r.food) : []),
    [open, query, hall],
  );

  const favorites = useMemo(() => {
    if (!open) return [];
    return favoriteIds
      .map(foodById)
      .filter((f): f is Food => Boolean(f))
      .slice(0, 20);
  }, [open, favoriteIds]);

  const recents = useMemo(() => {
    if (!open) return [];
    const favSet = new Set(favoriteIds);
    return storage
      .getRecents()
      .map(foodById)
      .filter((f): f is Food => Boolean(f))
      .filter((f) => !favSet.has(f.id))
      .slice(0, 12);
  }, [open, favoriteIds]);

  const showBrowse = query.trim().length < 2;

  const toggleFavorite = (id: number) => {
    storage.toggleFavorite(id);
    setFavoriteIds(storage.getFavorites());
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add food" tall>
      <div className="shrink-0 px-5 pb-3">
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Type a dish — rice, chicken, eggs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl border border-ink-line bg-black/40 px-4 py-4 text-[17px] outline-none placeholder:text-neutral-600 focus:border-uga-red"
        />
        <p className="mt-2 text-[11px] text-neutral-600">
          Fastest path in line. Camera is optional when you sit down.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {showBrowse ? (
          <>
            {favorites.length > 0 && (
              <>
                <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                  Favorites
                </div>
                <ul>
                  {favorites.map((food) => (
                    <Row
                      key={food.id}
                      food={food}
                      favorite
                      onPick={onPick}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </ul>
              </>
            )}

            {recents.length > 0 && (
              <>
                <div
                  className={`px-3 pb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase ${
                    favorites.length ? "mt-4" : ""
                  }`}
                >
                  Recent
                </div>
                <ul>
                  {recents.map((food) => (
                    <Row
                      key={food.id}
                      food={food}
                      favorite={false}
                      onPick={onPick}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </ul>
              </>
            )}

            {favorites.length === 0 && recents.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-neutral-600">
                Type 2+ letters to search 2,000+ UGA dishes. Star ones you eat
                often.
              </p>
            )}
          </>
        ) : results.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-600">
            No match for &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <ul>
            {results.map((food) => (
              <Row
                key={food.id}
                food={food}
                favorite={favoriteIds.includes(food.id)}
                onPick={onPick}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
