import Link from 'next/link';
import { setRoundPhase } from '@/app/admin/actions';
import ConfirmButton from './ConfirmButton';

const STEPS = [
  { key: 'setup', label: 'Not started' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'voting', label: 'Voting' },
  { key: 'closed', label: 'Cutoff' },
  { key: 'released', label: 'Results' },
];

function PhaseButton({ roundId, to, primary, disabled, confirm, children }) {
  const cls = `btn ${primary ? 'btn-primary' : 'btn-quiet'}`;
  return (
    <form action={setRoundPhase}>
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="phase" value={to} />
      {confirm ? (
        <ConfirmButton className={cls} message={confirm} disabled={disabled}>{children}</ConfirmButton>
      ) : (
        <button className={cls} disabled={disabled}>{children}</button>
      )}
    </form>
  );
}

// Admin-only control bar on a round's page.
// stats: { applicants, assigned, reviewsDone, votesCast, voters }
export default function RoundControls({ round, nextRoundName, stats }) {
  const idx = STEPS.findIndex((s) => s.key === round.phase);
  const isCoffee = round.stage === 'coffee_chat';
  const noReviewers = stats.assigned === 0 && !isCoffee;

  let next = '';
  if (round.phase === 'setup') {
    next = isCoffee
      ? `${stats.applicants} applicant${stats.applicants === 1 ? '' : 's'} in this round. Open scoring when coffee chats start; members add people at their tables.`
      : noReviewers
        ? `${stats.applicants} applicant${stats.applicants === 1 ? '' : 's'} in this round, but no reviewers are assigned yet. Assign reviewers on the Admin page first.`
        : `${stats.assigned} review${stats.assigned === 1 ? '' : 's'} assigned. Open scoring when reviewers should start.`;
  } else if (round.phase === 'scoring') {
    next = isCoffee
      ? `Members are grading at their tables (${stats.reviewsDone} chat${stats.reviewsDone === 1 ? '' : 's'} fully scored so far). When coffee chats are over and the club is ready to deliberate, open voting.`
      : `Reviews are ${stats.reviewsDone} of ${stats.assigned} done. When the club is ready to deliberate, open voting.`;
  } else if (round.phase === 'voting') {
    next = `Voting is open (${stats.votesCast} vote${stats.votesCast === 1 ? '' : 's'} cast so far). After discussing everyone, close voting to reveal the blind cutoff chart.`;
  } else if (round.phase === 'closed') {
    next = 'Everyone can now see the anonymous averages below. Agree on a cutoff, then apply it at the bottom of the chart.';
  } else {
    next = `Results are released${nextRoundName ? ` and advancing applicants are in ${nextRoundName}` : ''}. Download the export from the Admin page for the Advancing list.`;
  }

  return (
    <section className="round-controls" aria-label="Round controls (admins only)">
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`step ${i < idx ? 'step-done' : i === idx ? 'step-now' : ''}`}>
            <span className="step-dot" aria-hidden="true">{i < idx ? '✓' : i + 1}</span>
            <span className="step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="round-next">{next}</p>
      <div className="round-control-buttons">
        {round.phase === 'setup' && (
          <>
            <PhaseButton roundId={round.id} to="scoring" primary disabled={noReviewers}>Open scoring</PhaseButton>
            {!isCoffee && <Link href="/admin" className="btn btn-quiet">Assign reviewers</Link>}
          </>
        )}
        {round.phase === 'scoring' && (
          <>
            <PhaseButton
              roundId={round.id}
              to="voting"
              primary
              confirm={`Open deliberation voting for ${round.name}? Scoring closes, and every member can see the scores and notes and vote.`}
            >
              Open voting
            </PhaseButton>
            <PhaseButton roundId={round.id} to="setup">Pause scoring</PhaseButton>
          </>
        )}
        {round.phase === 'voting' && (
          <>
            <PhaseButton
              roundId={round.id}
              to="closed"
              primary
              confirm={`Close voting for ${round.name}? Members will see the anonymous averages for the blind cutoff.`}
            >
              Close voting
            </PhaseButton>
            <Link href="/deliberate" className="btn btn-quiet">Deliberations</Link>
            <Link href="/deliberate/present" className="btn btn-quiet" target="_blank">Open TV view</Link>
            <PhaseButton roundId={round.id} to="scoring" confirm={`Go back to scoring for ${round.name}? Voting pauses; votes already cast are kept.`}>
              Back to scoring
            </PhaseButton>
          </>
        )}
        {round.phase === 'closed' && (
          <PhaseButton roundId={round.id} to="voting" confirm={`Reopen voting for ${round.name}? The cutoff chart is hidden again until voting closes.`}>
            Reopen voting
          </PhaseButton>
        )}
        {round.phase === 'released' && <Link href="/admin/export" className="btn btn-quiet">Download results (.xlsx)</Link>}
      </div>
    </section>
  );
}
