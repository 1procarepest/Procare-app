import Bug from '../Bug';

/**
 * The navy-and-lime header for the newer Operations pages (Trucks, Drivers, Maintenance, Inventory): the brand's deep
 * navy with the lime bug pattern, a big faint bug, and a lime stripe along the bottom. children: the right-hand note.
 */
export default function OpsHero({ kicker = 'Operations', title, em, bug = 'ant', children }) {
  return (
    <div className="rc-top brand-head brand-hero ops-hero">
      <Bug kind={bug} size={170} className="brand-head-bug" />
      <div>
        <p className="rc-kicker"><Bug kind={bug} size={14} className="ops-hero-mini" />{kicker}</p>
        <h1 className="rc-title">{title} {em && <em>{em}</em>}</h1>
      </div>
      {children && <div className="rc-updated">{children}</div>}
    </div>
  );
}
