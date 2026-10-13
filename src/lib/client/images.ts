import { IMAGE_MIME_TYPES, type ImageMime, type ImagePart } from "@/lib/harness/types";
import { fileStore } from "@/lib/rag/store";
import type { ImageRef } from "./conversations";
import { newId } from "./ids";

/** Longest side sent to models; larger pictures are scaled down (most vision APIs resize anyway). */
export const MAX_IMAGE_SIDE = 1568;
/** Pictures larger than this after scaling are re-encoded as JPEG. */
const MAX_KEEP_BYTES = 1_000_000;
export const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export class ImageError extends Error {}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(file.name);
}

/**
 * Scale a picture to fit MAX_IMAGE_SIDE and make sure it's in a format every vision API
 * accepts (PNG, JPEG, WebP, GIF). Large or unusual pictures become JPEG.
 */
export async function preparePicture(blob: Blob): Promise<{ blob: Blob; mime: ImageMime; width: number; height: number }> {
  if (blob.size > MAX_INPUT_BYTES) throw new ImageError("This picture is too large (over 30 MB).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new ImageError("This picture couldn't be opened. Try a PNG or JPEG.");
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const supported = (IMAGE_MIME_TYPES as readonly string[]).includes(blob.type);
  if (scale === 1 && supported && blob.size <= MAX_KEEP_BYTES) {
    bitmap.close();
    return { blob, mime: blob.type as ImageMime, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("This browser can't process pictures.");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!out) throw new ImageError("This picture couldn't be processed.");
  return { blob: out, mime: "image/jpeg", width, height };
}

/** Prepare and store a picture for a conversation; returns the reference kept on the message. */
export async function savePicture(conversationId: string, file: Blob, name: string): Promise<ImageRef> {
  const pic = await preparePicture(file);
  const id = newId();
  await fileStore.putImage({ id, conversationId, blob: pic.blob });
  return { id, mime: pic.mime, name, width: pic.width, height: pic.height };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Load stored pictures as base64 parts for a request. Missing pictures are skipped. */
export async function loadImageParts(refs: ImageRef[]): Promise<ImagePart[]> {
  const parts: ImagePart[] = [];
  for (const ref of refs) {
    const stored = await fileStore.getImage(ref.id);
    if (stored) parts.push({ mime: ref.mime, data: await blobToBase64(stored.blob) });
  }
  return parts;
}

/** An object URL for showing a stored picture; the caller revokes it. */
export async function imageUrl(id: string): Promise<string | null> {
  const stored = await fileStore.getImage(id);
  return stored ? URL.createObjectURL(stored.blob) : null;
}
