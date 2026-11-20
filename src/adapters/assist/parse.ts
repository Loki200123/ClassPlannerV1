// Rule-based reader for ASSIST "Major Articulation Agreement" PDFs (saved with Save as PDF).
//
// How an ASSIST page is laid out (PDF points, page is ~842 wide):
//   left  column  x < 400   university ("receiving") courses
//                            codes at x≈70 (single) or x≈79 (bundle members, joined by AND/OR at x≈62)
//   middle        400–430   connectors between lettered sections (ignored)
//   right column  x ≥ 430   community college ("sending") courses
//                            codes at x≈443 = a box with one course
//                            codes at x≈452 = a box with several courses, joined by AND/OR at x≈435–438
//                            boxes are joined by AND/OR at x≈446–450
//   headings: section title (big, x≈35), group number (big digit, x≈49) + rule text,
//             section letter (big letter, x≈62)
import type { PositionedItem } from '../../pdf/pdf-text';
import type {
  AgreementGroup,
  Articulation,
  GroupRule,
  ReqExpr,
  TermSystem,
  TransferAgreement,
} from '../../model/types';

export interface ParsedAssist {
  agreement: TransferAgreement;
  fromCollege: string;
  /** Things the reader wasn't sure about. Shown to the user. */
  warnings: string[];
}

export class NotAssistError extends Error {}
export class ImageOnlyPdfError extends Error {}

// ---------- token classification ----------

const CODE = /^([A-Z][A-Z&/]*(?: [A-Z&/]+)*) ([A-Z]{0,2}\d{1,4}[A-Z]{0,4})$/;
const UNITS = /^\d{1,2}\.\d{2}$/;
const NO_ARTIC = /^No (Course|Current) Articulat/i;
const SAME_INST = /same institution/i;
const SELECT = /^(Select|Complete) (\d+) (course|courses)\b/i;

const LEFT_MAX = 400;
const RIGHT_MIN = 430;
const OUTER_CONN_X = 441; // right-column connectors at/after this x join boxes

interface Tok extends PositionedItem {
  /** global vertical order across pages */
  g: number;
}

const isBig = (t: Tok) => t.height >= 20;
const isHeaderFooter = (t: Tok) => t.height <= 9;

// ---------- small helpers ----------

const course = (code: string): ReqExpr => ({ kind: 'course', code });

function joinExpr(kind: 'all' | 'any', items: ReqExpr[], sameInstitution = false): ReqExpr {
  if (items.length === 1) return items[0];
  return kind === 'all' ? { kind, items, ...(sameInstitution && { sameInstitution }) } : { kind, items };
}

/** "A AND B OR C" with AND binding tighter -> any(all(A,B), C) */
function combine(parts: ReqExpr[], conns: ('AND' | 'OR')[], sameInstitution = false): ReqExpr {
  const alts: ReqExpr[][] = [[parts[0]]];
  conns.forEach((c, i) => {
    if (c === 'OR') alts.push([parts[i + 1]]);
    else alts[alts.length - 1].push(parts[i + 1]);
  });
  return joinExpr(
    'any',
    alts.map((a) => joinExpr('all', a, sameInstitution)),
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Of|For|The|And|In|To)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (m) => m.toUpperCase());
}

// ---------- rule text ----------

interface RuleSpec {
  rule: GroupRule | null; // null = no rule text
  letters: string[] | null; // "from A and B" -> ['A','B'], "from the following" -> null
  raw: string;
}

function parseRule(raw: string, system: TermSystem): RuleSpec {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  let m: RegExpMatchArray | null;
  const lettersOf = (s: string) => (/the following/i.test(s) ? null : (s.match(/\b[A-Z]\b/g) ?? null));
  if (!text) return { rule: null, letters: null, raw };
  if (/^Complete the following$/i.test(text)) return { rule: { kind: 'all' }, letters: null, raw };
  if ((m = text.match(/^(?:Complete|Select) (?:up to )?(\d+(?:\.\d+)?) (semester|quarter) units? from (.+)$/i))) {
    return {
      rule: { kind: 'units', min: parseFloat(m[1]), system: m[2].toLowerCase() as TermSystem },
      letters: lettersOf(m[3]),
      raw,
    };
  }
  if ((m = text.match(/^(?:Complete|Select) (\d+) courses? from (.+)$/i))) {
    return { rule: { kind: 'count', n: parseInt(m[1], 10) }, letters: lettersOf(m[2]), raw };
  }
  void system;
  return { rule: null, letters: null, raw };
}

// ---------- main ----------

