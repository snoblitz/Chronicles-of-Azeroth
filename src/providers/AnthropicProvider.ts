// ============================================================================
// Anthropic provider — uses the official @anthropic-ai/sdk.
// Phase 0: client-side calls. Real production deployment would proxy via backend
// to keep the API key off the client (we don't ship Phase 0).
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { calculateCost, PRICING } from '../pricing';
import { recordUsage } from '../lib/spendTracker';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  readonly models = ['claude-haiku-4.5', 'claude-sonnet-4.6'] as const;

  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('AnthropicProvider: missing API key. Click the ⚙ Keys button in the header to add it, or set VITE_ANTHROPIC_API_KEY in .env.local for local dev.');
    }
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const pricing = PRICING[request.model];
    if (!pricing) {
      throw new Error(`AnthropicProvider: unknown model '${request.model}'`);
    }

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    const start = performance.now();
    const result = await this.client.messages.create({
      model: pricing.model,
      max_tokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.8,
      system: systemMessages.map((m) => m.content).join('\n\n') || undefined,
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });
    const latencyMs = performance.now() - start;

    const text = result.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const inputTokens = result.usage.input_tokens;
    // cache_read_input_tokens is present on the wire but not in older SDK typings.
    const cachedInputTokens =
      (result.usage as { cache_read_input_tokens?: number | null }).cache_read_input_tokens ?? 0;
    const outputTokens = result.usage.output_tokens;

    const stopReason: LLMResponse['stopReason'] =
      result.stop_reason === 'max_tokens' ? 'truncated'
      : result.stop_reason === 'end_turn' || result.stop_reason === 'stop_sequence' ? 'end'
      : 'other';

    const costUsd = calculateCost(request.model, inputTokens, cachedInputTokens, outputTokens);

    recordUsage({
      timestamp: Date.now(),
      provider: 'anthropic',
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
      provider: 'anthropic',
      latencyMs,
      stopReason,
    };
  }
}
