import { useEffect, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Sheets that hold a text field should stay short so the keyboard fits. */
  tall?: boolean;
  children: ReactNode;
};

export function Sheet({ open, onClose, title, tall, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* The explicit Close button carries the accessible action; this is
          just the tap-outside target. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative animate-sheet-up rounded-t-3xl border-t border-ink-line bg-ink-raised shadow-2xl ${
          tall ? "max-h-[88vh]" : "max-h-[78vh]"
        } flex flex-col`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-full px-3 py-2 text-sm font-medium text-neutral-400 active:bg-white/10"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
