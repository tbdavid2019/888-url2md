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

/**
 * Reject user-supplied custom regexes that are overly long, contain backreferences/lookarounds,
 * or have nested quantifiers / quantified alternations at any group depth that can cause ReDoS.
 */
export function isSafeCustomRegex(raw: string): boolean {
  if (!raw || typeof raw !== 'string' || raw.length > 256) return false;
  // Reject backreferences like \1 .. \9 or \k<name> and lookbehind/lookahead assertions
  if (/\\[1-9]|\\k<|\(\?[<=!]/.test(raw)) return false;

  interface GroupFrame {
    hasQuantifier: boolean;
    hasAlternation: boolean;
  }
  const stack: GroupFrame[] = [{ hasQuantifier: false, hasAlternation: false }];
  let inCharClass = false;
  let lastTokenQuantifiable = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\') {
      i++; // skip escaped char
      lastTokenQuantifiable = true;
      continue;
    }
    if (inCharClass) {
      if (ch === ']') {
        inCharClass = false;
        lastTokenQuantifiable = true;
      }
      continue;
    }
    if (ch === '[') {
      inCharClass = true;
      continue;
    }
    if (ch === '(') {
      if (stack.length > 6) return false; // reject deeply nested groups
      if (raw.slice(i, i + 3) === '(?:') {
        i += 2;
      } else if (raw[i + 1] === '?') {
        return false; // reject other special group extensions in untrusted custom regex
      }
      stack.push({ hasQuantifier: false, hasAlternation: false });
      lastTokenQuantifiable = false;
      continue;
    }
    if (ch === ')') {
      if (stack.length <= 1) return false;
      const popped = stack.pop()!;
      const top = stack[stack.length - 1];
      // Check if this closing group is followed by a quantifier
      const next = raw.slice(i + 1);
      const qMatch = next.match(/^\s*(?:([+*?])|\{(\d+)(?:,(\d*))?\})/);
      const isGroupQuantified = Boolean(qMatch);
      const isRepeatingQuantifier =
        qMatch &&
        (qMatch[1] === '+' ||
          qMatch[1] === '*' ||
          (qMatch[2] !== undefined &&
            (Number(qMatch[2]) > 1 || (qMatch[3] !== undefined && (qMatch[3] === '' || Number(qMatch[3]) > 1)))));

      if (isGroupQuantified && (popped.hasQuantifier || (isRepeatingQuantifier && popped.hasAlternation))) {
        return false; // Nested quantifier or repeating alternation group -> ReDoS risk
      }
      if (popped.hasQuantifier || isGroupQuantified) {
        top.hasQuantifier = true;
      }
      if (popped.hasAlternation) {
        top.hasAlternation = true;
      }
      lastTokenQuantifiable = true;
      continue;
    }
    if (ch === '|') {
      stack[stack.length - 1].hasAlternation = true;
      lastTokenQuantifiable = false;
      continue;
    }
    if (ch === '+' || ch === '*' || ch === '?') {
      if (!lastTokenQuantifiable) return false; // Reject stacked quantifiers like a++ or a+*
      if (ch === '+' || ch === '*') {
        stack[stack.length - 1].hasQuantifier = true;
      }
      lastTokenQuantifiable = false;
      continue;
    }
    if (ch === '{') {
      const m = raw.slice(i).match(/^\{(\d+)(?:,(\d*))?\}/);
      if (m) {
        if (!lastTokenQuantifiable) return false;
        const min = Number(m[1] || 0);
        const max = m[2] === undefined ? min : m[2] === '' ? 1000 : Number(m[2]);
        if (min > 64 || max > 64 || max < min) return false;
        if (max > 1) {
          stack[stack.length - 1].hasQuantifier = true;
        }
        i += m[0].length - 1;
        lastTokenQuantifiable = false;
        continue;
      }
    }
    lastTokenQuantifiable = ch !== '^' && ch !== '$';
  }

  return !inCharClass && stack.length === 1;
}

export function compilePattern(p: Pattern): RegExp | null {
  try {
    if (p.source === 'custom' && !isSafeCustomRegex(p.regex)) {
      return null;
    }
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
    let steps = 0;
    while ((m = re.exec(text)) !== null) {
      if (++steps > 5000) break;
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const verdict = p.validate ? p.validate(m[0], text.slice(Math.max(0, m.index - 16), m.index)) : true;
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
