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
            const response = await fetch('https://html.duckduckgo.com/html/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                },
                body: 'q=' + encodeURIComponent(q),
            });

            const html = await response.text();
            const blocks = html.split('class="result__title"');

            for (const block of blocks.slice(1)) {
                const titleMatch = block.match(/<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/s);
                const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/s) || block.match(/class="result__snippet"[^>]*>(.*?)<\/div>/s);
                const hrefMatch = block.match(/href="([^"]+)"/);

                let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : '';
                let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : '';
                let rawHref = hrefMatch ? hrefMatch[1] : '';
                let link = rawHref;

                if (rawHref.includes('uddg=')) {
                    const rawUrl = rawHref.split('uddg=')[1].split('&')[0];
                    try {
                        link = decodeURIComponent(rawUrl);
                    } catch {
                        // ignore malformed decode
                    }
                }

                if (title && link.startsWith('http') && !link.includes('duckduckgo.com/y.js') && !results.some(r => r.link === link)) {
                    results.push({
                        title,
                        link,
                        snippet: snippet || title,
                    });
                }

                if (results.length >= num) {
                    break;
                }
            }
        } catch (err) {
            this.logger.warn('DuckDuckGoSERP fetch error', { err });
        }

        if (results.length === 0) {
            try {
                const isChinese = /[\u4e00-\u9fa5]/.test(q);
                const wikiDomain = isChinese ? 'zh.wikipedia.org' : 'en.wikipedia.org';
                const wikiRes = await fetch(`https://${wikiDomain}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    }
                });
                const json = await wikiRes.json();
                const wikiItems = json?.query?.search || [];
                for (const item of wikiItems) {
                    if (item.title && !results.some(r => r.title === item.title)) {
                        results.push({
                            title: item.title,
                            link: `https://${wikiDomain}/wiki/${encodeURIComponent(item.title)}`,
                            snippet: item.snippet ? item.snippet.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : item.title,
                        });
                    }
                    if (results.length >= num) {
                        break;
                    }
                }
            } catch (err) {
                this.logger.warn('Wikipedia SERP fallback fetch error', { err });
            }
        }

        return results;
    }
}
