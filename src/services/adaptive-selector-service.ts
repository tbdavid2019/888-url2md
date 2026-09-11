import { createHash } from 'node:crypto';
import { singleton } from 'tsyringe';
import { AdaptiveExtractionOptions, StructuredExtractionSchema, validateAdaptiveExtractionOptions } from '../dto/advanced-crawl-options';
import { StorageLayer } from '../db/noop-storage';
import {
    AdaptiveElementSignature,
    AdaptiveExtractionProfile,
} from './adaptive-selector';
import { extractStructuredData, extractStructuredDataDetailed } from './structured-extractor';
import { AsyncService } from 'civkit/async-service';

const MAX_PROFILE_BYTES = 256 * 1024;
const MAX_PROFILE_FIELDS = 50;
const MAX_PROFILE_SIGNATURES = 20;

function isStringArray(value: unknown, maxLength: number): value is string[] {
    return Array.isArray(value) && value.length <= maxLength && value.every((item) => typeof item === 'string' && item.length <= 160);
}

function isSignature(value: unknown): value is AdaptiveElementSignature {
    if (!value || typeof value !== 'object') return false;
    const signature = value as Partial<AdaptiveElementSignature>;
    if (typeof signature.tagName !== 'string' || signature.tagName.length > 32) return false;
    if (!isStringArray(signature.classes, 50) || !isStringArray(signature.identityValues, 20) ||
        !isStringArray(signature.ancestorTags, 10) || !isStringArray(signature.childTags, 50) ||
        typeof signature.text !== 'string' || signature.text.length > 160 ||
        !signature.attributes || typeof signature.attributes !== 'object') return false;
    return Object.entries(signature.attributes).every(([name, attribute]) =>
        name.length <= 64 && typeof attribute === 'string' && attribute.length <= 160);
}

function parseProfile(value: unknown): AdaptiveExtractionProfile | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const profile = value as Partial<AdaptiveExtractionProfile>;
    if (profile.version !== 1 || typeof profile.baseSelector !== 'string' || profile.baseSelector.length > 500 ||
        !Array.isArray(profile.baseSignatures) || profile.baseSignatures.length > MAX_PROFILE_SIGNATURES ||
        !profile.baseSignatures.every(isSignature) || !profile.fields || typeof profile.fields !== 'object') {
        return undefined;
    }
    const fields: AdaptiveExtractionProfile['fields'] = Object.create(null);
    for (const [name, value] of Object.entries(profile.fields)) {
        if (Object.keys(fields).length >= MAX_PROFILE_FIELDS || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) || !value || typeof value !== 'object') return undefined;
        const field = value as Partial<AdaptiveExtractionProfile['fields'][string]>;
        if (typeof field.selector !== 'string' || field.selector.length > 500 ||
            !Array.isArray(field.signatures) || field.signatures.length > MAX_PROFILE_SIGNATURES ||
            !field.signatures.every((signature) => signature === null || isSignature(signature))) return undefined;
        fields[name] = { selector: field.selector, signatures: field.signatures };
    }
    return { version: 1, baseSelector: profile.baseSelector, baseSignatures: profile.baseSignatures, fields };
}

@singleton()
export class AdaptiveSelectorService extends AsyncService {
    private readonly profiles = new Map<string, AdaptiveExtractionProfile>();
    private readonly persistChains = new Map<string, Promise<void>>();

    constructor(protected storageLayer: StorageLayer) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    async extract(
        html: string,
        url: string,
        schema: StructuredExtractionSchema,
        rawOptions: AdaptiveExtractionOptions = {},
    ) {
        const options = validateAdaptiveExtractionOptions(rawOptions);
        if (!options.enabled) {
            return extractStructuredData(html, schema);
        }

        const key = this.profileKey(url, schema, options.identifier);
        const profile = await this.loadProfile(key);
        const detailed = await extractStructuredDataDetailed(html, schema, profile, options.threshold);
        if (detailed.profile) {
            this.profiles.set(key, detailed.profile);
            this.persistProfile(key, detailed.profile);
        }
        return detailed.records;
    }

    private profileKey(url: string, schema: StructuredExtractionSchema, identifier: string) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new TypeError('Adaptive extraction requires an HTTP or HTTPS URL');
        }
        const stableIdentifier = identifier || `${schema.baseSelector}|${schema.fields.map((field) => field.name).join(',')}`;
        return createHash('sha256')
            .update(`${parsed.origin.toLowerCase()}\n${stableIdentifier}`)
            .digest('hex');
    }

    private async loadProfile(key: string) {
        const cached = this.profiles.get(key);
        if (cached) return cached;
        const raw = await this.storageLayer.readFile(`adaptive-selectors/${key}.json`).catch(() => undefined);
        if (!raw || raw.byteLength > MAX_PROFILE_BYTES) return undefined;
        try {
            const profile = parseProfile(JSON.parse(raw.toString('utf8')));
            if (profile) this.profiles.set(key, profile);
            return profile;
        } catch {
            return undefined;
        }
    }

    private persistProfile(key: string, profile: AdaptiveExtractionProfile) {
        const body = Buffer.from(JSON.stringify(profile));
        if (body.byteLength > MAX_PROFILE_BYTES) return;
        const previous = this.persistChains.get(key) || Promise.resolve();
        const next: Promise<void> = previous.then(async () => {
            await this.storageLayer.storeFile(`adaptive-selectors/${key}.json`, body, {
                'Content-Type': 'application/json',
            });
        }).catch(() => undefined);
        this.persistChains.set(key, next);
        void next.finally(() => {
            if (this.persistChains.get(key) === next) this.persistChains.delete(key);
        });
    }
}
