-- Read-only: which techs are scored by Samsara driver, and which still fall back to their truck? (2026-11-13)
-- Changes nothing. Run any time after Procare Sync's 7 AM or 1 PM truck/driver refresh.

select e.first_name || ' ' || e.last_name                         as tech,
       case when tv.driver_id is not null then 'driver' when tv.vehicle_id is not null then 'truck' else 'none' end as scored_by,
       coalesce(tv.driver_name, '-')                              as samsara_driver,
       tv.driver_set_by                                           as driver_link,
       coalesce(tv.vehicle_name, '-')                             as truck,
       (select s.score from public.tech_safety_scores s
         where s.employee_id = tv.employee_id and s.window_key = 'thisMonth:cur') as this_month_score
from public.tech_vehicles tv
join public.employees e on e.id = tv.employee_id
where e.active
order by scored_by, tech;
