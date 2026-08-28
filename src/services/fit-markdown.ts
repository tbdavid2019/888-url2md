export type FitMarkdownMode = 'pruning' | 'bm25';

export interface FitMarkdownOptions {
    mode: FitMarkdownMode;
    query?: string;
    minWords?: number;
}

function tokenize(value: string) {
    return value.toLocaleLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]/g) || [];
}

function wordCount(value: string) {
    return tokenize(value).length;
}

function isHeading(block: string) {
    return /^#{1,6}\s+\S/.test(block.trim());
}

function isLinkHeavy(block: string) {
    const links = block.match(/\[[^\]]*\]\([^)]*\)/g) || [];
    const text = block.replace(/\[[^\]]*\]\([^)]*\)/g, '').trim();
    return links.length >= 2 && text.length < links.join('').length;
}

function pruningScore(block: string, minWords: number) {
    const words = wordCount(block);
    if (isHeading(block)) {
        return 1;
    }
    if (words < minWords || isLinkHeavy(block)) {
        return 0;
    }
    const links = (block.match(/\[[^\]]*\]\([^)]*\)/g) || []).length;
    const linkPenalty = Math.min(0.6, links / Math.max(words, 1));
    return Math.max(0, Math.min(1, words / 80 - linkPenalty));
}

function bm25Score(block: string, queryTokens: string[]) {
    const tokens = tokenize(block);
    if (!tokens.length || !queryTokens.length) {
        return 0;
    }
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    const lengthNorm = 1 + tokens.length / 100;
    return queryTokens.reduce((score, token) => score + ((counts.get(token) || 0) / lengthNorm), 0);
}

export function buildFitMarkdown(markdown: string, options: FitMarkdownOptions) {
    const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    if (!blocks.length) {
        return '';
    }
    const minWords = options.minWords ?? 5;
    const keep = new Set<number>();

    if (options.mode === 'bm25' && options.query?.trim()) {
        const queryTokens = tokenize(options.query);
        blocks.forEach((block, index) => {
            if (bm25Score(block, queryTokens) > 0) {
                keep.add(index);
                for (let parent = index - 1; parent >= 0; parent--) {
                    if (isHeading(blocks[parent])) {
                        keep.add(parent);
                        break;
                    }
                }
            }
        });
    }

    if (!keep.size) {
        blocks.forEach((block, index) => {
            if (pruningScore(block, minWords) > 0 || (index === 0 && isHeading(block))) {
                keep.add(index);
            }
        });
    }

    const selected: string[] = [];
    const seen = new Set<string>();
    blocks.forEach((block, index) => {
        if (!keep.has(index) || seen.has(block)) {
            return;
        }
        seen.add(block);
        selected.push(block);
    });
    return selected.join('\n\n');
}
