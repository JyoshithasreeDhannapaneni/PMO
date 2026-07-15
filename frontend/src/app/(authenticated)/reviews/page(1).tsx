'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { platformReviewsApi, projectsApi } from '@/services/api';
import {
  Star, Plus, Loader2, X, Trash2, Trophy, CalendarDays,
  ExternalLink, Globe, Quote, Search, Sparkles, Users, UserCircle2, RotateCcw, Download,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  accountManager?: string;
}

interface PlatformReview {
  id: string;
  platform: string;
  projectId: string | null;
  projectName: string;
  projectManager: string | null;
  projectManagerEmail: string | null;
  accountManager: string | null;
  accountManagerEmail: string | null;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewUrl: string | null;
  reviewDate: string;
  segment: 'SMB' | 'ENT' | 'PS' | null;
}

const SEGMENT_LABEL: Record<string, string> = { SMB: 'SMB', ENT: 'Enterprise', PS: 'Professional Services' };
const SEGMENT_STYLE: Record<string, string> = {
  SMB: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ENT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PS: 'bg-violet-50 text-violet-700 border-violet-200',
};

interface ManagerRatingSummary {
  manager: string;
  email: string | null;
  reviewCount: number;
  avgRating: number;
}

const PLATFORM_STYLE: Record<string, string> = {
  Gartner: 'bg-purple-50 text-purple-700 border-purple-200',
  G2: 'bg-orange-50 text-orange-700 border-orange-200',
  Trustpilot: 'bg-green-50 text-green-700 border-green-200',
  TrustRadius: 'bg-blue-50 text-blue-700 border-blue-200',
};
const OTHER_PLATFORM_STYLE = 'bg-gray-50 text-gray-700 border-gray-200';

function platformStyle(platform: string) {
  return PLATFORM_STYLE[platform] || OTHER_PLATFORM_STYLE;
}

function StarRating({
  value,
  onChange,
  size = 16,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const interactive = !!onChange;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          className={interactive ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={size}
            className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 4.5) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 3.5) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (score >= 2.5) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

// Deterministic accent colors for avatar initials, so the same customer
// always reads with the same identity at a glance.
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700',
];

function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreWord(score: number) {
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Good';
  if (score >= 2.5) return 'Average';
  return 'Needs Improvement';
}

