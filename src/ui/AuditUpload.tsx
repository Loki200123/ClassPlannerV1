'use client';

import { useRef, useState } from 'react';
import { NotAnAuditError, parseFhdaDegreeWorks, type ParsedAudit } from '../adapters/fhda/degreeworks';
import { extractPdfLines } from '../pdf/pdf-text';

interface Props {
  audit: ParsedAudit | null;
  onParsed: (audit: ParsedAudit | null) => void;
}

export function AuditUpload({ audit, onParsed }: Props) {
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
      onParsed(parseFhdaDegreeWorks(lines.join('\n')));
    } catch (e) {
      setError(
        e instanceof NotAnAuditError
          ? 'This PDF isn’t a Foothill–De Anza DegreeWorks audit. Download the audit from MyPortal → DegreeWorks and try again.'
          : 'Couldn’t read that PDF. Try downloading it from DegreeWorks again.',
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
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
    </div>
  );
}
