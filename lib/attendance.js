import ExcelJS from 'exceljs';

// Minimal CSV parser (handles quoted fields, commas and newlines inside quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

async function readRows(buffer, filename) {
  if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = [];
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        let v = cell.value;
        if (v && typeof v === 'object') v = v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : '') ?? '';
        vals[col - 1] = v == null ? '' : String(v);
      });
      rows.push(Array.from(vals, (v) => v ?? ''));
    });
    return rows;
  }
  return parseCsv(new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, ''));
}

// Finds the email and name columns in a sign-in sheet and returns [{ email, name }].
export async function extractAttendees(buffer, filename) {
  const rows = await readRows(buffer, filename);
  if (rows.length < 2) return { attendees: [], error: 'The file looks empty. It needs a header row and at least one attendee.' };

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const find = (test) => header.findIndex(test);
  const emailCol = find((h) => h.includes('email'));
  const fullNameCol = find((h) => (h.includes('full name') || h === 'name' || h.includes('your name') || h.includes('name (first and last)')));
  const firstCol = find((h) => h.includes('first'));
  const lastCol = find((h) => h.includes('last'));
  const anyNameCol = find((h) => h.includes('name') && !h.includes('user'));

  if (emailCol === -1 && fullNameCol === -1 && anyNameCol === -1 && (firstCol === -1 || lastCol === -1)) {
    return { attendees: [], error: 'Couldn’t find an email or name column. Make sure the first row has headers like “Email” and “Name”.' };
  }

  const seen = new Set();
  const attendees = [];
  for (const r of rows.slice(1)) {
    const email = emailCol >= 0 ? String(r[emailCol] || '').trim().toLowerCase() : '';
    let name = '';
    if (fullNameCol >= 0) name = String(r[fullNameCol] || '').trim();
    else if (firstCol >= 0 && lastCol >= 0 && firstCol !== lastCol) name = `${String(r[firstCol] || '').trim()} ${String(r[lastCol] || '').trim()}`.trim();
    else if (anyNameCol >= 0) name = String(r[anyNameCol] || '').trim();
    if (!email && !name) continue;
    const key = `${email}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attendees.push({ email: email.includes('@') ? email : '', name: name || null });
  }
  return { attendees, emailCol: emailCol >= 0 ? rows[0][emailCol] : null, nameCol: fullNameCol >= 0 ? rows[0][fullNameCol] : firstCol >= 0 && lastCol >= 0 ? `${rows[0][firstCol]} + ${rows[0][lastCol]}` : anyNameCol >= 0 ? rows[0][anyNameCol] : null };
}
