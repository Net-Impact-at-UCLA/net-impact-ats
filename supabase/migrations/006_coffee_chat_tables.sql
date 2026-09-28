-- =========================================================
-- Update 006: "My table" for coffee chats. Members add applicants to
-- their own table as they rotate in, grouped by rotation.
-- Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.assignments add column if not exists group_no int;
alter table public.assignments add column if not exists added_at timestamptz not null default now();

-- A member may add an applicant to their own table when: the round is a coffee
-- chat round, scoring is open, the applicant is active in it, and there's no conflict.
create or replace function public.can_self_assign(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
    and exists (
      select 1
      from rounds r
      join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
      join applicants a on a.id = p_applicant and a.status = 'active'
      where r.id = p_round and r.stage = 'coffee_chat' and r.phase = 'scoring'
    )
$$;

create policy "add to own table" on public.assignments
  for insert to authenticated
  with check (public.can_self_assign(round_id, applicant_id, member_id));

-- Undo a mis-added applicant: removes your assignment plus anything you entered for them.
create or replace function public.remove_from_table(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id();
begin
  if v_me is null then raise exception 'Not on the roster'; end if;
  if not exists (select 1 from rounds where id = p_round and stage = 'coffee_chat' and phase = 'scoring') then
    raise exception 'Coffee chat scoring is not open';
  end if;
  delete from scores s using criteria c
  where c.id = s.criterion_id and c.round_id = p_round and s.applicant_id = p_applicant and s.member_id = v_me;
  delete from notes where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
  delete from assignments where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
end $$;

revoke execute on function public.remove_from_table(uuid, uuid) from public, anon;
grant  execute on function public.remove_from_table(uuid, uuid) to authenticated;
