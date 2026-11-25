// Downloads the upcoming De Anza terms from Banner and writes one JSON file per term.
//   npx tsx scripts/import-schedule.ts <out-dir>
// Runs on GitHub Actions (see .github/workflows/import-schedule.yml). Exits with an error if a
// term comes back empty, so GitHub emails the repo owner that the import broke.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FHDA_BANNER,
  normalizeBannerSection,
  parseTermDescription,
  type BannerSection,
  type BannerTerm,
} from '../src/adapters/fhda/banner';
import type { Section } from '../src/model/types';
import type { ScheduleFile, ScheduleIndex } from '../src/schedule/types';

const USER_AGENT = 'ClassPlannerV1 (student project; github.com/Loki200123/ClassPlannerV1)';
const PAGE_SIZE = 500;
/** How many of the newest De Anza terms to import (e.g. Winter + Spring). */
const TERMS_TO_IMPORT = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tiny cookie-keeping client: Banner remembers the chosen term in the session. */
class BannerClient {
  private cookies = new Map<string, string>();
  constructor(private base: string) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', USER_AGENT);
    headers.set('Accept', 'application/json, text/javascript, */*');
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(this.base + path, { ...init, headers, redirect: 'follow' });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      if (res.ok || attempt >= 3) return res;
      await sleep(3000 * attempt); // back off on errors
    }
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

async function importTerm(term: BannerTerm, termId: string, now: string): Promise<Section[]> {
  const client = new BannerClient(FHDA_BANNER);
  const session = `cp${Date.now()}`;
  const form = (o: Record<string, string>) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(o).toString(),
  });
  const chosen = await client.request(
    '/term/search?mode=search',
    form({ term: term.code, studyPath: '', studyPathText: '', startDatepicker: '', endDatepicker: '', uniqueSessionId: session }),
  );
  if (!chosen.ok) throw new Error(`choosing term ${term.code} -> HTTP ${chosen.status}`);
  await sleep(1500);

  const raw: BannerSection[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const q = new URLSearchParams({
      txt_term: term.code,
      pageOffset: String(offset),
      pageMaxSize: String(PAGE_SIZE),
      sortColumn: 'subjectDescription',
      sortDirection: 'asc',
      uniqueSessionId: session,
    });
    const page = await client.json<{ success: boolean; totalCount: number; data: BannerSection[] | null }>(
      `/searchResults/searchResults?${q}`,
    );
    const rows = page.data ?? [];
    raw.push(...rows);
    console.log(`  ${term.description}: ${raw.length}/${page.totalCount}`);
    if (rows.length < PAGE_SIZE || raw.length >= page.totalCount) break;
    await sleep(1500);
  }

  const seen = new Set<string>();
  const sections: Section[] = [];
  for (const s of raw) {
    if (seen.has(s.courseReferenceNumber)) continue;
    seen.add(s.courseReferenceNumber);
    const n = normalizeBannerSection(s, termId, now);
    if (n) sections.push(n);
  }
  return sections;
}

async function main() {
  const outDir = process.argv[2] ?? 'schedule-out';
  const now = new Date().toISOString();
  const client = new BannerClient(FHDA_BANNER);
  const terms = await client.json<BannerTerm[]>('/classSearch/getTerms?searchTerm=&offset=1&max=30');

  const deAnza = terms
    .map((t) => ({ raw: t, info: parseTermDescription(t) }))
    .filter((t) => t.info?.college === 'deanza')
    .slice(0, TERMS_TO_IMPORT);
  if (deAnza.length === 0) throw new Error('No De Anza terms found in Banner.');

  const index: ScheduleIndex = { version: 1, updatedAt: now, terms: [] };
  for (const { raw, info } of deAnza) {
    const termId = `deanza-${info!.year}-${info!.season}`;
    console.log(`Importing ${raw.description} (${raw.code})`);
    const sections = await importTerm(raw, termId, now);
    if (sections.length === 0) throw new Error(`${raw.description} returned 0 sections — Banner may have changed.`);
    const { college: _college, ...term } = info!;
    const file: ScheduleFile = { version: 1, collegeId: 'deanza', term, fetchedAt: now, sections };
    const rel = `deanza/${raw.code}.json`;
    mkdirSync(join(outDir, 'deanza'), { recursive: true });
    writeFileSync(join(outDir, rel), JSON.stringify(file));
    index.terms.push({ ...term, collegeId: 'deanza', file: rel, sections: sections.length, fetchedAt: now });
    console.log(`  wrote ${rel}: ${sections.length} sections`);
    await sleep(2000);
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
