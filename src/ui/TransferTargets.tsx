'use client';

import { useRef, useState } from 'react';
import { ImageOnlyPdfError, NotAssistError, parseAssist } from '../adapters/assist/parse';
import { extractPdfItems } from '../pdf/pdf-text';
import { UNIVERSITIES, findUniversity, sameUniversity } from '../data/universities';
import type { CollegeInfo } from '../data/colleges';
import { newTarget, type TransferTarget } from './storage';
import { shortMajor } from '../planner/plan';

interface Props {
  college: CollegeInfo;
  targets: TransferTarget[];
  /** Always gets the latest list, so a slow PDF read can't overwrite newer changes. */
  onChange: (change: (prev: TransferTarget[]) => TransferTarget[]) => void;
}

const SYSTEMS: { label: string; system: 'CSU' | 'UC' | 'Independent' }[] = [
  { label: 'California State University', system: 'CSU' },
  { label: 'University of California', system: 'UC' },
  { label: 'Independent universities', system: 'Independent' },
];

export function AssistHelp() {
  return (
    <details className="help">
      <summary>How to get the ASSIST PDF</summary>
      <ol>
        <li>
          On <a href="https://assist.org" target="_blank" rel="noreferrer">assist.org</a>, pick your college, the
          university, and your major.
        </li>
        <li>Click the printer icon at the top right of the agreement.</li>
        <li>
          In the print window, set <strong>Destination</strong> to <strong>Save as PDF</strong>, then save.
        </li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/help/assist-print-button.png"
        alt="An ASSIST agreement page. The printer icon is at the top right, next to the open-in-new-tab icon."
        width={1400}
        height={292}
      />
      <p className="muted small">
        “Microsoft Print to PDF” saves the pages as pictures, which we can’t read yet. Use “Save as PDF”.
      </p>
    </details>
  );
}

function TargetCard({
  college,
  target,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: {
  college: CollegeInfo;
  target: TransferTarget;
  index: number;
  canRemove: boolean;
  onUpdate: (t: TransferTarget) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = `uni-${target.id}`;

  async function read(file: File) {
    setError(null);
    setBusy(true);
    try {
      const items = await extractPdfItems(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseAssist(items);
      const warnings = [...parsed.warnings];
      const printedTo = parsed.agreement.toInstitution;
      let university = target.university;
      if (!university) {
        university = findUniversity(printedTo)?.name ?? printedTo;
      } else if (!sameUniversity(university, printedTo)) {
        warnings.unshift(`This agreement is for ${printedTo}, not ${university}. We switched the university to match.`);
        university = findUniversity(printedTo)?.name ?? printedTo;
      }
      if (parsed.fromCollege && parsed.fromCollege !== college.assistName) {
        warnings.unshift(
          `This agreement is from ${parsed.fromCollege}, but you picked ${college.name}. Download the one from ${college.name}.`,
        );
      }
      onUpdate({ ...target, university, agreement: parsed.agreement, fileName: file.name, warnings });
    } catch (e) {
      setError(
        e instanceof ImageOnlyPdfError
          ? 'This PDF is pictures of pages, so there’s no text to read. Save it again with “Save as PDF” (see “How to get the ASSIST PDF” above).'
          : e instanceof NotAssistError
            ? 'This isn’t an ASSIST articulation agreement. Download the agreement from assist.org.'
            : 'Couldn’t read that PDF. Try saving it from assist.org again.',
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const a = target.agreement;
  const required = a ? a.groups.filter((g) => !g.optional).reduce((n, g) => n + g.articulations.length, 0) : 0;

  return (
    <li className="target">
      <div className="target-head">
        <label className="field target-uni" htmlFor={selectId}>
          <span>{index === 0 ? 'University' : `University ${index + 1}`}</span>
          <select
            id={selectId}
            value={target.university}
            onChange={(e) => onUpdate({ ...target, university: e.target.value, agreement: null, fileName: undefined, warnings: [] })}
          >
            <option value="">Choose a university</option>
            {SYSTEMS.map((s) => (
              <optgroup key={s.system} label={s.label}>
                {UNIVERSITIES.filter((u) => u.system === s.system).map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {canRemove && (
          <button type="button" className="link-btn quiet" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      {a ? (
        <div className="target-done">
          <p className="target-major">{shortMajor(a.major)}</p>
          <p className="muted small">
            {a.major}, {a.academicYear}. {required} university courses listed.
          </p>
          {target.warnings.map((w) => (
            <p key={w} className="warn small">
              {w}
            </p>
          ))}
          <button
            type="button"
            className="link-btn quiet"
            onClick={() => onUpdate({ ...target, agreement: null, fileName: undefined, warnings: [] })}
          >
            Use a different agreement
          </button>
        </div>
      ) : (
        <>
          <label className={`drop drop-small${busy ? ' drop-busy' : ''}`}>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) read(f);
              }}
            />
            <span className="drop-title">{busy ? 'Reading the agreement…' : 'Choose the ASSIST PDF'}</span>
            <span className="drop-sub">
              {target.university ? `${college.name} to ${target.university}, your major` : 'Pick a university first, or just upload it'}
            </span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function TransferTargets({ college, targets, onChange }: Props) {
  const list = targets;
  const update = (t: TransferTarget) => onChange((prev) => prev.map((x) => (x.id === t.id ? t : x)));

  return (
    <div className="targets">
      <AssistHelp />
      <ol className="target-list">
        {list.map((t, i) => (
          <TargetCard
            key={t.id}
            college={college}
            target={t}
            index={i}
            canRemove={list.length > 1}
            onUpdate={update}
            onRemove={() => onChange((prev) => prev.filter((x) => x.id !== t.id))}
          />
        ))}
      </ol>
      <button type="button" className="btn btn-quiet" onClick={() => onChange((prev) => [...prev, newTarget()])}>
        {list.length ? 'Add another university or major' : 'Add a university'}
      </button>
      <p className="muted small">
        Applying to more than one school, or still choosing a major? Add each agreement. We’ll find the classes that
        count for all of them.
      </p>
    </div>
  );
}