export function parseAssist(items: PositionedItem[]): ParsedAssist {
  if (items.length === 0) {
    throw new ImageOnlyPdfError('This PDF has no text in it (it was probably saved with Microsoft Print to PDF).');
  }
  const flat = items.map((i) => i.str).join(' ');
  if (!/Articulation Agreement/i.test(flat) || !/\bTo:\s/.test(flat) || !/\bFrom:\s/.test(flat)) {
    throw new NotAssistError("This doesn't look like an ASSIST articulation agreement.");
  }

  const warnings: string[] = [];
  const toks: Tok[] = items
    .map((i) => ({ ...i, g: i.page * 10000 + i.y }))
    .filter((t) => !isHeaderFooter(t))
    .sort((a, b) => a.g - b.g || a.x - b.x);

  // ----- header -----
  const firstLine = (re: RegExp) => toks.find((t) => re.test(t.str));
  const majorTok = toks.find((t) => t.height >= 26 && t.page === 1);
  const major = majorTok?.str ?? 'Unknown major';
  const toLine = firstLine(/^To: /)?.str ?? '';
  const fromLine = firstLine(/From: /)?.str ?? '';
  const toInstitution = (toLine.match(/^To: (.+?)(?: From: .*)?$/)?.[1] ?? '').trim();
  const fromCollege = (fromLine.match(/From: (.+)$/)?.[1] ?? '').trim();
  const year = flat.match(/Effective during the (\d{4}-\d{4}) academic year/)?.[1] ?? '';
  const catalogs = [...flat.matchAll(/General Catalog, (Semester|Quarter)/g)].map((m) => m[1].toLowerCase());
  const receivingSystem = (catalogs[0] ?? 'semester') as TermSystem;
  if (!toInstitution || !fromCollege) warnings.push("Couldn't find the university or college name.");

  // ----- split into groups / sections by headings -----
  interface Section {
    letter: string | null;
    toks: Tok[];
  }
  interface Group {
    number: string;
    title: string;
    ruleText: string;
    sections: Section[];
  }
  const groups: Group[] = [];
  let sectionTitle = '';
  let started = false;
  let cur: Group | null = null;

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^END OF AGREEMENT$/.test(t.str)) break;

    if (isBig(t) && t.x < 45 && /^[A-Z0-9 ,&/:()'-]+$/.test(t.str) && t.str.length > 3) {
      sectionTitle = t.str;
      continue;
    }
    if (isBig(t) && /^\d+$/.test(t.str) && t.x < 58) {
      started = true;
      // rule text: medium-size text on the same line, or a small "Select ..." line just below
      const sameLine = toks.filter((o) => o.page === t.page && Math.abs(o.y - t.y) < 6 && o.x > t.x && o.height >= 15);
      let ruleText = sameLine.map((o) => o.str).join(' ');
      if (!ruleText) {
        const below = toks.find((o) => o.g > t.g && o.g - t.g < 60 && o.x < 75 && SELECT.test(o.str));
        if (below) ruleText = below.str;
      }
      cur = { number: t.str, title: sectionTitle, ruleText, sections: [{ letter: null, toks: [] }] };
      groups.push(cur);
      continue;
    }
    if (!started || !cur) continue;
    if (isBig(t) && /^[A-Z]$/.test(t.str) && t.x > 55 && t.x < 70) {
      const last = cur.sections[cur.sections.length - 1];
      if (last.letter === null && last.toks.length === 0) last.letter = t.str;
      else cur.sections.push({ letter: t.str, toks: [] });
      continue;
    }
    if (t.height >= 15) continue; // rule text already captured
    cur.sections[cur.sections.length - 1].toks.push(t);
  }

  // ----- each section -> articulations -----
  const out: AgreementGroup[] = [];
  for (const g of groups) {
    const spec = parseRule(g.ruleText, receivingSystem);
    if (g.ruleText && !spec.rule) warnings.push(`Group ${g.number}: didn't understand "${g.ruleText}". Treated as required.`);
    const baseTitle = titleCase(g.title || `Group ${g.number}`);
    const sections = g.sections.filter((s) => s.toks.length > 0);
    const multi = sections.length > 1;

    // "Complete 1 course from the following" across several lettered sections = one pool
    if (spec.rule && spec.rule.kind !== 'all' && spec.letters === null && multi) {
      const arts = sections.flatMap((s) => readSection(s.toks, receivingSystem, warnings, g.number));
      out.push({ title: baseTitle, rule: spec.rule, articulations: arts });
      continue;
    }

    for (const s of sections) {
      const arts = readSection(s.toks, receivingSystem, warnings, g.number);
      if (arts.length === 0) continue;
      const title = multi && s.letter ? `${baseTitle} (${s.letter})` : baseTitle;
      let rule: GroupRule = { kind: 'all' };
      let optional = false;
      if (spec.rule) {
        if (spec.letters === null || (s.letter && spec.letters.includes(s.letter))) rule = spec.rule;
        else optional = true; // section not named in "from A and B"
      } else if (/ADDITIONAL|RECOMMENDED|SUGGESTED/i.test(g.title)) {
        optional = true;
      }
      out.push({ title, rule, articulations: arts, ...(optional && { optional }) });
    }
  }

  if (out.length === 0) warnings.push('No course requirements were found in this agreement.');

  const agreement: TransferAgreement = {
    id: slug(`${fromCollege}-${toInstitution}-${major}-${year}`),
    fromCollegeId: slug(fromCollege),
    toInstitution,
    major,
    academicYear: year,
    groups: out,
    notes: [],
  };
  return { agreement, fromCollege, warnings };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------- one lettered section ----------

