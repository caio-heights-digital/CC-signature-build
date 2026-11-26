import { describe, expect, it } from 'vitest';
import { missingFromEmail, toSignatureData, type FormState } from '../../src/builder/data';
import { FIELDS, type TextKey } from '../../src/builder/fields';
import { buildSignatureHtml } from '../../src/template/signature';
import { isEmail } from '../../src/template/format';
import type { ClientConfig } from '../../src/config/types';

const blank = () => Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<TextKey, string>;
const client: ClientConfig = { id: 'x', name: 'X Ltd' };
const live = (src: string) => new URL(src, 'https://signatures.heights.digital/').href;
const local = (src: string) => new URL(src, 'http://localhost:5173/').href;

function form(over: Partial<FormState> = {}): FormState {
  return { values: { ...blank(), name: 'Jane', title: 'CTO' }, image: null, ...over };
}

describe('form → signature data', () => {
  it('icons are full public links on the live site, and left out (and reported) on a local machine', () => {
    const values = { ...blank(), name: 'J', title: 'T', website: 'x.com' };
    expect(toSignatureData(form({ values }), client, 'email', live).icons?.website).toEqual({
      light: 'https://signatures.heights.digital/icons/website.png',
      dark: 'https://signatures.heights.digital/icons/website-white.png',
    });
    expect(toSignatureData(form({ values }), client, 'email', local).icons).toEqual({});
    expect(missingFromEmail(form({ values }), local)).toContain('icons');
  });
  it('only adds a CTA when it has both text and a working link', () => {
    const v = { ...blank(), name: 'J', title: 'T', ctaText: 'Book a call' };
    expect(toSignatureData(form({ values: v }), client, 'email', live).cta).toBeUndefined();
    const d = toSignatureData(form({ values: { ...v, ctaLink: 'cal.com/j', ctaColour: 'abc' } }), client, 'email', live);
    expect(d.cta).toEqual({ text: 'Book a call', href: 'https://cal.com/j', colour: '#AABBCC' });
  });
  it('ignores links that aren’t LinkedIn in the LinkedIn field', () => {
    const d = toSignatureData(form({ values: { ...blank(), name: 'J', title: 'T', linkedin: 'twitter.com/j' } }), client, 'email', live);
    expect(d.linkedin).toBeUndefined();
  });
});

describe('the 128 × 128 image', () => {
  const image = { preview: 'data:image/gif;base64,xx', hosted: 'https://res.cloudinary.com/i.gif', width: 128, height: 64 };

  it('uses the uploaded image: the local copy in the preview, the hosted one in the email', () => {
    const s = form({ image });
    const e = toSignatureData(s, client, 'email', live);
    expect(e.image).toEqual({ src: 'https://res.cloudinary.com/i.gif', width: 128, height: 64, alt: 'X Ltd' }); // the size it's shown at, not forced to 128 × 128
    expect(toSignatureData(s, client, 'preview', live).image?.src).toBe('data:image/gif;base64,xx');
    expect(missingFromEmail(s, live)).toEqual([]);
  });
  it('shows an IMAGE placeholder in the preview until one is uploaded, and nothing in the email', () => {
    expect(toSignatureData(form(), client, 'preview', live).imagePlaceholder).toBe(true);
    const e = toSignatureData(form(), client, 'email', live);
    expect(e.image).toBeUndefined();
    expect(e.imagePlaceholder).toBeUndefined();
    expect(missingFromEmail(form(), live)).toEqual([]);
  });
  it('leaves an un-hosted image out of the email and says so', () => {
    const s = form({ image: { preview: 'data:image' } });
    expect(toSignatureData(s, client, 'email', live).image).toBeUndefined();
    expect(missingFromEmail(s, live)).toEqual(['image']);
  });
});

describe('the one Email field: always written out in full under the job title', () => {
  const field = FIELDS.find((f) => f.key === 'email')!;
  const make = (v: string) => toSignatureData(form({ values: { ...blank(), name: 'J', title: 'T', email: v } }), client, 'email', live);

  it('is a single optional field, in Contact & Social links', () => {
    expect(field.section).toBe('contact');
    expect(FIELDS.filter((f) => /email/i.test(f.key))).toHaveLength(1);
    expect(make('').emailLine).toBeUndefined();
  });
  it('writes the address under the job title, never as an icon', () => {
    const d = make('  jane@company.com ');
    expect(d.emailLine).toBe('jane@company.com');
    expect(Object.keys(d.icons ?? {})).not.toContain('email');
    const html = buildSignatureHtml(d);
    expect(html).not.toContain('icons/email'); // no envelope icon
    expect(html).toContain('>jane@company.com</a>');
    expect(missingFromEmail(form({ values: { ...blank(), name: 'J', title: 'T', email: 'j@x.com' } }), local)).not.toContain('icons');
  });
  it('accepts a normal address', () => {
    expect(field.check!('jane@company.com', blank())).toBeNull();
    expect(field.check!('jane.smith+news@sub.company.co.uk', blank())).toBeNull();
  });
  it('turns away anything without an @, saying so', () => {
    for (const bad of ['jane', 'jane.company.com', 'company.com', 'Jane Smith']) {
      expect(field.check!(bad, blank())).toMatch(/needs an @/);
      expect(make(bad).emailLine).toBeUndefined();
    }
  });
  it('turns away an address that has an @ but isn’t complete', () => {
    for (const bad of ['jane@', '@company.com', 'jane@company', 'jane@company.', 'jane@@company.com', 'jane @company.com', 'jane@com pany.com', 'jane@company.c']) {
      expect(field.check!(bad, blank()), bad).toMatch(/looks incomplete/);
      expect(isEmail(bad), bad).toBe(false);
      expect(make(bad).emailLine, bad).toBeUndefined();
    }
  });
});
