import { describe, expect, it } from 'vitest';
import { buildSignatureDocument, buildSignatureHtml, buildSignatureText, type SignatureData } from '../../src/template/signature';
import { displayUrl, isEmail, normaliseUrl, telHref } from '../../src/template/format';

const full: SignatureData = {
  name: 'Anastasiia Cherevychna',
  title: 'Designer',
  image: { src: 'https://res.cloudinary.com/x/image/upload/v1/i.png', width: 128, height: 128, alt: 'Heights Digital' },
  website: 'https://heights.digital/',
  emailLine: 'name@heights.digital',
  phone: { display: '+351 912 345 678', href: 'tel:+351912345678' },
  linkedin: 'https://linkedin.com/in/someone',
  cta: { text: 'Book a call', href: 'https://calendly.com/x', arrow: 'https://signatures.heights.digital/icons/cta-arrow.png', arrowDark: 'https://signatures.heights.digital/icons/cta-arrow-dark.png' },
  icons: {
    website: { light: 'https://signatures.heights.digital/icons/v2/website.png', dark: 'https://signatures.heights.digital/icons/v2/website-white.png' },
    phone: { light: 'https://signatures.heights.digital/icons/v2/phone.png', dark: 'https://signatures.heights.digital/icons/v2/phone-white.png' },
    linkedin: { light: 'https://signatures.heights.digital/icons/v2/linkedin.png', dark: 'https://signatures.heights.digital/icons/v2/linkedin-white.png' },
  },
};

