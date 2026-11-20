// Dev helper: save a PDF's positioned text as JSON (used to make test fixtures).
//   npx tsx scripts/dump-pdf-items.ts in.pdf out.json
import { readFileSync, writeFileSync } from 'node:fs';
import { extractPdfItems } from '../src/pdf/pdf-text';

const [input, output] = process.argv.slice(2);
const items = await extractPdfItems(new Uint8Array(readFileSync(input)));
writeFileSync(output, JSON.stringify(items));
console.log(`${items.length} items -> ${output}`);
