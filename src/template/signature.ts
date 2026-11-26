/**
 * The email signature itself.
 *
 * This is the fragile part of the product: it has to survive Gmail, Outlook (web, new and classic desktop),
 * Apple Mail and phones. Rules it follows, and that any change must keep:
 *   - tables for layout, every style inline, no classes except the dark-mode icon swap below
 *     (one tiny <style> block; apps that strip it, like Gmail, simply keep the outlined icons)
 *   - web-safe fonts only (Arial / Helvetica)
 *   - images are hosted https PNG/JPG with explicit width + height, never SVG or data: URLs
 *   - no opacity or rgba (colours are pre-blended onto white)
 *   - stays well under Gmail's 10,000-character signature limit
 *
 * The builder preview renders this exact HTML, so what people see is what they copy.
 */
import { displayUrl, escapeHtml as esc } from './format';

export interface SignatureData {
  name: string;
  title: string;
  /**
   * Optional image on the right: shown at up to 128 × 128, keeping its proportions (`width` and `height`
   * are the size shown; at least one is 128). `src` is a hosted https PNG, JPG or GIF.
   */
  image?: { src: string; width: number; height: number; alt: string };
  website?: string; // full href
  /** The address shown as a line of text under the job title, in the same style as the job title. */
  emailLine?: string;
  phone?: { display: string; href: string };
  linkedin?: string; // full href
  /**
   * The CTA button (Figma: CarbonChain button, primary). `href` can be empty in the preview only, before the link is
   * filled in. `arrow` is the hosted 2× PNG of the grey arrow chip; without it the button is just the label.
   */
  cta?: { text: string; href: string; arrow?: string };
  quote?: { text: string; author?: string };
  /**
   * Hosted https PNG icons (56 × 56, shown at 28). `light` is charcoal with a white outline, so it stays
   * visible everywhere; `dark` is solid white and is swapped in by apps that support dark-mode code.
   * Without icons the row falls back to text links.
   */
  icons?: Partial<Record<IconKey, { light: string; dark?: string }>>;
  /** Preview only: a grey "IMAGE" box where an uploaded image would go. Never copied. */
  imagePlaceholder?: boolean;
}

export type IconKey = 'website' | 'phone' | 'linkedin';
const ICON = 28;
const ICON_GAP = 10;

// Figma colours, pre-blended onto white where the design uses opacity.
export const COLOURS = {
  name: '#34333D', // Black #01000C at 80%
  title: '#332D28', // Charcoal
  meta: '#5C5753', // Charcoal at 80%
  separator: '#CCCAC9', // Light Grey
  link: '#332D28',
};

const FONT = 'font-family:Arial,Helvetica,sans-serif;';
export const IMAGE = 128;
const TABLE = 'cellpadding="0" cellspacing="0" border="0" role="presentation"';

/**
 * Website, phone and LinkedIn as a row of icons. Each icon is a link (the site, tel:, the profile),
 * and only filled-in fields get one. (The email address is written out under the job title instead.) If icons aren't available, the same row
 * is shown as text links instead. Alt and title text carry the address, so it's still readable
 * when an email app blocks images.
 */
function contactRow(d: SignatureData): string {
  const icons = d.icons ?? {};
  const items: { key: IconKey; href: string; label: string }[] = [];
  if (d.website) items.push({ key: 'website', href: d.website, label: displayUrl(d.website) });
  if (d.phone) items.push({ key: 'phone', href: d.phone.href, label: d.phone.display });
  if (d.linkedin) items.push({ key: 'linkedin', href: d.linkedin, label: 'LinkedIn' });
  if (!items.length) return '';
  const cells = items.map((it, i) => {
    const pad = i < items.length - 1 ? `padding:0 ${ICON_GAP}px 0 0;` : 'padding:0;';
    const icon = icons[it.key];
    const img = (src: string, cls: string, extra: string, alt: string) =>
      `<img class="${cls}" src="${esc(src)}" width="${ICON}" height="${ICON}" alt="${esc(alt)}" ` +
      `style="width:${ICON}px;height:${ICON}px;border:0;outline:none;${extra}">`;
    const inner = icon
      ? img(icon.light, 'hs-ic-l', 'display:block;', it.label) +
        // Hidden unless the email app is in dark mode and understands the <style> below.
        (icon.dark ? img(icon.dark, 'hs-ic-d', 'display:none;max-height:0;overflow:hidden;mso-hide:all;', '') : '')
      : `<span style="${FONT}font-size:14px;line-height:20px;color:${COLOURS.link};white-space:nowrap;">${esc(it.label)}</span>`;
    return `<td valign="middle" style="${pad}"><a href="${esc(it.href)}" title="${esc(it.label)}" style="text-decoration:none;">${inner}</a></td>`;
  });
  return `<table ${TABLE} style="border-collapse:collapse;margin-top:10px;"><tr>${cells.join('')}</tr></table>`;
}

// CTA button, from the Figma component: 44 px tall (13 px above and below the label), #262626 with 6 px corners, #FDFDFC label (Arial 18 px, the job title's size)
// (16 px in from the left), then a 22 × 22 arrow chip 10 px after it and 7 px from the right edge.
export const CTA = { bg: '#262626', text: '#FDFDFC', radius: 6, chip: 22 };

