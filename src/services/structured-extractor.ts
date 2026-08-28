import { DOMParser } from '@xmldom/xmldom';
import { select } from 'xpath';
import {
    StructuredExtractionField,
    StructuredExtractionSchema,
    validateStructuredExtractionSchema,
} from '../dto/advanced-crawl-options';

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

function cssValue(node: any, field: StructuredExtractionField) {
    const target = field.selector === '.' ? node : node.querySelector?.(field.selector);
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

export async function extractStructuredData(html: string, rawSchema: StructuredExtractionSchema): Promise<ExtractedRecord[]> {
    const schema = validateStructuredExtractionSchema(rawSchema);
    assertSelectorIsScoped(schema.baseSelector, 'extraction.baseSelector');
    schema.fields.forEach((field, index) => assertSelectorIsScoped(field.selector, `extraction.fields[${index}].selector`));

    if (schema.type === 'xpath') {
        const document = new DOMParser().parseFromString(html, 'text/xml');
        return xpathNodes(schema.baseSelector, document)
            .filter((node) => typeof node === 'object' && node)
            .map((node) => Object.fromEntries(schema.fields.map((field) => [field.name, xpathValue(node, field)])));
    }

    const { parseHTML } = await import('linkedom');
    const document = parseHTML(html).window.document;
    const bases = Array.from(document.querySelectorAll(schema.baseSelector));
    return bases.map((node) => Object.fromEntries(schema.fields.map((field) => [field.name, cssValue(node, field)])));
}
