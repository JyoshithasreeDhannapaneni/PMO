'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FolderOpen,
  Mail,
  MessageSquare,
  Upload,
  Download,
  Trash2,
  FileText,
  ChevronRight,
  ArrowRight,
  Plus,
  X,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Combination {
  id: string;
  source: string;
  target: string;
  sourceIcon: string;
  targetIcon: string;
  custom?: boolean; // user-created
}

interface UploadedDoc {
  id: string;
  name: string;
  size: string;
  ext: string;
  docType: string;
  uploadedAt: string;
  dataUrl?: string;
}

type SubTab = 'content' | 'messaging' | 'email';

// ─── Static data ──────────────────────────────────────────────────────────────

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode; color: string; bg: string; border: string; activeBtn: string }[] = [
  { id: 'content',   label: 'Content Migration',  icon: <FolderOpen size={18} />,    color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',   activeBtn: 'bg-blue-600 hover:bg-blue-700'   },
  { id: 'messaging', label: 'Message Migration',   icon: <MessageSquare size={18} />, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-300', activeBtn: 'bg-purple-600 hover:bg-purple-700' },
  { id: 'email',     label: 'Email Migration',     icon: <Mail size={18} />,          color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  activeBtn: 'bg-green-600 hover:bg-green-700'  },
];

const DEFAULT_COMBINATIONS: Record<SubTab, Combination[]> = {
  content: [
    { id: 'gdrive-spo',    source: 'Google Drive',      target: 'SharePoint Online',    sourceIcon: '🟡', targetIcon: '🔷' },
    { id: 'gdrive-odb',    source: 'Google Drive',      target: 'OneDrive for Business', sourceIcon: '🟡', targetIcon: '🔵' },
    { id: 'box-spo',       source: 'Box',               target: 'SharePoint Online',    sourceIcon: '📦', targetIcon: '🔷' },
    { id: 'box-odb',       source: 'Box',               target: 'OneDrive for Business', sourceIcon: '📦', targetIcon: '🔵' },
    { id: 'dropbox-spo',   source: 'Dropbox',           target: 'SharePoint Online',    sourceIcon: '💧', targetIcon: '🔷' },
    { id: 'dropbox-odb',   source: 'Dropbox',           target: 'OneDrive for Business', sourceIcon: '💧', targetIcon: '🔵' },
    { id: 'fileserver-spo',source: 'File Servers',      target: 'SharePoint Online',    sourceIcon: '🖥️', targetIcon: '🔷' },
    { id: 'fileserver-odb',source: 'File Servers',      target: 'OneDrive for Business', sourceIcon: '🖥️', targetIcon: '🔵' },
    { id: 'spon-spo',      source: 'On-Prem SharePoint',target: 'SharePoint Online',    sourceIcon: '🔶', targetIcon: '🔷' },
  ],
  messaging: [
    { id: 'slack-teams',   source: 'Slack',             target: 'Microsoft Teams', sourceIcon: '💬', targetIcon: '🟦' },
    { id: 'skype-teams',   source: 'Skype for Business',target: 'Microsoft Teams', sourceIcon: '📞', targetIcon: '🟦' },
    { id: 'webex-teams',   source: 'Cisco Webex',       target: 'Microsoft Teams', sourceIcon: '🔵', targetIcon: '🟦' },
    { id: 'zoom-teams',    source: 'Zoom',              target: 'Microsoft Teams', sourceIcon: '🎥', targetIcon: '🟦' },
    { id: 'hipchat-teams', source: 'HipChat',           target: 'Microsoft Teams', sourceIcon: '💭', targetIcon: '🟦' },
  ],
  email: [
    { id: 'exchange-exo',   source: 'On-Prem Exchange',  target: 'Exchange Online', sourceIcon: '📧', targetIcon: '☁️' },
    { id: 'exchange-m365',  source: 'On-Prem Exchange',  target: 'Microsoft 365',   sourceIcon: '📧', targetIcon: '🟦' },
    { id: 'gworkspace-exo', source: 'Google Workspace',  target: 'Exchange Online', sourceIcon: '🟡', targetIcon: '☁️' },
    { id: 'gworkspace-m365',source: 'Google Workspace',  target: 'Microsoft 365',   sourceIcon: '🟡', targetIcon: '🟦' },
    { id: 'lotusnotes-exo', source: 'Lotus Notes',       target: 'Exchange Online', sourceIcon: '🪷', targetIcon: '☁️' },
    { id: 'lotusnotes-m365',source: 'Lotus Notes',       target: 'Microsoft 365',   sourceIcon: '🪷', targetIcon: '🟦' },
    { id: 'zimbra-exo',     source: 'Zimbra',            target: 'Exchange Online', sourceIcon: '📬', targetIcon: '☁️' },
  ],
};

const DOC_TYPES = [
  { id: 'kickoff',       label: 'Kickoff Deck',        icon: '🚀' },
  { id: 'runbook',       label: 'Runbook',              icon: '📋' },
  { id: 'migration-plan',label: 'Migration Plan',       icon: '🗺️' },
  { id: 'assessment',    label: 'Assessment Report',    icon: '📊' },
  { id: 'signoff',       label: 'Sign-off Document',    icon: '✅' },
  { id: 'comm-plan',     label: 'Communication Plan',   icon: '📢' },
  { id: 'other',         label: 'Other',                icon: '📁' },
];

const COMBOS_KEY = 'templateCombinations';
const DOCS_KEY   = 'templateCombinationDocs';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [activeTab, setActiveTab]         = useState<SubTab>('content');
  const [combinations, setCombinations]   = useState<Record<SubTab, Combination[]>>(DEFAULT_COMBINATIONS);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(null);
  const [docs, setDocs]                   = useState<Record<string, UploadedDoc[]>>({});
  const [selectedDocType, setSelectedDocType] = useState<string>('kickoff');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add-combination modal state
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newSource, setNewSource]       = useState('');
  const [newTarget, setNewTarget]       = useState('');
  const [newSrcIcon, setNewSrcIcon]     = useState('📂');
  const [newTgtIcon, setNewTgtIcon]     = useState('☁️');
  const [addError, setAddError]         = useState('');

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Persistence ─────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const savedCombos = localStorage.getItem(COMBOS_KEY);
      if (savedCombos) setCombinations(JSON.parse(savedCombos));
      const savedDocs = localStorage.getItem(DOCS_KEY);
      if (savedDocs) setDocs(JSON.parse(savedDocs));
    } catch {}
  }, []);

  const persistCombos = (updated: Record<SubTab, Combination[]>) => {
    setCombinations(updated);
    try { localStorage.setItem(COMBOS_KEY, JSON.stringify(updated)); } catch {}
  };

  const persistDocs = (updated: Record<string, UploadedDoc[]>) => {
    setDocs(updated);
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(updated)); } catch {}
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const currentCombos = combinations[activeTab];
  const combo         = currentCombos.find((c) => c.id === selectedCombo) ?? null;
  const comboDocs     = selectedCombo ? (docs[selectedCombo] ?? []) : [];
  const tab           = SUB_TABS.find((t) => t.id === activeTab)!;

  // ── File handling ───────────────────────────────────────────────────────────

  const handleFiles = (files: FileList | null) => {
    if (!files || !selectedCombo) return;
    const comboId = selectedCombo;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const doc: UploadedDoc = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
          ext: f.name.split('.').pop()?.toUpperCase() ?? 'FILE',
          docType: selectedDocType,
          uploadedAt: new Date().toISOString(),
          dataUrl,
        };
        setDocs((prev) => {
          const updated = { ...prev, [comboId]: [...(prev[comboId] ?? []), doc] };
          try { localStorage.setItem(DOCS_KEY, JSON.stringify(updated)); } catch {}
          return updated;
        });
      };
      reader.readAsDataURL(f);
    });
  };

  const downloadDoc = (doc: UploadedDoc) => {
    if (!doc.dataUrl) return;
    const a = document.createElement('a');
    a.href = doc.dataUrl;
    a.download = doc.name;
    a.click();
  };

  const removeDoc = (docId: string) => {
    if (!selectedCombo) return;
    persistDocs({ ...docs, [selectedCombo]: (docs[selectedCombo] ?? []).filter((d) => d.id !== docId) });
  };

  // ── Add combination ─────────────────────────────────────────────────────────

  const handleAddCombination = () => {
    const src = newSource.trim();
    const tgt = newTarget.trim();
    if (!src) { setAddError('Source platform name is required.'); return; }
    if (!tgt) { setAddError('Target platform name is required.'); return; }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newCombo: Combination = {
      id,
      source: src,
      target: tgt,
      sourceIcon: newSrcIcon || '📂',
      targetIcon: newTgtIcon || '☁️',
      custom: true,
    };
    const updated = { ...combinations, [activeTab]: [...combinations[activeTab], newCombo] };
    persistCombos(updated);
    // Auto-select new combination
    setSelectedCombo(id);
    // Reset form
    setNewSource('');
    setNewTarget('');
    setNewSrcIcon('📂');
    setNewTgtIcon('☁️');
    setAddError('');
    setShowAddForm(false);
  };

  // ── Delete combination ──────────────────────────────────────────────────────

  const handleDeleteCombination = (comboId: string) => {
    const updated = { ...combinations, [activeTab]: combinations[activeTab].filter((c) => c.id !== comboId) };
    persistCombos(updated);
    // Remove associated docs
    const updatedDocs = { ...docs };
    delete updatedDocs[comboId];
    persistDocs(updatedDocs);
    if (selectedCombo === comboId) setSelectedCombo(null);
    setConfirmDelete(null);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const docCount  = (comboId: string) => (docs[comboId] ?? []).length;
  const switchTab = (t: SubTab)       => { setActiveTab(t); setSelectedCombo(null); setShowAddForm(false); setConfirmDelete(null); };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadeIn h-full flex flex-col">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Manage migration documents per source-to-destination combination.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200 dark:border-gray-700">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? `${t.color} ${t.bg} ${t.border.replace('border-', 'border-b-')} border-b-2`
                : 'text-gray-500 dark:text-gray-400 border-b-transparent hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Body: two-panel layout */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* ── Left panel: combination list ────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">

          {/* Header row */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Combinations <span className="text-gray-300 font-normal">({currentCombos.length})</span>
            </p>
            <button
              onClick={() => { setShowAddForm((v) => !v); setConfirmDelete(null); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                showAddForm
                  ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  : `text-white ${tab.activeBtn}`
              }`}
            >
              {showAddForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add</>}
            </button>
          </div>

          {/* Add-combination inline form */}
          {showAddForm && (
            <div className={`p-3 rounded-xl border-2 ${tab.border} ${tab.bg} space-y-2`}>
              <p className={`text-xs font-semibold ${tab.color} mb-1`}>New Combination</p>

              {/* Source */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSrcIcon}
                  onChange={(e) => setNewSrcIcon(e.target.value)}
                  maxLength={4}
                  className="w-10 text-center text-lg border border-gray-200 rounded-lg p-1 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                  title="Source emoji"
                />
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => { setNewSource(e.target.value); setAddError(''); }}
                  placeholder="Source platform"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                />
              </div>

              <div className="flex items-center gap-1 px-1">
                <ArrowRight size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400">to</span>
              </div>

              {/* Target */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTgtIcon}
                  onChange={(e) => setNewTgtIcon(e.target.value)}
                  maxLength={4}
                  className="w-10 text-center text-lg border border-gray-200 rounded-lg p-1 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                  title="Target emoji"
                />
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => { setNewTarget(e.target.value); setAddError(''); }}
                  placeholder="Target platform"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                />
              </div>

              {addError && <p className="text-xs text-red-500">{addError}</p>}

              <button
                onClick={handleAddCombination}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${tab.activeBtn}`}
              >
                <Check size={13} /> Add Combination
              </button>
            </div>
          )}

          {/* Combination cards */}
          {currentCombos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <span className="text-3xl mb-2">📭</span>
              <p className="text-xs">No combinations yet.</p>
              <p className="text-xs mt-1">Click <strong>Add</strong> above to create one.</p>
            </div>
          ) : (
            currentCombos.map((c) => {
              const count      = docCount(c.id);
              const isSelected = selectedCombo === c.id;
              const isConfirming = confirmDelete === c.id;

              return (
                <div
                  key={c.id}
                  className={`relative group rounded-xl border transition-all ${
                    isSelected
                      ? `${tab.bg} ${tab.border} border-2 shadow-sm`
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {/* Main clickable area */}
                  <button
                    onClick={() => { setSelectedCombo(c.id); setConfirmDelete(null); }}
                    className="w-full text-left p-3 pr-10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{c.sourceIcon}</span>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold truncate ${isSelected ? tab.color : 'text-gray-700 dark:text-gray-200'}`}>
                            {c.source}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
                            <span className="text-lg flex-shrink-0">{c.targetIcon}</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.target}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                        {count > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isSelected ? `${tab.bg} ${tab.color}` : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            {count}
                          </span>
                        )}
                        <ChevronRight size={13} className={isSelected ? tab.color : 'text-gray-300'} />
                      </div>
                    </div>
                  </button>

                  {/* Delete button — always visible on hover */}
                  {!isConfirming ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(c.id); }}
                      title="Delete combination"
                      className="absolute top-2 right-2 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    /* Confirm delete overlay */
                    <div className="absolute inset-0 bg-red-50 dark:bg-red-900/30 border-2 border-red-300 rounded-xl flex flex-col items-center justify-center gap-2 z-10 p-3">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300 text-center">
                        Delete "{c.source} → {c.target}"?
                      </p>
                      <p className="text-xs text-red-500 text-center">This will also delete all uploaded documents.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-3 py-1 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 text-gray-600 dark:text-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteCombination(c.id)}
                          className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Right panel: documents ───────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!combo ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${tab.bg}`}>
                <span className="text-3xl">{activeTab === 'content' ? '📁' : activeTab === 'messaging' ? '💬' : '📧'}</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Select a combination</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Choose a source → destination pair from the left to manage its documents.
              </p>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className={`mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${tab.activeBtn}`}
                >
                  <Plus size={15} /> Add New Combination
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Combo header */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 ${tab.bg} ${tab.border}`}>
                <span className="text-3xl">{combo.sourceIcon}</span>
                <div>
                  <p className={`font-bold text-base ${tab.color}`}>{combo.source}</p>
                  <p className="text-xs text-gray-500">Source Platform</p>
                </div>
                <ArrowRight size={22} className="text-gray-400 mx-2" />
                <span className="text-3xl">{combo.targetIcon}</span>
                <div>
                  <p className="font-bold text-base text-gray-800 dark:text-white">{combo.target}</p>
                  <p className="text-xs text-gray-500">Target Platform</p>
                </div>
                {combo.custom && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white border border-gray-200 text-gray-500">Custom</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{comboDocs.length}</p>
                    <p className="text-xs text-gray-500">Documents</p>
                  </div>
                  {/* Delete this combination from the right panel too */}
                  <button
                    onClick={() => setConfirmDelete(combo.id)}
                    title="Delete this combination"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Confirm delete (triggered from right panel header) */}
              {confirmDelete === combo.id && (
                <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">Delete this combination?</p>
                    <p className="text-xs text-red-500 mt-0.5">All {comboDocs.length} uploaded document(s) will be permanently removed.</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">Cancel</button>
                    <button onClick={() => handleDeleteCombination(combo.id)} className="px-3 py-1.5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
                  </div>
                </div>
              )}

              {/* Upload bar */}
              <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-200"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt.id} value={dt.id}>{dt.icon} {dt.label}</option>
                  ))}
                </select>
                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors text-white ${tab.activeBtn}`}>
                  <Upload size={15} />
                  Upload Document
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                    onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
                <p className="text-xs text-gray-400 ml-auto hidden sm:block">PDF, Word, Excel, PPT, images</p>
              </div>

              {/* Documents list grouped by type */}
              {comboDocs.length === 0 ? (
                <div className="text-center py-14 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                  <FileText size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No documents yet</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Upload a Kickoff Deck, Runbook, or any other template document above.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {DOC_TYPES.map((dt) => {
                    const files = comboDocs.filter((d) => d.docType === dt.id);
                    if (files.length === 0) return null;
                    return (
                      <div key={dt.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                          <span className="text-base">{dt.icon}</span>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{dt.label}</span>
                          <span className="ml-auto text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium">{files.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {files.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{doc.ext}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{doc.name}</p>
                                <p className="text-xs text-gray-400">{doc.size} · {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => downloadDoc(doc)}
                                  title="Download"
                                  disabled={!doc.dataUrl}
                                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Download size={15} />
                                </button>
                                <button
                                  onClick={() => removeDoc(doc.id)}
                                  title="Remove document"
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty doc-type quick-upload slots */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                {DOC_TYPES.filter((dt) => comboDocs.filter((d) => d.docType === dt.id).length === 0).map((dt) => (
                  <label
                    key={dt.id}
                    onClick={() => setSelectedDocType(dt.id)}
                    className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors group"
                  >
                    <span className="text-2xl">{dt.icon}</span>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-primary-600 text-center">{dt.label}</span>
                    <span className="text-xs text-gray-400 group-hover:text-primary-500 flex items-center gap-1">
                      <Upload size={11} /> Upload
                    </span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                      onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
