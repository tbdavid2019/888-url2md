import { WebSearchEntry } from './compat';

export function normalizeSearchQuery(value?: string) {
    return (value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeURIComponentSafely(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizeSearchText(value: string) {
    return decodeURIComponentSafely(value)
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ');
}

/**
 * Search providers sometimes return a default/trending page with HTTP 200
 * when they cannot answer a query. Keep that page out of the result set.
 * This is deliberately a conservative gate: it rejects only results that
 * contain no query signal in their title, snippet, or real URL path.
 */
export function isSearchResultRelevant(query: string, result: Pick<WebSearchEntry, 'title' | 'snippet' | 'link'>) {
    const normalizedQuery = normalizeSearchQuery(query).normalize('NFKC').toLocaleLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    // Search operators are constraints, not text that must appear in a title.
    const searchableQuery = normalizedQuery
        .replace(/(?:^|\s)(?:site|filetype|ext|intitle|loc):(?:"[^"]*"|\S+)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!searchableQuery) {
        return true;
    }

    const titleAndSnippet = normalizeSearchText(`${result.title || ''} ${result.snippet || ''}`);
    let linkText = '';
    try {
        const url = new URL(result.link);
        // Do not inspect query parameters: providers often echo the user's
        // query there even when the destination page is unrelated.
        linkText = normalizeSearchText(`${url.hostname} ${url.pathname}`);
    } catch {
        linkText = normalizeSearchText(result.link || '');
    }
    const text = `${titleAndSnippet} ${linkText}`;

    if (text.includes(searchableQuery)) {
        return true;
    }

    const terms = searchableQuery.split(/[\s,._-]+/).filter((term) => term.length >= 2);
    if (terms.length > 0 && terms.some((term) => text.includes(term))) {
        return true;
    }

    // CJK queries are commonly written without spaces. Matching a complete
    // CJK run or one adjacent character pair handles names and short queries
    // while still rejecting entirely unrelated fallback pages.
    const cjkRuns = searchableQuery.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || [];
    return cjkRuns.some((run) => {
        if (run.length === 1) {
            return text.includes(run);
        }
        return text.includes(run) || Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2))
            .some((pair) => text.includes(pair));
    });
}

export function filterRelevantSearchResults(query: string, results?: WebSearchEntry[]) {
    return (results || []).filter((result) => isSearchResultRelevant(query, result));
}
