create table if not exists public.tracker_entries (
  app_id text not null,
  profile text not null check (profile in ('shaun', 'jemma')),
  entry_date date not null,
  weight numeric null,
  steps8k boolean not null default false,
  low_upf boolean not null default false,
  exercise boolean not null default false,
  beers integer not null default 0,
  note text not null default '',
  updated_at timestamptz not null default now(),
  constraint tracker_entries_pk primary key (app_id, profile, entry_date)
);

alter table public.tracker_entries enable row level security;

-- Public read/write for this single non-sensitive app namespace.
-- If you want stronger protection, add auth and tighten these policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tracker_entries'
      and policyname = 'tracker_entries_select_policy'
  ) then
    create policy tracker_entries_select_policy
      on public.tracker_entries
      for select
      to anon
      using (app_id = 'shaun-jemma-tracker');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tracker_entries'
      and policyname = 'tracker_entries_insert_policy'
  ) then
    create policy tracker_entries_insert_policy
      on public.tracker_entries
      for insert
      to anon
      with check (app_id = 'shaun-jemma-tracker');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tracker_entries'
      and policyname = 'tracker_entries_update_policy'
  ) then
    create policy tracker_entries_update_policy
      on public.tracker_entries
      for update
      to anon
      using (app_id = 'shaun-jemma-tracker')
      with check (app_id = 'shaun-jemma-tracker');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tracker_entries'
      and policyname = 'tracker_entries_delete_policy'
  ) then
    create policy tracker_entries_delete_policy
      on public.tracker_entries
      for delete
      to anon
      using (app_id = 'shaun-jemma-tracker');
  end if;
end
$$;

create index if not exists tracker_entries_app_date_idx
  on public.tracker_entries (app_id, entry_date);
