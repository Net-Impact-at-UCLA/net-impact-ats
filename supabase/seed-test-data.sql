-- =========================================================
-- TEST DATA: creates a "Test Cycle" with 6 fake applicants.
-- Run in Supabase > SQL Editor after schema.sql.
-- Remove it later with: delete from cycles where name = 'Test Cycle';
-- =========================================================

-- Act as the first admin so the admin-only functions allow this.
select set_config('request.jwt.claims',
  (select json_build_object('email', email)::text from members where role = 'admin' order by created_at limit 1),
  false);

select public.create_cycle('Test Cycle');
update public.cycles set is_active = (name = 'Test Cycle');

with c as (select id from public.cycles where name = 'Test Cycle')
insert into public.applicants
  (cycle_id, full_name, pronouns, majors, gpa, grad_year, is_transfer, linkedin_url, why_net_impact, social_issue, fun_fact)
select c.id, v.* from c, (values
  ('Maya Chen', 'she/her', 'Economics, minor in Environmental Systems', '3.82', '2029', false, 'linkedin.com/in/example-maya',
   'I want to use consulting skills to help mission-driven organizations scale. Net Impact is the one club at UCLA that treats impact and business rigor as the same goal.',
   'Food waste in university dining. I started a pilot with two dining halls to track and donate surplus meals, and I want to learn how to make that model sustainable.',
   'I have visited every national park in California.'),
  ('Jordan Alvarez', 'he/him', 'Business Economics', '3.65', '2028', true, null,
   'After transferring from Santa Monica College, I have been looking for a community that pairs professional growth with purpose.',
   'Housing affordability for students. I volunteer with a local tenant rights clinic.',
   'I can solve a Rubik''s cube in under a minute.'),
  ('Priya Nair', 'she/they', 'Cognitive Science, minor in Data Science Engineering', '3.91', '2029', false, 'linkedin.com/in/example-priya',
   'Net Impact''s pro bono projects are exactly the kind of hands-on work I want before recruiting season.',
   'Mental health access for first-generation students. I co-lead a peer support group on campus.',
   'I learned to play the sitar during quarantine.'),
  ('Sam Okafor', 'he/him', 'Political Science', '3.40', '2027', false, null,
   'I am interested in how nonprofits and companies can partner on climate goals.',
   'Urban heat islands in South LA. I mapped tree canopy coverage for a class project and presented it to a city council aide.',
   'I have run two marathons.'),
  ('Elena Petrova', 'she/her', 'Mathematics of Computation', '3.77', '2028', false, 'linkedin.com/in/example-elena',
   'I want to apply quantitative skills to problems that matter.',
   'Clean water access. I spent a summer with an NGO measuring well water quality.',
   'I speak four languages.'),
  ('Theo Park', 'they/them', 'Environmental Science', '3.58', '2029', true, null,
   'Net Impact bridges my science background and my interest in business strategy.',
   'Plastic pollution on LA beaches. I organize monthly cleanups.',
   'I keep a sourdough starter named Gerald.')
) as v(full_name, pronouns, majors, gpa, grad_year, is_transfer, linkedin_url, why_net_impact, social_issue, fun_fact);

insert into public.applicant_private (applicant_id, email, phone, submitted_at, extenuating_circumstances)
select a.id,
       lower(replace(a.full_name, ' ', '.')) || '@example.com',
       '555-0100',
       now() - interval '3 days',
       case when a.full_name = 'Jordan Alvarez' then 'Test note: this should only be visible to admins.' end
from public.applicants a join public.cycles c on c.id = a.cycle_id
where c.name = 'Test Cycle';
