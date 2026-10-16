'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { ErrorNote, ExtLink, Pager, SortHeader, Spinner, Tag, td, th } from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useTrackerContacts } from '@/hooks/useProjects';
import { TRACKER_BASE, num } from '@/lib/accountTracker';
import type { ContactRow } from '@/types/accountTracker';

const PAGE = 50;
const COLS: { key: string; label: string; get: (r: ContactRow) => string }[] = [
  { key: 'name', label: 'Name', get: (r) => r.name?.toLowerCase() ?? '' },
  { key: 'title', label: 'Title', get: (r) => r.title?.toLowerCase() ?? '' },
  { key: 'company', label: 'Company', get: (r) => r.company?.toLowerCase() ?? '' },
  { key: 'email', label: 'Email', get: (r) => r.email?.toLowerCase() ?? '' },
];

/** Every contact on the viewed person's companies. Search and page live in the URL. */
export default function ContactsPage() {
  const ws = useContext(TrackerContext)!;
  const router = useRouter();
  const pathname = usePathname() ?? `${TRACKER_BASE}/contacts`;
  const params = useSearchParams() ?? new URLSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const { data, error, isLoading } = useTrackerContacts(ws.owner);

  const go = (next: URLSearchParams, replace = false) => {
    const url = `${pathname}${next.toString() ? `?${next}` : ''}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url);
  };

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.trim()) next.set('q', search.trim());
      else next.delete('q');
      next.delete('page');
      go(next, true);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    const list = (data ?? []).filter((r) => !s || [r.name, r.title, r.email, r.company].some((v) => v?.toLowerCase().includes(s)));
    if (!sort.key) return list;
    const col = COLS.find((c) => c.key === sort.key);
    if (!col) return list;
    return [...list].sort((a, b) => (col.get(a) < col.get(b) ? -1 : col.get(a) > col.get(b) ? 1 : 0) * sort.dir);
  }, [data, q, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const goPage = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set('page', String(p));
    else next.delete('page');
    go(next);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
        <Search className="h-4 w-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, title, email or company…" aria-label="Search contacts"
          className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0" />
      </label>

      <ErrorNote error={error} />
      {isLoading && !data ? <Spinner /> : data && (
        <>
          <div className="text-xs text-gray-500">{num(rows.length)} {rows.length === 1 ? 'contact' : 'contacts'}</div>
          {rows.length === 0 ? <Card className="p-10 text-center text-sm text-gray-400">No contacts match.</Card> : (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {COLS.map((c) => (
                        <SortHeader key={c.key} label={c.label} active={sort.key === c.key} dir={sort.dir}
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))} />
                      ))}
                      <th className={th}>Phone</th>
                      <th className={th}>LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shown.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className={td}><span className="font-semibold text-gray-900">{r.name ?? '—'}</span>{r.primary && <span className="ml-2"><Tag accent>Primary</Tag></span>}</td>
                        <td className={td}>{r.title ?? '—'}</td>
                        <td className={td}>
                          {r.companyId
                            ? <Link className="text-blue-600 hover:underline" href={`${TRACKER_BASE}/companies/${r.companyId}?tab=contacts`}>{r.company}</Link>
                            : (r.company ?? '—')}
                        </td>
                        <td className={td}>{r.email ? <a className="text-blue-600 hover:underline" href={`mailto:${r.email}`}>{r.email}</a> : '—'}</td>
                        <td className={`${td} whitespace-nowrap`}>{r.phone ? <a className="text-blue-600 hover:underline" href={`tel:${r.phone.replace(/\s+/g, '')}`}>{r.phone}</a> : '—'}</td>
                        <td className={td}>{r.linkedin ? <ExtLink url={r.linkedin}>Profile</ExtLink> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={current} pages={pages} total={rows.length} size={PAGE} onPage={goPage} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
