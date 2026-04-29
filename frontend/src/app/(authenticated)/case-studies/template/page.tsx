'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Eye, Save, RotateCcw, Plus, GripVertical, ChevronDown,
  ChevronUp, Edit2, AlertCircle, Info, CheckCircle,
  Loader2, Trash2, X,
} from 'lucide-react';

// ── Default Template Definition ──────────────────────────────────────────────
const DEFAULT_SECTIONS: TemplateSection[] = [
  {
    id: 'basic_information',
    title: 'Basic Information',
    description: 'Essential details about the case study',
    icon: '🔵',
    iconColor: '#3b82f6',
    required: true,
    fields: ['Project Name', 'Customer Name', 'Industry', 'Migration Type', 'Source Platform', 'Target Platform', 'Project Manager', 'Account Manager', 'Start Date', 'End Date'],
  },
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'Brief overview of the project and outcomes',
    icon: '📄',
    iconColor: '#6366f1',
    required: true,
    fields: ['Summary'],
  },
  {
    id: 'client_background',
    title: 'Client Background',
    description: 'Information about the client and their business',
    icon: '👤',
    iconColor: '#8b5cf6',
    required: true,
    fields: ['Company Overview', 'Industry'],
  },
  {
    id: 'business_challenge',
    title: 'Business Challenge',
    description: 'Problems and challenges faced by the client',
    icon: '⚠️',
    iconColor: '#f59e0b',
    required: true,
    fields: ['Challenge Description', 'Impact', 'Root Cause', 'Previous Attempts'],
  },
  {
    id: 'solution_provided',
    title: 'Solution Provided',
    description: 'Our approach and solution to address the challenges',
    icon: '💡',
    iconColor: '#10b981',
    required: true,
    fields: ['Solution Approach', 'Tools & Technologies', 'Key Strategies', 'Why This Solution'],
  },
  {
    id: 'implementation_process',
    title: 'Implementation Process',
    description: 'Step-by-step implementation and migration process',
    icon: '⚙️',
    iconColor: '#6366f1',
    required: true,
    fields: ['Assessment', 'Planning', 'Migration', 'Validation', 'Go-Live'],
  },
  {
    id: 'key_metrics',
    title: 'Key Metrics',
    description: 'Measurable outcomes and performance indicators',
    icon: '📈',
    iconColor: '#ec4899',
    required: true,
    fields: ['Migration Success Rate', 'Downtime', 'User Adoption', 'Cost Savings', 'Timeline Adherence'],
  },
  {
    id: 'results_benefits',
    title: 'Results & Benefits',
    description: 'Key results achieved and benefits delivered to the client',
    icon: '🏆',
    iconColor: '#0ea5e9',
    required: true,
    fields: ['Improved Collaboration', 'Enhanced Security', 'Cost Savings', 'Increased Efficiency'],
  },
  {
    id: 'lessons_learned',
    title: 'Lessons Learned',
    description: 'Key learnings and recommendations from the project',
    icon: '📖',
    iconColor: '#14b8a6',
    required: true,
    fields: ['What Went Well', 'What Could Be Improved', 'Recommendations'],
  },
  {
    id: 'client_testimonial',
    title: 'Client Testimonial',
    description: 'Quote or feedback from the client',
    icon: '💬',
    iconColor: '#ec4899',
    required: true,
    fields: ['Quote', 'Client Name', 'Client Title'],
  },
  {
    id: 'attachments',
    title: 'Attachments',
    description: 'Supporting documents and files',
    icon: '📎',
    iconColor: '#6366f1',
    required: true,
    fields: ['Files'],
  },
  {
    id: 'internal_notes',
    title: 'Internal Notes',
    description: 'Internal notes (not visible in published version)',
    icon: '🔒',
    iconColor: '#9ca3af',
    required: false,
    fields: ['Notes'],
  },
];

interface TemplateSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  required: boolean;
  fields: string[];
}

