import { useState } from "react";
import { servingLabel, type Ranked } from "../lib/catalog";
import { macrosFor, totalsFor } from "../state/plate";
import type { Food, PlateItem } from "../types";
import { PortionStepper } from "./PortionStepper";
import { Sheet } from "./Sheet";

/** One label photo's outcome, ready for the user to confirm. */
export type ReviewRow = {
  id: string;
  candidates: Ranked[];
  selectedId: number | null;
  portions: number;
  /** The match is a guess; make the user look at it. */
  uncertain: boolean;
  /** Raw text read off the label, if any. */
  readAs?: string;
  /** Set when the photo could not be read or matched at all. */
  problem?: string;
};

type Props = {
  open: boolean;
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  onAddAll: (items: { food: Food; portions: number }[]) => void;
  onSearchFor: (rowId: string) => void;
  onClose: () => void;
};

const g = (n: number) => `${Math.round(n)}g`;

function selectedFood(row: ReviewRow): Food | undefined {
  return (
    row.candidates.find((c) => c.food.id === row.selectedId)?.food ??
    row.candidates[0]?.food
  );
}

function Row({
  row,
  index,
  onChange,
  onRemove,
  onSearch,
}: {
  row: ReviewRow;
  index: number;
  onChange: (next: ReviewRow) => void;
  onRemove: () => void;
  onSearch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const food = selectedFood(row);

  if (!food) {
    return (
      <li className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="text-sm font-medium text-amber-200">
          Label {index + 1}: {row.problem ?? "could not be read"}
        </div>
        {row.readAs && (
          <div className="mt-0.5 text-xs text-neutral-500">
            Read as &ldquo;{row.readAs}&rdquo;
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onSearch}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium active:bg-white/20"
          >
            Find it manually
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 active:bg-white/10"
          >
            Skip
          </button>
        </div>
      </li>
    );
  }

  const m = macrosFor(food, row.portions);
  const alternates = row.candidates.filter((c) => c.food.id !== food.id).slice(0, 4);

  return (
    <li
      className={`rounded-2xl border px-4 py-3 ${
        row.uncertain
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-ink-line bg-ink-raised"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate font-medium">{food.name}</div>
          <div className="mt-0.5 truncate text-xs text-neutral-500">
            1 portion = {servingLabel(food)} &middot;{" "}
            <span className="text-neutral-400">
              {expanded ? "hide options" : "tap to change"}
            </span>
          </div>
        </button>
        <button
          type="button"
          aria-label={`Remove ${food.name}`}
          onClick={onRemove}
          className="-mt-1 -mr-2 shrink-0 rounded-full px-2.5 py-1 text-lg leading-none text-neutral-600 active:bg-white/10 active:text-white"
        >
          &times;
        </button>
      </div>

      {row.uncertain && row.readAs && (
        <div className="mt-2 text-xs text-amber-300">
          Label read as &ldquo;{row.readAs}&rdquo; &mdash; check this one.
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-sm tabular-nums">
          <span className="font-semibold">{Math.round(m.calories)}</span>
          <span className="text-neutral-500"> cal</span>
          <span className="mx-2 text-neutral-700">|</span>
          <span className="font-semibold text-uga-red-bright">{g(m.protein)}</span>
          <span className="text-neutral-500"> protein</span>
        </div>
        <PortionStepper
          size="sm"
          portions={row.portions}
          onChange={(portions) => onChange({ ...row, portions })}
        />
      </div>

      {expanded && (
        <div className="mt-3 border-t border-ink-line pt-3">
          <ul className="space-y-1.5">
            {alternates.map(({ food: alt }) => (
              <li key={alt.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...row, selectedId: alt.id, uncertain: false });
                    setExpanded(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-line px-3 py-2 text-left active:bg-white/10"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{alt.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                    {alt.calories} cal &middot; {g(alt.protein)} P
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onSearch}
            className="mt-2 w-full rounded-xl py-2 text-xs font-medium text-neutral-400 active:bg-white/5"
          >
            Search for something else
          </button>
        </div>
      )}
    </li>
  );
}

export function ReviewSheet({
  open,
  rows,
  onChange,
  onAddAll,
  onSearchFor,
  onClose,
}: Props) {
  const usable = rows
    .map((r) => ({ food: selectedFood(r), portions: r.portions }))
    .filter((x): x is { food: Food; portions: number } => Boolean(x.food));

  const totals = totalsFor(
    usable.map((u, i) => ({ key: String(i), ...u })) as PlateItem[],
  );
  const flagged = rows.filter((r) => r.uncertain && selectedFood(r)).length;

  return (
    <Sheet open={open} onClose={onClose} title="Your plate" tall>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {flagged > 0 && (
          <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {flagged} {flagged === 1 ? "label needs" : "labels need"} a quick
            check &mdash; highlighted below.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-neutral-600">
            Nothing left to review.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, i) => (
              <Row
                key={row.id}
                row={row}
                index={i}
                onChange={(next) =>
                  onChange(rows.map((r) => (r.id === row.id ? next : r)))
                }
                onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}
                onSearch={() => onSearchFor(row.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div
        className="shrink-0 border-t border-ink-line px-5 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={usable.length === 0}
          onClick={() => onAddAll(usable)}
          className="w-full rounded-2xl bg-uga-red py-4 text-base font-semibold text-white transition active:scale-[0.99] active:bg-uga-red-bright disabled:opacity-40"
        >
          {usable.length === 0
            ? "Nothing to add"
            : `Add ${usable.length} to plate · ${Math.round(totals.calories)} cal · ${g(totals.protein)} protein`}
        </button>
      </div>
    </Sheet>
  );
}
