import './styles/main.css';
import { allClients, clientIdFromLocation, loadClient, validateClient } from './config/load';
import type { ClientConfig, FieldKey } from './config/types';
import { ALWAYS_REQUIRED, FIELDS, type TextKey } from './builder/fields';
import { missingFromEmail, toSignatureData, type FormState } from './builder/data';
import { createUploadField } from './builder/upload-field';
import { saveFile } from './builder/save-file';
import { damaged, gifSizeProblem, imageDimensionProblem, imageDisplaySize } from './image/check';
import { gifFitsAsIs, gifSizesToTry, resizeGif } from './image/gif';
import { blobToDataUrl, loadImageFile, renderImage, toPng } from './image/process';
import { UploadError, uploadImage } from './upload/cloudinary';
import { buildSignatureDocument, buildSignatureHtml, buildSignatureText } from './template/signature';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Preview builds (a single shareable HTML file) can't reach the image service. */
const PREVIEW_BUILD = import.meta.env.MODE === 'preview';

// ---------------------------------------------------------------- client
const clientId = clientIdFromLocation(location);
const client = loadClient(clientId);
const banner = $('banner');

function showBanner(text: string, bad = false) {
  banner.textContent = text;
  banner.classList.toggle('bad', bad);
  banner.hidden = false;
}

