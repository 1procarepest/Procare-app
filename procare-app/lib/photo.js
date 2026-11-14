const FIELDROUTES_PHOTOS = 'https://d282x1mqo546ey.cloudfront.net/';

/** A usable image URL from employees.photo_url, which may be a full URL or a FieldRoutes file name. */
export function photoSrc(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return FIELDROUTES_PHOTOS + encodeURIComponent(s);
}

export function initialsOf(first, last) {
  return `${String(first || '').trim()[0] || ''}${String(last || '').trim()[0] || ''}`.toUpperCase();
}
