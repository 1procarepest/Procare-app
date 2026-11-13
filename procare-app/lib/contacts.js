/**
 * Email and phone by employee id, from the employee_contacts() database function.
 * Team members only get their own; leads and up get everyone they can see.
 * Returns {} if the lookup fails, so pages still load without contact details.
 */
export async function contactsById(supabase, target) {
  const { data } = await supabase.rpc('employee_contacts', target ? { target } : {});
  return Object.fromEntries((data || []).map((c) => [c.id, { email: c.email, phone: c.phone }]));
}
