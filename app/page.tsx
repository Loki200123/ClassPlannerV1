'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ParsedAudit } from '../src/adapters/fhda/degreeworks';
import { COLLEGES, collegeById, nextTerm } from '../src/data/colleges';
import { plan as buildPlan, targetName } from '../src/planner/plan';
import type { TransferAgreement } from '../src/model/types';
import { AuditUpload } from '../src/ui/AuditUpload';
import { AvailabilityEditor } from '../src/ui/AvailabilityEditor';
import { PlanView } from '../src/ui/PlanView';
import { TransferTargets } from '../src/ui/TransferTargets';
import {
  EMPTY_STATE,
  clearState,
  loadState,
  newTarget,
  saveState,
  type GoalChoice,
  type SavedState,
} from '../src/ui/storage';

const NO_AUDIT: ParsedAudit = {
  source: 'degreeworks',
  districtId: 'fhda',
  auditDate: '',
  catalogYear: '',
  degree: '',
  courses: [],
  requirements: [],
};

const GOALS: { id: GoalChoice; title: string; detail: string }[] = [
  { id: 'associate', title: 'Finish my associate degree', detail: 'Uses your DegreeWorks audit.' },
  {
    id: 'transfer',
    title: 'Transfer to a university',
    detail: 'Add the ASSIST agreement for each university and major you’re considering.',
  },
];

