import { initialsOf, photoSrc } from '@/lib/photo';

/** Round photo for a person, or their initials when there's no photo. */
export default function Face({ person, size = 36 }) {
  const src = photoSrc(person?.photo_url ?? person?.photo);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  return src
    ? <img className="face" src={src} alt="" width={size} height={size} loading="lazy" />
    : <span className="face face-initials" style={style} aria-hidden="true">{initialsOf(person?.first_name, person?.last_name)}</span>;
}
