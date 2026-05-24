// ============================================================================
// Single source of truth for the model dropdown across the app.
// Adding a model? Add an entry here AND a pricing row in `src/pricing.ts`.
// ============================================================================

import { AnthropicProvider } from '../providers/AnthropicProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import type { LLMProvider } from '../types';

export interface ModelChoice {
  label: string;
  pricingKey: string;
  factory: () => LLMProvider;
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    label: 'Gemini Flash',
    pricingKey: 'gemini-flash',
    factory: () => new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY ?? ''),
  },
  {
    label: 'Gemini Pro',
    pricingKey: 'gemini-pro',
    factory: () => new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY ?? ''),
  },
  {
    label: 'Claude Haiku 4.5',
    pricingKey: 'claude-haiku-4.5',
    factory: () => new AnthropicProvider(import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''),
  },
  {
    label: 'Claude Sonnet 4.6',
    pricingKey: 'claude-sonnet-4.6',
    factory: () => new AnthropicProvider(import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''),
  },
];

export const DEFAULT_MODEL_INDEX = 0; // Gemini Flash — cheapest, fast, plenty for the POC
