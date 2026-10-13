'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSendCsatRequest } from '@/hooks/useProjects';
import { CSAT_EMAIL_RE, CSAT_MAX_MESSAGE_LENGTH, CSAT_REQUIRED_EVENT, CsatRequiredDetail } from '@/services/api';

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
  const { user } = useAuth();

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

  // Backdrop click and Escape only dismiss an untouched form, so typed input is not lost.
  const edited = !!detail && (message.trim() !== '' || email.trim() !== (detail.csat.sentTo ?? ''));

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !edited) setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, edited]);

  if (!detail) return null;

  const { csat } = detail;
  const pending = csat.state === 'pending';
  // The backend also checks the PM is this project's own; other roles can only read why they are blocked.
  const canSend = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  const close = () => setDetail(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const recipientEmail = email.trim();
    if (!CSAT_EMAIL_RE.test(recipientEmail)) {
      setEmailError('Enter a valid customer email address');
      return;
    }
    setEmailError('');
    sendRequest.mutate(
      { projectId: detail.projectId, recipientEmail, message: message.trim() || undefined },
      {
        onSuccess: (res) => {
          const sentFrom = res.data?.sentFrom;
          const fromShared = !!sentFrom && !!user?.email && sentFrom.toLowerCase() !== user.email.toLowerCase();
          showToast(
            'success',
            'C-SAT survey sent',
            fromShared
              ? `Sent to ${recipientEmail} from ${sentFrom} (your mailbox could not be used); replies come to you.`
              : `Sent to ${recipientEmail}. The phase can move to Delta once the customer responds.`
          );
          close();
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!edited) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csat-modal-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="csat-modal-title" className="text-lg font-semibold text-slate-800">Customer satisfaction survey required</h2>
            <p className="mt-1 text-sm text-slate-500">
              Before this project moves to Delta, the customer must answer a short C-SAT survey about how the migration went.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="-m-1 rounded-lg p-1 text-xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {pending && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {csat.expired ? 'The survey' : 'Survey'} sent to <span className="font-medium">{csat.sentTo}</span>
            {csat.sentAt && <> on {new Date(csat.sentAt).toLocaleDateString()}</>}
            {csat.expired
              ? ' has expired without a reply. Send it again to get a new link.'
              : '. Waiting for the customer to reply. You can resend it below; the earlier link will stop working.'}
          </div>
        )}

        {canSend ? (
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
              maxLength={CSAT_MAX_MESSAGE_LENGTH}
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
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Only the project&apos;s project manager or an admin can send the survey.</p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
