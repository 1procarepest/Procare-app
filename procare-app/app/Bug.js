/**
 * Procare bug illustrations from the brand guide (public/icons/bugs). Drawn in the current text
 * color, so set `color` (or CSS color) to recolor. Wildlife icons live in public/icons/wildlife and
 * are only for the wildlife pages, so they aren't offered here.
 */
export const BUGS = ['roach', 'spider', 'ant', 'termite', 'cricket', 'earwig', 'centipede', 'tick', 'stinging', 'mosquito'];

export default function Bug({ kind = 'ant', size = 24, color, className = '', style }) {
  const name = BUGS.includes(kind) ? kind : 'ant';
  const url = `url(/icons/bugs/${name}.svg)`;
  return (
    <span
      className={`bug ${className}`.trim()}
      aria-hidden="true"
      style={{ width: size, height: size, color, WebkitMaskImage: url, maskImage: url, ...style }}
    />
  );
}

/** A rounded brand tile with a bug in it, like the brand guide's icon set. tone: ink | forest | lime | sage */
export function BugTile({ kind, size = 44, tone = 'ink' }) {
  return (
    <span className={`bug-tile bug-tile-${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Bug kind={kind} size={Math.round(size * 0.72)} />
    </span>
  );
}
