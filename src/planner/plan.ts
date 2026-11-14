// Planner: merges DegreeWorks (ADT + GE) and ASSIST (transfer) requirements,
// then picks the smallest set of classes, preferring ones that count twice.
import type { AuditSnapshot, CourseCode, ReqExpr, TransferAgreement } from '../model/types';

export type Bundle = CourseCode[]; // courses that must all be taken together

export interface NeedItem {
  weight: number; // 1 for "classes", unit value for "units"
  bundles: Bundle[]; // any one bundle satisfies the item
}

export interface Need {
  id: string;
  label: string;
  source: 'degreeworks' | 'assist';
  /** How many items (or units) are required. */
  required: number;
  items: NeedItem[];
  /**
   * GE area. A course can count toward only one GE area,
   * but GE can still double count with major (ADT) and transfer needs.
   */
  exclusive?: string;
}

export interface RecommendedCourse {
  code: CourseCode;
  countsFor: string[]; // need labels
}

export interface OpenChoice {
  needId: string;
  label: string;
  /** Pick from these; honors versions are collapsed into the regular one. */
  options: Bundle[];
}

export interface PlanResult {
  recommended: RecommendedCourse[];
  choices: OpenChoice[];
  /** Needs that can't be met from this college at all. */
  blocked: string[];
  /** Notes to show the student (US 1–3, PE, grade rules...). */
  flags: string[];
}

// ---------- building needs ----------

const MAX_BUNDLES = 64;

/** Every minimal way to satisfy `expr`, minus what's already taken. [] bundle = already done. */
export function alternatives(expr: ReqExpr, taken: ReadonlySet<CourseCode>): Bundle[] {
  let out: Bundle[];
  switch (expr.kind) {
    case 'none':
      return [];
    case 'course':
      return [taken.has(expr.code) ? [] : [expr.code]];
    case 'any':
      out = expr.items.flatMap((i) => alternatives(i, taken));
      break;
    case 'all': {
      out = [[]];
      for (const item of expr.items) {
        const alts = alternatives(item, taken);
        if (alts.length === 0) return [];
        out = out.flatMap((a) => alts.map((b) => [...new Set([...a, ...b])])).slice(0, MAX_BUNDLES);
      }
      break;
    }
  }
  return minimalBundles(out);
}

function minimalBundles(bundles: Bundle[]): Bundle[] {
  const sorted = [...bundles].map((b) => [...b].sort()).sort((a, b) => a.length - b.length);
  const kept: Bundle[] = [];
  for (const b of sorted) {
    if (!kept.some((k) => k.every((c) => b.includes(c)))) kept.push(b);
  }
  return kept;
}

function doneCodes(audit: AuditSnapshot | Omit<AuditSnapshot, 'id' | 'userId'>): Set<CourseCode> {
  return new Set(
    audit.courses.filter((c) => c.status === 'completed' || c.status === 'in_progress').map((c) => c.code),
  );
}

export function buildNeeds(
  audit: Omit<AuditSnapshot, 'id' | 'userId'>,
  agreement?: TransferAgreement,
): { needs: Need[]; taken: Set<CourseCode>; blocked: string[] } {
  const taken = doneCodes(audit);
  const needs: Need[] = [];
  const blocked: string[] = [];

  // DegreeWorks: every "Still needed: N Class in ..." list
  audit.requirements.forEach((r, i) => {
    if (r.status === 'complete' || r.options.length === 0) return;
    needs.push({
      id: `dw-${i}`,
      label: r.block === r.label ? r.label : `${r.block} — ${r.label}`,
      source: 'degreeworks',
      required: r.classesNeeded ?? 1,
      exclusive: /^AREA \d/.test(r.block) ? r.block : undefined,
      // DegreeWorks lists courses already used elsewhere as options; they can't count again
      items: r.options.filter((code) => !taken.has(code)).map((code) => ({ weight: 1, bundles: [[code]] })),
    });
  });

  // ASSIST: one need per articulation in "all" groups, one need per group otherwise
  if (agreement) {
    const school = agreement.toInstitution;
    agreement.groups.forEach((g, gi) => {
      const items = g.articulations.map((a) => ({
        a,
        item: { weight: g.rule.kind === 'units' ? a.receiving.units.value : 1, bundles: alternatives(a.sending, taken) },
      }));
      if (g.rule.kind === 'all') {
        items.forEach(({ a, item }, ai) => {
          const label = `${school} ${a.receiving.code} (${a.receiving.title})`;
          if (item.bundles.length === 0) blocked.push(label);
          else needs.push({ id: `as-${gi}-${ai}`, label, source: 'assist', required: 1, items: [item] });
        });
      } else {
        needs.push({
          id: `as-${gi}`,
          label: `${school} ${g.title}`,
          source: 'assist',
          required: g.rule.kind === 'count' ? g.rule.n : g.rule.min,
          items: items.map((x) => x.item).filter((it) => it.bundles.length > 0),
        });
      }
    });
  }
  return { needs, taken, blocked };
}

// ---------- choosing courses ----------

/** course -> GE area it has been assigned to */
type Claims = Map<CourseCode, string>;

