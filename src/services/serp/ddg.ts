import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from '../logger';
import { WebSearchEntry } from './compat';

@singleton()
export class DuckDuckGoSERP extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(
        protected globalLogger: GlobalLogger,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    async webSearch(query: { q: string; num?: number }): Promise<WebSearchEntry[]> {
        const q = query.q;
        const num = query.num || 10;
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        const html = await response.text();
        const results: WebSearchEntry[] = [];
        
        const matches = [...html.matchAll(/<a[^>]+href="([^"]*)"[^>]*class="[^"]*result__url[^"]*"[^>]*>(.*?)<\/a>/gi)];
        const titleMatches = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi)];

        const combined = matches.length > 0 ? matches : titleMatches;

        for (const m of combined) {
            let rawUrl = m[1];
            if (rawUrl.includes('uddg=')) {
                try {
                    rawUrl = decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] || rawUrl);
                } catch {
                    // Keep rawUrl if decoding fails
                }
            }
            if (rawUrl.startsWith('//')) {
                rawUrl = 'https:' + rawUrl;
            }
            const title = m[2].replace(/<[^>]+>/g, '').trim();
            if (rawUrl.startsWith('http') && title && !results.some(r => r.link === rawUrl)) {
                results.push({
                    title,
                    link: rawUrl,
                    snippet: title,
                });
            }
            if (results.length >= num) break;
        }

        return results;
    }
}
