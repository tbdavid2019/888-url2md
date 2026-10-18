import type { Category, Pattern, RedactionItem, Retention } from './types';
import { CodeBook } from './codes';
import { splitFor } from './retention';

let nextId = 1;
function newId(): string {
  return `r${nextId++}`;
}

interface Candidate {
  category: Category;
  start: number;
  end: number;
  retention?: Retention;
}

function makeItem(
  text: string,
  start: number,
  end: number,
  category: Category,
  book: CodeBook,
  origin: 'auto' | 'manual',
  retention?: Retention,
): RedactionItem {
  const original = text.slice(start, end);
  const item: RedactionItem = { id: newId(), category, original, start, end, code: '', origin, active: true };
  if (retention) item.retention = retention;
  applySplit(item, retention, book);
  return item;
}

function applySplit(item: RedactionItem, retention: Retention | undefined, book: CodeBook): void {
  const { head, tail } = splitFor(item.original, retention, item.category);
  if (head) item.head = head;
  else delete item.head;
  if (tail) item.tail = tail;
  else delete item.tail;
  item.code = book.codeFor(item.category, item.original, head, tail);
}

export function compilePattern(p: Pattern): RegExp | null {
  try {
    return new RegExp(p.regex, 'gu');
  } catch {
    return null;
  }
}

/** Longest match wins; on equal length, earlier start wins. */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen: Candidate[] = [];
  for (const c of sorted) {
    if (chosen.every((k) => c.end <= k.start || c.start >= k.end)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

export function detect(
  text: string,
  patterns: Pattern[],
  book: CodeBook = new CodeBook(),
  defaultRetention?: Retention,
): RedactionItem[] {
  const cands: Candidate[] = [];
  for (const p of patterns) {
    if (!p.enabled) continue;
    const re = compilePattern(p);
    if (!re) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const verdict = p.validate ? p.validate(m[0], text.slice(Math.max(0, m.index - 3), m.index)) : true;
      if (verdict === false || verdict === 0) {
        re.lastIndex = m.index + Math.min(2, m[0].length);
        continue;
      }
      const length = verdict === true ? m[0].length : Math.min(verdict, m[0].length);
      if (length < m[0].length) re.lastIndex = m.index + length;
      cands.push({
        category: p.category,
        start: m.index,
        end: m.index + length,
        retention: p.retention ?? defaultRetention,
      });
    }
  }
  return resolveOverlaps(cands).map((c) =>
    makeItem(text, c.start, c.end, c.category, book, 'auto', c.retention)
  );
}
