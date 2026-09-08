import { singleton } from 'tsyringe';
import { createReadStream } from 'fs';
import { access, stat } from 'fs/promises';
import path from 'path';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from './logger';

const DEFAULT_MODEL_DIR = path.resolve(process.cwd(), 'assets', 'magika', 'standard_v3_3');

export type MagikaDetection = {
    label: string;
    isText: boolean;
    score: number;
};

type MagikaClient = {
    identifyStream(stream: ReturnType<typeof createReadStream>, length: number): Promise<{
        status: string;
        prediction?: {
            output?: {
                label?: string;
                is_text?: boolean;
            };
            score?: number;
        };
    }>;
};

const MAGIKA_CONTENT_TYPES: Record<string, string> = {
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    epub: 'application/epub+zip',
    html: 'text/html',
    json: 'application/json',
    jsonl: 'application/json',
    odp: 'application/vnd.oasis.opendocument.presentation',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odt: 'application/vnd.oasis.opendocument.text',
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    rtf: 'application/rtf',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml: 'application/xml',
};

export function magikaLabelToContentType(label: string, isText: boolean): string | undefined {
    const normalizedLabel = label.trim().toLowerCase();
    const knownContentType = MAGIKA_CONTENT_TYPES[normalizedLabel];
    if (knownContentType) {
        return knownContentType;
    }

    return isText && normalizedLabel !== 'unknown' ? 'text/plain' : undefined;
}

export function selectContentTypeFromMagika(
    originalContentType: string | undefined,
    label: string,
    isText: boolean,
): string {
    return magikaLabelToContentType(label, isText)
        || originalContentType
        || 'application/octet-stream';
}

@singleton()
export class MagikaService extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    readonly enabled = process.env.MAGIKA_ENABLED === 'true';
    readonly modelDir = process.env.MAGIKA_MODEL_DIR || DEFAULT_MODEL_DIR;
    readonly modelPath = process.env.MAGIKA_MODEL_PATH || path.join(this.modelDir, 'model.json');
    readonly modelConfigPath = process.env.MAGIKA_MODEL_CONFIG_PATH || path.join(this.modelDir, 'config.min.json');

    private client?: MagikaClient;

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();

        if (!this.enabled) {
            this.emit('ready');
            return;
        }

        await access(this.modelPath);
        await access(this.modelConfigPath);

        const { MagikaNode } = await import('magika/node');
        this.client = await MagikaNode.create({
            modelPath: this.modelPath,
            modelConfigPath: this.modelConfigPath,
        });
        this.logger.info(`Magika model loaded from ${this.modelDir}`);
        this.emit('ready');
    }

    async identifyFile(filePath: string): Promise<MagikaDetection | undefined> {
        if (!this.enabled || !this.client) {
            return undefined;
        }

        const fileSize = (await stat(filePath)).size;
        const result = await this.client.identifyStream(createReadStream(filePath), fileSize);
        const output = result.prediction?.output;
        const label = output?.label?.trim().toLowerCase();
        if (result.status !== 'ok' || !label) {
            return undefined;
        }

        return {
            label,
            isText: output?.is_text === true,
            score: result.prediction?.score || 0,
        };
    }
}
