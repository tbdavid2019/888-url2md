import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTwId,
  isValidTaxId,
} from '../../build/services/deidentification/twid.js';
import {
  BUILTIN_PATTERNS,
  isPlausibleName,
} from '../../build/services/deidentification/patterns.js';
import { detect } from '../../build/services/deidentification/detector.js';
import { applyRedactions, blankOut } from '../../build/services/deidentification/redactor.js';
import { restore } from '../../build/services/deidentification/restorer.js';
import { serializeMapping, parseMapping } from '../../build/services/deidentification/csv.js';
import { standardSplit } from '../../build/services/deidentification/retention.js';
import { CodeBook } from '../../build/services/deidentification/codes.js';
import { isCardNumber, isSsn, phoneLength } from '../../build/services/deidentification/intl.js';

describe('Taiwan ID (TWID) Validation', () => {
  it('validates correct Taiwan National IDs', () => {
    assert.equal(isValidTwId('A123456789'), true);
    assert.equal(isValidTwId('B120875247'), true);
  });

  it('rejects invalid Taiwan National IDs', () => {
    assert.equal(isValidTwId('A123456788'), false); // Wrong checksum
    assert.equal(isValidTwId('1234567890'), false); // Missing letter
    assert.equal(isValidTwId('A323456789'), false); // Invalid gender digit
  });
});

describe('Taiwan Unified Business Number (統編) Validation', () => {
  it('validates correct Taiwan Unified Business Numbers', () => {
    assert.equal(isValidTaxId('04595257'), true);
    assert.equal(isValidTaxId('12345675'), true);
  });

  it('rejects invalid Taiwan Tax IDs', () => {
    assert.equal(isValidTaxId('12345678'), false);
    assert.equal(isValidTaxId('00000001'), false);
    assert.equal(isValidTaxId('abcdefgh'), false);
  });
});

describe('Name plausibility & stopwords', () => {
  it('accepts plausible Chinese names', () => {
    assert.equal(isPlausibleName('王小明'), true);
    assert.equal(isPlausibleName('林志穎'), true);
    assert.equal(isPlausibleName('歐陽修'), true);
  });

  it('filters common stopwords', () => {
    assert.equal(isPlausibleName('高雄'), false);
    assert.equal(isPlausibleName('方法'), false);
    assert.equal(isPlausibleName('程式'), false);
  });
});

describe('International formats validation', () => {
  it('validates credit card numbers with Luhn check', () => {
    assert.equal(isCardNumber('4242 4242 4242 4242'), true);
    assert.equal(isCardNumber('4242 4242 4242 4241'), false);
  });

  it('validates US SSN', () => {
    assert.equal(isSsn('123-45-6789'), true);
    assert.equal(isSsn('000-45-6789'), false); // 000 area code invalid
  });

  it('validates international phone numbers', () => {
    assert.ok(phoneLength('+1 (415) 867-5309'));
    assert.ok(phoneLength('+44 20 7946 0958'));
    assert.equal(phoneLength('+886-912-345-678'), false); // Delegated to Taiwan mobile
  });
});

describe('De-identification Detection and Redaction Pipeline', () => {
  const sample =
    '立契約人：王小明（身分證字號：A123456789），聯絡電話：0912-345-678，地址：台北市信義區市府路45號8樓，公司為宏達實業股份有限公司（統一編號：04595257），電子信箱：user@example.com。';

  it('detects multiple Taiwanese PII entities in text', () => {
    const book = new CodeBook();
    const items = detect(sample, BUILTIN_PATTERNS, book);
    const categories = items.map((i) => i.category);

    assert.ok(categories.includes('姓名'));
    assert.ok(categories.includes('身分證'));
    assert.ok(categories.includes('手機'));
    assert.ok(categories.includes('地址'));
    assert.ok(categories.includes('公司'));
    assert.ok(categories.includes('統編'));
    assert.ok(categories.includes('電子郵件'));
  });

  it('redacts in "code" mode and generates valid CSV mapping', () => {
    const book = new CodeBook();
    const items = detect(sample, BUILTIN_PATTERNS, book, { mode: 'preview' });
    const result = applyRedactions(sample, items, 'code');

    assert.ok(result.redactedText.includes('[姓名:'));
    assert.ok(result.redactedText.includes('[身分證:'));
    assert.ok(result.redactedText.includes('[手機:'));
    assert.ok(result.redactedText.includes('[地址:'));
    assert.ok(!result.redactedText.includes('A123456789'));
    assert.ok(!result.redactedText.includes('user@example.com'));
    assert.ok(result.mapping.length >= 6);

    // Test CSV roundtrip
    const parsedCsv = parseMapping(result.csvMapping);
    assert.equal(parsedCsv.errors.length, 0);
    assert.equal(parsedCsv.entries.length, result.mapping.length);
  });

  it('redacts in "category" mode without exposing codes', () => {
    const book = new CodeBook();
    const items = detect(sample, BUILTIN_PATTERNS, book, { mode: 'none' });
    const result = applyRedactions(sample, items, 'category');

    assert.ok(result.redactedText.includes('[姓名]'));
    assert.ok(result.redactedText.includes('[身分證]'));
    assert.ok(!result.redactedText.includes('[姓名:'));
  });

  it('redacts in "mask" mode with circle placeholders', () => {
    const book = new CodeBook();
    const items = detect(sample, BUILTIN_PATTERNS, book, { mode: 'none' });
    const result = applyRedactions(sample, items, 'mask');

    assert.ok(result.redactedText.includes('○○○'));
    assert.ok(!result.redactedText.includes('[姓名'));
  });

  it('correctly restores original text using mapping entries', () => {
    const book = new CodeBook();
    const items = detect(sample, BUILTIN_PATTERNS, book, { mode: 'preview' });
    const result = applyRedactions(sample, items, 'code');

    const restored = restore(result.redactedText, result.mapping);
    assert.equal(restored.restoredText, sample);
    assert.equal(restored.missingCodes.length, 0);
  });

  it('partially retains statistics-safe prefixes', () => {
    const splitId = standardSplit('身分證', 'A123456789');
    assert.equal(splitId.head, 2); // A1 kept
    assert.equal(splitId.tail, 0);

    const splitName = standardSplit('姓名', '王小明');
    assert.equal(splitName.head, 1); // 王 kept
    assert.equal(splitName.tail, 0);

    const splitPhone = standardSplit('手機', '0912-345-678');
    assert.equal(splitPhone.head, 5); // 0912- kept
  });
});