describe('signature HTML is email-safe', () => {
  const html = buildSignatureHtml(full);

  it('stays well under Gmail’s 10,000 character limit', () => {
    expect(html.length).toBeLessThan(6000);
  });
  it('uses no SVG, data URLs, rgba or opacity, and only the one dark-mode style block', () => {
    expect(html).not.toMatch(/<svg|data:|rgba\(|opacity/i);
    expect(html.match(/<style/g)).toHaveLength(1);
    expect([...html.matchAll(/class="([^"]+)"/g)].map((m) => m[1]).every((c) => ['hs-ic-l', 'hs-ic-d', 'hs-cta', 'hs-cta-t', 'hs-sub', 'hs-name'].includes(c))).toBe(true);
  });
  it('hides the white icons unless the app is in dark mode (so Gmail, which strips the style, shows the outlined ones)', () => {
    const dark = html.match(/<img class="hs-ic-d"[^>]+>/g)!;
    expect(dark).toHaveLength(4); // 3 contact icons + the CTA chip
    for (const i of dark) expect(i).toMatch(/display:none;max-height:0;overflow:hidden;mso-hide:all;/);
    expect(html).toContain('@media (prefers-color-scheme:dark){.hs-ic-l{display:none!important}');
    expect(buildSignatureHtml({ name: 'J', title: '' })).toContain('.hs-name{color:#FFFFFF!important}'); // even a name alone has something for dark mode
  });
  it('gives every image explicit width and height', () => {
    const imgs = html.match(/<img [^>]+>/g)!;
    expect(imgs).toHaveLength(9); // image, 3 contact icons and the CTA arrow chip × light and dark
    for (const img of imgs) expect(img).toMatch(/width="\d+" height="\d+"/);
  });
  it('includes every filled-in part', () => {
    for (const s of ['Anastasiia Cherevychna', 'Designer', 'heights.digital', 'mailto:name@heights.digital',
      'tel:+351912345678', 'LinkedIn', 'Book a call', 'bgcolor="#262626"']) expect(html).toContain(s);
  });
  it('shows website, phone and LinkedIn as a row of clickable icons (no email icon)', () => {
    const row = html.match(/<table[^>]*margin-top:10px;"><tr>(.*?)<\/tr><\/table>/)![1];
    const links = [...row.matchAll(/<a href="([^"]+)"[^>]*><img class="hs-ic-l" src="[^"]+icons\/v2\/(\w+)\.png" width="28" height="28" alt="([^"]+)"/g)].map((m) => [m[2], m[1], m[3]]);
    expect(links).toEqual([
      ['website', 'https://heights.digital/', 'heights.digital'],
      ['phone', 'tel:+351912345678', '+351 912 345 678'],
      ['linkedin', 'https://linkedin.com/in/someone', 'LinkedIn'],
    ]);
  });
  it('only shows icons for filled-in fields', () => {
    const h = buildSignatureHtml({ name: 'J', title: 'T', website: 'https://x.com/', icons: full.icons });
    expect(h).toContain('icons/v2/website.png');
    expect(h).not.toMatch(/icons\/(phone|linkedin)/);
  });
  it('falls back to text links when icons aren’t available', () => {
    const h = buildSignatureHtml({ ...full, icons: {}, cta: { text: 'Book a call', href: 'https://calendly.com/x' } }); // nothing from the site's icons folder
    expect(h).not.toContain('icons/');
    expect(h).toContain('>heights.digital</span>');
    expect(h).toContain('>LinkedIn</span>');
  });
  it('never shows a placeholder by default', () => {
    expect(buildSignatureHtml({ name: 'J', title: 'T' })).not.toContain('placeholder');
  });
  it('leaves out empty parts', () => {
    const min = buildSignatureHtml({ name: 'Jane', title: 'CTO' });
    expect(min).not.toMatch(/<img|mailto|bgcolor|border-top/);
  });
  it('escapes what people type', () => {
    const h = buildSignatureHtml({ name: '<b>Jane</b>', title: 'A & B "quoted"' });
    expect(h).toContain('&lt;b&gt;Jane&lt;/b&gt;');
    expect(h).toContain('A &amp; B &quot;quoted&quot;');
    expect(h).not.toContain('<b>');
  });
  it('has no quote section any more (no separator line under the details)', () => {
    expect(html).not.toMatch(/border-top|“|”/);
  });
  it('draws the CTA button like the Figma component', () => {
    const cell = html.match(/<td class="hs-cta" bgcolor="#262626" style="([^"]+)">/)![1];
    expect(cell).toBe('background-color:#262626;border-radius:6px;padding:0;'); // dark, 6 px corners
    expect(html).toContain('<td valign="middle" style="padding:13px 10px 13px 16px;"><a class="hs-cta-t" href="https://calendly.com/x" style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:18px;letter-spacing:0.07px;color:#FDFDFC;text-decoration:none;white-space:nowrap;">Book a call</a></td>');
    expect(html).toContain('<td valign="middle" style="padding:9px 7px 9px 0;"><a href="https://calendly.com/x" style="display:block;text-decoration:none;"><img class="hs-ic-l" src="https://signatures.heights.digital/icons/cta-arrow.png" width="22" height="22" alt=""');
    expect(html).toContain('<img class="hs-ic-d" src="https://signatures.heights.digital/icons/cta-arrow-dark.png" width="22" height="22" alt="" style="width:22px;height:22px;border:0;outline:none;display:none;max-height:0;overflow:hidden;mso-hide:all;">');
    expect(html).not.toMatch(/text-transform:uppercase/); // sentence case, as in Figma
  });
  it('switches the CTA button to the Figma dark colours in apps that support dark mode (Gmail keeps the dark button)', () => {
    expect(html).toContain('@media (prefers-color-scheme:dark){');
    expect(html).toContain('.hs-cta{background-color:#FAF8F7!important}.hs-cta-t{color:#262626!important}');
    expect(html).toContain('[data-ogsb] .hs-cta{background-color:#FAF8F7!important}[data-ogsc] .hs-cta-t{color:#262626!important}');
    // only one style block, and none at all when there's nothing for dark mode to change
    expect(html.match(/<style/g)).toHaveLength(1);
    expect(buildSignatureHtml({ name: 'J', title: '' })).toContain('.hs-name{color:#FFFFFF!important}'); // even a name alone has something for dark mode
  });
  it('sits 16 px below the contact icons, and 14 px below a line of text when there are no icons', () => {
    expect(html).toContain('<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:separate;margin-top:16px;"><tr><td class="hs-cta"');
    const noIcons = buildSignatureHtml({ name: 'J', title: 'T', cta: full.cta });
    expect(noIcons).toContain('style="border-collapse:separate;margin-top:14px;"><tr><td class="hs-cta"');
  });
  it('keeps the button without the arrow chip when the chip image isn’t available', () => {
    const h = buildSignatureHtml({ ...full, cta: { text: 'Book a call', href: 'https://calendly.com/x' } });
    expect(h).toContain('padding:13px 16px 13px 16px;');
    expect(h).not.toContain('cta-arrow');
  });
});

describe('the 128 × 128 image', () => {
  const { image: _image, ...noImage } = full;
  const withImage = buildSignatureHtml({ ...noImage, image: { src: 'https://res.cloudinary.com/x/image/upload/v1/i.gif', width: 128, height: 128, alt: 'Heights Digital' } });
  const rightCell = '<td valign="top" align="right" style="padding:0 0 0 24px;">';

  it('sits in the right-hand cell, at exactly 128 × 128', () => {
    expect(withImage).toContain(`${rightCell}<img src="https://res.cloudinary.com/x/image/upload/v1/i.gif" width="128" height="128"`);
    expect(withImage).toContain('style="display:block;width:128px;height:128px;border:0;outline:none;"');
    expect(withImage.indexOf('align="right"')).toBeGreaterThan(withImage.indexOf('Anastasiia Cherevychna')); // right of the details
  });
  it('wraps a shorter image at its own size, not in a 128 × 128 box', () => {
    const wide = buildSignatureHtml({ ...noImage, image: { src: 'https://res.cloudinary.com/x/i.png', width: 128, height: 64, alt: 'X' } });
    expect(wide).toContain('width="128" height="64"');
    expect(wide).toContain('style="display:block;width:128px;height:64px;border:0;outline:none;"');
    const tall = buildSignatureHtml({ ...noImage, image: { src: 'https://res.cloudinary.com/x/i.png', width: 64, height: 128, alt: 'X' } });
    expect(tall).toContain('width="64" height="128"');
    expect(wide).not.toContain('height:128px;border:0'); // nothing pads it out to 128
  });
  it('stays email-safe: no SVG, data URLs, extra classes or styles, and under Gmail’s limit', () => {
    expect(withImage).not.toMatch(/<svg|data:|rgba\(|opacity/i);
    expect(withImage.match(/<style/g)).toHaveLength(1); // still just the dark-mode icon block
    expect(withImage.length).toBeLessThan(6000);
  });
  it('shows a grey IMAGE placeholder in the preview, with the same footprint, only when asked', () => {
    const ph = buildSignatureHtml({ name: 'J', title: 'T', imagePlaceholder: true });
    expect(ph).toContain('data-placeholder="image"');
    expect(ph).toContain('width:128px;height:128px');
    expect(buildSignatureHtml({ name: 'J', title: 'T' })).not.toContain('data-placeholder');
  });
});

describe('the email address line under the job title', () => {
  const withLine = buildSignatureHtml({ ...full, emailLine: 'anastasiia@heights.digital' });
  const titleDiv = withLine.match(/<div class="hs-sub" style="([^"]+)">Designer<\/div>/)![1];

  it('comes straight after the job title, and before the icons', () => {
    const i = (t: string) => withLine.indexOf(t);
    expect(i('Designer</div>')).toBeLessThan(i('anastasiia@heights.digital'));
    expect(i('anastasiia@heights.digital')).toBeLessThan(i('<img class="hs-ic-l"'));
  });
  it('has exactly the same style as the job title: font, size, line height and colour', () => {
    const line = withLine.match(/<div class="hs-sub" style="([^"]+)"><a class="hs-sub" href="mailto:anastasiia@heights.digital"/)![1];
    expect(line).toBe(titleDiv);
    const link = withLine.match(/<a class="hs-sub" href="mailto:anastasiia@heights.digital" style="([^"]+)"/)![1];
    expect(link).toBe(`${titleDiv}text-decoration:none;`); // a link, so email apps don’t colour or underline it themselves
  });
  it('is #8D8D8B like the job title, and #FDFDFC in dark mode', () => {
    expect(titleDiv).toContain('color:#8D8D8B;');
    expect(withLine).toContain('.hs-sub{color:#FDFDFC!important}');
    expect(withLine).toContain('[data-ogsc] .hs-sub{color:#FDFDFC!important}');
  });
  it('the name stays #34333D, and is #FFFFFF in dark mode', () => {
    expect(withLine).toMatch(/<div class="hs-name" style="[^"]*color:#34333D;">Anastasiia Cherevychna<\/div>/);
    expect(withLine).toContain('.hs-name{color:#FFFFFF!important}');
    expect(withLine).toContain('[data-ogsc] .hs-name{color:#FFFFFF!important}');
  });
  it('is left out when empty, and escaped when not', () => {
    expect(buildSignatureHtml({ ...full, emailLine: undefined })).not.toContain('mailto:');
    expect(buildSignatureHtml({ ...full, emailLine: 'a"b@x.com' })).toContain('mailto:a&quot;b@x.com');
  });
  it('adds a line to the plain-text version under the job title', () => {
    expect(buildSignatureText({ name: 'J', title: 'CTO', emailLine: 'j@x.com' }).split('\n').slice(0, 3)).toEqual(['J', 'CTO', 'j@x.com']);
  });
  it('stays email-safe', () => {
    expect(withLine.length).toBeLessThan(6000);
    expect(withLine).not.toMatch(/<svg|data:|rgba\(|opacity/i);
  });
});

