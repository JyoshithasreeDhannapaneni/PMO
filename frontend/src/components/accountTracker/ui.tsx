'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Sparkles, X, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { dayTime, errorInfo, href, isBlank } from '@/lib/accountTracker';

// Small building blocks shared by the Account Tracker pages (ported from the Sales Tracker's components/ui).

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-gradient px-4 py-2 text-sm font-medium text-white shadow-btn transition-all hover:shadow-btn-hover disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50',
  ghost: 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
  small: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40',
};

export const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

const LEVEL_CLASS: Record<string, string> = {
  High: 'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function ProbabilityBadge({ value }: { value: string | null | undefined }) {
  const v = String(value ?? '').trim().toLowerCase();
  const level = v.startsWith('h') ? 'High' : v.startsWith('m') ? 'Medium' : v.startsWith('l') ? 'Low' : null;
  if (!level) return <span className="text-gray-400">—</span>;
  return <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', LEVEL_CLASS[level])}>{level}</span>;
}

export function Tag({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      accent ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600')}>
      {children}
    </span>
  );
}

/** Marks content written by the AI, so users know to give it a quick check. */
export function AiTag({ label = 'AI' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600"
      title="Written by the AI from HubSpot, the company website, its public DNS records and web research">
      <Sparkles className="h-3 w-3" /> {label}
    </span>
  );
}

/** "Written by AI on 15 Oct 2026, 18:02 — check before sending." */
export function AiFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
      <Sparkles className="h-3 w-3 text-violet-400" />
      Written by AI on {dayTime(generatedAt)} from HubSpot, the company website, DNS records and web research{' '}— check before sending to a customer.
    </p>
  );
}

/** What to show while an AI section is not ready: analysing, paused, failed, or not set up. */
export function AiPending({ ai, error, what }: {
  ai: { configured: boolean; pausedReason?: string | null; running?: boolean } | undefined; error?: string | null; what: string;
}) {
  if (ai && !ai.configured) {
    return <Note tone="muted">AI analysis isn&apos;t set up on this server (OPENAI_API_KEY is missing).</Note>;
  }
  if (ai?.pausedReason) return <Note tone="warn">AI analysis is paused: {ai.pausedReason}</Note>;
  if (error) return <Note tone="warn">The AI could not finish {what} ({error}). It will try again automatically.</Note>;
  if (!ai?.running) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-3 py-2.5 text-sm text-violet-700">
        <Sparkles className="h-4 w-4" />
        Not analysed yet — the AI picks it up with the next sync (automatically every 15 minutes, or click Sync).
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-3 py-2.5 text-sm text-violet-700">
      <Loader2 className="h-4 w-4 animate-spin" />
      AI is analysing {what} — it appears here automatically within a few minutes.
    </div>
  );
}

function Note({ tone, children }: { tone: 'warn' | 'muted'; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5 text-sm', tone === 'warn' ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500')}>
      {children}
    </div>
  );
}

const BASIS_LABEL: Record<string, string> = {
  hubspot: 'from HubSpot',
  ai: 'AI classification',
  activity: 'measured from replies',
  timezone: 'estimated from time zone',
};

/** Small grey note saying where a value came from. */
export const BasisNote = ({ basis }: { basis: string | null | undefined }) =>
  basis ? <span className="text-[11px] text-gray-400">{BASIS_LABEL[basis] ?? basis}</span> : null;

export function HubSpotButton({ url, label = 'HubSpot' }: { url: string | null | undefined; label?: string }) {
  const link = href(url);
  if (!link) {
    return <button type="button" className={btn.small} disabled title="No HubSpot link on file">{label} <ExternalLink className="h-3 w-3" /></button>;
  }
  return (
    <a className={btn.small} href={link} target="_blank" rel="noopener noreferrer" title="Open in HubSpot" onClick={(e) => e.stopPropagation()}>
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function ExtLink({ url, children }: { url: string | null | undefined; children?: ReactNode }) {
  const link = href(url);
  if (!link) return <span className="text-gray-400">Not on file</span>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all" onClick={(e) => e.stopPropagation()}>
      {children ?? url}
    </a>
  );
}

export function CopyButton({ text }: { text: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (isBlank(text)) return null;
  return (
    <button type="button" className={btn.ghost} onClick={async () => {
      try {
        await navigator.clipboard.writeText(String(text));
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      } catch {
        // clipboard blocked (insecure context): nothing to show
      }
    }}>
      {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
    </button>
  );
}

/** Slide-in panel (filters): closes on Esc or backdrop click. */
export function SidePanel({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/30 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl animate-fadeInLeft" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const info = errorInfo(error);
  if (!info) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span><strong>{info.message}</strong>{info.detail && <span> — {info.detail}</span>}</span>
    </div>
  );
}

export function WarnNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{children}</div>;
}

export function EmptyState({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-12 text-center">
      {icon && <div className="text-gray-300">{icon}</div>}
      <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
      {text && <p className="max-w-md text-sm text-gray-500">{text}</p>}
      {children}
    </Card>
  );
}

export function Section({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className} padding="md">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </Card>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const empty = children == null || children === '' || (typeof children === 'string' && isBlank(children));
  return (
    <div className="flex flex-col gap-0.5">
      <FieldLabel>{label}</FieldLabel>
      <span className={cn('text-sm', empty ? 'text-gray-400' : 'text-gray-800')}>{empty ? 'Not on file' : children}</span>
    </div>
  );
}

/** Shared pager footer for the 50-per-page tables. */
export function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
      <span>{((page - 1) * size + 1).toLocaleString()}–{Math.min(page * size, total).toLocaleString()} of {total.toLocaleString()}</span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          <button type="button" className={btn.small} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className={btn.small} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </span>
      )}
    </footer>
  );
}

export const th = 'px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap';
export const td = 'px-4 py-3 align-top';

export function SortHeader({ label, active, dir, numeric, onClick }: {
  label: string; active: boolean; dir: 1 | -1; numeric?: boolean; onClick: () => void;
}) {
  return (
    <th className={cn(th, numeric && 'text-right')} aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-blue-600" onClick={onClick}>
        {label}<span className="text-[10px]" aria-hidden="true">{active ? (dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
