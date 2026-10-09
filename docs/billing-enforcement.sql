-- ClassPilot billing enforcement: 14-day trial -> pay -> 4-day grace -> suspended.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The app decides "trial / active / payment due / suspended" from dates on the
-- public.subscriptions row (trial_end, current_period_end, status), so every
-- organisation needs a subscriptions row with a trial_end.
--
-- ASSUMPTIONS to verify: subscriptions has columns organization_id (UNIQUE),
-- plan, status, trial_end, created_at; organizations has created_at.

-- STEP 1: PREVIEW. Which organisations have no trial end on record, and would
-- be locked immediately after this change (trial already over)?
select o.id, o.name, o.created_at,
       s.status, s.trial_end, s.current_period_end,
       coalesce(s.trial_end, o.created_at + interval '14 days') as effective_trial_end,
       coalesce(s.trial_end, o.created_at + interval '14 days') + interval '4 days' as would_suspend_at
from public.organizations o
left join public.subscriptions s on s.organization_id = o.id
where s.organization_id is null or s.trial_end is null
order by o.created_at;

-- STEP 2: BACKFILL. Give every organisation a subscription row with a trial end.
insert into public.subscriptions (organization_id, plan, status, trial_end)
select o.id, 'free', 'trialing', o.created_at + interval '14 days'
from public.organizations o
where not exists (select 1 from public.subscriptions s where s.organization_id = o.id);

update public.subscriptions s
set trial_end = o.created_at + interval '14 days'
from public.organizations o
where s.organization_id = o.id
  and s.trial_end is null
  and s.status = 'trialing';

-- STEP 3: FUTURE ORGANISATIONS. Start the 14-day trial automatically.
create or replace function public.start_organization_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (organization_id, plan, status, trial_end)
  values (new.id, 'free', 'trialing', now() + interval '14 days')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_start_trial on public.organizations;
create trigger organizations_start_trial
after insert on public.organizations
for each row execute function public.start_organization_trial();

-- STEP 4: VERIFY. Every organisation should show a trial_end.
select o.name, s.status, s.trial_end, s.current_period_end
from public.organizations o
left join public.subscriptions s on s.organization_id = o.id
order by o.name;
