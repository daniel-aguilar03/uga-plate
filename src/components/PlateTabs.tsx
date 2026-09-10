import { MAX_PLATES } from "../state/plate";

type Props = {
  plates: { id: string; label: string; itemCount: number }[];
  activePlateId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
};

/**
 * Switch between Plate 1 / Seconds / Thirds, or start another trip through
 * the line. Lives under the meal totals so the cumulative numbers never move.
 */
export function PlateTabs({ plates, activePlateId, onSelect, onAdd }: Props) {
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-5 pb-3">
      {plates.map((p) => {
        const active = p.id === activePlateId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-label={
              p.itemCount > 0 ? `${p.label}, ${p.itemCount} items` : p.label
            }
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-white text-ink"
                : "bg-white/10 text-neutral-300 active:bg-white/20"
            }`}
          >
            {p.label}
            {p.itemCount > 0 && (
              <span
                className={`ml-1.5 tabular-nums ${
                  active ? "text-neutral-500" : "text-neutral-500"
                }`}
              >
                {p.itemCount}
              </span>
            )}
          </button>
        );
      })}
      {plates.length < MAX_PLATES && (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-full border border-dashed border-ink-line px-3.5 py-1.5 text-sm font-medium text-neutral-400 active:bg-white/10 active:text-white"
        >
          {plates.length === 1
            ? "+ Seconds"
            : plates.length === 2
              ? "+ Thirds"
              : "+ Plate"}
        </button>
      )}
    </div>
  );
}
