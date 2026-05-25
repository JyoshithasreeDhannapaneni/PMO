'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useProjects } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import {
  BookOpen, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight,
  FileText, Send, ShieldCheck, RotateCcw, Flag, Loader2, Info, Lock, Unlock,
  ArrowLeft, FolderOpen, User, Calendar, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type MigrationType = 'content' | 'message' | 'email';
type Phase = 'onetime' | 'delta';
type ChecklistStatus = 'not_started' | 'engineer_submitted' | 'pm_verified';

interface ChecklistItem {
  id: string;
  label: string;
}
interface ChecklistSection {
  id: string;
  title: string;
  warning?: string;
  info?: string;
  items: ChecklistItem[];
  hasNotes?: boolean;
}
interface ChecklistRecord {
  id: string;
  projectId: string;
  migrationType: string;
  phase: string;
  checklistData: Record<string, { items: Record<string, boolean>; notes: string }>;
  status: ChecklistStatus;
  submittedBy?: string;
  submittedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  pmNotes?: string;
}

// ── Category mapping ──────────────────────────────────────────────────────────

const CATEGORY_TO_TYPE: Record<string, MigrationType> = {
  'Content Migration': 'content',
  'Messaging':         'message',
  'Email':             'email',
};

// Hardcoded fallback — used when settings DB lacks the category field on migration types
const MESSAGING_CODES = new Set([
  'SLACK_SLACK','CHAT_CHAT','TEAMS_TEAMS','META_CHAT','META_VIVA','META_TEAMS',
  'SLACK_TEAMS','SLACK_CHAT','TEAMS_CHAT','CHAT_TEAMS','CHAT_TEAM','TEAMS_SLACK','CHAT_SLACK',
]);
const EMAIL_CODES = new Set([
  'GMAIL_GMAIL','GMAIL_OUTLOOK','OUTLOOK_OUTLOOK','OUTLOOK_GMAIL',
]);
const MESSAGING_NAMES = new Set([
  'slack - slack','chat - chat','teams - teams','meta - chat','meta - viva','meta - teams',
  'slack - teams','slack - chat','teams - chat','chat - teams','chat - team','teams - slack','chat - slack',
]);
const EMAIL_NAMES = new Set([
  'gmail - gmail','gmail - outlook','outlook - outlook','outlook - gmail',
]);

function inferTypeFromPart(part: string): MigrationType {
  const lower = part.toLowerCase();
  const upper = part.toUpperCase();
  if (MESSAGING_NAMES.has(lower) || MESSAGING_CODES.has(upper)) return 'message';
  if (EMAIL_NAMES.has(lower)     || EMAIL_CODES.has(upper))     return 'email';
  return 'content';
}

// ── Checklist Config ──────────────────────────────────────────────────────────

