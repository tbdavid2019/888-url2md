import 'reflect-metadata';
import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { formatFromBytes, formatFromExtension, toMarkdown, toMarkdownBytes, Format } from '@firecrawl/anydoc';
import { GlobalLogger } from './logger';

@singleton()
export class AnyDocService extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    /**
     * Check if AnyDoc supports the document format based on contentType or fileName extension.
     */
    supports(contentType?: string, fileName?: string): boolean {
        if (fileName) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            if (ext && formatFromExtension(ext)) {
                return true;
            }
        }
        if (contentType) {
            const lowMime = contentType.toLowerCase();
            if (
                lowMime.includes('pdf') ||
                lowMime.includes('word') ||
                lowMime.includes('excel') ||
                lowMime.includes('powerpoint') ||
                lowMime.includes('officedocument') ||
                lowMime.includes('msword') ||
                lowMime.includes('ms-excel') ||
                lowMime.includes('ms-powerpoint') ||
                lowMime.includes('epub') ||
                lowMime.includes('rtf') ||
                lowMime.includes('opendocument') ||
                lowMime.includes('csv')
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Convert a local document file to Markdown via AnyDoc.
     */
    async convertFile(filePath: string): Promise<string> {
        return await toMarkdown(filePath);
    }

    /**
     * Convert in-memory bytes/buffer to Markdown via AnyDoc.
     */
    async convertBytes(bytes: Uint8Array | Buffer, fileName?: string): Promise<string> {
        let fmt: Format | null = formatFromBytes(bytes);
        if (!fmt && fileName) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            if (ext) {
                fmt = formatFromExtension(ext);
            }
        }
        return await toMarkdownBytes(bytes, fmt);
    }
}
