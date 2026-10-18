import { singleton } from 'tsyringe';
import { GlobalLogger } from './logger';
import {
  BUILTIN_PATTERNS,
  CodeBook,
  detect,
  applyRedactions,
  restore,
  parseMapping,
  MarkerStyle,
  Pattern,
  RedactionResult,
  RestoreResult,
  Category,
  Retention,
  MappingEntry,
} from './deidentification';
import { SystemOneClientService, SystemOneEvaluationResult } from './systemone-client';

export interface CustomPatternInput {
  id?: string;
  name: string;
  category: Category;
  regex?: string;
  pattern?: string;
  example?: string;
  enabled?: boolean;
  retention?: Retention;
}

export interface DeidentifyOptions {
  mode?: MarkerStyle;
  partial?: boolean;
  retentionMode?: 'preview' | 'none' | 'custom';
  categoryRetentions?: Partial<Record<Category, Retention>>;
  disabledBuiltins?: string[];
  disabledCategories?: Category[];
  customPatterns?: CustomPatternInput[];
  score?: boolean;
  categories?: Category[];
}

export interface DeidentifyExecutionResult extends RedactionResult {
  clefScore?: SystemOneEvaluationResult;
}

@singleton()
export class DeidService {
  protected logger = this.globalLogger.child({ service: this.constructor.name });

  constructor(
    protected globalLogger: GlobalLogger,
    protected systemOneClient: SystemOneClientService,
  ) {}

  /**
   * Return the list of built-in detection rules (7 Taiwan + 8 International).
   */
  getBuiltinRules() {
    return BUILTIN_PATTERNS.map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
      category: p.category,
      regex: p.regex,
      example: p.example || '',
      note: p.note || '',
      enabled: p.enabled,
    }));
  }

  /**
   * Run de-identification on text using Taiwan/International rule patterns + custom rules.
   */
  async deidentify(
    text: string,
    options: DeidentifyOptions = {},
  ): Promise<DeidentifyExecutionResult> {
    const mode = options.mode || 'code';
    const retentionMode =
      options.retentionMode || (options.partial === false ? 'none' : 'preview');

    const disabledBuiltins = new Set(options.disabledBuiltins || []);
    const disabledCategories = new Set(options.disabledCategories || []);
    const allowedCategories =
      options.categories && options.categories.length > 0
        ? new Set(options.categories)
        : null;

    const categoryRetentions = options.categoryRetentions || {};

    const defaultRetention: Retention =
      retentionMode === 'none'
        ? { mode: 'none' }
        : { mode: 'preview' };

    let patterns: Pattern[] = BUILTIN_PATTERNS.filter(
      (p) => !disabledBuiltins.has(p.id) && !disabledCategories.has(p.category),
    ).map((p) => ({
      ...p,
      retention:
        retentionMode === 'custom' && categoryRetentions[p.category]
          ? categoryRetentions[p.category]
          : defaultRetention,
    }));

    if (options.customPatterns && Array.isArray(options.customPatterns)) {
      for (const cp of options.customPatterns) {
        const regexStr = cp?.regex || cp?.pattern;
        if (!cp || !regexStr || cp.enabled === false) continue;
        if (disabledCategories.has(cp.category)) continue;
        patterns.push({
          id: cp.id || `custom-${patterns.length + 1}`,
          name: cp.name || '自訂規則',
          group: 'custom',
          category: cp.category || '識別碼',
          source: 'custom',
          regex: regexStr,
          example: cp.example || '',
          enabled: true,
          retention:
            cp.retention ||
            (retentionMode === 'custom' && categoryRetentions[cp.category]
              ? categoryRetentions[cp.category]
              : defaultRetention),
        });
      }
    }

    if (allowedCategories) {
      patterns = patterns.filter((p) => allowedCategories.has(p.category));
    }

    const book = new CodeBook();
    const items = detect(text, patterns, book, defaultRetention);
    const result = applyRedactions(text, items, mode);

    let clefScore: SystemOneEvaluationResult | undefined;
    if (options.score) {
      clefScore = await this.systemOneClient.scoreDeidCompleteness(result.redactedText);
    }

    return {
      ...result,
      clefScore,
    };
  }

  /**
   * Score raw, un-deidentified text for privacy exposure risk.
   */
  async scorePrivacy(text: string): Promise<SystemOneEvaluationResult> {
    return this.systemOneClient.scoreRawPrivacy(text);
  }

  /**
   * Restore de-identified text using mapping list or CSV.
   */
  restore(
    text: string,
    mappingOrCsv: MappingEntry[] | string,
  ): RestoreResult {
    let mapping: MappingEntry[];
    if (typeof mappingOrCsv === 'string') {
      const parsed = parseMapping(mappingOrCsv);
      if (parsed.errors.length > 0) {
        this.logger.warn('Errors while parsing mapping CSV', { errors: parsed.errors });
      }
      mapping = parsed.entries;
    } else {
      mapping = mappingOrCsv;
    }

    return restore(text, mapping);
  }
}
