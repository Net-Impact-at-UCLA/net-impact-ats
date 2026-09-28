/**
 * Net Impact ATS: Google Form -> ATS importer
 *
 * Setup (once):
 *   1. Paste this whole file into the form's Apps Script editor.
 *   2. Put the shared secret from Vercel (INGEST_SECRET) in INGEST_SECRET below.
 *   3. Run `setup` once and approve the permissions. That turns on automatic import.
 *   4. Run `importAllResponses` once to bring in everyone who already applied.
 *      (If it stops early because of Google's 6-minute limit, just run it again;
 *       it picks up where it left off.)
 */

const ATS_URL = 'https://net-impact-ats.vercel.app';
const INGEST_SECRET = 'PASTE_THE_SECRET_HERE';

// Each ATS field is matched to the form question whose title STARTS WITH this text
// (not case-sensitive). If you reword a question, update the matching line here.
const QUESTIONS = {
  full_name:      'Full Name',
  phone:          'Phone Number',
  headshot:       'Headshot',
  majors:         'Major(s)',
  gpa:            'Cumulative GPA',
  grad_year:      'Expected Graduation Year',
  is_transfer:    'Are you a transfer student',
  pronouns:       'Pronouns',
  linkedin_url:   'LinkedIn profile URL',
  resume:         'Upload your resume',
  why_net_impact: 'Why Net Impact',
  social_issue:   'Describe a social or environmental issue',
  fun_fact:       'What is an interesting fact',
  extenuating:    'If there are any extenuating circumstances',
};

const MAX_FILE_BYTES = 3.5 * 1024 * 1024;

/** Run once: turns on automatic import for every new submission. */
function setup() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'handleSubmit')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('handleSubmit').forForm(form).onFormSubmit().create();
  checkQuestions();
  Logger.log('Automatic import is on. New submissions will appear in the ATS within seconds.');
}

/** Runs automatically on each new submission. */
function handleSubmit(e) {
  sendResponse(e.response, true);
}

/** Run once to import everyone who applied before setup. Safe to re-run. */
function importAllResponses() {
  const started = Date.now();
  const props = PropertiesService.getScriptProperties();
  const responses = FormApp.getActiveForm().getResponses();
  let i = Number(props.getProperty('importIndex') || 0);
  let ok = 0, failed = 0;

  for (; i < responses.length; i++) {
    if (Date.now() - started > 5 * 60 * 1000) {
      props.setProperty('importIndex', String(i));
      Logger.log(`Paused at ${i} of ${responses.length} (Google's time limit). Run importAllResponses again to continue.`);
      return;
    }
    try { sendResponse(responses[i], false); ok++; }
    catch (err) { failed++; Logger.log(`Response ${i + 1} failed: ${err.message}`); }
  }
  props.deleteProperty('importIndex');
  Logger.log(`Done. Imported ${ok} response(s)${failed ? `, ${failed} failed (see messages above)` : ''}.`);
}

/** Lists which form question each ATS field matched, so you can spot mismatches. */
function checkQuestions() {
  const titles = FormApp.getActiveForm().getItems().map((it) => it.getTitle());
  Object.entries(QUESTIONS).forEach(([field, prefix]) => {
    const hit = titles.find((t) => matches(t, prefix));
    Logger.log(`${hit ? 'OK     ' : 'MISSING'} ${field} <- ${hit || `(no question starting with "${prefix}")`}`);
  });
}

// ---------- internals ----------

function matches(title, prefix) {
  return String(title).trim().toLowerCase().startsWith(prefix.toLowerCase());
}

function sendResponse(response, justSubmitted) {
  const answers = {};
  const files = {};
  response.getItemResponses().forEach((ir) => {
    const title = ir.getItem().getTitle();
    const field = Object.keys(QUESTIONS).find((f) => matches(title, QUESTIONS[f]));
    if (!field) return;
    const value = ir.getResponse();
    if (field === 'headshot' || field === 'resume') files[field] = Array.isArray(value) ? value[0] : value;
    else answers[field] = Array.isArray(value) ? value.join(', ') : value;
  });

  const payload = Object.assign({ kind: 'applicant' }, answers, {
    email: response.getRespondentEmail(),
    submitted_at: response.getTimestamp().toISOString(),
  });
  const result = post(payload);
  const applicantId = result.applicant_id;
  const issues = [];

  if (files.headshot) {
    const img = headshotImage(files.headshot, justSubmitted);
    if (img.error) issues.push(`Headshot: ${img.error}`);
    else {
      const r = post({ kind: 'file', applicant_id: applicantId, field: 'headshot', mime: img.mime, data: img.data }, true);
      if (!r.ok) issues.push(`Headshot: ${r.error}`);
    }
  } else issues.push('Headshot: none uploaded');

  if (files.resume) {
    try {
      const blob = DriveApp.getFileById(files.resume).getBlob();
      const bytes = blob.getBytes();
      if (bytes.length > MAX_FILE_BYTES) issues.push(`Resume: file is ${(bytes.length / 1048576).toFixed(1)} MB, over the 3.5 MB limit`);
      else {
        const mime = blob.getContentType();
        if (mime !== 'application/pdf') issues.push(`Resume: uploaded as ${mime}, not a PDF`);
        const r = post({ kind: 'file', applicant_id: applicantId, field: 'resume', mime, data: Utilities.base64Encode(bytes) }, true);
        if (!r.ok) issues.push(`Resume: ${r.error}`);
      }
    } catch (err) {
      issues.push(`Resume: couldn't read the file (${err.message})`);
    }
  } else issues.push('Resume: none uploaded');

  post({ kind: 'issues', applicant_id: applicantId, issues: issues });
  Logger.log(`${result.created ? 'Added' : 'Updated'} ${answers.full_name} in ${result.cycle}${issues.length ? ` (${issues.join('; ')})` : ''}`);
}

// Asks Drive for an ~800px version: small, sharp, and converts iPhone HEIC to a normal image.
function headshotImage(fileId, justSubmitted) {
  const token = ScriptApp.getOAuthToken();
  const tries = justSubmitted ? 4 : 1;
  for (let t = 0; t < tries; t++) {
    const meta = JSON.parse(UrlFetchApp.fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,thumbnailLink,size`,
      { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true }
    ).getContentText());
    if (meta.error) return { error: `couldn't read the file (${meta.error.message})` };
    if (!String(meta.mimeType).startsWith('image/')) return { error: `uploaded file is ${meta.mimeType}, not an image` };
    if (meta.thumbnailLink) {
      const res = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+$/, '=s800'),
        { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        const blob = res.getBlob();
        return { mime: blob.getContentType() || 'image/jpeg', data: Utilities.base64Encode(blob.getBytes()) };
      }
    }
    Utilities.sleep(5000); // Drive may still be generating the preview for a brand-new upload
  }
  // Fall back to the original if it's a normal, reasonably small image
  const blob = DriveApp.getFileById(fileId).getBlob();
  const mime = blob.getContentType();
  const bytes = blob.getBytes();
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(mime) === -1) return { error: `couldn't convert ${mime} to a standard image` };
  if (bytes.length > MAX_FILE_BYTES) return { error: 'photo too large to copy' };
  return { mime: mime, data: Utilities.base64Encode(bytes) };
}

function post(payload, allowFailure) {
  const res = UrlFetchApp.fetch(`${ATS_URL}/api/ingest`, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': INGEST_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = { ok: false, error: `HTTP ${res.getResponseCode()}` }; }
  if (!body.ok && !allowFailure) throw new Error(body.error || `HTTP ${res.getResponseCode()}`);
  return body;
}
