import ExcelJS from 'exceljs';

// Builds the results workbook from plain data (kept separate from the database
// code so it can be tested on its own).
export async function buildWorkbook(d) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Net Impact ATS';
  wb.created = new Date();

  const nameOf = Object.fromEntries(d.members.map((m) => [m.id, m.full_name || m.email]));
  const appOf = Object.fromEntries(d.applicants.map((a) => [a.id, a]));
  const roundOf = Object.fromEntries(d.rounds.map((r) => [r.id, r]));
  const critOf = Object.fromEntries(d.criteria.map((c) => [c.id, c]));
  const num = (v) => (v == null ? null : Number(v));
  const avg = (vals) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null);
  const date = (v) => (v ? new Date(v) : null);

  function sheet(name, columns, rows) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5E4A' } };
    rows.forEach((r) => ws.addRow(r));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  }

  // ---------- Summary ----------
  const inRound = new Map(); // `${roundId}|${applicantId}` -> round_applicants row
  d.roundApplicants.forEach((ra) => inRound.set(`${ra.round_id}|${ra.applicant_id}`, ra));
  const vouchCount = {};
  d.vouches.forEach((v) => (vouchCount[v.applicant_id] = (vouchCount[v.applicant_id] || 0) + 1));

  const summaryCols = [
    ['Name', 'name', 24], ['Status', 'status', 12], ['Furthest round', 'furthest', 20],
    ['Major(s)', 'majors', 30], ['GPA', 'gpa', 8], ['Grad year', 'grad', 10], ['Transfer', 'transfer', 10],
    ['Hard vouches', 'vouches', 12],
  ];
  d.rounds.forEach((r) => {
    summaryCols.push(
      [`${r.name}: reviewer avg`, `rev_${r.id}`, 14],
      [`${r.name}: vote avg`, `vote_${r.id}`, 12],
      [`${r.name}: votes`, `votes_${r.id}`, 10],
      [`${r.name}: result`, `res_${r.id}`, 14],
    );
  });
  const summaryRows = d.applicants
    .map((a) => {
      const row = {
        name: a.full_name, status: a.status, majors: a.majors, gpa: a.gpa, grad: a.grad_year,
        transfer: a.is_transfer == null ? null : a.is_transfer ? 'Yes' : 'No', vouches: vouchCount[a.id] || 0,
      };
      let furthest = null;
      d.rounds.forEach((r) => {
        const ra = inRound.get(`${r.id}|${a.id}`);
        if (!ra) return;
        furthest = r.name;
        const scores = d.scores.filter((s) => s.applicant_id === a.id && critOf[s.criterion_id]?.round_id === r.id).map((s) => num(s.score));
        const votes = d.votes.filter((v) => v.applicant_id === a.id && v.round_id === r.id && !v.recused).map((v) => num(v.stars));
        row[`rev_${r.id}`] = avg(scores);
        row[`vote_${r.id}`] = avg(votes);
        row[`votes_${r.id}`] = votes.length;
        row[`res_${r.id}`] = ra.advanced == null ? (r.phase === 'released' ? 'Not advanced' : 'In progress') : ra.advanced ? 'Advanced' : 'Not advanced';
      });
      row.furthest = furthest;
      return row;
    })
    .sort((x, y) => x.name.localeCompare(y.name));
  const summary = sheet('Summary', summaryCols, summaryRows);
  summary.getColumn('name').font = { bold: true };

  // ---------- Advancing (who moves on from the most recently released round) ----------
  const released = [...d.rounds].filter((r) => r.phase === 'released').sort((a, b) => b.sort_order - a.sort_order)[0];
  const nextRound = released ? [...d.rounds].sort((a, b) => a.sort_order - b.sort_order).find((r) => r.sort_order > released.sort_order) : null;
  const advancing = released
    ? d.applicants
        .filter((a) => inRound.get(`${released.id}|${a.id}`)?.advanced)
        .map((a) => {
          const p = d.privates.find((x) => x.applicant_id === a.id) || {};
          const votes = d.votes.filter((v) => v.applicant_id === a.id && v.round_id === released.id && !v.recused).map((v) => num(v.stars));
          return { name: a.full_name, email: p.email, phone: p.phone, pronouns: a.pronouns, majors: a.majors, grad: a.grad_year, vote: avg(votes) };
        })
        .sort((x, y) => x.name.localeCompare(y.name))
    : [];
  const adv = wb.addWorksheet('Advancing', { views: [{ state: 'frozen', ySplit: 3 }] });
  adv.properties.tabColor = { argb: 'FFA33A2C' };
  adv.getCell('A1').value = released
    ? `${advancing.length} advancing from ${released.name}${nextRound ? ` to ${nextRound.name}` : ' (accepted)'}` +
      (released.cutoff != null ? `, cutoff ${Number(released.cutoff).toFixed(2)}` : '')
    : 'No round has been released yet. This tab fills in once a cutoff is applied.';
  adv.getCell('A1').font = { bold: true, size: 14 };
  adv.getCell('A2').value = 'Contains contact info: keep within the exec board.';
  adv.getCell('A2').font = { italic: true, color: { argb: 'FFA33A2C' } };
  const advCols = [['Name', 'name', 24], ['Email', 'email', 30], ['Phone', 'phone', 16], ['Pronouns', 'pronouns', 12], ['Major(s)', 'majors', 30], ['Grad year', 'grad', 10], ['Vote avg', 'vote', 10]];
  adv.columns = advCols.map(([, key, width]) => ({ key, width }));
  const hdr = adv.getRow(3);
  advCols.forEach(([h], i) => (hdr.getCell(i + 1).value = h));
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA33A2C' } };
  advancing.forEach((r) => adv.addRow(r));

  // ---------- Detail tabs ----------
  const byRoundThenName = (a, b) =>
    (roundOf[a.round]?.sort_order ?? 0) - (roundOf[b.round]?.sort_order ?? 0) || String(a.applicant).localeCompare(String(b.applicant));

  sheet('Scores', [['Applicant', 'applicant', 24], ['Round', 'roundName', 18], ['Criterion', 'criterion', 20], ['Reviewer', 'reviewer', 20], ['Score', 'score', 8], ['Updated', 'updated', 20]],
    d.scores.map((s) => ({
      applicant: appOf[s.applicant_id]?.full_name, round: critOf[s.criterion_id]?.round_id, roundName: roundOf[critOf[s.criterion_id]?.round_id]?.name,
      criterion: critOf[s.criterion_id]?.name, reviewer: nameOf[s.member_id], score: num(s.score), updated: date(s.updated_at),
    })).sort(byRoundThenName));

  sheet('Notes', [['Applicant', 'applicant', 24], ['Round', 'roundName', 18], ['About', 'about', 18], ['Author', 'author', 20], ['Note', 'body', 80], ['Updated', 'updated', 20]],
    d.notes.map((n) => ({
      applicant: appOf[n.applicant_id]?.full_name, round: n.round_id, roundName: roundOf[n.round_id]?.name,
      about: n.criterion_id ? critOf[n.criterion_id]?.name : 'Overall', author: nameOf[n.member_id], body: n.body, updated: date(n.updated_at),
    })).sort(byRoundThenName)).getColumn('body').alignment = { wrapText: true, vertical: 'top' };

  sheet('Votes', [['Applicant', 'applicant', 24], ['Round', 'roundName', 18], ['Member', 'member', 20], ['Stars', 'stars', 8], ['Recused', 'recused', 10], ['Updated', 'updated', 20]],
    d.votes.map((v) => ({
      applicant: appOf[v.applicant_id]?.full_name, round: v.round_id, roundName: roundOf[v.round_id]?.name, member: nameOf[v.member_id],
      stars: num(v.stars), recused: v.recused ? 'Yes' : 'No', updated: date(v.updated_at),
    })).sort(byRoundThenName));

  sheet('Vouches', [['Applicant', 'applicant', 24], ['Vouched by', 'member', 20], ['Reason', 'reason', 70], ['When', 'when', 20]],
    d.vouches.map((v) => ({ applicant: appOf[v.applicant_id]?.full_name, member: nameOf[v.member_id], reason: v.reason, when: date(v.created_at) }))
      .sort((a, b) => String(a.applicant).localeCompare(String(b.applicant)))).getColumn('reason').alignment = { wrapText: true, vertical: 'top' };

  sheet('Conflicts', [['Applicant', 'applicant', 24], ['Member', 'member', 20], ['When', 'when', 20]],
    d.conflicts.map((c) => ({ applicant: appOf[c.applicant_id]?.full_name, member: nameOf[c.member_id], when: date(c.created_at) }))
      .sort((a, b) => String(a.applicant).localeCompare(String(b.applicant))));

  const answers = sheet('Answers', [['Applicant', 'name', 24], ['Pronouns', 'pronouns', 12], ['LinkedIn / website', 'linkedin', 30], ['Why Net Impact?', 'why', 70], ['Social or environmental issue', 'issue', 70], ['Interesting fact', 'fact', 40]],
    [...d.applicants].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((a) => ({
      name: a.full_name, pronouns: a.pronouns, linkedin: a.linkedin_url, why: a.why_net_impact, issue: a.social_issue, fact: a.fun_fact,
    })));
  ['why', 'issue', 'fact'].forEach((k) => (answers.getColumn(k).alignment = { wrapText: true, vertical: 'top' }));

  const priv = sheet('Private', [['Applicant', 'name', 24], ['Email', 'email', 30], ['Phone', 'phone', 16], ['Submitted', 'submitted', 20], ['Extenuating circumstances', 'ext', 60], ['Import problems', 'issues', 40]],
    [...d.applicants].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((a) => {
      const p = d.privates.find((x) => x.applicant_id === a.id) || {};
      return { name: a.full_name, email: p.email, phone: p.phone, submitted: date(p.submitted_at), ext: p.extenuating_circumstances, issues: p.import_issues };
    }));
  priv.getColumn('ext').alignment = { wrapText: true, vertical: 'top' };
  priv.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA33A2C' } };
  priv.properties.tabColor = { argb: 'FFA33A2C' };

  // Friendly date format everywhere
  wb.eachSheet((ws) => ws.eachRow((row, i) => { if (i > 1) row.eachCell((c) => { if (c.value instanceof Date) c.numFmt = 'mmm d, yyyy h:mm AM/PM'; }); }));

  return wb.xlsx.writeBuffer();
}
