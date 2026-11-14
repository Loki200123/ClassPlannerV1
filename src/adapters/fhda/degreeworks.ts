// Parser for Foothill-De Anza DegreeWorks audit PDFs (after pdf-text.ts turns them into lines).
// Output never contains the student's name, ID, or GPA.
import { normalizeFhdaCode } from '../../model/normalize-fhda';
import type { AuditRequirement, AuditSnapshot, CourseCode, CourseRecord, CourseStatus } from '../../model/types';

export type ParsedAudit = Omit<AuditSnapshot, 'id' | 'userId'>;

export class NotAnAuditError extends Error {}

// ---------- line patterns ----------

const PAGE_HEADER = /^Foothill - De Anza District\b.*-\s*\d{5,}$/;
const PRIVATE_LINE = /^(Student name|Student ID|Overall GPA|Degree progress)\b|^\d+% \d+%/;
const BLOCK_HEADER = /^(.+?) (COMPLETE|INCOMPLETE|IN-PROGRESS)$/;
const SECTION_HEADER = /^(Electives|Not Counted|In-progress|Non-Degree Applicable) Units applied:/;
const STILL_NEEDED = /^(.*?)\s*Still needed:\s*(.*)$/;
const CLASS_LIST = /(\d+) Class(?:es)? in (.+)$/;
const UNITS_LEFT = /you still need ([\d.]+)/;
const SUB_HEADING_NOTE = /^AREA \d+ - [A-Z&,' ]+? ([A-Z][a-z].*)$/;
const CONTINUATION = /^(or\s|[A-Z][A-Z/_]{0,5}\s[DFC]\d|[DFC]\d)/;

const GRADE = String.raw`A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|P|NP|W|EW|MW|IP|CR|NC|I`;
const COURSE_ROW = new RegExp(
  String.raw`\b([A-Z][A-Z/_]{1,5}) ([DFC]\d+[A-Z]*\.?) (.+?) (${GRADE}) \(?(\d+(?:\.\d+)?)\)? (\d{4}) (Fall|Winter|Spring|Summer)\b(.*)$`,
);

const BLOCK_STATUS: Record<string, AuditRequirement['status']> = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  'IN-PROGRESS': 'in_progress',
};

// ---------- helpers ----------

function campusFrom(text: string): string | null {
  if (/\bFoothill\b/.test(text)) return 'foothill';
  if (/\b(De|Anza)\b/.test(text)) return 'deanza';
  return null;
}

/** "AFAM D011. or D025. or ARTS D001A Except @ @ ..." -> ['AFAM 11', 'AFAM 25', 'ARTS 1A'] */
export function parseOptionList(text: string): CourseCode[] {
  const cleaned = text.replace(/\bExcept\b.*$/, '');
  const out = new Set<CourseCode>();
  let subject: string | undefined;
  for (const token of cleaned.split(/\s+or\s+|^or\s+|\s+or$/)) {
    const t = token.trim();
    if (!t || t.includes('@')) continue;
    const withSubject = t.match(/^([A-Z][A-Z/_]*)\s+(\S+)$/);
    if (withSubject) subject = withSubject[1];
    const n = normalizeFhdaCode(t, subject);
    if (n) out.add(n.code);
  }
  return [...out];
}

function statusFor(grade: string, section: string | null): CourseStatus {
  if (grade === 'IP') return 'in_progress';
  if (grade === 'W' || grade === 'EW' || grade === 'MW') return 'withdrawn';
  if (section === 'Not Counted' || section === 'Non-Degree Applicable') return 'not_counted';
  return 'completed';
}

// ---------- parser ----------

