'use client';

import { useMemo, useState } from 'react';
import Avatar from './Avatar';

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function PresentView({ round, criteria, applicants, context }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return applicants.filter((a) => words.every((w) => a.name.toLowerCase().includes(w)));
  }, [applicants, query]);

  const a = applicants.find((x) => x.id === selectedId);
  const reviewers = (a && context[a.id]) || [];
  const averages = criteria.map((c) => {
    const vals = reviewers.map((r) => r.scores[c.id]).filter((v) => v != null);
    return { ...c, avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, n: vals.length };
  });

  return (
    <div className="present">
      <aside className="present-side">
        <p className="present-round">{round.name}: deliberations</p>
        <input
          type="search"
          className="present-search"
          placeholder="Search applicants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) setSelectedId(shown[0].id);
          }}
          aria-label="Search applicants"
          autoFocus
        />
        <ul className="present-list">
          {shown.map((x) => (
            <li key={x.id}>
              <button type="button" className={`present-item ${x.id === selectedId ? 'present-item-on' : ''}`} onClick={() => setSelectedId(x.id)}>
                <Avatar name={x.name} src={x.headshot} size={36} />
                <span>{x.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="present-main">
        {!a ? (
          <div className="present-empty">
            <p>Pick an applicant on the left, or type their name and press Enter.</p>
          </div>
        ) : (
          <>
            <div className="present-id">
              <Avatar name={a.name} src={a.headshot} size={220} />
              <div>
                <h1>{a.name}</h1>
                {a.pronouns && <p className="present-pronouns">{a.pronouns}</p>}
                {a.detail && <p className="present-detail">{a.detail}</p>}
                {a.vouches > 0 && (
                  <p className="present-vouch">
                    <span className="vouch-mark" aria-hidden="true" />
                    Hard vouched{a.vouches > 1 ? ` by ${a.vouches} members` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="present-avgs">
              {averages.map((c) => (
                <div key={c.id} className="present-avg">
                  <span className="present-avg-num">{c.avg == null ? '·' : c.avg.toFixed(2)}</span>
                  <span className="present-avg-label">{c.name}</span>
                  <span className="present-avg-n">{c.n} {c.n === 1 ? 'rating' : 'ratings'}</span>
                </div>
              ))}
            </div>

            {reviewers.length === 0 ? (
              <p className="present-none">No scores or notes from {round.name} for {a.name.split(' ')[0]}.</p>
            ) : (
              <div className="present-reviews">
                {reviewers.map((r) => (
                  <section key={r.name} className="present-review">
                    <div className="present-review-head">
                      <h2>{r.name}</h2>
                      <span className="present-review-scores">
                        {criteria.map((c) => (
                          <span key={c.id}>
                            {c.name} <strong>{r.scores[c.id] != null ? fmt(r.scores[c.id]) : '·'}</strong>
                          </span>
                        ))}
                      </span>
                    </div>
                    {r.notes.map((n, i) => (
                      <p key={i} className="present-note">{n}</p>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
