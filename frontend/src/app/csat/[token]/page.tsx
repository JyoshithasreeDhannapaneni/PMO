'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Textarea } from '@/components/ui/Textarea';
import { CSAT_MAX_COMMENT_LENGTH } from '@/services/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FormInfo {
  projectName: string;
  customerName: string | null;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'form'; info: FormInfo }
  | { kind: 'done' }
  | { kind: 'closed'; title: string; message: string };

type RatingKey = 'overall' | 'migrationQuality' | 'support' | 'onboarding';

const CHOICE_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1';
const CHOICE_ON = 'border-brand bg-brand text-white shadow-sm';
const CHOICE_OFF = 'border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:bg-brand-light';

const QUESTIONS: { key: RatingKey; label: string; required?: boolean }[] = [
  { key: 'overall', label: 'Overall, how satisfied are you with the migration?', required: true },
  { key: 'migrationQuality', label: 'Quality of the migrated data' },
  { key: 'support', label: 'Support and communication from our team' },
  { key: 'onboarding', label: 'Onboarding and kickoff experience' },
];

// Same shape the API's public route accepts; anything else (e.g. a link cut off by an email
// client) never reaches the survey and is answered 401 by the auth gate, not 404.
const TOKEN_RE = /^[0-9a-f]{64}$/;

function closedState(status: number, message?: string): PageState {
  if (status === 409) return { kind: 'closed', title: 'Already answered', message: 'This survey has already been answered. Thank you for your feedback!' };
  if (status === 410) return { kind: 'closed', title: 'Link no longer active', message: 'This survey link has expired or was replaced by a newer one. Please use the latest email from your project manager.' };
  if (status === 404 || status === 401) return { kind: 'closed', title: 'Survey not found', message: 'This survey link is not valid. Please check that you opened the full link from the email.' };
  return { kind: 'closed', title: 'Something went wrong', message: message || 'Please try again in a few minutes.' };
}

function RatingRow({ labelId, value, onChange }: { labelId: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
    <div role="group" aria-labelledby={labelId} className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`h-11 w-full rounded-lg border text-base font-medium transition-colors sm:w-11 ${CHOICE_FOCUS} ${
            value === n ? CHOICE_ON : CHOICE_OFF
          }`}
        >
          {n}
        </button>
      ))}
    </div>
    <div className="mt-1 flex justify-between text-xs text-slate-400 sm:w-[494px]">
      <span>Very poor</span>
      <span>Excellent</span>
    </div>
    </div>
  );
}

export default function CsatSurveyPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({ overall: null, migrationQuality: null, support: null, onboarding: null });
  const [wentWell, setWentWell] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!TOKEN_RE.test(token)) {
      setState(closedState(404));
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/csat/${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body?.data) setState({ kind: 'form', info: body.data as FormInfo });
        else setState(closedState(res.status, body?.error?.message));
      } catch {
        if (!cancelled) setState(closedState(0));
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ratings.overall === null) return setFormError('Please give an overall rating.');
    if (wentWell === null) return setFormError('Please tell us whether the project went well.');
    setFormError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/csat/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ratings, wentWell, comments: comments.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setState({ kind: 'done' });
      else if (res.status === 400) setFormError(body?.error?.message || 'Please check your answers.');
      else setState(closedState(res.status, body?.error?.message));
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <header className="mx-auto mb-6 flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <Image src="/cloudfuze-logo.png" alt="CloudFuze" width={150} height={81} priority className="h-auto w-[150px]" />
        <p className="text-sm text-slate-500">Customer satisfaction survey from your CloudFuze project team</p>
      </header>
      <main className="mx-auto w-full max-w-2xl rounded-2xl border-t-4 border-brand bg-white p-6 shadow-md shadow-brand/5 sm:p-8">
        {state.kind === 'loading' && <p className="text-center text-sm text-slate-500">Loading survey...</p>}

        {state.kind === 'closed' && (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-brand">{state.title}</h1>
            <p className="mt-2 text-base text-slate-600">{state.message}</p>
          </div>
        )}

        {state.kind === 'done' && (
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-brand">Thank you!</h1>
            <p className="mt-2 text-base text-slate-600">Your feedback has been recorded and shared with your project manager.</p>
          </div>
        )}

        {state.kind === 'form' && (
          <form onSubmit={submit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-brand">How did your migration go?</h1>
              <p className="mt-1 text-sm text-slate-500">
                {state.info.customerName ? `${state.info.customerName} · ` : ''}
                {state.info.projectName}
              </p>
              <p className="mt-3 text-base text-slate-600">Rate each item from 1 (very poor) to 10 (excellent). It takes about a minute.</p>
            </div>

            {QUESTIONS.map((q) => (
              <div key={q.key}>
                <p id={`q-${q.key}`} className="mb-2 text-base font-medium text-slate-700">
                  {q.label}
                  {q.required ? <span className="text-red-500"> *</span> : <span className="text-slate-400"> (optional)</span>}
                </p>
                <RatingRow labelId={`q-${q.key}`} value={ratings[q.key]} onChange={(v) => setRatings((r) => ({ ...r, [q.key]: v }))} />
              </div>
            ))}

            <div>
              <p id="q-went-well" className="mb-2 text-base font-medium text-slate-700">
                Did the project go well overall?<span className="text-red-500"> *</span>
              </p>
              <div role="group" aria-labelledby="q-went-well" className="flex gap-2">
                {[{ v: true, label: 'Yes' }, { v: false, label: 'No' }].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setWentWell(o.v)}
                    aria-pressed={wentWell === o.v}
                    className={`h-11 rounded-lg border px-6 text-base font-medium transition-colors ${CHOICE_FOCUS} ${
                      wentWell === o.v ? CHOICE_ON : CHOICE_OFF
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              label="Anything you'd like to tell us? (optional)"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              maxLength={CSAT_MAX_COMMENT_LENGTH}
            />

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-white shadow-md shadow-brand/20 transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit feedback'}
            </button>
          </form>
        )}
      </main>
      <footer className="mx-auto mt-6 w-full max-w-2xl text-center text-xs text-slate-400">
        <span className="font-semibold text-brand">CloudFuze</span> ·{' '}
        <a href="https://www.cloudfuze.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">cloudfuze.com</a>
      </footer>
    </div>
  );
}
