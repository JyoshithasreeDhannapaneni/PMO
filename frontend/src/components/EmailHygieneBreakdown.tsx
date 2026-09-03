'use client';

import { useState } from 'react';

// Shared between the Email Hygiene page (reports/audit-dashboard) and the Manager
// Dashboard's Engineers-tab hygiene popup, so both surfaces show the identical
// sub-metric breakdown -- value, tip, and real proof examples -- instead of the
// Manager Dashboard re-deriving its own simplified summary from the raw fields.
export const EMAIL_BEST_WORST_CATEGORIES: { key: 'speed' | 'quality' | 'resolution' | 'tone'; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'quality', label: 'Quality' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'tone', label: 'Tone' },
];

// A single category's sub-metric cards -- value, progress bar, tip when weak, and up to
// 2 real proof examples backing that number.
function CategoryBreakdown({ label, items }: { label: string; items: any[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label} breakdown</div>
      <div className="space-y-1.5">
        {items.map((item: any, idx: number) => {
          const pct = item.maxSubScore > 0 ? Math.round((item.subScore / item.maxSubScore) * 100) : 100;
          const barColor = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-700">{item.label}</span>
                <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">{item.subScore}/{item.maxSubScore}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{item.value}</div>
              {item.maxSubScore > 0 && (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              )}
              {item.tip && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 mt-1.5">
                  {item.tip}
                </div>
              )}
              {item.examples?.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {item.examples.map((exm: any, exIdx: number) => (
                    <div key={exIdx} className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2 py-1">
                      <span className="font-medium text-gray-700">{exm.customer}</span>
                      {exm.when && <span className="text-gray-400"> · {exm.when}</span>}
                      <span className="text-gray-500"> — {exm.detail}</span>
                      {/* Score is weak (there's a tip) -- show the actual email body as proof, not just the subject/fact. */}
                      {item.tip && exm.body && (
                        <div className="mt-1 pl-2 border-l-2 border-gray-200 text-gray-500 italic line-clamp-3">
                          &ldquo;{exm.body}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "Why is my score X" -- every sub-metric behind a category, with the actual measured
// value, a concrete fix when it's not already strong, and up to 2 real examples backing
// that number. `category` scopes to just the one that was clicked (no tabs needed --
// there's only one to show); null shows all 4 behind a Speed/Quality/Resolution/Tone tab
// switcher instead of stacking all of them at once.
export function ScoreBreakdownPanel({
  breakdown,
  category,
}: {
  breakdown: any;
  category: 'speed' | 'quality' | 'resolution' | 'tone' | null;
}) {
  const withData = EMAIL_BEST_WORST_CATEGORIES.filter(({ key }) => (breakdown?.[key]?.length ?? 0) > 0);
  const [activeTab, setActiveTab] = useState<'speed' | 'quality' | 'resolution' | 'tone' | null>(null);

  if (!breakdown || withData.length === 0) return null;

  // Single-category mode (a specific score badge was clicked): no tabs, just that one.
  if (category) {
    const single = withData.find((c) => c.key === category);
    return single ? <div className="mb-3"><CategoryBreakdown label={single.label} items={breakdown[single.key]} /></div> : null;
  }

  const current = withData.find((c) => c.key === activeTab) ?? withData[0];

  return (
    <div className="mb-3">
      <div className="flex gap-1 border-b border-gray-200 mb-3">
        {withData.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors
              ${current.key === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <CategoryBreakdown label={current.label} items={breakdown[current.key]} />
    </div>
  );
}

// Best/worst real example per category -- the "show the evidence" summary shown via the
// "View" link (distinct from ScoreBreakdownPanel's per-sub-metric proof, which scopes to
// one clicked category and always shows at least one example per weak sub-metric).
export function EmailBestWorstPanel({ bestWorst }: { bestWorst: any }) {
  if (!bestWorst) return null;
  const categoriesWithData = EMAIL_BEST_WORST_CATEGORIES.filter(({ key }) => bestWorst[key]?.best || bestWorst[key]?.worst);
  if (categoriesWithData.length === 0) {
    return <p className="text-xs text-gray-400 py-2">No graded examples yet this week for this person.</p>;
  }

  return (
    <div className="space-y-3">
      {categoriesWithData.map(({ key, label }) => {
        const { best, worst } = bestWorst[key] ?? {};
        // Only one exchange this week -- best and worst trivially collapse to the same
        // example. Show it once as "Best" rather than a confusing identical pair.
        const sameExample = best && worst && best.replyText === worst.replyText && best.label === worst.label;
        return (
          <div key={key}>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {best && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Best · {best.label}</div>
                  <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{best.replyText}&rdquo;</div>
                </div>
              )}
              {worst && !sameExample && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Needs work · {worst.label}</div>
                  <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{worst.replyText}&rdquo;</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
