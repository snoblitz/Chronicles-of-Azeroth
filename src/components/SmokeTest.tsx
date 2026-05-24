import { useState } from 'react';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { ModelPicker } from './ModelPicker';
import type { LLMResponse } from '../types';

const SMOKE_PROMPT =
  'You are an ancient Azerothian historian. In exactly 2 sentences, tell me one obscure fact about the Old Gods.';

export function SmokeTest() {
  const [choiceIdx, setChoiceIdx] = useState(DEFAULT_MODEL_INDEX);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<LLMResponse | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const choice = MODEL_CHOICES[choiceIdx];
      const provider = choice.factory();
      const res = await provider.chat({
        task: 'npc-chat',
        model: choice.pricingKey,
        maxTokens: 2048,
        temperature: 0.8,
        messages: [{ role: 'user', content: SMOKE_PROMPT }],
      });
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="coa-panel">
      <h2>Smoke test</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Pings the selected model with a tiny Azeroth-flavored prompt. Watch the spend bar light up.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '1.25rem' }}>
        <ModelPicker value={choiceIdx} onChange={setChoiceIdx} disabled={loading} label="Model" />
        <button
          className={`coa-btn ${loading ? '' : 'coa-btn-primary'}`}
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? 'Calling…' : 'Run smoke test'}
        </button>
      </div>

      {error && (
        <div
          className="coa-callout coa-callout-danger"
          style={{
            marginTop: '1.25rem',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div style={{ marginTop: '1.25rem' }}>
          <div
            className="coa-bubble coa-bubble-loremaster"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            <span className="coa-bubble-label">RESPONSE</span>
            {response.text}
          </div>
          <div style={{ marginTop: '0.6rem', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-faint)' }}>
            {response.inputTokens} in / {response.cachedInputTokens} cached / {response.outputTokens} out ·{' '}
            {response.latencyMs.toFixed(0)}ms · {response.model}
          </div>
        </div>
      )}
    </section>
  );
}
