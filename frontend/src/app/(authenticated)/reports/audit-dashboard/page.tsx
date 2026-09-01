'use client';

import { useState, useRef, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useProjects, useEmailHygiene, useCallHygiene, useCallTranscriptRating, useRateCallTranscript, useCallHygieneBestWorst, useCallHygieneOrgBestWorst, useCallHygieneWeeklyTrend, useEmailHygieneWeeklyTrend, usePmoHygieneWeeklyTrend } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Activity, Download, RefreshCw, Calendar, Users, User,
  Loader2, AlertCircle, Building2, FlaskConical,
  ChevronDown, ChevronUp, FolderKanban, CheckCircle,
  AlertTriangle, TrendingUp, Plus, Camera,
  Layers, FolderOpen, MessageSquare, Mail, Flag,
  UserX, ShieldCheck, FileSpreadsheet, X, Send, Clock, Phone,
} from 'lucide-react';
import { auditApi, emailHygieneApi, callHygieneApi, authApi } from '@/services/api';
import { SEGMENT_CONFIG } from '@/lib/segments';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toPng } from 'html-to-image';
import type { Project } from '@/types';

function ScorecardModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Best/worst-scored Q&A exchange across ALL of this person's graded calls, not just the
// one meeting being looked at. A separate component (not inline in the table's .map())
// because it needs its own hook call, which React's rules of hooks don't allow inside a
// loop — this only fires the query once its row is actually expanded (enabled={enabled}).
function CallBestWorstPanel({ userEmail, enabled }: { userEmail: string; enabled: boolean }) {
  const { data, isLoading } = useCallHygieneBestWorst(userEmail, enabled);
  if (!enabled) return null;
  if (isLoading) {
    return (
      <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mb-2">
        <Loader2 size={11} className="animate-spin" /> Loading best/worst across all their calls…
      </div>
    );
  }
  const result = data?.data as { best: any; worst: any } | undefined;
  if (!result || (!result.best && !result.worst)) return null;
  const { best, worst } = result;
  const sameExchange = best && worst && best.eventId === worst.eventId && best.question === worst.question && best.answer === worst.answer;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {best && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-2.5">
          <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Best answer overall · {best.score}/100</div>
          <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{best.answer}&rdquo;</div>
          <div className="text-[10px] text-gray-400 mt-1 truncate">
            {best.subject}{best.meetingStart ? ` · ${new Date(best.meetingStart).toLocaleDateString()}` : ''}
          </div>
        </div>
      )}
      {worst && !sameExchange && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-2.5">
          <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Needs work overall · {worst.score}/100</div>
          <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{worst.answer}&rdquo;</div>
          <div className="text-[10px] text-gray-400 mt-1 truncate">
            {worst.subject}{worst.meetingStart ? ` · ${new Date(worst.meetingStart).toLocaleDateString()}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared "week 1/2/3/4 of this month" trend chart for PMO/Email/Call Hygiene. `weeks` is
// whatever the backend's getWeeklyTrend()-style endpoint returns (finalized weeks for this
// IST calendar month, ascending, plus the current in-progress week last with isCurrent:
// true) — this component only cares about a per-week label and a single 0-100 average
// score, computed by the caller via `scoreFn` since each system's row shape differs.
function WeeklyTrendChart({
  weeks, scoreFn, color = '#4f46e5',
}: {
  weeks: Array<{ weekStart: string; weekEnd: string; isCurrent: boolean; metrics: any[] }>;
  scoreFn: (metrics: any[]) => number | null;
  color?: string;
}) {
  if (!weeks || weeks.length === 0) {
    return <p className="text-xs text-gray-400 py-6 text-center">No weekly data yet — the first snapshot lands after this Monday's 7AM IST finalize.</p>;
  }

  const chartData = weeks.map((w, i) => {
    const score = scoreFn(w.metrics);
    return {
      label: `Wk ${i + 1}`,
      sub: new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: score ?? 0,
      hasData: score !== null,
      isCurrent: w.isCurrent,
    };
  });

  const completed = chartData.filter(d => !d.isCurrent && d.hasData);
  const lastTwo = completed.slice(-2);
  const delta = lastTwo.length === 2 ? Math.round((lastTwo[1].value - lastTwo[0].value) * 10) / 10 : null;

  return (
    <div>
      {delta !== null && (
        <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${
          delta > 0 ? 'bg-green-50 text-green-700' : delta < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {delta > 0 ? <ChevronUp size={12} /> : delta < 0 ? <ChevronDown size={12} /> : null}
          {delta === 0 ? 'No change' : `${Math.abs(delta)} pts`} vs. the week before last week
        </div>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            formatter={(value: any, _name: any, item: any) => [item.payload.hasData ? value : 'No data yet', item.payload.isCurrent ? 'This week so far' : 'Score']}
            labelFormatter={(label: any, items: any) => items?.[0]?.payload ? `${label} · ${items[0].payload.sub}` : label}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.isCurrent ? '#c7d2fe' : color} fillOpacity={entry.hasData || entry.isCurrent ? 1 : 0.15} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} /> Finalized week</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-indigo-200" /> This week (live, so far)</span>
      </div>
    </div>
  );
}

// Best/worst real example per category (Speed/Quality/Resolution/Tone), mirroring
// CallBestWorstPanel's green/best-red/worst card style above -- but for 4 categories
// instead of Call Hygiene's single metric. Unlike Call Hygiene, this data already comes
// bundled in the email hygiene sync response (m.bestWorst), so no separate query/hook.
const EMAIL_BEST_WORST_CATEGORIES: { key: 'speed' | 'quality' | 'resolution' | 'tone'; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'quality', label: 'Quality' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'tone', label: 'Tone' },
];

function EmailBestWorstPanel({ bestWorst }: { bestWorst: any }) {
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';


function authFetch(url: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then((r) => r.json());
}

function downloadCSV(rows: any[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

const ROLE_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string; icon: any }> = {
  PROJECT_MANAGER: {
    label: 'Project Managers',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: Users,
  },
  ACCOUNT_MANAGER: {
    label: 'Account Managers',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    icon: Building2,
  },
  PRE_SALES: {
    label: 'Pre-Sales',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: FlaskConical,
  },
};

type Mode = 'weekly' | 'monthly';
type SortKey = 'name' | 'totalProjects' | 'activeProjects' | 'completedProjects' | 'delayedProjects' | 'addedInPeriod' | 'closedInPeriod';

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

function downloadHygieneTableImage(
  title: string,
  col1: string,
  col2: string,
  rows: { name: string; score: number; teamScore?: number | null; userEmail?: string }[],
  filename: string,
  col3?: string,
  weeklyTrend?: {
    weeks: Array<{ weekStart: string; isCurrent: boolean; metrics: any[] }>;
    // Per-row (per-manager) score lookup for these weeks -- e.g. matching a row's
    // userEmail against that week's stored metrics array. Powers both the inline
    // per-row sparkline column AND the single combined line chart below the table
    // (one line per manager, all on the same axes). A row with no resolvable score in
    // any week is simply left out of both rather than shown as an empty line/sparkline.
    perRowScoreFn: (weekMetrics: any[], row: { name: string; userEmail?: string }) => number | null;
  },
) {
  const BRAND   = '#4B0BC4';
  const WHITE   = '#FFFFFF';
  const ROW_DIV = 'rgba(75,11,196,0.15)';
  const PAD     = 18;
  const TITLE_H = 58;
  const HEAD_H  = 40;
  const TREND_TITLE_H = 34;
  const TREND_PLOT_H = 226; // the bar-plotting area itself, excluding the legend below it
  const LEGEND_COLS = 3;
  const LEGEND_ROW_H = 20;

  const hasTeam = !!col3;
  const W_BASE  = hasTeam ? 620 : 540;
  const COL1_X  = hasTeam ? 270 : 340;   // end of name column
  const COL2_X  = hasTeam ? 445 : W_BASE; // end of personal score column (=W_BASE for 2-col)
  const COL3_X  = W_BASE;                 // end of team-wise score column (only meaningful when hasTeam)

  // One weekly series per row, kept in the SAME order as `rows` (not filtered) so it can
  // be looked up by index -- a row with no resolvable score in a given week just leaves a
  // gap there in the combined chart below, rather than being dropped entirely or drawn as
  // a misleading zero. (There's no more per-row inline sparkline column -- this data now
  // only feeds the single combined "Weekly Trend — By Manager" chart under the table.)
  const weeks = weeklyTrend?.weeks ?? [];
  const perRowTrend = weeklyTrend
    ? rows.map((row) => weeks.map((w) => {
        const value = weeklyTrend.perRowScoreFn(w.metrics, row);
        return { value: value ?? 0, hasData: value !== null, isCurrent: w.isCurrent };
      }))
    : null;
  const hasWeeklyData = !!perRowTrend && perRowTrend.some((series) => series.some((w) => w.hasData));

  // Managers with at least one real data point -- these get a cluster of bars + a legend
  // entry in the combined chart. Kept alongside their row so the legend can show current score too.
  const lineChartSeries = (hasWeeklyData && perRowTrend)
    ? rows.map((row, idx) => ({ row, series: perRowTrend[idx] })).filter(({ series }) => series.some((w) => w.hasData))
    : [];
  const legendRows = lineChartSeries.length > 0 ? Math.ceil(weeks.length / LEGEND_COLS) : 0;
  const TREND_CHART_H = TREND_PLOT_H + (legendRows > 0 ? 14 + legendRows * LEGEND_ROW_H : 0);

  const W = W_BASE;
  const ROW_H = 38;

  const totalH  = TITLE_H + HEAD_H + rows.length * ROW_H
    + (lineChartSeries.length > 0 ? TREND_TITLE_H + TREND_CHART_H : 0);

  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;
  canvas.height = totalH * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Bar with rounded top corners only (flat bottom) -- matches the softer, rounded-bar
  // look of the on-page Recharts trend charts instead of harsh rectangular canvas bars.
  function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  // White base
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, totalH);

  // ── Title band ──────────────────────────────────────────────────
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, TITLE_H);
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 18px Calibri, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, W / 2, TITLE_H / 2, W - PAD * 2);

  // ── Sub-heading band ────────────────────────────────────────────
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, TITLE_H, W, HEAD_H);
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 14px Calibri, Arial, sans-serif';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillText(col1, PAD, TITLE_H + HEAD_H / 2, COL1_X - PAD - 12);

  ctx.textAlign = 'center';
  ctx.fillText(col2, COL1_X + (COL2_X - COL1_X) / 2, TITLE_H + HEAD_H / 2, COL2_X - COL1_X - PAD);

  if (hasTeam && col3) {
    ctx.fillText(col3, COL2_X + (COL3_X - COL2_X) / 2, TITLE_H + HEAD_H / 2, COL3_X - COL2_X - PAD);
  }

  // White dividers in sub-heading
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(COL1_X, TITLE_H + 8);
  ctx.lineTo(COL1_X, TITLE_H + HEAD_H - 8);
  ctx.stroke();
  if (hasTeam) {
    ctx.beginPath();
    ctx.moveTo(COL2_X, TITLE_H + 8);
    ctx.lineTo(COL2_X, TITLE_H + HEAD_H - 8);
    ctx.stroke();
  }

  // ── Data rows ────────────────────────────────────────────────────
  const dataY = TITLE_H + HEAD_H;
  rows.forEach((row, i) => {
    const y = dataY + i * ROW_H;

    // Name
    ctx.fillStyle = '#111827';
    ctx.font = '14px Calibri, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.name, PAD, y + ROW_H / 2, COL1_X - PAD - 12);

    // Personal hygiene score
    const sc = row.score >= 80 ? '#15803D' : row.score >= 60 ? '#B45309' : '#B91C1C';
    ctx.fillStyle = sc;
    ctx.font = 'bold 15px Calibri, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(row.score), COL1_X + (COL2_X - COL1_X) / 2, y + ROW_H / 2);

    // Team hygiene score
    if (hasTeam) {
      const ts = row.teamScore;
      if (ts != null) {
        const tc = ts >= 80 ? '#15803D' : ts >= 60 ? '#B45309' : '#B91C1C';
        ctx.fillStyle = tc;
        ctx.font = 'bold 15px Calibri, Arial, sans-serif';
        ctx.fillText(String(Math.round(ts)), COL2_X + (COL3_X - COL2_X) / 2, y + ROW_H / 2);
      } else {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '14px Calibri, Arial, sans-serif';
        ctx.fillText('—', COL2_X + (COL3_X - COL2_X) / 2, y + ROW_H / 2);
      }
    }

    // Horizontal row divider (skip last row)
    if (i < rows.length - 1) {
      ctx.strokeStyle = ROW_DIV;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(2, y + ROW_H);
      ctx.lineTo(W - 2, y + ROW_H);
      ctx.stroke();
    }
  });

  // ── Column dividers through data area ────────────────────────────
  ctx.strokeStyle = ROW_DIV;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(COL1_X, dataY);
  ctx.lineTo(COL1_X, dataY + rows.length * ROW_H);
  ctx.stroke();
  if (hasTeam) {
    ctx.beginPath();
    ctx.moveTo(COL2_X, dataY);
    ctx.lineTo(COL2_X, dataY + rows.length * ROW_H);
    ctx.stroke();
  }

  // ── Weekly trend, per manager, all in one combined chart ──────────────────────────
  // Grouped by MANAGER on the X axis (not by week) -- each manager gets its own small
  // cluster of bars showing that manager's week-over-week trend, side by side with
  // every other manager's cluster, so a single glance compares both "how did this
  // person trend" and "how do people compare" without needing separate charts.
  // CloudFuze's brand purple (#4B0BC4, used as BRAND above) fanned into a ramp -- lightest
  // for the oldest week, deepening toward the brand color itself for the most recent
  // finalized week, so the chart reads as CloudFuze's own palette instead of a generic
  // rainbow. The in-progress "so far" week is still overridden to the lighter indicator
  // color below, matching the sparkline/legend convention used elsewhere on this page.
  const WEEK_COLORS = [
    '#D8CCF5', '#B79AEB', '#9568E0', '#7C3AED', '#5A17CE', '#4B0BC4', '#3A0899', '#2C0673',
  ];
  const weekColor = (weekIdx: number, isCurrent: boolean) =>
    isCurrent ? '#C7D2FE' : WEEK_COLORS[weekIdx % WEEK_COLORS.length];

  if (lineChartSeries.length > 0) {
    const trendY = TITLE_H + HEAD_H + rows.length * ROW_H;

    ctx.fillStyle = BRAND;
    ctx.fillRect(0, trendY, W, TREND_TITLE_H);
    ctx.fillStyle = WHITE;
    ctx.font = 'bold 13px Calibri, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Weekly Trend — By Manager', PAD, trendY + TREND_TITLE_H / 2);

    const plotLeft = PAD + 26; // room for the 0/25/50/75/100 axis labels
    const plotRight = W - PAD;
    const plotTop = trendY + TREND_TITLE_H + 14;
    const plotBottom = plotTop + TREND_PLOT_H - 90; // leaves room for the angled manager-name labels underneath
    const plotHeight = plotBottom - plotTop;
    const n = weeks.length;
    const managerCount = lineChartSeries.length;
    const groupW = (plotRight - plotLeft) / managerCount;
    // Visible whitespace between one manager's cluster of bars and the next -- the cluster
    // is centered within its group slot, so this gap is split evenly on both sides.
    const GROUP_GAP = Math.min(18, groupW * 0.25);
    const clusterW = groupW - GROUP_GAP;
    const barSlot = clusterW / n;
    const barW = Math.max(2, Math.min(14, barSlot * 0.8));

    // Y gridlines at 0/25/50/75/100, with labels
    ctx.font = '9px Calibri, Arial, sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 25, 50, 75, 100].forEach((v) => {
      const y = plotBottom - (v / 100) * plotHeight;
      ctx.strokeStyle = 'rgba(75,11,196,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.fillText(String(v), plotLeft - 8, y);
    });

    // Manager-name labels, angled under each manager's cluster of bars so names don't
    // collide even with a dozen-plus managers on the axis.
    ctx.font = '10px Calibri, Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    lineChartSeries.forEach(({ row }, idx) => {
      const groupCenterX = plotLeft + groupW * idx + groupW / 2;
      ctx.save();
      ctx.translate(groupCenterX, plotBottom + 8);
      ctx.rotate(-Math.PI / 4.2);
      ctx.fillText(row.name, 0, 0);
      ctx.restore();
    });

    // Faint separators between each manager's cluster of bars
    ctx.strokeStyle = ROW_DIV;
    ctx.lineWidth = 0.75;
    for (let i = 1; i < managerCount; i++) {
      const x = plotLeft + groupW * i;
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }

    // One small bar per week, clustered by manager -- a manager with no score that week
    // gets a faint sliver instead of a bar drawn to zero, so "no data" reads differently
    // from "actually scored zero."
    lineChartSeries.forEach(({ series }, idx) => {
      const clusterX = plotLeft + groupW * idx + GROUP_GAP / 2;
      series.forEach((wk, weekIdx) => {
        const barX = clusterX + weekIdx * barSlot + (barSlot - barW) / 2;
        const barH = Math.max(2, (wk.value / 100) * plotHeight);
        const barY = plotBottom - barH;

        ctx.globalAlpha = wk.hasData || wk.isCurrent ? 1 : 0.12;
        ctx.fillStyle = weekColor(weekIdx, wk.isCurrent);
        roundedTopBar(barX, barY, barW, barH, Math.min(2, barW / 3));
        ctx.globalAlpha = 1;
      });
    });

    // Legend -- one entry per week (not per manager), since color now encodes the week.
    const legendTop = plotBottom + 100;
    const legendColW = (W - PAD * 2) / LEGEND_COLS;
    ctx.font = '11px Calibri, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    weeks.forEach((w, i) => {
      const col = i % LEGEND_COLS;
      const legendRow = Math.floor(i / LEGEND_COLS);
      const x = PAD + col * legendColW;
      const y = legendTop + legendRow * LEGEND_ROW_H + LEGEND_ROW_H / 2;
      ctx.fillStyle = weekColor(i, w.isCurrent);
      ctx.beginPath();
      ctx.arc(x + 4, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.fillText(w.isCurrent ? `Wk ${i + 1} (so far)` : `Wk ${i + 1}`, x + 13, y, legendColW - 18);
    });
  }

  // ── Outer border ─────────────────────────────────────────────────
  ctx.strokeStyle = BRAND;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, totalH - 2);

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
function weekStart() { return format(subDays(new Date(), 7), 'yyyy-MM-dd'); }
function lastWeekStart() { return format(subDays(new Date(), 14), 'yyyy-MM-dd'); }
function lastWeekEnd() { return format(subDays(new Date(), 8), 'yyyy-MM-dd'); }
function monthStart(offset = 0) { return format(startOfMonth(subMonths(new Date(), offset)), 'yyyy-MM-dd'); }
function monthEnd(offset = 0) { return format(endOfMonth(subMonths(new Date(), offset)), 'yyyy-MM-dd'); }

export default function AuditDashboardPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  // Quality (backend/src/services/callHygieneService.ts) is HR-adjacent content — ADMIN
  // sees everyone, PROJECT_MANAGER sees only their own row (enforced server-side too;
  // this just decides whether to call the endpoint at all and what to show if not).
  const canSeeCallHygiene = isAdmin || currentUser?.role === 'PROJECT_MANAGER';

  const [mode, setMode] = useState<Mode>('weekly');
  const [draftStart, setDraftStart] = useState(weekStart);
  const [draftEnd, setDraftEnd] = useState(todayStr);
  const [queryStart, setQueryStart] = useState(weekStart);
  const [queryEnd, setQueryEnd] = useState(todayStr);

  const [expandedRole, setExpandedRole] = useState<string | null>('PROJECT_MANAGER');
  const [sortKey, setSortKey] = useState<SortKey>('totalProjects');
  const [sortAsc, setSortAsc] = useState(false);
  const [snapshotTab, setSnapshotTab] = useState<'snapshot' | 'delay' | 'final'>('snapshot');
  const [hygieneTab, setHygieneTab] = useState<'project' | 'email' | 'call'>('project');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['auditUserProjectSummary', queryStart, queryEnd],
    queryFn: () =>
      authFetch(`${API_BASE}/api/audit/user-project-summary?startDate=${queryStart}&endDate=${queryEnd}`),
  });

  const summary = data?.data;

  const INACTIVITY_DAYS = 60;
  const inactivityStart = format(subDays(new Date(), INACTIVITY_DAYS), 'yyyy-MM-dd');
  const inactivityEnd = todayStr();
  const { data: activityData, isLoading: isActivityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ['auditActivitySummary', inactivityStart, inactivityEnd],
    queryFn: () =>
      authFetch(`${API_BASE}/api/audit/activity-summary?startDate=${inactivityStart}&endDate=${inactivityEnd}`),
  });

  const inactiveUsers = useMemo(() => {
    const users = activityData?.data?.users ?? [];
    return users
      .filter((u: any) => u.totalActions === 0)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [activityData]);

  function handleExportInactive() {
    if (!inactiveUsers.length) return;
    const rows = [
      ['Name', 'Email', 'Role', 'Last Active'],
      ...inactiveUsers.map((u: any) => [u.name, u.email, u.role, u.lastActive ? format(new Date(u.lastActive), 'yyyy-MM-dd') : 'Never']),
    ];
    downloadCSV(rows, `inactive-users-${inactivityStart}-to-${inactivityEnd}.csv`);
  }

  // ── Hygiene Board ──────────────────────────────────────────────
  // Computed live from audit_logs + projects on every request (no server-side
  // cache) — refetchInterval keeps the on-screen numbers current automatically
  // while this tab is open, not just on manual refresh/navigation. Activity
  // Score and Case Study Score are scoped to queryStart/queryEnd (the page's
  // shared date range); Data Quality, Delay, and Date-Integrity always reflect
  // current project state regardless of the selected range.
  const { data: hygieneData, isLoading: isHygieneLoading, refetch: refetchHygiene } = useQuery({
    queryKey: ['hygieneBoard', queryStart, queryEnd],
    queryFn: () => auditApi.getHygieneBoard({ startDate: queryStart, endDate: queryEnd }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const hygieneBoard: any[] = hygieneData?.data ?? [];

  // ── Email Hygiene ───────────────────────────────────────────────
  const {
    data: emailHygieneData,
    isLoading: isEmailHygieneLoading,
    refetch: refetchEmailHygiene,
    isFetching: isEmailHygieneFetching,
  } = useEmailHygiene(hygieneTab === 'email');

  const emailHygieneResult = emailHygieneData?.data ?? {};
  const emailMetrics: any[] = emailHygieneResult.metrics ?? [];
  const emailTeamHygiene: any[] = emailHygieneResult.teamHygiene ?? [];
  type SegmentHeadInfo = { email: string; name: string; score: number | null; teamIds: string[] };
  const emailSegmentHeads: { ENT?: SegmentHeadInfo; SMB?: SegmentHeadInfo } = emailHygieneResult.segmentHeads ?? {};
  const emailHygieneConfigured: boolean = emailHygieneResult.isConfigured ?? false;
  const emailHygieneAuthError: string | undefined = emailHygieneResult.authError;
  const emailHygienePeriodStart: string = emailHygieneResult.periodStart ?? '';
  const emailHygienePeriodEnd: string = emailHygieneResult.periodEnd ?? '';
  const emailHygieneComputedAt: string = emailHygieneResult.computedAt ?? '';
  const [emailHygieneView, setEmailHygieneView] = useState<'everyone' | 'managers'>('everyone');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  function emailScoreColor(score: number) {
    if (score >= 80) return { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' };
    if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300' };
    return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' };
  }

  function fmtHours(h: number | null | undefined): string {
    if (h == null || isNaN(h)) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }

  function handleExportEmailHygieneCSV() {
    if (!emailMetrics.length) return;
    const rows = [
      ['Team Member', 'Email', 'Threads', 'Speed /30', 'Quality /30', 'Resolution /20', 'Tone /20', 'Hygiene /100'],
      ...emailMetrics.map((m: any) => [
        m.userName, m.userEmail, m.uniqueCustomerThreads,
        m.speedScore ?? 0, m.qualityScore ?? 0, m.resolutionScore ?? 0, m.toneScore ?? 0, m.emailHygieneScore ?? 0,
      ]),
    ];
    downloadCSV(rows, `email-hygiene-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  function handleExportTeamHygieneCSV() {
    if (!emailTeamHygiene.length) return;
    const rows = [
      ['Level', 'Segment', 'Manager', 'Manager Email', 'Hygiene /100', 'Basis'],
      ...(['ENT', 'SMB'] as const).map(seg => {
        const head = emailSegmentHeads[seg];
        return ['Segment', seg, head?.name ?? '', head?.email ?? '', head?.score ?? '', `avg of ${head?.teamIds?.join(', ') ?? ''}`];
      }),
      ...emailTeamHygiene.map((t: any) => [
        'Team', t.segment, t.managerName, t.managerEmail,
        t.teamScore ?? '', `${t.scoredMemberCount}/${t.memberCount} members scored`,
      ]),
    ];
    downloadCSV(rows, `team-email-hygiene-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  async function handleExportEmailHygieneExcel() {
    try {
      const blob = await emailHygieneApi.exportExcel();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `email-hygiene-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
    } catch {}
  }

  async function handleForceRefreshEmailHygiene() {
    if (isSyncingOutlook) return;
    setIsSyncingOutlook(true);
    setSyncOutlookStatus('idle');
    setSyncOutlookError('');
    try {
      // Fire background sync — returns 202 immediately (no timeout risk)
      const res = await emailHygieneApi.triggerSync();
      if (!res.success) throw new Error('Sync trigger failed');

      // Poll /sync-status every 4 seconds until running=false
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const status = await emailHygieneApi.getSyncStatus();
            if (!status.data.running) {
              clearInterval(interval);
              if (status.data.error) reject(new Error(status.data.error));
              else resolve();
            }
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, 4000);
      });

      await refetchEmailHygiene();
      setSyncOutlookStatus('success');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Sync failed — check Graph API configuration';
      setSyncOutlookError(msg);
      setSyncOutlookStatus('error');
    } finally {
      setIsSyncingOutlook(false);
      setTimeout(() => setSyncOutlookStatus('idle'), 5000);
    }
  }

  // ── Call Hygiene ────────────────────────────────────────────────
  const {
    data: callHygieneData,
    isLoading: isCallHygieneLoading,
    refetch: refetchCallHygiene,
    isFetching: isCallHygieneFetching,
  } = useCallHygiene(hygieneTab === 'call' && canSeeCallHygiene);

  const callHygieneResult = callHygieneData?.data ?? {};
  const callMetrics: any[] = callHygieneResult.metrics ?? [];
  const callHygieneConfigured: boolean = callHygieneResult.isConfigured ?? false;
  const callHygieneAuthError: string | undefined = callHygieneResult.authError;
  const callHygienePeriodStart: string = callHygieneResult.periodStart ?? '';
  const callHygienePeriodEnd: string = callHygieneResult.periodEnd ?? '';
  const callHygieneComputedAt: string = callHygieneResult.computedAt ?? '';

  const { data: orgBestWorstData } = useCallHygieneOrgBestWorst(
    hygieneTab === 'call' && canSeeCallHygiene && isAdmin
  );
  const orgBestWorst = orgBestWorstData?.data as { best: any; worst: any } | undefined;

  // score is null when a person has no gradable calls yet (no signal, not a bad score) —
  // rendered as a distinct neutral state, never folded into the red "bad score" bucket.
  function callScoreColor(score: number | null) {
    if (score === null) return { bg: 'bg-gray-100', text: 'text-gray-500', ring: 'ring-gray-300' };
    if (score >= 80) return { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' };
    if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300' };
    return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' };
  }

  const [expandedCallUser, setExpandedCallUser] = useState<string | null>(null);
  const [expandedEmailBestWorstUser, setExpandedEmailBestWorstUser] = useState<string | null>(null);
  const [expandedHygienePM, setExpandedHygienePM] = useState<string | null>(null);
  const [ratingModalCall, setRatingModalCall] = useState<{
    eventId: string;
    subject: string;
    meetingStart: string | null;
    organizerEmail: string;
    joinUrl: string;
    internalUserEmail: string;
    internalUserName: string;
    customerAttendees: Array<{ name: string; email: string }>;
  } | null>(null);

  const { data: cachedCallRatingResp, isLoading: isCachedCallRatingLoading } = useCallTranscriptRating(
    ratingModalCall?.eventId ?? null,
    ratingModalCall?.internalUserEmail ?? null
  );
  const rateCallMutation = useRateCallTranscript();
  const cachedCallRating = cachedCallRatingResp?.data?.rating ?? null;
  const activeCallRating = rateCallMutation.data?.data ?? cachedCallRating;

  function closeRatingModal() {
    setRatingModalCall(null);
    rateCallMutation.reset();
  }

  function handleExportCallHygieneCSV() {
    if (!callMetrics.length) return;
    const rows = [
      ['Team Member', 'Email', 'Customer Calls (this week)', 'PM-Scheduled', 'Customer-Scheduled', 'Unique Customers', 'Calls / Week', 'Days Since Last Call', 'Cancelled Calls', 'Declined/No-Response', 'Cancelled Rate (%)', 'Online Meeting Rate (%)', 'Hygiene /100', 'Graded', 'No Q&A', 'Excluded', 'Pending', 'Total Gradable'],
      ...callMetrics.map((m: any) => [
        m.userName, m.userEmail, m.totalCustomerCalls, m.internallyScheduled ?? 0, m.externallyScheduled ?? 0, m.uniqueCustomers, m.callsPerWeek,
        m.daysSinceLastCustomerCall ?? 'N/A', m.cancelledCalls, m.declinedCalls ?? 0, m.cancelledRate, m.onlineMeetingRate,
        m.qualityScore ?? 'N/A', m.qualityCoverage?.graded ?? 0, m.qualityCoverage?.noQuestion ?? 0, m.qualityCoverage?.excluded ?? 0, m.qualityCoverage?.pending ?? 0, m.qualityCoverage?.total ?? 0,
      ]),
    ];
    downloadCSV(rows, `call-hygiene-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  async function handleExportCallHygieneExcel() {
    try {
      const blob = await callHygieneApi.exportExcel();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `call-hygiene-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
    } catch {}
  }

  async function handleForceRefreshCallHygiene() {
    try {
      await callHygieneApi.getMetrics(true);
      refetchCallHygiene();
    } catch {}
  }

  function hygieneScoreColor(score: number) {
    if (score >= 80) return { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' };
    if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300' };
    return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' };
  }

  function handleExportHygieneCSV() {
    if (!hygieneBoard.length) return;
    const rows = [
      [
        'Project Manager', 'Total Projects', 'Active / On-Hold', 'Completed / Archived',
        'Logins (period)', 'Project Updates (period)', 'Case Study Updates (period)',
        'Last Login', 'Last Action', 'Days Since Last Action',
        'Missing Kickoff Date', 'Missing Planned Dates', 'Missing Customer Email', 'Missing Notes',
        'Overdue (Not Flagged)', 'Missing Project Size', 'Missing Budget',
        'Case Studies Done', 'Case Studies Pending', 'No Case Study', 'In Grace Period (excluded from score)',
        'Delayed Projects', 'Missing RCA Note', 'Same-Day Date Violations',
        'Activity Score', 'Data Quality Score', 'Case Study Score',
        'Delay Accountability Score', 'Phase Date Integrity Score', 'Hygiene Score',
      ],
      ...hygieneBoard.map((pm: any) => [
        pm.projectManager, pm.totalProjects, pm.activeProjects, pm.completedProjects,
        pm.logins30d, pm.projectUpdates30d, pm.caseStudyUpdates30d,
        pm.lastLoginAt ? pm.lastLoginAt.slice(0, 10) : 'Never',
        pm.lastActionAt ? pm.lastActionAt.slice(0, 10) : 'Never',
        pm.daysSinceLastAction ?? 'Never',
        pm.missingKickoffDate, pm.missingPlannedDates, pm.missingCustomerEmail,
        pm.missingNotes, pm.overdueNotFlagged, pm.missingProjectSize, pm.missingBudget,
        pm.csDone, pm.csPending, pm.csMissing, pm.csInGrace,
        pm.delayedProjectsCount, pm.missingRcaCount, pm.dateViolationsCount,
        pm.activityScore, pm.qualityScore, pm.caseStudyScore,
        pm.delayScore, pm.dateIntegrityScore, pm.hygieneScore,
      ]),
    ];
    downloadCSV(rows, `hygiene-board-${queryStart}-to-${queryEnd}.csv`);
  }

  async function handleExportHygieneExcel() {
    try {
      const blob = await auditApi.exportHygieneExcel({ startDate: queryStart, endDate: queryEnd });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hygiene-board-${queryStart}-to-${queryEnd}.xlsx`;
      a.click();
    } catch {}
  }

  function handleDownloadPmoHygieneImage() {
    if (!hygieneBoard.length) return;
    const allPMs = new Set(SEGMENT_CONFIG.flatMap(s => s.managers).map(m => m.toLowerCase()));
    const pmRows = hygieneBoard
      .filter((pm: any) => {
        const n = (pm.projectManager ?? '').toLowerCase();
        return allPMs.has(n) || [...allPMs].some(m => n.startsWith(m) || m.startsWith(n.split(' ')[0]));
      })
      .map((pm: any) => ({ name: pm.projectManager, score: Math.round(pm.hygieneScore ?? 0) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    downloadHygieneTableImage(
      'PMO Hygiene',
      'Project Manager',
      'Hygiene Score',
      pmRows,
      `pmo-hygiene-${format(new Date(), 'yyyy-MM-dd')}.png`,
    );
  }

  // A manager's "team-wise" score: for the two segment heads (Abhishek/Ajay) that's their
  // segment average (mean of that segment's team scores); for a team manager, it's the
  // score of the specific team they run. Never their own personal mailbox activity.
  function teamWiseScoreFor(email: string | undefined): number | null {
    if (!email) return null;
    const lower = email.toLowerCase();
    if (emailSegmentHeads.ENT?.email.toLowerCase() === lower) return emailSegmentHeads.ENT.score;
    if (emailSegmentHeads.SMB?.email.toLowerCase() === lower) return emailSegmentHeads.SMB.score;
    const team = emailTeamHygiene.find((t: any) => t.managerEmail?.toLowerCase() === lower);
    return team ? team.teamScore : null;
  }

  function handleDownloadEmailHygieneImage() {
    if (!emailMetrics.length) return;
    const allPMs = new Set(SEGMENT_CONFIG.flatMap(s => s.managers).map(m => m.toLowerCase()));
    const pmRows = emailMetrics
      .filter((m: any) => {
        const n = (m.userName ?? '').toLowerCase();
        return allPMs.has(n) || [...allPMs].some(pm => n.startsWith(pm) || pm.startsWith(n.split(' ')[0]));
      })
      .map((m: any) => ({
        name: m.userName,
        score: Math.round(m.emailHygieneScore ?? 0),
        teamScore: teamWiseScoreFor(m.userEmail),
        userEmail: m.userEmail,
      }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    downloadHygieneTableImage(
      'Email Hygiene',
      'Managers',
      'Individual Score (/100)',
      pmRows,
      `email-hygiene-${format(new Date(), 'yyyy-MM-dd')}.png`,
      'Team-wise Score (/100)',
      {
        weeks: emailWeeklyTrend,
        // Same week's stored metrics array, but looked up for THIS specific manager
        // instead of averaged across everyone -- powers both the inline sparkline
        // column and the single combined "all managers" line chart.
        perRowScoreFn: (weekMetrics: any[], row: { userEmail?: string }) => {
          const m = weekMetrics.find((x: any) => x.userEmail === row.userEmail);
          return m ? Math.round(m.emailHygieneScore) : null;
        },
      },
    );
  }

  // ── Hygiene scorecard email — send now / scheduled send ──────────
  const [isSyncingOutlook, setIsSyncingOutlook] = useState(false);
  const [syncOutlookStatus, setSyncOutlookStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncOutlookError, setSyncOutlookError] = useState('');
  const [sendNowStatus, setSendNowStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendNowError, setSendNowError] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleRecipients, setScheduleRecipients] = useState<Set<string>>(new Set());
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleFormError, setScheduleFormError] = useState('');

  const { data: allUsersData } = useQuery({
    queryKey: ['allUsersForScorecard'],
    queryFn: () => authApi.getUsers(),
    enabled: showScheduleModal,
  });
  const scorecardCandidates: any[] = (allUsersData?.data ?? []).filter((u: any) => u.isActive && u.email);

  const {
    data: schedulesData,
    refetch: refetchSchedules,
  } = useQuery({
    queryKey: ['hygieneScorecardSchedules'],
    queryFn: () => auditApi.getHygieneScorecardSchedules(),
    enabled: hygieneTab === 'project' && isAdmin,
  });
  const pendingSchedules: any[] = (schedulesData?.data ?? []).filter((s: any) => s.status === 'PENDING');

  const { data: pmoWeeklyTrendData } = usePmoHygieneWeeklyTrend(hygieneTab === 'project' && isAdmin);
  const pmoWeeklyTrend: any[] = pmoWeeklyTrendData?.data?.weeks ?? [];
  const { data: emailWeeklyTrendData } = useEmailHygieneWeeklyTrend(hygieneTab === 'email');
  const emailWeeklyTrend: any[] = emailWeeklyTrendData?.data?.weeks ?? [];
  const { data: callWeeklyTrendData } = useCallHygieneWeeklyTrend(hygieneTab === 'call' && canSeeCallHygiene);
  const callWeeklyTrend: any[] = callWeeklyTrendData?.data?.weeks ?? [];

  async function handleSendNow() {
    setSendNowStatus('sending');
    setSendNowError('');
    try {
      const res = await auditApi.runHygieneScorecardNow();
      if (res?.data?.sent) {
        setSendNowStatus('sent');
      } else {
        setSendNowStatus('error');
        setSendNowError(res?.data?.skippedReason || 'Send was skipped');
      }
    } catch (err: any) {
      setSendNowStatus('error');
      setSendNowError(err?.response?.data?.error?.message || 'Failed to send scorecard');
    } finally {
      setTimeout(() => setSendNowStatus('idle'), 4000);
    }
  }

  function handleOpenScheduleModal() {
    setScheduleFormError('');
    const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
    defaultTime.setSeconds(0, 0);
    setScheduleDateTime(format(defaultTime, "yyyy-MM-dd'T'HH:mm"));
    setScheduleRecipients(new Set());
    setShowScheduleModal(true);
  }

  function toggleScheduleRecipient(email: string) {
    setScheduleRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleCreateSchedule() {
    if (scheduleRecipients.size === 0) {
      setScheduleFormError('Select at least one participant.');
      return;
    }
    if (!scheduleDateTime) {
      setScheduleFormError('Pick a date and time.');
      return;
    }
    const scheduledAt = new Date(scheduleDateTime);
    if (scheduledAt.getTime() <= Date.now()) {
      setScheduleFormError('Scheduled time must be in the future.');
      return;
    }
    setScheduleSubmitting(true);
    setScheduleFormError('');
    try {
      await auditApi.scheduleHygieneScorecard([...scheduleRecipients], scheduledAt.toISOString());
      setShowScheduleModal(false);
      refetchSchedules();
    } catch (err: any) {
      setScheduleFormError(err?.response?.data?.error?.message || 'Failed to schedule the send');
    } finally {
      setScheduleSubmitting(false);
    }
  }

  async function handleCancelSchedule(id: string) {
    try {
      await auditApi.cancelHygieneScorecardSchedule(id);
      refetchSchedules();
    } catch {}
  }

  const { settings } = useSettings();
  const snapshotRef = useRef<HTMLDivElement>(null);
  const { data: allProjectsData, isLoading: isSnapshotLoading, refetch: refetchSnapshot } = useProjects({ limit: 10000 });

  const nameToCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const mt of settings.migrationTypes) {
      map.set(mt.name.toLowerCase(), mt.category);
    }
    return map;
  }, [settings.migrationTypes]);

  const classify = (migrationTypes: string | null | undefined): Set<string> => {
    const cats = new Set<string>();
    if (!migrationTypes) return cats;
    for (const raw of migrationTypes.split(',')) {
      const cat = nameToCategory.get(raw.trim().toLowerCase());
      if (cat === 'Content Migration') cats.add('content');
      else if (cat === 'Messaging') cats.add('message');
      else if (cat === 'Email') cats.add('email');
    }
    return cats;
  };

  const snapshotStats = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    const content = projects.filter(p => classify(p.migrationTypes).has('content'));
    const message = projects.filter(p => classify(p.migrationTypes).has('message'));
    const email   = projects.filter(p => classify(p.migrationTypes).has('email'));
    const uniqueIds = new Set([...content, ...message, ...email].map(p => p.id));

    const managers = [...new Set(projects.map(p => p.projectManager).filter(Boolean))].sort() as string[];
    const byManager = managers.map(manager => {
      const mp = projects.filter(p => p.projectManager === manager);
      const cSet = new Set(mp.filter(p => classify(p.migrationTypes).has('content')).map(p => p.id));
      const mSet = new Set(mp.filter(p => classify(p.migrationTypes).has('message')).map(p => p.id));
      const eSet = new Set(mp.filter(p => classify(p.migrationTypes).has('email')).map(p => p.id));
      const tSet = new Set([...cSet, ...mSet, ...eSet]);
      return { manager, c: cSet.size, m: mSet.size, e: eSet.size, t: tSet.size };
    }).filter(row => row.c > 0 || row.m > 0 || row.e > 0);

    return {
      totalUnique: uniqueIds.size,
      totalCount: content.length + message.length + email.length,
      contentCount: content.length,
      messageCount: message.length,
      emailCount: email.length,
      byManager,
    };
  }, [allProjectsData, nameToCategory]);

  const delayRows = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    return projects
      .filter(p => p.delayDays > 0 && p.delayStatus !== 'NOT_DELAYED' && p.status !== 'COMPLETED' && p.status !== 'CANCELLED')
      .map(p => {
        const cats = classify(p.migrationTypes);
        const primaryCategory = cats.has('email') ? 'Email' : cats.has('message') ? 'Message' : cats.has('content') ? 'Content' : 'Other';
        const days = p.delayDays;
        const severity: 'Moderate' | 'High' | 'Critical' = days >= 60 ? 'Critical' : days >= 30 ? 'High' : 'Moderate';
        const duration = days >= 60 ? '> 2 Months' : days >= 30 ? '> 1 Month' : '< 1 Month';
        return { ...p, primaryCategory, severity, duration };
      })
      .sort((a, b) => {
        const order = { Moderate: 0, High: 1, Critical: 2 };
        return order[a.severity] - order[b.severity];
      });
  }, [allProjectsData, nameToCategory]);

  const finalValidationRows = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    return projects
      .filter(p =>
        p.phase?.toLowerCase().includes('final') &&
        p.status !== 'COMPLETED' &&
        p.status !== 'CANCELLED'
      )
      .map(p => {
        const cats = classify(p.migrationTypes);
        const primaryCategory = cats.has('email') ? 'Email' : cats.has('message') ? 'Message' : cats.has('content') ? 'Content' : 'Other';
        return { ...p, primaryCategory };
      })
      .sort((a, b) => a.projectManager.localeCompare(b.projectManager));
  }, [allProjectsData, nameToCategory]);

  const handleDownloadSnapshot = async () => {
    if (!snapshotRef.current) return;
    try {
      const dataUrl = await toPng(snapshotRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const label = snapshotTab === 'delay' ? 'delay-summary' : snapshotTab === 'final' ? 'final-validation' : 'project-snapshot';
      a.download = `${label}-${format(new Date(), 'yyyy-MM-dd')}.png`;
      a.click();
    } catch (err) {
      console.error('Snapshot export failed:', err);
    }
  };

  function applyRange() {
    setQueryStart(draftStart);
    setQueryEnd(draftEnd);
  }

  function applyPreset(m: Mode, s: string, e: string) {
    setMode(m);
    setDraftStart(s);
    setDraftEnd(e);
    setQueryStart(s);
    setQueryEnd(e);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sorted(users: any[]) {
    return [...users].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortAsc ? cmp : -cmp;
    });
  }

  function handleExport() {
    if (!summary) return;
    const rows = [
      ['Name', 'Email', 'Role', 'Total Projects', 'Active', 'Completed', 'Cancelled', 'Delayed', 'At Risk', `Added (${queryStart}–${queryEnd})`, `Closed (${queryStart}–${queryEnd})`],
      ...summary.users.map((u: any) => [
        u.name, u.email, u.role,
        u.totalProjects, u.activeProjects, u.completedProjects, u.cancelledProjects,
        u.delayedProjects, u.atRiskProjects, u.addedInPeriod, u.closedInPeriod,
      ]),
    ];
    downloadCSV(rows, `audit-dashboard-${queryStart}-to-${queryEnd}.csv`);
  }

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === col ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
      </span>
    </th>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">Audit Dashboard</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity size={22} className="text-primary-600" /> Audit Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Project activity per Project Manager, Account Manager &amp; Pre-Sales
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!summary}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date Controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => applyPreset('weekly', weekStart(), todayStr())}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'weekly' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Weekly
            </button>
            <button
              onClick={() => applyPreset('monthly', monthStart(), monthEnd())}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'monthly' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Monthly
            </button>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {mode === 'weekly' ? (
              <>
                <button
                  onClick={() => applyPreset('weekly', weekStart(), todayStr())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  This Week
                </button>
                <button
                  onClick={() => applyPreset('weekly', lastWeekStart(), lastWeekEnd())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  Last Week
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => applyPreset('monthly', monthStart(), monthEnd())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  This Month
                </button>
                <button
                  onClick={() => applyPreset('monthly', monthStart(1), monthEnd(1))}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  Last Month
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Calendar size={15} className="text-gray-400" />
            <input
              type="date"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
            <span className="text-sm text-gray-400">—</span>
            <input
              type="date"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
            <button
              onClick={applyRange}
              className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
        </div>
      ) : !summary ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <AlertCircle size={32} className="mr-3" /> Failed to load data
        </div>
      ) : (
        <>
          {/* Role KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['PROJECT_MANAGER', 'ACCOUNT_MANAGER', 'PRE_SALES'] as const).map((role) => {
              const meta = ROLE_META[role];
              const t = summary.totals[role];
              const Icon = meta.icon;
              return (
                <Card key={role} className={`border ${meta.border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} className={meta.color} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-600">{meta.label}</p>
                      <p className={`text-3xl font-bold mt-0.5 ${meta.color}`}>{t.totalProjects}</p>
                      <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{t.active} active</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />{t.delayed} delayed</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />+{t.addedInPeriod} new</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{t.users} users</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Per-role expandable tables */}
          {(['PROJECT_MANAGER', 'ACCOUNT_MANAGER', 'PRE_SALES'] as const).map((role) => {
            const meta = ROLE_META[role];
            const users = sorted(summary.byRole[role] ?? []);
            const isOpen = expandedRole === role;
            const Icon = meta.icon;
            const t = summary.totals[role];

            return (
              <Card key={role} className="overflow-hidden p-0">
                <button
                  onClick={() => setExpandedRole(isOpen ? null : role)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center`}>
                      <Icon size={17} className={meta.color} />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{meta.label}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>
                        {users.length} {users.length === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><FolderKanban size={12} className="text-gray-400" />{t.totalProjects} total</span>
                      <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-400" />{t.active} active</span>
                      <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-400" />{t.delayed} delayed</span>
                      <span className="flex items-center gap-1.5"><Plus size={12} className="text-blue-400" />+{t.addedInPeriod} this period</span>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    {users.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-10">No users with this role found.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <SortTh col="name" label="User" />
                              <SortTh col="totalProjects" label="Projects in Period" />
                              <SortTh col="activeProjects" label="Active" />
                              <SortTh col="completedProjects" label="Completed" />
                              <SortTh col="delayedProjects" label="Delayed" />
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">At Risk</th>
                              <SortTh col="addedInPeriod" label="New" />
                              <SortTh col="closedInPeriod" label="Closed" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {users.map((u: any) => (
                              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center text-xs font-bold ${meta.color} flex-shrink-0`}>
                                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-900 text-sm leading-tight">{u.name}</p>
                                      <p className="text-xs text-gray-400 leading-tight">{u.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-base font-bold ${meta.color}`}>{u.totalProjects}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-1 text-gray-700">
                                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                                    {u.activeProjects}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{u.completedProjects}</td>
                                <td className="px-4 py-3">
                                  {u.delayedProjects > 0 ? (
                                    <span className="flex items-center gap-1 text-red-600 font-medium">
                                      <AlertTriangle size={13} />{u.delayedProjects}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.atRiskProjects > 0 ? (
                                    <span className="text-amber-600 font-medium">{u.atRiskProjects}</span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.addedInPeriod > 0 ? (
                                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                                      <TrendingUp size={13} />+{u.addedInPeriod}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.closedInPeriod > 0 ? (
                                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                      <CheckCircle size={13} />{u.closedInPeriod}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          <p className="text-xs text-gray-400 text-center pb-2">
            Period: <strong>{format(new Date(queryStart), 'MMM d, yyyy')}</strong> — <strong>{format(new Date(queryEnd), 'MMM d, yyyy')}</strong>
            {' · '}Added/Closed columns reflect project activity within this period only.
          </p>
        </>
      )}

      {/* ── Inactive Users ───────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <UserX size={17} className="text-red-500" />
            </div>
            <div>
              <span className="font-semibold text-gray-800 text-sm">Inactive Users</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600">
                {inactiveUsers.length} {inactiveUsers.length === 1 ? 'user' : 'users'}
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                No logins and no updates in the last {INACTIVITY_DAYS} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchActivity()}
              disabled={isActivityLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isActivityLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={handleExportInactive}
              disabled={!inactiveUsers.length}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {isActivityLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : inactiveUsers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">All users have been active in the last {INACTIVITY_DAYS} days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inactiveUsers.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-xs font-bold text-red-500 flex-shrink-0">
                          {u.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm leading-tight">{u.name}</p>
                          <p className="text-xs text-gray-400 leading-tight">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.role}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.lastActive ? format(new Date(u.lastActive), 'MMM d, yyyy') : <span className="text-red-500 font-medium">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Project Snapshot ─────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Camera size={18} className="text-primary-600" /> Project Reports
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live data from all projects — refreshes with current data from the Projects page
            </p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setSnapshotTab('snapshot')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'snapshot' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Project Snapshot
            </button>
            <button
              onClick={() => setSnapshotTab('delay')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'delay' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Delay Summary
              {delayRows.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-semibold">{delayRows.length}</span>
              )}
            </button>
            <button
              onClick={() => setSnapshotTab('final')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'final' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Final Validation
              {finalValidationRows.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-semibold">{finalValidationRows.length}</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchSnapshot()}
              disabled={isSnapshotLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSnapshotLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={handleDownloadSnapshot}
              disabled={isSnapshotLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-40"
            >
              <Camera size={14} /> {snapshotTab === 'delay' ? 'Download Delay Image' : snapshotTab === 'final' ? 'Download Image' : 'Download Image'}
            </button>
          </div>
        </div>

        {isSnapshotLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : snapshotTab === 'snapshot' ? (
          <div ref={snapshotRef} className="bg-white rounded-xl p-5 border border-gray-200" style={{ minWidth: 820 }}>
            <div className="grid grid-cols-5 gap-3 mb-5">
              {[
                {
                  label: 'TOTAL UNIQUE PROJECTS',
                  value: snapshotStats.totalUnique,
                  desc: 'Unique projects after removing duplicates across Content, Message and Email.',
                  Icon: Users,
                  headerBg: 'bg-[#1e3a8a]',
                },
                {
                  label: 'TOTAL PROJECT COUNT',
                  value: snapshotStats.totalCount,
                  desc: 'Total project records across Content, Message and Email.',
                  Icon: Layers,
                  headerBg: 'bg-[#2563eb]',
                },
                {
                  label: 'CONTENT PROJECTS',
                  value: snapshotStats.contentCount,
                  desc: 'Total Content project records.',
                  Icon: FolderOpen,
                  headerBg: 'bg-[#0284c7]',
                },
                {
                  label: 'MESSAGE PROJECTS',
                  value: snapshotStats.messageCount,
                  desc: 'Total Message project records.',
                  Icon: MessageSquare,
                  headerBg: 'bg-[#4f46e5]',
                },
                {
                  label: 'EMAIL PROJECTS',
                  value: snapshotStats.emailCount,
                  desc: 'Total Email project records.',
                  Icon: Mail,
                  headerBg: 'bg-[#7c3aed]',
                },
              ].map(({ label, value, desc, Icon, headerBg }) => (
                <div key={label} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className={`${headerBg} px-3 py-2.5 flex items-start gap-2`}>
                    <Icon size={15} className="text-white opacity-80 mt-0.5 shrink-0" />
                    <span className="text-white text-xs font-bold tracking-wide leading-tight">{label}</span>
                  </div>
                  <div className="px-3 pt-3 pb-4 text-center">
                    <p className="text-4xl font-extrabold text-gray-900 leading-none">{value}</p>
                    <p className="text-xs text-gray-500 mt-2 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <div className="bg-[#1e3a8a] px-5 py-3">
                <span className="text-white text-sm font-bold uppercase tracking-wider">
                  Unique Projects by Migration Manager (Duplicates Removed)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-blue-50/70">
                  <tr>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[#1e3a8a] w-10">#</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[#1e3a8a]">Migration Manager</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <FolderOpen size={13} className="text-sky-500" />
                        <span>Content Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <MessageSquare size={13} className="text-indigo-500" />
                        <span>Message Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Mail size={13} className="text-violet-500" />
                        <span>Email Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Users size={13} className="text-[#1e3a8a]" />
                        <span>Total Unique</span>
                        <span className="font-normal text-gray-400">Projects</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotStats.byManager.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-400">No project data available</td>
                    </tr>
                  ) : snapshotStats.byManager.map((row, i) => (
                    <tr key={row.manager} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{row.manager}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.c || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.m || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.e || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center font-bold text-[#1e3a8a]">{row.t}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#1e3a8a]/20 bg-blue-50/40">
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 font-bold text-[#1e3a8a] uppercase text-xs tracking-wider">Total</td>
                    <td className="py-3 px-4 text-center font-bold text-sky-600">{snapshotStats.contentCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-indigo-600">{snapshotStats.messageCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-violet-600">{snapshotStats.emailCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-[#1e3a8a]">{snapshotStats.totalUnique}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : snapshotTab === 'delay' ? (
          <div ref={snapshotRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ minWidth: 900, width: '100%' }}>
            <div className="bg-[#1e3a8a] px-6 py-4 text-center">
              <h3 className="text-white text-xl font-bold tracking-wide">Project Delay Summary</h3>
            </div>

            {delayRows.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-16">No delayed projects found</p>
            ) : (
              <>
                <div>
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#1e3a8a]">
                        {['Migration Manager', 'Category', 'Project Name', 'Account Manager', 'Delay Duration', 'Delay Severity'].map(h => (
                          <th key={h} className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {delayRows.map((row, i) => {
                        const severityStyle =
                          row.severity === 'Critical' ? 'bg-red-600 text-white' :
                          row.severity === 'High'     ? 'bg-orange-400 text-white' :
                                                        'bg-yellow-200 text-yellow-800';
                        const catIcon =
                          row.primaryCategory === 'Email'   ? <Mail size={14} className="text-emerald-500" /> :
                          row.primaryCategory === 'Message' ? <MessageSquare size={14} className="text-red-500" /> :
                                                              <FolderOpen size={14} className="text-blue-600" />;
                        const catColor =
                          row.primaryCategory === 'Email'   ? 'text-emerald-600' :
                          row.primaryCategory === 'Message' ? 'text-red-500' :
                                                              'text-blue-600';
                        return (
                          <tr key={`${row.id}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-center font-medium text-gray-800">{row.projectManager}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {catIcon}
                                <span className={`font-semibold text-xs ${catColor}`}>{row.primaryCategory}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-800">{row.name}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5 text-gray-700">
                                <Users size={13} className="text-gray-400 shrink-0" />
                                {row.accountManager || '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.duration}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded font-semibold text-xs ${severityStyle}`}>
                                {row.severity}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-5 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-yellow-300 inline-block" />
                    <span className="text-xs text-gray-600">Moderate (&lt; 1 Month)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                    <span className="text-xs text-gray-600">High (&gt; 1 Month)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                    <span className="text-xs text-gray-600">Critical (&gt; 2 Months)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          (() => {
            const PURPLE = '#2d1b6e';
            const msgCount  = finalValidationRows.filter(r => r.primaryCategory === 'Message').length;
            const contCount = finalValidationRows.filter(r => r.primaryCategory === 'Content').length;
            const emailCount= finalValidationRows.filter(r => r.primaryCategory === 'Email').length;
            const amCount   = new Set(finalValidationRows.map(r => r.accountManager).filter(Boolean)).size;
            const stageName = finalValidationRows[0]?.phase ?? 'Final Validation';

            const summaryCards = [
              { label: 'TOTAL PROJECTS',    value: finalValidationRows.length, Icon: Users },
              { label: 'MESSAGE PROJECTS',  value: msgCount,  Icon: MessageSquare },
              { label: 'CONTENT PROJECTS',  value: contCount, Icon: FolderOpen },
              { label: 'EMAIL PROJECTS',    value: emailCount,Icon: Mail },
              { label: 'ACCOUNT MANAGERS',  value: amCount,   Icon: User },
              { label: 'CURRENT STAGE',     value: null, text: stageName, Icon: Flag },
            ];

            return (
              <div ref={snapshotRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ minWidth: 900, width: '100%' }}>
                <div style={{ background: PURPLE }} className="px-6 py-4 text-center">
                  <h3 className="text-white text-xl font-bold tracking-wide">Projects in Final Validation</h3>
                </div>

                {finalValidationRows.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-16">No projects currently in final validation</p>
                ) : (
                  <>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ background: '#f0edff' }}>
                          {[
                            { label: 'Migration Manager', Icon: Users },
                            { label: 'Migration Type',    Icon: FolderOpen },
                            { label: 'Project Name',      Icon: Building2 },
                            { label: 'Account Manager',   Icon: User },
                            { label: 'Status',            Icon: CheckCircle },
                            { label: 'Current Stage',     Icon: Flag },
                          ].map(({ label, Icon }) => (
                            <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
                              <div className="flex items-center justify-center gap-1.5">
                                <Icon size={13} style={{ color: PURPLE }} />
                                {label}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finalValidationRows.map((row, i) => {
                          const catIcon =
                            row.primaryCategory === 'Email'   ? <Mail size={14} className="text-emerald-500" /> :
                            row.primaryCategory === 'Message' ? <MessageSquare size={14} className="text-purple-500" /> :
                                                                <FolderOpen size={14} className="text-purple-700" />;
                          const catColor =
                            row.primaryCategory === 'Email'   ? 'text-emerald-600' :
                            row.primaryCategory === 'Message' ? 'text-purple-600' :
                                                                'text-purple-800';
                          return (
                            <tr key={`${row.id}-${i}`} className="border-t border-gray-100 hover:bg-purple-50/30">
                              <td className="px-4 py-3 text-center font-medium text-gray-800">{row.projectManager}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  {catIcon}
                                  <span className={`font-semibold text-xs ${catColor}`}>{row.primaryCategory}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-800">{row.name}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5 text-gray-700">
                                  <User size={13} className="text-gray-400 shrink-0" />
                                  {row.accountManager || '—'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                  <span className="text-gray-700 text-xs">{row.status === 'ACTIVE' ? 'Active' : row.status}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-600">{row.phase}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="grid grid-cols-6 gap-3 px-5 py-5" style={{ background: PURPLE }}>
                      {summaryCards.map(({ label, value, text, Icon }) => (
                        <div key={label} className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                            <Icon size={20} className="text-white" />
                          </div>
                          <div className="text-center">
                            <p className="text-white text-xs font-semibold uppercase tracking-wide leading-tight">{label}</p>
                            {text ? (
                              <p className="text-yellow-300 text-sm font-bold leading-tight mt-0.5">{text}</p>
                            ) : (
                              <p className="text-white text-2xl font-extrabold leading-none mt-0.5">{value}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ── Hygiene Board ──────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Section header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck size={18} className="text-indigo-600" /> Hygiene Board
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {hygieneTab === 'project'
                ? <>PM login &amp; update activity, data completeness, and case study completion — Activity &amp; Case Study scores for <strong>{format(new Date(queryStart), 'MMM d, yyyy')} – {format(new Date(queryEnd), 'MMM d, yyyy')}</strong>; Data Quality, Delay, and Date Integrity reflect current project state</>
                : hygieneTab === 'email'
                ? 'Speed (30%) · Quality (30%) · Resolution (20%) · Tone (20%) — scored from Microsoft 365 mailbox data for all @cloudfuze.com team members (this week)'
                : 'Hygiene = % of AI-graded customer Q&A exchanges answered well, from Teams call transcripts for all @cloudfuze.com team members (this week)'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tab switcher */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setHygieneTab('project')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${hygieneTab === 'project' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Project Hygiene
              </button>
              <button
                onClick={() => setHygieneTab('email')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${hygieneTab === 'email' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Mail size={11} className="inline-block mr-1 -mt-px" />Email Hygiene
              </button>
              <button
                onClick={() => setHygieneTab('call')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${hygieneTab === 'call' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Phone size={11} className="inline-block mr-1 -mt-px" />Call Hygiene
              </button>
            </div>
            {/* Action buttons — project tab */}
            {hygieneTab === 'project' && (<>
              <button
                onClick={() => refetchHygiene()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                onClick={handleExportHygieneCSV}
                disabled={!hygieneBoard.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={handleExportHygieneExcel}
                disabled={!hygieneBoard.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button
                onClick={handleDownloadPmoHygieneImage}
                disabled={!hygieneBoard.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-40" style={{ backgroundColor: '#4B0BC4' }}
              >
                <Camera size={13} /> Image
              </button>
              {isAdmin && (<>
                <button
                  onClick={handleSendNow}
                  disabled={sendNowStatus === 'sending' || !hygieneBoard.length}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50',
                    sendNowStatus === 'sent' ? 'bg-green-600 text-white'
                      : sendNowStatus === 'error' ? 'bg-red-600 text-white'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  )}
                  title={sendNowStatus === 'error' ? sendNowError : 'Emails the PMO Hygiene & Score Card to all active managers right now'}
                >
                  {sendNowStatus === 'sending' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {sendNowStatus === 'sending' ? 'Sending…' : sendNowStatus === 'sent' ? 'Sent!' : sendNowStatus === 'error' ? 'Failed' : 'Send Now'}
                </button>
                <button
                  onClick={handleOpenScheduleModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Clock size={13} /> Schedule Send
                </button>
              </>)}
            </>)}
            {/* Action buttons — email tab */}
            {hygieneTab === 'email' && (<>
              <button
                onClick={() => refetchEmailHygiene()}
                disabled={isEmailHygieneFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={isEmailHygieneFetching ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={handleForceRefreshEmailHygiene}
                disabled={isSyncingOutlook || isEmailHygieneFetching}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors disabled:opacity-50 ${
                  syncOutlookStatus === 'success' ? 'bg-green-50 border-green-300 text-green-700' :
                  syncOutlookStatus === 'error'   ? 'bg-red-50 border-red-300 text-red-700' :
                  'text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <RefreshCw size={13} className={isSyncingOutlook ? 'animate-spin' : ''} />
                {isSyncingOutlook ? 'Syncing…' : syncOutlookStatus === 'success' ? 'Synced!' : 'Sync from Outlook'}
              </button>
              {syncOutlookStatus === 'error' && (
                <p className="text-xs text-red-600 mt-1 w-full">{syncOutlookError}</p>
              )}
              <button
                onClick={emailHygieneView === 'managers' ? handleExportTeamHygieneCSV : handleExportEmailHygieneCSV}
                disabled={emailHygieneView === 'managers' ? !emailTeamHygiene.length : !emailMetrics.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={handleExportEmailHygieneExcel}
                disabled={!emailMetrics.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button
                onClick={handleDownloadEmailHygieneImage}
                disabled={!emailMetrics.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-40" style={{ backgroundColor: '#4B0BC4' }}
              >
                <Camera size={13} /> Image
              </button>
            </>)}
            {/* Action buttons — call tab */}
            {hygieneTab === 'call' && (<>
              <button
                onClick={() => refetchCallHygiene()}
                disabled={isCallHygieneFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={isCallHygieneFetching ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={handleForceRefreshCallHygiene}
                disabled={isCallHygieneFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} /> Sync from Outlook
              </button>
              <button
                onClick={handleExportCallHygieneCSV}
                disabled={!callMetrics.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={handleExportCallHygieneExcel}
                disabled={!callMetrics.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
            </>)}
          </div>
        </div>

        {hygieneTab === 'project' && (<>
        {/* Fleet KPIs */}
        {hygieneBoard.length > 0 && (() => {
          const avg = Math.round(hygieneBoard.reduce((s: number, pm: any) => s + pm.hygieneScore, 0) / hygieneBoard.length);
          const neverLoggedIn = hygieneBoard.filter((pm: any) => !pm.lastLoginAt).length;
          const overdue = hygieneBoard.reduce((s: number, pm: any) => s + pm.overdueNotFlagged, 0);
          const missingCS = hygieneBoard.reduce((s: number, pm: any) => s + pm.csMissing, 0);
          const kpis = [
            { label: 'Fleet Hygiene Score', value: avg, color: hygieneScoreColor(avg) },
            { label: 'PMs Never Logged In (period)', value: neverLoggedIn, color: { bg: 'bg-red-50', text: 'text-red-700', ring: '' } },
            { label: 'Overdue (unflagged)', value: overdue, color: { bg: 'bg-amber-50', text: 'text-amber-700', ring: '' } },
            { label: 'Missing Case Studies', value: missingCS, color: { bg: 'bg-orange-50', text: 'text-orange-700', ring: '' } },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {kpis.map(({ label, value, color }) => (
                <div key={label} className={`${color.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-bold ${color.text}`}>{value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Weekly trend */}
        {isAdmin && (
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
              <TrendingUp size={14} className="text-indigo-600" /> Weekly Trend — PMO Hygiene
              <span className="text-xs font-normal text-gray-400">this month, Mon–Sun</span>
            </div>
            <WeeklyTrendChart
              weeks={pmoWeeklyTrend}
              scoreFn={(metrics) => metrics.length ? Math.round(metrics.reduce((s: number, pm: any) => s + pm.hygieneScore, 0) / metrics.length) : null}
            />
          </Card>
        )}

        {/* Scheduled scorecard sends */}
        {isAdmin && pendingSchedules.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <Clock size={14} className="text-indigo-600" /> Scheduled Scorecard Sends
            </div>
            <div className="space-y-1.5">
              {pendingSchedules.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">{format(new Date(s.scheduledAt), 'MMM d, yyyy HH:mm')}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="text-gray-600">{s.recipients.length} recipient{s.recipients.length === 1 ? '' : 's'}</span>
                    <span className="text-gray-400 truncate"> ({s.recipients.join(', ')})</span>
                  </div>
                  <button
                    onClick={() => handleCancelSchedule(s.id)}
                    className="flex items-center gap-1 text-red-500 hover:text-red-700 shrink-0"
                  >
                    <X size={12} /> Cancel
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Hygiene table */}
        <Card>
          {isHygieneLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
            </div>
          ) : hygieneBoard.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No project data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/60">
                    <th className="text-left font-semibold text-gray-700 py-2.5 px-3 whitespace-nowrap text-xs">Project Manager</th>
                    <th className="text-center font-semibold text-gray-500 py-2.5 px-2 whitespace-nowrap text-xs">Active / On-Hold</th>
                    <th className="text-center font-semibold text-gray-500 py-2.5 px-2 whitespace-nowrap text-xs">Completed / Archived</th>
                    <th className="text-center font-semibold text-blue-700 py-2.5 px-2 whitespace-nowrap text-xs">Activity</th>
                    <th className="text-center font-semibold text-purple-700 py-2.5 px-2 whitespace-nowrap text-xs">Data Quality</th>
                    <th className="text-center font-semibold text-teal-700 py-2.5 px-2 whitespace-nowrap text-xs">Case Studies</th>
                    <th className="text-center font-semibold text-orange-700 py-2.5 px-2 whitespace-nowrap text-xs">Delay Accountability</th>
                    <th className="text-center font-semibold text-rose-700 py-2.5 px-2 whitespace-nowrap text-xs">Date Integrity</th>
                    <th className="text-center font-semibold text-gray-800 py-2.5 px-3 whitespace-nowrap text-xs">Hygiene Score</th>
                    <th className="text-center font-semibold text-gray-400 py-2.5 px-3 whitespace-nowrap text-xs">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {hygieneBoard.map((pm: any, i: number) => {
                    const sc = hygieneScoreColor(pm.hygieneScore);
                    const bad = (n: number) => n > 0 ? 'text-red-600 font-semibold' : 'text-gray-300';
                    const neverLoggedIn = !pm.lastLoginAt;
                    const daysIdle = pm.daysSinceLastAction;
                    const isExpanded = expandedHygienePM === pm.projectManager;
                    return (
                      <Fragment key={pm.projectManager}>
                      <tr className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-indigo-50/20 transition-colors`}>
                        <td className="py-3 px-3 font-medium text-gray-800 whitespace-nowrap">{pm.projectManager}</td>
                        <td className="py-3 px-2 text-center text-gray-600">{pm.activeProjects}</td>
                        <td className="py-3 px-2 text-center text-gray-600">{pm.completedProjects}</td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{pm.activityScore}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{pm.qualityScore}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">{pm.caseStudyScore}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{pm.delayScore}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{pm.dateIntegrityScore}</span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                            {pm.hygieneScore}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setExpandedHygienePM(isExpanded ? null : pm.projectManager)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-indigo-50/20 border-b border-gray-100">
                          <td colSpan={10} className="px-3 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                              <div className="bg-blue-50/70 rounded-lg p-3">
                                <div className="text-[11px] font-semibold text-blue-600 mb-2">
                                  Activity <span className="text-gray-400 font-normal">({format(new Date(queryStart), 'MMM d')}–{format(new Date(queryEnd), 'MMM d')})</span>
                                </div>
                                <div className="space-y-1 text-xs text-gray-700">
                                  <div className="flex justify-between"><span>Logins</span><span className={neverLoggedIn ? 'text-red-500 font-semibold' : pm.logins30d >= 4 ? 'text-green-600 font-semibold' : ''}>{pm.logins30d}</span></div>
                                  <div className="flex justify-between"><span>Project Updates</span><span className={pm.projectUpdates30d === 0 && pm.activeProjects > 0 ? 'text-red-500 font-semibold' : ''}>{pm.projectUpdates30d}</span></div>
                                  <div className="flex justify-between"><span>Case Study Updates</span><span>{pm.caseStudyUpdates30d}</span></div>
                                  <div className="flex justify-between"><span>Last Login</span><span className={neverLoggedIn ? 'text-red-400 italic' : 'text-gray-500'}>{pm.lastLoginAt ? pm.lastLoginAt.slice(0, 10) : 'Never'}</span></div>
                                  <div className="flex justify-between"><span>Last Action</span><span className={pm.lastActionAt ? 'text-gray-500' : 'text-red-400 italic'}>{pm.lastActionAt ? pm.lastActionAt.slice(0, 10) : 'Never'}</span></div>
                                  <div className="flex justify-between"><span>Days Idle</span>{daysIdle === null ? <span className="text-red-400 italic">Never</span> : <span className={daysIdle > 21 ? 'text-red-600 font-semibold' : daysIdle > 14 ? 'text-yellow-600 font-semibold' : 'text-green-600 font-semibold'}>{daysIdle}d</span>}</div>
                                </div>
                              </div>
                              <div className="bg-purple-50/70 rounded-lg p-3">
                                <div className="text-[11px] font-semibold text-purple-600 mb-2">Data Quality <span className="text-gray-400 font-normal">(current state)</span></div>
                                <div className="space-y-1 text-xs text-gray-700">
                                  <div className="flex justify-between"><span>Missing Kickoff Date</span><span className={bad(pm.missingKickoffDate)}>{pm.missingKickoffDate}</span></div>
                                  <div className="flex justify-between"><span>Missing Planned Dates</span><span className={bad(pm.missingPlannedDates)}>{pm.missingPlannedDates}</span></div>
                                  <div className="flex justify-between"><span>Missing Customer Email</span><span className={bad(pm.missingCustomerEmail)}>{pm.missingCustomerEmail}</span></div>
                                  <div className="flex justify-between"><span>Missing Notes</span><span className={bad(pm.missingNotes)}>{pm.missingNotes}</span></div>
                                  <div className="flex justify-between"><span>Overdue (Not Flagged)</span><span className={bad(pm.overdueNotFlagged)}>{pm.overdueNotFlagged}</span></div>
                                  <div className="flex justify-between"><span>Missing Project Size</span><span className={bad(pm.missingProjectSize)}>{pm.missingProjectSize}</span></div>
                                  <div className="flex justify-between"><span>Missing Budget</span><span className={bad(pm.missingBudget)}>{pm.missingBudget}</span></div>
                                </div>
                              </div>
                              <div className="bg-teal-50/70 rounded-lg p-3">
                                <div className="text-[11px] font-semibold text-teal-600 mb-2">Case Studies <span className="text-gray-400 font-normal">(current state)</span></div>
                                <div className="space-y-1 text-xs text-gray-700">
                                  <div className="flex justify-between"><span>Done</span><span className={pm.csDone > 0 ? 'text-teal-600 font-semibold' : 'text-gray-300'}>{pm.csDone}</span></div>
                                  <div className="flex justify-between"><span>Pending</span><span className={pm.csPending > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-300'}>{pm.csPending}</span></div>
                                  <div className="flex justify-between"><span>Missing</span><span className={bad(pm.csMissing)}>{pm.csMissing}</span></div>
                                  {pm.csInGrace > 0 && (
                                    <div className="flex justify-between text-gray-400" title="Completed within the 30-day grace window — excluded from the Case Study score">
                                      <span>In Grace Period</span><span>{pm.csInGrace}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="bg-orange-50/70 rounded-lg p-3">
                                <div className="text-[11px] font-semibold text-orange-600 mb-2">Delay Accountability <span className="text-gray-400 font-normal">(current state)</span></div>
                                <div className="space-y-1 text-xs text-gray-700">
                                  <div className="flex justify-between"><span>Delayed Projects</span><span className={bad(pm.delayedProjectsCount)}>{pm.delayedProjectsCount}</span></div>
                                  <div className="flex justify-between"><span>Missing RCA</span><span className={bad(pm.missingRcaCount)}>{pm.missingRcaCount}</span></div>
                                </div>
                              </div>
                              <div className="bg-rose-50/70 rounded-lg p-3">
                                <div className="text-[11px] font-semibold text-rose-600 mb-2">Phase Date Integrity <span className="text-gray-400 font-normal">(current state)</span></div>
                                <div className="space-y-1 text-xs text-gray-700">
                                  <div className="flex justify-between"><span>Same-Day Violations</span><span className={bad(pm.dateViolationsCount)}>{pm.dateViolationsCount}</span></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Legend */}
          {hygieneBoard.length > 0 && (
            <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
              <span className="font-medium text-gray-700">Hygiene Score:</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> ≥80 Good</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> 60–79 Fair</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &lt;60 Needs Attention</span>
              <span className="ml-auto text-gray-400">Activity 25% · Data Quality 25% · Case Studies 15% · Delay Accountability 20% · Date Integrity 15%</span>
            </div>
          )}
        </Card>
        </>)}

        {/* ── Email Hygiene Tab ───────────────────────────────────── */}
        {hygieneTab === 'email' && (<>
          {/* Credentials missing */}
          {!isEmailHygieneLoading && !emailHygieneConfigured && !emailHygieneAuthError && (
            <Card>
              <div className="py-12 text-center space-y-3">
                <Mail size={32} className="mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">Microsoft Graph API not configured</p>
                <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
                  Add <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_TENANT_ID</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_ID</code>, and{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_SECRET</code> to{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">backend/.env</code>.
                  The Azure AD app needs <strong>Mail.Read</strong> and <strong>User.Read.All</strong> application permissions with admin consent.
                </p>
              </div>
            </Card>
          )}

          {/* Credentials present but Graph API authentication failed */}
          {!isEmailHygieneLoading && emailHygieneConfigured && emailHygieneAuthError && (
            <Card>
              <div className="py-12 text-center space-y-3">
                <AlertCircle size={32} className="mx-auto text-red-400" />
                <p className="font-semibold text-gray-700">Microsoft Graph API authentication failed</p>
                <p className="text-sm text-gray-500 max-w-xl mx-auto font-mono bg-red-50 border border-red-100 rounded p-3 text-left break-all">
                  {emailHygieneAuthError}
                </p>
                <div className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed space-y-1">
                  <p>Common causes:</p>
                  <ul className="text-left list-disc list-inside space-y-1">
                    <li>The client secret in <code className="bg-gray-100 px-1 rounded font-mono text-xs">backend/.env</code> has expired — generate a new one in Azure Portal → App registrations → Certificates &amp; secrets</li>
                    <li><strong>Mail.Read</strong> and <strong>User.Read.All</strong> application permissions need admin consent — go to Azure Portal → App registrations → API permissions → Grant admin consent</li>
                    <li>Wrong <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_TENANT_ID</code> or <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_ID</code></li>
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Loading */}
          {isEmailHygieneLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex items-center gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <span className="text-gray-600 text-sm font-medium">Fetching emails from Microsoft 365…</span>
              </div>
              <p className="text-xs text-gray-400 max-w-sm text-center">
                First load reads mailboxes for all team members — this takes 2–4 minutes. Results are cached for 2 hours.
              </p>
            </div>
          )}

          {/* Everyone / Managers sub-tabs */}
          {!isEmailHygieneLoading && emailHygieneConfigured && !emailHygieneAuthError && (
            <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setEmailHygieneView('everyone')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${emailHygieneView === 'everyone' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <User size={11} /> Everyone
              </button>
              <button
                onClick={() => setEmailHygieneView('managers')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${emailHygieneView === 'managers' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Users size={11} /> Managers
              </button>
            </div>
          )}

          {/* ── Everyone view ──────────────────────────────────────── */}
          {emailHygieneView === 'everyone' && (<>

          {/* KPI cards */}
          {emailMetrics.length > 0 && (() => {
            const avgScore = Math.round(emailMetrics.reduce((s: number, m: any) => s + m.emailHygieneScore, 0) / emailMetrics.length);
            const validFirstReply = emailMetrics.filter((m: any) => m.avgFirstReplyTimeHours !== null);
            const avgFirstReply: number | null = validFirstReply.length > 0
              ? validFirstReply.reduce((s: number, m: any) => s + m.avgFirstReplyTimeHours, 0) / validFirstReply.length
              : null;
            const fleetSla = Math.round(emailMetrics.reduce((s: number, m: any) => s + m.slaHitRate, 0) / emailMetrics.length);
            const avgOneReply = Math.round(emailMetrics.reduce((s: number, m: any) => s + m.oneReplyResolutionRate, 0) / emailMetrics.length);
            const sc = emailScoreColor(avgScore);
            const slaSc = fleetSla >= 70 ? 'text-green-700' : fleetSla >= 40 ? 'text-yellow-700' : 'text-red-700';
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`${sc.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-bold ${sc.text}`}>{avgScore}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Fleet Email Hygiene Score</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-white">
                  <div className="text-2xl font-bold text-blue-700">{fmtHours(avgFirstReply)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Avg First Reply Time</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-white">
                  <div className={`text-2xl font-bold ${slaSc}`}>{fleetSla}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Fleet SLA Hit Rate (≤4h)</div>
                </div>
                <div className="bg-teal-50 rounded-xl p-4 border border-white">
                  <div className="text-2xl font-bold text-teal-700">{avgOneReply}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Avg One-Reply Resolution</div>
                </div>
              </div>
            );
          })()}

          {/* Period note */}
          {emailHygienePeriodStart && (
            <p className="text-xs text-gray-400">
              Period: {emailHygienePeriodStart.slice(0, 10)} → {emailHygienePeriodEnd.slice(0, 10)}.
              {' '}Last synced: {emailHygieneComputedAt ? format(new Date(emailHygieneComputedAt), 'MMM d, yyyy HH:mm') : '—'}
            </p>
          )}

          {/* Weekly trend */}
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
              <TrendingUp size={14} className="text-indigo-600" /> Weekly Trend — Email Hygiene
              <span className="text-xs font-normal text-gray-400">this month, Mon–Sun</span>
            </div>
            <WeeklyTrendChart
              weeks={emailWeeklyTrend}
              scoreFn={(metrics) => metrics.length ? Math.round(metrics.reduce((s: number, m: any) => s + m.emailHygieneScore, 0) / metrics.length) : null}
              color="#0d9488"
            />
          </Card>

          {/* Email table */}
          {emailMetrics.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 whitespace-nowrap">Team Member</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Threads</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-blue-600 whitespace-nowrap">Speed<span className="font-normal text-blue-400">/30</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-purple-600 whitespace-nowrap">Quality<span className="font-normal text-purple-400">/30</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-teal-600 whitespace-nowrap">Resolution<span className="font-normal text-teal-400">/20</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-orange-600 whitespace-nowrap">Tone<span className="font-normal text-orange-400">/20</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-800 whitespace-nowrap">Hygiene<span className="font-normal text-gray-400">/100</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Best / Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailMetrics.map((m: any, i: number) => {
                      const sc = emailScoreColor(m.emailHygieneScore);
                      const isBwExpanded = expandedEmailBestWorstUser === m.userEmail;
                      return (
                        <Fragment key={m.userEmail}>
                        <tr className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-indigo-50/20 transition-colors`}>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-medium text-gray-800">{m.userName}</div>
                            <div className="text-xs text-gray-400">{m.userEmail}</div>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600">{m.uniqueCustomerThreads}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              (m.speedScore ?? 0) >= 21 ? 'bg-blue-100 text-blue-700' :
                              (m.speedScore ?? 0) >= 12 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.speedScore ?? 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              (m.qualityScore ?? 0) >= 21 ? 'bg-purple-100 text-purple-700' :
                              (m.qualityScore ?? 0) >= 12 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.qualityScore ?? 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              (m.resolutionScore ?? 0) >= 14 ? 'bg-teal-100 text-teal-700' :
                              (m.resolutionScore ?? 0) >= 8  ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.resolutionScore ?? 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              (m.toneScore ?? 0) >= 14 ? 'bg-orange-100 text-orange-700' :
                              (m.toneScore ?? 0) >= 8  ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.toneScore ?? 0}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                              {m.emailHygieneScore ?? 0}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => setExpandedEmailBestWorstUser(isBwExpanded ? null : m.userEmail)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                              View {isBwExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </td>
                        </tr>
                        {isBwExpanded && (
                          <tr className="bg-indigo-50/30 border-b border-gray-100">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="text-[11px] font-semibold text-gray-500 mb-2">
                                Best &amp; worst real example per metric — {m.userName}, this week
                              </div>
                              <EmailBestWorstPanel bestWorst={m.bestWorst} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> ≥80 Good</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> 60–79 Fair</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &lt;60 Needs Attention</span>
                <span className="ml-auto text-gray-400">Speed /30 + Quality /30 + Resolution /20 + Tone /20 = Hygiene /100</span>
              </div>
            </Card>
          )}

          {/* Improvement Insights */}
          {emailMetrics.some((m: any) => m.insights?.length > 0) && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Improvement Insights</h3>
                <span className="text-xs text-gray-400">Showing areas below threshold — actual email samples with suggested rewrites</span>
              </div>
              <div className="space-y-4">
                {emailMetrics
                  .filter((m: any) => m.insights?.length > 0)
                  .map((m: any) => (
                    <div key={m.userEmail} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
                      <div className="font-medium text-gray-800 text-sm mb-2">{m.userName}</div>
                      <div className="space-y-3">
                        {m.insights.map((ins: any, idx: number) => {
                          const catColors: Record<string, string> = {
                            speed: 'bg-blue-100 text-blue-700',
                            quality: 'bg-purple-100 text-purple-700',
                            tone: 'bg-orange-100 text-orange-700',
                            resolution: 'bg-teal-100 text-teal-700',
                          };
                          const maxLabel = ins.maxScore === 20 ? '/20' : '/10';
                          return (
                            <div key={idx} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${catColors[ins.category] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {ins.category.charAt(0).toUpperCase() + ins.category.slice(1)}
                                </span>
                                <span className="text-xs font-medium text-gray-700">{ins.metric}</span>
                                <span className="text-xs text-red-600 font-semibold ml-auto">{ins.score}{maxLabel}</span>
                              </div>
                              <div className="p-3 space-y-2">
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From actual email</div>
                                  <div className="text-xs text-gray-700 bg-red-50 border border-red-100 rounded p-2 italic leading-relaxed whitespace-pre-wrap">{ins.originalLine}</div>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggested improvement</div>
                                  <div className="text-xs text-gray-800 bg-green-50 border border-green-100 rounded p-2 leading-relaxed whitespace-pre-wrap">{ins.improvedLine}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}
          </>)}

          {/* ── Managers view ────────────────────────────────────────── */}
          {emailHygieneView === 'managers' && (<>
            {emailTeamHygiene.length > 0 && (() => {
              const ent = emailSegmentHeads.ENT;
              const smb = emailSegmentHeads.SMB;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`${ent?.score != null ? emailScoreColor(ent.score).bg : 'bg-gray-100'} rounded-xl p-4 border border-white flex items-center gap-3`}>
                    <Building2 size={22} className={ent?.score != null ? emailScoreColor(ent.score).text : 'text-gray-400'} />
                    <div>
                      <div className={`text-2xl font-bold ${ent?.score != null ? emailScoreColor(ent.score).text : 'text-gray-400'}`}>{ent?.score ?? '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{ent?.name ?? 'Unassigned'} — ENT ({ent?.teamIds?.join(', ')})</div>
                    </div>
                  </div>
                  <div className={`${smb?.score != null ? emailScoreColor(smb.score).bg : 'bg-gray-100'} rounded-xl p-4 border border-white flex items-center gap-3`}>
                    <Building2 size={22} className={smb?.score != null ? emailScoreColor(smb.score).text : 'text-gray-400'} />
                    <div>
                      <div className={`text-2xl font-bold ${smb?.score != null ? emailScoreColor(smb.score).text : 'text-gray-400'}`}>{smb?.score ?? '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{smb?.name ?? 'Unassigned'} — SMB ({smb?.teamIds?.join(', ')})</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {emailTeamHygiene.length > 0 && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 whitespace-nowrap">Manager</th>
                        <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Segment</th>
                        <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Members Scored</th>
                        <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-800 whitespace-nowrap">Team Hygiene<span className="font-normal text-gray-400">/100</span></th>
                        <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Members</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailTeamHygiene.map((t: any, i: number) => {
                        const isExpanded = expandedTeamId === t.teamId;
                        const sc = t.teamScore !== null ? emailScoreColor(t.teamScore) : { bg: 'bg-gray-100', text: 'text-gray-400', ring: 'ring-gray-200' };
                        return (
                          <Fragment key={t.teamId}>
                            <tr className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-indigo-50/20 transition-colors`}>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="font-medium text-gray-800">{t.managerName}</div>
                                <div className="text-xs text-gray-400">{t.managerEmail}</div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${t.segment === 'ENT' ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
                                  {t.segment}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center text-gray-600">{t.scoredMemberCount}/{t.memberCount}</td>
                              <td className="py-3 px-3 text-center">
                                <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                                  {t.teamScore ?? '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => setExpandedTeamId(isExpanded ? null : t.teamId)}
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                  {t.memberCount} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-indigo-50/30 border-b border-gray-100">
                                <td colSpan={5} className="px-3 py-3">
                                  <div className="space-y-1.5">
                                    {t.members.map((mem: any) => (
                                      <div key={mem.email} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-gray-800 truncate">{mem.name}{mem.email.toLowerCase() === t.managerEmail.toLowerCase() ? ' (Manager)' : ''}</div>
                                          <div className="text-[10px] text-gray-400">{mem.email}</div>
                                        </div>
                                        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${mem.score !== null ? emailScoreColor(mem.score).bg : 'bg-gray-100'} ${mem.score !== null ? emailScoreColor(mem.score).text : 'text-gray-400'}`}>
                                          {mem.score ?? 'no score yet'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> ≥80 Good</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> 60–79 Fair</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &lt;60 Needs Attention</span>
                  <span className="ml-auto text-gray-400">Team score = average of each member's individual Hygiene score</span>
                </div>
              </Card>
            )}
          </>)}
        </>)}

        {/* ── Call Hygiene Tab ────────────────────────────────────── */}
        {hygieneTab === 'call' && (<>
          {/* Not available for this role — Quality is HR-adjacent content, ADMIN + PROJECT_MANAGER only */}
          {!canSeeCallHygiene && (
            <Card>
              <div className="py-12 text-center space-y-2">
                <Phone size={32} className="mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">Call Hygiene isn't available for your role</p>
                <p className="text-sm text-gray-400 max-w-md mx-auto">Contact an admin if you believe you should have access.</p>
              </div>
            </Card>
          )}

          {/* Credentials missing */}
          {canSeeCallHygiene && !isCallHygieneLoading && !callHygieneConfigured && !callHygieneAuthError && (
            <Card>
              <div className="py-12 text-center space-y-3">
                <Phone size={32} className="mx-auto text-gray-300" />
                <p className="font-semibold text-gray-600">Microsoft Graph API not configured</p>
                <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
                  Add <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_TENANT_ID</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_ID</code>, and{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_SECRET</code> to{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">backend/.env</code>.
                  The Azure AD app needs <strong>Calendars.Read</strong> and <strong>User.Read.All</strong> application permissions with admin consent.
                </p>
              </div>
            </Card>
          )}

          {/* Credentials present but Graph API authentication / permission failed */}
          {canSeeCallHygiene && !isCallHygieneLoading && callHygieneConfigured && callHygieneAuthError && (
            <Card>
              <div className="py-12 text-center space-y-3">
                <AlertCircle size={32} className="mx-auto text-red-400" />
                <p className="font-semibold text-gray-700">Microsoft Graph API — calendar access failed</p>
                <p className="text-sm text-gray-500 max-w-xl mx-auto font-mono bg-red-50 border border-red-100 rounded p-3 text-left break-all">
                  {callHygieneAuthError}
                </p>
                <div className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed space-y-1">
                  <p>Common causes:</p>
                  <ul className="text-left list-disc list-inside space-y-1">
                    <li><strong>Calendars.Read</strong> application permission needs admin consent — go to Azure Portal → App registrations → API permissions → Add permission → Calendars.Read (Application) → Grant admin consent</li>
                    <li>The client secret in <code className="bg-gray-100 px-1 rounded font-mono text-xs">backend/.env</code> has expired — generate a new one in Azure Portal → App registrations → Certificates &amp; secrets</li>
                    <li>Wrong <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_TENANT_ID</code> or <code className="bg-gray-100 px-1 rounded font-mono text-xs">MS_GRAPH_CLIENT_ID</code></li>
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Loading */}
          {canSeeCallHygiene && isCallHygieneLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex items-center gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <span className="text-gray-600 text-sm font-medium">Fetching calendar events from Microsoft 365…</span>
              </div>
              <p className="text-xs text-gray-400 max-w-sm text-center">
                First load reads calendars for all team members — this takes 2–4 minutes. Results are cached for 25 hours.
              </p>
            </div>
          )}

          {/* KPI cards */}
          {callMetrics.length > 0 && (() => {
            const scored = callMetrics.filter((m: any) => m.qualityScore !== null && m.qualityScore !== undefined);
            const avgScore = scored.length > 0
              ? Math.round(scored.reduce((s: number, m: any) => s + m.qualityScore, 0) / scored.length)
              : null;
            const totalCalls = callMetrics.reduce((s: number, m: any) => s + m.totalCustomerCalls, 0);
            const avgCallsPerWeek = Math.round((callMetrics.reduce((s: number, m: any) => s + m.callsPerWeek, 0) / callMetrics.length) * 10) / 10;
            const avgCancelRate = Math.round(callMetrics.reduce((s: number, m: any) => s + m.cancelledRate, 0) / callMetrics.length);
            const sc = callScoreColor(avgScore);
            const cancelSc = avgCancelRate <= 10 ? 'text-green-700' : avgCancelRate <= 25 ? 'text-yellow-700' : 'text-red-700';
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`${sc.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-bold ${sc.text}`}>{avgScore ?? '—'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Fleet Call Hygiene Score
                    {scored.length < callMetrics.length && (
                      <span className="block text-[10px] text-gray-400">{scored.length}/{callMetrics.length} scored</span>
                    )}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-white">
                  <div className="text-2xl font-bold text-blue-700">{totalCalls}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total Customer Calls (this week)</div>
                </div>
                <div className="bg-teal-50 rounded-xl p-4 border border-white">
                  <div className="text-2xl font-bold text-teal-700">{avgCallsPerWeek}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Avg Calls / Week</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-white">
                  <div className={`text-2xl font-bold ${cancelSc}`}>{avgCancelRate}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Avg Cancelled Rate</div>
                </div>
              </div>
            );
          })()}

          {/* Period note */}
          {callHygienePeriodStart && (
            <p className="text-xs text-gray-400">
              Period: {callHygienePeriodStart.slice(0, 10)} → {callHygienePeriodEnd.slice(0, 10)}.
              {' '}Last synced: {callHygieneComputedAt ? format(new Date(callHygieneComputedAt), 'MMM d, yyyy HH:mm') : '—'}
            </p>
          )}

          {/* Weekly trend */}
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
              <TrendingUp size={14} className="text-indigo-600" /> Weekly Trend — Call Hygiene
              <span className="text-xs font-normal text-gray-400">this month, Mon–Sun</span>
            </div>
            <WeeklyTrendChart
              weeks={callWeeklyTrend}
              scoreFn={(metrics) => {
                const scored = metrics.filter((m: any) => m.qualityScore !== null && m.qualityScore !== undefined);
                return scored.length ? Math.round(scored.reduce((s: number, m: any) => s + m.qualityScore, 0) / scored.length) : null;
              }}
              color="#7c3aed"
            />
            {callWeeklyTrend.some((w: any) => w.coverageNote) && (
              <p className="text-[10px] text-gray-400 mt-2">
                {callWeeklyTrend.filter((w: any) => w.coverageNote).map((w: any, i: number) => (
                  <span key={i} className="block">Wk of {new Date(w.weekStart).toLocaleDateString()}: {w.coverageNote}</span>
                ))}
              </p>
            )}
          </Card>

          {/* Team-wide best/worst — ADMIN only, across every graded call for everyone */}
          {isAdmin && orgBestWorst && (orgBestWorst.best || orgBestWorst.worst) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {orgBestWorst.best && (
                <div className="border border-green-200 bg-green-50 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">
                    Team&apos;s best answer · {orgBestWorst.best.score}/100 · {orgBestWorst.best.userName}
                  </div>
                  <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{orgBestWorst.best.answer}&rdquo;</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate">
                    {orgBestWorst.best.subject}{orgBestWorst.best.meetingStart ? ` · ${new Date(orgBestWorst.best.meetingStart).toLocaleDateString()}` : ''}
                  </div>
                </div>
              )}
              {orgBestWorst.worst && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">
                    Team needs coaching most · {orgBestWorst.worst.score}/100 · {orgBestWorst.worst.userName}
                  </div>
                  <div className="text-xs text-gray-700 italic line-clamp-2">&ldquo;{orgBestWorst.worst.answer}&rdquo;</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate">
                    {orgBestWorst.worst.subject}{orgBestWorst.worst.meetingStart ? ` · ${new Date(orgBestWorst.worst.meetingStart).toLocaleDateString()}` : ''}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Call table */}
          {callMetrics.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-700 whitespace-nowrap">Team Member</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Calls (this wk)<span className="block font-normal text-gray-400 text-[10px]">PM / Customer sched.</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Customers</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Last Call</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-800 whitespace-nowrap">Hygiene<span className="font-normal text-gray-400">/100</span><span className="block font-normal text-gray-400 text-[10px]">% questions answered well</span></th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callMetrics.map((m: any, i: number) => {
                      const sc = callScoreColor(m.qualityScore ?? null);
                      const coverage = m.qualityCoverage ?? { graded: 0, noQuestion: 0, excluded: 0, pending: 0, total: 0 };
                      const isExpanded = expandedCallUser === m.userEmail;
                      const gradableCalls = (m.calls ?? []) as Array<{
                        eventId: string; subject: string; start: string;
                        organizerEmail: string; organizerName: string; joinUrl: string | null;
                        customerAttendees: Array<{ name: string; email: string }>;
                      }>;
                      return (
                      <Fragment key={m.userEmail}>
                        <tr className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-indigo-50/20 transition-colors`}>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-medium text-gray-800">{m.userName}</div>
                            <div className="text-xs text-gray-400">{m.userEmail}</div>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600">
                            <div className="font-semibold text-gray-800">{m.totalCustomerCalls}</div>
                            <div className="text-[10px] text-gray-400">{m.internallyScheduled ?? 0} / {m.externallyScheduled ?? 0}</div>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600">{m.uniqueCustomers}</td>
                          <td className="py-3 px-3 text-center text-gray-600">
                            {m.daysSinceLastCustomerCall == null ? (
                              <span className="text-red-500 font-medium">Never</span>
                            ) : (
                              `${m.daysSinceLastCustomerCall}d ago`
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                              {m.qualityScore ?? '—'}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {coverage.total === 0 ? 'no gradable calls' : `${coverage.graded}/${coverage.total} graded`}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {gradableCalls.length > 0 ? (
                              <button
                                onClick={() => setExpandedCallUser(isExpanded ? null : m.userEmail)}
                                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                              >
                                {gradableCalls.length} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && gradableCalls.length > 0 && (
                          <tr className="bg-indigo-50/30 border-b border-gray-100">
                            <td colSpan={6} className="px-3 py-3">
                              <CallBestWorstPanel userEmail={m.userEmail} enabled={isExpanded} />
                              <div className="text-[11px] font-semibold text-gray-500 mb-2">
                                Customer calls this week — pick one to grade this person's answers against the transcript
                              </div>
                              <div className="space-y-1.5">
                                {gradableCalls.map(call => (
                                  <div key={call.eventId} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-medium text-gray-800 truncate">{call.subject || '(no subject)'}</div>
                                      <div className="text-[10px] text-gray-400">
                                        {new Date(call.start).toLocaleString()} · {call.customerAttendees.map(a => a.name || a.email).join(', ') || 'unknown attendees'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => setRatingModalCall({
                                        eventId: call.eventId,
                                        subject: call.subject,
                                        meetingStart: call.start,
                                        organizerEmail: call.organizerEmail,
                                        joinUrl: call.joinUrl || '',
                                        internalUserEmail: m.userEmail,
                                        internalUserName: m.userName,
                                        customerAttendees: call.customerAttendees,
                                      })}
                                      disabled={!call.joinUrl}
                                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
                                    >
                                      <MessageSquare size={11} /> Rate
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> ≥80 Good</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> 60–79 Fair</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &lt;60 Needs Attention</span>
                <span className="ml-auto text-gray-400">Hygiene = % of graded customer questions answered well (transcript-graded, not calendar attendance)</span>
              </div>
            </Card>
          )}
        </>)}
      </div>

      {showScheduleModal && (
        <ScorecardModal title="Schedule Hygiene Scorecard Send" onClose={() => setShowScheduleModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Send at</label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Participants {scheduleRecipients.size > 0 && <span className="text-gray-400">({scheduleRecipients.size} selected)</span>}
              </label>
              <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
                {scorecardCandidates.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Loading users…</p>
                ) : (
                  scorecardCandidates.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={scheduleRecipients.has(u.email)}
                        onChange={() => toggleScheduleRecipient(u.email)}
                        className="rounded border-gray-300"
                      />
                      <span className="font-medium text-gray-800">{u.name}</span>
                      <span className="text-xs text-gray-400">{u.email}</span>
                      <span className="ml-auto text-xs text-gray-400">{u.role}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {scheduleFormError && (
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {scheduleFormError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSchedule}
                disabled={scheduleSubmitting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {scheduleSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                {scheduleSubmitting ? 'Scheduling…' : 'Schedule Send'}
              </button>
            </div>
          </div>
        </ScorecardModal>
      )}

      {ratingModalCall && (
        <ScorecardModal title={`Rate: ${ratingModalCall.internalUserName}`} onClose={closeRatingModal}>
          <div className="space-y-4">
            <div className="text-xs text-gray-500">
              <div className="font-medium text-gray-700">{ratingModalCall.subject || '(no subject)'}</div>
              {ratingModalCall.meetingStart && <div>{new Date(ratingModalCall.meetingStart).toLocaleString()}</div>}
            </div>

            {isCachedCallRatingLoading && !activeCallRating ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" /> Checking for an existing rating…
              </div>
            ) : rateCallMutation.isPending ? (
              <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-8">
                <Loader2 size={20} className="animate-spin" />
                Fetching transcript and grading with AI — this can take up to a minute…
              </div>
            ) : rateCallMutation.isError ? (
              <div className="text-sm text-red-600 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{(rateCallMutation.error as any)?.response?.data?.error?.message || (rateCallMutation.error as any)?.message || 'Grading failed.'}</span>
              </div>
            ) : activeCallRating ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const sc = callScoreColor(activeCallRating.overallScore ?? 0);
                    return (
                      <span className={`inline-block text-lg font-bold px-3 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                        {activeCallRating.overallScore ?? 0}/100
                      </span>
                    );
                  })()}
                  <p className="text-xs text-gray-500 flex-1">{activeCallRating.summary}</p>
                </div>
                {activeCallRating.qaPairs?.length > 0 ? (() => {
                  const pairs = activeCallRating.qaPairs as any[];
                  let bestIdx = 0, worstIdx = 0;
                  pairs.forEach((qa, idx) => {
                    if (qa.score > pairs[bestIdx].score) bestIdx = idx;
                    if (qa.score < pairs[worstIdx].score) worstIdx = idx;
                  });
                  const showSplit = pairs.length > 1 && bestIdx !== worstIdx;
                  return (
                    <div className="space-y-3">
                      {showSplit && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="border border-green-200 bg-green-50 rounded-lg p-2.5">
                            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Best answer · {pairs[bestIdx].score}/100</div>
                            <div className="text-xs text-gray-700 italic line-clamp-3">&ldquo;{pairs[bestIdx].answer}&rdquo;</div>
                          </div>
                          <div className="border border-red-200 bg-red-50 rounded-lg p-2.5">
                            <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Needs work · {pairs[worstIdx].score}/100</div>
                            <div className="text-xs text-gray-700 italic line-clamp-3">&ldquo;{pairs[worstIdx].answer}&rdquo;</div>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {pairs.map((qa, idx) => {
                          const isBest = showSplit && idx === bestIdx;
                          const isWorst = showSplit && idx === worstIdx;
                          return (
                            <div
                              key={idx}
                              className={`border rounded-lg p-3 text-xs space-y-1 ${
                                isBest ? 'border-green-200 bg-green-50/40' : isWorst ? 'border-red-200 bg-red-50/40' : 'border-gray-100'
                              }`}
                            >
                              {(isBest || isWorst) && (
                                <div className={`text-[10px] font-semibold uppercase tracking-wide ${isBest ? 'text-green-700' : 'text-red-700'}`}>
                                  {isBest ? 'Best answer' : 'Needs work'}
                                </div>
                              )}
                              <div className="text-gray-400">Q ({qa.askedBy}):</div>
                              <div className="text-gray-700 italic">&ldquo;{qa.question}&rdquo;</div>
                              <div className="text-gray-400 mt-1">A ({qa.answeredBy}):</div>
                              <div className="text-gray-700 italic">&ldquo;{qa.answer}&rdquo;</div>
                              <div className="flex items-center justify-between pt-1">
                                <span className="font-semibold text-gray-800">{qa.score}/100</span>
                                <span className="text-gray-500">{qa.feedback}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-xs text-gray-400">No customer questions answered by this person were found in the transcript.</p>
                )}
                <button
                  onClick={() => rateCallMutation.mutate(ratingModalCall)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Re-grade from transcript
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6">
                <p className="text-xs text-gray-500 text-center">No rating yet for this call. This will fetch the Teams transcript and grade it with AI.</p>
                <button
                  onClick={() => rateCallMutation.mutate(ratingModalCall)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <MessageSquare size={13} /> Grade this call
                </button>
              </div>
            )}
          </div>
        </ScorecardModal>
      )}
    </div>
  );
}
