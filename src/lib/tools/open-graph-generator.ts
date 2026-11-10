/**
 * Builds Open Graph and Twitter Card meta tags from a form's fields, and
 * checks the values against the lengths social sites tend to show.
 */

export const OG_TYPES = ['website', 'article', 'book', 'profile', 'video.other', 'music.song', 'product'] as const;
export type OgType = (typeof OG_TYPES)[number];

export const TWITTER_CARDS = ['summary', 'summary_large_image'] as const;
export type TwitterCard = (typeof TWITTER_CARDS)[number];

export interface OpenGraphFields {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  siteName: string;
  type: OgType;
  locale: string;
  twitterCard: TwitterCard;
  twitterSite: string;
  twitterCreator: string;
}

export const EMPTY_OG_FIELDS: OpenGraphFields = {
  title: '',
  description: '',
  url: '',
  image: '',
  imageAlt: '',
  siteName: '',
  type: 'website',
  locale: '',
  twitterCard: 'summary_large_image',
  twitterSite: '',
  twitterCreator: '',
};

export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 155;

/** Escapes text for use inside a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** A value on one line: line breaks and runs of space become a single space. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** A Twitter handle with exactly one leading @, or '' when there is none. */
export function normalizeHandle(value: string): string {
  const name = value.trim().replace(/^@+/, '');
  return name === '' ? '' : `@${name}`;
}

/**
 * The meta tags for the fields that are filled in, one per line. Values are
 * escaped; empty fields are left out.
 */
export function generateMetaTags(fields: OpenGraphFields): string {
  const tags: string[] = [];
  const add = (attribute: 'property' | 'name', key: string, value: string) => {
    const text = singleLine(value);
    if (text !== '') tags.push(`<meta ${attribute}="${key}" content="${escapeAttribute(text)}" />`);
  };

  add('property', 'og:title', fields.title);
  add('property', 'og:type', fields.type);
  add('property', 'og:url', fields.url);
  add('property', 'og:image', fields.image);
  if (singleLine(fields.image) !== '') add('property', 'og:image:alt', fields.imageAlt);
  add('property', 'og:description', fields.description);
  add('property', 'og:site_name', fields.siteName);
  add('property', 'og:locale', fields.locale);

  add('name', 'twitter:card', fields.twitterCard);
  add('name', 'twitter:site', normalizeHandle(fields.twitterSite));
  add('name', 'twitter:creator', normalizeHandle(fields.twitterCreator));
  if (singleLine(fields.image) !== '') add('name', 'twitter:image:alt', fields.imageAlt);

  return tags.join('\n');
}

export type LengthState = 'empty' | 'ok' | 'over';

export interface LengthHint {
  count: number;
  limit: number;
  state: LengthState;
}

/** How long a value is, in characters as a person counts them, against a limit. */
export function lengthHint(value: string, limit: number): LengthHint {
  const count = Array.from(singleLine(value)).length;
  return { count, limit, state: count === 0 ? 'empty' : count > limit ? 'over' : 'ok' };
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Problems that make a tag unlikely to work. Blank fields are not problems here. */
export function checkFields(fields: OpenGraphFields): string[] {
  const warnings: string[] = [];
  const url = fields.url.trim();
  const image = fields.image.trim();
  const locale = fields.locale.trim();

  if (url !== '' && !isAbsoluteHttpUrl(url)) warnings.push('The page URL should be absolute, starting with http:// or https://.');
  if (image !== '' && !isAbsoluteHttpUrl(image)) warnings.push('The image URL should be absolute, starting with http:// or https://.');
  if (locale !== '' && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(locale)) warnings.push('The locale looks like en or en_US (language, then an optional _REGION).');
  if (singleLine(fields.title) === '') warnings.push('Add a title: og:title is the one tag every site expects.');
  return warnings;
}

/** The host of a URL without a leading www, for the preview card; '' when it is not a URL. */
export function displayHost(value: string): string {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
