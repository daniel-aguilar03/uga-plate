/**
 * Reads dish names off UGA shelf labels by calling Gemini straight from the
 * browser. Google's API sends CORS headers and accepts `x-goog-api-key`, so
 * this needs no server -- the key lives only in this device's localStorage.
 *
 * The whole plate goes in one multimodal request. Parallel per-photo calls
 * were wall-clock similar but paid the model-startup and rate-limit cost N
 * times; one call is almost always faster on free-tier wifi.
 */
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Tried in order until one answers. Reading a few words of large printed text
 * does not need a frontier model, and the newest flagship is by far the most
 * contended on the free tier. The lite models go first. All are free-tier.
 */
export const MODELS = [
  { id: "gemini-3.5-flash-lite", label: "3.5 Flash-Lite (fastest)" },
  { id: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite" },
  { id: "gemini-3.6-flash", label: "3.6 Flash" },
  { id: "gemini-3.7-flash", label: "3.7 Flash" },
  { id: "gemini-3.8-flash", label: "3.8 Flash (newest, often busy)" },
] as const;

export const AUTO_MODEL = "auto";

function batchPrompt(count: number) {
  return `You are reading ${count} photo${count === 1 ? "" : "s"} of University of Georgia dining hall shelf labels. Photos are numbered Photo 1 through Photo ${count} in the order they appear below.

For EACH photo, return the dish names printed in the large title text on that photo.

Rules:
- Copy titles verbatim, including trailing phrases like "with Sesame Seeds".
- Ignore station names, allergen icons, dietary tags, nutrition numbers, prices, and barcodes.
- If one photo shows several distinct labels, list every readable title for that photo.
- If a photo has no readable dish title, return an empty names list for that photo.
- Always return exactly ${count} entries in "photos", with "index" matching the photo number (1-based).`;
}

export type VisionResult =
  | { ok: true; names: string[]; model: string }
  | { ok: false; error: string; needsKey?: boolean };

/** One row per input photo, in the same order they were sent. */
export type BatchVisionResult =
  | { ok: true; photos: string[][]; model: string }
  | { ok: false; error: string; needsKey?: boolean };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

type Attempt =
  | { kind: "ok"; photos: string[][] }
  | { kind: "busy" }
  | { kind: "fatal"; error: string; needsKey?: boolean };

function buildBody(images: string[], withThinking: boolean) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: batchPrompt(images.length) }];

  images.forEach((data, i) => {
    parts.push({ text: `Photo ${i + 1}:` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data } });
  });

  return {
    contents: [{ parts }],
    generationConfig: {
      // thinkingLevel is nested under thinkingConfig and is an uppercase enum;
      // putting it directly on generationConfig is rejected outright.
      ...(withThinking ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          photos: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                index: { type: "INTEGER" },
                names: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["index", "names"],
            },
          },
        },
        required: ["photos"],
      },
    },
  };
}

function parsePhotos(text: string, expected: number): string[][] | null {
  try {
    const parsed = JSON.parse(text) as {
      photos?: Array<{ index?: unknown; names?: unknown }>;
      names?: unknown;
    };

    // Preferred: per-photo structured reply.
    if (Array.isArray(parsed.photos)) {
      const byIndex = new Map<number, string[]>();
      for (const row of parsed.photos) {
        const index =
          typeof row.index === "number" ? row.index : Number(row.index);
        const names = Array.isArray(row.names)
          ? row.names
              .filter((n): n is string => typeof n === "string")
              .map((n) => n.trim())
              .filter(Boolean)
          : [];
        if (Number.isFinite(index)) byIndex.set(index, names);
      }

      return Array.from({ length: expected }, (_, i) => byIndex.get(i + 1) ?? []);
    }

    // Fallback if the model collapses to a flat list.
    if (Array.isArray(parsed.names)) {
      const names = parsed.names
        .filter((n): n is string => typeof n === "string")
        .map((n) => n.trim())
        .filter(Boolean);
      if (expected === 1) return [names];
      // Can't safely assign a flat list across many photos.
      return names.map((n) => [n]).concat(
        Array.from({ length: Math.max(0, expected - names.length) }, () => []),
      );
    }
  } catch {
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    if (cleaned && expected === 1) return [[cleaned]];
  }
  return null;
}

async function tryModel(
  model: string,
  images: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<Attempt> {
  const url = `${API_BASE}/${model}:generateContent`;

  const send = (withThinking: boolean) =>
    fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildBody(images, withThinking)),
    });

  let res = await send(true);
  let data = (await res.json().catch(() => ({}))) as GeminiResponse;

  // Thinking controls have moved between Gemini versions and not every model
  // accepts them. If the field is the problem, scan without it rather than fail.
  if (!res.ok && /thinking/i.test(data.error?.message ?? "")) {
    res = await send(false);
    data = (await res.json().catch(() => ({}))) as GeminiResponse;
  }

  if (!res.ok) {
    const message = data.error?.message ?? `Request failed (${res.status}).`;

    if (res.status === 503 || res.status === 429 || res.status === 500) {
      return { kind: "busy" };
    }
    if (res.status === 404) return { kind: "busy" };

    if (res.status === 400 && /api key/i.test(message)) {
      return { kind: "fatal", error: "That API key was rejected.", needsKey: true };
    }
    if (res.status === 403) {
      return {
        kind: "fatal",
        error: "Key lacks access to the Gemini API.",
        needsKey: true,
      };
    }
    return { kind: "fatal", error: message };
  }

  if (data.promptFeedback?.blockReason) {
    return { kind: "fatal", error: "Google blocked that image." };
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) return { kind: "busy" };

  const photos = parsePhotos(text, images.length);
  if (!photos) return { kind: "busy" };
  return { kind: "ok", photos };
}

/**
 * Send every label photo in a single multimodal request. Returns one names
 * array per input image, in the same order.
 */
export async function readLabels(
  images: string[],
  apiKey: string,
  options: { signal?: AbortSignal; model?: string } = {},
): Promise<BatchVisionResult> {
  if (!apiKey) {
    return { ok: false, error: "Add your Gemini key in Settings to scan.", needsKey: true };
  }
  if (!images.length) {
    return { ok: true, photos: [], model: "" };
  }

  const { signal, model = AUTO_MODEL } = options;
  const chain =
    model && model !== AUTO_MODEL ? [model] : MODELS.map((m) => m.id);

  let sawBusy = false;

  for (const candidate of chain) {
    let attempt: Attempt;
    try {
      attempt = await tryModel(candidate, images, apiKey, signal);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return { ok: false, error: "Scan cancelled." };
      }
      return { ok: false, error: "No connection. Use Search instead." };
    }

    if (attempt.kind === "ok") {
      return { ok: true, photos: attempt.photos, model: candidate };
    }
    if (attempt.kind === "fatal") {
      return { ok: false, error: attempt.error, needsKey: attempt.needsKey };
    }
    sawBusy = true;
  }

  return {
    ok: false,
    error: sawBusy
      ? "All Gemini models are busy right now. Search still works."
      : "Could not reach Gemini. Search still works.",
  };
}

/** Convenience wrapper for a single photo. */
export async function readLabel(
  base64Jpeg: string,
  apiKey: string,
  options: { signal?: AbortSignal; model?: string } = {},
): Promise<VisionResult> {
  const result = await readLabels([base64Jpeg], apiKey, options);
  if (!result.ok) return result;
  return { ok: true, names: result.photos[0] ?? [], model: result.model };
}
