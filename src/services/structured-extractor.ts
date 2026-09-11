import { DOMParser } from '@xmldom/xmldom';
import { select } from 'xpath';
import {
    StructuredExtractionField,
    StructuredExtractionSchema,
    validateStructuredExtractionSchema,
} from '../dto/advanced-crawl-options';
import {
    AdaptiveExtractionProfile,
    createAdaptiveSignature,
    findAdaptiveElement,
    findAdaptiveElements,
} from './adaptive-selector';

type ExtractedRecord = Record<string, string | number | boolean | null>;

function assertSelectorIsScoped(selector: string, path: string) {
    const trimmed = selector.trim();
    if (!trimmed || trimmed === '*' || trimmed.startsWith(':') || trimmed.includes('*:')) {
        throw new TypeError(`${path} must be a scoped selector`);
    }
}

function convertValue(value: string | null, type: StructuredExtractionField['type'] = 'text') {
    const text = value?.replace(/\s+/g, ' ').trim() || '';
    if (type === 'number') {
        const match = text.replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    }
    if (type === 'boolean') {
        return ['true', '1', 'yes', 'on'].includes(text.toLowerCase());
    }
    return text || null;
}

function getAttribute(node: any, attribute?: string) {
    return attribute ? node?.getAttribute?.(attribute) ?? node?.getAttributeNode?.(attribute)?.value ?? null : null;
}

function cssValue(node: any, field: StructuredExtractionField, targetOverride?: any) {
    const target = targetOverride || (field.selector === '.' ? node : node.querySelector?.(field.selector));
    if (!target) {
        return null;
    }
    if (field.attribute || field.type === 'attribute') {
        return convertValue(getAttribute(target, field.attribute), field.type);
    }
    if (field.type === 'html') {
        return target.outerHTML || null;
    }
    return convertValue(target.textContent, field.type);
}

function xpathNodes(expression: string, node: any): any[] {
    const selected = select(expression, node as any);
    return Array.isArray(selected) ? selected : [selected];
}

function xpathValue(node: any, field: StructuredExtractionField) {
    const selected = xpathNodes(field.selector, node).find((value) => value !== null && value !== undefined);
    if (selected === undefined || selected === null) {
        return null;
    }
    if (field.attribute || field.type === 'attribute') {
        return convertValue(getAttribute(selected, field.attribute), field.type);
    }
    if (typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean') {
        return convertValue(String(selected), field.type);
    }
    if (field.type === 'html') {
        return selected.toString?.() || null;
    }
    return convertValue(selected.textContent, field.type);
}

export interface DetailedStructuredExtraction {
    records: ExtractedRecord[];
    profile?: AdaptiveExtractionProfile;
    adaptiveUsed: boolean;
}

export async function extractStructuredDataDetailed(
    html: string,
    rawSchema: StructuredExtractionSchema,
    profile?: AdaptiveExtractionProfile,
    adaptiveThreshold = 0.62,
): Promise<DetailedStructuredExtraction> {
    const schema = validateStructuredExtractionSchema(rawSchema);
    assertSelectorIsScoped(schema.baseSelector, 'extraction.baseSelector');
    schema.fields.forEach((field, index) => assertSelectorIsScoped(field.selector, `extraction.fields[${index}].selector`));

    if (schema.type === 'xpath') {
        const document = new DOMParser().parseFromString(html, 'text/xml');
        return {
            records: xpathNodes(schema.baseSelector, document)
            .filter((node) => typeof node === 'object' && node)
            .map((node) => Object.fromEntries(schema.fields.map((field) => [field.name, xpathValue(node, field)]))),
            adaptiveUsed: false,
        };
    }

    const { parseHTML } = await import('linkedom');
    const document = parseHTML(html).window.document;
    let bases = Array.from(document.querySelectorAll(schema.baseSelector));
    let adaptiveUsed = false;
    if (!bases.length && profile?.baseSelector === schema.baseSelector) {
        bases = findAdaptiveElements(document, profile.baseSignatures, adaptiveThreshold).map((match) => match.element);
        adaptiveUsed = bases.length > 0;
    }

    const resolvedFieldTargets: Record<string, (any | null)[]> = Object.fromEntries(
        schema.fields.map((field) => [field.name, []]),
    );
    const records = bases.map((node, index) => {
        const values = Object.fromEntries(schema.fields.map((field) => {
            let target = field.selector === '.' ? node : node.querySelector?.(field.selector);
            if (!target && profile?.fields[field.name]?.selector === field.selector) {
                const signature = profile.fields[field.name].signatures[index];
                if (signature) {
                    // Field values often have short text and intentionally generic tags (for
                    // example, a price changing from <span> to <strong>). Keep the lower
                    // threshold scoped to the already-selected record, and reject ties in
                    // findAdaptiveElement to avoid silently choosing an arbitrary value.
                    const match = findAdaptiveElement(node, signature, Math.max(0.4, adaptiveThreshold - 0.22));
                    target = match?.element;
                    adaptiveUsed ||= Boolean(match);
                }
            }
            resolvedFieldTargets[field.name][index] = target || null;
            return [field.name, cssValue(node, field, target)];
        }));
        return values;
    });

    const nextProfile: AdaptiveExtractionProfile | undefined = bases.length ? {
        version: 1,
        baseSelector: schema.baseSelector,
        baseSignatures: bases.slice(0, 20).map((node) => createAdaptiveSignature(node)),
        fields: Object.fromEntries(schema.fields.map((field) => [field.name, {
            selector: field.selector,
            signatures: bases.slice(0, 20).map((_node, index) => {
                const target = resolvedFieldTargets[field.name][index];
                return target ? createAdaptiveSignature(target) : null;
            }),
        }])),
    } : undefined;

    return { records, profile: nextProfile, adaptiveUsed };
}

export async function extractStructuredData(html: string, rawSchema: StructuredExtractionSchema): Promise<ExtractedRecord[]> {
    const result = await extractStructuredDataDetailed(html, rawSchema);
    return result.records;
}
