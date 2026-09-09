import { useEffect, useState } from "react";
import { GENERATED_AT, HALLS } from "../lib/catalog";
import { Sheet } from "./Sheet";

type Props = {
  open: boolean;
  apiKey: string;
  hall: string;
  onSave: (next: { apiKey: string; hall: string }) => void;
  onClose: () => void;
};

export function SettingsSheet({ open, apiKey, hall, onSave, onClose }: Props) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [hallDraft, setHallDraft] = useState(hall);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKeyDraft(apiKey);
    setHallDraft(hall);
    setReveal(false);
  }, [open, apiKey, hall]);

  const save = () => {
    onSave({ apiKey: keyDraft.trim(), hall: hallDraft });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Settings" tall>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <label className="mb-1.5 block text-xs font-semibold tracking-wider text-neutral-500 uppercase">
          Gemini API key
        </label>
        <input
          type={reveal ? "text" : "password"}
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="AIza..."
          className="w-full rounded-xl border border-ink-line bg-black/40 px-4 py-3 font-mono text-sm outline-none placeholder:text-neutral-700 focus:border-uga-red"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="text-xs text-neutral-500 active:text-white"
          >
            {reveal ? "Hide" : "Show"}
          </button>
          {keyDraft && (
            <button
              type="button"
              onClick={() => setKeyDraft("")}
              className="text-xs text-neutral-500 active:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Scanning needs a free key from{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-uga-red-bright underline"
          >
            Google AI Studio
          </a>
          . It is stored only on this phone and sent only to Google. Search works
          without one.
        </p>

        <label className="mt-6 mb-1.5 block text-xs font-semibold tracking-wider text-neutral-500 uppercase">
          Usual dining hall
        </label>
        <select
          value={hallDraft}
          onChange={(e) => setHallDraft(e.target.value)}
          className="w-full appearance-none rounded-xl border border-ink-line bg-black/40 px-4 py-3 outline-none focus:border-uga-red"
        >
          <option value="">All halls</option>
          {HALLS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-neutral-500">
          Only nudges matching dishes up the list. Nothing is ever hidden.
        </p>

        <p className="mt-6 text-[11px] text-neutral-700">
          Menu data from UGA Dining, captured{" "}
          {new Date(GENERATED_AT).toLocaleDateString()}. Run{" "}
          <code className="text-neutral-600">npm run data</code> to refresh.
        </p>
      </div>

      <div
        className="shrink-0 border-t border-ink-line px-5 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={save}
          className="w-full rounded-2xl bg-uga-red py-4 font-semibold text-white active:bg-uga-red-bright"
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
