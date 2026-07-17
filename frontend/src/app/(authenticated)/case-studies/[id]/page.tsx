'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, CheckCircle, AlertCircle, Eye,
  FileDown, Download, ChevronDown, ChevronUp, Bold, Italic, Underline,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link2, Image,
  Table, Undo, Redo,
} from 'lucide-react';
import { exportToPDF, exportToWord } from '@/utils/exportCaseStudy';
import { useExtractKbArticles, useBulkSaveKbArticles } from '@/hooks/useProjects';
import { useCaseStudyTemplate } from '@/hooks/useCaseStudyTemplate';
import { useAuth } from '@/context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function formatRelativeTime(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

// ── Legacy fallback sections (used only if hook returns nothing) ─────────────
const FALLBACK_SECTIONS = [
  {
    id: 'project_snapshot',
    title: 'Project Snapshot',
    description: 'One line per field — the quick facts of the migration',
    placeholder: 'Industry:\nMigration (Source → Target):\nData Volume / Users:\nOutcome in one line:',
    required: true,
    icon: '🔵',
  },
  {
    id: 'challenge',
    title: 'Challenge',
    description: 'Why the customer migrated — 2-3 bullets',
    placeholder: '• Business pain (why migrate):\n• Technical blockers / constraints:\n• Success criteria:',
    required: true,
    icon: '⚠️',
  },
  {
    id: 'solution',
    title: 'Solution & Approach',
    description: 'What CloudFuze did — 4-5 bullets max',
    placeholder: '• Approach (Big Bang / Phased / Hybrid):\n• Workloads migrated:\n• Special handling (permissions, metadata, delta):',
    required: true,
    icon: '💡',
  },
  {
    id: 'issues_resolutions',
    title: 'Issues & Resolutions',
    description: 'One block per issue — each block is a ready-made KB article',
    placeholder: 'Issue 1:\n- Issue / error message:\n- Root cause:\n- Fix / workaround (steps):\n- How to prevent or detect early:',
    required: true,
    icon: '🛠️',
  },
  {
    id: 'results',
    title: 'Results & Metrics',
    description: 'Numbers only — no narrative',
    placeholder: '• Data migrated & success rate:\n• Downtime:\n• Delivered on time? (delay + reason if not):\n• CSAT score:',
    required: true,
    icon: '📊',
  },
  {
    id: 'lessons_kb',
    title: 'Lessons & KB Takeaways',
    description: 'Reusable knowledge for the next similar migration',
    placeholder: '• Do again / avoid next time:\n• Pre-migration checks for similar projects:\n• Reusable steps, settings or scripts:',
    required: true,
    icon: '📖',
  },
  {
    id: 'client_testimonial',
    title: 'Client Testimonial',
    description: 'Optional quote or feedback from the client',
    placeholder: '"[Client quote]"\n\n— Client Name, Title, Company',
    required: false,
    icon: '💬',
  },
];

