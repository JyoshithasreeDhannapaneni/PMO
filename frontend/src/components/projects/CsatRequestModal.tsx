'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useCsatEmailPreview, useSendCsatRequest } from '@/hooks/useProjects';
import {
  CSAT_EMAIL_RE, CSAT_MAX_CC, CSAT_MAX_MESSAGE_LENGTH, CSAT_MAX_NAME_LENGTH, CSAT_MAX_PROJECT_NAME_LENGTH, CSAT_REQUIRED_EVENT, CsatRequiredDetail,
} from '@/services/api';

const PREVIEW_DEBOUNCE_MS = 400;

function errorMessage(error: unknown, fallback: string): string {
  const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return msg || fallback;
}

export function CsatRequestModal() {
  const [detail, setDetail] = useState<CsatRequiredDetail | null>(null);
  const [email, setEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [message, setMessage] = useState('');
  // Fields are filled from the project's defaults once; afterwards they are the PM's edits.
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [edited, setEdited] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [ccList, setCcList] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState('');
  const [ccError, setCcError] = useState('');
  const [previewInput, setPreviewInput] = useState({ customerName: '', projectName: '', message: '' });
  const sendRequest = useSendCsatRequest();
  const { showToast } = useToast();
  const { user } = useAuth();

  // The backend also checks the PM is this project's own; other roles can only read why they are blocked.
  const canSend = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  const preview = useCsatEmailPreview(detail && canSend ? detail.projectId : null, previewInput);
  const previewData = preview.data?.data;

  useEffect(() => {
    const onRequired = (e: Event) => {
      const d = (e as CustomEvent<CsatRequiredDetail>).detail;
      setDetail(d);
      setEmail(d.csat.sentTo ?? '');
      setCustomerName('');
      setProjectName('');
      setMessage('');
      setDefaultsLoaded(false);
      setEdited(false);
      setEmailError('');
      setCcList([]);
      setCcDraft('');
      setCcError('');
      setPreviewInput({ customerName: '', projectName: '', message: '' });
      sendRequest.reset();
    };
    window.addEventListener(CSAT_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(CSAT_REQUIRED_EVENT, onRequired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (defaultsLoaded || !previewData) return;
    setCustomerName(previewData.defaultCustomerName ?? '');
    setProjectName(previewData.defaultProjectName);
    setMessage(previewData.defaultMessage);
    setDefaultsLoaded(true);
  }, [previewData, defaultsLoaded]);

  useEffect(() => {
    if (!defaultsLoaded) return;
    const t = setTimeout(
      () => setPreviewInput({ customerName: customerName.trim(), projectName: projectName.trim(), message: message.trim() }),
      PREVIEW_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
  }, [customerName, projectName, message, defaultsLoaded]);

  // Backdrop click and Escape only dismiss an untouched form, so typed input is not lost.
  const dirty = edited || ccList.length > 0 || !!ccDraft.trim() || (!!detail && email.trim() !== (detail.csat.sentTo ?? ''));

  // Adds the typed or pasted addresses (comma, semicolon or space separated). Returns the full
  // list, or null when something typed is invalid so the caller can stop.
  const commitCc = (): string[] | null => {
    const parts = ccDraft.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return ccList;
    const invalid = parts.find((p) => !CSAT_EMAIL_RE.test(p));
    if (invalid) {
      setCcError(`"${invalid}" is not a valid email address`);
      return null;
    }
    const next = Array.from(new Set([...ccList, ...parts]));
    if (next.length > CSAT_MAX_CC) {
      setCcError(`You can CC at most ${CSAT_MAX_CC} people`);
      return null;
    }
    setCcList(next);
    setCcDraft('');
    setCcError('');
    return next;
  };

  const onCcKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      commitCc();
    } else if (e.key === 'Backspace' && !ccDraft && ccList.length > 0) {
      setCcList(ccList.slice(0, -1));
    }
  };
  const editField = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    set(e.target.value);
    setEdited(true);
  };

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dirty) setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, dirty]);

  if (!detail) return null;

  const { csat } = detail;
  const pending = csat.state === 'pending';
  const close = () => setDetail(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const recipientEmail = email.trim();
    if (!CSAT_EMAIL_RE.test(recipientEmail)) {
      setEmailError('Enter a valid customer email address');
      return;
    }
    setEmailError('');
    const cc = commitCc();
    if (cc === null) return;
    sendRequest.mutate(
      {
        projectId: detail.projectId,
        recipientEmail,
        cc: cc.length > 0 ? cc : undefined,
        customerName: customerName.trim() || undefined,
        // Unchanged defaults are left to the backend, which renders the same text.
        projectName: projectName.trim() && projectName.trim() !== previewData?.defaultProjectName ? projectName.trim() : undefined,
        message: message.trim() && message.trim() !== previewData?.defaultMessage ? message.trim() : undefined,
      },
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
          if (cc.length > 0) {
            showToast('info', 'Internal copy', `A copy without the survey link went to ${cc.length} CC recipient${cc.length === 1 ? '' : 's'}. Your confirmation email says if it failed.`);
          }
          close();
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!dirty) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csat-modal-title"
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${canSend ? 'max-w-5xl' : 'max-w-lg'}`}
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Customer name"
                value={customerName}
                onChange={editField(setCustomerName)}
                maxLength={CSAT_MAX_NAME_LENGTH}
                placeholder="e.g. Joseph Vinsky"
                helperText="Used in the greeting: “Dear <name>,”"
              />
              <Input
                label="Project name (as the customer sees it)"
                value={projectName}
                onChange={editField(setProjectName)}
                maxLength={CSAT_MAX_PROJECT_NAME_LENGTH}
                placeholder="e.g. Acme email migration"
                helperText="Shown in the subject, the email and the survey page"
              />
              <Input
                label="Customer email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@company.com"
                error={emailError}
                autoFocus
              />
              <div>
                <label htmlFor="csat-cc" className="mb-1 block text-sm font-medium text-slate-700">
                  CC <span className="font-normal text-slate-400">(internal CloudFuze people, optional)</span>
                </label>
                <div
                  className={`flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 shadow-sm transition-all focus-within:ring-2 ${
                    ccError ? 'border-red-300 focus-within:ring-red-100' : 'border-blue-200 hover:border-blue-300 focus-within:border-blue-400 focus-within:ring-blue-100'
                  }`}
                >
                  {ccList.map((addr) => (
                    <span key={addr} className="flex items-center gap-1 rounded-md bg-blue-50 py-0.5 pl-2 pr-1 text-xs text-blue-800">
                      {addr}
                      <button
                        type="button"
                        onClick={() => setCcList(ccList.filter((a) => a !== addr))}
                        className="rounded px-1 leading-none text-blue-500 hover:bg-blue-100 hover:text-blue-700"
                        aria-label={`Remove ${addr}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    id="csat-cc"
                    type="text"
                    value={ccDraft}
                    onChange={(e) => { setCcDraft(e.target.value); setCcError(''); }}
                    onKeyDown={onCcKeyDown}
                    onBlur={() => { commitCc(); }}
                    placeholder={ccList.length === 0 ? 'name@cloudfuze.com, another@cloudfuze.com' : ''}
                    className="min-w-[160px] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
                {ccError
                  ? <p className="mt-1 text-sm text-red-500">{ccError}</p>
                  : <p className="mt-1 text-sm text-slate-500">They get a separate copy without the survey link, so only the customer can answer.</p>}
              </div>
              <div>
                <Textarea
                  label="Email message"
                  value={message}
                  onChange={editField(setMessage)}
                  rows={5}
                  maxLength={CSAT_MAX_MESSAGE_LENGTH}
                  placeholder="Write the message the customer will read above the project name"
                />
                {previewData && message.trim() !== previewData.defaultMessage && (
                  <button
                    type="button"
                    onClick={() => { setMessage(previewData.defaultMessage); setEdited(true); }}
                    className="mt-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    Reset to the default message
                  </button>
                )}
              </div>
              {sendRequest.isError && (
                <p className="text-sm text-red-600">{errorMessage(sendRequest.error, 'Could not send the survey. Please try again.')}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={sendRequest.isPending}>
                  {pending ? 'Resend survey' : 'Send survey'}
                </Button>
              </div>
            </form>

            <section aria-label="Email preview" className="flex min-w-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">Email preview</p>
                {preview.isFetching && <span className="text-xs text-slate-400">Updating...</span>}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="space-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="truncate"><span className="font-medium text-slate-500">To:</span> {email.trim() || 'customer@company.com'}</p>
                  {ccList.length > 0 && (
                    <p className="truncate" title={ccList.join(', ')}>
                      <span className="font-medium text-slate-500">Internal copy (no link):</span> {ccList.join(', ')}
                    </p>
                  )}
                  <p className="truncate"><span className="font-medium text-slate-500">Subject:</span> {previewData?.subject ?? '...'}</p>
                </div>
                {preview.isError && !previewData ? (
                  <p className="p-4 text-sm text-red-600">{errorMessage(preview.error, 'Could not load the email preview.')}</p>
                ) : previewData ? (
                  <iframe
                    title="C-SAT email preview"
                    sandbox=""
                    srcDoc={previewData.html}
                    className="h-[440px] w-full bg-white lg:h-[520px]"
                  />
                ) : (
                  <p className="p-4 text-sm text-slate-400">Loading preview...</p>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">The button in the preview is disabled; the real email carries the customer&apos;s one-time link.</p>
            </section>
          </div>
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
