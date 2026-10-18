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

export interface DeidentifyOptions {
  mode?: MarkerStyle;
  partial?: boolean;
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
   * Run de-identification on text using Taiwan/International rule patterns.
   */
  async deidentify(
    text: string,
    options: DeidentifyOptions = {},
  ): Promise<DeidentifyExecutionResult> {
    const mode = options.mode || 'code';
    const isPartial = options.partial !== false;

    let patterns: Pattern[] = BUILTIN_PATTERNS;
    if (options.categories && options.categories.length > 0) {
      const allowed = new Set(options.categories);
      patterns = patterns.filter((p) => allowed.has(p.category));
    }

    const defaultRetention: Retention = isPartial
      ? { mode: 'preview' }
      : { mode: 'none' };

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
   * Score raw, un-deidentified text using Clef / Jev System One failover.
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