// ── Rich Text Editor ─────────────────────────────────────────────────────────
// TEMPLATE_SECTIONS is now loaded dynamically from useCaseStudyTemplate hook
function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value || '';
      isInitialized.current = true;
    }
  }, []);

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const countWords = (html: string): number => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
  };

  const wordCount = countWords(value);

  const toolbarBtn = (icon: React.ReactNode, cmd: string, val?: string, title?: string) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); exec(cmd, val); }}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
        {/* Paragraph style */}
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('formatBlock', e.target.value)}
          disabled={disabled}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 mr-1 focus:outline-none"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {toolbarBtn(<Bold size={14} />, 'bold', undefined, 'Bold')}
        {toolbarBtn(<Italic size={14} />, 'italic', undefined, 'Italic')}
        {toolbarBtn(<Underline size={14} />, 'underline', undefined, 'Underline')}
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {toolbarBtn(<List size={14} />, 'insertUnorderedList', undefined, 'Bullet List')}
        {toolbarBtn(<ListOrdered size={14} />, 'insertOrderedList', undefined, 'Numbered List')}
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {toolbarBtn(<AlignLeft size={14} />, 'justifyLeft', undefined, 'Align Left')}
        {toolbarBtn(<AlignCenter size={14} />, 'justifyCenter', undefined, 'Align Center')}
        {toolbarBtn(<AlignRight size={14} />, 'justifyRight', undefined, 'Align Right')}
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            const url = prompt('Enter URL:');
            if (url) exec('createLink', url);
          }}
          title="Link"
          disabled={disabled}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
        >
          <Link2 size={14} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            const url = prompt('Enter image URL:');
            if (url) exec('insertImage', url);
          }}
          title="Image"
          disabled={disabled}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
        >
          <Image size={14} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            exec('insertHTML', '<table border="1" style="border-collapse:collapse;width:100%"><tr><td style="padding:4px 8px">&nbsp;</td><td style="padding:4px 8px">&nbsp;</td></tr><tr><td style="padding:4px 8px">&nbsp;</td><td style="padding:4px 8px">&nbsp;</td></tr></table>');
          }}
          title="Table"
          disabled={disabled}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
        >
          <Table size={14} />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {toolbarBtn(<Undo size={14} />, 'undo', undefined, 'Undo')}
        {toolbarBtn(<Redo size={14} />, 'redo', undefined, 'Redo')}
      </div>

      {/* Editable area */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          className="min-h-[160px] px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none prose prose-sm max-w-none"
          style={{ wordBreak: 'break-word' }}
          data-placeholder={placeholder}
        />
        {!value && (
          <div className="absolute top-3 left-4 text-sm text-gray-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>

      {/* Word count */}
      <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50 flex justify-end">
        <span className="text-xs text-gray-400">{wordCount} words</span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
interface CaseStudy {
  id: string;
  projectId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';
  title: string | null;
  content: string | null;
  publishedAt: string | null;
  createdAt?: string;
  project?: {
    id: string;
    name: string;
    customerName: string;
    projectManager: string;
    accountManager: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string;
    actualEnd: string;
    sourcePlatform: string;
    targetPlatform: string;
    migrationTypes: string | null;
  };
}

type SectionContent = Record<string, string>;

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  PUBLISHED: 'bg-purple-100 text-purple-700 border-purple-200',
};

function getMigrationBadge(types: string | null) {
  if (!types) return null;
  const t = types.toUpperCase();
  if (t.includes('CONTENT')) return { label: 'Content', cls: 'bg-blue-100 text-blue-700' };
  if (t.includes('EMAIL')) return { label: 'Email', cls: 'bg-green-100 text-green-700' };
  if (t.includes('MESSAGING')) return { label: 'Messaging', cls: 'bg-purple-100 text-purple-700' };
  return { label: types, cls: 'bg-gray-100 text-gray-700' };
}

export default function CaseStudyEditorPage() {
  const params = useParams();
  const router = useRouter();
  const caseStudyId = params.id as string;
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  // ── Load template sections from admin-configured template (localStorage) ──
  const { sections: templateSections } = useCaseStudyTemplate();
  // Use template sections if loaded, else fall back to FALLBACK_SECTIONS
  const TEMPLATE_SECTIONS = templateSections.length > 0 ? templateSections : FALLBACK_SECTIONS;

  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [title, setTitle] = useState('');
  const [sectionContent, setSectionContent] = useState<SectionContent>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([TEMPLATE_SECTIONS[0]?.id || 'executive_summary']));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [showKbModal, setShowKbModal] = useState(false);
  const [kbDrafts, setKbDrafts] = useState<any[]>([]);
  const [kbSaved, setKbSaved] = useState(false);
  const extractKb = useExtractKbArticles();
  const bulkSaveKb = useBulkSaveKbArticles();

  const handleExtractKb = async () => {
    setKbSaved(false);
    const result = await extractKb.mutateAsync(caseStudyId);
    const drafts = (result?.data || []).map((d: any, i: number) => ({ ...d, _key: i }));
    setKbDrafts(drafts);
    setShowKbModal(true);
  };

  const handleSaveKbArticles = async () => {
    await bulkSaveKb.mutateAsync({ caseStudyId, articles: kbDrafts });
    setKbSaved(true);
  };

  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(interval);
  }, [lastSaved]);

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
        setTitle(data.data.title || data.data.project?.name || '');
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

  const getCompletion = () => {
    const required = TEMPLATE_SECTIONS.filter((s) => s.required);
    const done = required.filter((s) => {
      const raw = sectionContent[s.id] || '';
      return raw.replace(/<[^>]+>/g, '').trim().length > 0;
    });
    return Math.round((done.length / required.length) * 100);
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateSection = (id: string, html: string) => {
    setSectionContent((prev) => ({ ...prev, [id]: html }));
  };

  const handleSave = async (newStatus?: string) => {
    try {
      setIsSaving(true);
      setSaveError(false);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`${API_URL}/api/case-studies/${caseStudyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title,
          content: JSON.stringify(sectionContent),
          status: newStatus || caseStudy?.status || 'IN_PROGRESS',
          publishedAt: newStatus === 'PUBLISHED' ? new Date().toISOString() : null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCaseStudy(data.data);
        const savedAt = new Date();
        setLastSaved(savedAt);
        setNow(savedAt);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'word') => {
    if (!caseStudy) return;
    setIsExporting(true);
    try {
      const exportData = {
        title,
        projectName: caseStudy.project?.name || '',
        customerName: caseStudy.project?.customerName || '',
        projectManager: caseStudy.project?.projectManager || '',
        accountManager: caseStudy.project?.accountManager,
        sourcePlatform: caseStudy.project?.sourcePlatform,
        targetPlatform: caseStudy.project?.targetPlatform,
        plannedStart: caseStudy.project?.plannedStart ? new Date(caseStudy.project.plannedStart).toLocaleDateString() : undefined,
        plannedEnd: caseStudy.project?.plannedEnd ? new Date(caseStudy.project.plannedEnd).toLocaleDateString() : undefined,
        actualStart: caseStudy.project?.actualStart ? new Date(caseStudy.project.actualStart).toLocaleDateString() : undefined,
        actualEnd: caseStudy.project?.actualEnd ? new Date(caseStudy.project.actualEnd).toLocaleDateString() : undefined,
        sections: TEMPLATE_SECTIONS,
        sectionContent,
      };
      if (format === 'pdf') {
        exportToPDF(exportData);
      } else {
        await exportToWord(exportData);
      }
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

  const completion = getCompletion();
  const isPublished = caseStudy.status === 'PUBLISHED';
  const migrationBadge = getMigrationBadge(caseStudy.project?.migrationTypes || null);
  const createdDate = caseStudy.createdAt ? new Date(caseStudy.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="animate-fadeIn">
      {/* Breadcrumb + Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link href="/case-studies" className="hover:text-primary-600 transition-colors">Case Studies</Link>
          <span>›</span>
          <span className="text-gray-700">{isPublished ? 'View Case Study' : 'Edit Case Study'}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex-shrink-0"
            >
              <ArrowLeft size={16} className="text-gray-600" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 truncate">{title || 'Untitled Case Study'}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[caseStudy.status] || STATUS_BADGE.PENDING}`}>
                  {caseStudy.status.charAt(0) + caseStudy.status.slice(1).toLowerCase().replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {caseStudy.project?.customerName} · Created on {createdDate} by {caseStudy.project?.projectManager}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Last saved indicator */}
            <div className="flex items-center gap-1.5 mr-1">
              {saveError ? (
                <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} />Save failed</span>
              ) : lastSaved ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Last saved {formatRelativeTime(lastSaved, now)}
                </span>
              ) : null}
            </div>

            <Link
              href={`/case-studies/${caseStudyId}/preview`}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Eye size={14} />
              Preview
            </Link>
            <button
              onClick={() => handleExport('pdf')}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              PDF
            </button>
            <button
              onClick={() => handleExport('word')}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Word
            </button>
            {(caseStudy.status === 'COMPLETED' || caseStudy.status === 'PUBLISHED') && (
              <button
                onClick={handleExtractKb}
                disabled={extractKb.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {extractKb.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Extract KB Articles
              </button>
            )}
            {!isPublished && !isViewer && (
              <button
                onClick={() => handleSave()}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Case Study
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Left Sidebar ────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Progress */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Case Study Progress</h3>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${completion}%`,
                    background: completion === 100 ? '#22c55e' : '#3b82f6',
                  }}
                />
              </div>
              <span className="text-sm font-bold text-gray-700">{completion}%</span>
            </div>
            <p className="text-xs text-gray-500">
              {completion === 100 ? 'All required sections completed!' : 'Complete all required sections to publish'}
            </p>
          </div>

          {/* Case Study Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Case Study Details</h3>
            <div className="space-y-2.5 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Customer</span>
                <span className="font-semibold text-gray-900">{caseStudy.project?.customerName || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Project Manager</span>
                <span className="font-semibold text-gray-900">{caseStudy.project?.projectManager || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Source</span>
                <span className="font-semibold text-gray-900">{caseStudy.project?.sourcePlatform || 'N/A'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Target</span>
                <span className="font-semibold text-gray-900">{caseStudy.project?.targetPlatform || 'N/A'}</span>
              </div>
              {migrationBadge && (
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Migration Type</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${migrationBadge.cls}`}>{migrationBadge.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* Template Sections nav */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Template Sections</h3>
            <div className="space-y-1">
              {TEMPLATE_SECTIONS.map((section) => {
                const raw = sectionContent[section.id] || '';
                const hasContent = raw.replace(/<[^>]+>/g, '').trim().length > 0;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      setExpandedSections((prev) => new Set([...prev, section.id]));
                      document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 border-2 ${
                      hasContent
                        ? 'bg-primary-500 border-primary-500'
                        : section.required
                          ? 'bg-transparent border-orange-400'
                          : 'bg-transparent border-gray-300'
                    }`} />
                    <span className={`truncate ${hasContent ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                      {section.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-orange-400 border-2 border-orange-400 inline-block" />
                Required
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full border-2 border-gray-300 inline-block" />
                Optional
              </span>
            </div>
          </div>
        </div>

        {/* ── Main Editor ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Case Study Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a compelling title for this case study"
              disabled={isPublished || isViewer}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
          </div>

          {/* Sections */}
          {TEMPLATE_SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const raw = sectionContent[section.id] || '';
            const hasContent = raw.replace(/<[^>]+>/g, '').trim().length > 0;

            return (
              <div
                key={section.id}
                id={`section-${section.id}`}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base">{section.icon}</span>
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {section.title}
                          {section.required && <span className="text-red-500 ml-1">*</span>}
                        </span>
                        {hasContent && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
                        {section.required && !hasContent && <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">Required</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{section.description}</p>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                    : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                  }
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4">
                    <RichTextEditor
                      value={sectionContent[section.id] || ''}
                      onChange={(html) => updateSection(section.id, html)}
                      placeholder={section.placeholder}
                      disabled={isPublished || isViewer}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Action buttons */}
          {!isPublished && !isViewer && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => handleSave()}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Draft
              </button>
              <button
                onClick={() => handleSave('COMPLETED')}
                disabled={isSaving || completion < 100}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={14} />
                Mark Complete
              </button>
              {completion === 100 && (
                <button
                  onClick={() => handleSave('PUBLISHED')}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <Eye size={14} />
                  Publish
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KB Articles Extract Modal */}
      {showKbModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowKbModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">KB Articles Preview</h2>
                <p className="text-xs text-gray-500 mt-0.5">Review and edit each article before saving to the KB library</p>
              </div>
              <button onClick={() => setShowKbModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {kbDrafts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No issues found in the Issues & Resolutions section.</p>
                  <p className="text-xs mt-1">Add content to that section and try again.</p>
                </div>
              ) : kbDrafts.map((draft, i) => (
                <div key={draft._key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Article {i + 1}</span>
                    <button onClick={() => setKbDrafts((prev) => prev.filter((_, j) => j !== i))}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
                      <input value={draft.title} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, title: e.target.value } : d))}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-red-600 block mb-1">Issue / Error</label>
                        <textarea rows={3} value={draft.issue} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, issue: e.target.value } : d))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-orange-600 block mb-1">Root Cause</label>
                        <textarea rows={3} value={draft.rootCause} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, rootCause: e.target.value } : d))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-green-600 block mb-1">Fix / Workaround</label>
                        <textarea rows={3} value={draft.fix} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, fix: e.target.value } : d))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-blue-600 block mb-1">Prevention</label>
                        <textarea rows={3} value={draft.prevention} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, prevention: e.target.value } : d))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                      <select value={draft.category} onChange={(e) => setKbDrafts((prev) => prev.map((d, j) => j === i ? { ...d, category: e.target.value } : d))}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        {['General','Lessons','Performance','Security','Configuration','Data','Network'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              {kbSaved ? (
                <span className="text-sm text-green-600">✓ {kbDrafts.length} article{kbDrafts.length !== 1 ? 's' : ''} saved to KB library</span>
              ) : (
                <span className="text-xs text-gray-500">{kbDrafts.length} article{kbDrafts.length !== 1 ? 's' : ''} ready to save</span>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setShowKbModal(false)} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                  Close
                </button>
                {!kbSaved && kbDrafts.length > 0 && (
                  <button onClick={handleSaveKbArticles} disabled={bulkSaveKb.isPending}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                    {bulkSaveKb.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                    Save to KB Library
                  </button>
                )}
                {kbSaved && (
                  <a href="/kb-articles" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1.5">
                    View KB Library →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
