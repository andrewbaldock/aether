// Client-side attachment handling: turn a File (picked, pasted, or dropped) into
// the ephemeral Attachment shape useChat sends. Images are downscaled before
// encoding so a phone screenshot doesn't blow the 5MB API limit (or the token
// budget — base64 of a huge PNG is a lot of input). PDFs pass through untouched.
//
// These limits mirror the backend's (see isAttachmentArray in index.ts). The
// backend re-validates everything; this is the friendly first line that rejects
// bad files with a toast instead of a 400.
import type { Attachment } from "./useChat";

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 32 * 1024 * 1024;

// Downscale target: cap the long edge so large screenshots/photos shrink to a
// size that's plenty for the model to read while staying well under the limit and
// cheap on tokens. GIFs are left alone (canvas would flatten animation), as are
// images already under the cap on both dimensions.
const MAX_IMAGE_DIM = 1568;

export type AttachmentError = { name: string; reason: string };

// Strip the `data:<type>;base64,` prefix a FileReader/canvas produces, leaving the
// bare base64 the API wants.
function stripDataUri(dataUri: string): string {
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = dataUrl;
  });
}

// Downscale via canvas if either dimension exceeds MAX_IMAGE_DIM. Re-encodes to
// JPEG (smaller than PNG for photos/screenshots, and the model reads it the same)
// unless the source is a GIF — GIFs are returned as-is to preserve animation and
// avoid a black frame from a canvas that can't read the animated stream. Returns
// the (possibly new) mediaType alongside the bare base64.
async function maybeDownscaleImage(
  file: File
): Promise<{ data: string; mediaType: string }> {
  const sourceDataUrl = await readAsDataUrl(file);
  if (file.type === "image/gif") {
    return { data: stripDataUri(sourceDataUrl), mediaType: "image/gif" };
  }
  const img = await loadImage(sourceDataUrl);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longEdge <= MAX_IMAGE_DIM) {
    // Small enough already — keep the original bytes and type (no re-encode).
    return { data: stripDataUri(sourceDataUrl), mediaType: file.type };
  }
  const scale = MAX_IMAGE_DIM / longEdge;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No 2D context (rare) — fall back to the original bytes.
    return { data: stripDataUri(sourceDataUrl), mediaType: file.type };
  }
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  return { data: stripDataUri(jpeg), mediaType: "image/jpeg" };
}

// Decoded byte length of a base64 string (4 chars → 3 bytes, minus padding).
function base64ByteLength(b64: string): number {
  if (b64.length === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

// Convert one File to an Attachment, or return an error describing why it can't be
// attached (unsupported type, or still too large after downscaling). Object URLs
// for image previews are created here and must be revoked by the caller on remove.
export async function fileToAttachment(
  file: File
): Promise<Attachment | AttachmentError> {
  const isImage = IMAGE_TYPES.has(file.type);
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return { name: file.name, reason: "Only images and PDFs can be attached" };
  }

  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      return { name: file.name, reason: "PDF is larger than 32MB" };
    }
    const data = stripDataUri(await readAsDataUrl(file));
    return {
      kind: "document",
      mediaType: "application/pdf",
      data,
      name: file.name || "document.pdf",
    };
  }

  // Image: downscale if needed, then enforce the byte cap on the result.
  const { data, mediaType } = await maybeDownscaleImage(file);
  if (base64ByteLength(data) > MAX_IMAGE_BYTES) {
    return { name: file.name, reason: "Image is too large even after resizing" };
  }
  return {
    kind: "image",
    mediaType,
    data,
    name: file.name || "image",
    previewUrl: `data:${mediaType};base64,${data}`,
  };
}

// Process a batch of files, splitting into successful attachments and errors so
// the UI can add the good ones and toast the rest in one pass.
export async function filesToAttachments(
  files: File[]
): Promise<{ attachments: Attachment[]; errors: AttachmentError[] }> {
  const results = await Promise.all(files.map(fileToAttachment));
  const attachments: Attachment[] = [];
  const errors: AttachmentError[] = [];
  for (const r of results) {
    if ("kind" in r) attachments.push(r);
    else errors.push(r);
  }
  return { attachments, errors };
}
