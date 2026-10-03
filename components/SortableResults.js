'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PushAfterReleaseButton from './PushAfterReleaseButton';

const fmt = (v) => (v == null ? '·' : Number(v).toFixed(2));

export default function SortableResults({ results, released, byScores, canPush, roundId, nextRoundName, cutIds = [] }) {
  const cut = useMemo(() => new Set(cutIds), [cutIds]);
  const rows = useMemo(
    () =>
      results.map((r, i) => {
        const state = r.advanced ? (r.by_vouch ? 'pushed' : 'advanced') : cut.has(r.applicant_id) ? 'cut' : 'out';
        const label =
          state === 'pushed' ? (byScores ? 'Advanced (pushed through)' : 'Advanced (hard vouch)')
          : state === 'advanced' ? 'Advanced'
          : state === 'cut' ? 'Not advanced (cut)'
          : 'Not advanced';
        return { ...r, rank: i + 1, state, label };
      }),
    [results, cut, byScores]
  );

  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c = { all: rows.length, advancing: 0, pushed: 0, cut: 0, out: 0 };
    rows.forEach((r) => {
      if (r.advanced) c.advancing += 1;
      if (r.state === 'pushed') c.pushed += 1;
      if (r.state === 'cut') c.cut += 1;
      if (!r.advanced) c.out += 1;
    });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    let list = rows.filter((r) =>
      filter === 'all' ? true
      : filter === 'advancing' ? r.advanced
      : filter === 'pushed' ? r.state === 'pushed'
      : filter === 'cut' ? r.state === 'cut'
      : !r.advanced
    );
    const resultOrder = { advanced: 0, pushed: 1, cut: 2, out: 3 };
    const val = {
      rank: (r) => r.rank,
      name: (r) => r.full_name.toLowerCase(),
      avg: (r) => (r.avg_stars == null ? -1 : Number(r.avg_stars)),
      count: (r) => Number(r.vote_count),
      result: (r) => resultOrder[r.state],
    }[sort.key];
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.rank - b.rank;
    });
    return list;
  }, [rows, filter, sort]);

  function by(key, firstDir = 'asc') {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }));
  }
  const Th = ({ k, first = 'asc', className = '', children }) => {
    const active = sort.key === k;
    return (
      <th scope="col" className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`th-sort ${active ? 'th-active' : ''}`} onClick={() => by(k, first)}>
          {children}
          <span className="th-arrow" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };

  const chips = released
    ? [
        ['all', 'All'],
        ['advancing', 'Advancing'],
        ['pushed', byScores ? 'Pushed through' : 'Hard vouch'],
        ['cut', 'Cut'],
        ['out', 'Not advancing'],
      ]
    : [];

  return (
    <>
      {chips.length > 0 && (
        <div className="res-filters" role="group" aria-label="Filter results">
          {chips.map(([k, label]) => (
            <button key={k} type="button" className={`chip ${filter === k ? 'chip-on' : ''}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
              {label} <span className="chip-count">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="table results-table">
          <thead>
            <tr>
              <Th k="rank" className="num">#</Th>
              <Th k="name">Applicant</Th>
              <Th k="avg" first="desc" className="num">{byScores ? 'Avg review score' : 'Avg vote'}</Th>
              <Th k="count" first="desc" className="num">{byScores ? 'Reviewers' : 'Votes'}</Th>
              {!byScores && <th scope="col" className="num">Recused</th>}
              {!byScores && <th scope="col" className="num">Reviewer avg</th>}
              {released && <Th k="result">Result</Th>}
              {canPush && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={8} className="muted">Nobody in this group.</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.applicant_id} className={released ? (r.advanced ? 'res-in' : 'res-out') : ''}>
                <td className="num muted">{r.rank}</td>
                <td>
                  <Link href={`/applicants/${r.applicant_id}`}>{r.full_name}</Link>
                  {!released && r.by_vouch && <span className="vouch-pill vouch-adv">Advancing: hard vouch</span>}
                </td>
                <td className="num"><strong>{fmt(r.avg_stars)}</strong></td>
                <td className="num">{r.vote_count}</td>
                {!byScores && <td className="num">{r.recusals}</td>}
                {!byScores && <td className="num">{fmt(r.avg_interview_score)}</td>}
                {released && <td>{r.label}</td>}
                {canPush && (
                  <td>
                    <PushAfterReleaseButton
                      roundId={roundId}
                      applicantId={r.applicant_id}
                      name={r.full_name}
                      nextRoundName={nextRoundName}
                      state={r.state}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
