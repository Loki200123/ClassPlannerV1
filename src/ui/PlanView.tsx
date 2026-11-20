'use client';

import { useState } from 'react';
import type { ParsedAudit } from '../adapters/fhda/degreeworks';
import type { OpenChoice, PlanResult } from '../planner/plan';

/** "AREA 3 - ARTS AND HUMANITIES — Arts & Humanities" -> "Arts & Humanities (GE Area 3)" */
export function friendlyLabel(label: string): string {
  const ge = label.match(/^AREA (\d+) - .+? — (.+)$/);
  if (ge) return `${ge[2]} (GE Area ${ge[1]})`;
  const adt = label.match(/^(.+?) for Transfer — (.+)$/);
  if (adt) return `${adt[2]} (${adt[1]} ADT)`;
  return label.replace(/^San Jose State University /, 'SJSU ');
}

function auditNotes(audit: ParsedAudit): string[] {
  const out: string[] = [];
  for (const r of audit.requirements) {
    if (r.label !== r.block || r.status === 'complete') continue;
    const name = r.block.replace(/^AREA (\d+) - (.+)$/, (_, n, rest) => `GE Area ${n} (${rest.toLowerCase()})`);
    if (r.unitsNeeded) out.push(`${name}: ${r.unitsNeeded} more units.`);
    if (r.notes) out.push(`${name}: ${r.notes}`);
  }
  return out;
}

function Choice({ choice }: { choice: OpenChoice }) {
  const [all, setAll] = useState(false);
  const shown = all ? choice.options : choice.options.slice(0, 18);
  return (
    <li className="choice">
      <h4>{friendlyLabel(choice.label)}</h4>
      <p className="muted small">
        Pick 1 of {choice.options.length}. Once class times are in, we’ll sort these by what fits your week and who
        teaches them.
      </p>
      <ul className="chips">
        {shown.map((b) => (
          <li key={b.join('+')}>{b.join(' + ')}</li>
        ))}
      </ul>
      {choice.options.length > 18 && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${choice.options.length}`}
        </button>
      )}
    </li>
  );
}

export function PlanView({ plan, audit }: { plan: PlanResult; audit: ParsedAudit }) {
  const notes = [...auditNotes(audit), ...plan.flags];
  const totalCounts = plan.recommended.reduce((n, c) => n + c.countsFor.length, 0);

  return (
    <div className="plan">
      {plan.recommended.length > 0 && (
        <section aria-labelledby="take-h">
          <h3 id="take-h">
            Take these {plan.recommended.length} classes
            <span className="plan-sub">
              They cover {totalCounts} requirements between them.
            </span>
          </h3>
          <ol className="courses">
            {plan.recommended.map((c) => (
              <li key={c.code} className={`course${c.countsFor.length > 1 ? ' course-multi' : ''}`}>
                <div className="course-head">
                  <span className="course-code">{c.code}</span>
                  {c.countsFor.length > 1 && <mark className="counts">counts {c.countsFor.length} times</mark>}
                </div>
                <ul className="counts-for">
                  {c.countsFor.map((l) => (
                    <li key={l}>{friendlyLabel(l)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan.choices.length > 0 && (
        <section aria-labelledby="choose-h">
          <h3 id="choose-h">Then choose one class for each of these</h3>
          <ul className="choices">
            {plan.choices.map((ch) => (
              <Choice key={ch.needId} choice={ch} />
            ))}
          </ul>
        </section>
      )}

      {plan.blocked.length > 0 && (
        <section aria-labelledby="blocked-h" className="blocked">
          <h3 id="blocked-h">Not offered at your college</h3>
          <ul>
            {plan.blocked.map((b) => (
              <li key={b}>{friendlyLabel(b)}: take it after you transfer, or ask a counselor about another college.</li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="notes-h">
          <h3 id="notes-h">Also keep in mind</h3>
          <ul className="notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {plan.recommended.length === 0 && plan.choices.length === 0 && (
        <p>Nothing left from your audit and transfer agreement. Double-check with a counselor before you apply.</p>
      )}
    </div>
  );
}
