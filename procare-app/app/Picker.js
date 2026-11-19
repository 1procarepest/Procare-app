'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * A rounded pick-one menu, instead of the phone's square drop-down (John prefers these). Options can be grouped
 * (e.g. by office) and searched. options: [{ value, label, sub?, group? }]. value '' = nothing picked.
 */
export default function Picker({ value, onChange, options, placeholder = 'Pick one…', label, search = options.length > 8, className = '' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const id = useId();
  const picked = options.find((o) => String(o.value) === String(value ?? ''));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // Long lists (like times) open scrolled to the picked option
  const list = useRef(null);
  useEffect(() => {
    const el = open && list.current?.querySelector('.pk-opt.on');
    if (el) list.current.scrollTop = el.offsetTop - list.current.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;   // only the list scrolls, not the page
  }, [open]);

  const shown = options.filter((o) => !q || `${o.label} ${o.sub || ''} ${o.group || ''}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [];
  shown.forEach((o) => {
    const g = groups.find((x) => x.name === (o.group || ''));
    if (g) g.items.push(o); else groups.push({ name: o.group || '', items: [o] });
  });
  const choose = (v) => { onChange(v); setOpen(false); setQ(''); };

  return (
    <div className={`pk ${className}`.trim()} ref={box}>
      <button type="button" className={`pk-btn${open ? ' pk-open' : ''}${picked ? '' : ' pk-empty'}`} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={id} aria-label={label} onClick={() => setOpen(!open)}>
        <span>{picked ? picked.label : placeholder}</span>
        <span className="pk-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="pk-pop" id={id}>
          {search && (
            <input className="pk-search" autoFocus value={q} placeholder="Search…" aria-label="Search" onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="pk-list" role="listbox" aria-label={label} ref={list}>
            {groups.length === 0 && <p className="pk-none">No matches.</p>}
            {groups.map((g) => (
              <div key={g.name || 'all'} className="pk-group">
                {g.name && <p className="pk-group-name">{g.name}</p>}
                {g.items.map((o) => {
                  const on = String(o.value) === String(value ?? '');
                  return (
                    <button key={o.value} type="button" role="option" aria-selected={on} className={`pk-opt${on ? ' on' : ''}`} onClick={() => choose(o.value)}>
                      <span>{o.label}{o.sub ? <small>{o.sub}</small> : null}</span>
                      {on && <span aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
