-- =========================================================
-- Update 020: any round can let members pick who they grade on My table
-- (like Coffee Chats). Turned on for Coffee Chats and R1.
-- Run once in Supabase > SQL Editor.
-- =========================================================
alter table public.rounds add column if not exists self_select boolean not null default false;
update public.rounds set self_select = true where stage in ('coffee_chat', 'r1');

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
      where r.id = p_round and r.self_select
    )
    and grading_open(p_round, p_applicant)
$$;

create or replace function public.remove_from_table(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id();
begin
  if v_me is null then raise exception 'Not on the roster'; end if;
  if not exists (select 1 from rounds where id = p_round and self_select) or not grading_open(p_round, p_applicant) then
    raise exception 'Grading is not open for this applicant';
  end if;
  delete from scores s using criteria c
  where c.id = s.criterion_id and c.round_id = p_round and s.applicant_id = p_applicant and s.member_id = v_me;
  delete from notes where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
  delete from assignments where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
end $$;

notify pgrst, 'reload schema';