/** Paths like "/icons/email.png" are on this site; make them full links for email. */
function siteBase(): URL {
  const u = new URL('./', location.href);
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length && allClients()[segs[segs.length - 1].toLowerCase()]) {
    u.pathname = '/' + segs.slice(0, -1).map((s) => s + '/').join('');
  }
  return u;
}
const resolveAsset = (src: string) => (/^(https?:|data:)/i.test(src) ? src : new URL(src.replace(/^\//, ''), siteBase()).href);

// ---------------------------------------------------------------- app
function start(cfg: ClientConfig) {
  document.title = `Email Signature Builder – ${cfg.name}`;
  $('year').textContent = String(new Date().getFullYear());
  $('app').hidden = false;

  const locked = new Set<FieldKey>(cfg.locked ?? []);
  const required = new Set<FieldKey>([...ALWAYS_REQUIRED, ...(cfg.required ?? [])]);
  const upload = PREVIEW_BUILD ? undefined : cfg.upload;
  if (PREVIEW_BUILD) showBanner('Preview version: images aren’t uploaded here, so they’re left out when you copy. Everything else works as it will on the live link.');
  else if (!upload) showBanner('Image hosting isn’t set up for this link yet, so images are left out when you copy.', true);

  const state: FormState = {
    values: Object.fromEntries(FIELDS.map((f) => [f.key, cfg.defaults?.[f.key] ?? f.initial ?? ''])) as Record<TextKey, string>,
    image: null,
  };
  const touched = new Set<TextKey>();

  // ---------- text fields, generated from FIELDS
  const inputs = {} as Record<TextKey, HTMLInputElement>;
  const errorEls = {} as Record<TextKey, HTMLParagraphElement>;
  for (const f of FIELDS) {
    const host = document.querySelector(`[data-fields="${f.section}"]`)!;
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.dataset.field = f.key;
    const id = `f-${f.key}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = f.label;
    if (required.has(f.key)) {
      const r = document.createElement('span');
      r.className = 'req';
      r.textContent = '*';
      r.setAttribute('aria-hidden', 'true');
      label.append(r);
    } else {
      label.append(' (optional)');
    }
    const row = document.createElement('div');
    row.className = 'input-row';
    const input = document.createElement('input');
    input.id = id;
    input.type = f.type ?? 'text';
    input.placeholder = f.placeholder;
    if (f.autocomplete) input.autocomplete = f.autocomplete as AutoFill;
    if (f.type === 'url' || f.type === 'email') { input.autocapitalize = 'off'; input.spellcheck = false; }
    input.value = state.values[f.key];
    if (required.has(f.key)) input.required = true;
    const err = document.createElement('p');
    err.className = 'field-error';
    err.id = `${id}-err`;
    input.setAttribute('aria-describedby', err.id);

    row.append(input);
    wrap.append(label, row, err);
    if (locked.has(f.key)) wrap.hidden = true;
    host.append(wrap);
    inputs[f.key] = input;
    errorEls[f.key] = err;

    input.addEventListener('input', () => { state.values[f.key] = input.value; if (touched.has(f.key)) validateField(f.key); schedule(); });
    input.addEventListener('blur', () => { touched.add(f.key); validateField(f.key); });
  }
  // Hide a section if everything in it is locked.
  document.querySelectorAll<HTMLElement>('[data-section]').forEach((sec) => {
    const visible = [...sec.querySelectorAll<HTMLElement>('.field')].some((el) => !el.hidden);
    if (!visible) sec.hidden = true;
  });

  function fieldProblem(k: TextKey): string | null {
    const f = FIELDS.find((x) => x.key === k)!;
    const v = state.values[k].trim();
    if (!v) return required.has(k) ? `Add your ${f.label.toLowerCase()}.` : null;
    return f.check?.(v, state.values) ?? null;
  }
  function validateField(k: TextKey): boolean {
    const p = locked.has(k) ? null : fieldProblem(k);
    errorEls[k].textContent = p ?? '';
    errorEls[k].closest('.field')!.classList.toggle('invalid', !!p);
    inputs[k].setAttribute('aria-invalid', String(!!p));
    // Paired fields re-check each other.
    if (k === 'ctaText' && touched.has('ctaLink')) revalidate('ctaLink');
    if (k === 'ctaLink' && touched.has('ctaText')) revalidate('ctaText');
    if (k === 'quoteText' && touched.has('quoteAuthor')) revalidate('quoteAuthor');
    return !p;
  }
  function revalidate(k: TextKey) {
    const p = fieldProblem(k);
    errorEls[k].textContent = p ?? '';
    errorEls[k].closest('.field')!.classList.toggle('invalid', !!p);
  }

  const busy = { image: false };

  /** Uploads if hosting is set up. Returns the URL, '' when hosting is off, or false on failure. */
  async function host(blob: Blob, name: string, field: ReturnType<typeof createUploadField>): Promise<string | false> {
    if (!upload) { field.progress('Done', 100); await wait(150); return ''; }
    field.progress('Uploading…', 80);
    try {
      const url = await uploadImage(blob, upload, name);
      field.progress('Done', 100);
      await wait(150);
      return url;
    } catch (e) {
      field.error(e instanceof UploadError ? e.problem : { what: 'The image couldn’t be uploaded.', fix: 'Try again.' });
      return false;
    }
  }

  // ---------- 128 × 128 image
  const imageField = createUploadField($('imageField'), (f) => void addImage(f), {
    remove: () => { state.image = null; imageField.show('empty'); imageField.error(null); schedule(); },
  });

  async function addImage(file: File) {
    imageField.error(null);
    const r = await loadImageFile(file, { gif: true });
    if (!r.ok) return imageField.error(r.problem);
    const dim = imageDimensionProblem(r.value.w, r.value.h);
    if (dim) return imageField.error(dim);
    busy.image = true;
    const shown = imageDisplaySize(r.value.w, r.value.h); // fits inside 128 × 128, keeping its proportions
    let blob: Blob;
    let preview: string;
    let name: string;
    if (r.value.kind === 'gif') {
      // Never drawn onto one canvas (that keeps only the first frame): every frame is resized, so it keeps moving.
      name = 'image.gif';
      if (gifFitsAsIs(r.value.w, r.value.h, file.size)) {
        blob = file; // already small enough: used exactly as uploaded
      } else {
        imageField.progress('Resizing your GIF…', 20);
        const buf = await file.arrayBuffer();
        let best: Blob | null = null;
        try {
          for (const size of gifSizesToTry(r.value.w, r.value.h)) {
            best = await resizeGif(buf, size, (d, t) => imageField.progress('Resizing your GIF…', 20 + Math.round((d / t) * 20)));
            if (!gifSizeProblem(best.size)) break; // light enough; otherwise try a smaller size
          }
        } catch {
          busy.image = false;
          return imageField.error(damaged('gif'));
        }
        const heavy = best && gifSizeProblem(best.size);
        if (!best || heavy) { busy.image = false; return imageField.error(heavy || damaged('gif')); }
        blob = best;
      }
      preview = await blobToDataUrl(blob);
    } else {
      imageField.progress('Resizing your image…', 40);
      const canvas = renderImage(r.value.img, shown);
      preview = canvas.toDataURL('image/png');
      blob = await toPng(canvas);
      name = 'image.png';
    }
    const hosted = await host(blob, name, imageField);
    busy.image = false;
    if (hosted === false) { state.image = null; imageField.show('empty'); schedule(); return; }
    state.image = { preview, hosted: hosted || undefined, width: shown.width, height: shown.height };
    imageField.done(preview, r.value.name);
    schedule();
  }

  // ---------- preview
  const previewInner = $('previewInner');
  let raf = 0;
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderPreview);
    $('actionMsg').textContent = '';
  }
  function renderPreview() {
    const d = toSignatureData(state, cfg, 'preview', resolveAsset);
    // The preview's Light/Dark switch decides the look, not the viewer's own system setting.
    let html = buildSignatureHtml(d).replace(/<style>[\s\S]*?<\/style>/, '');
    previewInner.innerHTML = html;
  }
  renderPreview();

  document.querySelectorAll<HTMLButtonElement>('[data-theme-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      $('preview').dataset.theme = b.dataset.themeBtn!;
      document.querySelectorAll('[data-theme-btn]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );

  // ---------- copy + download
  const msg = $('actionMsg');
  const say = (text: string, ok: boolean) => { msg.textContent = text; msg.className = `msg ${ok ? 'ok' : 'warn'}`; };

  function readyForEmail(): boolean {
    for (const k of FIELDS.map((f) => f.key)) touched.add(k);
    const bad = FIELDS.filter((f) => !locked.has(f.key) && !validateField(f.key));
    if (busy.image) { say('Wait a moment, your image is still uploading.', false); return false; }
    if (bad.length) {
      const names = bad.map((f) => f.label.toLowerCase());
      say(`Check ${names.length === 1 ? 'this field' : 'these fields'} first: ${names.join(', ')}.`, false);
      const first = inputs[bad[0].key];
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first instanceof HTMLInputElement) first.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  function emailNote(prefix: string): [string, boolean] {
    const missing = missingFromEmail(state, resolveAsset);
    if (!missing.length) return [`${prefix} Now follow “How to install” below.`, true];
    const notes: string[] = [];
    if (missing.includes('image')) {
      const why = PREVIEW_BUILD ? 'images aren’t hosted in this preview' : !upload ? 'image hosting isn’t set up for this link' : 'it didn’t upload. Try adding it again';
      notes.push(`Your image was left out because ${why}.`);
    }
    if (missing.includes('icons')) notes.push(`The icons were left out because this page isn’t on a public link yet (they’ll be included once the tool is live).`);
    return [`${prefix} ${notes.join(' ')}`, false];
  }

  $('copyBtn').addEventListener('click', async () => {
    if (!readyForEmail()) return;
    const d = toSignatureData(state, cfg, 'email', resolveAsset);
    const ok = await copyRich(buildSignatureHtml(d), buildSignatureText(d));
    if (!ok) return say('Your browser blocked copying. Click “Download HTML” instead, open the file, select all and copy.', false);
    const btn = $('copyBtn');
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = 'Copy signature'), 2000);
    say(...emailNote('Copied.'));
    ($('install') as HTMLDetailsElement).open = true;
  });

  $('downloadBtn').addEventListener('click', async () => {
    if (!readyForEmail()) return;
    const d = toSignatureData(state, cfg, 'email', resolveAsset);
    const outcome = await saveFile(`signature-${slug(d.name)}.html`, buildSignatureDocument(d));
    if (outcome === 'declined') return say('Download cancelled.', false);
    if (outcome === 'unavailable') return say('Downloads aren’t available here. Use Copy signature instead.', false);
    say(...emailNote('Downloaded.'));
  });

  // ---------- install guide tabs
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
    }),
  );
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'email';

async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('no async clipboard');
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }),
    ]);
    return true;
  } catch {
    // Fallback for older browsers: select a rendered copy and use the legacy copy command.
    const box = $('sigSource');
    box.innerHTML = html;
    const sel = getSelection()!;
    const r = document.createRange();
    r.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(r);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* blocked */ }
    sel.removeAllRanges();
    box.innerHTML = '';
    return ok;
  }
}

// ---------------------------------------------------------------- boot (last, so everything above is defined)
if (!client) {
  showBanner(`This link (“${clientId}”) isn’t set up. Check the link you were sent, or ask the Heights team for a new one.`, true);
} else {
  const problems = validateClient(clientId, client);
  if (problems.length && import.meta.env.DEV) showBanner(`Client file problems (only shown while developing): ${problems.join(' ')}`, true);
  start(client);
}
