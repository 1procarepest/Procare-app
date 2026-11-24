-- 89 (2026-11-24). "Processes sales pay" (John): a switch on a person's Settings page, for someone outside Sales
-- who runs sales payroll (Mark Daniel). With it on they get the same sales pay access as a sales manager: every
-- rep's Statement, Plans and the Everee tab in Sales → Pay. Their department and everything else stay the same.
-- C-Suite and the President set it. Nobody is switched on here: flip it on Mark's page.
-- Safe to run twice.
begin;

alter table public.employees add column if not exists sales_pay_access boolean not null default false;

-- Sales pay: C-Suite, the President, sales managers, and anyone with the switch on
create or replace function public.can_manage_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select my_rank() >= 4 or (my_department() = 'sales' and my_rank() >= 3)
    or exists (select 1 from employees e where e.id = my_id() and e.active and e.sales_pay_access)
$$;
revoke all on function public.can_manage_pay() from public, anon;
grant execute on function public.can_manage_pay() to authenticated;

-- The switch (C-Suite and the President)
create or replace function public.set_sales_pay_access(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  update employees set sales_pay_access = coalesce(p_on, false), updated_at = now() where id = p_employee;
  delete from rpc_cache where fn = 'comp_sales';   -- saved pay is kept per person's access; start fresh
end $$;
revoke all on function public.set_sales_pay_access(uuid, boolean) from public, anon;
grant execute on function public.set_sales_pay_access(uuid, boolean) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Check: the new column is there, and who has it on (nobody until it's switched on)
select 'sales_pay_access column' as what, count(*)::text as detail from information_schema.columns
  where table_schema = 'public' and table_name = 'employees' and column_name = 'sales_pay_access'
union all
select 'switched on', coalesce(string_agg(first_name || ' ' || last_name, ', '), 'nobody yet') from public.employees where sales_pay_access;
