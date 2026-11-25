import Bug from '../Bug';

/**
 * The navy-and-lime header for the newer Operations pages (Trucks, Drivers, Maintenance, Inventory): the brand's deep
 * navy with the brand line art and the "Your Local Pest Control Experts" badge. children: the right-hand note.
 */
export default function OpsHero({ kicker = 'Operations', title, em, bug = 'ant', badge = '/badges/experts-sage.png', children }) {
  return (
    <div className="rc-top brand-head brand-hero ops-hero">
      {/* Official badge from the brand guide (page 16), cut out to public/badges */}
      <img className="ops-hero-badge" src={badge} alt="" aria-hidden="true" width="150" height="106" />
      <div>
        <p className="rc-kicker"><Bug kind={bug} size={14} className="ops-hero-mini" />{kicker}</p>
        <h1 className="rc-title">{title} {em && <em>{em}</em>}</h1>
      </div>
      {children && <div className="rc-updated">{children}</div>}
    </div>
  );
}
