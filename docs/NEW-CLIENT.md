# Setting this tool up for a new client

This repo is the CarbonChain version of the tool. For another client, clone it into a new repo with its own
hosting, then work through this list. Each step says which file to change. "Interface" means the tool's own page;
"signature" means the email signature people copy. They are styled separately, because email apps ignore the page's styles.

## 1. Before anything else
- [ ] **New repo and new hosting project.** Never point the new client at this repo or this site.
- [ ] **Choose the final web address before anyone copies a signature.** Signatures load their icons and CTA arrow
      from the address they were copied from (the tool works this out by itself, so there's no setting for it). Once people
      use their signatures, that address can never change and icon files can never be deleted. A client's own
      domain (e.g. `signatures.client.com`) is best.
- [ ] **Image hosting (Cloudinary).** `cloudName` and `uploadPreset` in each file in `clients/`. Use an account for
      that client (or a shared Heights account), not someone's personal one. The preset must allow GIFs.

## 2. Interface (the tool's page)
- [ ] **Design values:** `src/styles/tokens.css`. Every colour, font, text size, corner, border and spacing of the
      interface is there, including the font: the `@font-face` rules at its top load the font files in
      `src/assets/fonts/`. Swap those files (and their licence) for the new client's font.
- [ ] **Logos:** the client's logo top left (`src/assets/carbonchain-logo.svg`) and the HEIGHTS logo in the footer's
      "Built by" (`src/assets/heights-logo.svg`), both in `index.html`. They're images with their own colours: replace
      the client's file. Sizes are `--logo-h` and `--footer-logo-h` in `tokens.css`.
- [ ] **Interface icons:** `src/assets/icons/upload.svg` and `install.svg` (images with their own colours).
- [ ] **Header text:** `index.html` ("CarbonChain Email Signature Builder").
- [ ] **Browser tab title:** made from the client's `name` in its client file ("Email Signature Builder – <name>").
- [ ] **Messages that say "the Heights team":** `src/main.ts` (unknown link) and `src/upload/cloudinary.ts` (upload
      problems). Change them if someone else supports the client.
- [ ] **Screen-size breakpoints** (960, 720, 420 px) are in `src/styles/main.css`, not in `tokens.css`, because CSS
      doesn't allow variables there. Usually they can stay.

## 3. The signature
- [ ] **Colours, font and CTA button:** `src/template/signature.ts` (`COLOURS`, `FONT`, `CTA`). Read the rules at the
      top of that file first; it's the fragile part.
- [ ] **Dark-mode colours of the signature:** also in `src/template/signature.ts` (`titleDark` and `nameDark` in
      `COLOURS`, `darkBg` and `darkText` in `CTA`), and again at the bottom of `src/styles/main.css`, where the tool's
      Dark preview imitates them. Keep both in step.
- [ ] **Contact icons:** `public/icons/v2/` (`<name>.png` light, `<name>-white.png` dark; 56 × 56, shown at 28 × 28).
      Before the new address has any users you can replace these files directly. After that, use a new folder
      (`v3/`) and change `ICON_PATH` in `src/builder/data.ts`.
- [ ] **CTA arrow chip:** `public/icons/cta-arrow.png` and `cta-arrow-dark.png` (44 × 44, shown at 22 × 22). Same rule
      as the icons.
- [ ] **Default CTA text** ("Book a demo"): `CTA_TEXT` in `src/builder/fields.ts`, or per client in its client file
      (`defaults.ctaText`).

## 4. Client files
- [ ] **Client files:** `clients/`. Add the new client's file and remove the ones that don't belong (`heights`,
      `demo-locked`), keeping one example if useful. See the README, "Adding a client".
- [ ] **Default client** (what the bare address shows): `DEFAULT_CLIENT` in `src/config/load.ts`. It must match a file
      in `clients/`.

## 5. Tests and docs
- [ ] **Tests that check colours and text:** `tests/unit/` and `tests/e2e/flow.spec.ts` check the signature's colours,
      the CTA button and "Book a demo". Update them to the new design; don't delete them.
- [ ] Run `npm test` and `npm run check` (set `PW_CHROMIUM` if Playwright can't find a browser). Everything must pass.
- [ ] **Docs:** `README.md` and `docs/HANDOFF.md` (names, Figma links, hosting), and redo the inbox tests in
      `docs/inbox-checklist.md` with the new signature.
- [ ] `package.json` `name`, if you want it to match.
