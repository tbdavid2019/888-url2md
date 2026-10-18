import type { MappingEntry, MarkerStyle, RedactionItem, RedactionResult, TextEdit } from './types';
import { buildMarker } from './codes';
import { serializeMapping } from './csv';

export const blankOut = (s: string): string => s.replace(/[\p{L}\p{N}]/gu, '○');

export function splitItem(it: RedactionItem): { prefix: string; hidden: string; suffix: string } {
  const head = it.head ?? 0;
  const tail = it.tail ?? 0;
  const o = it.original;
  return {
    prefix: o.slice(0, head),
    hidden: o.slice(head, o.length - tail),
    suffix: o.slice(o.length - tail),
  };
}

export function outputFor(it: RedactionItem, style: MarkerStyle = 'code'): string {
  const { prefix, hidden, suffix } = splitItem(it);
  const marker =
    style === 'code'
      ? buildMarker(it.category, it.code)
      : style === 'category'
      ? `[${it.category}]`
      : blankOut(hidden);
  return prefix + marker + suffix;
}

export function buildEdits(items: RedactionItem[], style: MarkerStyle = 'code'): TextEdit[] {
  return items
    .filter((it) => it.active)
    .sort((a, b) => a.start - b.start)
    .map((it) => ({ start: it.start, end: it.end, replacement: outputFor(it, style) }));
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const e of sorted) {
    if (e.start < cursor) continue; // skip accidental overlapping ranges
    out += text.slice(cursor, e.start) + e.replacement;
    cursor = e.end;
  }
  return out + text.slice(cursor);
}

export function applyRedactions(
  text: string,
  items: RedactionItem[],
  style: MarkerStyle = 'code',
): RedactionResult {
  const edits = buildEdits(items, style);
  const mapping: MappingEntry[] = [];
  const seen = new Set<string>();

  for (const it of [...items].filter((it) => it.active).sort((a, b) => a.start - b.start)) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    const { prefix, hidden, suffix } = splitItem(it);
    const entry: MappingEntry = { code: it.code, category: it.category, original: hidden };
    if (prefix) entry.prefix = prefix;
    if (suffix) entry.suffix = suffix;
    mapping.push(entry);
  }

  const redactedText = applyEdits(text, edits);
  const csvMapping = serializeMapping(mapping);

  return {
    redactedText,
    edits,
    mapping,
    itemsCount: edits.length,
    csvMapping,
  };
}
