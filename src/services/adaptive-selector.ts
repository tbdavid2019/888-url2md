const STABLE_ATTRIBUTE_NAMES = new Set([
    'id',
    'name',
    'role',
    'itemprop',
    'itemtype',
    'aria-label',
]);

const MAX_TEXT_LENGTH = 160;
const MAX_ANCESTORS = 4;

export interface AdaptiveElementSignature {
    tagName: string;
    classes: string[];
    attributes: Record<string, string>;
    identityValues: string[];
    text: string;
    ancestorTags: string[];
    childTags: string[];
}

export interface AdaptiveElementMatch {
    element: any;
    confidence: number;
}

export interface AdaptiveExtractionProfile {
    version: 1;
    baseSelector: string;
    baseSignatures: AdaptiveElementSignature[];
    fields: Record<string, {
        selector: string;
        signatures: (AdaptiveElementSignature | null)[];
    }>;
}

function normalizeText(value: string | null | undefined) {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function tokenize(value: string) {
    return new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function tokenSimilarity(left: string, right: string) {
    const a = tokenize(left);
    const b = tokenize(right);
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const token of a) {
        if (b.has(token)) overlap += 1;
    }
    return overlap / Math.max(a.size, b.size);
}

function getAttributes(element: any) {
    const attributes: Record<string, string> = {};
    const identityValues = new Set<string>();
    for (const attribute of Array.from(element.attributes || []) as any[]) {
        const name = String(attribute.name).toLowerCase();
        const value = normalizeText(String(attribute.value));
        if (!value) continue;
        if (STABLE_ATTRIBUTE_NAMES.has(name) || name.startsWith('data-')) {
            attributes[name] = value;
            if (name === 'id' || name.startsWith('data-') || name === 'name') {
                identityValues.add(value);
            }
        }
    }
    return { attributes, identityValues: [...identityValues] };
}

export function createAdaptiveSignature(element: any): AdaptiveElementSignature {
    const { attributes, identityValues } = getAttributes(element);
    const classes = normalizeText(element.getAttribute?.('class')).split(/\s+/).filter(Boolean).sort();
    const ancestorTags: string[] = [];
    let parent = element.parentElement;
    while (parent && ancestorTags.length < MAX_ANCESTORS) {
        ancestorTags.push(String(parent.tagName || '').toLowerCase());
        parent = parent.parentElement;
    }

    return {
        tagName: String(element.tagName || '').toLowerCase(),
        classes,
        attributes,
        identityValues,
        text: normalizeText(element.textContent),
        ancestorTags,
        childTags: Array.from(element.children || []).map((child: any) => String(child.tagName || '').toLowerCase()),
    };
}

function overlapScore(left: string[], right: string[]) {
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    return left.filter((value) => rightSet.has(value)).length / Math.max(left.length, right.length);
}

function scoreElement(element: any, signature: AdaptiveElementSignature) {
    const candidate = createAdaptiveSignature(element);
    let score = candidate.tagName === signature.tagName ? 0.15 : 0;
    score += tokenSimilarity(candidate.text, signature.text) * 0.4;
    score += overlapScore(candidate.classes, signature.classes) * 0.08;
    score += overlapScore(candidate.ancestorTags, signature.ancestorTags) * 0.07;
    score += overlapScore(candidate.childTags, signature.childTags) * 0.08;

    const attributeNames = Object.keys(signature.attributes);
    if (attributeNames.length) {
        const matchingAttributes = attributeNames.filter((name) => candidate.attributes[name] === signature.attributes[name]);
        score += matchingAttributes.length / Math.max(attributeNames.length, Object.keys(candidate.attributes).length) * 0.02;
    }
    if (signature.identityValues.some((value) => candidate.identityValues.includes(value))) {
        score += 0.22;
    }
    return Math.min(score, 1);
}

export function findAdaptiveElement(root: any, signature: AdaptiveElementSignature, threshold = 0.62): AdaptiveElementMatch | undefined {
    const candidates = Array.from(root.querySelectorAll?.('*') || []) as any[];
    const ranked = candidates
        .map((element) => ({ element, confidence: scoreElement(element, signature) }))
        .filter((match) => match.confidence >= threshold)
        .sort((left, right) => right.confidence - left.confidence);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || (second && best.confidence - second.confidence < 0.03)) {
        return undefined;
    }
    return { element: best.element, confidence: Number(best.confidence.toFixed(3)) };
}

export function findAdaptiveElements(root: any, signatures: AdaptiveElementSignature[], threshold = 0.62) {
    const matches: AdaptiveElementMatch[] = [];
    const used = new Set<any>();
    for (const signature of signatures) {
        const match = findAdaptiveElement(root, signature, threshold);
        if (match && !used.has(match.element)) {
            used.add(match.element);
            matches.push(match);
        }
    }
    return matches;
}
