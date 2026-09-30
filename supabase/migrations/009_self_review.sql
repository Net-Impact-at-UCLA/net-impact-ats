-- =========================================================
-- Update 009: "Review this applicant" for admins and members tagged
-- as extra reviewers. Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.members     add column if not exists extra_reviewer boolean not null default false;
alter table public.assignments add column if not exists self_added     boolean not null default false;

-- Admins and extra reviewers may add themselves as a reviewer for any active
-- applicant in a round that's set up or scoring (not coffee chats, which use
-- My table), unless they have a conflict.
create or replace function public.can_self_review(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and exists (select 1 from members m where m.id = p_member and m.is_active and (m.role = 'admin' or m.extra_reviewer))
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
    and exists (
      select 1
      from rounds r
      join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
      join applicants a on a.id = p_applicant and a.status = 'active'
      where r.id = p_round and r.stage <> 'coffee_chat' and r.phase in ('setup', 'scoring')
    )
$$;

create policy "add self as reviewer" on public.assignments
  for insert to authenticated
  with check (self_added and public.can_self_review(round_id, applicant_id, member_id));

-- Undo a self-added review: removes your assignment plus anything you entered.
-- Only works on reviews you added yourself, not ones an admin assigned.
create or replace function public.drop_self_review(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id();
begin
  if v_me is null then raise exception 'Not on the roster'; end if;
  if not exists (select 1 from assignments where round_id = p_round and applicant_id = p_applicant and member_id = v_me and self_added) then
    raise exception 'You can only remove applicants you added yourself';
  end if;
  if not exists (select 1 from rounds where id = p_round and phase in ('setup', 'scoring')) then
    raise exception 'This round is past scoring';
  end if;
  delete from scores s using criteria c
  where c.id = s.criterion_id and c.round_id = p_round and s.applicant_id = p_applicant and s.member_id = v_me;
  delete from notes where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
  delete from assignments where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
end $$;

revoke execute on function public.drop_self_review(uuid, uuid) from public, anon;
grant  execute on function public.drop_self_review(uuid, uuid) to authenticated;
