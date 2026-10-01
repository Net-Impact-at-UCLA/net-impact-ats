-- =========================================================
-- Update 010: member notes on applicants, and event attendance
-- (info sessions, case workshops). Run once in Supabase > SQL Editor.
-- =========================================================

-- ---------- Member notes: any member, visible to all members ----------
create table public.member_notes (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.member_notes enable row level security;
create policy "members read member notes" on public.member_notes
  for select to authenticated using (public.is_member());
create policy "members add own notes" on public.member_notes
  for insert to authenticated with check (member_id = public.current_member_id());
create policy "members edit own notes" on public.member_notes
  for update to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy "delete own notes or admin" on public.member_notes
  for delete to authenticated using (member_id = public.current_member_id() or public.is_admin());
create trigger member_notes_touch before update on public.member_notes
  for each row execute function public.touch_updated_at();

-- ---------- Events and attendance ----------
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles on delete cascade,
  name       text not null,
  held_on    date,
  created_at timestamptz not null default now()
);
-- Uploaded attendee lists (admins only: these contain emails)
create table public.event_attendees (
  event_id uuid not null references public.events on delete cascade,
  email    text not null default '',
  name     text,
  primary key (event_id, email, name)
);
-- Manual check-offs for anyone the spreadsheet missed
create table public.event_manual (
  event_id     uuid not null references public.events on delete cascade,
  applicant_id uuid not null references public.applicants on delete cascade,
  primary key (event_id, applicant_id)
);
alter table public.events          enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_manual    enable row level security;
create policy "members read events" on public.events for select to authenticated using (public.is_member());
create policy "admins manage events" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage attendees" on public.event_attendees for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read manual" on public.event_manual for select to authenticated using (public.is_member());
create policy "admins manage manual" on public.event_manual for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Who attended what, for every member to see (without exposing attendee emails).
-- how = 'email' | 'name' | 'manual'
create or replace function public.attendance(p_cycle uuid)
returns table (applicant_id uuid, event_id uuid, how text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_member() then raise exception 'Not on the roster'; end if;
  return query
    select distinct on (x.applicant_id, x.event_id) x.applicant_id, x.event_id, x.how
    from (
      select a.id as applicant_id, e.id as event_id, 'email'::text as how, 1 as rank
      from applicants a
      join applicant_private p on p.applicant_id = a.id
      join events e on e.cycle_id = a.cycle_id
      join event_attendees ea on ea.event_id = e.id and ea.email <> '' and ea.email = lower(trim(p.email))
      where a.cycle_id = p_cycle
      union all
      select a.id, e.id, 'name', 2
      from applicants a
      join events e on e.cycle_id = a.cycle_id
      join event_attendees ea on ea.event_id = e.id
        and ea.name is not null
        and regexp_replace(lower(trim(ea.name)), '\s+', ' ', 'g') = regexp_replace(lower(trim(a.full_name)), '\s+', ' ', 'g')
      where a.cycle_id = p_cycle
      union all
      select m.applicant_id, m.event_id, 'manual', 3
      from event_manual m join events e on e.id = m.event_id
      where e.cycle_id = p_cycle
    ) x
    order by x.applicant_id, x.event_id, x.rank;
end $$;
revoke execute on function public.attendance(uuid) from public, anon;
grant  execute on function public.attendance(uuid) to authenticated;
