import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OcrClientService } from '../../build/services/ocr-client.js';

describe('OcrClientService: Multi-endpoint cluster & anti-thundering-herd logic', () => {
    const createService = () => {
        const loggerMock = {
            child: () => ({
                info: () => {},
                warn: () => {},
                debug: () => {},
                error: () => {},
            }),
        };
        return new OcrClientService(loggerMock as any);
    };

    it('parses single and multiple comma-separated URLs with sanitization', () => {
        const service = createService();

        // Empty config
        service.loadConfiguration([]);
        assert.equal(service.isConfigured(), false);
        assert.equal(service.isAvailable(), false);

        // Multiple nodes with whitespace and trailing slashes
        service.loadConfiguration([
            ' https://ocr.aiurl.tw/ ',
            'https://ocr2.aiurl.tw///',
            'invalid-url',
            'http://10.9.0.9:8088'
        ]);

        assert.equal(service.isConfigured(), true);
        const status = service.getStatus();
        assert.equal(status.nodes.length, 3);
        assert.equal(status.nodes[0].url, 'https://ocr.aiurl.tw');
        assert.equal(status.nodes[1].url, 'https://ocr2.aiurl.tw');
        assert.equal(status.nodes[2].url, 'http://10.9.0.9:8088');
    });

    it('formats PaddleOCR standard nested array response into clean Markdown', () => {
        const service = createService();

        const paddleOcrData = [
            [
                [[[10, 10], [100, 10], [100, 30], [10, 30]], ['測試發票號碼：AB-12345678', 0.992]],
                [[[10, 40], [100, 40], [100, 60], [10, 60]], ['總計金額：新台幣 1,500 元整', 0.985]],
                [[[10, 70], [100, 70], [100, 90], [10, 90]], ['謝謝惠顧 歡迎再度光臨', 0.971]]
            ]
        ];

        const result = service.formatOcrResponse(paddleOcrData, 'https://ocr.aiurl.tw');
        assert.ok(result.markdown.includes('測試發票號碼：AB-12345678'));
        assert.ok(result.markdown.includes('總計金額：新台幣 1,500 元整'));
        assert.ok(result.markdown.includes('謝謝惠顧 歡迎再度光臨'));
        assert.equal(result.lines.length, 3);
        assert.equal(result.lines[0].text, '測試發票號碼：AB-12345678');
        assert.equal(result.lines[0].confidence, 0.992);
        assert.equal(result.nodeUrl, 'https://ocr.aiurl.tw');
    });

    it('formats pre-structured markdown and direct text responses', () => {
        const service = createService();

        const preMarkdown = {
            markdown: '# 報表標題\n\n| 項目 | 數值 |\n|---|---|\n| A | 100 |',
            lines: [{ text: '# 報表標題' }]
        };
        const res1 = service.formatOcrResponse(preMarkdown, 'https://ocr.aiurl.tw');
        assert.equal(res1.markdown, preMarkdown.markdown);

        const plainText = { text: '純文字辨識結果' };
        const res2 = service.formatOcrResponse(plainText, 'https://ocr.aiurl.tw');
        assert.equal(res2.markdown, '純文字辨識結果');
    });

    it('guarantees Single-Flight promise coalescing during concurrent node probes', async () => {
        const service = createService();
        service.loadConfiguration(['https://ocr.mock.local']);

        // Mock probeSingleNode to count calls and add delay
        let probeCount = 0;
        (service as any).probeSingleNode = async () => {
            probeCount++;
            await new Promise((resolve) => setTimeout(resolve, 50));
            return true;
        };

        // Fire 5 concurrent probeAllNodes calls simultaneously
        const [p1, p2, p3, p4, p5] = await Promise.all([
            service.probeAllNodes(),
            service.probeAllNodes(),
            service.probeAllNodes(),
            service.probeAllNodes(),
            service.probeAllNodes(),
        ]);

        // All callers must share the exact single execution
        assert.equal(probeCount, 1);
    });

    it('supports seamless in-flight failover from primary to secondary node with circuit breaker cooldown', async () => {
        const service = createService();
        service.loadConfiguration([
            'https://ocr-primary.local',
            'https://ocr-fallback.local'
        ]);

        // Mark both as initially healthy
        (service as any).nodes[0].healthy = true;
        (service as any).nodes[1].healthy = true;

        // Mock executePredictOnNode: node 0 fails (502 error), node 1 succeeds
        let node0Attempts = 0;
        let node1Attempts = 0;

        (service as any).executePredictOnNode = async (node: any) => {
            if (node.url === 'https://ocr-primary.local') {
                node0Attempts++;
                throw new Error('502 Bad Gateway from Cloudflare');
            }
            if (node.url === 'https://ocr-fallback.local') {
                node1Attempts++;
                return {
                    text: '辨識自備援節點',
                    markdown: '辨識自備援節點',
                    lines: [{ text: '辨識自備援節點' }],
                    nodeUrl: node.url
                };
            }
            throw new Error('Unknown node');
        };

        const imageBuffer = Buffer.from('fake-image-data');
        const result = await service.predict(imageBuffer, 'test.png');

        assert.equal(node0Attempts, 1);
        assert.equal(node1Attempts, 1);
        assert.equal(result.markdown, '辨識自備援節點');
        assert.equal(result.nodeUrl, 'https://ocr-fallback.local');

        // Check that node 0 entered cooldown
        const status = service.getStatus();
        const primaryNode = status.nodes.find(n => n.url === 'https://ocr-primary.local');
        assert.ok(primaryNode);
        assert.equal(primaryNode.inCooldown, true);
    });

    it('fails fast when all nodes are offline or in cooldown', async () => {
        const service = createService();
        service.loadConfiguration(['https://ocr-dead.local']);

        (service as any).nodes[0].healthy = false;
        (service as any).nodes[0].cooldownUntil = Date.now() + 60000;

        // Mock probeAllNodes to remain offline
        (service as any).probeAllNodes = async () => {};

        await assert.rejects(async () => {
            await service.predict(Buffer.from('data'), 'test.png');
        }, /All OCR nodes are currently offline/);
    });
});
