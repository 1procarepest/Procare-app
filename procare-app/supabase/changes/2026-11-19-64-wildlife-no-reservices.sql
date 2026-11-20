-- 64 (2026-11-19). Wildlife counts leave out reservices (John: reservices are unpaid return trips).
-- Trapping Reservice and Exclusion Reservice no longer count as wildlife sold or done. They still show in the
-- Reservices column of the Wildlife Performance Card, like on the technician card.
-- Pay rules for later (Phase 2, John 2026-11-19): exclusion pays on the initial job only (not warranty renewals or the
-- recurring part); trapping pays for the entire job; Wildlife Warranty doesn't pay; reservices never pay.
-- Every wildlife service type still counts toward revenue (QuickBooks, by line item).
-- Safe to run twice.

begin;

create or replace function public.wildlife_line(name text)
returns text language sql immutable as $$
  select case
    when name ~* 're-?service' then null
    when name ~* 'exclusion' then 'exclusion'
    when name ~* 'wildlife\s*warrant' then 'warranty'
    when name ~* 'trapping' then 'trapping'
    when name ~* 'insulation' then 'insulation'
  end
$$;

-- Recalculate the saved wildlife numbers
delete from public.rpc_cache where fn in ('wildlife_sales', 'wildlife_scorecard');

commit;

select public.refresh_saved_reports() as refreshed;

-- Check: the service types that now count as wildlife (no reservices)
select distinct description as service_type, public.wildlife_line(description) as counts_as
from public.fr_service_types where public.wildlife_line(description) is not null order by 2, 1;
