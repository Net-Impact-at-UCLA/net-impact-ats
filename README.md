# Net Impact ATS

Recruitment tracking for Net Impact at UCLA: applicant profiles, scoring, deliberation voting, and blind cutoffs.

- **Hosting:** Vercel (deploys automatically when files change in this repo)
- **Database, sign-in, files:** Supabase
- **Database setup:** `supabase/schema.sql` (already run once; don't run again on the live project)
- **Test data:** `supabase/seed-test-data.sql`

Environment variables (set in Vercel):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
