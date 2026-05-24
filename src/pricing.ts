// ============================================================================
// Per-model pricing table — single source of truth for cost calculations.
// All prices in USD per 1M tokens. Update when providers change pricing.
// Last verified: 2026-05-24 (Gemini pricing page + Anthropic docs)
// ============================================================================

import type { ModelTier, ProviderId } from './types';

export interface ModelPricing {
  provider: ProviderId;
  model: string;
  tier: ModelTier;
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
  // Approximate free-tier rate limits (verify in provider console)
  freeRpmLimit?: number;
  freeRpdLimit?: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // ---------- Gemini ----------
  // We pin to specific production models rather than `*-latest` aliases because
  // newer Gemini models (3.x+) have *mandatory* thinking that silently ignores
  // `thinkingBudget: 0` and burns 1000+ extra output tokens per call.
  // gemini-2.5-flash is the last Flash where thinking can be cleanly disabled.
  // gemini-2.5-pro is the matching premium tier.
  //
  // Note: there's no separate "free tier" pricing key. Google's free quota
  // only applies if your API key was minted via aistudio.google.com without a
  // billing project AND you stay under RPM/RPD limits. Any key tied to a
  // Cloud billing project is charged at these paid rates from the first call,
  // so we always cost-account at the paid rate to show your real exposure.
  'gemini-flash': {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    tier: 'paid',
    inputPer1M: 0.25,
    cachedInputPer1M: 0.025,
    outputPer1M: 1.5,
    freeRpmLimit: 15,
    freeRpdLimit: 1500,
  },
  'gemini-pro': {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    tier: 'paid',
    inputPer1M: 1.5,
    cachedInputPer1M: 0.15,
    outputPer1M: 9.0,
  },

  // ---------- Anthropic ----------
  // Note: Claude prices verified against recent docs; update if you see drift.
  'claude-haiku-4.5': {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    tier: 'paid',
    inputPer1M: 1.0,
    cachedInputPer1M: 0.1,
    outputPer1M: 5.0,
  },
  'claude-sonnet-4.6': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    tier: 'paid',
    inputPer1M: 3.0,
    cachedInputPer1M: 0.3,
    outputPer1M: 15.0,
  },
};

export function calculateCost(
  pricingKey: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[pricingKey];
  if (!p) {
    console.warn(`[pricing] Unknown model '${pricingKey}', assuming $0`);
    return 0;
  }
  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (uncachedInput / 1_000_000) * p.inputPer1M +
    (cachedInputTokens / 1_000_000) * p.cachedInputPer1M +
    (outputTokens / 1_000_000) * p.outputPer1M
  );
}
