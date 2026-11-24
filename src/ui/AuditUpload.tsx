'use client';

import { useRef, useState } from 'react';
import {
  NotAnAuditError,
  WrongCollegeAuditError,
  parseDegreeWorks,
  type ParsedAudit,
} from '../adapters/degreeworks';
import { extractPdfLines } from '../pdf/pdf-text';
import type { CollegeInfo } from '../data/colleges';

interface Props {
  college: CollegeInfo;
  audit: ParsedAudit | null;
  skipped: boolean;
  onParsed: (audit: ParsedAudit | null) => void;
  onSkip: (skip: boolean) => void;
}

export function AuditUpload({ college, audit, skipped, onParsed, onSkip }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function read(file: File) {
    setError(null);
    if (file.type && file.type !== 'application/pdf') {
      setError('That file isn’t a PDF. In DegreeWorks, use Print / Save as PDF, then choose that file.');
      return;
    }
    setBusy(true);
    try {
      const lines = await extractPdfLines(new Uint8Array(await file.arrayBuffer()));
      onParsed(parseDegreeWorks(lines.join('\n'), college.districtId));
    } catch (e) {
      setError(
        e instanceof WrongCollegeAuditError
          ? `${e.message} Change the college in step 1, or upload your ${college.name} audit.`
          : e instanceof NotAnAuditError
            ? `This PDF isn’t a ${college.name} DegreeWorks audit. Download it from DegreeWorks and try again.`
            : 'Couldn’t read that PDF. Try downloading it from DegreeWorks again.',
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  if (skipped && !audit) {
    return (
      <div>
        <p>
          No audit. Your plan will list everything your transfer agreements require, without checking what you’ve
          already taken.
        </p>
        <button type="button" className="link-btn" onClick={() => onSkip(false)}>
          Add an audit after all
        </button>
      </div>
    );
  }

  if (!college.auditSupported) {
    return (
      <div>
        <p>
          We can’t read {college.name} DegreeWorks audits yet. Support is being added. For now you can still see
          what your transfer agreements require.
        </p>
        <button type="button" className="btn" onClick={() => onSkip(true)}>
          Continue without an audit
        </button>
      </div>
    );
  }

  if (audit) {
    const done = audit.courses.filter((c) => c.status === 'completed').length;
    const inProgress = audit.courses.filter((c) => c.status === 'in_progress');
    const openBlocks = audit.requirements.filter((r) => r.label === r.block && r.status !== 'complete').length;
    return (
      <div className="audit-done">
        <dl className="audit-facts">
          <div>
            <dt>Completed</dt>
            <dd>{done} classes</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{inProgress.length ? inProgress.map((c) => c.code).join(', ') : 'None'}</dd>
          </div>
          <div>
            <dt>Requirement blocks still open</dt>
            <dd>{openBlocks}</dd>
          </div>
          <div>
            <dt>Degree</dt>
            <dd>
              {audit.degree}, {audit.catalogYear} catalog
            </dd>
          </div>
        </dl>
        <p className="muted">Audit from {audit.auditDate}. Classes in progress are counted as done.</p>
        <button type="button" className="link-btn" onClick={() => onParsed(null)}>
          Use a different audit
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        className={`drop${dragging ? ' drop-over' : ''}${busy ? ' drop-busy' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) read(f);
        }}
      >
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
        <span className="drop-title">{busy ? 'Reading your audit…' : 'Choose your DegreeWorks PDF'}</span>
        <span className="drop-sub">or drag it here</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">
        The PDF is read on this device and never uploaded. Only your course list is kept; your name, student ID and
        GPA are dropped.
      </p>
      <button type="button" className="link-btn quiet" onClick={() => onSkip(true)}>
        Continue without an audit
      </button>
    </div>
  );
}
