-- 81 (2026-11-21). The truck sheet keeps Samsara in step (John, 2026-11-20/21).
--  * Each truck is matched to its Samsara vehicle by VIN (Samsara makes the vehicle when the camera / gateway is
--    installed; the API can't create one). The app then sets the Samsara name ("Adin Sanford -118"), plate and office
--    tag, and on a sale renames it "SOLD -123" with a note (Samsara vehicles can't be deleted).
--  * The driver: the app writes tech_vehicles (set_by 'manual') so the scorecard follows the truck sheet right away,
--    and Procare Sync's 7 AM / 1 PM driver run pins that tech's Samsara driver to the truck (it already does that).
--  * Off until C-Suite turns it on (fleet_settings.samsara_auto) after looking at the preview. While on, each change on
--    the truck sheet is pushed right away and a daily run picks up newly installed trucks.
--  * Needs SAMSARA_API_TOKEN in Vercel (Samsara → Settings → API Tokens: Read and Write Vehicles, Read Tags).
-- Safe to run twice.

begin;

alter table public.trucks add column if not exists samsara_vehicle_id text;
alter table public.trucks add column if not exists samsara_name text;
alter table public.trucks add column if not exists samsara_pushed_at timestamptz;
alter table public.trucks add column if not exists samsara_result text;
create unique index if not exists trucks_samsara_vehicle on public.trucks (samsara_vehicle_id) where samsara_vehicle_id is not null;
alter table public.fleet_settings add column if not exists samsara_auto boolean not null default false;

-- Samsara link per truck and whether the push is on (managers and up see it)
create or replace function public.samsara_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when can_see_trucks() then jsonb_build_object(
    'auto', (select samsara_auto from fleet_settings where id = 1),
    'trucks', (select coalesce(jsonb_object_agg(t.id, jsonb_build_object('vehicle_id', t.samsara_vehicle_id, 'name', t.samsara_name,
                 'pushed_at', t.samsara_pushed_at, 'result', t.samsara_result)), '{}') from trucks t)
  ) end
$$;
revoke all on function public.samsara_status() from public, anon;
grant execute on function public.samsara_status() to authenticated;

create or replace function public.set_samsara_auto(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can turn this on or off.'; end if;
  update fleet_settings set samsara_auto = coalesce(p_on, false) where id = 1;
end $$;
revoke all on function public.set_samsara_auto(boolean) from public, anon;
grant execute on function public.set_samsara_auto(boolean) to authenticated;

commit;

-- Check
select 'Samsara push' as what, case when samsara_auto then 'on' else 'off (look at the preview on Operations → Trucks first)' end as detail
from public.fleet_settings where id = 1;
