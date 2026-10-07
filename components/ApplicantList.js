'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import StageTrack from './StageTrack';

export default function ApplicantList({ applicants, rounds, events = [] }) {
  const [query, setQuery] = useState('');
  const [roundId, setRoundId] = useState('all');
  const [eventFilter, setEventFilter] = useState({}); // { eventId: 'yes' | 'no' }
  const [sort, setSort] = useState('name');
  const canSort = applicants.some((a) => a.reviews);

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
      for (const [eid, want] of Object.entries(eventFilter)) {
        const went = a.events.includes(eid);
        if (want === 'yes' && !went) return false;
        if (want === 'no' && went) return false;
      }
      if (roundId === 'vouched' && !a.vouches) return false;
      if (roundId !== 'all' && roundId !== 'vouched' && a.currentRoundId !== roundId) return false;
      if (!q) return true;
      return [a.full_name, a.majors, a.grad_year, a.pronouns].join(' ').toLowerCase().includes(q);
    });
  }, [applicants, query, roundId, eventFilter]);

  const sorted = useMemo(() => {
    if (sort === 'name') return shown;
    const avg = (a) => a.reviews?.avg;
    const list = [...shown];
    if (sort === 'score-high' || sort === 'score-low') {
      const dir = sort === 'score-high' ? -1 : 1;
      list.sort((a, b) => {
        if (avg(a) == null && avg(b) == null) return a.full_name.localeCompare(b.full_name);
        if (avg(a) == null) return 1;
        if (avg(b) == null) return -1;
        return dir * (avg(a) - avg(b)) || a.full_name.localeCompare(b.full_name);
      });
    } else if (sort === 'fewest') {
      list.sort((a, b) => (a.reviews?.done ?? 0) - (b.reviews?.done ?? 0) || a.full_name.localeCompare(b.full_name));
    }
    return list;
  }, [shown, sort]);
  const eventName = Object.fromEntries(events.map((e) => [e.id, e.name]));

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
        {canSort && (
          <label className="sort">
            <span className="sort-label">Sort</span>
            <select className="select sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort applicants">
              <option value="name">Name (A to Z)</option>
              <option value="score-high">Review score, highest first</option>
              <option value="score-low">Review score, lowest first</option>
              <option value="fewest">Fewest reviews first</option>
            </select>
          </label>
        )}
        <input
          className="search"
          type="search"
          placeholder="Search name, major, year"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search applicants"
        />
      </div>

      {events.length > 0 && (
        <div className="event-filters" aria-label="Filter by event attendance">
          {events.map((e) => {
            const v = eventFilter[e.id];
            const next = v === undefined ? 'yes' : v === 'yes' ? 'no' : undefined;
            return (
              <button
                key={e.id}
                type="button"
                className={`event-chip ${v === 'yes' ? 'event-chip-yes' : v === 'no' ? 'event-chip-no' : ''}`}
                onClick={() =>
                  setEventFilter((f) => {
                    const c = { ...f };
                    if (next) c[e.id] = next;
                    else delete c[e.id];
                    return c;
                  })
                }
                title="Click to cycle: attended, didn't attend, any"
              >
                {v === 'yes' ? '✓ ' : v === 'no' ? '✕ ' : ''}
                {e.name}
                {v === 'yes' ? ': attended' : v === 'no' ? ': didn’t attend' : ''}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="no-results">No applicants match. Try a different search or round.</p>
      ) : (
        <ul className="rows">
          {sorted.map((a, i) => (
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
                  {a.makeup && <span className="makeup-pill">Makeup: {a.makeup}</span>}
                  <span className="row-meta">{[a.majors, a.grad_year && `Class of ${a.grad_year}`].filter(Boolean).join(', ')}</span>
                  {a.events.length > 0 && (
                    <span className="row-events">
                      {a.events.filter((eid) => eventName[eid]).map((eid) => (
                        <span key={eid} className="row-event">✓ {eventName[eid]}</span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="row-gpa" title={a.gpa ? `GPA: ${a.gpa}` : undefined}>{a.gpa || ''}</span>
                <span className="row-track">
                  <StageTrack rounds={rounds} reachedIndex={a.reachedIndex} status={a.status} />
                  <span className="row-stage">
                    {a.status === 'rejected' ? 'Not advanced' : a.status === 'accepted' ? 'Accepted' : rounds[a.reachedIndex]?.name}
                    {a.reviews && a.status === 'active' && (
                      <span
                        className={`row-reviews ${a.reviews.done === 0 ? 'rv-none' : ''}`}
                        title={`${a.reviews.done} finished, ${a.reviews.started} in progress, ${a.reviews.assigned} assigned or self-added`}
                      >
                        {a.reviews.done === 0
                          ? `, no reviews yet${a.reviews.started ? ` (${a.reviews.started} in progress)` : ''}`
                          : `, ${a.reviews.done} review${a.reviews.done === 1 ? '' : 's'}`}
                        {a.reviews.avg != null && <span className="row-avg">, avg {a.reviews.avg.toFixed(2)}</span>}
                      </span>
                    )}
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
