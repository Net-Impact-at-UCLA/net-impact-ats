-- =========================================================
-- Update 003: conflicts of interest and hard vouches
-- Run once in Supabase > SQL Editor.
-- =========================================================

-- A member's declared conflict with an applicant (lasts the whole cycle).
create table public.conflicts (
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (applicant_id, member_id)
);

-- A member's hard vouch for an applicant, with a required reason.
create table public.vouches (
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  reason       text not null check (length(trim(reason)) between 1 and 500),
  created_at   timestamptz not null default now(),
  primary key (applicant_id, member_id)
);

alter table public.conflicts enable row level security;
alter table public.vouches   enable row level security;

-- Conflicts: you see your own, admins see all. Changes go through the functions below.
create policy "read conflicts" on public.conflicts
  for select to authenticated
  using (member_id = public.current_member_id() or public.is_admin());

-- Vouches: you manage your own; admins see everyone's (who + why).
create policy "read vouches" on public.vouches
  for select to authenticated
  using (member_id = public.current_member_id() or public.is_admin());
create policy "add own vouch" on public.vouches
  for insert to authenticated
  with check (member_id = public.current_member_id());
create policy "edit own vouch" on public.vouches
  for update to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());
create policy "withdraw own vouch" on public.vouches
  for delete to authenticated
  using (member_id = public.current_member_id());

-- Everyone can see how many vouches each applicant has, but not who gave them.
create function public.vouch_counts(p_cycle uuid)
returns table (applicant_id uuid, vouch_count bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_member() then raise exception 'Not on the roster'; end if;
  return query
    select v.applicant_id, count(*)
    from vouches v join applicants a on a.id = v.applicant_id
    where a.cycle_id = p_cycle
    group by v.applicant_id;
end $$;

-- Flag a conflict: removes you from any not-yet-closed review of this
-- applicant (with your scores and notes for it), hands each review to the
-- least-loaded reviewer in that round who isn't conflicted or already
-- assigned, and recuses any deliberation vote you'd cast.
create function public.declare_conflict(p_applicant uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me         uuid := current_member_id();
  r            record;
  v_new        uuid;
  v_reassigned int := 0;
  v_unfilled   int := 0;
begin
  if v_me is null then raise exception 'Not on the roster'; end if;

  insert into conflicts (applicant_id, member_id) values (p_applicant, v_me)
  on conflict do nothing;

  for r in
    select a.round_id
    from assignments a join rounds ro on ro.id = a.round_id
    where a.applicant_id = p_applicant and a.member_id = v_me
      and ro.phase in ('setup', 'scoring')
  loop
    delete from assignments
    where round_id = r.round_id and applicant_id = p_applicant and member_id = v_me;
    delete from scores s using criteria c
    where c.id = s.criterion_id and c.round_id = r.round_id
      and s.applicant_id = p_applicant and s.member_id = v_me;
    delete from notes
    where round_id = r.round_id and applicant_id = p_applicant and member_id = v_me;

    select pool.member_id into v_new
    from (
      select a.member_id, count(*) as load
      from assignments a join members m on m.id = a.member_id and m.is_active
      where a.round_id = r.round_id
      group by a.member_id
    ) pool
    where pool.member_id <> v_me
      and not exists (select 1 from assignments x
                      where x.round_id = r.round_id and x.applicant_id = p_applicant
                        and x.member_id = pool.member_id)
      and not exists (select 1 from conflicts c
                      where c.applicant_id = p_applicant and c.member_id = pool.member_id)
    order by pool.load, random()
    limit 1;

    if v_new is null then
      v_unfilled := v_unfilled + 1;
    else
      insert into assignments (round_id, applicant_id, member_id)
      values (r.round_id, p_applicant, v_new);
      v_reassigned := v_reassigned + 1;
    end if;
  end loop;

  update votes set stars = null, recused = true
  where applicant_id = p_applicant and member_id = v_me;

  return json_build_object('reassigned', v_reassigned, 'unfilled', v_unfilled);
end $$;

-- Remove your conflict flag. (Doesn't put you back as a reviewer.)
create function public.remove_conflict(p_applicant uuid)
returns void
language sql security definer set search_path = public as $$
  delete from conflicts where applicant_id = p_applicant and member_id = current_member_id();
$$;

-- Conflicted members can't vote on that applicant.
create or replace function public.can_vote(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
    and exists (
      select 1
      from rounds r
      join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
      where r.id = p_round and r.phase = 'voting'
    )
$$;

revoke execute on function public.vouch_counts(uuid)     from public, anon;
revoke execute on function public.declare_conflict(uuid) from public, anon;
revoke execute on function public.remove_conflict(uuid)  from public, anon;
grant  execute on function public.vouch_counts(uuid)     to authenticated;
grant  execute on function public.declare_conflict(uuid) to authenticated;
grant  execute on function public.remove_conflict(uuid)  to authenticated;
