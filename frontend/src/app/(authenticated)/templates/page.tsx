'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettings } from '@/context/SettingsContext';
import {
  FolderOpen, Mail, MessageSquare, Upload, Download,
  Trash2, FileText, ChevronRight, ArrowRight, Plus, X, Check, Pencil, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { templateCombinationsApi } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Combination {
  id: string;
  migrationCategory: string;
  sourceName: string;
  targetName: string;
  sourceIcon: string;
  targetIcon: string;
  isCustom: boolean;
}

interface UploadedDoc {
  id: string;
  combinationId: string;
  fileName: string;
  docType: string;
  fileSize: number | null;
  mimeType: string | null;
  filePath: string;
  uploadedBy: string | null;
  createdAt: string;
}

type SubTab = 'content' | 'messaging' | 'email';

interface DocType { id: string; label: string; icon: string; custom?: boolean; }

const SUB_TABS = [
  { id: 'content'   as SubTab, label: 'Content Migration',  icon: <FolderOpen size={18} />,    color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',   activeBtn: 'bg-blue-600 hover:bg-blue-700',   apiCategory: 'Content Migration' },
  { id: 'messaging' as SubTab, label: 'Message Migration',   icon: <MessageSquare size={18} />, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-300', activeBtn: 'bg-purple-600 hover:bg-purple-700', apiCategory: 'Messaging'         },
  { id: 'email'     as SubTab, label: 'Email Migration',     icon: <Mail size={18} />,          color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  activeBtn: 'bg-green-600 hover:bg-green-700',  apiCategory: 'Email'             },
];

const DEFAULT_DOC_TYPES: DocType[] = [
  { id: 'kickoff',        label: 'Kickoff Deck',        icon: '🚀' },
  { id: 'runbook',        label: 'Runbook',              icon: '📋' },
  { id: 'migration-plan', label: 'Migration Plan',       icon: '🗺️' },
  { id: 'assessment',     label: 'Assessment Report',    icon: '📊' },
  { id: 'signoff',        label: 'Sign-off Document',    icon: '✅' },
  { id: 'comm-plan',      label: 'Communication Plan',   icon: '📢' },
  { id: 'other',          label: 'Other',                icon: '📁' },
];

const DOC_TYPES_KEY = 'templateDocTypes';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { settings } = useSettings();

  // Tab
  const [activeTab, setActiveTab] = useState<SubTab>('content');
  const tab = SUB_TABS.find((t) => t.id === activeTab)!;

  // DB combinations (custom ones created via API)
  const [dbCombos, setDbCombos]       = useState<Combination[]>([]);
  const [loadingCombos, setLoadingCombos] = useState(true);

  // Selected combo state
  const [selectedComboId, setSelectedComboId] = useState<string | null>(null); // UI id (may be "settings-xxx")
  const [activeDbId, setActiveDbId]           = useState<string | null>(null); // actual DB UUID
  const [resolvingDbId, setResolvingDbId]     = useState(false);

  // Documents for selected combo
  const [docs, setDocs]             = useState<UploadedDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Doc types (labels only, stored in localStorage)
  const [docTypes, setDocTypes]           = useState<DocType[]>(DEFAULT_DOC_TYPES);
  const [selectedDocType, setSelectedDocType] = useState<string>('kickoff');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add combo form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSource, setNewSource]     = useState('');
  const [newTarget, setNewTarget]     = useState('');
  const [newSrcIcon, setNewSrcIcon]   = useState('📂');
  const [newTgtIcon, setNewTgtIcon]   = useState('☁️');
  const [addError, setAddError]       = useState('');
  const [addingCombo, setAddingCombo] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingCombo, setDeletingCombo] = useState<string | null>(null);

  // Rename doc
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue]     = useState('');

  // Add doc type
  const [showAddDocType, setShowAddDocType]   = useState(false);
  const [newDocTypeLabel, setNewDocTypeLabel] = useState('');
  const [newDocTypeIcon, setNewDocTypeIcon]   = useState('📄');
  const [docTypeError, setDocTypeError]       = useState('');

  // Rename doc type
  const [renamingTypeId, setRenamingTypeId]   = useState<string | null>(null);
  const [renameTypeValue, setRenameTypeValue] = useState('');

  // ── Doc types persistence ─────────────────────────────────────────────────
  useEffect(() => {
    try { const s = localStorage.getItem(DOC_TYPES_KEY); if (s) setDocTypes(JSON.parse(s)); } catch {}
  }, []);
  const persistDocTypes = (v: DocType[]) => { setDocTypes(v); try { localStorage.setItem(DOC_TYPES_KEY, JSON.stringify(v)); } catch {} };

  // ── Load DB combinations ──────────────────────────────────────────────────
  useEffect(() => {
    setLoadingCombos(true);
    templateCombinationsApi.getCombinations()
      .then(setDbCombos)
      .catch(() => setDbCombos([]))
      .finally(() => setLoadingCombos(false));
  }, []);

  // ── Settings-derived combinations ─────────────────────────────────────────
  const settingsCombos = useMemo<Combination[]>(() => {
    const parse = (name: string) => {
      const i = name.indexOf(' - ');
      return i !== -1 ? { source: name.slice(0, i), target: name.slice(i + 3) } : { source: name, target: '' };
    };
    return settings.migrationTypes.filter((t) => t.enabled).map((t) => {
      const { source, target } = parse(t.name);
      const cat = t.category === 'Content Migration' ? 'Content Migration'
                : t.category === 'Messaging'         ? 'Messaging'
                : t.category === 'Email'             ? 'Email' : t.category;
      return { id: `settings-${t.id}`, migrationCategory: cat, sourceName: source, targetName: target, sourceIcon: t.icon, targetIcon: t.icon, isCustom: false };
    });
  }, [settings.migrationTypes]);

  // All combos for the current tab (settings ones first, then custom DB ones)
  const currentCombos = useMemo(() => {
    const cat = tab.apiCategory;
    const fromSettings = settingsCombos.filter((c) => c.migrationCategory === cat);
    // Exclude DB combos that duplicate a settings combo (same name match)
    const settingsKeys = new Set(fromSettings.map((c) => `${c.sourceName}||${c.targetName}`));
    const fromDb = dbCombos.filter((c) => c.migrationCategory === cat && !settingsKeys.has(`${c.sourceName}||${c.targetName}`));
    return [...fromSettings, ...fromDb];
  }, [tab.apiCategory, settingsCombos, dbCombos]);

  const selectedCombo = currentCombos.find((c) => c.id === selectedComboId) ?? null;

  // ── Resolve DB id when combo is selected ─────────────────────────────────
  // For settings combos: find or create a DB record. For custom: use as-is.
  useEffect(() => {
    if (!selectedComboId) { setActiveDbId(null); setDocs([]); return; }

    if (!selectedComboId.startsWith('settings-')) {
      // Custom combo — ID is already the DB UUID
      setActiveDbId(selectedComboId);
      return;
    }

    // Settings combo — need to resolve or create a DB record
    const combo = settingsCombos.find((c) => c.id === selectedComboId);
    if (!combo) { setActiveDbId(null); setDocs([]); return; }

    // Check if a matching DB record already exists
    const existing = dbCombos.find(
      (c) => c.sourceName === combo.sourceName &&
             c.targetName === combo.targetName &&
             c.migrationCategory === combo.migrationCategory
    );
    if (existing) { setActiveDbId(existing.id); return; }

    // Create one (first time this settings combo is selected for upload)
    setResolvingDbId(true);
    templateCombinationsApi.createCombination({
      migrationCategory: combo.migrationCategory,
      sourceName: combo.sourceName,
      targetName: combo.targetName,
      sourceIcon: combo.sourceIcon,
      targetIcon: combo.targetIcon,
    }).then((created) => {
      setDbCombos((prev) => [...prev, created]);
      setActiveDbId(created.id);
    }).catch(() => {
      setActiveDbId(null);
    }).finally(() => setResolvingDbId(false));
  }, [selectedComboId, settingsCombos, dbCombos]);

  // ── Load documents when activeDbId is set ────────────────────────────────
  const fetchDocs = (dbId: string) => {
    setLoadingDocs(true);
    templateCombinationsApi.getDocuments(dbId)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => {
    if (!activeDbId) { setDocs([]); return; }
    fetchDocs(activeDbId);
  }, [activeDbId]);

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || !activeDbId) return;
    setUploadingFile(true);
    for (const f of Array.from(files)) {
      try {
        const fileData = await readFileAsBase64(f);
        await templateCombinationsApi.uploadDocument(activeDbId, {
          fileName: f.name,
          docType: selectedDocType,
          fileData,
          mimeType: f.type,
          fileSize: f.size,
        });
      } catch {
        alert(`Failed to upload ${f.name}. Please try again.`);
      }
    }
    // Re-fetch to get the authoritative list from DB
    fetchDocs(activeDbId);
    setUploadingFile(false);
  };

  const downloadDoc = (docId: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = templateCombinationsApi.getDownloadUrl(docId);
    a.download = fileName;
    a.click();
  };

  const removeDoc = async (docId: string) => {
    if (!activeDbId) return;
    try {
      await templateCombinationsApi.deleteDocument(docId);
      fetchDocs(activeDbId);
    } catch { alert('Failed to delete document.'); }
  };

  const startRename = (doc: UploadedDoc) => { setRenamingDocId(doc.id); setRenameValue(doc.fileName); };
  const commitRename = async () => {
    const name = renameValue.trim();
    if (!name || !renamingDocId || !activeDbId) { setRenamingDocId(null); return; }
    try {
      await templateCombinationsApi.renameDocument(renamingDocId, name);
      fetchDocs(activeDbId);
    } catch { alert('Failed to rename document.'); }
    setRenamingDocId(null);
  };

  // ── Doc type management ───────────────────────────────────────────────────
  const handleAddDocType = () => {
    const label = newDocTypeLabel.trim();
    if (!label) { setDocTypeError('Type name is required.'); return; }
    if (docTypes.some((d) => d.label.toLowerCase() === label.toLowerCase())) { setDocTypeError('Already exists.'); return; }
    const id = `custom-${Date.now()}`;
    persistDocTypes([...docTypes, { id, label, icon: newDocTypeIcon || '📄', custom: true }]);
    setSelectedDocType(id);
    setNewDocTypeLabel(''); setNewDocTypeIcon('📄'); setDocTypeError(''); setShowAddDocType(false);
  };
  const handleDeleteDocType = (id: string) => {
    if (!confirm('Delete this document type?')) return;
    persistDocTypes(docTypes.filter((d) => d.id !== id));
    if (selectedDocType === id) setSelectedDocType(docTypes[0]?.id ?? '');
  };
  const commitRenameDocType = () => {
    const label = renameTypeValue.trim();
    if (!label || !renamingTypeId) { setRenamingTypeId(null); return; }
    persistDocTypes(docTypes.map((d) => d.id === renamingTypeId ? { ...d, label } : d));
    setRenamingTypeId(null);
  };

  // ── Add combination ───────────────────────────────────────────────────────
  const handleAddCombination = async () => {
    const src = newSource.trim(), tgt = newTarget.trim();
    if (!src) { setAddError('Source platform name is required.'); return; }
    if (!tgt) { setAddError('Target platform name is required.'); return; }
    setAddingCombo(true);
    try {
      const created = await templateCombinationsApi.createCombination({
        migrationCategory: tab.apiCategory, sourceName: src, targetName: tgt,
        sourceIcon: newSrcIcon || '📂', targetIcon: newTgtIcon || '☁️',
      });
      setDbCombos((prev) => [...prev, created]);
      setSelectedComboId(created.id);
      setNewSource(''); setNewTarget(''); setNewSrcIcon('📂'); setNewTgtIcon('☁️'); setAddError(''); setShowAddForm(false);
    } catch { setAddError('Failed to create combination. Please try again.'); }
    setAddingCombo(false);
  };

  // ── Delete combination ────────────────────────────────────────────────────
  const handleDeleteCombination = async (id: string) => {
    setDeletingCombo(id);
    try {
      await templateCombinationsApi.deleteCombination(id);
      setDbCombos((prev) => prev.filter((c) => c.id !== id));
      if (selectedComboId === id || activeDbId === id) { setSelectedComboId(null); setActiveDbId(null); setDocs([]); }
    } catch { alert('Failed to delete combination.'); }
    setDeletingCombo(null); setConfirmDelete(null);
  };

  const switchTab = (t: SubTab) => { setActiveTab(t); setSelectedComboId(null); setActiveDbId(null); setDocs([]); setShowAddForm(false); setConfirmDelete(null); };
  const isSettingsCombo = (id: string) => id.startsWith('settings-');

  const fileSizeLabel = (size: number | null) => {
    if (!size) return '';
    return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadeIn h-full flex flex-col">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage migration documents per source-to-destination combination.</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
              activeTab === t.id ? `${t.color} ${t.bg} ${t.border.replace('border-', 'border-b-')} border-b-2` : 'text-gray-500 border-b-transparent hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-5 flex-1 min-h-0">

        {/* ── Left panel ──────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Combinations <span className="text-gray-300 font-normal">({currentCombos.length})</span>
            </p>
            <button onClick={() => { setShowAddForm((v) => !v); setConfirmDelete(null); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${showAddForm ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : `text-white ${tab.activeBtn}`}`}
            >
              {showAddForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add</>}
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className={`p-3 rounded-xl border-2 ${tab.border} ${tab.bg} space-y-2`}>
              <p className={`text-xs font-semibold ${tab.color} mb-1`}>New Combination</p>
              <div className="flex items-center gap-2">
                <input type="text" value={newSrcIcon} onChange={(e) => setNewSrcIcon(e.target.value)} maxLength={4}
                  className="w-10 text-center text-lg border border-gray-200 rounded-lg p-1 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" title="Source emoji" />
                <input type="text" value={newSource} onChange={(e) => { setNewSource(e.target.value); setAddError(''); }} placeholder="Source platform"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" />
              </div>
              <div className="flex items-center gap-1 px-1"><ArrowRight size={14} className="text-gray-400" /><span className="text-xs text-gray-400">to</span></div>
              <div className="flex items-center gap-2">
                <input type="text" value={newTgtIcon} onChange={(e) => setNewTgtIcon(e.target.value)} maxLength={4}
                  className="w-10 text-center text-lg border border-gray-200 rounded-lg p-1 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" title="Target emoji" />
                <input type="text" value={newTarget} onChange={(e) => { setNewTarget(e.target.value); setAddError(''); }} placeholder="Target platform"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" />
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <button onClick={handleAddCombination} disabled={addingCombo}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${tab.activeBtn} disabled:opacity-60`}>
                {addingCombo ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Add Combination
              </button>
            </div>
          )}

          {loadingCombos && <div className="flex justify-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>}
          {!loadingCombos && currentCombos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <span className="text-3xl mb-2">📭</span>
              <p className="text-xs">No combinations yet.</p>
              <p className="text-xs mt-1">Click <strong>Add</strong> above to create one.</p>
            </div>
          )}

          {!loadingCombos && currentCombos.map((c) => {
            const isSelected   = selectedComboId === c.id;
            const isConfirming = confirmDelete === c.id;
            const isDeleting   = deletingCombo === c.id;
            return (
              <div key={c.id} className={`relative group rounded-xl border transition-all ${isSelected ? `${tab.bg} ${tab.border} border-2 shadow-sm` : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                <button onClick={() => { setSelectedComboId(c.id); setConfirmDelete(null); }} className="w-full text-left p-3 pr-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0">{c.sourceIcon}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${isSelected ? tab.color : 'text-gray-700'}`}>{c.sourceName}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
                          <span className="text-lg flex-shrink-0">{c.targetIcon}</span>
                          <p className="text-xs text-gray-500 truncate">{c.targetName}</p>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={13} className={isSelected ? tab.color : 'text-gray-300'} />
                  </div>
                </button>
                {!isSettingsCombo(c.id) && (
                  !isConfirming ? (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(c.id); }} title="Delete"
                      className="absolute top-2 right-2 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <div className="absolute inset-0 bg-red-50 border-2 border-red-300 rounded-xl flex flex-col items-center justify-center gap-2 z-10 p-3">
                      <p className="text-xs font-semibold text-red-700 text-center">Delete "{c.sourceName} → {c.targetName}"?</p>
                      <p className="text-xs text-red-500 text-center">All uploaded documents will be removed.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">Cancel</button>
                        <button onClick={() => handleDeleteCombination(c.id)} disabled={isDeleting}
                          className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                          {isDeleting ? <Loader2 size={12} className="animate-spin inline" /> : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right panel ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selectedCombo ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${tab.bg}`}>
                <span className="text-3xl">{activeTab === 'content' ? '📁' : activeTab === 'messaging' ? '💬' : '📧'}</span>
              </div>
              <p className="text-gray-500 font-medium">Select a combination</p>
              <p className="text-gray-400 text-sm mt-1">Choose a source → destination pair from the left to manage its documents.</p>
              {!showAddForm && (
                <button onClick={() => setShowAddForm(true)} className={`mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white ${tab.activeBtn}`}>
                  <Plus size={15} /> Add New Combination
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Combo header */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 ${tab.bg} ${tab.border}`}>
                <span className="text-3xl">{selectedCombo.sourceIcon}</span>
                <div>
                  <p className={`font-bold text-base ${tab.color}`}>{selectedCombo.sourceName}</p>
                  <p className="text-xs text-gray-500">Source Platform</p>
                </div>
                <ArrowRight size={22} className="text-gray-400 mx-2" />
                <span className="text-3xl">{selectedCombo.targetIcon}</span>
                <div>
                  <p className="font-bold text-base text-gray-800">{selectedCombo.targetName}</p>
                  <p className="text-xs text-gray-500">Target Platform</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-800">{docs.length}</p>
                    <p className="text-xs text-gray-500">Documents</p>
                  </div>
                  {!isSettingsCombo(selectedCombo.id) && (
                    <button onClick={() => setConfirmDelete(selectedCombo.id)} title="Delete this combination"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Confirm delete from right panel */}
              {confirmDelete === selectedCombo.id && (
                <div className="flex items-center justify-between p-4 bg-red-50 border-2 border-red-300 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-red-700">Delete this combination?</p>
                    <p className="text-xs text-red-500 mt-0.5">All {docs.length} uploaded document(s) will be permanently removed.</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg text-gray-600">Cancel</button>
                    <button onClick={() => handleDeleteCombination(selectedCombo.id)} disabled={!!deletingCombo}
                      className="px-3 py-1.5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                      {deletingCombo ? <Loader2 size={14} className="animate-spin inline" /> : 'Delete'}
                    </button>
                  </div>
                </div>
              )}

              {/* Resolving DB id spinner */}
              {resolvingDbId && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Preparing…
                </div>
              )}

              {/* Upload section */}
              {!resolvingDbId && activeDbId && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Doc type header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Type</span>
                    <button onClick={() => { setShowAddDocType((v) => !v); setDocTypeError(''); }}
                      className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-white bg-primary-600 hover:bg-primary-700">
                      {showAddDocType ? <><X size={11} /> Cancel</> : <><Plus size={11} /> Add Type</>}
                    </button>
                  </div>

                  {showAddDocType && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-primary-50">
                      <input type="text" value={newDocTypeIcon} onChange={(e) => setNewDocTypeIcon(e.target.value)} maxLength={4}
                        className="w-10 text-center text-lg border border-gray-300 rounded-lg p-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400" title="Icon" />
                      <input autoFocus type="text" value={newDocTypeLabel}
                        onChange={(e) => { setNewDocTypeLabel(e.target.value); setDocTypeError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddDocType(); if (e.key === 'Escape') setShowAddDocType(false); }}
                        placeholder="Type name, e.g. SOW Document"
                        className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400" />
                      <button onClick={handleAddDocType} className="p-1.5 text-white bg-primary-600 hover:bg-primary-700 rounded-lg" title="Add"><Check size={14} /></button>
                      {docTypeError && <span className="text-xs text-red-500">{docTypeError}</span>}
                    </div>
                  )}

                  {/* Doc type pills */}
                  <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-gray-100">
                    {docTypes.map((dt) => (
                      <div key={dt.id} className={`flex items-center gap-1 rounded-full border text-xs font-medium transition-colors ${selectedDocType === dt.id ? `${tab.border} border-2 ${tab.color} ${tab.bg}` : 'border-gray-200 text-gray-600 bg-gray-50'}`}>
                        {renamingTypeId === dt.id ? (
                          <>
                            <input autoFocus value={renameTypeValue} onChange={(e) => setRenameTypeValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitRenameDocType(); if (e.key === 'Escape') setRenamingTypeId(null); }}
                              className="w-28 text-xs px-2 py-1 rounded-full border border-primary-400 outline-none bg-white text-gray-900" />
                            <button onClick={commitRenameDocType} className="p-0.5 text-green-600"><Check size={11} /></button>
                            <button onClick={() => setRenamingTypeId(null)} className="p-0.5 text-gray-400 pr-1"><X size={11} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setSelectedDocType(dt.id)} className="flex items-center gap-1 pl-2.5 py-1.5">
                              <span>{dt.icon}</span><span>{dt.label}</span>
                            </button>
                            <button onClick={() => { setRenamingTypeId(dt.id); setRenameTypeValue(dt.label); }}
                              className="p-0.5 text-gray-300 hover:text-blue-500" title="Rename type"><Pencil size={10} /></button>
                            {dt.custom && (
                              <button onClick={() => handleDeleteDocType(dt.id)} className="p-0.5 text-gray-300 hover:text-red-500 pr-1.5" title="Delete type"><X size={10} /></button>
                            )}
                            {!dt.custom && <span className="pr-2" />}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Upload button */}
                  <div className="flex items-center gap-3 px-3 py-2">
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer text-white ${tab.activeBtn} ${uploadingFile ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      {uploadingFile ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                      {uploadingFile ? 'Uploading…' : 'Upload Document'}
                      <input ref={fileInputRef} type="file" multiple disabled={uploadingFile} className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
                    </label>
                    <p className="text-xs text-gray-400 ml-auto hidden sm:block">PDF, Word, Excel, PPT, images</p>
                  </div>
                </div>
              )}

              {/* Documents list */}
              {loadingDocs ? (
                <div className="flex justify-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
              ) : docs.length === 0 ? (
                <div className="text-center py-14 bg-white border border-dashed border-gray-300 rounded-xl">
                  <FileText size={36} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">No documents yet</p>
                  <p className="text-gray-400 text-sm mt-1">Upload a Kickoff Deck, Runbook, or any other template document above.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {docTypes.map((dt) => {
                    const files = docs.filter((d) => d.docType === dt.id);
                    if (files.length === 0) return null;
                    return (
                      <div key={dt.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <span className="text-base">{dt.icon}</span>
                          <span className="text-sm font-semibold text-gray-700">{dt.label}</span>
                          <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">{files.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {files.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-gray-500">{doc.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {renamingDocId === doc.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingDocId(null); }}
                                      className="flex-1 text-sm px-2 py-1 border border-primary-400 rounded-lg outline-none focus:ring-1 focus:ring-primary-400 bg-white text-gray-900" />
                                    <button onClick={commitRename} className="p-1 text-green-600 hover:bg-green-50 rounded-lg" title="Save"><Check size={14} /></button>
                                    <button onClick={() => setRenamingDocId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg" title="Cancel"><X size={14} /></button>
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                                )}
                                <p className="text-xs text-gray-400">
                                  {fileSizeLabel(doc.fileSize)}{doc.fileSize ? ' · ' : ''}{format(new Date(doc.createdAt), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startRename(doc)} title="Rename"
                                  className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                                <button onClick={() => downloadDoc(doc.id, doc.fileName)} title="Download"
                                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Download size={15} /></button>
                                <button onClick={() => removeDoc(doc.id)} title="Delete"
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Docs with unknown type (type was deleted) */}
                  {(() => {
                    const knownIds = new Set(docTypes.map((d) => d.id));
                    const unknown = docs.filter((d) => !knownIds.has(d.docType));
                    if (unknown.length === 0) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <span className="text-base">📁</span>
                          <span className="text-sm font-semibold text-gray-700">Other</span>
                          <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">{unknown.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {unknown.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-gray-500">{doc.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                                <p className="text-xs text-gray-400">{fileSizeLabel(doc.fileSize)}{doc.fileSize ? ' · ' : ''}{format(new Date(doc.createdAt), 'MMM d, yyyy')}</p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => downloadDoc(doc.id, doc.fileName)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Download size={15} /></button>
                                <button onClick={() => removeDoc(doc.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
