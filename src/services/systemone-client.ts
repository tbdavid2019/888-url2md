import { singleton } from 'tsyringe';
import { GlobalLogger } from './logger';

export interface SystemOneAnswerNoul {
  type: 'noul';
  noul: number;
}

export interface SystemOneAnswerScore {
  type: 'score';
  score: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
}

export interface SystemOneEvaluationResult {
  available: boolean;
  node?: string;
  model?: string;
  hasPii?: boolean;
  piiProbability?: number;
  riskScore?: number;
  completenessScore?: number;
  latencyMs?: number;
  raw?: any;
  error?: string;
}

export interface SystemOneEndpointConfig {
  name: string;
  url: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

@singleton()
export class SystemOneClientService {
  protected logger = this.globalLogger.child({ service: this.constructor.name });

  constructor(protected globalLogger: GlobalLogger) {}

  protected getEndpoints(): SystemOneEndpointConfig[] {
    const endpoints: SystemOneEndpointConfig[] = [
      {
        name: 'Clef-Flash Primary',
        url: process.env.CLEF_PRIMARY_URL || 'https://clef.create360.ai/v1/systemone',
        model: process.env.CLEF_PRIMARY_MODEL || 'clef-flash',
        timeoutMs: 3500,
      },
      {
        name: 'Clef-Flash Fallback',
        url: process.env.CLEF_FALLBACK_URL || 'https://clef.aiurl.tw/v1/systemone',
        model: process.env.CLEF_FALLBACK_MODEL || 'clef-flash',
        timeoutMs: 4500,
      },
    ];

    const typeSafeKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
    if (typeSafeKey) {
      endpoints.push({
        name: 'TypeSafe Jev Official',
        url: process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone',
        model: process.env.TYPESAFE_MODEL || 'jev-latest',
        apiKey: typeSafeKey,
        timeoutMs: 5000,
      });
    }

    return endpoints;
  }

  /**
   * Execute System One request through the 3-tier failover chain.
   */
  async executeQuery(
    stateText: string,
    questions: Record<string, any>,
  ): Promise<{ response: any; endpoint: SystemOneEndpointConfig; durationMs: number }> {
    // Truncate state text if excessively long to stay well within token bounds
    const sampleState = stateText.length > 8000 ? stateText.slice(0, 8000) + '...' : stateText;
    const endpoints = this.getEndpoints();
    let lastError: any = null;

    for (const ep of endpoints) {
      const t0 = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ep.timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (ep.apiKey) {
          headers['Authorization'] = `Bearer ${ep.apiKey}`;
        }

        const res = await fetch(ep.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: ep.model,
            state: sampleState,
            questions,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - t0;

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          this.logger.warn(`SystemOne endpoint ${ep.name} returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
          lastError = new Error(`HTTP ${res.status} from ${ep.name}`);
          continue;
        }

        const data = await res.json();
        return { response: data, endpoint: ep, durationMs };
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError' || err.code === 20;
        this.logger.warn(`SystemOne query to ${ep.name} failed (${isAbort ? 'timeout' : err.message})`);
        lastError = err;
      }
    }

    throw lastError || new Error('All SystemOne endpoints failed');
  }

  /**
   * Evaluate raw, un-deidentified text for PII exposure and risk level.
   */
  async scoreRawPrivacy(text: string): Promise<SystemOneEvaluationResult> {
    const questions = {
      has_pii: {
        type: 'noul',
        instructions: 'The text contains unmasked personally identifiable information (PII)',
      },
      risk_level: {
        type: 'score',
        levels: 5,
        instructions: 'Evaluate the personal data exposure risk level of this text',
        criteria: [
          'No personal data detected',
          'Public organizational or non-sensitive data',
          'Low to moderate personal contact details',
          'High personal data exposure',
          'Critical exposure with national ID, physical address, and direct phone',
        ],
      },
    };

    try {
      const { response, endpoint, durationMs } = await this.executeQuery(text, questions);
      const answers = response?.answers || response;
      const piiProb = answers?.has_pii?.noul ?? 0;
      const riskScore = answers?.risk_level?.score ?? 0;

      return {
        available: true,
        node: endpoint.url,
        model: response?.model || endpoint.model,
        hasPii: piiProb > 0.5,
        piiProbability: Number(piiProb.toFixed(4)),
        riskScore: Number(riskScore.toFixed(2)),
        latencyMs: durationMs,
        raw: answers,
      };
    } catch (err: any) {
      return {
        available: false,
        error: err.message,
      };
    }
  }

  /**
   * Evaluate de-identified text for residual PII leakage and redaction quality score.
   */
  async scoreDeidCompleteness(deidentifiedText: string): Promise<SystemOneEvaluationResult> {
    const questions = {
      unmasked_pii_exists: {
        type: 'noul',
        instructions: 'The text contains unmasked raw personal identifiable information (ignoring masked placeholders like [姓名:xxx] or [身分證:xxx] or ○○○)',
      },
      completeness: {
        type: 'score',
        levels: 5,
        instructions: 'Evaluate how well real personal data has been masked into placeholders like [category:code]',
        criteria: [
          'No masking applied, raw personal data is exposed',
          'Poor masking with major personal data left exposed',
          'Partial masking with some identifiable details remaining',
          'Good masking where sensitive personal data is converted to placeholders',
          'Excellent masking where all sensitive personal data is replaced with tokens',
        ],
      },
    };

    try {
      const { response, endpoint, durationMs } = await this.executeQuery(deidentifiedText, questions);
      const answers = response?.answers || response;
      const residualPiiProb = answers?.unmasked_pii_exists?.noul ?? 0;
      const completenessScore = answers?.completeness?.score ?? 0;

      return {
        available: true,
        node: endpoint.url,
        model: response?.model || endpoint.model,
        hasPii: residualPiiProb > 0.5,
        piiProbability: Number(residualPiiProb.toFixed(4)),
        completenessScore: Number(completenessScore.toFixed(2)),
        latencyMs: durationMs,
        raw: answers,
      };
    } catch (err: any) {
      return {
        available: false,
        error: err.message,
      };
    }
  }
}
