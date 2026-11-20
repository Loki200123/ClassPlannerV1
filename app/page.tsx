'use client';

import { useEffect, useMemo, useState } from 'react';
import { deanzaSjsuCs } from '../src/model/fixtures/deanza-sjsu-cs-2026-27';
import { plan as buildPlan } from '../src/planner/plan';
import { AuditUpload } from '../src/ui/AuditUpload';
import { AvailabilityEditor } from '../src/ui/AvailabilityEditor';
import { PlanView } from '../src/ui/PlanView';
import { EMPTY_STATE, clearState, loadState, saveState, type GoalChoice, type SavedState } from '../src/ui/storage';

const COLLEGES = [
  { id: 'deanza', name: 'De Anza College', ready: true },
  { id: 'skyline', name: 'Skyline College', ready: false },
  { id: 'csm', name: 'College of San Mateo', ready: false },
  { id: 'ccsf', name: 'City College of San Francisco', ready: false },
];

const GOALS: { id: GoalChoice; title: string; detail: string }[] = [
  {
    id: 'sjsu-cs',
    title: 'Transfer to San José State, Computer Science',
    detail: 'Your ADT plus SJSU’s major prep from ASSIST, 2026–27.',
  },
  { id: 'adt', title: 'Finish my associate degree only', detail: 'Uses your DegreeWorks audit alone.' },
];

export default function Home() {
  const [state, setState] = useState<SavedState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const update = (patch: Partial<SavedState>) => setState((s) => ({ ...s, ...patch }));

  const plan = useMemo(
    () => (state.audit ? buildPlan(state.audit, state.goal === 'sjsu-cs' ? deanzaSjsuCs : undefined) : null),
    [state.audit, state.goal],
  );

  return (
    <div className="page">
      <header className="masthead">
        <p className="brand">Class Planner</p>
        <h1>Plan next quarter around your work shifts.</h1>
        <p className="lede">
          Upload your DegreeWorks audit, tell us when you’re free, and see which classes get you to your degree or
          transfer fastest, with the ones that count twice marked.
        </p>
      </header>

      <ol className="steps">
        <li className="step">
          <h2>Your college and goal</h2>
          <div className="step-body">
            <label className="field">
              <span>College</span>
              <select value={state.collegeId} onChange={(e) => update({ collegeId: e.target.value })}>
                {COLLEGES.filter((c) => c.ready).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <optgroup label="Coming soon">
                  {COLLEGES.filter((c) => !c.ready).map((c) => (
                    <option key={c.id} value={c.id} disabled>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <fieldset className="goals">
              <legend>Goal</legend>
              {GOALS.map((g) => (
                <label key={g.id} className={`goal${state.goal === g.id ? ' goal-on' : ''}`}>
                  <input
                    type="radio"
                    name="goal"
                    value={g.id}
                    checked={state.goal === g.id}
                    onChange={() => update({ goal: g.id })}
                  />
                  <span className="goal-title">{g.title}</span>
                  <span className="goal-detail">{g.detail}</span>
                </label>
              ))}
              <p className="muted small">More universities and majors are on the way.</p>
            </fieldset>
          </div>
        </li>

        <li className="step">
          <h2>Your DegreeWorks audit</h2>
          <div className="step-body">
            <AuditUpload audit={state.audit} onParsed={(audit) => update({ audit })} />
          </div>
        </li>

        <li className="step">
          <h2>When you can be in class</h2>
          <div className="step-body">
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
          </div>
        </li>

        <li className="step">
          <h2>Your plan</h2>
          <div className="step-body">
            {plan && state.audit ? (
              <>
                <PlanView plan={plan} audit={state.audit} />
                <p className="next-up">
                  Next up: real section times and professors for Winter 2027, matched to the free time you entered
                  above.
                </p>
              </>
            ) : (
              <p className="muted">Add your DegreeWorks audit above and your plan shows up here.</p>
            )}
          </div>
        </li>
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
