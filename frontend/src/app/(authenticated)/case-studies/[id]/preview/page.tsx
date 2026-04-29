'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Edit, Download, Loader2, ChevronDown,
  FileText, Users, AlertTriangle, Lightbulb, Settings2,
  BarChart2, BookOpen, MessageSquare,
} from 'lucide-react';
import { exportToPDF, exportToWord } from '@/utils/exportCaseStudy';
import { useCaseStudyTemplate } from '@/hooks/useCaseStudyTemplate';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SECTION_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  executive_summary:     { icon: <FileText size={18} />,    color: '#3b82f6', bg: '#eff6ff' },
  client_background:     { icon: <Users size={18} />,       color: '#8b5cf6', bg: '#f5f3ff' },
  challenge:             { icon: <AlertTriangle size={18} />, color: '#f59e0b', bg: '#fffbeb' },
  solution:              { icon: <Lightbulb size={18} />,   color: '#10b981', bg: '#ecfdf5' },
  implementation_process:{ icon: <Settings2 size={18} />,   color: '#6366f1', bg: '#eef2ff' },
  results_benefits:      { icon: <BarChart2 size={18} />,   color: '#0ea5e9', bg: '#f0f9ff' },
  lessons_learned:       { icon: <BookOpen size={18} />,    color: '#14b8a6', bg: '#f0fdfa' },
  client_testimonial:    { icon: <MessageSquare size={18} />, color: '#ec4899', bg: '#fdf2f8' },
};

const SECTION_LABELS: Record<string, string> = {
  executive_summary:      'Executive Summary',
  client_background:      'Client Background',
  challenge:              'Challenge',
  solution:               'Solution',
  implementation_process: 'Implementation Process',
  results_benefits:       'Results & Benefits',
  lessons_learned:        'Lessons Learned',
  client_testimonial:     'Client Testimonial',
};

const SECTION_ORDER = [
  'executive_summary', 'client_background', 'challenge', 'solution',
  'implementation_process', 'results_benefits', 'lessons_learned', 'client_testimonial',
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  PUBLISHED: 'bg-purple-100 text-purple-700 border-purple-200',
};

// ── Implementation Process Step Timeline ────────────────────────────────────
const DEFAULT_STEPS = ['Assessment', 'Planning', 'Migration', 'Testing', 'Go-Live'];
const STEP_DESC: Record<string, string> = {
  Assessment: 'Analyzed current system and data',
  Planning: 'Defined migration strategy and mapped content',
  Migration: 'Executed secure migration to Microsoft Teams',
  Testing: 'Validated data accuracy and access',
  'Go-Live': 'Successfully migrated and went live',
};
const STEP_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#22c55e', '#10b981'];

function StepTimeline({ html }: { html: string }) {
  const text = html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const steps = lines.length >= 2 ? lines.slice(0, 5) : DEFAULT_STEPS;

  return (
    <div className="flex flex-wrap items-start gap-0 mt-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start">
          <div className="flex flex-col items-center">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: STEP_COLORS[i] || '#6366f1' }}
            >
              {step.charAt(0)}
            </div>
            <p className="text-xs font-semibold text-center mt-1 max-w-[80px]" style={{ color: STEP_COLORS[i] }}>
              {step.length > 12 ? step.slice(0, 10) + '…' : step}
            </p>
            <p className="text-xs text-gray-500 text-center max-w-[80px] leading-tight mt-0.5">
              {STEP_DESC[step] || ''}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center mt-5 mx-1">
              <svg width="32" height="2" viewBox="0 0 32 2">
                <line x1="0" y1="1" x2="32" y2="1" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 2" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Results & Benefits Cards ─────────────────────────────────────────────────
