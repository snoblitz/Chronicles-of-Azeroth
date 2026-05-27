// ============================================================================
// Single source of truth for the model dropdown across the app.
//
// All enrichment goes through OpenRouter (see docs/companion-architecture.md
// §8a). Adding a model? Add an entry here AND a pricing row in
// `src/pricing.ts`. Model slug should match an OpenRouter model id exactly.
// ============================================================================

import { getApiKey } from './apiKeys';
import type { LLMProvider } from '../types';

export interface ModelChoice {
  label: string;
  pricingKey: string;
  factory: () => Promise<LLMProvider>;
  /** Relative cost indicator surfaced in the picker so users don't accidentally
   *  pick Opus and burn through their OpenRouter credit. Scaled by input+output
   *  per-1M-token sum (see src/pricing.ts):
   *    $      ≤ $5 / Mtok combined  (Gemini Flash)
   *    $$     ≤ $15                 (GPT-5, Gemini Pro)
   *    $$$    ≤ $25                 (Claude Sonnet)
   *    $$$$$  > $50                 (Claude Opus) */
  costTier: '$' | '$$' | '$$$' | '$$$$' | '$$$$$';
  /** Plain-English per-chapter ballpark, shown as a tooltip in the picker. */
  costHint: string;
}

async function openRouter() {
  const { OpenRouterProvider } = await import('../providers/OpenRouterProvider');
  return new OpenRouterProvider(getApiKey('openrouter'));
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    label: 'Claude Sonnet 4.5',
    pricingKey: 'openrouter/anthropic/claude-sonnet-4.5',
    factory: openRouter,
    costTier: '$$$',
    costHint: 'Recommended. Typical chapter ≈ $0.02–0.05.',
  },
  {
    label: 'Claude Opus 4.5',
    pricingKey: 'openrouter/anthropic/claude-opus-4.5',
    factory: openRouter,
    costTier: '$$$$$',
    costHint: 'Premium prose, ~5× the price of Sonnet. Typical chapter ≈ $0.10–0.25.',
  },
  {
    label: 'GPT-5',
    pricingKey: 'openrouter/openai/gpt-5',
    factory: openRouter,
    costTier: '$$',
    costHint: 'Cheaper than Sonnet. Typical chapter ≈ $0.01–0.03.',
  },
  {
    label: 'Gemini 2.5 Pro',
    pricingKey: 'openrouter/google/gemini-2.5-pro',
    factory: openRouter,
    costTier: '$$',
    costHint: 'Cheaper than Sonnet. Typical chapter ≈ $0.01–0.03.',
  },
  {
    label: 'Gemini 2.5 Flash',
    pricingKey: 'openrouter/google/gemini-2.5-flash',
    factory: openRouter,
    costTier: '$',
    costHint: 'Cheapest. Typical chapter ≈ $0.005. Good for tinkering or tight budgets.',
  },
];

// Default = Claude Sonnet 4.5: best-in-class for long-form narrative at a
// sensible price. Per the architecture doc, per-tier defaults are configurable
// in the backend at launch; this is the dev / Phase-0 default.
export const DEFAULT_MODEL_INDEX = 0;
