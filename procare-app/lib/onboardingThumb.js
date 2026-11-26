'use client';

import { createClient } from './supabase/client';

/**
 * Card pictures for Onboarding (change 96), made in the browser so nothing heavy runs on the server:
 * a PDF's first page (pdf.js, loaded from a CDN only when needed) or a picture scaled down, saved as a small JPEG.
 */
const WIDTH = 640;
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(/* webpackIgnore: true */ PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  }
  return pdfjs;
}

const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));

/** A small JPEG of a PDF's first page or of a picture. Returns null when it can't (e.g. a damaged file). */
export async function makeThumb(blob) {
  try {
    const type = blob.type || '';
    const canvas = document.createElement('canvas');
    if (type === 'application/pdf' || /\.pdf$/i.test(blob.name || '')) {
      const lib = await loadPdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / base.width });
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pdf.destroy();
    } else if (/^image\//.test(type)) {
      const img = await createImageBitmap(blob);
      const k = Math.min(1, WIDTH / img.width);
      canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      return null;
    }
    return await toJpeg(canvas);
  } catch {
    return null;
  }
}

const post = async (body) => {
  const res = await fetch('/api/onboarding-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
  return j;
};

/** Upload a picture blob and make it the document's card picture. */
export async function setThumb(docId, jpeg) {
  const start = await post({ action: 'start', name: 'card-picture.jpg' });
  const { error } = await createClient().storage.from('onboarding-docs').uploadToSignedUrl(start.path, start.token, jpeg, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  await post({ action: 'thumb', id: docId, path: start.path });
}

export const clearThumb = (docId) => post({ action: 'thumb', id: docId, path: null });
export const linkThumb = (docId) => post({ action: 'linkthumb', id: docId });

/**
 * For the people who manage Onboarding: give documents added before pictures existed (or whose picture couldn't be
 * made) a picture, one at a time. Tried once per document per browser session. Returns true if anything changed.
 */
export async function fillMissingThumbs(docs) {
  let changed = false;
  for (const d of docs) {
    const key = `ob-thumb-tried-${d.id}-${d.updated_at}`;
    try { if (sessionStorage.getItem(key)) continue; sessionStorage.setItem(key, '1'); } catch { /* private window */ }
    try {
      if (d.kind === 'link') {
        const r = await linkThumb(d.id);
        if (r.ok) changed = true;
      } else {
        const res = await fetch(`/api/onboarding-doc?id=${d.id}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const jpeg = await makeThumb(new File([blob], d.file_name || 'file', { type: d.mime || blob.type }));
        if (jpeg) { await setThumb(d.id, jpeg); changed = true; }
      }
    } catch { /* leave the placeholder */ }
  }
  return changed;
}
