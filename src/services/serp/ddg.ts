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
        const results: WebSearchEntry[] = [];

        try {
            const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                }
            });

            const html = await response.text();
            const algos = html.split('b_algo');
            for (const algo of algos.slice(1)) {
                const titleMatch = algo.match(/<h2><a[^>]+>(.*?)<\/a><\/h2>/i) || algo.match(/<a[^>]+>(.*?)<\/a>/i);
                const uMatch = algo.match(/u=a1([^&";]+)/);
                if (uMatch && titleMatch) {
                    let realUrl = '';
                    try {
                        let b64 = uMatch[1].replace(/[-_]/g, m => m === '-' ? '+' : '/');
                        while (b64.length % 4 !== 0) b64 += '=';
                        realUrl = Buffer.from(b64, 'base64').toString('utf-8');
                    } catch {
                        // ignore invalid base64
                    }

                    let title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                    if (title.includes('http')) {
                        title = title.split('http')[0].trim() || title;
                    }

                    if (realUrl.startsWith('http') && title && !results.some(r => r.link === realUrl)) {
                        results.push({
                            title,
                            link: realUrl,
                            snippet: title,
                        });
                    }
                }
                if (results.length >= num) break;
            }
        } catch (err) {
            this.logger.warn('DuckDuckGoSERP (Bing HTML) fetch error', { err });
        }

        return results;
    }
}
