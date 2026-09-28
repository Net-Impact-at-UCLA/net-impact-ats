// Pure helpers for the Google Form import (kept separate so they can be tested).

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export function normalizeApplicant(body) {
  const email = clean(body.email)?.toLowerCase() || null;
  const transfer = clean(body.is_transfer)?.toLowerCase();
  let submittedAt = null;
  if (body.submitted_at) {
    const d = new Date(body.submitted_at);
    if (!Number.isNaN(d.getTime())) submittedAt = d.toISOString();
  }
  return {
    email,
    public: {
      full_name: clean(body.full_name),
      pronouns: clean(body.pronouns),
      majors: clean(body.majors),
      gpa: clean(body.gpa),
      grad_year: clean(body.grad_year),
      is_transfer: transfer == null ? null : transfer.startsWith('y'),
      linkedin_url: clean(body.linkedin_url),
      why_net_impact: clean(body.why_net_impact),
      social_issue: clean(body.social_issue),
      fun_fact: clean(body.fun_fact),
    },
    private: {
      email,
      phone: clean(body.phone),
      submitted_at: submittedAt,
      extenuating_circumstances: clean(body.extenuating),
    },
  };
}

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export function filePath(cycleId, applicantId, field, mime) {
  const ext = EXT[mime] || 'bin';
  return `${cycleId}/${applicantId}/${field}.${ext}`;
}

// Constant-time string comparison for the shared secret
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
