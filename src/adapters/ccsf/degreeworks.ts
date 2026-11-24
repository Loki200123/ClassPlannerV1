// Parser for City College of San Francisco DegreeWorks audit PDFs (after pdf-text.ts turns them into lines).
// Output never contains the student's name, ID, or GPA.
import type { AuditRequirement, CourseCode, CourseRecord, CourseStatus, NormalizedCode } from '../../model/types';
import { NotAnAuditError, type ParsedAudit } from '../fhda/degreeworks';

// ---------- course codes ----------

/**
 * CCSF pads course numbers with underscores to 3 characters: "PHYC __4A" -> "PHYC 4A", "MATH _90" -> "MATH 90".
 * Statewide common course numbers keep their C: "ENGL C1000".
 */
export function normalizeCcsfCode(raw: string, defaultSubject?: string): NormalizedCode | null {
  const s = raw.trim().toUpperCase().replace(/\.$/, '');
  const m = s.match(/^(?:([A-Z][A-Z_&/]*)\s+)?_*([A-Z]?\d+[A-Z]*)$/);
  if (!m) return null;
  const subject = m[1] ?? defaultSubject?.toUpperCase();
  if (!subject) return null;
  const num = m[2].replace(/^([A-Z]?)0+(\d)/, '$1$2');
  return { code: `${subject} ${num}`, campus: 'ccsf' };
}

/** "AMSL __1A or __1B or CHIN __1 Except @ ..." -> ['AMSL 1A', 'AMSL 1B', 'CHIN 1'] */
export function parseCcsfOptionList(text: string): CourseCode[] {
  const cleaned = text.replace(/\bExcept\b.*$/, '');
  const out = new Set<CourseCode>();
  let subject: string | undefined;
  for (const token of cleaned.split(/\s+or\s+|^or\s+|\s+or$/)) {
    const t = token.trim();
    if (!t || t.includes('@')) continue;
    const withSubject = t.match(/^([A-Z][A-Z_&/]*)\s+(\S+)$/);
    if (withSubject) subject = withSubject[1];
    const n = normalizeCcsfCode(t, subject);
    if (n) out.add(n.code);
  }
  return [...out];
}

// ---------- line patterns ----------

const PAGE_HEADER = /^City College Of San Francisco\b.* - [A-Z]{0,3}\d{5,}$/i;
const PRIVATE_LINE = /^(Student name|Student ID|Cumulative GPA|Your GPA is|Program progress)\b|^\d+% \d+%/;
const BLOCK_HEADER = /^(.+?) (COMPLETE|INCOMPLETE|IN-PROGRESS)$/;
const SECTION_HEADER = /^(Electives|Not Counted|In-progress|Non-Degree Applicable|Insufficient) Units applied:/;
const STILL_NEEDED = /^(.*?)\s*Still needed:\s*(.*)$/;
const LIST = /(\d+(?:\.\d+)?) (Course|Courses|Class|Classes|Units?|Credits?) in (.+)$/;
const UNITS_LEFT = /(?:complete a minimum of|you still need a minimum of) ([\d.]+)/i;
const AREA_HEADING = /^AREA (\d+): /;
const SUB_AREA = /^Area (\d+[A-Z]?): /;
const CONTINUATION = /^(or\s|_|[A-Z][A-Z_&/]{0,5}\s[_C]?\d|\d{2,4}[A-Z]{0,3}(\s+or\b|$))/;

const GRADE = String.raw`A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|P|NP|W|EW|MW|IP|CR|NC|I|REG|TR`;
const COURSE_ROW = new RegExp(
  String.raw`\b([A-Z][A-Z_&/]{0,5}) (_{0,2}[A-Z]?\d+[A-Z]*) (.+?) (${GRADE}) \(?(\d+(?:\.\d+)?)\)? (Fall|Winter|Spring|Summer) (\d{4})\b(.*)$`,
);

/** CCSF GE area names (headings wrap across lines in the PDF). */
const AREA_NAMES: Record<string, string> = {
  '1': 'English Communication',
  '2': 'Mathematical Concepts and Quantitative Reasoning',
  '3': 'Arts and Humanities',
  '4': 'Social and Behavioral Sciences',
  '5': 'Natural Sciences',
  '6': 'Ethnic Studies',
};

const BLOCK_STATUS: Record<string, AuditRequirement['status']> = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  'IN-PROGRESS': 'in_progress',
};

function statusFor(grade: string, section: string | null): CourseStatus {
  if (grade === 'IP' || grade === 'REG') return 'in_progress';
  if (grade === 'W' || grade === 'EW' || grade === 'MW') return 'withdrawn';
  if (section === 'Not Counted' || section === 'Non-Degree Applicable' || section === 'Insufficient') return 'not_counted';
  return 'completed';
}

/** "Calculus I - 5 units" -> "Calculus I" */
const cleanLabel = (s: string) => s.replace(/\s+-\s+[\d.]+ units?$/i, '').trim();

// ---------- parser ----------