describe('DeidService integration', () => {
  const loggerMock: any = {
    child: () => loggerMock,
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  };

  it('runs deidentify end-to-end and restores via CSV', async () => {
    const { DeidService } = await import('../../build/services/deid-service.js');
    const { SystemOneClientService } = await import('../../build/services/systemone-client.js');
    const systemOne = new SystemOneClientService(loggerMock);
    const service = new DeidService(loggerMock, systemOne);

    const text = '專案聯絡人：李大明，行動電話：0987-654-321，電子信箱：daming@example.com。';
    const result = await service.deidentify(text, { mode: 'code', partial: true });

    assert.ok(result.redactedText.includes('[姓名:'));
    assert.ok(result.redactedText.includes('[手機:'));
    assert.ok(result.redactedText.includes('[電子郵件:'));
    assert.ok(result.itemsCount >= 3);

    const restored = service.restore(result.redactedText, result.csvMapping);
    assert.equal(restored.restoredText, text);
    assert.equal(restored.restoredCount >= 3, true);
  });
});

describe('SystemOneClientService Failover & Scoring', () => {
  const loggerMock: any = {
    child: () => loggerMock,
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  };

  it('parses valid System One response structure', async () => {
    const { SystemOneClientService } = await import('../../build/services/systemone-client.js');
    const systemOne = new SystemOneClientService(loggerMock);

    // Mock executeQuery directly on instance
    (systemOne as any).executeQuery = async () => ({
      response: {
        answers: {
          has_pii: { type: 'noul', noul: 0.92 },
          risk_level: { type: 'score', score: 4.5 },
        },
        model: 'clef-flash',
      },
      endpoint: {
        name: 'Clef-Flash Primary',
        url: 'https://clef.create360.ai/v1/systemone',
        model: 'clef-flash',
        timeoutMs: 3500,
      },
      durationMs: 42,
    });

    const res = await systemOne.scoreRawPrivacy('王小明 A123456789 0912-345-678');
    assert.equal(res.available, true);
    assert.equal(res.hasPii, true);
    assert.equal(res.piiProbability, 0.92);
    assert.equal(res.riskScore, 4.5);
    assert.equal(res.latencyMs, 42);
    assert.equal(res.node, 'https://clef.create360.ai/v1/systemone');
  });

  it('evaluates completeness of de-identification', async () => {
    const { SystemOneClientService } = await import('../../build/services/systemone-client.js');
    const systemOne = new SystemOneClientService(loggerMock);

    (systemOne as any).executeQuery = async () => ({
      response: {
        answers: {
          unmasked_pii_exists: { type: 'noul', noul: 0.03 },
          completeness: { type: 'score', score: 4.8 },
        },
        model: 'clef-flash',
      },
      endpoint: {
        name: 'Clef-Flash Primary',
        url: 'https://clef.create360.ai/v1/systemone',
        model: 'clef-flash',
        timeoutMs: 3500,
      },
      durationMs: 38,
    });

    const res = await systemOne.scoreDeidCompleteness('專案聯絡人：[姓名:王8f2a1b]，行動電話：[手機:0912-39c4d1]');
    assert.equal(res.available, true);
    assert.equal(res.hasPii, false);
    assert.equal(res.completenessScore, 4.8);
  });

  it('handles offline endpoints gracefully without throwing', async () => {
    const { SystemOneClientService } = await import('../../build/services/systemone-client.js');
    const systemOne = new SystemOneClientService(loggerMock);

    (systemOne as any).executeQuery = async () => {
      throw new Error('All SystemOne endpoints failed');
    };

    const res = await systemOne.scoreRawPrivacy('some text');
    assert.equal(res.available, false);
    assert.equal(res.error, 'All SystemOne endpoints failed');
  });
});