export function parseFhdaDegreeWorks(text: string): ParsedAudit {
  if (!/Degree Works/.test(text) || !/Foothill - De Anza District/.test(text)) {
    throw new NotAnAuditError("This doesn't look like a Foothill-De Anza DegreeWorks audit.");
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !PAGE_HEADER.test(l) && !PRIVATE_LINE.test(l));

  let auditDate = '';
  let catalogYear = '';
  let degree = '';

  const requirements: AuditRequirement[] = [];
  const courses = new Map<string, CourseRecord>();

  let block = '';
  let blockSummary: AuditRequirement | null = null;
  let section: string | null = null;
  let lastLabel = '';
  /** Requirement whose course list is still being read across lines. */
  let open: AuditRequirement | null = null;
  let labelPending = false;
  let note: string[] | null = null;

  const closeNote = () => {
    if (note && blockSummary) blockSummary.notes = note.join(' ');
    note = null;
  };
  const closeOpen = () => {
    if (open) open.options = parseOptionList(open.rawText.replace(/^.*?Class(?:es)? in /, ''));
    open = null;
    labelPending = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    const row = line.match(COURSE_ROW);

    // 1) still reading a multi-line course list?
    if (open) {
      const sn = line.match(STILL_NEEDED);
      if (sn && !sn[2]) {
        // label printed after its list (pdf layout quirk)
        if (labelPending && sn[1]) open.label = sn[1];
        labelPending = false;
        continue;
      }
      if (!row && CONTINUATION.test(line)) {
        open.rawText += ' ' + line;
        continue;
      }
      closeOpen();
    }

    // 2) header fields
    let m: RegExpMatchArray | null;
    if (!auditDate && (m = line.match(/^Audit date (\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
      auditDate = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      continue;
    }
    if (!degree && (m = line.match(/^Degree (?!-)(.+)$/))) {
      degree = m[1];
      continue;
    }
    if (!catalogYear && (m = line.match(/Catalog year: (\d{4}-\d{4})/))) catalogYear = m[1];

    // 3) block / section headers
    if ((m = line.match(SECTION_HEADER))) {
      closeNote();
      section = m[1];
      block = m[1];
      blockSummary = null;
      continue;
    }
    if (!row && (m = line.match(BLOCK_HEADER))) {
      closeNote();
      block = m[1];
      section = null;
      lastLabel = '';
      blockSummary = { block, label: block, status: BLOCK_STATUS[m[2]], options: [], rawText: line };
      requirements.push(blockSummary);
      continue;
    }

    // 4) course rows
    if (row) {
      closeNote();
      const [, subj, num, title, grade, units, year, season, rest] = row;
      const norm = normalizeFhdaCode(`${subj} ${num}`);
      const label = line.slice(0, row.index).trim();
      if (label) lastLabel = label.replace(/^Option \d+:/, '').trim();
      if (!norm) continue;
      const term = `${year} ${season}`;
      const record: CourseRecord = {
        code: norm.code,
        campus: norm.campus ?? campusFrom(rest) ?? campusFrom(next),
        title: title.trim(),
        grade: grade === 'IP' ? null : grade,
        units: parseFloat(units),
        term,
        status: statusFor(grade, section),
      };
      const key = `${record.code}|${term}`;
      const prev = courses.get(key);
      courses.set(key, prev ? { ...prev, campus: prev.campus ?? record.campus } : record);
      continue;
    }

    // 5) "N more units/credits" for the current block
    if ((m = line.match(UNITS_LEFT)) && blockSummary && blockSummary.unitsNeeded === undefined) {
      blockSummary.unitsNeeded = parseFloat(m[1]);
    }

    // 6) "Still needed: 1 Class in ..." (label may come before, on, or after this line)
    const list = line.match(CLASS_LIST);
    if (list) {
      closeNote();
      const sn = line.match(STILL_NEEDED);
      const sameLineLabel = sn?.[1]?.trim();
      open = {
        block,
        label: sameLineLabel || lastLabel || block,
        status: 'incomplete',
        classesNeeded: parseInt(list[1], 10),
        options: [],
        rawText: `${list[1]} Class in ${list[2]}`,
      };
      labelPending = !sn;
      requirements.push(open);
      continue;
    }

    // 7) block rules like "At least two(2) courses from at least two different disciplines."
    const isStructural = STILL_NEEDED.test(line) || /^Blocks included/.test(line);
    if (!isStructural && (m = line.match(SUB_HEADING_NOTE))) {
      note = [m[1]];
      continue;
    }
    if (note && !isStructural) {
      note.push(line);
      continue;
    }
    closeNote();
  }
  closeOpen();
  closeNote();

  return {
    source: 'degreeworks',
    districtId: 'fhda',
    auditDate,
    catalogYear,
    degree,
    courses: [...courses.values()],
    requirements,
  };
}