function usable(need: Need, c: CourseCode, have: ReadonlySet<CourseCode>, claims: Claims): boolean {
  if (!have.has(c)) return false;
  if (!need.exclusive) return true;
  const owner = claims.get(c);
  return owner === undefined || owner === need.exclusive;
}

function progress(need: Need, have: ReadonlySet<CourseCode>, claims: Claims): number {
  let sum = 0;
  for (const item of need.items) {
    if (item.bundles.some((b) => b.every((c) => usable(need, c, have, claims)))) sum += item.weight;
  }
  return Math.min(sum, need.required);
}

const isMet = (n: Need, have: ReadonlySet<CourseCode>, claims: Claims) => progress(n, have, claims) >= n.required;
const honorsKey = (b: Bundle) => b.map((c) => c.replace(/H$/, '')).sort().join('+');
const honorsCount = (b: Bundle) => b.filter((c) => /H$/.test(c)).length;

export function planCourses(
  needs: Need[],
  taken: ReadonlySet<CourseCode>,
  blocked: string[] = [],
  flags: string[] = [],
): PlanResult {
  const have = new Set(taken);
  const claims: Claims = new Map();
  const chosen: CourseCode[] = [];
  const add = (b: Bundle, area?: string) => {
    for (const c of b) {
      if (!have.has(c)) (have.add(c), chosen.push(c));
      if (area && !claims.has(c)) claims.set(c, area);
    }
  };
  const unmet = () => needs.filter((n) => !isMet(n, have, claims));

  // Phase 1: greedily take bundles that help 2+ needs (double counting).
  // GE needs from different areas can't share a course, so only the best GE area counts.
  for (;;) {
    const open = unmet();
    let best: { b: Bundle; score: number; touched: number; area?: string } | null = null;
    for (const need of open) {
      for (const item of need.items) {
        for (const b of item.bundles) {
          const fresh = b.filter((c) => !have.has(c));
          if (fresh.length === 0) continue;
          const after = new Set([...have, ...fresh]);
          let gain = 0;
          let touched = 0;
          const byArea = new Map<string, { gain: number; touched: number }>();
          for (const m of open) {
            const d = (progress(m, after, claims) - progress(m, have, claims)) / m.required;
            if (d <= 0) continue;
            if (!m.exclusive) (gain += d), touched++;
            else {
              const a = byArea.get(m.exclusive) ?? { gain: 0, touched: 0 };
              a.gain += d;
              a.touched++;
              byArea.set(m.exclusive, a);
            }
          }
          let area: string | undefined;
          let areaBest = { gain: 0, touched: 0 };
          for (const [k, v] of byArea) if (v.gain > areaBest.gain) (area = k), (areaBest = v);
          gain += areaBest.gain;
          touched += areaBest.touched;
          if (touched < 2) continue;
          const score = gain / fresh.length;
          const better =
            !best ||
            score > best.score + 1e-9 ||
            (Math.abs(score - best.score) < 1e-9 &&
              (touched > best.touched ||
                (touched === best.touched && honorsKey(b) < honorsKey(best.b)) ||
                (touched === best.touched && honorsKey(b) === honorsKey(best.b) && honorsCount(b) < honorsCount(best.b))));
          if (better) best = { b, score, touched, area };
        }
      }
    }
    if (!best) break;
    add(best.b, best.area);
  }

  // Phase 2: remaining needs — auto-pick only when there's really one option
  const choices: OpenChoice[] = [];
  for (const need of needs) {
    while (!isMet(need, have, claims)) {
      const allowed = (c: CourseCode) => !need.exclusive || !claims.has(c) || claims.get(c) === need.exclusive;
      const candidates = need.items
        .filter((it) => !it.bundles.some((b) => b.every((c) => usable(need, c, have, claims))))
        .flatMap((it) => it.bundles)
        .filter((b) => b.every(allowed))
        .map((b) => b.filter((c) => !have.has(c)));
      if (candidates.length === 0) break;
      const minLen = Math.min(...candidates.map((b) => b.length));
      const byKey = new Map<string, Bundle>();
      for (const b of candidates.filter((x) => x.length === minLen)) {
        const k = honorsKey(b);
        const cur = byKey.get(k);
        if (!cur || honorsCount(b) < honorsCount(cur)) byKey.set(k, b);
      }
      if (byKey.size === 1) {
        add([...byKey.values()][0], need.exclusive);
        continue;
      }
      choices.push({ needId: need.id, label: need.label, options: [...byKey.values()] });
      break;
    }
  }

  const none: Claims = new Map();
  const recommended = chosen.map((code) => ({
    code,
    countsFor: needs
      .filter(
        (n) =>
          !isMet(n, taken, none) &&
          n.items.some((it) => it.bundles.some((b) => b.includes(code) && b.every((c) => usable(n, c, have, claims)))),
      )
      .map((n) => n.label),
  }));

  return { recommended, choices, blocked, flags };
}

/** One call for the UI: audit (+ optional transfer agreement) -> plan. */
export function plan(audit: Omit<AuditSnapshot, 'id' | 'userId'>, agreement?: TransferAgreement): PlanResult {
  const { needs, taken, blocked } = buildNeeds(audit, agreement);
  return planCourses(needs, taken, blocked, agreement?.notes ?? []);
}
