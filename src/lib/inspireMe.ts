/**
 * Inspire Me API -- the runtime entry point for the suggestion button.
 *
 * Wraps the prompt builder, an LLMProvider, and response parsing into a
 * single async call the UI can fire. Provider-agnostic: pass any
 * LLMProvider (Gemini, Anthropic, mock for tests).
 *
 * Spend tracking happens inside the provider's chat() implementation,
 * so calls made through here will show up in the spend tracker tagged
 * with task='inspire-me'.
 */

import type { LLMProvider } from '../types';
import {
  buildInspireMePrompt,
  buildInspireMeMixPrompt,
  parseInspireMeResponse,
  parseInspireMeMixResponse,
  validateInspireMeContext,
  InspireMeParseError,
  type InspireMeContext,
  type InspireMeMixContext,
  type InspireMeResponse,
  type InspireMeMixResponse,
  type InspireMeSuggestion,
} from './inspireMePrompt';

export class InspireMeError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'InspireMeError';
  }
}

export interface InspireMeCallOptions {
  /** Override the default model. Default: 'gemini-flash'. */
  model?: string;
  /** Override sampling temperature. Default: 0.9 (high variety). */
  temperature?: number;
  /** Override max output tokens. Default: 800 (room for 3 suggestions). */
  maxTokens?: number;
}

export interface InspireMeResult extends InspireMeResponse {
  /** Raw model output -- kept for debugging / showing "View raw" in dev UI. */
  raw: string;
  /** Latency in milliseconds, end-to-end including parse. */
  latencyMs: number;
  /** Token usage from the provider. */
  inputTokens: number;
  outputTokens: number;
  /** Which prompt version generated these -- bump if you change the prompt. */
  promptVersion: number;
}

export interface InspireMeMixResult extends InspireMeMixResponse {
  raw: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  promptVersion: number;
}

const DEFAULT_MODEL = 'gemini-flash';
const DEFAULT_TEMPERATURE = 0.9;
const DEFAULT_MAX_TOKENS = 800;

/**
 * Generate 3 Inspire Me suggestion cards for the given context.
 * Throws InspireMeError on validation, network, or parse failure.
 */
export async function generateInspireMe(
  context: InspireMeContext,
  provider: LLMProvider,
  options: InspireMeCallOptions = {},
): Promise<InspireMeResult> {
  const errors = validateInspireMeContext(context);
  if (errors.length > 0) {
    throw new InspireMeError(`invalid context: ${errors.join('; ')}`);
  }

  const prompt = buildInspireMePrompt(context);
  const start = performance.now();

  let response;
  try {
    response = await provider.chat({
      task: 'inspire-me',
      model: options.model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
  } catch (e) {
    throw new InspireMeError(`provider call failed: ${(e as Error).message}`, e);
  }

  let parsed;
  try {
    parsed = parseInspireMeResponse(response.text);
  } catch (e) {
    if (e instanceof InspireMeParseError) {
      throw new InspireMeError(`could not parse model output: ${e.message}`, e);
    }
    throw e;
  }

  return {
    ...parsed,
    raw: response.text,
    latencyMs: performance.now() - start,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    promptVersion: 1,
  };
}

/**
 * Mix mode: take 2 suggestions the user liked pieces of and merge into 1.
 */
export async function generateInspireMeMix(
  context: InspireMeMixContext,
  provider: LLMProvider,
  options: InspireMeCallOptions = {},
): Promise<InspireMeMixResult> {
  const prompt = buildInspireMeMixPrompt(context);
  const start = performance.now();

  let response;
  try {
    response = await provider.chat({
      task: 'inspire-me',
      model: options.model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? 400,
    });
  } catch (e) {
    throw new InspireMeError(`provider call failed: ${(e as Error).message}`, e);
  }

  let parsed;
  try {
    parsed = parseInspireMeMixResponse(response.text);
  } catch (e) {
    if (e instanceof InspireMeParseError) {
      throw new InspireMeError(`could not parse mix output: ${e.message}`, e);
    }
    throw e;
  }

  return {
    ...parsed,
    raw: response.text,
    latencyMs: performance.now() - start,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    promptVersion: 1,
  };
}

export type { InspireMeContext, InspireMeMixContext, InspireMeSuggestion };
