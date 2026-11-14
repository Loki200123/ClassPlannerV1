// Combines a parsed audit + (optional) transfer agreement into one plan:
//   - courses: specific classes to take, with every requirement each one counts for
//   - choices: open picks like "1 class from Area 3" (decided later by schedule/professor)
import type { AuditSnapshot, CourseCode, ReqExpr, TransferAgreement } from '../model/types';

type Audit = Pick<AuditSnapshot, 'courses' | 'requirements'>;

export interface PlanCourse {
  code: CourseCode;
  /** Every requirement this class counts toward. Length > 1 = double count. */
  countsFor: string[];
}

export interface OpenChoice {
  label: string;
  block: string;
  pick: number;
  options: CourseCode[];
  notes?: string;
}

export interface Plan {
  courses: PlanCourse[];
  choices: OpenChoice[];
  /** Things to flag that aren't classes (units left, US 1–3, grade rules...). */
  notes: string[];
  /** Transfer requirements that can't be met at this college. */
  blocked: string[];
}

interface Need {
  label: string;
  block: string;
  /** Each alternative is a set of courses that together satisfy the need. */
  alternatives: CourseCode[][];
  /** GE area: one course can only count for one GE area. */
  geArea?: string;
  notes?: string;
}

/** Above this many alternatives, the need becomes an open choice instead of an auto pick. */
const MAX_AUTO_PICK = 10;
const MAX_ALTERNATIVES = 50;

// ---------- requirement trees -> alternatives ----------

export function alternatives(expr: ReqExpr, taken: ReadonlySet<CourseCode>): CourseCode[][] {
  switch (expr.kind) {
    case 'none':
      return [];
    case 'course':
      return [taken.has(expr.code) ? [] : [expr.code]];
    case 'any':
      return expr.items.flatMap((i) => alternatives(i, taken)).slice(0, MAX_ALTERNATIVES);
    case 'all': {
      let acc: CourseCode[][] = [[]];
      for (const item of expr.items) {
        const alts = alternatives(item, taken);
        if (alts.length === 0) return [];
        acc = acc.flatMap((a) => alts.map((b) => [...new Set([...a, ...b])])).slice(0, MAX_ALTERNATIVES);
      }
      return acc;
    }
  }
}

const isGeBlock = (block: string) => /^AREA \d/.test(block);
const honorsCount = (alt: CourseCode[]) => alt.filter((c) => /\d[A-Z]*H$/.test(c)).length;

// ---------- planner ----------

