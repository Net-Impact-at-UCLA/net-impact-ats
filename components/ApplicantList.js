'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import StageTrack from './StageTrack';

export default function ApplicantList({ applicants, rounds }) {
  const [query, setQuery] = useState('');
  const [roundId, setRoundId] = useState('all');

  const counts = useMemo(() => {
    const c = {};
    applicants.forEach((a) => {
      c[a.currentRoundId] = (c[a.currentRoundId] || 0) + 1;
    });
    return c;
  }, [applicants]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applicants.filter((a) => {
      if (roundId === 'vouched' && !a.vouches) return false;
      if (roundId !== 'all' && roundId !== 'vouched' && a.currentRoundId !== roundId) return false;
      if (!q) return true;
      return [a.full_name, a.majors, a.grad_year, a.pronouns].join(' ').toLowerCase().includes(q);
    });
  }, [applicants, query, roundId]);

  return (
    <section>
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Filter by round">
          <button
            role="tab"
            aria-selected={roundId === 'all'}
            className={`tab ${roundId === 'all' ? 'tab-on' : ''}`}
            onClick={() => setRoundId('all')}
          >
            All <span className="tab-count">{applicants.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={roundId === 'vouched'}
            className={`tab tab-vouch ${roundId === 'vouched' ? 'tab-on' : ''}`}
            onClick={() => setRoundId('vouched')}
          >
            Hard vouched <span className="tab-count">{applicants.filter((a) => a.vouches).length}</span>
          </button>
          <span className="tab-sep" aria-hidden="true" />
          {rounds.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={roundId === r.id}
              className={`tab ${roundId === r.id ? 'tab-on' : ''}`}
              onClick={() => setRoundId(r.id)}
            >
              {r.name} <span className="tab-count">{counts[r.id] || 0}</span>
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search name, major, year"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search applicants"
        />
      </div>

      {shown.length === 0 ? (
        <p className="no-results">No applicants match. Try a different search or round.</p>
      ) : (
        <ul className="rows">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/applicants/${a.id}`} className={`row ${a.status === 'rejected' ? 'row-muted' : ''}`}>
                <Avatar name={a.full_name} src={a.headshotUrl} size={44} />
                <span className="row-main">
                  <span className="row-name">
                    {a.full_name}
                    {a.pronouns && <span className="row-pronouns">{a.pronouns}</span>}
                    {a.vouches > 0 && (
                      <span className="vouch-pill" title={`Hard vouched${a.vouches > 1 ? ` by ${a.vouches} members` : ''}`}>
                        Hard vouched{a.vouches > 1 ? ` ×${a.vouches}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="row-meta">{[a.majors, a.grad_year && `Class of ${a.grad_year}`].filter(Boolean).join(', ')}</span>
                </span>
                <span className="row-gpa" title="GPA">{a.gpa || ''}</span>
                <span className="row-track">
                  <StageTrack rounds={rounds} reachedIndex={a.reachedIndex} status={a.status} />
                  <span className="row-stage">
                    {a.status === 'rejected' ? 'Not advanced' : a.status === 'accepted' ? 'Accepted' : rounds[a.reachedIndex]?.name}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