const CHECKLIST_CONFIG: Record<MigrationType, Record<Phase, ChecklistSection[]>> = {
  content: {
    onetime: [
      {
        id: 'precheck1',
        title: 'Pre-Check 1 — Previous Migration Completion',
        warning: 'The previous workspace migration must be fully completed and workspace status updated before proceeding.',
        items: [
          { id: 'all_files_copied', label: 'All files and folders from source workspace are copied to destination' },
          { id: 'no_stuck_files', label: 'No files stuck in IN_PROGRESS or PENDING state' },
          { id: 'permissions_replicated', label: 'Folder and file level permissions are replicated correctly' },
          { id: 'shared_drives_match', label: 'Shared drives and shared folder access matches source' },
          { id: 'user_group_perms', label: 'User and group permissions validated at destination' },
          { id: 'hyperlinks_updated', label: 'Internal hyperlinks within documents updated to destination URLs' },
          { id: 'broken_links_verified', label: 'Broken link count verified and within acceptable threshold' },
          { id: 'workspace_status_updated', label: 'Workspace status updated in DB' },
        ],
        hasNotes: true,
      },
      {
        id: 'precheck2',
        title: 'Pre-Check 2 — Drive Changes Up To Date',
        warning: 'All Drive Changes must be up to date and monitored daily before the Delta run is initiated.',
        items: [
          { id: 'cursors_moved', label: 'Large cursors moved to file storage (Dev Team — if applicable)' },
          { id: 'daily_change_count', label: 'Daily change count reviewed per workspace pair' },
          { id: 'high_count_flagged', label: 'High change count pairs flagged and investigated' },
          { id: 'no_stalled_pairs', label: 'No stalled IN_PROGRESS pairs confirmed' },
          { id: 'tokens_valid', label: 'Token validity confirmed — refresh tokens not expired' },
        ],
        hasNotes: true,
      },
    ],
    delta: [
      {
        id: 'delta_precheck1',
        title: 'Pre-Check 1 — Delta Migration Completion',
        warning: 'All previous delta (or onetime) migration work must be fully complete before initiating the next Delta run.',
        items: [
          { id: 'prev_delta_complete', label: 'Previous Delta migration confirmed completed' },
          { id: 'data_re_verified', label: 'Data re-verified at destination' },
          { id: 'perms_re_verified', label: 'Permissions re-verified at destination' },
          { id: 'hyperlinks_re_verified', label: 'Hyperlinks re-verified' },
          { id: 'workspace_status_updated', label: 'Workspace status updated in DB' },
        ],
        hasNotes: true,
      },
      {
        id: 'delta_precheck2',
        title: 'Pre-Check 2 — Drive Changes Up To Date',
        items: [
          { id: 'daily_change_count', label: 'Daily change count reviewed per workspace pair' },
          { id: 'high_count_flagged', label: 'High change count pairs flagged and investigated' },
          { id: 'no_stalled_pairs', label: 'No stalled IN_PROGRESS pairs confirmed' },
          { id: 'tokens_valid', label: 'Tokens valid — refresh tokens not expired' },
        ],
        hasNotes: true,
      },
      {
        id: 'server_readiness',
        title: 'Server-wise Delta Readiness',
        items: [
          { id: 'all_servers_precheck1', label: 'Pre-Check 1 confirmed ready for all servers' },
          { id: 'all_servers_precheck2', label: 'Pre-Check 2 confirmed ready for all servers' },
          { id: 'pair_counts_reviewed', label: 'Server pair counts reviewed and documented' },
          { id: 'high_risk_servers', label: 'Servers with high pair counts allocated maximum resources' },
        ],
        hasNotes: true,
      },
      {
        id: 'signoff',
        title: 'Pre-Delta Sign-off',
        warning: 'Do NOT initiate Delta migration without sign-off from both Migration Lead and Dev Lead.',
        items: [
          { id: 'precheck1_all_servers', label: 'Pre-Check 1 completed for all servers (Migration Lead)' },
          { id: 'precheck2_all_servers', label: 'Pre-Check 2 completed for all servers (Migration Lead)' },
          { id: 'readiness_table_updated', label: 'Server-wise readiness table updated (Migration Team)' },
          { id: 'high_risk_reviewed', label: 'High-risk pairs reviewed (Dev Lead)' },
          { id: 'qa_validation_done', label: 'QA validation done for sample pairs (QA Lead)' },
          { id: 'final_approval', label: 'Final approval to initiate Delta received (Project Manager)' },
        ],
        hasNotes: true,
      },
    ],
  },

  message: {
    onetime: [
      {
        id: 'permission_mapping',
        title: 'Permission Mapping',
        warning: 'Permission mapping MUST be confirmed TWICE. Once migration starts, it MUST NOT be changed.',
        items: [
          { id: 'mapping_confirmed_1st', label: 'Permission mapping confirmed with customer (1st confirmation)' },
          { id: 'mapping_confirmed_2nd', label: 'Permission mapping re-confirmed with customer (2nd confirmation)' },
          { id: 'mapping_documented', label: 'Confirmation documented (date, time, customer contact) in ticket' },
        ],
        hasNotes: true,
      },
      {
        id: 'deduplication',
        title: 'Channel & DM Deduplication',
        warning: 'Initiating a channel or DM more than once causes duplication that cannot be easily recovered.',
        items: [
          { id: 'dedup_audit_run', label: 'Deduplication audit run — zero duplicate initiations confirmed' },
          { id: 'dedup_logged', label: 'Deduplication result logged in migration ticket' },
        ],
        hasNotes: true,
      },
      {
        id: 'onetime_completion',
        title: 'One-Time Migration Completion',
        items: [
          { id: 'all_picking_complete', label: 'All workspace picking fully completed' },
          { id: 'all_movement_complete', label: 'All message movement fully completed' },
          { id: 'retryable_conflicts_resolved', label: 'All retryable conflicts resolved' },
          { id: 'nonretryable_documented', label: 'Non-retryable conflicts documented as-is' },
        ],
        hasNotes: true,
      },
    ],
    delta: [
      {
        id: 'delta_prerequisites',
        title: 'Delta Migration Prerequisites',
        warning: 'Do NOT initiate delta if any retryable conflict from one-time remains unresolved.',
        items: [
          { id: 'onetime_picking_complete', label: 'All one-time/pre-delta workspace picking fully completed' },
          { id: 'onetime_movement_complete', label: 'All one-time/pre-delta message movement fully completed' },
          { id: 'all_conflicts_resolved', label: 'All retryable conflicts resolved before delta' },
          { id: 'nonretryable_documented', label: 'Non-retryable conflicts documented' },
        ],
        hasNotes: true,
      },
      {
        id: 'large_workspace',
        title: 'Large Workspace Delta Checks (>50K Channels/DMs)',
        info: 'If workspace has >50K channels/DMs, enable checkDelta at least 3 DAYS before scheduled delta date.',
        items: [
          { id: 'not_applicable', label: 'Not applicable — workspace has ≤50K channels/DMs' },
          { id: 'check_delta_enabled', label: 'checkDelta feature enabled from UI for all applicable channels/DMs (if >50K)' },
          { id: 'check_delta_3days', label: 'checkDelta enabled at least 3 days before scheduled delta date (if >50K)' },
        ],
        hasNotes: true,
      },
      {
        id: 'dedup_reverify',
        title: 'Deduplication Re-Verification',
        warning: 'Do not assume deduplication from one-time is still valid for delta. Re-run the audit.',
        items: [
          { id: 'dedup_re_audited', label: 'Deduplication re-audited before delta' },
          { id: 'zero_duplicate_confirmed', label: 'Zero duplicate channel/DM initiations confirmed' },
          { id: 'audit_logged', label: 'Re-audit result logged in migration ticket' },
        ],
        hasNotes: true,
      },
      {
        id: 'delta_scheduling',
        title: 'Delta Scheduling Notice',
        info: 'Delta migration must be communicated at least ONE WEEK before the scheduled date.',
        items: [
          { id: 'stakeholders_notified', label: 'All stakeholders notified ≥1 week before scheduled delta date' },
          { id: 'acknowledgement_received', label: 'Acknowledgement received from all team leads' },
        ],
        hasNotes: true,
      },
    ],
  },

  email: {
    onetime: [
      {
        id: 'permission_mapping',
        title: 'Permission Mapping',
        warning: 'Permission mapping MUST be confirmed TWICE. Changing mid-migration requires full job restart and customer acknowledgement.',
        items: [
          { id: 'mapping_confirmed_1st', label: 'Permission mapping confirmed with customer (1st confirmation)' },
          { id: 'mapping_confirmed_2nd', label: 'Permission mapping re-confirmed with customer (2nd confirmation)' },
          { id: 'mapping_documented', label: 'Confirmation documented (date, time, customer contact name) in ticket' },
        ],
        hasNotes: true,
      },
      {
        id: 'pair_deduplication',
        title: 'Pair Deduplication',
        warning: 'Duplicate pairs lead to duplicate emails — very difficult to clean up post-migration.',
        items: [
          { id: 'no_duplicate_pairs', label: 'No pair has been initiated more than once — verified' },
          { id: 'dedup_logged', label: 'Deduplication check logged in migration ticket' },
        ],
        hasNotes: true,
      },
      {
        id: 'email_picking',
        title: 'Email Picking Validation',
        info: 'Check EmailPickingQueue + emailFolderInfo before requesting additional Tomcats.',
        items: [
          { id: 'picking_queue_checked', label: 'EmailPickingQueue reviewed before requesting Tomcats' },
          { id: 'folder_info_checked', label: 'emailFolderInfo folder count checked per emailWorkspace' },
          { id: 'all_processed', label: 'emailFolderInfo processStatus = "processed" for ALL entries' },
          { id: 'non_processed_investigated', label: 'Any non-processed statuses investigated and resolved' },
        ],
        hasNotes: true,
      },
      {
        id: 'email_moving',
        title: 'Email Moving Validation',
        items: [
          { id: 'emailinfo_processed', label: 'emailInfo processStatus = processed for all entries' },
          { id: 'retryable_retried', label: 'Retryable conflicts retried and resolved' },
          { id: 'nonretryable_escalated', label: 'Non-retryable conflicts documented and escalated' },
          { id: 'copy_queue_checked', label: 'EmailCopyQueue load checked before adding moving Tomcats' },
        ],
        hasNotes: true,
      },
    ],
    delta: [
      {
        id: 'onetime_complete',
        title: 'One-Time Migration Completion Check',
        warning: 'Do not initiate delta if any emailWorkspace still has pending picking, moving, or attachment work.',
        items: [
          { id: 'all_picking_complete', label: 'ALL picking completed for all emailWorkspaces' },
          { id: 'all_moving_complete', label: 'ALL moving completed for all emailWorkspaces' },
          { id: 'attachments_complete', label: 'ALL attachment processing completed' },
        ],
        hasNotes: true,
      },
      {
        id: 'conflict_clearance',
        title: 'Conflict Clearance',
        warning: 'No unresolved conflicts allowed before delta. All retryable conflicts must be retried and resolved.',
        items: [
          { id: 'folder_info_clear', label: 'emailFolderInfo: no pending/unresolved conflicts' },
          { id: 'email_info_clear', label: 'emailInfo: no pending/unresolved conflicts; retryable vs non-retryable verified' },
          { id: 'attachments_clear', label: 'Attachments: all processed; no unresolved conflicts' },
        ],
        hasNotes: true,
      },
      {
        id: 'calendar_migration',
        title: 'Calendar Migration Verification (if applicable)',
        warning: 'Failing to verify these collections can cause entire calendars to enter conflict state — this is NOT self-healing.',
        items: [
          { id: 'not_applicable', label: 'Not applicable — no calendar migration for this project' },
          { id: 'calendar_details_processed', label: 'CalendarDetails: ALL entries = processed' },
          { id: 'calendar_events_processed', label: 'CalendarEvents: ALL entries = processed' },
          { id: 'calendar_conflicts_raised', label: 'Any non-processed entries raised for investigation immediately' },
        ],
        hasNotes: true,
      },
      {
        id: 'contacts_validation',
        title: 'Contacts Migration Validation',
        items: [
          { id: 'contacts_processed', label: 'All contacts processStatus = processed' },
          { id: 'retryable_retried', label: 'Retryable contact conflicts retried and resolved' },
          { id: 'nonretryable_escalated', label: 'Non-retryable contact conflicts documented and escalated to Dev team' },
        ],
        hasNotes: true,
      },
    ],
  },
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ChecklistStatus, { label: string; color: string; icon: any }> = {
  not_started:        { label: 'Not Started',         color: 'bg-gray-100 text-gray-600',   icon: Clock },
  engineer_submitted: { label: 'Awaiting PM Review',  color: 'bg-amber-100 text-amber-700', icon: Send },
  pm_verified:        { label: 'PM Verified',          color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TYPE_TABS: { id: MigrationType; label: string; activeClass: string; emptyText: string }[] = [
  { id: 'content', label: 'Content Migration', activeClass: 'text-indigo-700 border-indigo-500 bg-indigo-50', emptyText: 'No content migration projects found.' },
  { id: 'message', label: 'Message Migration', activeClass: 'text-purple-700 border-purple-500 bg-purple-50', emptyText: 'No message migration projects found.' },
  { id: 'email',   label: 'Email Migration',   activeClass: 'text-blue-700 border-blue-500 bg-blue-50',   emptyText: 'No email migration projects found.' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MigrationValidationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { data: projectsData } = useProjects({ limit: 500 });

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeType, setActiveType] = useState<MigrationType>('content');
  const [activePhase, setActivePhase] = useState<Phase>('onetime');
  const [checklists, setChecklists] = useState<ChecklistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<Record<string, { items: Record<string, boolean>; notes: string }>>({});
  const [pmNotes, setPmNotes] = useState('');
  const [showPmPanel, setShowPmPanel] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER' || isAdmin;
  const canVerify = isPM;

  const allProjects = ((projectsData as any)?.data || []) as any[];
  const migrationProjects = allProjects.filter((p: any) => !p.projectType || p.projectType === 'MIGRATION');

  // Build name→category and code→category lookups from settings
  // Projects store migration types as names (e.g. "Box - OneDrive"), not codes
  const nameToCategory = new Map<string, MigrationType>();
  const codeToCategory = new Map<string, MigrationType>();
  (settings.migrationTypes || []).forEach((mt: any) => {
    const mapped = CATEGORY_TO_TYPE[mt.category];
    if (mapped) {
      nameToCategory.set(mt.name.toLowerCase(), mapped);
      codeToCategory.set(mt.code.toUpperCase(), mapped);
    }
  });

  // Determine which MigrationType a project belongs to (try name first, then code, then fallback)
  const getProjectType = (project: any): MigrationType | null => {
    if (!project.migrationTypes) return null;
    const parts = project.migrationTypes.split(',').map((c: string) => c.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    for (const part of parts) {
      const byName = nameToCategory.get(part.toLowerCase());
      if (byName) return byName;
      const byCode = codeToCategory.get(part.toUpperCase());
      if (byCode) return byCode;
    }
    // Settings DB lacks category field — use hardcoded fallback on the first part
    return inferTypeFromPart(parts[0]);
  };

  // Projects for the active tab
  const tabProjects = migrationProjects.filter((p: any) => getProjectType(p) === activeType);

  // Selected project object
  const selectedProject = migrationProjects.find((p: any) => p.id === selectedProjectId);

  // Load checklists when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    fetchChecklists();
  }, [selectedProjectId]);

  const fetchChecklists = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setChecklists(json.data);
    } catch {}
    setLoading(false);
  };

  const currentRecord = checklists.find(
    (c) => c.migrationType === activeType && c.phase === activePhase
  );
  const oneTimeRecord = checklists.find((c) => c.migrationType === activeType && c.phase === 'onetime');
  const deltaLocked = oneTimeRecord?.status !== 'pm_verified';

  useEffect(() => {
    if (currentRecord?.checklistData && Object.keys(currentRecord.checklistData).length > 0) {
      setLocalData(currentRecord.checklistData);
    } else {
      const sections = CHECKLIST_CONFIG[activeType][activePhase];
      const empty: typeof localData = {};
      sections.forEach((s) => { empty[s.id] = { items: {}, notes: '' }; });
      setLocalData(empty);
    }
    setPmNotes(currentRecord?.pmNotes || '');
    setShowPmPanel(false);
  }, [currentRecord, activeType, activePhase]);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setChecklists([]);
    setActivePhase('onetime');
  };

  const handleBack = () => {
    setSelectedProjectId('');
    setChecklists([]);
  };

  const toggleItem = (sectionId: string, itemId: string) => {
    if (currentRecord?.status === 'pm_verified') return;
    if (currentRecord?.status === 'engineer_submitted' && !canVerify) return;
    setLocalData((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        items: { ...(prev[sectionId]?.items || {}), [itemId]: !(prev[sectionId]?.items?.[itemId]) },
      },
    }));
  };

  const updateNotes = (sectionId: string, notes: string) => {
    if (currentRecord?.status === 'pm_verified') return;
    setLocalData((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], notes },
    }));
  };

  const handleSave = async () => {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}/${activeType}/${activePhase}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ checklistData: localData }),
      });
      const json = await res.json();
      if (json.success) {
        setChecklists((prev) => {
          const idx = prev.findIndex((c) => c.migrationType === activeType && c.phase === activePhase);
          if (idx >= 0) { const n = [...prev]; n[idx] = json.data; return n; }
          return [...prev, json.data];
        });
        showToast('success', 'Checklist saved');
      } else showToast('error', json.message || 'Save failed');
    } catch { showToast('error', 'Save failed'); }
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}/${activeType}/${activePhase}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ checklistData: localData }),
      });
      const res = await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}/${activeType}/${activePhase}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setChecklists((prev) => {
          const idx = prev.findIndex((c) => c.migrationType === activeType && c.phase === activePhase);
          if (idx >= 0) { const n = [...prev]; n[idx] = json.data; return n; }
          return [...prev, json.data];
        });
        showToast('success', 'Checklist submitted for PM review');
      } else showToast('error', json.message || 'Submit failed');
    } catch { showToast('error', 'Submit failed'); }
    setSaving(false);
  };

  const handleVerify = async (approved: boolean) => {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}/${activeType}/${activePhase}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ approved, pmNotes }),
      });
      const json = await res.json();
      if (json.success) {
        setChecklists((prev) => {
          const idx = prev.findIndex((c) => c.migrationType === activeType && c.phase === activePhase);
          if (idx >= 0) { const n = [...prev]; n[idx] = json.data; return n; }
          return [...prev, json.data];
        });
        showToast(approved ? 'success' : 'info', approved ? 'Checklist approved' : 'Checklist sent back to engineer');
        setShowPmPanel(false);
      } else showToast('error', json.message || 'Verification failed');
    } catch { showToast('error', 'Verification failed'); }
    setSaving(false);
  };

  const handleFinalize = async () => {
    if (!selectedProjectId) return;
    const bothVerified =
      checklists.find((c) => c.migrationType === activeType && c.phase === 'onetime')?.status === 'pm_verified' &&
      checklists.find((c) => c.migrationType === activeType && c.phase === 'delta')?.status === 'pm_verified';
    if (!bothVerified) { showToast('error', 'Both One-Time and Delta phases must be PM-verified first'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/migration-checklists/${selectedProjectId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ migrationType: activeType }),
      });
      const json = await res.json();
      if (json.success) showToast('success', 'Project moved to Final Validation!');
      else showToast('error', json.message || 'Finalize failed');
    } catch { showToast('error', 'Finalize failed'); }
    setSaving(false);
  };

  const calcProgress = (record?: ChecklistRecord, type?: MigrationType, phase?: Phase) => {
    if (!record || !type || !phase) return { checked: 0, total: 0 };
    const sections = CHECKLIST_CONFIG[type][phase];
    let total = 0; let checked = 0;
    sections.forEach((s) => {
      s.items.forEach((item) => {
        total++;
        if (record.checklistData?.[s.id]?.items?.[item.id]) checked++;
      });
    });
    return { checked, total };
  };

  const currentSections = CHECKLIST_CONFIG[activeType][activePhase];
  const isReadOnly = currentRecord?.status === 'pm_verified' ||
    (currentRecord?.status === 'engineer_submitted' && !canVerify);
  const { checked, total } = calcProgress(currentRecord || { checklistData: localData } as any, activeType, activePhase);

  // ── Project card for the list view ──────────────────────────────────────────

  const ProjectCard = ({ project }: { project: any }) => {
    const otRec = checklists.find((c) => c.projectId === project.id && c.phase === 'onetime');
    const deltaRec = checklists.find((c) => c.projectId === project.id && c.phase === 'delta');
    const isSelected = project.id === selectedProjectId;

    // Display the migration type names for this project
    const mtNames = (project.migrationTypes || '')
      .split(',')
      .map((raw: string) => {
        const t = raw.trim();
        const mt = (settings.migrationTypes || []).find(
          (m: any) => m.name.toLowerCase() === t.toLowerCase() || m.code === t.toUpperCase()
        );
        return mt ? mt.name : t;
      })
      .filter(Boolean)
      .join(', ');

    return (
      <button
        onClick={() => handleSelectProject(project.id)}
        className={cn(
          'w-full text-left bg-white rounded-xl border transition-all p-4 hover:shadow-md group',
          isSelected
            ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-sm'
            : 'border-slate-200 hover:border-indigo-300'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
              {project.name}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <User className="w-3 h-3" />{project.customerName}
              </span>
              {project.projectManager && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Layers className="w-3 h-3" />{project.projectManager}
                </span>
              )}
            </div>
            {mtNames && (
              <p className="text-xs text-indigo-600 mt-1 font-medium truncate">{mtNames}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium',
              project.phase === 'COMPLETED' ? 'bg-green-100 text-green-700' :
              project.phase === 'MIGRATION' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-600'
            )}>
              {project.phase}
            </span>
          </div>
        </div>

        {/* Checklist status strip */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          {(['onetime', 'delta'] as Phase[]).map((ph) => {
            const rec = checklists.find((c) => c.projectId === project.id && c.migrationType === activeType && c.phase === ph);
            const st = rec?.status || 'not_started';
            const cfg = STATUS_CONFIG[st as ChecklistStatus];
            return (
              <span key={ph} className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium', cfg.color)}>
                <cfg.icon className="w-3 h-3" />
                {ph === 'onetime' ? 'One-Time' : 'Delta'}: {cfg.label}
              </span>
            );
          })}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Migration Validation</h1>
            <p className="text-xs text-slate-500">Engineers fill checklist · PM verifies · Approved → Final Validation</p>
          </div>
        </div>
      </div>

      {/* Migration type tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-0">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveType(tab.id);
                setActivePhase('onetime');
                setSelectedProjectId('');
                setChecklists([]);
              }}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all',
                activeType === tab.id
                  ? tab.activeClass + ' border-current'
                  : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
              )}
            >
              <FileText className="w-4 h-4" />
              {tab.label}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-0.5',
                activeType === tab.id ? 'bg-current/10 text-current' : 'bg-slate-100 text-slate-500'
              )}>
                {migrationProjects.filter((p: any) => getProjectType(p) === tab.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {!selectedProjectId ? (
        /* ── Project list ── */
        <div className="max-w-5xl mx-auto px-6 py-6">
          {tabProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {TYPE_TABS.find((t) => t.id === activeType)?.emptyText}
              </p>
              <p className="text-xs mt-1">Projects are categorised by their assigned migration type.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4">
                {tabProjects.length} project{tabProjects.length !== 1 ? 's' : ''} — click a project to fill or review its checklist
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tabProjects.map((p: any) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        /* ── Checklist view ── */
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">

          {/* Back + project breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to projects
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-semibold text-slate-700">{selectedProject?.name}</span>
            {selectedProject?.customerName && (
              <span className="text-xs text-slate-500">— {selectedProject.customerName}</span>
            )}
            {selectedProject?.migrationTypes && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                {(() => {
                  const raw = selectedProject.migrationTypes.split(',')[0].trim();
                  const mt = (settings.migrationTypes || []).find(
                    (m: any) => m.name.toLowerCase() === raw.toLowerCase() || m.code === raw.toUpperCase()
                  );
                  return mt ? mt.name : raw;
                })()}
              </span>
            )}
          </div>

          {/* Phase switcher */}
          <div className="flex items-center gap-3">
            {(['onetime', 'delta'] as Phase[]).map((phase) => {
              const rec = checklists.find((c) => c.migrationType === activeType && c.phase === phase);
              const locked = phase === 'delta' && deltaLocked;
              const statusCfg = rec ? STATUS_CONFIG[rec.status] : null;
              return (
                <button
                  key={phase}
                  onClick={() => !locked && setActivePhase(phase)}
                  disabled={locked}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                    activePhase === phase && !locked
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : locked
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  )}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  {phase === 'onetime' ? 'One-Time Migration' : 'Delta Migration'}
                  {statusCfg && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1', statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                  )}
                  {locked && <span className="text-[10px] text-slate-400 ml-1">Requires One-Time PM approval</span>}
                </button>
              );
            })}
          </div>

          {/* Status bar */}
          {currentRecord && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {(() => {
                  const cfg = STATUS_CONFIG[currentRecord.status];
                  const Icon = cfg.icon;
                  return (
                    <>
                      <span className={cn('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', cfg.color)}>
                        <Icon className="w-3.5 h-3.5" /> {cfg.label}
                      </span>
                      {currentRecord.submittedBy && (
                        <span className="text-xs text-slate-500">
                          Submitted by <strong>{currentRecord.submittedBy}</strong>
                          {currentRecord.submittedAt && ` on ${new Date(currentRecord.submittedAt).toLocaleDateString()}`}
                        </span>
                      )}
                      {currentRecord.verifiedBy && (
                        <span className="text-xs text-slate-500">
                          · Verified by <strong>{currentRecord.verifiedBy}</strong>
                          {currentRecord.verifiedAt && ` on ${new Date(currentRecord.verifiedAt).toLocaleDateString()}`}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: total > 0 ? `${(checked / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs text-slate-500">{checked}/{total} items</span>
              </div>
            </div>
          )}

          {/* PM notes (if returned) */}
          {currentRecord?.pmNotes && currentRecord.status === 'not_started' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">Returned by PM — please address the following:</p>
                <p className="text-xs text-amber-700">{currentRecord.pmNotes}</p>
              </div>
            </div>
          )}

          {/* Checklist sections */}
          {currentSections.map((section) => {
            const sectionData = localData[section.id] || { items: {}, notes: '' };
            const sectionChecked = section.items.filter((i) => sectionData.items[i.id]).length;

            return (
              <div key={section.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
                    <span className="text-[10px] text-slate-400">{sectionChecked}/{section.items.length}</span>
                  </div>
                  {sectionChecked === section.items.length && sectionChecked > 0 && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>

                <div className="px-5 py-4 space-y-3">
                  {section.warning && (
                    <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">{section.warning}</p>
                    </div>
                  )}
                  {section.info && (
                    <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800">{section.info}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const isChecked = !!sectionData.items[item.id];
                      return (
                        <label
                          key={item.id}
                          className={cn(
                            'flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer',
                            isChecked
                              ? 'bg-green-50 border-green-200'
                              : 'bg-slate-50 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30',
                            isReadOnly && 'cursor-default opacity-80'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleItem(section.id, item.id)}
                            disabled={isReadOnly}
                            className="mt-0.5 w-4 h-4 rounded accent-indigo-600 flex-shrink-0"
                          />
                          <span className={cn('text-xs leading-relaxed', isChecked ? 'text-green-800 line-through decoration-green-400/60' : 'text-slate-700')}>
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {section.hasNotes && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Notes / Remarks</label>
                      <textarea
                        value={sectionData.notes}
                        onChange={(e) => updateNotes(section.id, e.target.value)}
                        disabled={isReadOnly}
                        rows={2}
                        placeholder="Add any relevant notes, observations, or exceptions..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Action bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-slate-500">
                {currentRecord?.status === 'pm_verified'
                  ? 'This checklist has been verified and locked by the PM.'
                  : currentRecord?.status === 'engineer_submitted'
                  ? canVerify
                    ? 'Review and verify the engineer\'s submission below.'
                    : 'Awaiting PM review. No further changes allowed until reviewed.'
                  : 'Fill out all checklist items, then save and submit for PM review.'}
              </div>

              <div className="flex items-center gap-2">
                {currentRecord?.status !== 'pm_verified' && currentRecord?.status !== 'engineer_submitted' && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save Draft
                  </button>
                )}

                {(currentRecord?.status === 'not_started' || !currentRecord) && (
                  <button
                    onClick={handleSubmit}
                    disabled={saving || checked === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Submit for PM Review
                  </button>
                )}

                {currentRecord?.status === 'engineer_submitted' && canVerify && (
                  <button
                    onClick={() => setShowPmPanel((v) => !v)}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    PM Review
                  </button>
                )}
              </div>
            </div>

            {showPmPanel && currentRecord?.status === 'engineer_submitted' && canVerify && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-semibold text-slate-700">PM Verification</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">PM Notes (optional)</label>
                  <textarea
                    value={pmNotes}
                    onChange={(e) => setPmNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes, observations, or reason for rejection..."
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(true)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve & Verify
                  </button>
                  <button
                    onClick={() => handleVerify(false)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Return to Engineer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Final Validation button */}
          {canVerify && (() => {
            const otVerified = checklists.find((c) => c.migrationType === activeType && c.phase === 'onetime')?.status === 'pm_verified';
            const deltaVerified = checklists.find((c) => c.migrationType === activeType && c.phase === 'delta')?.status === 'pm_verified';
            if (!otVerified || !deltaVerified) return null;
            return (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Flag className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-800">All phases verified!</p>
                    <p className="text-xs text-green-700">Both One-Time and Delta checklists are PM-approved. Ready to move to Final Validation.</p>
                  </div>
                </div>
                <button
                  onClick={handleFinalize}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow transition-all disabled:opacity-50 flex-shrink-0"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                  Move to Final Validation
                </button>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