// ── Add/Edit Section Modal ───────────────────────────────────────────────────
function SectionModal({
  section,
  onSave,
  onClose,
}: {
  section: TemplateSection | null;
  onSave: (s: TemplateSection) => void;
  onClose: () => void;
}) {
  const isNew = !section;
  const [title, setTitle] = useState(section?.title || '');
  const [description, setDescription] = useState(section?.description || '');
  const [required, setRequired] = useState(section?.required ?? true);
  const [fields, setFields] = useState<string[]>(section?.fields || ['']);
  const [newField, setNewField] = useState('');

  const addField = () => {
    if (newField.trim()) {
      setFields((p) => [...p, newField.trim()]);
      setNewField('');
    }
  };

  const removeField = (i: number) => setFields((p) => p.filter((_, idx) => idx !== i));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: section?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      title: title.trim(),
      description: description.trim(),
      icon: section?.icon || '📄',
      iconColor: section?.iconColor || '#6366f1',
      required,
      fields: fields.filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{isNew ? 'Add Section' : 'Edit Section'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Section Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. Client Background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Brief description of what goes here"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fields</label>
            <div className="space-y-2 mb-2">
              {fields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">{f}</span>
                  <button onClick={() => removeField(i)} className="p-1 text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addField()}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Add a field name..."
              />
              <button
                onClick={addField}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Required Section</span>
            <button
              onClick={() => setRequired((p) => !p)}
              className={`relative w-11 h-6 rounded-full transition-colors ${required ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${required ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {isNew ? 'Add Section' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TemplateManagementPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [showOptional, setShowOptional] = useState(true);
  const [saved, setSaved] = useState(false);
  const [editSection, setEditSection] = useState<TemplateSection | null | 'new'>('new' as any);
  const [showModal, setShowModal] = useState(false);
  const [modalSection, setModalSection] = useState<TemplateSection | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState<Set<string>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Admin guard
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Restricted</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Only administrators can manage case study templates.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.templateSections?.length) {
          setSections(parsed.templateSections);
          return;
        }
      }
    } catch {}
    setSections([...DEFAULT_SECTIONS]);
  }, []);

  const visibleSections = showOptional ? sections : sections.filter((s) => s.required);

  const handleToggleRequired = (id: string) => {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, required: !s.required } : s));
  };

  const handleDeleteSection = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (section?.required) return; // Required sections can't be removed
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = () => {
    try {
      const existing = JSON.parse(localStorage.getItem('pmoSettings') || '{}');
      existing.templateSections = sections;
      // Also keep backward compat: set template.sections
      existing.template = {
        name: 'Case Study Template',
        sections: sections.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          placeholder: s.fields.join('\n'),
          required: s.required,
        })),
      };
      localStorage.setItem('pmoSettings', JSON.stringify(existing));
      // Notify same-tab listeners (useCaseStudyTemplate hook uses storage events)
      window.dispatchEvent(new StorageEvent('storage', { key: 'pmoSettings', newValue: JSON.stringify(existing) }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
  };

  const handleReset = () => {
    if (confirm('Reset to default template? This will discard all custom sections.')) {
      setSections([...DEFAULT_SECTIONS]);
    }
  };

  const openAddModal = () => {
    setModalSection(null);
    setShowModal(true);
  };

  const openEditModal = (s: TemplateSection) => {
    setModalSection(s);
    setShowModal(true);
  };

  const handleModalSave = (s: TemplateSection) => {
    if (modalSection) {
      setSections((prev) => prev.map((x) => x.id === s.id ? s : x));
    } else {
      setSections((prev) => [...prev, s]);
    }
    setShowModal(false);
  };

  // Drag-and-drop handlers
  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(i);
  };
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return;
    const next = [...sections];
    const [removed] = next.splice(dragIdx, 1);
    next.splice(i, 0, removed);
    setSections(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const togglePreview = (id: string) => {
    setPreviewExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="animate-fadeIn">
      {/* Breadcrumb + Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link href="/case-studies" className="hover:text-primary-600 transition-colors">Case Studies</Link>
          <span>›</span>
          <span className="text-gray-700 dark:text-gray-300">Template Management</span>
          <span>›</span>
          <span className="text-gray-700 dark:text-gray-300">Edit Template</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Case Study Template</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Customize the sections and fields for case studies</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle size={13} />Template saved
              </span>
            )}
            <Link
              href="/case-studies"
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Eye size={14} />
              Preview
            </Link>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              <Save size={14} />
              Save Template
            </button>
            <button className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left: Template Builder ───────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Template Builder</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Drag and drop to reorder sections</p>
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              <Plus size={14} />
              Add Section
            </button>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {visibleSections.map((section, i) => {
              const isDragging = dragIdx === i;
              const isDragOver = dragOverIdx === i;
              return (
                <div
                  key={section.id}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-all ${
                    isDragging ? 'opacity-40' : ''
                  } ${isDragOver ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 flex-shrink-0">
                    <GripVertical size={16} />
                  </div>

                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: section.iconColor + '18', color: section.iconColor }}
                  >
                    {section.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{section.title}</p>
                    <p className="text-xs text-gray-400">{section.fields.length} field{section.fields.length !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Required label */}
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Required</span>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggleRequired(section.id)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${section.required ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${section.required ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>

                  {/* More actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(section)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
                    >
                      <Edit2 size={13} />
                    </button>
                    {!section.required && (
                      <button
                        onClick={() => handleDeleteSection(section.id)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-300 dark:text-gray-600 cursor-grab">
                      <GripVertical size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show Optional Toggle */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20">
            <button
              onClick={() => setShowOptional((p) => !p)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Show Optional Sections
              <ChevronDown size={14} className={`transition-transform ${showOptional ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => setShowOptional((p) => !p)}
              className={`relative w-10 h-5 rounded-full transition-colors ${showOptional ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showOptional ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* ── Right: Section Preview ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Section Preview</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This is how the case study will appear</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                <span className="text-orange-500">★</span> Required
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 dark:bg-gray-700 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
                <CheckCircle size={11} className="text-gray-400" /> Optional
              </span>
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                <CheckCircle size={11} className="text-green-500" /> Configured Field
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
            {visibleSections.map((section) => {
              const isExpanded = previewExpanded.has(section.id);
              const shownFields = section.fields.slice(0, 3);
              const extraCount = section.fields.length - 3;

              return (
                <div key={section.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                        style={{ background: section.iconColor + '18', color: section.iconColor }}
                      >
                        {section.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{section.title}</p>
                          {section.required && <span className="text-red-500 text-xs">*</span>}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{section.description}</p>
                        {/* Field tags */}
                        {(isExpanded ? section.fields : shownFields).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(isExpanded ? section.fields : shownFields).map((f) => (
                              <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full border border-gray-200 dark:border-gray-600">
                                {f}
                              </span>
                            ))}
                            {!isExpanded && extraCount > 0 && (
                              <button
                                onClick={() => togglePreview(section.id)}
                                className="text-xs px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-full border border-primary-200 dark:border-primary-800 hover:bg-primary-100"
                              >
                                +{extraCount} more
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(section)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => togglePreview(section.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <span className="text-red-400">*</span>
          Required sections cannot be removed
        </p>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RotateCcw size={13} />
          Reset to Default Template
        </button>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <SectionModal
          section={modalSection}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
