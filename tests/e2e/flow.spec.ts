import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const fx = (f: string) => path.join(import.meta.dirname, 'fixtures', f);
const HOSTED = 'https://res.cloudinary.com/fvkcrpgg/image/upload/v1/test.jpg';

/** Simulated Cloudinary: records uploads, never touches the real account. */
async function fakeCloudinary(page: Page, fail?: string) {
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/**', async (route) => {
    uploads.push(route.request().url());
    if (fail) return route.fulfill({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { message: fail } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ secure_url: HOSTED }) });
  });
  return uploads;
}
const clipboardHtml = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType('text/html')).text();
  });

async function addImage(page: Page, file = 'photo.jpg') {
  await page.locator('#imageField input[type=file]').setInputFiles(fx(file));
  await expect(page.locator('#imageField .status')).toBeVisible();
}

test('full signature: fill in, image, copy with hosted image', async ({ page }) => {
  const uploads = await fakeCloudinary(page);
  await page.goto('/');
  await page.fill('#f-name', 'Anastasiia Cherevychna');
  await page.fill('#f-title', 'Designer');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await addImage(page);
  await page.fill('#f-email', 'name@heights.digital');
  await page.fill('#f-phone', '+351 912 345 678');
  await page.fill('#f-linkedin', 'linkedin.com/in/someone');
  await page.fill('#f-ctaText', 'Book a call');
  await page.fill('#f-ctaLink', 'calendly.com/heights');
  await page.fill('#f-quoteText', 'Some deep and smart optional quote here');
  await page.fill('#f-quoteAuthor', 'Someone’s name');

  const preview = page.locator('#previewInner');
  await expect(preview).toContainText('Anastasiia Cherevychna');
  await expect(preview).toContainText('Book a call');
  await expect(preview.locator('img:visible')).toHaveCount(5); // image + 3 contact icons + the CTA arrow chip (the email is written out)
  await expect(preview.locator('a[href="mailto:name@heights.digital"]')).toHaveText('name@heights.digital');

  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toContain('/v1_1/fvkcrpgg/image/upload');
  const html = await clipboardHtml(page);
  expect(html).toContain(HOSTED);
  expect(html).toContain('href="https://linkedin.com/in/someone"');
  expect(html).toContain('href="https://calendly.com/heights"');
  expect(html).toContain('bgcolor="#262626"'); // the Figma button
  expect(html).not.toContain('data:image');
  await expect(page.locator('#install')).toHaveAttribute('open', '');
  await page.screenshot({ path: 'test-results/full.png', fullPage: true });
});

test('blocks copying until the required fields are there, and says why', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Check these fields first: name, job title, cta link.');
  await expect(page.locator('#f-name-err')).toHaveText('Add your name.');
  await expect(page.locator('#f-ctaLink-err')).toHaveText('Add your cta link.');
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Check this field first: cta link.');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.fill('#f-email', 'jane@company');
  await page.click('#copyBtn');
  await expect(page.locator('#f-email-err')).toContainText('looks incomplete');
  await page.fill('#f-email', 'jane@company.com');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  expect(await clipboardHtml(page)).not.toContain('<img src="https://res');
});

test('explains file problems', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#imageField input[type=file]');
  await input.setInputFiles(fx('image-small.png'));
  await expect(page.locator('#imageField .error')).toContainText('only 100×100 px');
  await input.setInputFiles(fx('actually-webp.jpg'));
  await expect(page.locator('#imageField .error')).toContainText('WebP');
  await expect(page.locator('#imageField .error')).toContainText('isn’t actually a JPG');
});

test('upload setup problems are reported as setup issues', async ({ page }) => {
  await fakeCloudinary(page, 'Upload preset not found');
  await page.goto('/');
  await page.locator('#imageField input[type=file]').setInputFiles(fx('photo.jpg'));
  await expect(page.locator('#imageField .error')).toContainText('setup issue');
});

test('locked fields are hidden, and their values come from the client file', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/?client=demo-locked');
  await expect(page.locator('[data-field="website"]')).toBeHidden();
  await expect(page.locator('[data-field="ctaColour"], .swatch')).toHaveCount(0); // no CTA colour option
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied'); // copying is async; wait before reading the clipboard
  const html = await clipboardHtml(page);
  expect(html).toContain('acme.example'); // locked website comes from the client file
  expect(html).toContain('>Book a call</a>'); // CTA text and link from the client file
  expect(html).toContain('href="https://acme.example/contact"');
});

test('there is no headshot: no upload, no crop, no switch, and nothing for it in the preview or the copy', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/');
  await expect(page.locator('#headshotField, #noHeadshot, #cropDialog, [data-field="headshot"]')).toHaveCount(0);
  await expect(page.getByText(/headshot/i)).toHaveCount(0);
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await expect(page.locator('#previewInner svg, #previewInner .ph-photo')).toHaveCount(0); // no grey silhouette
  // the name is the first thing on the left of the signature
  const firstCell = page.locator('#previewInner > table table td').first();
  await expect(firstCell).toContainText('Jane');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  expect(await clipboardHtml(page)).not.toMatch(/width="105"/);
});

test('there is no company logo option: just the Image upload, with an IMAGE placeholder until one is added', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#imageField')).toBeVisible();
  await expect(page.locator('#logoField, #slotField, [data-slot-btn]')).toHaveCount(0);
  await expect(page.getByText(/company logo/i)).toHaveCount(0);
  await expect(page.locator('#previewInner [data-placeholder="logo"]')).toHaveCount(0);
  await expect(page.locator('#previewInner [data-placeholder="image"]')).toHaveText('IMAGE');
});

const pixels = (loc: ReturnType<Page['locator']>, points: [number, number][]) =>
  loc.evaluate((img: HTMLImageElement, pts: [number, number][]) => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    return { size: [c.width, c.height], at: pts.map(([a, b]) => [...x.getImageData(a, b, 1, 1).data]) };
  }, points);

test('image option: upload a square image, and it goes in at 128 × 128 on white', async ({ page }) => {
  const uploads = await fakeCloudinary(page);
  await page.goto('/');
  // grey placeholder on the right, 128 × 128, until an image is added
  const ph = page.locator('#previewInner [data-placeholder="image"]');
  await expect(ph).toHaveText('IMAGE');
  expect((await ph.boundingBox())!.width).toBe(128);
  expect((await ph.boundingBox())!.height).toBe(128);

  await page.locator('#imageField input[type=file]').setInputFiles(fx('image-square.png'));
  await expect(page.locator('#imageField .status')).toBeVisible();
  expect(uploads).toHaveLength(1);
  await expect(page.locator('#previewInner [data-placeholder]')).toHaveCount(0);
  const img = page.locator('#previewInner img[alt="Heights Digital"]');
  await expect(img).toHaveAttribute('width', '128');
  await expect(img).toHaveAttribute('height', '128');
  // 300 × 300 transparent PNG with a navy disc → 256 × 256 (2× for sharp screens), see-through parts put on white
  const px = await pixels(img, [[4, 4], [128, 128]]);
  expect(px.size).toEqual([256, 256]);
  expect(px.at[0]).toEqual([255, 255, 255, 255]);
  expect(px.at[1].slice(0, 3)).toEqual([30, 58, 138]);

  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  const html = await clipboardHtml(page);
  expect(html).toContain(`<img src="${HOSTED}" width="128" height="128"`);
  expect(html).not.toContain('data:image');
  expect(html).not.toContain('data-placeholder');

  await page.locator('#imageField [data-remove]').click();
  await expect(page.locator('#previewInner [data-placeholder="image"]')).toBeVisible();
});

test('image option: a wider image keeps its shape and the signature wraps tightly around it (no white bars)', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/');
  await page.locator('#imageField input[type=file]').setInputFiles(fx('image-wide.png')); // 400 × 200
  await expect(page.locator('#imageField .status')).toBeVisible();
  const img = page.locator('#previewInner img[width="128"]');
  await expect(img).toHaveAttribute('height', '64'); // 128 wide, half as tall: not forced into a 128 × 128 box
  const box = (await img.boundingBox())!;
  expect([box.width, box.height]).toEqual([128, 64]);
  // the image itself is 256 × 128 (2× for sharp screens) and entirely the picture: orange from edge to edge
  const px = await pixels(img, [[128, 64], [128, 2], [128, 125], [2, 64], [253, 64]]);
  expect(px.size).toEqual([256, 128]);
  for (const p of px.at) expect(p.slice(0, 3)).toEqual([255, 120, 0]);
});

test('image option: an image shorter than 128 px tall is shown at its own height, and the right-hand cell hugs it', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/');
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.locator('#imageField input[type=file]').setInputFiles(fx('image-short.png')); // 300 × 90
  await expect(page.locator('#imageField .error')).toBeHidden(); // no more "too small" for a short image
  await expect(page.locator('#imageField .status')).toBeVisible();
  const img = page.locator('#previewInner img[width="128"]');
  await expect(img).toHaveAttribute('height', '38');
  const box = (await img.boundingBox())!;
  expect([box.width, box.height]).toEqual([128, 38]); // exactly the picture: no 128 × 128 box with blank space under it
  // it stays on the right and level with the top, however short it is
  const where = await img.evaluate((i) => {
    const t = (document.querySelector('#previewInner > table') as HTMLElement).getBoundingClientRect(), r = i.getBoundingClientRect();
    return { fromRight: Math.round(t.right - r.right), fromTop: Math.round(r.top - t.top) };
  });
  expect(where).toEqual({ fromRight: 0, fromTop: 0 }); // flush top-right
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  const html = await clipboardHtml(page);
  expect(html).toContain(`<img src="${HOSTED}" width="128" height="38"`);
  expect(html).toMatch(/width:\s?128px;\s?height:\s?38px;/); // Chrome may reformat the copied styles (adds spaces)
});

test('image option: a GIF is accepted, kept animated, and uploaded exactly as it was', async ({ page }) => {
  await fakeCloudinary(page);
  // Playwright can't see the file part of an upload, so read it inside the page as it's sent.
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    (window as any).__sent = [];
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('cloudinary') && init?.body instanceof FormData) {
        const f = init.body.get('file') as File;
        const bytes = new Uint8Array(await f.arrayBuffer());
        (window as any).__sent.push({ name: f.name, type: f.type, b64: btoa(String.fromCharCode(...bytes)) });
      }
      return real(input, init);
    };
  });
  await page.goto('/');
  await page.locator('#imageField input[type=file]').setInputFiles(fx('anim-square.gif'));
  await expect(page.locator('#imageField .status')).toBeVisible();
  const sent = await page.evaluate(() => (window as any).__sent as { name: string; type: string; b64: string }[]);
  expect(sent).toHaveLength(1);
  expect([sent[0].name, sent[0].type]).toEqual(['image.gif', 'image/gif']);
  const original = (await import('node:fs')).readFileSync(fx('anim-square.gif'));
  expect(Buffer.from(sent[0].b64, 'base64').equals(original)).toBe(true); // byte-for-byte, so all 3 frames are still there
  // the preview shows the GIF itself, not a still redraw of it
  const img = page.locator('#previewInner img[width="128"]');
  await expect(img).toHaveAttribute('src', /^data:image\/gif/);
  await expect(img).toHaveAttribute('height', '128');
  await expect(page.locator('#imageField .file-name')).toHaveText('anim-square.gif');
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  expect(await clipboardHtml(page)).toContain(`<img src="${HOSTED}" width="128" height="128"`);
});

// Playwright can't see the file part of an upload, so read it inside the page as it's sent.
async function captureUploads(page: Page) {
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    (window as any).__sent = [];
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('cloudinary') && init?.body instanceof FormData) {
        const f = init.body.get('file') as File;
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        (window as any).__sent.push({ name: f.name, type: f.type, b64: btoa(bin) });
      }
      return real(input, init);
    };
  });
}
const sentFiles = (page: Page) => page.evaluate(() => (window as any).__sent as { name: string; type: string; b64: string }[]);
async function gifInfo(buf: Buffer) {
  const mod: any = await import('gifuct-js');
  const { parseGIF, decompressFrames } = mod.parseGIF ? mod : mod.default;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const g = parseGIF(ab);
  const frames = decompressFrames(g, false);
  return { width: g.lsd.width, height: g.lsd.height, delays: frames.map((f) => f.delay), frames: frames.length };
}
/** A noisy animated GIF (random pixels), which doesn't compress: big on disk even at modest sizes. */
async function noisyGif(w: number, h: number, frames: number) {
  const mod: any = await import('gifenc');
  const { GIFEncoder } = mod.GIFEncoder ? mod : mod.default;
  const enc = GIFEncoder();
  // 256 spread-out colours; each pixel picks one at random
  const palette = Array.from({ length: 256 }, (_, i) => [(i * 37) & 255, (i * 91) & 255, (i * 53) & 255]);
  let seed = 7;
  for (let f = 0; f < frames; f++) {
    const index = new Uint8Array(w * h);
    for (let i = 0; i < index.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; index[i] = seed >>> 24; }
    enc.writeFrame(index, w, h, { palette, delay: 100 });
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}

test('image option: a GIF that isn’t square is shrunk proportionately to fit 128 × 128, and stays animated', async ({ page }) => {
  await fakeCloudinary(page);
  await captureUploads(page);
  await page.goto('/');
  const fs = await import('node:fs');

  // 600 × 100 (6 : 1) was refused before; now it's shrunk to 256 × 43 (shown at 128 × 21) with all its frames and timings
  const banner = fs.readFileSync(fx('anim-banner.gif'));
  const before = await gifInfo(banner);
  expect([before.width, before.height]).toEqual([600, 100]);
  await page.locator('#imageField input[type=file]').setInputFiles(fx('anim-banner.gif'));
  await expect(page.locator('#imageField .status')).toBeVisible();
  await expect(page.locator('#imageField .error')).toHaveText('');
  let sent = await sentFiles(page);
  expect(sent).toHaveLength(1);
  const after = await gifInfo(Buffer.from(sent[0].b64, 'base64'));
  expect([sent[0].name, sent[0].type]).toEqual(['image.gif', 'image/gif']);
  expect([after.width, after.height]).toEqual([256, 43]);
  expect(after.frames).toBe(before.frames);
  expect(after.frames).toBeGreaterThan(1);
  expect(after.delays).toEqual(before.delays.map((d) => d || 100));
  let img = page.locator('#previewInner img[width="128"]');
  await expect(img).toHaveAttribute('height', '21');
  await expect(img).toHaveAttribute('src', /^data:image\/gif/);

  // the signature wraps tightly around the short image: the image box really is 128 × 21, not 128 × 128
  const box = (await img.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([128, 21]);

  // a 300 × 150 GIF: shrunk to 256 × 128, shown at 128 × 64
  await page.locator('#imageField input[type=file]').setInputFiles(fx('anim-wide.gif'));
  await expect(img).toHaveAttribute('height', '64');
  await expect.poll(async () => (await sentFiles(page)).length).toBe(2);
  sent = await sentFiles(page);
  const wide = await gifInfo(Buffer.from(sent[1].b64, 'base64'));
  expect([wide.width, wide.height]).toEqual([256, 128]);

  // a tall one: 100 × 600 would be 21 × 128 (made by turning the banner's shape around)
  const tall = await noisyGif(120, 600, 2);
  await page.locator('#imageField input[type=file]').setInputFiles({ name: 'tall.gif', mimeType: 'image/gif', buffer: tall });
  await expect(page.locator('#imageField .file-name')).toHaveText('tall.gif');
  await expect(page.locator('#previewInner img[height="128"]')).toHaveAttribute('width', '26');
  await expect.poll(async () => (await sentFiles(page)).length).toBe(3);
  sent = await sentFiles(page);
  const t = await gifInfo(Buffer.from(sent[2].b64, 'base64'));
  expect([t.width, t.height, t.frames]).toEqual([51, 256, 2]);

  // copied into the email at its shown size
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  expect(await clipboardHtml(page)).toContain(`<img src="${HOSTED}" width="26" height="128"`);
});

test('image option: a big GIF is shrunk to a light file; one that’s still too heavy is explained; extreme shapes are refused', async ({ page }) => {
  test.setTimeout(90000);
  const uploads = await fakeCloudinary(page);
  await captureUploads(page);
  await page.goto('/');
  const input = page.locator('#imageField input[type=file]');

  // 800 × 500, over 2 MB: used to be refused as too heavy, now shrunk to 256 × 160 and well under 1 MB
  const big = await noisyGif(800, 500, 6);
  expect(big.length).toBeGreaterThan(1024 * 1024);
  await input.setInputFiles({ name: 'big.gif', mimeType: 'image/gif', buffer: big });
  await expect(page.locator('#imageField .status')).toBeVisible({ timeout: 30000 });
  const sent = await sentFiles(page);
  expect(sent).toHaveLength(1);
  const bytes = Buffer.from(sent[0].b64, 'base64');
  expect(bytes.length).toBeLessThan(1024 * 1024);
  const info = await gifInfo(bytes);
  expect([info.width, info.height, info.frames]).toEqual([256, 160, 6]);
  await expect(page.locator('#previewInner img[width="128"]')).toHaveAttribute('height', '80');

  // 120 frames that are already 128 × 128, so there is nothing to shrink and it is still over 1 MB: explained, nothing uploaded
  const heavy = await noisyGif(128, 128, 120);
  await input.setInputFiles({ name: 'heavy.gif', mimeType: 'image/gif', buffer: heavy });
  await expect(page.locator('#imageField .error')).toContainText('Even shrunk to fit', { timeout: 60000 });
  expect(uploads).toHaveLength(1);

  // an extreme shape is still turned away
  const sliver = await noisyGif(2000, 150, 1);
  await input.setInputFiles({ name: 'sliver.gif', mimeType: 'image/gif', buffer: sliver });
  await expect(page.locator('#imageField .error')).toContainText('very wide');
  expect(uploads).toHaveLength(1);

  expect(uploads).toHaveLength(1);
});

test('image option: a still image smaller than 128 px is still refused as blurry', async ({ page }) => {
  const uploads = await fakeCloudinary(page);
  await page.goto('/');
  await page.locator('#imageField input[type=file]').setInputFiles(fx('image-small.png')); // 100 × 100
  await expect(page.locator('#imageField .error')).toContainText('blurry');
  expect(uploads).toHaveLength(0);
});

test('image option: sits flush top-right, on desktop and on phones', async ({ page }) => {
  await fakeCloudinary(page);
  const gap = () => page.evaluate(() => {
    const table = document.querySelector('#previewInner > table') as HTMLElement;
    const img = [...document.querySelectorAll<HTMLImageElement>('#previewInner img')].find((i) => !i.closest('a'))!;
    const t = table.getBoundingClientRect(), r = img.getBoundingClientRect();
    return { fromRight: Math.round(t.right - r.right), fromTop: Math.round(r.top - t.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.fill('#f-name', 'Anastasiia Cherevychna');
    await page.fill('#f-title', 'Designer');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
        await page.locator('#imageField input[type=file]').setInputFiles(fx('image-square.png'));
    await expect(page.locator('#imageField .status')).toBeVisible();
    await expect(page.locator('#previewInner img[width="128"]')).toHaveCount(1);
    const image = await gap();
    expect(image.fromRight, `right edge at ${width} px`).toBe(0);
    expect(image.fromTop, `top edge at ${width} px`).toBe(0);
    expect([image.w, image.h]).toEqual([128, 128]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);
  }
});

const titleLine = (page: Page) => page.locator('#previewInner div', { hasText: /^Job title$/ }).last();
const style = (loc: ReturnType<Page['locator']>) =>
  loc.evaluate((el) => { const c = getComputedStyle(el); return { family: c.fontFamily, size: c.fontSize, line: c.lineHeight, colour: c.color, weight: c.fontWeight, decoration: c.textDecorationLine }; });

test('one Email field in Contact & Social links, always written out in full under the job title', async ({ page }) => {
  await page.goto('/');
  // only one email field, in the Contact group, and no icon switch
  await expect(page.locator('input[type="email"]')).toHaveCount(1);
  await expect(page.locator('[data-fields="contact"] #f-email')).toHaveCount(1);
  await expect(page.locator('#emailAsIcon, [data-field="email"] .toggle')).toHaveCount(0);
  await expect(page.getByText(/as icon/i)).toHaveCount(0);
  await expect(page.locator('[data-field="email"] label[for="f-email"]')).toHaveText('Email (optional)');

  await page.fill('#f-email', ' jane.smith@company.com ');
  // no envelope icon; written under the job title in exactly the job title's style
  await expect(page.locator('#previewInner img[src*="icons/email"]')).toHaveCount(0);
  const link = page.locator('#previewInner a[href="mailto:jane.smith@company.com"]');
  await expect(link).toHaveText('jane.smith@company.com');
  const t = await style(titleLine(page));
  const e = await style(link);
  expect(e).toEqual({ ...t, decoration: 'none' });
  expect(t.size).toBe('18px');
  const tb = (await titleLine(page).boundingBox())!;
  const eb = (await link.locator('..').boundingBox())!;
  expect(Math.abs(eb.y - (tb.y + tb.height))).toBeLessThanOrEqual(1);
  expect(eb.height).toBe(tb.height);

  // empty email: nothing at all
  await page.fill('#f-email', '');
  await expect(page.locator('#previewInner a[href^="mailto:"]')).toHaveCount(0);
});

test('email field: refuses anything that isn’t a proper address, and says why', async ({ page }) => {
  const uploads = await fakeCloudinary(page);
  await page.goto('/');
  await page.fill('#f-name', 'Jane');
  await page.fill('#f-title', 'CTO');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  const err = page.locator('[data-field="email"] .field-error');

  // empty is fine: copying works
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');

  // no @
  await page.fill('#f-email', 'jane.smith');
  await page.locator('#f-email').blur();
  await expect(err).toContainText('needs an @');
  await expect(page.locator('[data-field="email"]')).toHaveClass(/invalid/);
  await expect(page.locator('#previewInner a[href^="mailto:"]')).toHaveCount(0); // not shown in the signature
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Check this field first: email');
  await expect(page.locator('#f-email')).toBeFocused();

  // has an @, but incomplete
  for (const bad of ['jane@', '@company.com', 'jane@company', 'jane@@company.com', 'jane smith@company.com']) {
    await page.fill('#f-email', bad);
    await expect(err, bad).toContainText('looks incomplete');
    await expect(page.locator('#previewInner a[href^="mailto:"]'), bad).toHaveCount(0);
  }

  // fixed: error clears and it goes into the copied signature as a text line under the job title
  await page.fill('#f-email', 'jane@company.com');
  await expect(err).toHaveText('');
  await page.click('#copyBtn');
  await expect(page.locator('#actionMsg')).toContainText('Copied');
  const html = await clipboardHtml(page);
  expect(html).toMatch(/>CTO<\/div><div [^>]*><a [^>]*href="mailto:jane@company\.com"[^>]*>jane@company\.com<\/a><\/div>/);
  expect(html).not.toContain('icons/email');
  expect(uploads).toHaveLength(0);
});

test('icons turn solid white in the dark preview', async ({ page }) => {
  await page.goto('/');
  await page.fill('#f-phone', '+351 912 345 678');
  await expect(page.locator('#previewInner .hs-ic-l[src$="icons/v2/phone.png"]')).toBeVisible();
  await expect(page.locator('#previewInner a[title] .hs-ic-d')).toHaveCount(2); // phone + default website (contact row only)
  await expect(page.locator('#previewInner .hs-ic-d').first()).toBeHidden();
  await page.click('[data-theme-btn="dark"]');
  await expect(page.locator('#previewInner .hs-ic-d[src$="icons/v2/phone-white.png"]')).toBeVisible();
  await expect(page.locator('#previewInner .hs-ic-l').first()).toBeHidden();
});

test('contact icons appear as fields are filled in, and each links to the right place', async ({ page }) => {
  await page.goto('/');
  const icon = (k: string) => page.locator(`#previewInner a:has(img.hs-ic-l[src$="icons/v2/${k}.png"])`);
  await page.fill('#f-website', '');
  await expect(page.locator('#previewInner a[title] img.hs-ic-l')).toHaveCount(0);
  await page.fill('#f-email', 'jane@company.com');
  await expect(page.locator('#previewInner a[title] img.hs-ic-l')).toHaveCount(0); // the email is written out, not an icon
  await page.fill('#f-website', 'company.com');
  await expect(page.locator('#previewInner a[title] img.hs-ic-l')).toHaveCount(1);
  await page.fill('#f-phone', '+351 912 345 678');
  await page.fill('#f-linkedin', 'linkedin.com/in/jane');
  await expect(icon('website')).toHaveAttribute('href', 'https://company.com/');
  await expect(icon('phone')).toHaveAttribute('href', 'tel:+351912345678');
  await expect(icon('linkedin')).toHaveAttribute('href', 'https://linkedin.com/in/jane');
  // one horizontal row, 28 px icons
  const boxes = await Promise.all(['website', 'phone', 'linkedin'].map((k) => icon(k).locator('img.hs-ic-l').boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(1);
  for (const b of boxes) expect(b!.width).toBe(28);
  await page.locator('#preview').screenshot({ path: 'test-results/icons-row.png' });
});

test('the preview stays on screen while the form scrolls', async ({ page }) => {
  await page.goto('/');
  await page.locator('#f-quoteAuthor').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = await page.locator('#preview').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(200);
  await page.screenshot({ path: 'test-results/sticky.png' });
});

test('unknown client links say so', async ({ page }) => {
  await page.goto('/?client=nobody');
  await expect(page.locator('#banner')).toContainText('isn’t set up');
  await expect(page.locator('#app')).toBeHidden();
});

test('dark preview and install tabs', async ({ page }) => {
  await page.goto('/');
  await page.fill('#f-email', 'jane@company.com');
  await page.fill('#f-linkedin', 'linkedin.com/in/jane');
  await page.click('[data-theme-btn="dark"]');
  await page.locator('#preview').screenshot({ path: 'test-results/dark-icons.png' });
  await expect(page.locator('#preview')).toHaveAttribute('data-theme', 'dark');
  await page.click('#install summary');
  await page.click('[data-tab="apple"]');
  await expect(page.locator('[data-panel="apple"]')).toBeVisible();
  await expect(page.locator('[data-panel="gmail"]')).toBeHidden();
});

test('mobile layout has no sideways scrolling', async ({ page }) => {
  for (const width of [390, 360]) { // iPhone; common Android width
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('screenshots for design review', async ({ page }) => {
  await fakeCloudinary(page);
  await page.goto('/');
  await page.fill('#f-name', 'Anastasiia Cherevychna');
  await page.fill('#f-title', 'Designer');
  await page.fill('#f-ctaLink', 'calendly.com/jane');
  await page.screenshot({ path: 'test-results/empty-image.png', clip: { x: 600, y: 170, width: 740, height: 480 } });
  await addImage(page, 'image-square.png');
  await page.fill('#f-quoteText', 'Some deep and smart optional quote here');
  await page.fill('#f-quoteAuthor', 'Someone’s name');
  await page.screenshot({ path: 'test-results/design-match.png', clip: { x: 600, y: 170, width: 740, height: 520 } });
  await page.click('[data-theme-btn="dark"]');
  await page.screenshot({ path: 'test-results/dark.png', clip: { x: 600, y: 170, width: 740, height: 520 } });
});

test('the CTA button is always there, styled like the Figma button, with "Book a demo" to start', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-field="ctaColour"], .swatch')).toHaveCount(0);
  await expect(page.locator('#f-ctaText')).toHaveValue('Book a demo');
  await expect(page.locator('label[for="f-ctaText"] .req')).toHaveCount(1); // required
  await expect(page.locator('label[for="f-ctaLink"] .req')).toHaveCount(1);
  const btn = page.locator('#previewInner td[bgcolor="#262626"]');
  await expect(btn).toBeVisible(); // there before anything is filled in
  await expect(btn).toHaveText('Book a demo');
  const box = (await btn.boundingBox())!;
  expect(box.height).toBe(44); // 13 px + 18 px label + 13 px
  // 14 px between the button and what's above it (icons, job title or email line)
  const gapAbove = () => btn.evaluate((td) => { const t = td.closest('table')!; const p = t.previousElementSibling as HTMLElement; const last = [...p.querySelectorAll('img.hs-ic-l')].pop() ?? p; return Math.round(t.getBoundingClientRect().top - last.getBoundingClientRect().bottom); });
  await expect.poll(gapAbove).toBe(14);
  await page.fill('#f-website', '');
  await expect(page.locator('#previewInner a[title] img.hs-ic-l')).toHaveCount(0); // preview redrawn without contact icons
  await expect.poll(gapAbove).toBe(14);
  await page.fill('#f-website', 'heights.digital');
  // label is the same size as the job title
  const size = (el: ReturnType<Page['locator']>) => el.evaluate((e) => getComputedStyle(e).fontSize);
  await expect(page.locator('#previewInner a[title] img.hs-ic-l')).toHaveCount(1); // preview redrawn with the website icon again
  await expect.poll(async () => [await size(btn.locator('span, a').first()), await size(page.locator('#previewInner div', { hasText: /^Job title$/ }).last())]).toEqual(['18px', '18px']);
  const chip = (await btn.locator('img.hs-ic-l').boundingBox())!;
  expect([chip.width, chip.height, Math.round(chip.y - box.y), Math.round(box.x + box.width - chip.x - chip.width)]).toEqual([22, 22, 11, 7]); // chip centred top to bottom, 7 px from the right
  await page.fill('#f-ctaText', 'Talk to us');
  await expect(btn).toHaveText('Talk to us');
  await page.fill('#f-ctaText', '');
  await expect(btn).toHaveText('Book a demo'); // still shown while the field is empty
  await page.locator('#preview').screenshot({ path: 'test-results/cta.png' });
  // stays dark in the dark preview too. The dark preview inverts the signature; the button (and its chip) is
  // inverted back, so an even number of inverting filters above it means it shows its real colours.
  const inversions = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((start) => { let n = 0; for (let el: Element | null = start; el; el = el.parentElement) if (getComputedStyle(el).filter !== 'none') n++; return n % 2; });
  expect(await inversions(btn)).toBe(0);
  await page.click('[data-theme-btn="dark"]');
  expect(await inversions(btn)).toBe(0);
  expect(await inversions(btn.locator('img.hs-ic-d'))).toBe(0);
  expect(await inversions(page.locator('#previewInner div', { hasText: /^Full Name$/ }).last())).toBe(1); // the rest is still inverted
  // ...and shows the Figma dark button: light background, dark label, light chip
  expect(await btn.evaluate((td) => getComputedStyle(td).backgroundColor)).toBe('rgb(250, 248, 247)');
  expect(await btn.locator('.hs-cta-t').evaluate((t) => getComputedStyle(t).color)).toBe('rgb(38, 38, 38)');
  await expect(btn.locator('img.hs-ic-d[src$="icons/cta-arrow-dark.png"]')).toBeVisible();
  await expect(btn.locator('img.hs-ic-l')).toBeHidden();
  // job title (and email line) are #FDFDFC in the dark preview, #8D8D8B in light
  const title = page.locator('#previewInner div', { hasText: /^Job title$/ }).last();
  expect(await title.evaluate((t) => getComputedStyle(t).color)).toBe('rgb(253, 253, 252)');
  expect(await inversions(title)).toBe(0);
  await page.click('[data-theme-btn="light"]');
  expect(await title.evaluate((t) => getComputedStyle(t).color)).toBe('rgb(141, 141, 139)');
  await page.locator('#preview').screenshot({ path: 'test-results/cta-dark.png' });
});

test('serves the new icons, and still serves every original icon that earlier signatures point at', async ({ request }) => {
  const files = ['website', 'phone', 'linkedin'].flatMap((k) => [`/icons/v2/${k}.png`, `/icons/v2/${k}-white.png`, `/icons/${k}.png`, `/icons/${k}-white.png`]);
  for (const f of [...files, '/icons/email.png', '/icons/email-white.png', '/icons/cta-arrow.png', '/icons/cta-arrow-dark.png']) {
    const r = await request.get(f);
    expect(r.status(), f).toBe(200);
    expect(r.headers()['content-type'], f).toContain('image/png');
  }
});
