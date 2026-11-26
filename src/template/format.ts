/** Small, pure helpers shared by the signature template and the form. */

export const escapeHtml = (v: string): string =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "company.com" → "https://company.com". Returns '' for anything that isn't a usable web link. */
export function normaliseUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (!u.hostname.includes('.')) return '';
    return u.href;
  } catch {
    return '';
  }
}

/** "https://www.company.com/" → "company.com" for display. */
export function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** "+351 912 345 678" → "tel:+351912345678" */
export function telHref(raw: string): string {
  const digits = raw.trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : '';
}
