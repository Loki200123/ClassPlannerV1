import type { AgreementGroup, CourseCode, ReqExpr, TransferAgreement } from './types';

export type Taken = ReadonlySet<CourseCode>;

/**
 * Courses still needed to satisfy `expr` using the cheapest option.
 * [] = already satisfied, null = impossible (e.g. "No Current Articulation").
 */
export function cheapestPath(expr: ReqExpr, taken: Taken): CourseCode[] | null {
  switch (expr.kind) {
    case 'none':
      return null;
    case 'course':
      return taken.has(expr.code) ? [] : [expr.code];
    case 'all': {
      const out = new Set<CourseCode>();
      for (const item of expr.items) {
        const p = cheapestPath(item, taken);
        if (p === null) return null;
        p.forEach((code) => out.add(code));
      }
      return [...out];
    }
    case 'any': {
      let best: CourseCode[] | null = null;
      for (const item of expr.items) {
        const p = cheapestPath(item, taken);
        if (p !== null && (best === null || p.length < best.length)) best = p;
      }
      return best;
    }
  }
}

export interface NeededItem {
  receiving: CourseCode;
  courses: CourseCode[];
}

export interface GroupResult {
  title: string;
  satisfied: boolean;
  needed: NeededItem[];
  /** Required items that can't be satisfied from this college. */
  blocked: CourseCode[];
}

export function evaluateGroup(group: AgreementGroup, taken: Taken): GroupResult {
  const scored = group.articulations.map((a) => ({ a, path: cheapestPath(a.sending, taken) }));
  const possible = scored.filter((s): s is { a: typeof s.a; path: CourseCode[] } => s.path !== null);
  const toNeeded = (s: (typeof possible)[number]): NeededItem => ({
    receiving: s.a.receiving.code,
    courses: s.path,
  });
  const rule = group.rule;

  if (rule.kind === 'all') {
    const blocked = scored.filter((s) => s.path === null).map((s) => s.a.receiving.code);
    const needed = possible.filter((s) => s.path.length > 0).map(toNeeded);
    return { title: group.title, satisfied: needed.length === 0 && blocked.length === 0, needed, blocked };
  }

  if (rule.kind === 'count') {
    const picked = [...possible].sort((x, y) => x.path.length - y.path.length).slice(0, rule.n);
    const needed = picked.filter((s) => s.path.length > 0).map(toNeeded);
    const enough = picked.length >= rule.n;
    return { title: group.title, satisfied: enough && needed.length === 0, needed, blocked: [] };
  }

  // units rule: count what's done, then add the cheapest courses-per-unit until min is reached
  let units = possible.filter((s) => s.path.length === 0).reduce((sum, s) => sum + s.a.receiving.units.value, 0);
  const needed: NeededItem[] = [];
  const candidates = possible
    .filter((s) => s.path.length > 0)
    .sort(
      (x, y) =>
        x.path.length / x.a.receiving.units.value - y.path.length / y.a.receiving.units.value ||
        y.a.receiving.units.value - x.a.receiving.units.value,
    );
  for (const s of candidates) {
    if (units >= rule.min) break;
    needed.push(toNeeded(s));
    units += s.a.receiving.units.value;
  }
  return { title: group.title, satisfied: needed.length === 0 && units >= rule.min, needed, blocked: [] };
}

export interface AgreementResult {
  groups: GroupResult[];
  /** Deduped list of community college courses still needed. */
  allNeeded: CourseCode[];
}

export function evaluateAgreement(agreement: TransferAgreement, taken: Taken): AgreementResult {
  const groups = agreement.groups.map((g) => evaluateGroup(g, taken));
  const all = new Set<CourseCode>();
  groups.forEach((g) => g.needed.forEach((n) => n.courses.forEach((code) => all.add(code))));
  return { groups, allNeeded: [...all] };
}
