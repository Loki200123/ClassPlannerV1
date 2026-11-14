// See your plan from your own DegreeWorks PDF:
//   npm run plan -- "C:\path\to\audit.pdf"            (ADT only)
//   npm run plan -- "C:\path\to\audit.pdf" sjsu-cs    (+ SJSU CS transfer)
import { readFileSync } from 'node:fs';
import { extractPdfLines } from '../src/pdf/pdf-text';
import { parseFhdaDegreeWorks } from '../src/adapters/fhda/degreeworks';
import { plan } from '../src/planner/plan';
import { deanzaSjsuCs } from '../src/model/fixtures/deanza-sjsu-cs-2026-27';

const AGREEMENTS = { 'sjsu-cs': deanzaSjsuCs };

async function main() {
  const [path, target] = process.argv.slice(2);
  if (!path) {
    console.error('Usage: npm run plan -- <audit.pdf> [sjsu-cs]');
    process.exit(1);
  }
  const lines = await extractPdfLines(new Uint8Array(readFileSync(path)));
  const audit = parseFhdaDegreeWorks(lines.join('\n'));
  const r = plan(audit, target ? AGREEMENTS[target as keyof typeof AGREEMENTS] : undefined);

  console.log('\nRECOMMENDED CLASSES');
  for (const c of r.recommended) {
    console.log(`  ${c.code.padEnd(10)} counts for ${c.countsFor.length}:`);
    c.countsFor.forEach((l) => console.log(`      - ${l}`));
  }
  if (r.choices.length) {
    console.log('\nYOUR CHOICE (pick 1 each)');
    for (const c of r.choices) {
      console.log(`  ${c.label}: ${c.options.length} options, e.g. ${c.options.slice(0, 5).map((b) => b.join(' + ')).join(', ')}`);
    }
  }
  if (r.blocked.length) console.log('\nCAN\'T BE DONE HERE:', r.blocked.join(', '));
  if (r.flags.length) {
    console.log('\nALSO REMEMBER');
    r.flags.forEach((f) => console.log(`  - ${f}`));
  }
}

main();
