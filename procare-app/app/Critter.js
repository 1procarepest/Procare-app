/**
 * Procare wildlife critters (public/icons/wildlife), drawn in the current text color like app/Bug.js.
 * Only for the Wildlife pages and the Wildlife app tile.
 */
export const CRITTERS = ['squirrel', 'bat', 'raccoon', 'mice', 'armadillo', 'opossum', 'flying-squirrel', 'mole', 'rat', 'snake'];

export default function Critter({ kind = 'raccoon', size = 24, color, className = '', style }) {
  const name = CRITTERS.includes(kind) ? kind : 'raccoon';
  const url = `url(/icons/wildlife/${name}.svg)`;
  return (
    <span
      className={`bug critter ${className}`.trim()}
      aria-hidden="true"
      style={{ width: size, height: size, color, WebkitMaskImage: url, maskImage: url, ...style }}
    />
  );
}

/** A rounded brand tile with a critter in it, like the brand's wildlife icon set. tone: ink | forest | lime | sage */
export function CritterTile({ kind, size = 44, tone = 'forest' }) {
  return (
    <span className={`bug-tile bug-tile-${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Critter kind={kind} size={Math.round(size * 0.74)} />
    </span>
  );
}
