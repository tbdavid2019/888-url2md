import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from '../logger';
import { WebSearchEntry } from './compat';
import { EnvConfig } from '../envconfig';

@singleton()
export class GcpGoogleSERP extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(
        protected globalLogger: GlobalLogger,
        protected envConfig: EnvConfig,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    get apiKey(): string {
        return process.env.GOOGLE_SEARCH_API_KEY || process.env.GCP_SEARCH_API_KEY || (this.envConfig as any).GOOGLE_SEARCH_API_KEY || '';
    }

    get cx(): string {
        return process.env.GOOGLE_SEARCH_CX || process.env.GCP_SEARCH_CX || (this.envConfig as any).GOOGLE_SEARCH_CX || '';
    }

    async webSearch(query: { q: string; num?: number; gl?: string; hl?: string }): Promise<WebSearchEntry[]> {
        const apiKey = this.apiKey;
        const cx = this.cx;
        if (!apiKey || !cx) {
            return [];
        }

        const q = (query.q || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        const num = Math.min(query.num || 10, 10);
        const results: WebSearchEntry[] = [];

        try {
            const url = new URL('https://www.googleapis.com/customsearch/v1');
            url.searchParams.set('key', apiKey);
            url.searchParams.set('cx', cx);
            url.searchParams.set('q', q);
            url.searchParams.set('num', num.toString());
            if (query.gl) url.searchParams.set('gl', query.gl);
            if (query.hl) url.searchParams.set('hl', query.hl);

            const res = await fetch(url.href, {
                headers: {
                    'User-Agent': '888-url2md/0.7.1',
                }
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                this.logger.warn('GCP CustomSearch API returned non-OK status', { status: res.status, errJson });
                return [];
            }

            const json = await res.json();
            const items = json?.items || [];

            for (const item of items) {
                if (item.title && item.link && !results.some(r => r.link === item.link)) {
                    results.push({
                        title: item.title,
                        link: item.link,
                        snippet: item.snippet || item.title,
                    });
                }
            }
        } catch (err) {
            this.logger.warn('GcpGoogleSERP fetch error', { err });
        }

        return results;
    }
}
