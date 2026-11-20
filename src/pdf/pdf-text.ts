// Turns a PDF into plain text lines, the same way in the browser and in Node.
// Parsers work on these lines, so they never depend on the PDF library.

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Items closer than this (in PDF points) vertically are on the same line. */
const SAME_LINE = 2.5;
/** Gap smaller than this between two items = same word, no space added. */
const SAME_WORD = 0.8;

export function itemsToLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= SAME_LINE);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  // PDF y grows upward, so top of the page = largest y
  rows.sort((a, b) => b.y - a.y);

  return rows.map((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let line = '';
    let lastEnd = -Infinity;
    for (const it of sorted) {
      if (line && it.x - lastEnd > SAME_WORD) line += ' ';
      line += it.str;
      lastEnd = it.x + it.width;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

/** Extract every page's lines. Works in Node and modern browsers. */
export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    // copied into public/ by scripts/copy-pdf-worker.mjs
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  // verbosity 0: font warnings don't matter, we only read text
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of content.items) {
      if (!('str' in raw)) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width });
    }
    lines.push(...itemsToLines(items));
  }
  await task.destroy();
  return lines;
}
