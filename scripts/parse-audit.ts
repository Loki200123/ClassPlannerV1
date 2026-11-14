// Try the parser on your own DegreeWorks PDF:
//   npm run parse-audit -- "C:\path\to\audit.pdf"
// Prints the parsed result. Nothing is saved or uploaded.
import { readFileSync } from 'node:fs';
import { extractPdfLines } from '../src/pdf/pdf-text';
import { parseFhdaDegreeWorks } from '../src/adapters/fhda/degreeworks';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npm run parse-audit -- <audit.pdf>');
    process.exit(1);
  }
  const lines = await extractPdfLines(new Uint8Array(readFileSync(path)));
  const audit = parseFhdaDegreeWorks(lines.join('\n'));
  console.log(JSON.stringify(audit, null, 2));
}

main();
