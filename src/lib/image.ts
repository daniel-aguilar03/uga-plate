const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

/**
 * Shrink a camera photo to something small enough to upload over dining-hall
 * wifi while keeping label text legible, and hand back raw base64 for Gemini.
 */
export async function toBase64Jpeg(
  file: File | Blob,
): Promise<{ base64: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available on this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { base64: dataUrl.split(",")[1] ?? "", previewUrl: dataUrl };
  } finally {
    bitmap.close();
  }
}