export function parseCcsfDegreeWorks(text: string): ParsedAudit {
  if (!/Degree Works/i.test(text) || !/City College Of San Francisco/i.test(text)) {
    throw new NotAnAuditError("This doesn't look like a City College of San Francisco DegreeWorks audit.");
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
  let area: string | null = null; // "AREA 4: Social and Behavioral Sciences"
  let open: AuditRequirement | null = null;
  let labelPending = false;

  const closeOpen = () => {
    if (open) open.options = parseCcsfOptionList(open.rawText.replace(LIST, '$3'));
    open = null;
    labelPending = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    const row = line.match(COURSE_ROW);
    let m: RegExpMatchArray | null;

    // 1) still reading a multi-line course list?
    if (open) {
      const sn = line.match(STILL_NEEDED);
      if (sn && !sn[2]) {
        // label printed after its list: "AREA 4: Social and Behavioral Sciences Still needed:"
        if (labelPending && sn[1]) {
          if ((m = sn[1].match(AREA_HEADING))) {
            area = `AREA ${m[1]}: ${AREA_NAMES[m[1]] ?? sn[1].slice(m[0].length)}`;
            open.block = area;
            open.label = area;
          } else {
            open.label = cleanLabel(sn[1]);
          }
        }
        labelPending = false;
        continue;
      }
      const startsSomethingNew = STILL_NEEDED.test(line) || AREA_HEADING.test(line) || SUB_AREA.test(line);
      if (!row && !startsSomethingNew && CONTINUATION.test(line)) {
        open.rawText += ' ' + line;
        continue;
      }
      // a wrapped label ("...Critical" / "Thinking") sits between two list lines
      if (!row && CONTINUATION.test(next) && /^[A-Za-z&,' ]+$/.test(line) && line.split(' ').length <= 4) {
        if (!labelPending) open.label += ' ' + line;
        continue;
      }
      closeOpen();
    }

    // 2) header fields
    if (!auditDate && (m = line.match(/^Audit date (\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
      auditDate = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      continue;
    }
    if (!degree && (m = line.match(/^Program (?!Requirements|progress)(.+)$/))) {
      degree = m[1];
      continue;
    }
    if (!catalogYear && (m = line.match(/Catalog year: (\d{4}-\d{4})/))) catalogYear = m[1];

    // 3) block / section headers
    if ((m = line.match(SECTION_HEADER))) {
      section = m[1];
      block = m[1];
      blockSummary = null;
      area = null;
      continue;
    }
    if (!row && (m = line.match(BLOCK_HEADER))) {
      block = m[1];
      section = null;
      area = null;
      blockSummary = { block, label: block, status: BLOCK_STATUS[m[2]], options: [], rawText: line };
      requirements.push(blockSummary);
      continue;
    }
    if ((m = line.match(AREA_HEADING))) area = `AREA ${m[1]}: ${AREA_NAMES[m[1]] ?? ''}`.trim();

    // 4) course rows (may follow a label on the same line)
    if (row) {
      const [, subj, num, title, grade, units, season, year] = row;
      const norm = normalizeCcsfCode(`${subj} ${num}`);
      if (norm) {
        const term = `${year} ${season}`;
        const record: CourseRecord = {
          code: norm.code,
          campus: 'ccsf',
          title: title.trim(),
          grade: grade === 'IP' || grade === 'REG' ? null : grade,
          units: parseFloat(units),
          term,
          status: statusFor(grade, section),
        };
        const key = `${record.code}|${term}`;
        if (!courses.has(key)) courses.set(key, record);
      }
      continue;
    }

    // 5) units still needed for the current block
    if ((m = line.match(UNITS_LEFT)) && blockSummary && blockSummary.unitsNeeded === undefined) {
      blockSummary.unitsNeeded = parseFloat(m[1]);
    }

    // 6) "Still needed: 1 Course in ..." / "3 Units in ..." (label before, on, or after this line)
    const list = line.match(LIST);
    if (list) {
      const sn = line.match(STILL_NEEDED);
      let label = cleanLabel(sn?.[1] ?? '');
      let reqBlock = area ?? block;
      if ((m = label.match(AREA_HEADING))) {
        area = `AREA ${m[1]}: ${AREA_NAMES[m[1]] ?? label.slice(m[0].length)}`;
        reqBlock = area;
        label = area;
      } else if (!SUB_AREA.test(label) && area && !label) {
        label = area;
      } else if (!SUB_AREA.test(label) && !area) {
        reqBlock = block;
      }
      const isUnits = /^Units?$|^Credits?$/i.test(list[2]);
      open = {
        block: reqBlock,
        label: label || reqBlock,
        status: 'incomplete',
        ...(isUnits ? { unitsNeeded: parseFloat(list[1]), classesNeeded: 1 } : { classesNeeded: parseInt(list[1], 10) }),
        options: [],
        rawText: list[0],
      };
      labelPending = !sn;
      requirements.push(open);
      continue;
    }
  }
  closeOpen();

  return {
    source: 'degreeworks',
    districtId: 'ccsf',
    auditDate,
    catalogYear,
    degree,
    courses: [...courses.values()],
    requirements,
  };
}
