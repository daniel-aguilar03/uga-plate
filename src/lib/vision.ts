/**
 * Reads dish names off a UGA shelf label by calling Gemini straight from the
 * browser. Google's API sends CORS headers and accepts `x-goog-api-key`, so
 * this needs no server -- the key lives only in this device's localStorage.
 */
const MODEL = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `This photo shows one or more food labels at a University of Georgia dining hall.

Return the dish names exactly as printed in the large title text of each label.

Rules:
- Copy the title verbatim, including trailing phrases like "with Sesame Seeds".
- Ignore station names, allergen icons, dietary tags, nutrition numbers, prices, and barcodes.
- If several distinct labels are readable, return one entry per label, ordered largest and most centered first.
- If no dish title is readable, return an empty list.`;

export type VisionResult =
  | { ok: true; names: string[] }
  | { ok: false; error: string; needsKey?: boolean };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export async function readLabel(
  base64Jpeg: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<VisionResult> {
  if (!apiKey) {
    return { ok: false, error: "Add your Gemini key in Settings to scan.", needsKey: true };
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "image/jpeg", data: base64Jpeg } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          // Gemini 3 replaced thinkingBudget with thinkingLevel and dropped
          // temperature/topP/topK entirely.
          thinkingLevel: "low",
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              names: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["names"],
          },
        },
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, error: "Scan cancelled." };
    }
    return { ok: false, error: "No connection. Use Search instead." };
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const message = data.error?.message ?? `Request failed (${res.status}).`;
    if (res.status === 400 && /api key/i.test(message)) {
      return { ok: false, error: "That API key was rejected.", needsKey: true };
    }
    if (res.status === 403) {
      return { ok: false, error: "Key lacks access to the Gemini API.", needsKey: true };
    }
    if (res.status === 429) {
      return { ok: false, error: "Rate limited by Google. Wait a moment." };
    }
    return { ok: false, error: message };
  }

  if (data.promptFeedback?.blockReason) {
    return { ok: false, error: "Google blocked that image." };
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) return { ok: false, error: "Nothing readable in that photo." };

  try {
    const parsed = JSON.parse(text) as { names?: unknown };
    const names = Array.isArray(parsed.names)
      ? parsed.names
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
    return { ok: true, names };
  } catch {
    // Structured output should hold, but never lose a usable read to a parse slip.
    return { ok: true, names: [text.replace(/^["']|["']$/g, "")] };
  }
}