export default function Home() {
  const [state, setState] = useState<SavedState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<string>('all');

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const update = (patch: Partial<SavedState>) => setState((s) => ({ ...s, ...patch }));
  const college = collegeById(state.collegeId);
  const term = nextTerm(college.termSystem);

  const agreements = useMemo(
    () => state.targets.map((t) => t.agreement).filter((a): a is TransferAgreement => a !== null),
    [state.targets],
  );
  const hasAuditStep = state.audit !== null || state.skipAudit;
  const ready =
    hasAuditStep &&
    (state.goal === 'associate' ? state.audit !== null : state.goal === 'transfer' && agreements.length > 0);

  const activeView = agreements.some((a) => a.id === view) ? view : 'all';
  const shown = useMemo(
    () => (activeView === 'all' ? agreements : agreements.filter((a) => a.id === activeView)),
    [activeView, agreements],
  );
  const plan = useMemo(() => {
    if (!ready) return null;
    const audit = state.audit ?? NO_AUDIT;
    return buildPlan(audit, state.goal === 'transfer' ? shown : []);
  }, [ready, state.audit, state.goal, shown]);

  return (
    <div className="page">
      <header className="masthead">
        <p className="brand">Class Planner</p>
        <h1>Plan your classes around your work shifts.</h1>
        <p className="lede">
          Upload your DegreeWorks audit and ASSIST agreements, and see exactly which classes are left, with the ones
          that count for more than one requirement marked.
        </p>
      </header>

      <ol className="steps">
        <li className="step">
          <h2>Your college</h2>
          <div className="step-body">
            <label className="field">
              <span>College</span>
              <select
                value={state.collegeId}
                onChange={(e) =>
                  update({
                    collegeId: e.target.value,
                    audit: null,
                    skipAudit: false,
                    goal: null,
                    targets: [],
                    planNextTerm: null,
                  })
                }
              >
                {COLLEGES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <small>
                {college.name} runs on {college.termSystem === 'quarter' ? 'quarters' : 'semesters'}.
              </small>
            </label>
          </div>
        </li>

        <li className="step">
          <h2>Your DegreeWorks audit</h2>
          <div className="step-body">
            <AuditUpload
              college={college}
              audit={state.audit}
              skipped={state.skipAudit}
              onParsed={(audit) => update({ audit, skipAudit: false })}
              onSkip={(skipAudit) => update({ skipAudit, ...(skipAudit && { audit: null }) })}
            />
          </div>
        </li>

        {hasAuditStep && (
          <li className="step">
            <h2>Your goal</h2>
            <div className="step-body">
              <fieldset className="goals">
                <legend className="sr-only">Goal</legend>
                {GOALS.map((g) => {
                  const disabled = g.id === 'associate' && !state.audit;
                  return (
                    <label key={g.id} className={`goal${state.goal === g.id ? ' goal-on' : ''}${disabled ? ' goal-off' : ''}`}>
                      <input
                        type="radio"
                        name="goal"
                        value={g.id}
                        checked={state.goal === g.id}
                        disabled={disabled}
                        onChange={() =>
                          update({
                            goal: g.id,
                            ...(g.id === 'transfer' && state.targets.length === 0 && { targets: [newTarget()] }),
                          })
                        }
                      />
                      <span className="goal-title">{g.title}</span>
                      <span className="goal-detail">{disabled ? 'Needs a DegreeWorks audit.' : g.detail}</span>
                    </label>
                  );
                })}
              </fieldset>
              {state.goal === 'transfer' && (
                <TransferTargets
                  college={college}
                  targets={state.targets}
                  onChange={(change) => setState((s) => ({ ...s, targets: change(s.targets) }))}
                />
              )}
            </div>
          </li>
        )}

        {ready && plan && (
          <li className="step">
            <h2>What you still need</h2>
            <div className="step-body">
              {state.goal === 'transfer' && agreements.length > 1 && (
                <div className="views" role="group" aria-label="Show requirements for">
                  <button type="button" aria-pressed={activeView === 'all'} onClick={() => setView('all')}>
                    All {agreements.length} together
                  </button>
                  {agreements.map((a) => (
                    <button key={a.id} type="button" aria-pressed={activeView === a.id} onClick={() => setView(a.id)}>
                      {targetName(a, agreements)}
                    </button>
                  ))}
                </div>
              )}
              {!state.audit && (
                <p className="warn small">
                  No audit, so this is everything the agreements require, including classes you may have taken.
                </p>
              )}
              <PlanView plan={plan} audit={state.audit} />
            </div>
          </li>
        )}

        {ready && (
          <li className="step">
            <h2>Plan {term}</h2>
            <div className="step-body">
              {state.planNextTerm === null && (
                <div className="ask">
                  <p>Want help choosing classes for {term} at {college.name}, around your work schedule?</p>
                  <div className="ask-buttons">
                    <button type="button" className="btn" onClick={() => update({ planNextTerm: true })}>
                      Yes, plan {term}
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => update({ planNextTerm: false })}>
                      Not now
                    </button>
                  </div>
                </div>
              )}
              {state.planNextTerm === false && (
                <p className="muted">
                  Skipped.{' '}
                  <button type="button" className="link-btn" onClick={() => update({ planNextTerm: true })}>
                    Plan {term} after all
                  </button>
                </p>
              )}
              {state.planNextTerm && (
                <>
                  <h3 className="sub-h">When can you be in class?</h3>
                  <AvailabilityEditor
                    blocks={state.blocks}
                    buffer={state.commuteBufferMinutes}
                    allowAsync={state.allowOnlineAsync}
                    onChange={(n) =>
                      update({
                        ...(n.blocks && { blocks: n.blocks }),
                        ...(n.buffer !== undefined && { commuteBufferMinutes: n.buffer }),
                        ...(n.allowAsync !== undefined && { allowOnlineAsync: n.allowAsync }),
                      })
                    }
                  />
                  <div className="next-up">
                    <strong>
                      {term} class times for {college.name} aren’t loaded yet.
                    </strong>{' '}
                    Once they are, this is where you’ll see the sections of your classes that fit the free time above,
                    with professors and open seats.
                  </div>
                </>
              )}
            </div>
          </li>
        )}
      </ol>

      <footer className="foot">
        <p>
          Saved in this browser only.{' '}
          <button
            type="button"
            className="link-btn quiet"
            onClick={() => {
              clearState();
              setState(EMPTY_STATE);
              setView('all');
            }}
          >
            Clear everything
          </button>
        </p>
        <p className="muted small">
          Always confirm your plan with a counselor and assist.org before you register. This tool can be wrong.
        </p>
      </footer>
    </div>
  );
}
