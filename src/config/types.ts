/**
 * One file per client lives in /clients/<id>.json and follows this shape.
 * Adding a client = adding a file. See README.md › "Adding a client".
 */

/** Every field a person can fill in on the form. */
export type FieldKey =
  | 'name'
  | 'title'
  | 'headshot'
  | 'website'
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'ctaText'
  | 'ctaLink'
  | 'ctaColour'
  | 'quoteText'
  | 'quoteAuthor';

export interface UploadConfig {
  provider: 'cloudinary';
  cloudName: string;
  uploadPreset: string;
}

export interface ClientConfig {
  /** Matches the file name and the link: signatures.heights.digital/<id> */
  id: string;
  /** Shown in the page title and used as the image's alt text. */
  name: string;
  /** Values pre-filled on the form. Locked fields always use these. */
  defaults?: Partial<Record<Exclude<FieldKey, 'headshot'>, string>>;
  /** Fields people can't change (hidden on the form, value comes from `defaults`). */
  locked?: FieldKey[];
  /** Fields that must be filled before copying. Name and job title are always required. */
  required?: FieldKey[];
  /** Where photos are stored. Without it, photos can't be hosted and are left out of the copied signature. */
  upload?: UploadConfig;
}
