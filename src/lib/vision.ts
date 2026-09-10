/**
 * Reads dish names off a UGA shelf label by calling Gemini straight from the
 * browser. Google's API sends CORS headers and accepts `x-goog-api-key`, so
 * this needs no server -- the key lives only in this device's localStorage.
 */
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Tried in order until one answers. Reading a few words of large printed text
 * does not need a frontier model, and the newest flagship is by far the most
 * contended on the free tier -- it returns "model is overloaded" for days at a
 * time. The lite models are built for high-volume work and are almost always
 * available, so they go first. Every entry here is free-tier eligible.
 */
export const MODELS = [
  { id: "gemini-3.5-flash-lite", label: "3.5 Flash-Lite (fastest)" },
  { id: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite" },
  { id: "gemini-3.6-flash", label: "3.6 Flash" },
  { id: "gemini-3.7-flash", label: "3.7 Flash" },
  { id: "gemini-3.8-flash", label: "3.8 Flash (newest, often busy)" },
] as const;

export const AUTO_MODEL = "auto";

const PROMPT = `This photo shows one or more food labels at a University of Georgia dining hall.

Return the dish names exactly as printed in the large title text of each label.

Rules:
- Copy the title verbatim, including trailing phrases like "with Sesame Seeds".
- Ignore station names, allergen icons, dietary tags, nutrition numbers, prices, and barcodes.
- If several distinct labels are readable, return one entry per label, ordered largest and most centered first.
- If no dish title is readable, return an empty list.`;

export type VisionResult =
  | { ok: true; names: string[]; model: string }
  | { ok: false; error: string; needsKey?: boolean };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

function buildBody(base64Jpeg: string, withThinking: boolean) {
  return {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Jpeg } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      // thinkingLevel is nested under thinkingConfig and is an uppercase enum;
      // putting it directly on generationConfig is rejected outright.
      ...(withThinking ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { names: { type: "ARRAY", items: { type: "STRING" } } },
        required: ["names"],
      },
    },
  };
}

type Attempt =
  | { kind: "ok"; names: string[] }
  | { kind: "busy" }
  | { kind: "fatal"; error: string; needsKey?: boolean };

async function tryModel(
  model: string,
  base64Jpeg: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Attempt> {
  const url = `${API_BASE}/${model}:generateContent`;

  const send = (withThinking: boolean) =>
    fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildBody(base64Jpeg, withThinking)),
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

    // Busy or missing: worth trying the next model in the list.
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

  try {
    const parsed = JSON.parse(text) as { names?: unknown };
    const names = Array.isArray(parsed.names)
      ? parsed.names
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
    return { kind: "ok", names };
  } catch {
    // Structured output should hold, but never lose a usable read to a parse slip.
    return { kind: "ok", names: [text.replace(/^["']|["']$/g, "")] };
  }
}

/**
 * Reads a batch of label photos at once. Requests run concurrently so a whole
 * plate costs about the same wall-clock time as a single photo, which is the
 * point: you snap labels down the line without waiting, then read them all
 * when you sit down.
 */
export async function readLabels(
  images: string[],
  apiKey: string,
  options: {
    signal?: AbortSignal;
    model?: string;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<VisionResult[]> {
  const { concurrency = 4, onProgress, ...rest } = options;
  const results: VisionResult[] = new Array(images.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < images.length) {
      const index = cursor++;
      results[index] = await readLabel(images[index], apiKey, rest);
      onProgress?.(++done, images.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, images.length) }, worker),
  );

  return results;
}

export async function readLabel(
  base64Jpeg: string,
  apiKey: string,
  options: { signal?: AbortSignal; model?: string } = {},
): Promise<VisionResult> {
  if (!apiKey) {
    return { ok: false, error: "Add your Gemini key in Settings to scan.", needsKey: true };
  }

  const { signal, model = AUTO_MODEL } = options;
  const chain =
    model && model !== AUTO_MODEL ? [model] : MODELS.map((m) => m.id);

  let sawBusy = false;

  for (const candidate of chain) {
    let attempt: Attempt;
    try {
      attempt = await tryModel(candidate, base64Jpeg, apiKey, signal);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return { ok: false, error: "Scan cancelled." };
      }
      return { ok: false, error: "No connection. Use Search instead." };
    }

    if (attempt.kind === "ok") return { ok: true, names: attempt.names, model: candidate };
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
