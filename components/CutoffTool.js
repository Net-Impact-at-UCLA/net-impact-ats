'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { applyCutoff } from '@/app/admin/actions';

// Cut line tool. Everyone sees anonymous bars (highest first) and the count.
// Admins (named != null) also see who is above/below the line and can push people through.
// values: [{ avg, votes, byVouch }]   named: [{ id, name, avg, count, pushed }] | null
// mode: 'votes' (average deliberation vote) | 'scores' (average review score)
export default function CutoffTool({ roundId, roundName, nextRoundName, values, named = null, mode = 'votes', canApply }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pushedIds, setPushedIds] = useState(() => new Set((named || []).filter((n) => n.pushed).map((n) => n.id)));
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (named) setPushedIds(new Set(named.filter((n) => n.pushed).map((n) => n.id)));
  }, [named]);

  // Work from the named list when available (admins), otherwise the anonymous values
  const items = named
    ? named.map((n) => ({ ...n, pushed: pushedIds.has(n.id) }))
    : values.map((v, i) => ({ id: String(i), avg: v.avg, count: v.votes, pushed: v.byVouch }));

  const scoredAvgs = items.filter((v) => v.avg != null && !v.pushed).map((v) => Number(v.avg));
  const [cutoff, setCutoff] = useState(() => {
    if (!scoredAvgs.length) return 3;
    const sorted = [...scoredAvgs].sort((a, b) => b - a);
    return Math.round(sorted[Math.floor(sorted.length / 2)] * 20) / 20;
  });

  const isAbove = (v) => v.avg != null && Number(v.avg) >= cutoff - 1e-9;
  const pushedCount = items.filter((v) => v.pushed).length;
  const atCutoff = items.filter((v) => !v.pushed && isAbove(v)).length;
  const advancing = atCutoff + pushedCount;
  const unscored = items.filter((v) => v.avg == null && !v.pushed).length;
  const pctOf = (v) => `${(v / 5) * 100}%`;
  const bars = [...items].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const what = mode === 'scores' ? 'average review score' : 'average vote';
  const pushedLabel = mode === 'scores' ? 'pushed through' : 'by hard vouch';

  async function togglePush(n) {
    const next = !pushedIds.has(n.id);
    setBusyId(n.id);
    setErr(null);
    const { error } = await supabase.rpc('set_advance_override', { p_round: roundId, p_applicant: n.id, p_on: next });
    setBusyId(null);
    if (error) return setErr(`Couldn’t update ${n.name}: ${error.message}`);
    setPushedIds((s) => {
      const c = new Set(s);
      next ? c.add(n.id) : c.delete(n.id);
      return c;
    });
    router.refresh();
  }

  const above = named ? bars.filter((v) => v.pushed || isAbove(v)) : [];
  const below = named ? bars.filter((v) => !v.pushed && !isAbove(v)) : [];

  return (
    <section className="cutoff">
      <div className="cutoff-summary" aria-live="polite">
        <span className="cutoff-big">{advancing}</span>
        <span>
          of {items.length} applicants would advance{nextRoundName ? ` to ${nextRoundName}` : ''}: {atCutoff} at a cut line of{' '}
          <strong>{cutoff.toFixed(2)}</strong>
          {pushedCount > 0 && (
            <>
              {' '}plus <strong className="vouch-text">{pushedCount} {pushedLabel}</strong>
            </>
          )}
          {items.length ? ` (${Math.round((advancing / items.length) * 100)}%)` : ''}
        </span>
      </div>

      <div className="cutoff-chart" role="img" aria-label={`Each applicant's ${what}, highest first. Cut line at ${cutoff.toFixed(2)}.`}>
        <div className="cutoff-yaxis" aria-hidden="true">
          {[5, 4, 3, 2, 1, 0].map((t) => (
            <span key={t} style={{ bottom: pctOf(t) }}>{t}</span>
          ))}
        </div>
        <div className="cutoff-plot">
          {bars.map((b) => (
            <span
              key={b.id}
              className={`cutoff-bar ${b.pushed ? 'cutoff-vouch' : b.avg == null ? 'cutoff-none' : isAbove(b) ? 'cutoff-in' : 'cutoff-out'}`}
              style={{ height: b.avg == null ? (b.pushed ? '6px' : '2px') : pctOf(Number(b.avg)) }}
              title={`${named ? `${b.name}: ` : ''}${b.avg == null ? 'no scores' : Number(b.avg).toFixed(2)}${b.pushed ? `, ${pushedLabel}` : ''}`}
            />
          ))}
          <span className="cutoff-line" style={{ bottom: pctOf(cutoff) }}>
            <span className="cutoff-line-label">{cutoff.toFixed(2)}</span>
          </span>
        </div>
      </div>

      <label className="cutoff-slider">
        <span className="field-label">Move the cut line</span>
        <input type="range" min={0} max={5} step={0.05} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} aria-valuetext={`${cutoff.toFixed(2)}, ${advancing} advance`} />
        <input
          type="number" className="input input-narrow" min={0} max={5} step={0.05} value={cutoff}
          onChange={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 5) setCutoff(v); }}
          aria-label="Cut line value"
        />
      </label>

      {pushedCount > 0 && (
        <p className="muted cutoff-note">
          <span className="legend-swatch" aria-hidden="true" /> Gold bars are advancing ({pushedLabel}), wherever the line is.
        </p>
      )}
      {unscored > 0 && (
        <p className="muted cutoff-note">
          {unscored} applicant{unscored === 1 ? ' has' : 's have'} no {mode === 'scores' ? 'review scores' : 'votes'} and won&apos;t advance unless pushed through.
        </p>
      )}

      {named && (
        <div className="cut-lists">
          <p className="muted cut-lists-note">Admins only. Names update as you move the line.</p>
          {err && <p className="form-error">{err}</p>}
          <CutList title={`Advancing (${above.length})`} rows={above} cutoff={cutoff} mode={mode} onToggle={togglePush} busyId={busyId} canPush={canApply} pushedLabel={pushedLabel} />
          <CutList title={`Below the line (${below.length})`} rows={below} cutoff={cutoff} mode={mode} onToggle={togglePush} busyId={busyId} canPush={canApply} pushedLabel={pushedLabel} below />
        </div>
      )}

      {canApply && (
        <form
          action={applyCutoff}
          className="cutoff-apply"
          onSubmit={(e) => {
            const ok = window.confirm(
              `Apply a cut line of ${cutoff.toFixed(2)} to ${roundName}?\n\n${advancing} applicant${advancing === 1 ? '' : 's'} advance${nextRoundName ? ` to ${nextRoundName}` : ''}${pushedCount ? ` (including ${pushedCount} ${pushedLabel})` : ''} and ${items.length - advancing} won't. Names and results become visible to all members. This can't be undone from the site.`
            );
            if (!ok) e.preventDefault();
          }}
        >
          <input type="hidden" name="roundId" value={roundId} />
          <input type="hidden" name="cutoff" value={cutoff} />
          <button className="btn btn-primary">Apply cut line of {cutoff.toFixed(2)} and release results</button>
        </form>
      )}
    </section>
  );
}

function CutList({ title, rows, mode, onToggle, busyId, canPush, below, pushedLabel }) {
  return (
    <details className="cut-list" open>
      <summary>{title}</summary>
      {rows.length === 0 ? (
        <p className="muted">Nobody.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className={r.pushed ? 'cut-pushed' : ''}>
              <a href={`/applicants/${r.id}`} target="_blank" rel="noreferrer" className="cut-name">{r.name}</a>
              <span className="cut-avg">{r.avg == null ? 'no scores' : Number(r.avg).toFixed(2)}</span>
              <span className="muted cut-count">
                {r.count} {mode === 'scores' ? (r.count === 1 ? 'reviewer' : 'reviewers') : r.count === 1 ? 'vote' : 'votes'}
              </span>
              {canPush && (r.pushed || below) && (mode === 'scores' || r.canVouch) ? (
                <button type="button" className={`btn ${r.pushed ? 'btn-quiet' : 'btn-vouch'} cut-btn`} onClick={() => onToggle(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? '…' : r.pushed ? 'Undo push' : 'Push through'}
                </button>
              ) : (
                <span className="cut-tag">{r.pushed ? pushedLabel : ''}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
