-- Row level security for the bonus tables (change 2026-11-16-47): bonus_settings, bonus_plans, bonus_sets,
-- bonus_members, bonus_goals, bonus_entries. can_manage_bonuses() (HR approver, C-Suite, President) runs them;
-- people on a goal set read it and log their own proof. Approved sets are locked. Every change is logged.

-- ---------- Row level security: bonuses ----------
alter table public.bonus_settings enable row level security;
alter table public.bonus_plans    enable row level security;
alter table public.bonus_sets     enable row level security;
alter table public.bonus_members  enable row level security;
alter table public.bonus_goals    enable row level security;
alter table public.bonus_entries  enable row level security;

drop policy if exists bonus_settings_read on public.bonus_settings;
create policy bonus_settings_read on public.bonus_settings for select to authenticated using (my_id() is not null);   -- the scale is needed to score anyone's bonus
drop policy if exists bonus_settings_change on public.bonus_settings;
create policy bonus_settings_change on public.bonus_settings for update to authenticated
  using (can_manage_bonuses()) with check (can_manage_bonuses());

drop policy if exists bonus_plans_read on public.bonus_plans;
create policy bonus_plans_read on public.bonus_plans for select to authenticated
  using (employee_id = my_id() or can_manage_bonuses());
drop policy if exists bonus_plans_write on public.bonus_plans;
create policy bonus_plans_write on public.bonus_plans for all to authenticated
  using (can_manage_bonuses()) with check (can_manage_bonuses());

drop policy if exists bonus_sets_read on public.bonus_sets;
create policy bonus_sets_read on public.bonus_sets for select to authenticated using (can_manage_bonuses() or is_bonus_member(id));
drop policy if exists bonus_sets_add on public.bonus_sets;
create policy bonus_sets_add on public.bonus_sets for insert to authenticated
  with check (can_manage_bonuses() and approved_at is null);
drop policy if exists bonus_sets_change on public.bonus_sets;
create policy bonus_sets_change on public.bonus_sets for update to authenticated
  using (can_manage_bonuses() and approved_at is null) with check (can_manage_bonuses() and approved_at is null);
drop policy if exists bonus_sets_remove on public.bonus_sets;
create policy bonus_sets_remove on public.bonus_sets for delete to authenticated using (can_manage_bonuses() and approved_at is null);

drop policy if exists bonus_members_read on public.bonus_members;
create policy bonus_members_read on public.bonus_members for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(set_id));
drop policy if exists bonus_members_write on public.bonus_members;
create policy bonus_members_write on public.bonus_members for all to authenticated
  using (can_manage_bonuses() and bonus_set_open(set_id)) with check (can_manage_bonuses() and bonus_set_open(set_id));

drop policy if exists bonus_goals_read on public.bonus_goals;
create policy bonus_goals_read on public.bonus_goals for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(set_id));
drop policy if exists bonus_goals_write on public.bonus_goals;
create policy bonus_goals_write on public.bonus_goals for all to authenticated
  using (can_manage_bonuses() and bonus_set_open(set_id)) with check (can_manage_bonuses() and bonus_set_open(set_id));

-- Entries: the people on the goal log their own (pending only); Ally approves with review_bonus_entry().
drop policy if exists bonus_entries_read on public.bonus_entries;
create policy bonus_entries_read on public.bonus_entries for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(bonus_goal_set(goal_id)));
drop policy if exists bonus_entries_add on public.bonus_entries;
create policy bonus_entries_add on public.bonus_entries for insert to authenticated
  with check (employee_id = my_id() and status = 'pending' and reviewed_by is null
              and is_bonus_member(bonus_goal_set(goal_id)) and bonus_set_open(bonus_goal_set(goal_id)));
drop policy if exists bonus_entries_remove on public.bonus_entries;
create policy bonus_entries_remove on public.bonus_entries for delete to authenticated
  using ((employee_id = my_id() and status = 'pending') or can_manage_bonuses());

drop trigger if exists log_bonus_settings on public.bonus_settings;
create trigger log_bonus_settings after insert or delete or update on public.bonus_settings for each row execute function log_change();
drop trigger if exists log_bonus_plans on public.bonus_plans;
create trigger log_bonus_plans after insert or delete or update on public.bonus_plans for each row execute function log_change();
drop trigger if exists log_bonus_sets on public.bonus_sets;
create trigger log_bonus_sets after insert or delete or update on public.bonus_sets for each row execute function log_change();
drop trigger if exists log_bonus_members on public.bonus_members;
create trigger log_bonus_members after insert or delete or update on public.bonus_members for each row execute function log_change();
drop trigger if exists log_bonus_goals on public.bonus_goals;
create trigger log_bonus_goals after insert or delete or update on public.bonus_goals for each row execute function log_change();
drop trigger if exists log_bonus_entries on public.bonus_entries;
create trigger log_bonus_entries after insert or delete or update on public.bonus_entries for each row execute function log_change();
