import { useEffect, useRef, useState } from 'react';
import { toIso } from '@worldlens/shared';
import { runActions } from '../ai/actionExecutor';
import { api, type ChatMessage, type ChatResponse } from '../lib/api';
import { safeExternalUrl } from '../lib/format';
import { useConfig } from '../hooks/useData';
import { useAppStore } from '../state/store';
import { Badge, ExternalLink, Notice, Spinner } from './ui';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  meta?: ChatResponse & { rejected: string[] };
}

const QUICK = [
  'What is happening near Taiwan?',
  "Show me Germany's territorial changes between 1933 and 1945",
  'Why does this matter historically?',
  'I have $20. How can I help?',
  'Berlin 1945',
];

export function AssistantPanel({ onClose }: { onClose?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useConfig();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    const history: ChatMessage[] = [
      ...turns.map((t): ChatMessage => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: q },
    ].slice(-12);
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    const s = useAppStore.getState();
    try {
      const res = await api.chat({
        messages: history,
        context: {
          mode: s.mode,
          timeIso: toIso(s.mode === 'live' ? Date.now() : s.timeMs),
          resolution: s.resolution,
          selectedEventId: s.selectedEventId,
          camera: { lat: s.camera.lat, lon: s.camera.lon, altitudeKm: s.camera.altitudeKm },
          layers: s.layers,
        },
      });
      const { rejected } = runActions(res.actions);
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: res.reply, meta: { ...res, rejected } },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    const onAsk = (e: Event) => void send(String((e as CustomEvent).detail ?? ''));
    window.addEventListener('worldlens:ask', onAsk);
    return () => window.removeEventListener('worldlens:ask', onAsk);
  });

  const aiOn = config.data?.ai.available;
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="AI assistant"
      data-testid="assistant"
    >
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">Ask WorldLens</h2>
        <Badge tone={aiOn ? 'ok' : 'neutral'}>{aiOn ? 'AI' : 'Offline assistant'}</Badge>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-1 text-[12px] text-slate-400 hover:bg-white/10"
            aria-label="Close assistant"
          >
            ✕
          </button>
        )}
      </header>
      <div
        ref={listRef}
        className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {turns.length === 0 && (
          <div className="space-y-2 text-[12.5px] text-slate-400">
            <p>
              Ask about places, events or dates. The assistant can move the globe and the timeline,
              open events and compare coverage.
            </p>
            {!aiOn && config.data && (
              <p className="text-slate-500">
                No AI model is configured on this server, so a rule-based assistant answers from
                WorldLens data.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void send(p)}
                  className="rounded-full border border-sky-300/30 px-2.5 py-1 text-left text-[12px] text-sky-100 hover:bg-sky-300/10"
                  data-testid="quick-prompt"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${t.role === 'user' ? 'bg-sky-400/15 text-sky-50' : 'bg-white/[0.05] text-slate-100'}`}
              data-testid={t.role === 'assistant' ? 'assistant-reply' : undefined}
            >
              <p className="whitespace-pre-wrap">{t.content}</p>
              {t.meta && (
                <div className="mt-2 space-y-1.5 text-[11px] text-slate-400">
                  {t.meta.notice && <p className="text-amber-200/80">{t.meta.notice}</p>}
                  {t.meta.toolTrace.length > 0 && (
                    <details>
                      <summary className="cursor-pointer select-none">
                        What I did ({t.meta.toolTrace.length} tool calls)
                      </summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[10.5px]">
                        {t.meta.toolTrace.map((x, j) => (
                          <li key={j} className={x.ok ? 'text-slate-400' : 'text-rose-300'}>
                            {x.ok ? '✓' : '✗'} {x.tool}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {t.meta.rejected.length > 0 && (
                    <p className="text-rose-300">
                      Ignored {t.meta.rejected.length} invalid action(s).
                    </p>
                  )}
                  {t.meta.citations.length > 0 && (
                    <ul className="space-y-0.5">
                      {t.meta.citations.map((c) => {
                        const href = safeExternalUrl(c.url);
                        return href ? (
                          <li key={c.url}>
                            <ExternalLink href={href}>{c.title}</ExternalLink>{' '}
                            <span className="text-slate-500">· {c.publisher}</span>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  )}
                  {t.meta.model && (
                    <p className="text-slate-500">
                      {t.meta.model}
                      {t.meta.usage && ` · ~$${t.meta.usage.costUsd.toFixed(4)}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <Spinner label="Thinking and moving the globe…" />}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <form
        className="border-t border-white/[0.07] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Ask the assistant
        </label>
        <div className="flex gap-2">
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="e.g. What is happening near Taiwan?"
            className="min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500"
            data-testid="assistant-input"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-sky-300 px-3 text-[13px] font-semibold text-slate-900 disabled:opacity-40"
            data-testid="assistant-send"
          >
            Ask
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] text-slate-500">
          The assistant can open a payment review screen but can never pay. You approve every
          payment in PayPal yourself.
        </p>
      </form>
    </section>
  );
}
