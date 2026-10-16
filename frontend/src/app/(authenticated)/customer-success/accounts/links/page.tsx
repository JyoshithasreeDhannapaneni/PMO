'use client';

import { useContext, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { ErrorNote, Section, Spinner, Tag, btn, td, th } from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useSetTrackerLink, useTrackerLinks, useTrackerOwners } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, relativeTime } from '@/lib/accountTracker';

/**
 * Admin: whose HubSpot book each PMO user sees. People are matched to HubSpot users by email automatically; link by
 * hand when the emails differ. Roles stay in PMO Settings — PMO admins can view everyone's book here.
 */
export default function HubSpotLinksPage() {
  const ws = useContext(TrackerContext)!;
  const router = useRouter();
  const users = useTrackerLinks();
  const owners = useTrackerOwners(ws.admin);
  const setLink = useSetTrackerLink();
  const [pending, setPending] = useState<Record<string, string | undefined>>({});
  const [q, setQ] = useState('');

  if (!ws.admin) {
    return (
      <Card className="p-10 text-center text-sm text-gray-500">
        Only admins can manage HubSpot links. <Link className="text-blue-600 hover:underline" href={TRACKER_BASE}>Back to companies</Link>
      </Card>
    );
  }

  const s = q.trim().toLowerCase();
  const list = (users.data ?? []).filter((u) => !s || `${u.name ?? ''} ${u.email} ${u.hubspotOwnerName ?? ''}`.toLowerCase().includes(s));
  const connected = ws.me.hubspotConfigured;

  return (
    <div className="space-y-4">
      <Section title="HubSpot connection">
        <div className="flex items-center gap-2 text-sm">
          {connected ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
          <span className="font-medium text-gray-800">{connected ? 'Connected' : 'Not connected'}</span>
          {connected && owners.data && <span className="text-gray-400">· {owners.data.length} HubSpot users</span>}
        </div>
        {!connected && <p className="mt-2 text-sm text-gray-500">Add the read-only Private App token to backend/.env (HUBSPOT_ACCESS_TOKEN=pat-…) and restart the backend.</p>}
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">People and their HubSpot user</h2>
        <label className="flex min-w-[16rem] items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0" />
        </label>
      </div>

      <ErrorNote error={setLink.error ?? users.error} />
      {users.isLoading && !users.data ? <Spinner /> : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr><th className={th}>Person</th><th className={th}>PMO role</th><th className={th}>HubSpot user (whose data they see)</th><th className={th}>Last sign-in</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((u) => {
                  const current = u.ownerLinkedManually ? u.hubspotOwnerId ?? '' : '';
                  const chosen = pending[u.id] ?? current;
                  const busy = setLink.isPending && setLink.variables?.userId === u.id;
                  return (
                    <tr key={u.id} className={cn(!u.active && 'opacity-60')}>
                      <td className={td}>
                        <div className="font-semibold text-gray-900">{u.name ?? u.email}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </td>
                      <td className={td}><Tag accent={u.role === 'ADMIN'}>{u.role.replace(/_/g, ' ').toLowerCase()}</Tag></td>
                      <td className={td}>
                        <div className="text-xs">
                          <span className="font-semibold text-gray-800">{u.hubspotOwnerName ?? 'Not linked'}</span>
                          {u.hubspotOwnerId && (
                            <button type="button" className="ml-2 font-medium text-blue-600 hover:underline"
                              onClick={() => { ws.changeView(u.hubspotOwnerId as string); router.push(TRACKER_BASE); }}>
                              View accounts
                            </button>
                          )}
                          <span className="text-gray-400"> · {u.ownerLinkedManually ? 'linked by admin' : u.hubspotOwnerId ? 'matched by email' : 'no HubSpot user with this email'}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <select className="max-w-xs rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                            value={chosen} disabled={busy || owners.isLoading}
                            onChange={(e) => setPending((p) => ({ ...p, [u.id]: e.target.value }))}>
                            <option value="">Match by email (automatic)</option>
                            {owners.data?.map((o) => <option key={o.id} value={o.id}>{o.name}{o.email ? ` — ${o.email}` : ''}</option>)}
                          </select>
                          {pending[u.id] !== undefined && pending[u.id] !== current && (
                            <>
                              <button type="button" className={btn.small} disabled={busy}
                                onClick={() => setLink.mutate({ userId: u.id, ownerId: pending[u.id] ?? '' }, {
                                  onSuccess: () => setPending((p) => ({ ...p, [u.id]: undefined })),
                                })}>
                                {busy ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" className={btn.ghost} onClick={() => setPending((p) => ({ ...p, [u.id]: undefined }))}>Cancel</button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs text-gray-500`}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
