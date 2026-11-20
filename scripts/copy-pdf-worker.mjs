// Copies pdf.js's worker into public/ so the browser can load it.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
mkdirSync('public', { recursive: true });
copyFileSync(src, 'public/pdf.worker.min.mjs');