function readSection(toks: Tok[], system: TermSystem, warnings: string[], groupNo: string): Articulation[] {
  const left = toks.filter((t) => t.x < LEFT_MAX);
  const right = toks.filter((t) => t.x >= RIGHT_MIN);

  // receiving items start at a left code/description at x≈70, or a bundle's first code at x≈79
  interface Recv {
    g: number;
    codes: string[];
    conns: ('AND' | 'OR')[];
    title: string;
    titleG?: number;
    titleX?: number;
    units: number;
    description?: string;
  }
  const recv: Recv[] = [];
  let pendingConn: 'AND' | 'OR' | null = null;
  for (const t of left) {
    if (t.x < 66 && (t.str === 'AND' || t.str === 'OR')) {
      pendingConn = t.str;
      continue;
    }
    const isCode = CODE.test(t.str) && t.x >= 65 && t.x < 90;
    const isDescription = !isCode && t.x >= 65 && t.x < 75 && !SELECT.test(t.str);
    const last = recv[recv.length - 1];
    if (isCode) {
      if (pendingConn && last) {
        last.codes.push(t.str);
        last.conns.push(pendingConn);
      } else {
        recv.push({ g: t.g, codes: [t.str], conns: [], title: '', units: 0 });
      }
      pendingConn = null;
      continue;
    }
    if (isDescription) {
      // a wrapped description continues the previous one
      if (last && last.description && last.codes.length === 0 && t.g - last.g < 25) {
        last.description += ' ' + t.str;
      } else {
        recv.push({ g: t.g, codes: [], conns: [], title: '', units: 0, description: t.str });
      }
      continue;
    }
    if (!last) continue;
    if (UNITS.test(t.str) && t.x > 340) {
      if (last.conns.length === 0 || last.conns[last.conns.length - 1] === 'AND' || last.units === 0) {
        last.units += parseFloat(t.str);
      }
      continue;
    }
    // title: text in the title column on the code's line, plus wrapped lines right under it
    if (t.x >= 140 && t.x < 340 && last.codes.length === 1) {
      if (!last.title && Math.abs(t.g - last.g) < 4) {
        last.title = t.str;
        last.titleG = t.g;
        last.titleX = t.x;
      } else if (last.titleG !== undefined && t.g - last.titleG > 10 && t.g - last.titleG < 24 && Math.abs(t.x - (last.titleX ?? 0)) < 2) {
        last.title += ' ' + t.str;
        last.titleG = t.g;
      }
    }
  }

  // assign right-column tokens to the receiving item they sit next to
  const arts: Articulation[] = [];
  recv.forEach((r, i) => {
    const start = r.g - 12;
    const end = i + 1 < recv.length ? recv[i + 1].g - 12 : Infinity;
    const mine = right.filter((t) => t.g >= start && t.g < end);
    const sending = readSending(mine);
    const code = r.description ?? r.codes.map((c, j) => (j === 0 ? c : `${r.conns[j - 1] === 'OR' ? 'or' : '+'} ${c}`)).join(' ');
    if (!sending) {
      warnings.push(`Group ${groupNo}: no community college course found next to ${code}. Treated as not offered.`);
    }
    arts.push({
      receiving: { code, title: r.title, units: { value: r.units, system } },
      sending: sending ?? { kind: 'none' },
    });
  });
  return arts;
}

// ---------- the community college side of one articulation ----------

interface Box {
  courses: ReqExpr[];
  conns: ('AND' | 'OR')[];
  same: boolean;
}

function readSending(toks: Tok[]): ReqExpr | null {
  if (toks.some((t) => NO_ARTIC.test(t.str))) return { kind: 'none' };

  const boxes: Box[] = [];
  const outer: ('AND' | 'OR')[] = [];
  let box: Box | null = null;
  let inner: 'AND' | 'OR' | null = null;
  let closeNext = false;

  for (const t of toks) {
    if (t.str === 'AND' || t.str === 'OR') {
      if (t.x >= OUTER_CONN_X) {
        if (box) outer.push(t.str);
        closeNext = true;
        inner = null;
      } else {
        inner = t.str;
      }
      continue;
    }
    if (SELECT.test(t.str)) {
      closeNext = true;
      inner = 'OR'; // "Select 1 course from the following" box
      continue;
    }
    if (SAME_INST.test(t.str)) {
      if (box) box.same = true;
      continue;
    }
    if (!CODE.test(t.str) || t.x > 470) continue; // titles, units, notes
    if (!box || closeNext) {
      if (box && closeNext && outer.length < boxes.length) outer.push('AND');
      box = { courses: [course(t.str)], conns: [], same: false };
      boxes.push(box);
      closeNext = false;
      inner = null;
      continue;
    }
    box.courses.push(course(t.str));
    box.conns.push(inner ?? 'AND');
    inner = null;
  }
  if (boxes.length === 0) return null;
  const boxExprs = boxes.map((b) => (b.courses.length === 1 ? b.courses[0] : combine(b.courses, b.conns, b.same)));
  return boxExprs.length === 1 ? boxExprs[0] : combine(boxExprs, outer.slice(0, boxExprs.length - 1));
}
