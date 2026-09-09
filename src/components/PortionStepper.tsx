import { MAX_PORTIONS, PORTION_STEP, roundPortions } from "../state/plate";

type Props = {
  portions: number;
  onChange: (next: number) => void;
  size?: "sm" | "lg";
};

/** Formats 1 -> "1", 1.5 -> "1.5" so whole portions read cleanly. */
export function formatPortions(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function PortionStepper({ portions, onChange, size = "lg" }: Props) {
  const large = size === "lg";
  const button = large
    ? "h-14 w-14 text-3xl"
    : "h-10 w-10 text-xl";

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Fewer portions"
        disabled={portions <= PORTION_STEP}
        onClick={() => onChange(roundPortions(portions - PORTION_STEP))}
        className={`${button} shrink-0 rounded-full border border-ink-line bg-white/5 font-light leading-none text-white transition active:scale-95 active:bg-white/15 disabled:opacity-30`}
      >
        &minus;
      </button>

      <div className={large ? "min-w-24 text-center" : "min-w-14 text-center"}>
        <div className={large ? "text-4xl font-bold tabular-nums" : "text-lg font-semibold tabular-nums"}>
          {formatPortions(portions)}
        </div>
        {large && (
          <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {portions === 1 ? "portion" : "portions"}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="More portions"
        disabled={portions >= MAX_PORTIONS}
        onClick={() => onChange(roundPortions(portions + PORTION_STEP))}
        className={`${button} shrink-0 rounded-full bg-uga-red font-light leading-none text-white transition active:scale-95 active:bg-uga-red-bright disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