export function buildPlan(audit: Audit, agreement?: TransferAgreement): Plan {
  const taken = new Set(
    audit.courses.filter((c) => c.status === 'completed' || c.status === 'in_progress').map((c) => c.code),
  );
  const needs: Need[] = [];
  const notes: string[] = [];
  const blocked: string[] = [];
  const blockNotes = new Map<string, string>();

  // audit "Still needed" lists
  for (const r of audit.requirements) {
    if (r.options.length && r.status !== 'complete') {
      needs.push({
        label: r.label,
        block: r.block,
        // DegreeWorks lists classes you already took too; they're already applied elsewhere
        alternatives: r.options.filter((o) => !taken.has(o)).map((o) => [o]),
        geArea: isGeBlock(r.block) ? r.block : undefined,
      });
    } else if (r.label === r.block && r.status !== 'complete') {
      if (r.unitsNeeded) notes.push(`${r.block}: ${r.unitsNeeded} more units needed.`);
      if (r.notes) blockNotes.set(r.block, r.notes);
    }
  }

  // transfer agreement: 'all' and 'count' groups become needs; 'units' groups run last
  const unitGroups: TransferAgreement['groups'] = [];
  if (agreement) {
    const school = agreement.toInstitution;
    for (const g of agreement.groups) {
      if (g.rule.kind === 'units') {
        unitGroups.push(g);
        continue;
      }
      if (g.rule.kind === 'all') {
        for (const a of g.articulations) {
          const alts = alternatives(a.sending, taken);
          const label = `${school} ${a.receiving.code} (${g.title})`;
          if (alts.length === 0) blocked.push(label);
          else needs.push({ label, block: g.title, alternatives: alts });
        }
      } else {
        // count n — n is 1 in every agreement seen so far
        const alts = g.articulations.flatMap((a) => alternatives(a.sending, taken));
        needs.push({ label: `${school} ${g.title} (pick ${g.rule.n})`, block: g.title, alternatives: alts });
      }
    }
    notes.push(...agreement.notes);
  }

  // ---------- pick courses ----------
  const chosen = new Set<CourseCode>();
  const geUse = new Map<CourseCode, string>(); // course -> GE area it already counts for
  const countsFor = new Map<CourseCode, string[]>();
  const credit = (codes: CourseCode[], label: string) =>
    codes.forEach((c) => countsFor.set(c, [...(countsFor.get(c) ?? []), label]));

  const usable = (code: CourseCode, need: Need) =>
    (taken.has(code) || chosen.has(code)) &&
    (!need.geArea || !geUse.has(code) || geUse.get(code) === need.geArea);

  const satisfiedAlt = (need: Need) =>
    need.alternatives.find((alt) => alt.every((c) => usable(c, need)));

  const record = (need: Need, alt: CourseCode[]) => {
    const fresh = alt.filter((c) => !taken.has(c));
    credit(fresh, need.label);
    if (need.geArea) fresh.forEach((c) => geUse.set(c, need.geArea!));
  };

  const done = new Set<Need>();
  const overlap = (alt: CourseCode[], self: Need) =>
    needs.filter(
      (n) =>
        n !== self && !done.has(n) && n.alternatives.some((a) => a.some((c) => alt.includes(c))) &&
        !(n.geArea && self.geArea && n.geArea !== self.geArea),
    ).length;

  // most constrained first, so single-option needs (PHYS 4A) get placed before open ones
  const ordered = [...needs].sort((a, b) => a.alternatives.length - b.alternatives.length);
  const deferred: Need[] = [];

  for (const need of ordered) {
    const hit = satisfiedAlt(need);
    if (hit) {
      record(need, hit);
      done.add(need);
      continue;
    }
    if (need.alternatives.length > MAX_AUTO_PICK) {
      deferred.push(need);
      continue;
    }
    const best = [...need.alternatives].sort((x, y) => {
      const newX = x.filter((c) => !taken.has(c) && !chosen.has(c)).length;
      const newY = y.filter((c) => !taken.has(c) && !chosen.has(c)).length;
      return newX - newY || overlap(y, need) - overlap(x, need) || honorsCount(x) - honorsCount(y);
    })[0];
    best.forEach((c) => !taken.has(c) && chosen.add(c));
    record(need, best);
    done.add(need);
  }

  // units groups (e.g. SJSU science electives): count what's covered, top up with cheapest
  for (const g of unitGroups) {
    if (g.rule.kind !== 'units') continue;
    const have = (c: CourseCode) => taken.has(c) || chosen.has(c);
    const scored = g.articulations
      .map((a) => ({ a, alts: alternatives(a.sending, taken) }))
      .filter((s) => s.alts.length > 0);
    let units = 0;
    const pending: typeof scored = [];
    for (const s of scored) {
      const hit = s.alts.find((alt) => alt.every(have));
      if (hit) {
        units += s.a.receiving.units.value;
        credit(hit.filter((c) => !taken.has(c)), `${agreement!.toInstitution} ${s.a.receiving.code} (${g.title})`);
      } else pending.push(s);
    }
    const cost = (alt: CourseCode[]) => alt.filter((c) => !have(c)).length;
    pending.sort(
      (x, y) =>
        Math.min(...x.alts.map(cost)) / x.a.receiving.units.value -
        Math.min(...y.alts.map(cost)) / y.a.receiving.units.value,
    );
    for (const s of pending) {
      if (units >= g.rule.min) break;
      const alt = [...s.alts].sort((x, y) => cost(x) - cost(y) || honorsCount(x) - honorsCount(y))[0];
      alt.forEach((c) => !taken.has(c) && chosen.add(c));
      credit(alt.filter((c) => !taken.has(c)), `${agreement!.toInstitution} ${s.a.receiving.code} (${g.title})`);
      units += s.a.receiving.units.value;
    }
  }

  // open choices: deferred needs that the picks above didn't already cover
  const choices: OpenChoice[] = [];
  for (const need of deferred) {
    const hit = satisfiedAlt(need);
    if (hit) {
      record(need, hit);
      continue;
    }
    choices.push({
      label: need.label,
      block: need.block,
      pick: 1,
      // can't reuse a class that already counts for another GE area
      options: need.alternatives
        .map((a) => a[0])
        .filter((c) => !need.geArea || !geUse.has(c) || geUse.get(c) === need.geArea),
      notes: blockNotes.get(need.block),
    });
  }

  return {
    courses: [...chosen].map((code) => ({ code, countsFor: countsFor.get(code) ?? [] })),
    choices,
    notes,
    blocked,
  };
}