function ctaButton(cta: SignatureData['cta']): string {
  if (!cta) return '';
  const link = (inner: string, style: string) =>
    cta.href ? `<a href="${esc(cta.href)}" style="${style}">${inner}</a>` : `<span style="${style}">${inner}</span>`;
  // The coloured cell works in Outlook desktop; each part is its own link (a link around a table breaks in Outlook).
  const label =
    `<td valign="middle" style="padding:13px ${cta.arrow ? 10 : 16}px 13px 16px;">` +
    link(esc(cta.text), `display:block;${FONT}font-size:18px;line-height:18px;letter-spacing:0.07px;color:${CTA.text};text-decoration:none;white-space:nowrap;`) +
    `</td>`;
  const chip = cta.arrow
    ? `<td valign="middle" style="padding:9px 7px 9px 0;">` +
      link(`<img src="${esc(cta.arrow)}" width="${CTA.chip}" height="${CTA.chip}" alt="" style="display:block;width:${CTA.chip}px;height:${CTA.chip}px;border:0;outline:none;">`, 'display:block;text-decoration:none;') +
      `</td>`
    : '';
  return (
    `<table ${TABLE} style="border-collapse:separate;margin-top:14px;"><tr>` + // 14 px below the name, title, email and icons
    `<td bgcolor="${CTA.bg}" style="background-color:${CTA.bg};border-radius:${CTA.radius}px;padding:0;">` +
    `<table ${TABLE} style="border-collapse:collapse;"><tr>${label}${chip}</tr></table>` +
    `</td></tr></table>`
  );
}

/** Swaps to the solid white icons in dark mode (Apple Mail, iPhone Mail, Outlook.com and the Outlook apps). */
const DARK_STYLE =
  '<style>@media (prefers-color-scheme:dark){.hs-ic-l{display:none!important}.hs-ic-d{display:block!important;max-height:none!important}}' +
  '[data-ogsc] .hs-ic-l{display:none!important}[data-ogsc] .hs-ic-d{display:block!important;max-height:none!important}</style>';

export function buildSignatureHtml(d: SignatureData): string {
  const name = esc(d.name);
  const image = d.image
    ? `<td valign="top" align="right" style="padding:0 0 0 24px;">` +
      `<img src="${esc(d.image.src)}" width="${d.image.width}" height="${d.image.height}" alt="${esc(d.image.alt)}" ` +
      `style="display:block;width:${d.image.width}px;height:${d.image.height}px;border:0;outline:none;"></td>`
    : d.imagePlaceholder
      ? `<td valign="top" align="right" style="padding:0 0 0 24px;">` +
        `<div data-placeholder="image" style="width:${IMAGE}px;height:${IMAGE}px;background:#E1E1E1;color:#A3A3A3;${FONT}font-size:22px;` +
        `font-weight:bold;line-height:${IMAGE}px;text-align:center;letter-spacing:1px;">IMAGE</div></td>`
      : '';

  const details =
    `<td valign="top" style="padding:0;${FONT}">` +
    `<div style="${FONT}font-size:24px;line-height:35px;color:${COLOURS.name};">${name}</div>` +
    (d.title ? `<div style="${FONT}font-size:18px;line-height:26px;color:${COLOURS.title};">${esc(d.title)}</div>` : '') +
    // Same style as the job title. It's a link so email apps don't turn it blue and underlined on their own.
    (d.emailLine
      ? `<div style="${FONT}font-size:18px;line-height:26px;color:${COLOURS.title};">` +
        `<a href="mailto:${esc(d.emailLine)}" style="${FONT}font-size:18px;line-height:26px;color:${COLOURS.title};text-decoration:none;">${esc(d.emailLine)}</a></div>`
      : '') +
    contactRow(d) +
    ctaButton(d.cta) +
    `</td>`;

  const top = `<table ${TABLE} width="100%" style="border-collapse:collapse;"><tr>${details}${image}</tr></table>`;

  const quote = d.quote?.text
    ? `<tr><td style="padding:20px 0 0 0;"><table ${TABLE} width="100%" style="border-collapse:collapse;"><tr>` +
      `<td height="1" style="border-top:1px solid ${COLOURS.separator};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
      `<tr><td style="padding:20px 0 0 0;${FONT}">` +
      `<div style="${FONT}font-size:20px;line-height:29px;color:${COLOURS.name};">“${esc(d.quote.text.replace(/^["“‘']+|["”’']+$/g, ''))}”</div>` +
      (d.quote.author
        ? `<div style="${FONT}font-size:18px;line-height:26px;color:${COLOURS.meta};">–${esc(d.quote.author.replace(/^[-–—\s]+/, ''))}</div>`
        : '') +
      `</td></tr>`
    : '';

  const usesDarkIcons = Object.values(d.icons ?? {}).some((i) => i?.dark) && /hs-ic-d/.test(top);
  return (
    (usesDarkIcons ? DARK_STYLE : '') +
    `<table ${TABLE} width="100%" style="border-collapse:collapse;width:100%;max-width:652px;${FONT}">` +
    `<tr><td style="padding:0;">${top}</td></tr>${quote}</table>`
  );
}

/** Plain-text fallback for apps that don't take HTML. */
export function buildSignatureText(d: SignatureData): string {
  const lines = [d.name, d.title];
  if (d.emailLine) lines.push(d.emailLine);
  const contact = [d.website && displayUrl(d.website), d.phone?.display, d.linkedin].filter(Boolean);
  if (contact.length) lines.push(contact.join(' | '));
  if (d.cta?.href) lines.push(`${d.cta.text}: ${d.cta.href}`);
  if (d.quote?.text) lines.push('', `“${d.quote.text}”${d.quote.author ? ` –${d.quote.author}` : ''}`);
  return lines.filter((l) => l !== undefined).join('\n');
}

/** A complete .html file, for Outlook desktop and Apple Mail. */
export function buildSignatureDocument(d: SignatureData): string {
  return (
    `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(d.name)} – email signature</title></head>` +
    `<body style="margin:0;padding:24px;background:#ffffff;">\n${buildSignatureHtml(d)}\n</body></html>\n`
  );
}
