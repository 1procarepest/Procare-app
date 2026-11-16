/**
 * On/off switch (the app's standard instead of checkboxes — the user prefers toggles everywhere).
 * A real checkbox underneath (role="switch"), drawn as a sliding toggle. Children are the label.
 */
export default function Toggle({ checked, onChange, disabled = false, className = '', small = false, label, children }) {
  return (
    <label className={`toggle${small ? ' toggle-small' : ''}${disabled ? ' toggle-off' : ''} ${className}`.trim()}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      {children}
    </label>
  );
}
