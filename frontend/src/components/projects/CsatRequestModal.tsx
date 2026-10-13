'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/context/ToastContext';
import { useSendCsatRequest } from '@/hooks/useProjects';
import { CSAT_REQUIRED_EVENT, CsatRequiredDetail } from '@/services/api';

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

function errorMessage(error: unknown): string {
  const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return msg || 'Could not send the survey. Please try again.';
}

export function CsatRequestModal() {
  const [detail, setDetail] = useState<CsatRequiredDetail | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const sendRequest = useSendCsatRequest();
  const { showToast } = useToast();

  useEffect(() => {
    const onRequired = (e: Event) => {
      const d = (e as CustomEvent<CsatRequiredDetail>).detail;
      setDetail(d);
      setEmail(d.csat.sentTo ?? '');
      setMessage('');
      setEmailError('');
      sendRequest.reset();
    };
    window.addEventListener(CSAT_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(CSAT_REQUIRED_EVENT, onRequired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!detail) return null;

  const pending = detail.csat.state === 'pending';
  const close = () => setDetail(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const recipientEmail = email.trim();
    if (!EMAIL_RE.test(recipientEmail)) {
      setEmailError('Enter a valid customer email address');
      return;
    }
    setEmailError('');
    sendRequest.mutate(
      { projectId: detail.projectId, recipientEmail, message: message.trim() || undefined },
      {
        onSuccess: () => {
          showToast('success', 'C-SAT survey sent', `Sent to ${recipientEmail}. The phase can move to Delta once the customer responds.`);
          close();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={close}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Customer satisfaction survey required</h2>
            <p className="mt-1 text-sm text-slate-500">
              Before this project moves to Delta, the customer must answer a short C-SAT survey about how the migration went.
            </p>
          </div>
          <button type="button" onClick={close} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="Close">
            ×
          </button>
        </div>

        {pending && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Survey sent to <span className="font-medium">{detail.csat.sentTo}</span>
            {detail.csat.sentAt && <> on {new Date(detail.csat.sentAt).toLocaleDateString()}</>}. Waiting for the customer to reply.
            You can resend it below; the earlier link will stop working.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Customer email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@company.com"
            error={emailError}
            autoFocus
          />
          <Textarea
            label="Personal note (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Thanks for working with us on this migration..."
          />
          {sendRequest.isError && <p className="text-sm text-red-600">{errorMessage(sendRequest.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" isLoading={sendRequest.isPending}>
              {pending ? 'Resend survey' : 'Send survey'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
