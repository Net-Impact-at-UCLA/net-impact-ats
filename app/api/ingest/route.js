import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeApplicant, filePath, safeEqual } from '@/lib/ingest';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fail(status, error) {
  return NextResponse.json({ ok: false, error }, { status });
}

// Receives applications from the Google Form script.
// Three kinds of request, all protected by the shared secret:
//   { kind: 'applicant', email, full_name, ... }       -> creates or updates, returns applicant_id
//   { kind: 'file', applicant_id, field, mime, data }  -> stores headshot or resume (base64)
//   { kind: 'issues', applicant_id, issues: [...] }    -> admin-only note about import problems
export async function POST(request) {
  const expected = process.env.INGEST_SECRET;
  if (!expected) return fail(500, 'INGEST_SECRET is not set in Vercel');
  if (!safeEqual(request.headers.get('x-ingest-secret') || '', expected)) return fail(401, 'Wrong secret');

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Body must be JSON');
  }

  const db = createAdminClient();
  const { data: cycle } = await db.from('cycles').select('id, name').eq('is_active', true).maybeSingle();
  if (!cycle) return fail(409, 'No active recruitment cycle in the ATS');

  if (body.kind === 'applicant') {
    const a = normalizeApplicant(body);
    if (!a.email) return fail(400, 'Missing email');
    if (!a.public.full_name) return fail(400, 'Missing full name');

    // Same email in the same cycle = resubmission: update instead of duplicating
    const { data: existing } = await db
      .from('applicant_private')
      .select('applicant_id, applicants!inner(cycle_id)')
      .eq('email', a.email)
      .eq('applicants.cycle_id', cycle.id)
      .maybeSingle();

    if (existing) {
      const id = existing.applicant_id;
      const [u1, u2] = await Promise.all([
        db.from('applicants').update(a.public).eq('id', id),
        db.from('applicant_private').update(a.private).eq('applicant_id', id),
      ]);
      if (u1.error || u2.error) return fail(500, (u1.error || u2.error).message);
      return NextResponse.json({ ok: true, applicant_id: id, created: false, cycle: cycle.name });
    }

    const { data: created, error } = await db
      .from('applicants')
      .insert({ ...a.public, cycle_id: cycle.id })
      .select('id')
      .single();
    if (error) return fail(500, error.message);
    const { error: pErr } = await db.from('applicant_private').insert({ ...a.private, applicant_id: created.id });
    if (pErr) return fail(500, pErr.message);
    return NextResponse.json({ ok: true, applicant_id: created.id, created: true, cycle: cycle.name });
  }

  // Everything below targets an existing applicant in the active cycle
  const { data: applicant } = await db
    .from('applicants')
    .select('id, cycle_id')
    .eq('id', body.applicant_id || '00000000-0000-0000-0000-000000000000')
    .eq('cycle_id', cycle.id)
    .maybeSingle();
  if (!applicant) return fail(404, 'Applicant not found in the active cycle');

  if (body.kind === 'file') {
    const field = body.field;
    if (field !== 'headshot' && field !== 'resume') return fail(400, 'field must be headshot or resume');
    const mime = String(body.mime || '');
    if (field === 'headshot' && !IMAGE_TYPES.includes(mime)) return fail(415, 'Headshot must be an image');
    const bytes = Buffer.from(String(body.data || ''), 'base64');
    if (bytes.length === 0) return fail(400, 'Empty file');
    if (bytes.length > MAX_FILE_BYTES) return fail(413, 'File too large');

    const path = filePath(cycle.id, applicant.id, field, mime);
    const { error: upErr } = await db.storage
      .from('applicant-files')
      .upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
    if (upErr) return fail(500, upErr.message);

    const column = field === 'headshot' ? 'headshot_path' : 'resume_path';
    const { error } = await db.from('applicants').update({ [column]: path }).eq('id', applicant.id);
    if (error) return fail(500, error.message);
    return NextResponse.json({ ok: true, path });
  }

  if (body.kind === 'issues') {
    const issues = Array.isArray(body.issues) ? body.issues.filter(Boolean).map(String) : [];
    const { error } = await db
      .from('applicant_private')
      .update({ import_issues: issues.length ? issues.join('\n') : null })
      .eq('applicant_id', applicant.id);
    if (error) return fail(500, error.message);
    return NextResponse.json({ ok: true });
  }

  return fail(400, 'Unknown kind');
}
