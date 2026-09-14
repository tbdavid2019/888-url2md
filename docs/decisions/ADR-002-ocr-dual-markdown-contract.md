# ADR-002: Keep Full OCR and Isolated Table Markdown as Separate Fields

## Status

Accepted

## Date

2026-09-14

## Context

OCR screenshots can contain both a target table and surrounding editor chrome,
such as image URLs, publication status, counters, and footer controls. Existing
clients may still need the complete OCR result, while table editors need a
machine-safe table block.

## Decision

Keep the existing full-text contract in `data.markdown`. Expose the isolated
table through `data.tableMarkdown` and `data.tables`.

`mode=table` and `table_only=true` are strict table extraction modes. When no
table is detected, they return an empty Markdown body and an empty table array;
they must not fall back to full OCR text.

## Consequences

- Existing full OCR consumers remain compatible.
- BlockNote and similar editors can consume `data.tableMarkdown` directly.
- Clients must handle `tableMarkdown: null` when an image has no detectable table.
- The OCR reconstruction algorithm requires focused unit tests independent of
  the PaddleOCR runtime.
