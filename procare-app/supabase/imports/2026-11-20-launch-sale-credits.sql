-- Launch day: start paying sales into Earnings (change 70 must have run; it did on 2026-11-20 up to scheduling).
-- Adds every sale credit due since pay_settings.sale_credit_start (Nov 16, 2026) right away, then checks for new
-- ones every 30 minutes. If sales were paid outside the app after Nov 16, change the start date first:
--   update public.pay_settings set sale_credit_start = date 'YYYY-MM-DD' where id = 1;
-- Needs pg_cron on (Supabase -> Database -> Extensions). Safe to run twice.

select cron.schedule('procare-sale-credits', '*/30 * * * *', 'select public.sync_sale_credits()');

select public.sync_sale_credits();

-- Check: start date, lead sources counted as office upsells, credits by kind, scheduled jobs
select 'credit start date' as what, sale_credit_start::text as detail from public.pay_settings where id = 1
union all
select 'lead source counted as office upsell', string_agg(distinct source, ', ') from public.fr_subscriptions where source ~* 'office\s*up-?\s*sell'
union all
select 'credits so far: ' || split_part(award_key, ':', 1), count(*) || ' totaling $' || sum(amount)
from public.competition_awards where award_key ~ '^(sale|upsell|wl-referral):' group by split_part(award_key, ':', 1)
union all
select 'scheduled: ' || jobname, schedule from cron.job;
