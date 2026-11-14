-- Read-only (2026-11-14): every active team member's login email, for managers. Changes nothing.
-- In Supabase, click "Export" → "Download CSV" on the result to get a spreadsheet.

select coalesce(o.name, 'No office')                                       as office,
       case e.department when 'technician' then 'Technician' when 'sales' then 'Sales' else 'Office' end as department,
       trim(regexp_replace(e.first_name || ' ' || e.last_name, '\s+', ' ', 'g')) as name,
       e.email                                                             as login_email,
       case when e.auth_user_id is null then 'No login yet' else 'Has a login' end as login
from public.employees e
left join public.offices o on o.key = e.office
where e.active
order by office, department, name;
