import { base64ToDataUrl } from "../lib/image";
import type { Capture } from "../types";

type Props = {
  captures: Capture[];
  onRemove: (id: string) => void;
};

/** Thumbnails of labels snapped so far, so you can see what is queued. */
export function CaptureTray({ captures, onRemove }: Props) {
  if (!captures.length) return null;

  return (
    <div className="shrink-0 px-4 pb-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
          {captures.length} label{captures.length === 1 ? "" : "s"} snapped
        </span>
        <span className="text-[11px] text-neutral-600">not read yet</span>
      </div>
      <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {captures.map((c, i) => (
          <li key={c.id} className="relative shrink-0">
            <img
              src={base64ToDataUrl(c.base64)}
              alt={`Label ${i + 1}`}
              className="h-16 w-16 rounded-xl border border-ink-line object-cover"
            />
            <button
              type="button"
              aria-label={`Remove label ${i + 1}`}
              onClick={() => onRemove(c.id)}
              className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-ink-line bg-ink text-sm leading-none text-neutral-300 active:bg-uga-red active:text-white"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
