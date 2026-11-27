/** Turns what's on the form into the data the signature template needs. Pure, so it's easy to test. */
import type { ClientConfig } from '../config/types';
import { isEmail, normaliseUrl, telHref } from '../template/format';
import type { IconKey, SignatureData } from '../template/signature';
import { CTA_TEXT, type TextKey } from './fields';

export interface ImageState {
  /** Local copy for the preview (data: URL). */
  preview: string;
  /** Public https URL once uploaded. */
  hosted?: string;
  width?: number;
  height?: number;
}

export interface FormState {
  values: Record<TextKey, string>;
  /** The optional image on the right of the signature, shown at up to 128 × 128. */
  image: ImageState | null;
}

export type Purpose = 'preview' | 'email';

/**
 * For 'preview', local images are fine. For 'email', only hosted https images are used,
 * because email apps can't show anything else.
 */
export function toSignatureData(s: FormState, client: ClientConfig, purpose: Purpose, resolve: (src: string) => string): SignatureData {
  const v = (k: TextKey) => s.values[k].trim();
  // The preview always uses the local copy (instant, works offline); email only ever gets the hosted link.
  const img = (i: ImageState | null) => (!i ? '' : purpose === 'preview' ? i.preview : i.hosted || '');

  const d: SignatureData = { name: v('name') || 'Full Name', title: v('title') || 'Job title' };

  // The image only appears once someone uploads one; until then the preview shows a grey placeholder.
  const image = img(s.image);
  if (image) d.image = { src: image, width: s.image?.width ?? 128, height: s.image?.height ?? 128, alt: client.name };
  else if (purpose === 'preview') d.imagePlaceholder = true;

  const website = normaliseUrl(v('website'));
  if (website) d.website = website;
  if (isEmail(v('email'))) d.emailLine = v('email'); // only a properly formed address ever appears, written out under the job title
  const tel = telHref(v('phone'));
  if (tel) d.phone = { display: v('phone'), href: tel };
  const li = normaliseUrl(v('linkedin'));
  if (li && /linkedin\.com\//i.test(li)) d.linkedin = li;

  const ctaHref = normaliseUrl(v('ctaLink'));
  // The CTA button is always there. Both fields are required, so copying waits until they're filled in;
  // until then the preview shows the default text and a button that doesn't go anywhere yet.
  const arrow = resolve(CTA_ARROW_PATH);
  const chips = purpose === 'preview' || isPublic(arrow) ? { arrow, arrowDark: resolve(CTA_ARROW_DARK_PATH) } : {};
  d.cta = { text: v('ctaText') || CTA_TEXT, href: ctaHref, ...chips };


  const icons: SignatureData['icons'] = {};
  for (const k of ICON_KEYS) {
    const light = resolve(ICON_PATH(k));
    if (purpose === 'preview' || isPublic(light)) icons[k] = { light }; // a tile looks right in light and dark mode, so no dark version
  }
  d.icons = icons;
  return d;
}

export const ICON_KEYS: IconKey[] = ['website', 'phone', 'linkedin'];
/** Icons live on this site at a fixed link, so they can be redesigned without anyone re-copying. */
/** The grey arrow chip on the CTA button (Figma's button, 2× PNG). On this site, like the icons. */
export const CTA_ARROW_PATH = '/icons/cta-arrow.png';
/** Its dark-mode version (Figma dark button: #D9DBDC chip, #262626 arrow). */
export const CTA_ARROW_DARK_PATH = '/icons/cta-arrow-dark.png';
/**
 * Contact icons on tiles (27 Nov 2026): v3 folder. A #444444 symbol (16 px, the CarbonChain Figma set) on a #EBEAE9
 * circle, 30 × 30 (round like the CarbonChain icon buttons). Email apps never recolour pictures, so a tile looks the same in light and dark mode
 * in every app, with or without dark-mode code; there's no dark version.
 * Never delete the older folders: signatures copied earlier point at them. v2 (26 Nov 2026): #444444 with a 1 px
 * white outline plus solid white `-white` versions for dark mode. /icons/: the originals.
 */
export const ICON_PATH = (k: IconKey) => `/icons/v3/${k}.png`;
const isPublic = (src: string) => /^https:\/\//.test(src);

export type Missing = 'image' | 'icons';

/** Images that won't make it into the email copy, so we can say so. */
export function missingFromEmail(s: FormState, resolve: (src: string) => string): Missing[] {
  const out: Missing[] = [];
  if (s.image && !s.image.hosted) out.push('image');
  // The CTA button's arrow chip is always used, and it lives on this site like the contact icons.
  if (!isPublic(resolve(CTA_ARROW_PATH))) out.push('icons');
  return out;
}
