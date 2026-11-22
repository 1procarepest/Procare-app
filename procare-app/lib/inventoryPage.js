// Loads Inventory for a page (change 84/86): the count data plus each place's managers by name (inventory_places).
export async function loadInventory(supabase, searchParams, today) {
  const month = /^\d{4}-\d{2}/.test(searchParams?.month || '') && searchParams.month.slice(0, 7) <= today.slice(0, 7) ? `${searchParams.month.slice(0, 7)}-01` : today;
  const [{ data, error }, { data: extra }] = await Promise.all([
    supabase.rpc('inventory_data', { p_month: month }),
    supabase.rpc('inventory_places'),   // null before change 86 is run
  ]);
  if (error || !data) return { data, error };
  const by = Object.fromEntries((extra?.places || []).map((p) => [p.key, p]));
  data.locations = (data.locations || []).map((l) => ({ ...l, manager: by[l.key]?.manager || null, wildlife_manager: by[l.key]?.wildlife_manager || null }));
  return { data, people: extra?.people || [] };
}
