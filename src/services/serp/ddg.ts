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
                const bingRes = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
                    },
                });
                const html = await bingRes.text();
                const items = html.split('class="b_algo"');
                for (const item of items.slice(1)) {
                    const linkMatch = item.match(/<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>/s);
                    if (linkMatch) {
                        let rawHref = linkMatch[1].replace(/&amp;/g, '&');
                        let title = linkMatch[2].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
                        let link = rawHref;
                        if (rawHref.includes('&u=a1')) {
                            try {
                                const u = rawHref.split('&u=a1')[1].split('&')[0];
                                const decoded = Buffer.from(u, 'base64').toString('utf-8');
                                if (decoded.startsWith('http')) {
                                    link = decoded;
                                }
                            } catch {
                                // ignore base64 decode failure
                            }
                        }
                        let snipMatch = item.match(/<p[^>]*>(.*?)<\/p>/s);
                        let snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : title;
                        if (title && link.startsWith('http') && !results.some(r => r.link === link)) {
                            results.push({
                                title,
                                link,
                                snippet: snippet || title,
                            });
                        }
                    }
                    if (results.length >= num) {
                        break;
                    }
                }
            } catch (err) {
                this.logger.warn('Bing SERP fallback fetch error', { err });
            }
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

        if (results.length === 0 && !q.includes(' ')) {
            const cleanQ = q.trim().toLowerCase();
            const candidates: string[] = [];
            if (cleanQ.startsWith('http://') || cleanQ.startsWith('https://')) {
                candidates.push(cleanQ);
            } else if (cleanQ.includes('.')) {
                candidates.push(`https://${cleanQ}/`);
            } else {
                candidates.push(`https://${cleanQ}.com/`);
                candidates.push(`https://${cleanQ}.org/`);
                candidates.push(`https://${cleanQ}.tw/`);
                candidates.push(`https://${cleanQ}.ai/`);
            }

            for (const candidateUrl of candidates) {
                try {
                    const probeRes = await fetch(candidateUrl, {
                        signal: AbortSignal.timeout(4000),
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                        }
                    });
                    if (probeRes.ok) {
                        const html = await probeRes.text();
                        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
                        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : candidateUrl;
                        const finalUrl = probeRes.url || candidateUrl;
                        if (!results.some(r => r.link === finalUrl)) {
                            results.push({
                                title: title || finalUrl,
                                link: finalUrl,
                                snippet: title || finalUrl,
                            });
                        }
                        break;
                    }
                } catch {
                    // probe timeout or failed connection
                }
            }
        }

        return results;
    }
}
