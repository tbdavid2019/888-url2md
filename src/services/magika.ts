import { singleton } from 'tsyringe';
import { createServer } from 'http';
import { access, open, readFile, stat } from 'fs/promises';
import path from 'path';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from './logger';

const DEFAULT_MODEL_DIR = path.resolve(process.cwd(), 'assets', 'magika', 'standard_v3_3');
const MAGIKA_BLOCK_SIZE = 4096;

export type MagikaDetection = {
    label: string;
    isText: boolean;
    score: number;
};

type MagikaClient = {
    identifyBytes(fileBytes: Uint8Array): Promise<{
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

export function shouldInspectContentType(
    contentType: string | undefined,
    enabled: boolean,
    verifyDeclaredType: boolean,
): boolean {
    if (!enabled) {
        return false;
    }

    const normalizedContentType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    return verifyDeclaredType || !normalizedContentType || normalizedContentType === 'application/octet-stream';
}

@singleton()
export class MagikaService extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    readonly enabled = process.env.MAGIKA_ENABLED === 'true';
    readonly verifyDeclaredType = process.env.MAGIKA_VERIFY_DECLARED_TYPE === 'true';
    readonly modelDir = process.env.MAGIKA_MODEL_DIR || DEFAULT_MODEL_DIR;
    readonly modelPath = process.env.MAGIKA_MODEL_PATH || path.join(this.modelDir, 'model.json');
    readonly modelConfigPath = process.env.MAGIKA_MODEL_CONFIG_PATH || path.join(this.modelDir, 'config.min.json');

    private client?: MagikaClient;

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    shouldInspect(contentType?: string): boolean {
        return shouldInspectContentType(contentType, this.enabled, this.verifyDeclaredType);
    }

    override async init() {
        await this.dependencyReady();

        if (!this.enabled) {
            this.emit('ready');
            return;
        }

        await access(this.modelPath);
        await access(this.modelConfigPath);

        const modelServer = createServer(async (request, response) => {
            const assetName = new URL(request.url || '/', 'http://127.0.0.1').pathname.slice(1);
            if (!['model.json', 'config.min.json', 'group1-shard1of1.bin'].includes(assetName)) {
                response.statusCode = 404;
                response.end();
                return;
            }

            try {
                const body = await readFile(path.join(this.modelDir, assetName));
                response.statusCode = 200;
                response.setHeader('Content-Type', assetName.endsWith('.json') ? 'application/json' : 'application/octet-stream');
                response.end(body);
            } catch {
                response.statusCode = 404;
                response.end();
            }
        });

        await new Promise<void>((resolve, reject) => {
            modelServer.once('error', reject);
            modelServer.listen(0, '127.0.0.1', () => resolve());
        });

        try {
            const address = modelServer.address();
            if (!address || typeof address === 'string') {
                throw new Error('Magika model server did not expose a TCP port');
            }

            const modelBaseUrl = `http://127.0.0.1:${address.port}`;
            const { Magika } = await import('magika');
            this.client = await Magika.create({
                modelURL: `${modelBaseUrl}/model.json`,
                modelConfigURL: `${modelBaseUrl}/config.min.json`,
            });
        } finally {
            await new Promise<void>((resolve, reject) => {
                modelServer.close((err) => err ? reject(err) : resolve());
            });
        }
        this.logger.info(`Magika model loaded from ${this.modelDir}`);
        this.emit('ready');
    }

    async identifyFile(filePath: string): Promise<MagikaDetection | undefined> {
        if (!this.enabled || !this.client) {
            return undefined;
        }

        const fileSize = (await stat(filePath)).size;
        const result = await this.client.identifyBytes(await readMagikaSample(filePath, fileSize));
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

async function readMagikaSample(filePath: string, fileSize: number): Promise<Buffer> {
    if (fileSize <= MAGIKA_BLOCK_SIZE * 4) {
        return await readFile(filePath);
    }

    const file = await open(filePath, 'r');
    try {
        const beginning = Buffer.alloc(MAGIKA_BLOCK_SIZE);
        const ending = Buffer.alloc(MAGIKA_BLOCK_SIZE);
        await file.read(beginning, 0, beginning.length, 0);
        await file.read(ending, 0, ending.length, fileSize - ending.length);
        return Buffer.concat([beginning, ending]);
    } finally {
        await file.close();
    }
}
