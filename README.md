# Heights Email Signature Builder

A web tool that lets each client's team make a consistent email signature: fill in the form, optionally add an image, click **Copy signature**, paste into Gmail or Outlook.

- Live link per client: `signatures.heights.digital/<client>` (or `?client=<client>` anywhere)
- Images are stored in Cloudinary; everything else runs in the browser
- No database, no logins

## Everyday tasks

### Adding a client

1. Copy `clients/heights.json` to `clients/<client-id>.json` (lowercase, dashes, e.g. `acme-studio`).
2. Change `id` (must match the file name) and `name`.
3. Choose what to pre-fill in `defaults`, what to fix in `locked`, and anything extra in `required`.
4. There's no company logo setting: people can add an optional **Image** (JPG, PNG or GIF), shown at up to 128 × 128 on the right of the signature, keeping its proportions. The preview shows an IMAGE placeholder until they do.
5. Run `npm test`. It checks every client file and explains any mistake.
6. Commit. The client's link is `…/<client-id>`.

Field names you can use in `defaults`, `locked` and `required`:
`name, title, website, email, phone, linkedin, ctaText, ctaLink`.
Name, job title, CTA text and CTA link are always required (the CTA button is always in the signature; its text starts as "Book a demo").
Personal fields (`name`, `title`) can't be locked.

### Changing the icons

- Icons: the contact icons are in `public/icons/v2/` (`<name>.png` for light, `<name>-white.png` for dark mode; 56 × 56, shown at 28 × 28). Replacing a file there changes it in every signature copied since 26 Nov 2026. For a new style that shouldn't touch existing signatures, add a new folder (`v3/`) and point `ICON_PATH` in `src/builder/data.ts` at it. Never delete an old folder: signatures copied earlier still point at it (`public/icons/` holds the originals). The same goes for the CTA button's arrow chip, `public/icons/cta-arrow.png` (44 × 44, shown at 22 × 22). Signatures people already use pick up the new files automatically, because they point at that link.
- Anything else (colours, text, layout): people need to re-copy their signature. Tell the client.

### Releasing a change

1. `npm run check` (unit tests, build, browser tests). All must pass.
2. Check the inbox list in `docs/inbox-checklist.md` for any change to the signature itself (`src/template/`).
3. Push to `main`. The host deploys it.

### Setting the tool up for another client

Clone this repo into a new one and follow `docs/NEW-CLIENT.md`.

## Working on the code

```
npm install
npm run dev          # local site at http://localhost:5173  (try /demo-locked or ?client=demo-locked)
npm test             # unit tests (template, client files, form logic)
npm run test:e2e     # browser tests; the image service is simulated, nothing real is uploaded
npm run build        # production site in dist/
npm run build:preview  # one self-contained HTML file in dist-preview/, for quick review links
```

If Playwright can't find a browser, set `PW_CHROMIUM` to a Chromium executable.

### Where things are

| Folder | What it is |
| --- | --- |
| `clients/` | One settings file per client |
| `src/template/` | **The email signature HTML.** The fragile part; read the rules at the top of `signature.ts` before changing it |
| `src/builder/` | The form: field list (`fields.ts`), form → signature data (`data.ts`), upload boxes |
| `src/image/` | File checks with plain-language errors, resizing (and GIF resizing) |
| `src/upload/` | Image hosting (Cloudinary). The only file to change to switch provider or move to signed uploads |
| `src/config/` | Client file format and loading |
| `src/styles/tokens.css` | Every design value of the tool's page (colours, font, sizes, corners, spacing). Not the signature's |
| `tests/` | `unit/` (Vitest) and `e2e/` (Playwright) |

### Adding a form field

1. Add it to `FIELDS` in `src/builder/fields.ts` (label, placeholder, section, check).
2. Add its key to `FieldKey` in `src/config/types.ts`.
3. Map it in `toSignatureData` (`src/builder/data.ts`) and render it in `src/template/signature.ts`.
4. Add a test in `tests/unit/signature.test.ts`.

## Hosting

Any static host works. It needs:
- build command `npm test && npm run build`, output folder `dist` (so a change that breaks the unit tests never goes live)
- every unknown path (e.g. `/acme`) served by `index.html`. `netlify.toml` and `vercel.json` already do this.

## Before launch (not done yet)

- **Signed uploads.** Uploads currently use an *unsigned* Cloudinary preset, so anyone who finds the page could upload images to the account. Add a small server function that signs uploads, and lets **Remove** delete the image. Only `src/upload/cloudinary.ts` changes.
- **Cloudinary account** is on a personal login; move it to Heights before clients use it.
- **Privacy note and GDPR check** for uploaded images.
- **Real inbox tests**: `docs/inbox-checklist.md`.
