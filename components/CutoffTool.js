'use client';

import { useMemo, useState } from 'react';
import { applyCutoff } from '@/app/admin/actions';

// Anonymized averages (highest first) with a movable cutoff line.
// values: [{ avg: number|null, votes: number }]
export default function CutoffTool({ roundId, roundName, nextRoundName, values, canApply }) {
  const scored = values.filter((v) => v.avg != null).map((v) => Number(v.avg));
  const unvoted = values.length - scored.length;
  const [cutoff, setCutoff] = useState(() => {
    if (!scored.length) return 3;
    const median = [...scored].sort((a, b) => b - a)[Math.floor(scored.length / 2)];
    return Math.round(median * 20) / 20;
  });

  const advancing = useMemo(() => scored.filter((v) => v >= cutoff - 1e-9).length, [scored, cutoff]);
  const pctOf = (v) => `${(v / 5) * 100}%`;
  const bars = [...values].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  return (
    <section className="cutoff">
      <div className="cutoff-summary" aria-live="polite">
        <span className="cutoff-big">{advancing}</span>
        <span>
          of {values.length} applicants would advance{nextRoundName ? ` to ${nextRoundName}` : ''} at a cutoff of{' '}
          <strong>{cutoff.toFixed(2)}</strong>
          {values.length ? ` (${Math.round((advancing / values.length) * 100)}%)` : ''}
        </span>
      </div>

      <div className="cutoff-chart" role="img" aria-label={`Anonymized average votes for ${values.length} applicants, highest first. Cutoff at ${cutoff.toFixed(2)}.`}>
        <div className="cutoff-yaxis" aria-hidden="true">
          {[5, 4, 3, 2, 1, 0].map((t) => (
            <span key={t} style={{ bottom: pctOf(t) }}>{t}</span>
          ))}
        </div>
        <div className="cutoff-plot">
          {bars.map((b, i) => (
            <span
              key={i}
              className={`cutoff-bar ${b.avg == null ? 'cutoff-none' : Number(b.avg) >= cutoff - 1e-9 ? 'cutoff-in' : 'cutoff-out'}`}
              style={{ height: b.avg == null ? '2px' : pctOf(Number(b.avg)) }}
              title={b.avg == null ? 'No votes' : `${Number(b.avg).toFixed(2)} (${b.votes} votes)`}
            />
          ))}
          <span className="cutoff-line" style={{ bottom: pctOf(cutoff) }}>
            <span className="cutoff-line-label">{cutoff.toFixed(2)}</span>
          </span>
        </div>
      </div>

      <label className="cutoff-slider">
        <span className="field-label">Move the cutoff</span>
        <input
          type="range"
          min={0}
          max={5}
          step={0.05}
          value={cutoff}
          onChange={(e) => setCutoff(Number(e.target.value))}
          aria-valuetext={`${cutoff.toFixed(2)}, ${advancing} advance`}
        />
        <input
          type="number"
          className="input input-narrow"
          min={0}
          max={5}
          step={0.05}
          value={cutoff}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0 && v <= 5) setCutoff(v);
          }}
          aria-label="Cutoff value"
        />
      </label>

      {unvoted > 0 && (
        <p className="muted cutoff-note">
          {unvoted} applicant{unvoted === 1 ? '' : 's'} received no votes and won&apos;t advance unless voting is reopened.
        </p>
      )}

      {canApply && (
        <form
          action={applyCutoff}
          className="cutoff-apply"
          onSubmit={(e) => {
            const ok = window.confirm(
              `Apply a cutoff of ${cutoff.toFixed(2)} to ${roundName}?\n\n${advancing} applicant${advancing === 1 ? '' : 's'} advance${nextRoundName ? ` to ${nextRoundName}` : ''} and ${values.length - advancing} won't. Names and results become visible to all members. This can't be undone from the site.`
            );
            if (!ok) e.preventDefault();
          }}
        >
          <input type="hidden" name="roundId" value={roundId} />
          <input type="hidden" name="cutoff" value={cutoff} />
          <button className="btn btn-primary">Apply cutoff of {cutoff.toFixed(2)} and release results</button>
        </form>
      )}
    </section>
  );
}
