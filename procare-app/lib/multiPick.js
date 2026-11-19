/**
 * Multi-select chips (offices, departments): tap to add or remove; "All" picks everything.
 * While everything is picked, tapping one starts over with just that one (then tap others to add them).
 * The last one picked can't be removed, so something is always showing. Keeps the order of `all`.
 */
export function togglePick(picked, key, all) {
  if (key === 'all') return [...all];
  if (all.length > 1 && all.every((k) => picked.includes(k))) return [key];
  const on = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
  return on.length ? all.filter((k) => on.includes(k)) : picked;
}

export const allPicked = (picked, all) => all.every((k) => picked.includes(k));
