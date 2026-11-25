'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Availability, Section } from '../model/types';
import type { PlanResult } from '../planner/plan';
import { loadScheduleFile, loadScheduleIndex } from '../schedule/load';
import { rankChoiceOptions, sectionsFor, type CourseSections } from '../schedule/match';
import type { ScheduleFile, ScheduleIndex } from '../schedule/types';
import { friendlyLabel } from './PlanView';
import { formatTime } from './time';

interface Props {
  collegeId: string;
  collegeName: string;
  /** Term to pick by default, e.g. "Winter 2027". */
  defaultTerm: string;
  plan: PlanResult;
  availability: Availability;
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon, Wed 4 pm–6:15 pm"; meetings at the same time are merged ("Mon–Fri 9:30 am–10:20 am"). */
export function when(s: Section): string {
  if (s.meetings.length === 0) return s.modality === 'online_async' ? 'Online, no set meeting times' : 'Times not set yet';
  const groups = new Map<string, Set<string>>();
  for (const m of s.meetings) {
    const key = `${m.start}-${m.end}`;
    if (!groups.has(key)) groups.set(key, new Set());
    m.days.forEach((d) => groups.get(key)!.add(d));
  }
  return [...groups]
    .map(([key, days]) => {
      const [start, end] = key.split('-').map(Number);
      const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
      const idx = sorted.map((d) => DAY_ORDER.indexOf(d));
      const run = sorted.length >= 3 && idx.every((d, i) => i === 0 || d === idx[i - 1] + 1);
      const label = run ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ');
      return `${label} ${formatTime(start)}–${formatTime(end)}`;
    })
    .join(', and ');
}

function seatText(s: Section): { text: string; tone: 'open' | 'wait' | 'full' } {
  const seats = s.seats;
  if (!seats) return { text: 'Seats unknown', tone: 'wait' };
  const open = Math.max(0, seats.capacity - seats.enrolled);
  if (seats.status === 'open') return { text: `${open} seat${open === 1 ? '' : 's'} open`, tone: 'open' };
  if (seats.status === 'waitlist') return { text: `Full, waitlist open (${seats.waitlisted} waiting)`, tone: 'wait' };
  return { text: 'Full, waitlist full', tone: 'full' };
}

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function SectionRow({ s, termStart, termEnd }: { s: Section; termStart?: string; termEnd?: string }) {
  const seat = seatText(s);
  const shortTerm = (s.startDate && termStart && s.startDate > termStart) || (s.endDate && termEnd && s.endDate < termEnd);
  return (
    <li className="section">
      <div className="section-when">
        <strong>{when(s)}</strong>
        <span className="muted small">
          {s.methodLabel ?? s.modality}
          {s.meetings[0]?.location ? `, room ${s.meetings[0].location}` : ''}
          {shortTerm && s.startDate && s.endDate ? `. Runs ${shortDate(s.startDate)}–${shortDate(s.endDate)} only` : ''}
          {s.hasUntimedParts && s.meetings.length > 0 ? '. Plus online work on your own time' : ''}
        </span>
      </div>
      <div className="section-prof">
        {s.instructorName ? (
          <>
            {s.instructorName}{' '}
            <a
              href={`https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(s.instructorName)}`}
              target="_blank"
              rel="noreferrer"
              className="small"
            >
              Ratings<span className="sr-only"> for {s.instructorName} on RateMyProfessors (opens in a new tab)</span>
            </a>
          </>
        ) : (
          <span className="muted">Professor not assigned yet</span>
        )}
      </div>
      <div className="section-meta">
        <span className={`seat seat-${seat.tone}`}>{seat.text}</span>
        <span className="muted small">CRN {s.crn}</span>
      </div>
    </li>
  );
}

function CourseBlock({
  c,
  countsFor,
  term,
  termStart,
  termEnd,
}: {
  c: CourseSections;
  countsFor?: number;
  term: string;
  termStart?: string;
  termEnd?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const total = c.fits.length + c.other.length;
  const shown = showAll ? c.fits : c.fits.slice(0, 3);
  return (
    <li className="course-sections">
      <div className="course-head">
        <span className="course-code">{c.code}</span>
        {c.title && <span className="muted">{c.title}</span>}
        {countsFor && countsFor > 1 ? <mark className="counts">counts {countsFor} times</mark> : null}
      </div>
      {total === 0 ? (
        <p className="muted small">Not offered in {term}.</p>
      ) : c.fits.length === 0 ? (
        <>
          <p className="warn small">
            {total === 1 ? 'The only section doesn’t fit your free time.' : `None of the ${total} sections fit your free time.`}
          </p>
          <details className="other-sections">
            <summary>{total === 1 ? 'See the section' : `See all ${total} sections`}</summary>
            <ul className="sections">
              {c.other.map((s) => (
                <SectionRow key={s.crn} s={s} termStart={termStart} termEnd={termEnd} />
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
          <p className="muted small">
            {c.fits.length} of {total} section{total === 1 ? '' : 's'} fit your free time
          </p>
          <ul className="sections">
            {shown.map((s) => (
              <SectionRow key={s.crn} s={s} termStart={termStart} termEnd={termEnd} />
            ))}
          </ul>
          {c.fits.length > 3 && (
            <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${c.fits.length} that fit`}
            </button>
          )}
        </>
      )}
    </li>
  );
}

export function SectionsView({ collegeId, collegeName, defaultTerm, plan, availability }: Props) {
  const [index, setIndex] = useState<ScheduleIndex | null>(null);
  const [termFile, setTermFile] = useState<string | null>(null);
  const [data, setData] = useState<ScheduleFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScheduleIndex()
      .then(setIndex)
      .catch(() => setError('Couldn’t download class times. Check your connection and reload.'));
  }, []);

  const terms = useMemo(
    () => (index?.terms.filter((t) => t.collegeId === collegeId) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
    [index, collegeId],
  );
  const chosen = terms.find((t) => t.file === termFile) ?? terms.find((t) => t.label === defaultTerm) ?? terms[0];

  useEffect(() => {
    if (!chosen) return;
    setData(null);
    loadScheduleFile(chosen.file)
      .then(setData)
      .catch(() => setError('Couldn’t download class times. Check your connection and reload.'));
  }, [chosen?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => {
    if (!data) return null;
    const all = data.sections;
    const termStart = all.reduce<string | undefined>((m, s) => (s.startDate && (!m || s.startDate < m) ? s.startDate : m), undefined);
    const termEnd = all.reduce<string | undefined>((m, s) => (s.endDate && (!m || s.endDate > m) ? s.endDate : m), undefined);
    return {
      termStart,
      termEnd,
      courses: plan.recommended.map((r) => ({ countsFor: r.countsFor.length, ...sectionsFor(r.code, all, availability) })),
      choices: plan.choices.map((ch) => ({
        label: ch.label,
        options: rankChoiceOptions(
          ch.options.filter((b) => b.length === 1).map((b) => b[0]),
          all,
          availability,
        ),
      })),
    };
  }, [data, plan, availability]);

  if (error) return <p className="error">{error}</p>;
  if (index && terms.length === 0) {
    return (
      <div className="next-up">
        <strong>Class times for {collegeName} aren’t available yet.</strong> De Anza is the first college with live
        class times; the others are being added.
      </div>
    );
  }
  if (!index || !chosen) return <p className="muted">Loading class times…</p>;

  const updated = new Date(chosen.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <section className="sections-view" aria-labelledby="sections-h">
      <div className="sections-top">
        <h3 id="sections-h" className="sub-h">
          Sections that fit
        </h3>
        {terms.length > 1 && (
          <div className="views" role="group" aria-label="Term">
            {terms.map((t) => (
              <button key={t.file} type="button" aria-pressed={t.file === chosen.file} onClick={() => setTermFile(t.file)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <p className="muted small">
          {chosen.sections.toLocaleString()} {collegeName} sections for {chosen.label}, updated {updated}. Seats change
          fast during registration. Check them in MyPortal before you sign up.
        </p>
      </div>

      {!result ? (
        <p className="muted">Loading {chosen.label}…</p>
      ) : (
        <>
          {availability.blocks.length === 0 && (
            <p className="warn small">
              No free time entered yet, so only fully online classes with no set meeting times can fit.
            </p>
          )}
          {result.courses.length > 0 && (
            <ul className="course-list">
              {result.courses.map((c) => (
                <CourseBlock
                  key={c.code}
                  c={c}
                  countsFor={c.countsFor}
                  term={chosen.label}
                  termStart={result.termStart}
                  termEnd={result.termEnd}
                />
              ))}
            </ul>
          )}

          {result.choices.map((ch) => (
            <div key={ch.label} className="choice-sections">
              <h4>{friendlyLabel(ch.label)}: options that fit</h4>
              {ch.options.length === 0 ? (
                <p className="muted small">None of the options have a section that fits your free time in {chosen.label}.</p>
              ) : (
                <ul className="course-list">
                  {ch.options.map((c) => (
                    <CourseBlock key={c.code} c={c} term={chosen.label} termStart={result.termStart} termEnd={result.termEnd} />
                  ))}
                </ul>
              )}
            </div>
          ))}

          <p className="muted small">
            Some classes need another one first (for example PHYS 4B after PHYS 4A). Check prerequisites in the
            catalog before you register.
          </p>
        </>
      )}
    </section>
  );
}
