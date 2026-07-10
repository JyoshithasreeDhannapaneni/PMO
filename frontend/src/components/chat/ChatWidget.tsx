'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED = [
  'How many projects are delayed?',
  'Show all escalated projects',
  'Which PM has the most delays?',
];

// 4-pointed star — clean AI indicator used by most modern AI products
function SparkleIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 0 L12.2 7.8 L20 10 L12.2 12.2 L10 20 L7.8 12.2 L0 10 L7.8 7.8 Z" />
    </svg>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      const reply: string = json?.data?.reply ?? json?.error ?? 'No response received.';
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: 'Could not reach the AI service. Ensure the backend is running and ANTHROPIC_API_KEY is set.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">

      {/* ── Chat Panel ─────────────────────────────────────────── */}
      {open && (
        <div
          className="flex flex-col bg-white rounded-xl shadow-xl border border-gray-200/80 overflow-hidden"
          style={{ width: '320px', height: '450px' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)' }}
          >
            <div className="flex items-center gap-2">
              {/* Sparkle icon in a tight circle */}
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <SparkleIcon className="text-white" size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-none tracking-wide">PMO Assistant</p>
                <p className="text-[10px] text-white/55 mt-0.5 leading-none">Powered by AI · Live data</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-[10px] text-white/50 hover:text-white/90 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/60">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)' }}
                >
                  <SparkleIcon className="text-indigo-500" size={20} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-gray-700">Ask anything about your projects</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Real-time access to all PMO data</p>
                </div>
                <div className="w-full space-y-1">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/40 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[86%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm shadow-sm'
                      }`}
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        ...(msg.role === 'user'
                          ? { background: 'linear-gradient(135deg, #4338ca, #6d28d9)' }
                          : {}),
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2.5 shadow-sm">
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '140ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '280ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="px-2.5 py-2 border-t border-gray-100 bg-white shrink-0">
            <div className="flex items-end gap-1.5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about projects, delays, CSAT…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 transition-shadow"
                style={{ maxHeight: '72px', overflowY: 'auto', minHeight: '30px' }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-85 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #4338ca, #6d28d9)' }}
              >
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <p className="text-[9px] text-gray-400 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}

      {/* ── Floating Toggle Button ──────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close PMO Assistant' : 'Open PMO Assistant'}
        className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xl"
        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)' }}
      >
        {open ? (
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <SparkleIcon className="text-white" size={18} />
        )}
      </button>
    </div>
  );
}