describe('text and file versions', () => {
  it('plain text has the essentials', () => {
    expect(buildSignatureText(full)).toBe(
      'Anastasiia Cherevychna\nDesigner\nname@heights.digital\nheights.digital | +351 912 345 678 | https://linkedin.com/in/someone\nBook a call: https://calendly.com/x',
    );
  });
  it('download is a full HTML document', () => {
    const doc = buildSignatureDocument(full);
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
  });
});

describe('format helpers', () => {
  it('normalises links', () => {
    expect(normaliseUrl('company.com')).toBe('https://company.com/');
    expect(normaliseUrl('http://a.co/x')).toBe('http://a.co/x');
    expect(normaliseUrl('javascript:alert(1)')).toBe('');
    expect(normaliseUrl('not a link')).toBe('');
    expect(normaliseUrl('localhost')).toBe('');
    expect(displayUrl('https://www.company.com/')).toBe('company.com');
  });
  it('checks emails and phones', () => {
    expect(isEmail('name@company.com')).toBe(true);
    expect(isEmail('name@company')).toBe(false);
    expect(telHref('+351 912 345 678')).toBe('tel:+351912345678');
    expect(telHref('(020) 7946-0018')).toBe('tel:02079460018');
    expect(telHref('123')).toBe('');
  });

});