function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportReviewsToCSV(reviews: PlatformReview[]) {
  const headers = [
    'Platform', 'Segment', 'Customer/Project', 'Rating', 'Score',
    'Account Manager', 'Account Manager Email', 'Migration Manager', 'Migration Manager Email',
    'Reviewer', 'Review Text', 'Review URL', 'Review Date', 'Linked to Project',
  ];
  const rows = reviews.map((r) => [
    r.platform,
    r.segment ? SEGMENT_LABEL[r.segment] : '',
    r.projectName,
    r.rating,
    scoreWord(r.rating),
    r.accountManager || '',
    r.accountManagerEmail || '',
    r.projectManager || '',
    r.projectManagerEmail || '',
    r.reviewerName || '',
    r.reviewText || '',
    r.reviewUrl || '',
    formatDate(r.reviewDate),
    r.projectId ? 'Yes' : 'No',
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviews-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function summarizeByManager(reviews: PlatformReview[], field: 'accountManager' | 'projectManager'): ManagerRatingSummary[] {
  const emailField = field === 'accountManager' ? 'accountManagerEmail' : 'projectManagerEmail';
  const map = new Map<string, { total: number; count: number; email: string | null }>();
  for (const r of reviews) {
    const manager = r[field];
    if (!manager) continue;
    const entry = map.get(manager) || { total: 0, count: 0, email: r[emailField] };
    entry.total += r.rating;
    entry.count += 1;
    if (!entry.email && r[emailField]) entry.email = r[emailField];
    map.set(manager, entry);
  }
  return Array.from(map.entries())
    .map(([manager, { total, count, email }]) => ({
      manager,
      email,
      reviewCount: count,
      avgRating: Math.round((total / count) * 10) / 10,
    }))
    .sort((a, b) => b.avgRating - a.avgRating);
}

// ── Platform review modal — customizable source platform ────────────────────
function AddPlatformReviewModal({
  platforms,
  defaultPlatform,
  defaultSegment,
  projects,
  onClose,
  onCreated,
}: {
  platforms: string[];
  defaultPlatform: string;
  defaultSegment: 'SMB' | 'ENT' | 'PS';
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [platformChoice, setPlatformChoice] = useState(defaultPlatform || platforms[0] || 'Gartner');
  const [customPlatform, setCustomPlatform] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectManager, setProjectManager] = useState('');
  const [accountManager, setAccountManager] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewUrl, setReviewUrl] = useState('');
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [segment, setSegment] = useState<'' | 'SMB' | 'ENT' | 'PS'>(defaultSegment || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isOther = platformChoice === '__other__';
  const platform = isOther ? customPlatform.trim() : platformChoice;

  // Auto-fill PM/AM when the typed name matches an existing project — still editable afterward.
  useEffect(() => {
    const matched = projects.find((p) => p.name.toLowerCase() === projectName.trim().toLowerCase());
    if (matched) {
      setProjectManager(matched.projectManager || '');
      setAccountManager(matched.accountManager || '');
    }
  }, [projectName, projects]);

  const handleSubmit = async () => {
    if (!platform || !projectName.trim() || rating === 0) {
      setError('Choose a platform, enter the project/customer name, and set a rating.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const matched = projects.find((p) => p.name.toLowerCase() === projectName.trim().toLowerCase());
      const res = await platformReviewsApi.create({
        platform,
        projectName: projectName.trim(),
        projectId: matched?.id,
        projectManager: projectManager.trim() || undefined,
        accountManager: accountManager.trim() || undefined,
        reviewerName: reviewerName.trim() || undefined,
        rating,
        reviewText: reviewText.trim() || undefined,
        reviewUrl: reviewUrl.trim() || undefined,
        reviewDate,
        segment: segment || undefined,
      });
      if (res.success) {
        onCreated();
      } else {
        setError(res.error?.message || 'Failed to save review');
      }
    } catch {
      setError('Failed to save review');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Add {isOther ? '' : platformChoice + ' '}review</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
            <Select
              value={platformChoice}
              onChange={(e) => setPlatformChoice(e.target.value)}
              options={[
                ...platforms.map((p) => ({ value: p, label: p })),
                { value: '__other__', label: 'Other (add a new platform)...' },
              ]}
            />
            {isOther && (
              <Input
                className="mt-2"
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
                placeholder="Platform name, e.g. Capterra"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project / customer name *</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="As it appears on the review — auto-links if it matches a project"
              list="reviews-project-names"
            />
            <datalist id="reviews-project-names">
              {projects.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Migration manager</label>
              <Input value={projectManager} onChange={(e) => setProjectManager(e.target.value)} placeholder="Auto-fills if project matches" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account manager</label>
              <Input value={accountManager} onChange={(e) => setAccountManager(e.target.value)} placeholder="Auto-fills if project matches" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Segment</label>
            <Select
              value={segment}
              onChange={(e) => setSegment(e.target.value as '' | 'SMB' | 'ENT' | 'PS')}
              options={[
                { value: '', label: 'Not specified' },
                { value: 'SMB', label: 'SMB' },
                { value: 'ENT', label: 'Enterprise (ENT)' },
                { value: 'PS', label: 'Professional Services (PS)' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reviewer</label>
              <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review date</label>
              <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Rating *</label>
            <StarRating value={rating} onChange={setRating} size={22} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Review text</label>
            <Textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Paste the review text"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link to original review</label>
            <Input value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save review
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ManagerLeaderboard({
  title,
  summary,
  onFilter,
}: {
  title: string;
  summary: ManagerRatingSummary[];
  onFilter: (manager: string) => void;
}) {
  const top = summary.slice(0, 5);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <Trophy size={14} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {top.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No data yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-4 py-2 text-xs font-semibold text-gray-500 w-8"></th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-500">Manager</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Average Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {top.map((m, i) => (
              <tr key={m.manager} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => onFilter(m.manager)}>
                <td className="px-4 py-2.5 text-xs font-semibold text-gray-400">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColor(m.manager)}`}>
                      {initials(m.manager)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate max-w-[150px]">{m.manager}</p>
                      {m.email && <p className="text-xs text-gray-400 truncate max-w-[150px]">{m.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <StarRating value={m.avgRating} size={12} />
                    <span className="text-sm font-medium text-gray-700">{m.avgRating} / 5</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {summary.length > 5 && (
        <div className="px-4 py-2.5 border-t border-gray-100 text-center">
          <button onClick={() => onFilter('')} className="text-xs text-primary-600 hover:underline">
            View all {summary.length} managers
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  const [platformReviews, setPlatformReviews] = useState<PlatformReview[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['Gartner', 'G2', 'Trustpilot', 'TrustRadius']);
  const [activeTab, setActiveTab] = useState('Gartner');
  const [segmentTab, setSegmentTab] = useState<'SMB' | 'ENT' | 'PS'>('SMB');
  const [managerOptions, setManagerOptions] = useState<{ projectManagers: string[]; accountManagers: string[] }>({ projectManagers: [], accountManagers: [] });
  const [pmFilter, setPmFilter] = useState('');
  const [amFilter, setAmFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [platformSearch, setPlatformSearch] = useState('');
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [deletingPlatformId, setDeletingPlatformId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [allProjectsRes, platformRes, platformsRes, managerOptionsRes] = await Promise.all([
        projectsApi.getAll({ limit: 1000 }),
        platformReviewsApi.getAll(),
        platformReviewsApi.getPlatforms(),
        platformReviewsApi.getManagerOptions(),
      ]);
      if (allProjectsRes.success) {
        setAllProjects((allProjectsRes.data || []).map((p: any) => ({ id: p.id, name: p.name, customerName: p.customerName, projectManager: p.projectManager })));
      }
      if (platformRes.success) setPlatformReviews(platformRes.data);
      if (platformsRes.success) setPlatforms(platformsRes.data);
      if (managerOptionsRes.success) setManagerOptions(managerOptionsRes.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Keep the active tab valid once real platform data loads (e.g. a custom platform).
  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(activeTab)) setActiveTab(platforms[0]);
  }, [platforms]);

  const reviewsForTab = useMemo(
    () => platformReviews.filter((r) => r.platform === activeTab),
    [platformReviews, activeTab]
  );

  const unsegmentedCount = useMemo(() => reviewsForTab.filter((r) => !r.segment).length, [reviewsForTab]);

  const reviewsForSegment = useMemo(
    () => reviewsForTab.filter((r) => r.segment === segmentTab),
    [reviewsForTab, segmentTab]
  );

  const tabAmSummary = useMemo(() => summarizeByManager(reviewsForSegment, 'accountManager'), [reviewsForSegment]);
  const tabPmSummary = useMemo(() => summarizeByManager(reviewsForSegment, 'projectManager'), [reviewsForSegment]);

  const tabAvg = useMemo(() => {
    if (reviewsForSegment.length === 0) return 0;
    return Math.round((reviewsForSegment.reduce((sum, r) => sum + r.rating, 0) / reviewsForSegment.length) * 10) / 10;
  }, [reviewsForSegment]);

  const filteredPlatformReviews = reviewsForSegment.filter((r) => {
    if (pmFilter && r.projectManager !== pmFilter) return false;
    if (amFilter && r.accountManager !== amFilter) return false;
    if (ratingFilter && r.rating < Number(ratingFilter)) return false;
    if (platformSearch && !r.projectName.toLowerCase().includes(platformSearch.toLowerCase())) return false;
    return true;
  });

  const hasActiveFilters = !!(pmFilter || amFilter || ratingFilter || platformSearch);
  const clearFilters = () => {
    setPmFilter(''); setAmFilter(''); setRatingFilter(''); setPlatformSearch('');
  };

  const topPlatformReview = useMemo(() => {
    const withText = reviewsForTab.filter((r) => r.rating >= 4 && r.reviewText);
    if (withText.length === 0) return null;
    return [...withText].sort((a, b) => b.rating - a.rating || new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime())[0];
  }, [reviewsForTab]);

  const handleDeletePlatform = async (id: string) => {
    if (!confirm('Delete this review?')) return;
    setDeletingPlatformId(id);
    try {
      await platformReviewsApi.delete(id);
      await load();
    } finally {
      setDeletingPlatformId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">Client feedback pulled in from review platforms, organized by source</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => exportReviewsToCSV(platformReviews)}
            disabled={platformReviews.length === 0}
            title="Export every review, across all platforms and segments, as one CSV"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            Export All
          </button>
          <Button onClick={() => setShowPlatformModal(true)}>
            <Plus size={16} className="mr-2" />
            Add review
          </Button>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {platforms.map((p) => {
          const count = platformReviews.filter((r) => r.platform === p).length;
          return (
            <button
              key={p}
              onClick={() => { setActiveTab(p); clearFilters(); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === p ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Globe size={14} />
              {p} Review
              {count > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Segment sub-tabs */}
      <div className="flex items-center gap-2 mb-6">
        {(['SMB', 'ENT', 'PS'] as const).map((seg) => {
          const count = reviewsForTab.filter((r) => r.segment === seg).length;
          const active = segmentTab === seg;
          return (
            <button
              key={seg}
              onClick={() => { setSegmentTab(seg); clearFilters(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active ? SEGMENT_STYLE[seg] + ' ring-1 ring-offset-0' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {SEGMENT_LABEL[seg]}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/60' : 'bg-gray-100'}`}>{count}</span>
            </button>
          );
        })}
        {unsegmentedCount > 0 && (
          <span className="text-xs text-amber-600 ml-1">
            {unsegmentedCount} {activeTab} review{unsegmentedCount !== 1 ? 's' : ''} not yet tagged SMB/ENT/PS
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Star size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Average rating</p>
            <p className="text-xl font-bold text-gray-900">{tabAvg || '—'} <span className="text-sm text-gray-400 font-normal">/ 5</span></p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Globe size={18} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total {activeTab} reviews</p>
            <p className="text-xl font-bold text-gray-900">{reviewsForTab.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">By Account Manager</p>
            <p className="text-xl font-bold text-gray-900">{tabAmSummary.length} <span className="text-sm text-gray-400 font-normal">Managers</span></p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <UserCircle2 size={18} className="text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">By Migration Manager</p>
            <p className="text-xl font-bold text-gray-900">{tabPmSummary.length} <span className="text-sm text-gray-400 font-normal">Managers</span></p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={platformSearch}
            onChange={(e) => setPlatformSearch(e.target.value)}
            placeholder="Search by customer or project..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-[11px] text-gray-500 mb-1">Account Manager</label>
          <Select
            value={amFilter}
            onChange={(e) => setAmFilter(e.target.value)}
            options={[{ value: '', label: 'All' }, ...managerOptions.accountManagers.map((m) => ({ value: m, label: m }))]}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-[11px] text-gray-500 mb-1">Migration Manager</label>
          <Select
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            options={[{ value: '', label: 'All' }, ...managerOptions.projectManagers.map((m) => ({ value: m, label: m }))]}
          />
        </div>
        <div className="min-w-[120px]">
          <label className="block text-[11px] text-gray-500 mb-1">Rating</label>
          <Select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            options={[
              { value: '', label: 'All' },
              { value: '4', label: '4+ stars' },
              { value: '3', label: '3+ stars' },
              { value: '2', label: '2+ stars' },
              { value: '1', label: '1+ stars' },
            ]}
          />
        </div>
        <button
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={13} />
          Clear Filters
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filteredPlatformReviews.length} review{filteredPlatformReviews.length !== 1 ? 's' : ''} found</p>

      {/* Spotlight — the strongest recent testimonial, front and center */}
      {topPlatformReview && !hasActiveFilters && (
        <div className="relative rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-6 mb-6 overflow-hidden">
          <div className="absolute top-4 right-5 flex items-center gap-1 text-xs font-medium text-primary-600 bg-white border border-primary-200 rounded-full px-2.5 py-1">
            <Sparkles size={12} />
            Top testimonial
          </div>
          <div className="flex items-start gap-3 max-w-2xl">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColor(topPlatformReview.projectName)}`}>
              {initials(topPlatformReview.projectName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold text-gray-900">{topPlatformReview.projectName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${platformStyle(topPlatformReview.platform)}`}>
                  {topPlatformReview.platform}
                </span>
                <StarRating value={topPlatformReview.rating} size={14} />
              </div>
              <p className="text-base text-gray-800 leading-relaxed italic">"{topPlatformReview.reviewText}"</p>
            </div>
          </div>
        </div>
      )}

      {/* Reviews table */}
      {filteredPlatformReviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center mb-6">
          <Globe className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {reviewsForSegment.length === 0
              ? `No ${SEGMENT_LABEL[segmentTab]} reviews for ${activeTab} yet — add the first one.`
              : 'No reviews match your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Customer / Project</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Rating</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Account Manager</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Migration Manager</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Review Snippet</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Review Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPlatformReviews.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor(r.projectName)}`}>
                          {initials(r.projectName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{r.projectName}</p>
                            {r.segment && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${SEGMENT_STYLE[r.segment]}`}>
                                {SEGMENT_LABEL[r.segment]}
                              </span>
                            )}
                          </div>
                          {!r.projectId ? (
                            <p className="text-xs text-amber-600">Not linked to an internal project</p>
                          ) : (
                            <p className="text-xs text-gray-400">{r.reviewerName || '—'}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StarRating value={r.rating} size={13} />
                      <p className="text-xs font-medium text-gray-600 mt-1">{r.rating} / 5</p>
                      <span className={`inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded border font-medium ${scoreColor(r.rating)}`}>
                        {scoreWord(r.rating)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.accountManager ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColor(r.accountManager)}`}>
                            {initials(r.accountManager)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate max-w-[130px]">{r.accountManager}</p>
                            {r.accountManagerEmail && <p className="text-xs text-gray-400 truncate max-w-[130px]">{r.accountManagerEmail}</p>}
                          </div>
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.projectManager ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColor(r.projectManager)}`}>
                            {initials(r.projectManager)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate max-w-[130px]">{r.projectManager}</p>
                            {r.projectManagerEmail && <p className="text-xs text-gray-400 truncate max-w-[130px]">{r.projectManagerEmail}</p>}
                          </div>
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      {r.reviewText ? (
                        <>
                          <p className="text-sm text-gray-600 italic line-clamp-3">
                            <Quote size={11} className="inline text-gray-300 mr-1 -translate-y-0.5" />
                            {r.reviewText}
                          </p>
                          {r.reviewUrl && (
                            <a href={r.reviewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1 mt-1">
                              View full review <ExternalLink size={10} />
                            </a>
                          )}
                        </>
                      ) : <span className="text-gray-400 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-700 flex items-center gap-1"><CalendarDays size={11} className="text-gray-400" />{formatDate(r.reviewDate)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(r.reviewDate)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.reviewUrl && (
                          <a
                            href={r.reviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600"
                            title="View original review"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeletePlatform(r.id)}
                          disabled={deletingPlatformId === r.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                          title="Delete review"
                        >
                          {deletingPlatformId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dual leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ManagerLeaderboard title={`Top Account Managers — ${activeTab}`} summary={tabAmSummary} onFilter={(m) => setAmFilter(m)} />
        <ManagerLeaderboard title={`Top Migration Managers — ${activeTab}`} summary={tabPmSummary} onFilter={(m) => setPmFilter(m)} />
      </div>

      {showPlatformModal && (
        <AddPlatformReviewModal
          platforms={platforms}
          defaultPlatform={activeTab}
          defaultSegment={segmentTab}
          projects={allProjects}
          onClose={() => setShowPlatformModal(false)}
          onCreated={() => { setShowPlatformModal(false); load(); }}
        />
      )}
    </div>
  );
}
