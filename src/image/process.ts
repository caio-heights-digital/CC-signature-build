import { damaged, IMAGE_SIZE, sizeProblem, sniffBytes, typeProblem, unreadable, type Kind, type Problem } from './check';

export interface LoadedImage {
  img: HTMLImageElement;
  /** data: URL of the original. data: (not blob:) so it also works on pages with a strict content policy. */
  url: string;
  name: string;
  kind: Kind;
  w: number;
  h: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

export const blobToDataUrl = (f: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

/** Reads and checks a file. Never throws; problems come back as plain-language messages. */
export async function loadImageFile(file: File, opts: { gif?: boolean } = {}): Promise<Result<LoadedImage>> {
  let kind: Kind;
  try {
    kind = sniffBytes(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  } catch {
    return { ok: false, problem: unreadable };
  }
  const tp = typeProblem(kind, file.name, opts);
  if (tp) return { ok: false, problem: tp };
  const sp = sizeProblem(file.size); // a big GIF is fine: it's shrunk before it's hosted
  if (sp) return { ok: false, problem: sp };

  let url: string;
  try {
    url = await blobToDataUrl(file);
  } catch {
    return { ok: false, problem: { what: 'Your browser couldn’t read this file.', fix: 'Try again, or save it to your desktop and upload it from there.' } };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, value: { img, url, name: file.name, kind, w: img.naturalWidth, h: img.naturalHeight } });
    img.onerror = () => resolve({ ok: false, problem: damaged(kind) });
    img.src = url;
  });
}

export const HEADSHOT_PX = 400; // 105 px displayed, ~4× for sharp screens and future layouts

/**
 * Draws the cropped square onto a fresh canvas. Re-encoding drops all metadata
 * (including GPS location) and fixes phone orientation.
 */
export function renderHeadshot(img: HTMLImageElement, sx: number, sy: number, side: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = HEADSHOT_PX;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, HEADSHOT_PX, HEADSHOT_PX);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, HEADSHOT_PX, HEADSHOT_PX);
  return c;
}

/**
 * Draws a still image at the size it will be shown (see imageDisplaySize), at up to 2× for sharp screens
 * (never bigger than the original). It's exactly the image, so the signature wraps tightly around it: no
 * white bars, nothing cropped. See-through areas are put on white, because email apps
 * would darken them in dark mode. (GIFs skip this and are used as they are, so they keep moving.)
 */
export function renderImage(img: HTMLImageElement, display: { width: number; height: number }): HTMLCanvasElement {
  const k = Math.min(2, Math.max(img.naturalWidth, img.naturalHeight) / IMAGE_SIZE);
  const c = document.createElement('canvas');
  c.width = Math.round(display.width * k);
  c.height = Math.round(display.height * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const toJpeg = (c: HTMLCanvasElement, q = 0.9) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', q));

export const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