const DEFAULT_BENEFITS = [
  { title: 'Improved Collaboration', desc: 'Teams can now collaborate in real-time with secure access to documents.', color: '#22c55e', icon: '✅' },
  { title: 'Enhanced Security', desc: 'Data is now secure with role-based access and compliance.', color: '#8b5cf6', icon: '🔒' },
  { title: 'Cost Savings', desc: 'Reduced storage and operational costs significantly.', color: '#f59e0b', icon: '💰' },
  { title: 'Increased Efficiency', desc: 'Manual processes eliminated, saving time and effort.', color: '#3b82f6', icon: '✔️' },
];

function BenefitCards({ html }: { html: string }) {
  const text = html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let cards = DEFAULT_BENEFITS;
  if (lines.length >= 2) {
    cards = lines.slice(0, 4).map((l, i) => ({
      title: l,
      desc: lines[i + 4] || '',
      color: DEFAULT_BENEFITS[i]?.color || '#6366f1',
      icon: DEFAULT_BENEFITS[i]?.icon || '✅',
    }));
  }

  return (
    <div className="grid grid-cols-2 gap-3 mt-2">
      {cards.map((card, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: card.color + '20' }}>
            {card.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{card.title}</p>
            {card.desc && <p className="text-xs text-gray-500 mt-0.5 leading-tight">{card.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Generic HTML renderer ─────────────────────────────────────────────────────
function HtmlContent({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose prose-sm max-w-none text-gray-700 ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}

// ── Client Testimonial ────────────────────────────────────────────────────────
function Testimonial({ html }: { html: string }) {
  const text = html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  const lines = text.split('\n').filter(Boolean);
  const quote = lines[0] || '"The migration has transformed the way we work."';
  const author = lines[1] || '';

  return (
    <blockquote className="border-l-4 border-pink-400 pl-5 py-2 mt-2 bg-pink-50 rounded-r-xl">
      <p className="text-base italic text-gray-700">"{quote.replace(/^[""]|[""]$/g, '')}"</p>
      {author && <p className="text-sm font-semibold text-gray-600 mt-2">— {author.replace(/^[–—-]+\s*/, '')}</p>}
    </blockquote>
  );
}

// ── Section renderer ─────────────────────────────────────────────────────────
function SectionContent({ sectionId, html }: { sectionId: string; html: string }) {
  if (!html || html.replace(/<[^>]+>/g, '').trim() === '') {
    return <p className="text-gray-400 italic text-sm mt-2">No content provided for this section.</p>;
  }
  if (sectionId === 'implementation_process') return <StepTimeline html={html} />;
  if (sectionId === 'results_benefits') return <BenefitCards html={html} />;
  if (sectionId === 'client_testimonial') return <Testimonial html={html} />;
  return <HtmlContent html={html} className="mt-2" />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PreviewCaseStudyPage() {
  const params = useParams();
  const router = useRouter();
  const caseStudyId = params.id as string;

  // Load template sections from admin-configured template
  const { sections: templateSections } = useCaseStudyTemplate();

  const [caseStudy, setCaseStudy] = useState<any>(null);
  const [sectionContent, setSectionContent] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchCaseStudy();
  }, [caseStudyId]);

  const fetchCaseStudy = async () => {
    try {
      setIsLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`${API_URL}/api/case-studies/${caseStudyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      if (data.success && data.data) {
        setCaseStudy(data.data);
        if (data.data.content) {
          try {
            setSectionContent(JSON.parse(data.data.content));
          } catch {
            setSectionContent({ executive_summary: data.data.content });
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch case study:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'word') => {
    if (!caseStudy) return;
    setIsExporting(true);
    setShowDownloadMenu(false);
    try {
      const exportData = {
        title: caseStudy.title || caseStudy.project?.name || '',
        projectName: caseStudy.project?.name || '',
        customerName: caseStudy.project?.customerName || '',
        projectManager: caseStudy.project?.projectManager || '',
        accountManager: caseStudy.project?.accountManager,
        sourcePlatform: caseStudy.project?.sourcePlatform,
        targetPlatform: caseStudy.project?.targetPlatform,
        plannedStart: caseStudy.project?.plannedStart ? new Date(caseStudy.project.plannedStart).toLocaleDateString() : undefined,
        plannedEnd: caseStudy.project?.plannedEnd ? new Date(caseStudy.project.plannedEnd).toLocaleDateString() : undefined,
        sections: templateSections.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          placeholder: s.placeholder || '',
          required: true,
        })),
        sectionContent,
      };
      if (format === 'pdf') exportToPDF(exportData);
      else await exportToWord(exportData);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!caseStudy) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Case study not found</p>
        <Link href="/case-studies" className="mt-4 inline-block text-primary-600 hover:underline">Back to Case Studies</Link>
      </div>
    );
  }

  const title = caseStudy.title || caseStudy.project?.name || 'Untitled Case Study';
  const createdDate = caseStudy.createdAt
    ? new Date(caseStudy.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const status = caseStudy.status as string;

  return (
    <div className="animate-fadeIn">
      {/* Breadcrumb + Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
          <Link href="/case-studies" className="hover:text-primary-600 transition-colors">Case Studies</Link>
          <span>›</span>
          <span className="text-gray-700 dark:text-gray-300">Preview Case Study</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 flex-shrink-0"
            >
              <ArrowLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{title}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[status] || STATUS_BADGE.PENDING}`}>
                  {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {caseStudy.project?.customerName} · Created on {createdDate} by {caseStudy.project?.projectManager}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/case-studies/${caseStudyId}`}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Edit size={14} />
              Edit Case Study
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowDownloadMenu((p) => !p)}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download
                <ChevronDown size={14} />
              </button>
              {showDownloadMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[140px]">
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FileText size={14} /> Export as PDF
                  </button>
                  <button
                    onClick={() => handleExport('word')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FileText size={14} /> Export as Word
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview document */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="p-8 max-w-4xl mx-auto">
          {/* Document header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-primary-700 dark:text-primary-400">{caseStudy.project?.customerName || 'Client'}</h2>
              <p className="text-xl font-medium text-gray-600 dark:text-gray-400 mt-1">Case Study</p>
            </div>
            {/* Company logo placeholder */}
            <div className="flex flex-col items-end">
              <div className="w-24 h-12 border border-gray-200 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700">
                <span className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {(caseStudy.project?.customerName || 'CO').slice(0, 4)}
                </span>
              </div>
            </div>
          </div>

          {/* Meta info cards */}
          <div className="grid grid-cols-3 gap-4 mb-8 p-4 border border-gray-100 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Customer</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{caseStudy.project?.customerName || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Project Manager</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{caseStudy.project?.projectManager || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Date</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{createdDate}</p>
              </div>
            </div>
          </div>

          {/* Sections — order & labels come from the configured template */}
          <div className="space-y-8">
            {templateSections.map((section) => {
              const sectionId = section.id;
              const html = sectionContent[sectionId] || '';
              const meta = SECTION_META[sectionId] || { icon: <FileText size={18} />, color: '#6366f1', bg: '#eef2ff' };
              const label = section.title;
              if (!html || html.replace(/<[^>]+>/g, '').trim() === '') return null;

              return (
                <div key={sectionId} className="border-b border-gray-100 dark:border-gray-700 pb-7 last:border-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <h3 className="text-lg font-bold" style={{ color: meta.color }}>{label}</h3>
                  </div>
                  <SectionContent sectionId={sectionId} html={html} />
                </div>
              );
            })}

            {templateSections.every((s) => !sectionContent[s.id] || sectionContent[s.id].replace(/<[^>]+>/g, '').trim() === '') && (
              <div className="text-center py-12">
                <p className="text-gray-400 italic">This case study has no content yet.</p>
                <Link href={`/case-studies/${caseStudyId}`} className="mt-3 inline-block text-primary-600 hover:underline text-sm">
                  Start editing →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
