-- 77 (2026-11-21). Truck documents: purchase / finance agreements, titles and bills of sale on each truck (John).
--  * Files live in a PRIVATE storage bucket (truck-docs). Nobody opens them directly: the app's server hands out a
--    one-minute link to C-Suite / the President with the authenticator step (can_see_finance), and uploads go
--    straight from the phone with a one-time upload link the server makes.
--  * truck_documents: what each file is. The truck emails (change 75) attach them for the bookkeeper: purchase and
--    finance agreements when a truck is added, the bill of sale when one is sold. Insurance gets no paperwork.
--  * qbo_*: each upload is also sent to QuickBooks' Attachments (and attached to the lender's vendor when there is
--    one), for Ekaterina to attach to her entry. Nothing else is written to QuickBooks.
-- Safe to run twice.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('truck-docs', 'truck-docs', false, 52428800)
on conflict (id) do update set public = false;

create table if not exists public.truck_documents (
  id           uuid primary key default gen_random_uuid(),
  truck_id     uuid not null references public.trucks(id) on delete cascade,
  kind         text not null default 'other' check (kind in ('purchase', 'finance', 'title', 'bill_of_sale', 'other')),
  name         text not null,
  path         text not null unique,       -- in the truck-docs bucket
  size         integer,
  mime         text,
  uploaded_by  uuid references public.employees(id) on delete set null default public.my_id(),
  created_at   timestamptz not null default now(),
  qbo_attachable_id text,
  qbo_result   text,
  qbo_sent_at  timestamptz
);
create index if not exists truck_documents_truck on public.truck_documents (truck_id);
alter table public.truck_documents enable row level security;
revoke all on public.truck_documents from anon, authenticated;
drop trigger if exists log_truck_documents on public.truck_documents;
create trigger log_truck_documents after insert or delete or update on public.truck_documents for each row execute function log_change();

create or replace function public.add_truck_document(p_truck uuid, p_kind text, p_name text, p_path text, p_size integer, p_mime text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can add documents.'; end if;
  if p_path is null or p_path not like p_truck::text || '/%' then raise exception 'That file isn''t in this truck''s folder.'; end if;
  insert into truck_documents (truck_id, kind, name, path, size, mime)
  values (p_truck, coalesce(nullif(p_kind, ''), 'other'), coalesce(nullif(trim(p_name), ''), 'Document'), p_path, p_size, p_mime)
  returning id into v;
  return v;
end $$;
revoke all on function public.add_truck_document(uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.add_truck_document(uuid, text, text, text, integer, text) to authenticated;

-- Returns the storage path so the server can remove the file too
create or replace function public.delete_truck_document(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can delete documents.'; end if;
  delete from truck_documents where id = p_id returning path into p;
  return p;
end $$;
revoke all on function public.delete_truck_document(uuid) from public, anon;
grant execute on function public.delete_truck_document(uuid) to authenticated;

-- trucks_data (change 75) plus each truck's documents for C-Suite
create or replace function public.trucks_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  money boolean := can_see_finance();
  result jsonb;
begin
  if not can_see_trucks() then return null; end if;
  select jsonb_build_object(
    'trucks', (select coalesce(jsonb_agg(x order by x.office nulls last, x.truck_no), '[]') from (
        select t.id, t.truck_no, t.vin, t.year, t.make, t.model, t.office, t.driver_id, t.driver_note, t.status,
               t.plate, t.tag_month, t.county, t.insurer, t.gas_card, t.toolbox, t.key_tag, t.samsara, t.peach_pass,
               t.mileage, t.mileage_on, t.notes, t.removed_on, t.removed_reason,
               case when d.id is not null then d.first_name || ' ' || d.last_name end as driver,
               case when money then t.insurance_yearly end as insurance_yearly,
               case when money then t.bought_on end as bought_on,
               case when money then t.purchase_price end as purchase_price,
               case when money then t.value end as value,
               case when money then t.value_on end as value_on,
               case when money then t.sold_price end as sold_price,
               case when money then t.sold_to end as sold_to,
               case when money then (select coalesce(jsonb_agg(to_jsonb(l) - 'truck_id' order by l.start_on), '[]')
                                     from truck_loans l where l.truck_id = t.id) end as loans,
               case when money then (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'size', c.size,
                                       'mime', c.mime, 'created_at', c.created_at, 'qbo_attachable_id', c.qbo_attachable_id,
                                       'qbo_result', c.qbo_result) order by c.created_at), '[]')
                                     from truck_documents c where c.truck_id = t.id) end as documents,
               (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'day', g.day, 'kind', g.kind, 'text', g.text,
                          'cost', case when money or g.kind = 'maintenance' then g.cost end, 'miles', g.miles,
                          'by', b.first_name || ' ' || b.last_name, 'emailed_at', g.emailed_at, 'email_result', g.email_result)
                        order by g.day desc, g.created_at desc), '[]')
                from (select * from truck_log where truck_id = t.id order by day desc, created_at desc limit 40) g
                left join employees b on b.id = g.by_id) as log
        from trucks t left join employees d on d.id = t.driver_id) x),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name,
                 'office', e.office, 'department', e.department) order by e.first_name, e.last_name), '[]')
               from employees e where e.active),
    'settings', case when money then (select to_jsonb(s) - 'id' from fleet_settings s where id = 1) end,
    'money', money,
    'rank', my_rank()
  ) into result;
  return result;
end $$;
revoke all on function public.trucks_data() from public, anon;
grant execute on function public.trucks_data() to authenticated;

commit;

-- Check
select 'truck documents' as what,
       case when to_regclass('public.truck_documents') is not null and exists (select 1 from storage.buckets where id = 'truck-docs' and not public)
            then 'ready (private storage)' else 'missing' end as detail;
