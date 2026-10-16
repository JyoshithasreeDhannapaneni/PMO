'use client';

import { ReactNode, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Briefcase, Building2, Clock, Globe, Lightbulb, Mail, Phone, Users } from 'lucide-react';
import { ActivityFeed, LastCall } from '@/components/accountTracker/ActivityFeed';
import { DealTable } from '@/components/accountTracker/DealTable';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import {
  AiFooter, AiPending, AiTag, BasisNote, CopyButton, EmptyState, ErrorNote, ExtLink, Field, FieldLabel, HubSpotButton,
  ProbabilityBadge, Section, Spinner, Tag, btn, td, th,
} from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useTrackerCompany } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, errorInfo, href, money, num, utcOffsetLabel } from '@/lib/accountTracker';
import type { CompanyDetail, DealRow } from '@/types/accountTracker';

const TABS = [
  { key: '', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'deals', label: 'Deals' },
  { key: 'activity', label: 'Activity' },
  { key: 'engagement', label: 'Engagement & timing' },
  { key: 'outreach', label: 'Outreach' },
] as const;

/** What an AI section needs to explain why it is not ready yet. */
type AiState = { configured: boolean; pausedReason: string | null; running: boolean };

/** One company: header, key facts and tabbed sections (?tab=). */
export default function CompanyPage() {
  const ws = useContext(TrackerContext)!;
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.some((t) => t.key === params?.get('tab')) ? (params?.get('tab') as string) : '';
  const { data, error, isLoading } = useTrackerCompany(ws.owner, id);
  const base = `${TRACKER_BASE}/companies/${id}`;

  useEffect(() => {
    const prev = document.title;
    if (data?.company?.company) document.title = `${data.company.company} · Account Tracker`;
    return () => { document.title = prev; };
  }, [data]);

  if (isLoading && !data) return <Spinner />;
  if (error || !data) {
    return errorInfo(error)?.status === 404
      ? (
        <EmptyState icon={<Building2 className="h-10 w-10" />} title="Company not found" text="It may belong to someone else's accounts.">
          <Link href={TRACKER_BASE} className={btn.primary}>Back to companies</Link>
        </EmptyState>
      )
      : <ErrorNote error={error} />;
  }
  const c = data.company;
  const tabHref = (key: string) => (key ? `${base}?tab=${key}` : base);
  const aiState: AiState = { configured: data.ai.configured, pausedReason: ws.ai?.pausedReason ?? null, running: !!ws.ai?.running };

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-700" aria-hidden="true">
            {(c.company ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{c.company}</h2>
            <p className="text-sm text-gray-500">{[c.industry, data.location].filter(Boolean).join(' · ') || 'No industry or location on file'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.lifecycleStage && <Tag accent>{c.lifecycleStage}</Tag>}
              {c.tier && <Tag>{c.tier}</Tag>}
              {c.msp && <Tag accent>MSP</Tag>}
              {data.ai.analysis && <FitTag level={data.ai.analysis.cloudfuzeFit.level} />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.website && (
            <a className={btn.secondary} href={href(c.website) ?? undefined} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" /> Website</a>
          )}
          <HubSpotButton url={c.hubspotLink} label="Open in HubSpot" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Fact label="Employees" value={c.employees != null ? num(c.employees) : null} />
        <Fact label="Annual revenue" value={c.annualRevenue} />
        <Fact label="Open deals" value={c.openDeals != null ? String(c.openDeals) : null} to={tabHref('deals')} />
        <Fact label="Times reached out" value={c.timesReachedOut != null ? String(c.timesReachedOut) : null} to={tabHref('activity')} />
        <Fact label="Last contact" value={c.lastContactDate} sub={c.daysSinceLastContact != null ? `${c.daysSinceLastContact} days ago` : null} to={tabHref('activity')} />
        <Fact label="Primary contact" value={c.primaryContactName} sub={c.primaryContactTitle} to={tabHref('contacts')} />
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200" role="tablist" aria-label="Company sections">
        {TABS.map((t) => {
          const count = t.key === 'contacts' ? data.contacts.length : t.key === 'deals' ? data.deals.length : null;
          const on = tab === t.key;
          return (
            <Link key={t.key} href={tabHref(t.key)} replace scroll={false} role="tab" aria-selected={on}
              className={cn('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition',
                on ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700')}>
              {t.label}
              {count != null && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', on ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>{count}</span>
              )}
            </Link>
          );
        })}
      </div>

      {tab === '' && <Overview d={data} id={id} ai={aiState} activityHref={tabHref('activity')} dealsHref={tabHref('deals')} />}
      {tab === 'contacts' && <Contacts d={data} />}
      {tab === 'deals' && (data.deals.length === 0
        ? <EmptyState icon={<Briefcase className="h-10 w-10" />} title="No deals with this company" />
        : <DealTable rows={data.deals} compact />)}
      {tab === 'activity' && <ActivityFeed companyId={id} ownerId={c.ownerKey} summary={<ConversationSummary d={data} ai={aiState} />} />}
      {tab === 'engagement' && <Engagement d={data} ai={aiState} activityHref={tabHref('activity')} />}
      {tab === 'outreach' && <Outreach d={data} ai={aiState} />}
    </div>
  );
}

function Fact({ label, value, sub, to }: { label: string; value: string | null | undefined; sub?: string | null; to?: string }) {
  const empty = value == null || value === '';
  const body = (
    <>
      <FieldLabel>{label}</FieldLabel>
      <span className={cn('truncate text-lg font-bold', empty ? 'text-gray-300' : 'text-gray-900')}>{empty ? '—' : value}</span>
      {sub && <span className="truncate text-xs text-gray-400">{sub}</span>}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-0.5 rounded-xl border border-white bg-white/80 p-3 shadow-sm';
  return to
    ? <Link className={cn(cls, 'transition hover:border-blue-200 hover:bg-blue-50/50')} href={to} replace scroll={false}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

const FIT_CLASS: Record<string, string> = {
  High: 'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-gray-100 text-gray-500',
};

function FitTag({ level }: { level: string }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', FIT_CLASS[level] ?? FIT_CLASS.Low)}>{level} CloudFuze fit</span>;
}

function Bullets({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-sm text-gray-400">{empty}</p> : null;
  return <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{items.map((x) => <li key={x}>{x}</li>)}</ul>;
}

/* ---------- Overview ---------- */
function Overview({ d, id, ai, activityHref, dealsHref }: { d: CompanyDetail; id: string; ai: AiState; activityHref: string; dealsHref: string }) {
  const c = d.company;
  const a = d.ai.analysis;
  const mentioned = d.ai.engagement?.toolsMentioned ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <LastCall companyId={id} activityHref={activityHref} />
      <DealSnapshot deals={d.deals} dealsHref={dealsHref} />

      <Section title="Company profile" right={<AiTag />} className="lg:col-span-2">
        {!a ? <AiPending ai={ai} error={d.ai.error} what="this company" /> : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-gray-800">{a.overview}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-blue-50 p-3">
                <div className="flex items-center gap-2"><FieldLabel>CloudFuze fit</FieldLabel><FitTag level={a.cloudfuzeFit.level} /></div>
                <p className="mt-1 text-sm text-gray-700">{a.cloudfuzeFit.reason}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <FieldLabel>Managed service provider</FieldLabel>
                  <Tag accent={a.msp.isMsp}>{a.msp.isMsp ? 'Yes' : 'No'} · {a.msp.confidence} confidence</Tag>
                </div>
                <p className="mt-1 text-sm text-gray-700">{a.msp.reason}</p>
              </div>
            </div>
            {a.keyFacts.length > 0 && <div><FieldLabel>Key facts</FieldLabel><div className="mt-1"><Bullets items={a.keyFacts} /></div></div>}
            {!a.usedHomepage && (
              <p className="text-xs text-gray-400">
                {a.usedResearch
                  ? 'The company’s website could not be read (it blocks automated visitors or is offline), so this profile uses a web search and HubSpot data instead.'
                  : 'The company’s website could not be read (it blocks automated visitors or is offline), so this profile is based on HubSpot data only.'}
              </p>
            )}
            <AiFooter generatedAt={a.generatedAt} />
          </div>
        )}
      </Section>

      <Section title="Buying signals & opportunities" right={<AiTag />} className="lg:col-span-2">
        {!a ? <AiPending ai={ai} error={d.ai.error} what="buying signals" /> : (
          <div className="space-y-4">
            {a.buyingSignals.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {a.buyingSignals.map((s) => (
                  <div key={s.signal} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800">{s.signal}</div>
                      <div className="text-xs text-gray-500">{s.evidence}</div>
                    </div>
                    <ProbabilityBadge value={s.strength} />
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">No clear buying signals found yet.</p>}
            {a.opportunities.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {a.opportunities.map((o, i) => (
                  <div key={o.title} className="flex gap-3 rounded-xl bg-gray-50 p-3">
                    <span className="text-lg font-bold text-blue-200">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{o.title}</div>
                      <p className="text-xs text-gray-500">{o.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span><span className="font-semibold">How to position CloudFuze: </span>{a.angle}</span>
            </div>
          </div>
        )}
      </Section>

      <Section title="Tech stack" right={<AiTag />}>
        {!a ? <AiPending ai={ai} error={d.ai.error} what="the tech stack" /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FieldLabel>Productivity suite</FieldLabel>
              <Tag accent={a.techStack.productivitySuite !== 'Unknown'}>{a.techStack.productivitySuite}</Tag>
              <span className="text-[11px] text-gray-400">{a.techStack.confidence} confidence</span>
            </div>
            <div>
              <FieldLabel>Platforms in use</FieldLabel>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.techStack.tools.length ? a.techStack.tools.map((t) => <Tag key={t}>{t}</Tag>) : <span className="text-sm text-gray-400">None confirmed</span>}
              </div>
            </div>
            {mentioned.length > 0 && (
              <div>
                <FieldLabel>Mentioned in conversations</FieldLabel>
                <div className="mt-1 flex flex-wrap gap-1.5">{mentioned.map((t) => <Tag key={t} accent>{t}</Tag>)}</div>
              </div>
            )}
            <p className="text-xs text-gray-500">{a.techStack.evidence}</p>
          </div>
        )}
      </Section>

      <Section title="Past CloudFuze projects" right={<AiTag />}>
        {!a ? <AiPending ai={ai} error={d.ai.error} what="past projects" /> : a.pastProjects.length === 0
          ? <p className="text-sm text-gray-400">No finished CloudFuze projects with this company yet.</p>
          : <Bullets items={a.pastProjects} />}
      </Section>

      <Section title="About (HubSpot)" className="lg:col-span-2">
        {d.overview
          ? <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{d.overview}</p>
          : <p className="text-sm text-gray-500">No description in HubSpot. {c.domain && <>Learn more at <ExtLink url={c.domain}>{c.domain}</ExtLink>.</>}</p>}
      </Section>

      <Section title="Company details" className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Domain">{c.domain}</Field>
          <Field label="Website">{c.website && <ExtLink url={c.website} />}</Field>
          <Field label="LinkedIn">{c.linkedin && <ExtLink url={c.linkedin}>{c.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</ExtLink>}</Field>
          <Field label="Phone">{c.phone && <a className="text-blue-600 hover:underline" href={`tel:${c.phone.replace(/\s+/g, '')}`}>{c.phone}</a>}</Field>
          <Field label="Location">{d.location}</Field>
          <Field label="Industry group">{c.industryGroup}</Field>
          <Field label="Industry">{c.industry}</Field>
          <Field label="Founded">{c.foundedYear}</Field>
          <Field label="Size">{c.tier}</Field>
          <Field label="Lifecycle stage">{c.lifecycleStage}</Field>
          <Field label="Associated deals">{c.associatedDeals != null ? String(c.associatedDeals) : null}</Field>
          <Field label="Outreach stage">{c.outreachStage}</Field>
          <Field label="Reached out">{c.reachedOut}</Field>
          <Field label="Is MSP">
            {c.msp == null ? <span className="text-gray-400">Analysing…</span> : <span className="flex flex-col">{c.msp ? 'Yes' : 'No'}<BasisNote basis={c.mspBasis} /></span>}
          </Field>
          <Field label="Connect probability">
            {c.probability ? <span className="flex flex-col items-start gap-0.5"><ProbabilityBadge value={c.probability} /><BasisNote basis={c.connectBasis} /></span> : null}
          </Field>
          <Field label="Primary contact email">
            {c.primaryContactEmail && <a className="text-blue-600 hover:underline" href={`mailto:${c.primaryContactEmail}`}>{c.primaryContactEmail}</a>}
          </Field>
        </div>
      </Section>
    </div>
  );
}

function DealSnapshot({ deals, dealsHref }: { deals: DealRow[]; dealsHref: string }) {
  const total = (s: string) => deals.filter((x) => x.deal.status === s).reduce((a, x) => a + (x.deal.amount ?? 0), 0);
  const count = (s: string) => deals.filter((x) => x.deal.status === s).length;
  const currency = deals.find((x) => x.deal.currency)?.deal.currency;
  const open = deals.filter((x) => x.deal.status === 'OPEN').slice(0, 3);
  return (
    <Section title="Deals" right={deals.length > 0 ? <Link className="text-xs font-medium text-blue-600 hover:underline" href={dealsHref}>All deals</Link> : undefined}>
      {deals.length === 0 ? <p className="text-sm text-gray-500">No deals with this company.</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-green-50 p-3"><FieldLabel>Won</FieldLabel><div className="text-lg font-bold text-green-700">{money(total('WON'), currency)}</div><div className="text-xs text-gray-500">{count('WON')} deals</div></div>
            <div className="rounded-xl bg-blue-50 p-3"><FieldLabel>Open</FieldLabel><div className="text-lg font-bold text-blue-700">{money(total('OPEN'), currency)}</div><div className="text-xs text-gray-500">{count('OPEN')} deals</div></div>
            <div className="rounded-xl bg-gray-50 p-3"><FieldLabel>Lost</FieldLabel><div className="text-lg font-bold text-gray-600">{count('LOST')}</div><div className="text-xs text-gray-500">deals</div></div>
          </div>
          {open.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100">
              {open.map(({ deal: x }) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-gray-800">{x.name}</span>
                  <span className="text-xs text-gray-500">{x.stageLabel} · {money(x.amount, x.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

/* ---------- Contacts ---------- */
function Contacts({ d }: { d: CompanyDetail }) {
  if (d.contacts.length === 0) return <EmptyState icon={<Users className="h-10 w-10" />} title="No contacts on file" />;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr><th className={th}>Name</th><th className={th}>Title</th><th className={th}>Email</th><th className={th}>Phone</th><th className={th}>LinkedIn</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {d.contacts.map(({ contact: p, primary }) => (
              <tr key={p.id} className={primary ? 'bg-blue-50/40' : 'hover:bg-gray-50'}>
                <td className={td}><span className="font-semibold text-gray-900">{p.contactName ?? '—'}</span>{primary && <span className="ml-2"><Tag accent>Primary</Tag></span>}</td>
                <td className={td}>{p.title ?? '—'}</td>
                <td className={td}>{p.email ? <a className="text-blue-600 hover:underline" href={`mailto:${p.email}`}>{p.email}</a> : '—'}</td>
                <td className={`${td} whitespace-nowrap`}>{p.phone ? <a className="text-blue-600 hover:underline" href={`tel:${p.phone.replace(/\s+/g, '')}`}>{p.phone}</a> : '—'}</td>
                <td className={td}>{p.linkedin ? <ExtLink url={p.linkedin}>Profile</ExtLink> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Activity: AI conversation summary ---------- */
const SENTIMENT_CLASS: Record<string, string> = {
  Positive: 'bg-green-100 text-green-700',
  Neutral: 'bg-gray-100 text-gray-600',
  Negative: 'bg-red-100 text-red-700',
  Unknown: 'bg-gray-100 text-gray-500',
};

function ConversationSummary({ d, ai }: { d: CompanyDetail; ai: AiState }) {
  const e = d.ai.engagement;
  return (
    <Section title="Conversation summary" right={<AiTag />}>
      {!e ? <AiPending ai={ai} error={d.ai.error} what="the conversations" /> : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-gray-800">{e.summary}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-medium', SENTIMENT_CLASS[e.sentiment] ?? SENTIMENT_CLASS.Unknown)}>{e.sentiment} sentiment</span>
            <span className="text-gray-500">{e.sentimentReason}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><FieldLabel>Key points</FieldLabel><div className="mt-1"><Bullets items={e.keyPoints} empty="Nothing notable yet." /></div></div>
            <div><FieldLabel>Still open</FieldLabel><div className="mt-1"><Bullets items={e.openItems} empty="No open commitments." /></div></div>
          </div>
          <AiFooter generatedAt={e.generatedAt} />
        </div>
      )}
    </Section>
  );
}

/* ---------- Engagement & timing ---------- */
const HEALTH: Record<string, { bar: string; text: string }> = {
  Hot: { bar: 'bg-green-500', text: 'text-green-700' },
  Warm: { bar: 'bg-amber-400', text: 'text-amber-700' },
  Cold: { bar: 'bg-blue-300', text: 'text-blue-700' },
  Unknown: { bar: 'bg-gray-300', text: 'text-gray-500' },
};

function LiveClock({ offset }: { offset: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (offset == null) return <span className="text-gray-400">Not on file</span>;
  const local = new Date(now + offset * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return <span className="font-mono text-3xl font-bold tabular-nums text-gray-900">{p(local.getUTCHours())}:{p(local.getUTCMinutes())}:{p(local.getUTCSeconds())}</span>;
}

function Engagement({ d, ai, activityHref }: { d: CompanyDetail; ai: AiState; activityHref: string }) {
  const c = d.company;
  const h = d.health;
  const e = d.ai.engagement;
  const style = HEALTH[h.health] ?? HEALTH.Unknown;
  const chips: [string, number | null, string][] = [['Calls', c.callsCount, 'call'], ['Emails', c.emailsCount, 'email'], ['Meetings', c.meetingsCount, 'meeting'], ['Notes', c.notesCount, 'note']];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Next action" right={<AiTag />} className="lg:col-span-2">
        {!e ? <AiPending ai={ai} error={d.ai.error} what="the next step" /> : (
          <div className="space-y-3">
            <div className="rounded-xl bg-blue-50 p-4">
              <div className="text-base font-semibold text-blue-900">{e.nextAction.action}</div>
              <div className="mt-1 text-sm text-blue-800">{e.nextAction.reason}</div>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700"><Clock className="h-3.5 w-3.5" /> {e.nextAction.when}</div>
            </div>
            {e.risks.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3">
                <div className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-600" /><FieldLabel>Risks</FieldLabel></div>
                <div className="mt-1"><Bullets items={e.risks} /></div>
              </div>
            )}
            <AiFooter generatedAt={e.generatedAt} />
          </div>
        )}
      </Section>

      <Section title="Engagement">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col">
            <FieldLabel>Total activities</FieldLabel>
            <span className="text-3xl font-bold text-gray-900">{h.totalActivities ?? 0}</span>
          </div>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <FieldLabel>Relationship health</FieldLabel>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={cn('h-full rounded-full', style.bar)} style={{ width: `${h.healthScore}%` }} /></div>
            <span className={cn('text-sm font-medium', style.text)}>{h.healthLabel}</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {chips.map(([k, v, t]) => (
            <Link key={k} href={`${activityHref}&type=${t}`} replace scroll={false} className="flex flex-col rounded-xl bg-gray-50 p-3 transition hover:bg-blue-50">
              <FieldLabel>{k}</FieldLabel>
              <span className="text-lg font-bold text-gray-800">{v == null ? 'n/a' : v}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <FieldLabel>Connect probability</FieldLabel>
          <ProbabilityBadge value={c.probability} />
          <BasisNote basis={c.connectBasis} />
          {c.connectBasis === 'activity' && e?.connect.rate != null && (
            <span className="text-xs text-gray-500">
              {e.connect.attempts} outreach attempts · {e.connect.responses} replies, answered calls or meetings
              {e.connect.responses <= e.connect.attempts ? ` (${Math.round(e.connect.rate * 100)}%)` : ' (they respond more than we reach out)'}
            </span>
          )}
        </div>
      </Section>

      <Section title="Time zone & best time to call">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-xl bg-gray-50 p-4">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-gray-400" /><FieldLabel>Their local time</FieldLabel></span>
            <LiveClock offset={c.utcOffset} />
            <span className="text-xs text-gray-400">{utcOffsetLabel(c.utcOffset)}{c.timeZone ? ` · ${c.timeZone}` : ''}</span>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Best connect window (IST)">{c.bestConnectWindow}</Field>
            <Field label="Suggested call time (IST)">{c.suggestedCallTime}</Field>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ---------- Outreach ---------- */
function Outreach({ d, ai }: { d: CompanyDetail; ai: AiState }) {
  const e = d.ai.engagement;
  if (!e) {
    return <Section title="Suggested outreach" right={<AiTag />}><AiPending ai={ai} error={d.ai.error} what="the outreach plan" /></Section>;
  }
  const o = e.outreach;
  const email = `Subject: ${o.emailSubject}\n\n${o.emailBody}`;
  const call = `${o.callOpener}\n\n${o.talkingPoints.map((p) => `• ${p}`).join('\n')}`;
  const angle = d.ai.analysis?.angle;
  return (
    <div className="space-y-4">
      <Section title="Approach" right={<AiTag />}>
        <div className="flex flex-wrap items-center gap-2">
          <Tag accent>Best channel: {o.channel}</Tag>
          {d.company.bestConnectWindow && d.company.bestConnectWindow !== 'Unknown' && <Tag>Call window {d.company.bestConnectWindow}</Tag>}
        </div>
        <p className="mt-2 text-sm text-gray-800">{o.approach}</p>
        {angle && <p className="mt-2 text-sm text-gray-600"><span className="font-semibold">Positioning: </span>{angle}</p>}
      </Section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PitchCard icon={<Mail className="h-4 w-4 text-blue-600" />} title="Email" copy={email}>
          <div className="text-sm font-semibold text-gray-900">{o.emailSubject}</div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{o.emailBody}</p>
        </PitchCard>
        <PitchCard icon={<Phone className="h-4 w-4 text-green-600" />} title="Call" copy={call}>
          <p className="text-sm text-gray-800">{o.callOpener}</p>
          <div className="mt-3"><FieldLabel>Talking points</FieldLabel><div className="mt-1"><Bullets items={o.talkingPoints} /></div></div>
        </PitchCard>
      </div>
      <AiFooter generatedAt={e.generatedAt} />
    </div>
  );
}

function PitchCard({ icon, title, copy, children }: { icon: ReactNode; title: string; copy: string; children: ReactNode }) {
  return (
    <Section title={title} right={<span className="flex items-center gap-1">{icon}<CopyButton text={copy} /></span>}>
      {children}
    </Section>
  );
}
