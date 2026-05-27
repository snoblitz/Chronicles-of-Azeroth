// ============================================================================
// OpenRouter provider — the strategic default LLM gateway.
//
// See docs/companion-architecture.md §8a for the rationale. One API, every
// model: BYOK users paste a single OpenRouter key and pick any model from the
// catalog. Companion+ tiers will hit the same gateway with a managed key.
//
// OpenRouter is OpenAI-compatible, so no SDK is needed — a plain fetch keeps
// the bundle small and gives us full control of headers (HTTP-Referer +
// X-Title for app attribution on openrouter.ai/activity).
//
// Phase 0: client-side calls (same as the other providers). Companion+ will
// proxy via the backend so the managed key never touches the renderer.
// ============================================================================
import { calculateCost, PRICING } from '../pricing';
import { recordUsage } from '../lib/spendTracker';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// OpenRouter recommends sending these so requests show up nicely in the
// account's activity feed and qualify for any app-discovery features.
const ATTRIBUTION_REFERER = 'https://aftertale.gg/';
const ATTRIBUTION_TITLE = 'Aftertale';

interface OpenRouterChoice {
  message?: { role?: string; content?: string };
  finish_reason?: string;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  // OpenRouter mirrors OpenAI's extended usage shape for cached input on
  // providers that support prompt caching (currently a subset — Anthropic
  // models via OR, etc.).
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: { message?: string; code?: string | number };
}

export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter' as const;
  readonly models = [
    'openrouter/anthropic/claude-sonnet-4.5',
    'openrouter/anthropic/claude-opus-4.5',
    'openrouter/openai/gpt-5',
    'openrouter/google/gemini-2.5-pro',
    'openrouter/google/gemini-2.5-flash',
  ] as const;

  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        "OpenRouterProvider: missing API key. Click the ⚙ Keys button in the header to add it, or set VITE_OPENROUTER_API_KEY in .env.local for local dev. Get one at https://openrouter.ai/keys"
      );
    }
    this.apiKey = apiKey;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const pricing = PRICING[request.model];
    if (!pricing) {
      throw new Error(`OpenRouterProvider: unknown model '${request.model}'`);
    }
    if (pricing.provider !== 'openrouter') {
      throw new Error(
        `OpenRouterProvider: model '${request.model}' is not an OpenRouter model (provider='${pricing.provider}')`
      );
    }

    // OpenAI-style messages translate 1:1 — system, user, assistant all valid.
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      model: pricing.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.8,
    };

    const start = performance.now();
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': ATTRIBUTION_REFERER,
        'X-Title': ATTRIBUTION_TITLE,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = performance.now() - start;

    let payload: OpenRouterResponse;
    try {
      payload = (await res.json()) as OpenRouterResponse;
    } catch {
      throw new Error(
        `OpenRouterProvider: non-JSON response (status ${res.status}). Check your API key and the model slug '${pricing.model}'.`
      );
    }

    if (!res.ok || payload.error) {
      const msg = payload.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenRouterProvider: ${msg}`);
    }

    const choice = payload.choices?.[0];
    const text = choice?.message?.content ?? '';

    const usage = payload.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;

    const stopReason: LLMResponse['stopReason'] =
      choice?.finish_reason === 'length'
        ? 'truncated'
        : choice?.finish_reason === 'stop' || choice?.finish_reason === 'end_turn'
          ? 'end'
          : 'other';

    const costUsd = calculateCost(request.model, inputTokens, cachedInputTokens, outputTokens);

    // Diagnostics — remove once we've seen real usage in production.
    console.log('[OpenRouterProvider] response', {
      model: pricing.model,
      finishReason: choice?.finish_reason,
      usage,
      textLength: text.length,
    });

    recordUsage({
      timestamp: Date.now(),
      provider: 'openrouter',
      model: request.model,
      task: request.task,
      tier: pricing.tier,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    });

    return {
      text,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      model: request.model,
      provider: 'openrouter',
      latencyMs,
      stopReason,
    };
  }
}
