'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  Briefcase, Plus, ChevronLeft, ChevronDown, ChevronRight,
  FileText, Layers, ClipboardCheck, X, Search, SlidersHorizontal, Trash2,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_TYPES = [
  'Content Migration', 'Email Migration', 'Messaging Migration',
  'Full Platform Migration', 'Adoption & Training', 'Custom Development',
  'Post-migration Support', 'Other',
];
const DELIVERY_MODELS = ['Fixed price', 'T&M', 'Retainer', 'Milestone'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const SOW_STATUSES = ['Draft', 'Pending approval', 'Approved', 'Active'];
const WORKLOADS = ['Content', 'Email', 'Messaging'];
const ACTIVITY_STATUSES = ['Not started', 'In progress', 'Completed', 'Blocked'];

const SOW_STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  'Pending approval': 'bg-amber-100 text-amber-700',
  Approved: 'bg-blue-100 text-blue-700',
  Active: 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_STYLE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-green-100 text-green-700',
};

const ACTIVITY_STATUS_STYLE: Record<string, string> = {
  'Not started': 'bg-gray-100 text-gray-500',
  'In progress': 'bg-blue-100 text-blue-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Blocked': 'bg-red-100 text-red-700',
};

const LABEL_CLS = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';
const INPUT_CLS = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white transition-colors';
const TEXTAREA_CLS = `${INPUT_CLS} resize-none`;
const SELECT_CLS = INPUT_CLS;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhaseActivity {
  num: string; activity: string; deliverable: string; owner: string;
  effort: string; startDate: string; endDate: string; status: string;
}
interface Phase { name: string; activities: PhaseActivity[]; }
interface SignoffRow { item: string; role: string; confirmation: string; date: string; }
interface SignoffSection { section: string; rows: SignoffRow[]; }

interface PSEngagement {
  id: string; clientName: string; sowRefId: string; clientContact: string;
  clientContactEmail: string; cfPsLead: string; accountManager: string;
  startDate: string; endDate: string;
  engagementType: string; workloads: string[]; deliveryModel: string;
  priority: string; sowStatus: string; engagementDescription: string;
  clientObjectives: string; successCriteria: string; assumptions: string;
  outOfScope: string; phases: Phase[]; signoffs: SignoffSection[]; createdAt: string;
  createdBy?: string;
}

// ── Default data factories ────────────────────────────────────────────────────

function defaultPhases(): Phase[] {
  return [
    { name: 'Phase 1 — Discovery & assessment', activities: [
      { num: '1.1', activity: 'Stakeholder kick-off call', deliverable: 'Kick-off deck, agreed objectives, RACI confirmed', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
      { num: '1.2', activity: 'Current state environment assessment', deliverable: 'Assessment report: source platform, data volume, user count', owner: 'PS Consultant', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '1.3', activity: 'Migration readiness review', deliverable: 'Readiness scorecard — network, licensing, permissions, access', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '1.4', activity: 'Risk identification', deliverable: 'RAID log entries for PS section populated', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
      { num: '1.5', activity: 'Discovery report sign-off', deliverable: 'Signed discovery report from client stakeholder', owner: 'Client Stakeholder', effort: '0', startDate: '', endDate: '', status: 'Not started' },
    ]},
    { name: 'Phase 2 — Solution design', activities: [
      { num: '2.1', activity: 'Migration architecture design', deliverable: 'Architecture document: wave plan, connector config, mapping', owner: 'PS Lead', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '2.2', activity: 'Custom mapping & transformation rules', deliverable: 'Field mapping document + transformation logic signed off', owner: 'PS Consultant', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '2.3', activity: 'Integration design (if applicable)', deliverable: 'Integration spec for third-party tools, APIs, or workflows', owner: 'Dev Team', effort: '3', startDate: '', endDate: '', status: 'Not started' },
      { num: '2.4', activity: 'Cutover and rollback plan', deliverable: 'Detailed cutover runbook with rollback procedure', owner: 'PS Lead', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '2.5', activity: 'Solution design sign-off', deliverable: 'Signed solution design document', owner: 'Client Stakeholder', effort: '0', startDate: '', endDate: '', status: 'Not started' },
    ]},
    { name: 'Phase 3 — Implementation & configuration', activities: [
      { num: '3.1', activity: 'Environment and connector setup', deliverable: 'Source + destination connectors configured and tested', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '3.2', activity: 'Custom configuration deployment', deliverable: 'All custom mapping rules and integration configs applied', owner: 'PS Consultant', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '3.3', activity: 'Pilot migration execution', deliverable: 'Pilot user group migrated, results validated against criteria', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '3.4', activity: 'Permissions and metadata validation', deliverable: 'Validation report: permissions, metadata, timestamps verified', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '3.5', activity: 'Issue resolution and remediation', deliverable: 'Error log reviewed, failed items remediated, re-run complete', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
    ]},
    { name: 'Phase 4 — User enablement & training', activities: [
      { num: '4.1', activity: 'Training needs analysis', deliverable: 'Training plan: audience segments, format, content outline', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
      { num: '4.2', activity: 'Admin training delivery', deliverable: 'Admin training session delivered — recorded if requested', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '4.3', activity: 'End-user onboarding content', deliverable: 'Onboarding guide + quick-reference cards for end users', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '4.4', activity: 'End-user training delivery', deliverable: 'Live or recorded training delivered to agreed user cohorts', owner: 'PS Consultant', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '4.5', activity: 'Adoption baseline measurement', deliverable: 'Adoption metrics captured at T+7 and T+30 post go-live', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
    ]},
    { name: 'Phase 5 — Go-live & hypercare', activities: [
      { num: '5.1', activity: 'Go-live execution support', deliverable: 'PS consultant on standby during cutover window', owner: 'PS Consultant', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '5.2', activity: 'Hypercare monitoring (agreed period)', deliverable: 'Daily check-ins, issue triage, escalation support', owner: 'PS Consultant', effort: '5', startDate: '', endDate: '', status: 'Not started' },
      { num: '5.3', activity: 'Post-go-live validation report', deliverable: 'Validation report: data integrity, access, error rate', owner: 'PS Lead', effort: '1', startDate: '', endDate: '', status: 'Not started' },
      { num: '5.4', activity: 'Client sign-off on completion', deliverable: 'Signed completion certificate from client stakeholder', owner: 'Client Stakeholder', effort: '0', startDate: '', endDate: '', status: 'Not started' },
      { num: '5.5', activity: 'Lessons learned documentation', deliverable: 'Lessons learned log updated in PMO Tracker', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
    ]},
    { name: 'Phase 6 — Post-engagement (optional)', activities: [
      { num: '6.1', activity: '30-day health check', deliverable: 'Health check report: adoption, CSAT, open issues', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
      { num: '6.2', activity: 'Managed services transition (if sold)', deliverable: 'Handoff to managed services team with full environment brief', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
      { num: '6.3', activity: 'CF Manage onboarding (if sold)', deliverable: 'CF Manage configured and client IT trained on governance', owner: 'PS Consultant', effort: '2', startDate: '', endDate: '', status: 'Not started' },
      { num: '6.4', activity: 'Renewal and upsell brief to AM', deliverable: 'Brief for account manager: signals, expansion opportunities', owner: 'PS Lead', effort: '0.5', startDate: '', endDate: '', status: 'Not started' },
    ]},
  ];
}

function defaultSignoffs(): SignoffSection[] {
  return [
    { section: 'SOW APPROVAL', rows: [
      { item: 'SOW reviewed by CloudFuze PS Lead', role: 'PS Lead', confirmation: '', date: '' },
      { item: 'SOW reviewed by CloudFuze AM', role: 'Account Manager', confirmation: '', date: '' },
      { item: 'SOW approved by client stakeholder', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'SOW version confirmed', role: 'PS Lead', confirmation: '', date: '' },
    ]},
    { section: 'PHASE GATE SIGN-OFFS', rows: [
      { item: 'Phase 1 — Discovery report', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'Phase 2 — Solution design', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'Phase 3 — Pilot validation', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'Phase 4 — Training completion', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'Phase 5 — Go-live & post-validation', role: 'Client Stakeholder', confirmation: '', date: '' },
    ]},
    { section: 'CHANGE REQUEST APPROVALS', rows: [
      { item: 'Change requests approved by CloudFuze', role: 'PS Lead', confirmation: '', date: '' },
      { item: 'Change requests approved by client', role: 'Client Stakeholder', confirmation: '', date: '' },
    ]},
    { section: 'ENGAGEMENT COMPLETION', rows: [
      { item: 'Completion certificate — CloudFuze', role: 'PS Lead', confirmation: '', date: '' },
      { item: 'Completion certificate — client', role: 'Client Stakeholder', confirmation: '', date: '' },
      { item: 'Lessons learned document submitted', role: 'PS Lead', confirmation: '', date: '' },
      { item: 'Handoff to AM / CS team', role: 'PS Lead', confirmation: '', date: '' },
    ]},
  ];
}

// ── Engagement card ───────────────────────────────────────────────────────────

function EngagementCard({ eng, onClick }: { eng: PSEngagement; onClick: () => void }) {
  const totalActs = eng.phases.reduce((s, p) => s + p.activities.length, 0);
  const doneActs = eng.phases.reduce((s, p) => s + p.activities.filter(a => a.status === 'Completed').length, 0);
  const pct = totalActs > 0 ? Math.round((doneActs / totalActs) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{eng.clientName}</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId}</p>
        </div>
        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0', SOW_STATUS_STYLE[eng.sowStatus] || 'bg-gray-100 text-gray-600')}>
          {eng.sowStatus}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {eng.workloads.map(w => (
          <span key={w} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{w}</span>
        ))}
        {eng.deliveryModel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{eng.deliveryModel}</span>
        )}
        {eng.priority && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_STYLE[eng.priority] || 'bg-gray-100 text-gray-500')}>{eng.priority}</span>
        )}
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        {eng.cfPsLead && <p><span className="text-slate-400">PS Lead:</span> {eng.cfPsLead}</p>}
        {eng.engagementType && <p><span className="text-slate-400">Type:</span> {eng.engagementType}</p>}
        {(eng.startDate || eng.endDate) && (
          <p><span className="text-slate-400">Dates:</span> {eng.startDate || '—'} → {eng.endDate || '—'}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Scope progress</span>
          <span>{doneActs}/{totalActs} activities · {pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── New Engagement Modal ──────────────────────────────────────────────────────

function NewEngagementModal({ existingCount, onAdd, onClose, createdBy }: {
  existingCount: number;
  onAdd: (eng: PSEngagement) => void;
  onClose: () => void;
  createdBy: string;
}) {
  const year = new Date().getFullYear();
  const sowRefId = `CF-PS-${year}-${String(existingCount + 1).padStart(3, '0')}`;

  const [form, setForm] = useState({
    clientName: '', clientContact: '', clientContactEmail: '', cfPsLead: '',
    accountManager: '', startDate: '', endDate: '',
    engagementType: '', workloads: [] as string[],
    deliveryModel: '', priority: '', sowStatus: 'Draft',
    engagementDescription: '', clientObjectives: '', successCriteria: '',
    assumptions: '', outOfScope: '',
  });

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));
  const toggleWorkload = (w: string) =>
    set('workloads', form.workloads.includes(w) ? form.workloads.filter(x => x !== w) : [...form.workloads, w]);

  const isValid =
    form.clientName.trim() && form.clientContact.trim() && form.cfPsLead.trim() &&
    form.accountManager.trim() && form.startDate && form.endDate &&
    form.engagementType && form.deliveryModel && form.priority && form.workloads.length > 0 &&
    form.engagementDescription.trim() && form.clientObjectives.trim() &&
    form.successCriteria.trim() && form.assumptions.trim() && form.outOfScope.trim();

  const submit = () => {
    const eng: PSEngagement = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sowRefId,
      createdBy,
      ...form,
      phases: defaultPhases(),
      signoffs: defaultSignoffs(),
      createdAt: new Date().toISOString(),
    };
    onAdd(eng);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">New PS Engagement</h2>
            <p className="text-xs text-slate-400 mt-0.5">SOW Ref: <span className="font-mono">{sowRefId}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {/* Section 1 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              1 — Parties &amp; engagement overview
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={LABEL_CLS}>Client / Account Name *</label>
                <input value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Legal entity name as on contract" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Client Primary Contact *</label>
                <input value={form.clientContact} onChange={e => set('clientContact', e.target.value)} placeholder="Full name and title" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Client Contact Email *</label>
                <input value={form.clientContactEmail} onChange={e => set('clientContactEmail', e.target.value)} placeholder="email@client.com" type="email" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>CloudFuze PS Lead *</label>
                <input value={form.cfPsLead} onChange={e => set('cfPsLead', e.target.value)} placeholder="Full name" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Account Manager *</label>
                <input value={form.accountManager} onChange={e => set('accountManager', e.target.value)} placeholder="Full name" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Engagement Start Date *</label>
                <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Estimated End Date *</label>
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              2 — Engagement type &amp; workload classification
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Engagement Type *</label>
                <select value={form.engagementType} onChange={e => set('engagementType', e.target.value)} className={SELECT_CLS}>
                  <option value="">Select type…</option>
                  {ENGAGEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Delivery Model *</label>
                <select value={form.deliveryModel} onChange={e => set('deliveryModel', e.target.value)} className={SELECT_CLS}>
                  <option value="">Select model…</option>
                  {DELIVERY_MODELS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Priority *</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value)} className={SELECT_CLS}>
                  <option value="">Select priority…</option>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>SOW Status</label>
                <select value={form.sowStatus} onChange={e => set('sowStatus', e.target.value)} className={SELECT_CLS}>
                  {SOW_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLS}>Workloads in Scope *</label>
                <div className="flex gap-5">
                  {WORKLOADS.map(w => (
                    <label key={w} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.workloads.includes(w)}
                        onChange={() => toggleWorkload(w)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{w}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              3 — Engagement description &amp; objectives
            </h3>
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Engagement Description *</label>
                <textarea rows={3} value={form.engagementDescription} onChange={e => set('engagementDescription', e.target.value)} placeholder="Describe what CloudFuze Professional Services will deliver…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Client Objectives *</label>
                <textarea rows={2} value={form.clientObjectives} onChange={e => set('clientObjectives', e.target.value)} placeholder="What does the client want to achieve? Define measurable outcomes…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Success Criteria *</label>
                <textarea rows={2} value={form.successCriteria} onChange={e => set('successCriteria', e.target.value)} placeholder="How will success be measured? List specific, verifiable criteria…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Assumptions *</label>
                <textarea rows={2} value={form.assumptions} onChange={e => set('assumptions', e.target.value)} placeholder="What is assumed to be true? Platform readiness, access, client resources…" className={TEXTAREA_CLS} />
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              4 — Exclusions &amp; out of scope
            </h3>
            <div>
              <label className={LABEL_CLS}>Out of Scope Items *</label>
              <textarea rows={3} value={form.outOfScope} onChange={e => set('outOfScope', e.target.value)} placeholder="List items, activities, or deliverables explicitly NOT included in this engagement…" className={TEXTAREA_CLS} />
            </div>
          </div>

          <p className="text-xs text-slate-400 italic">
            The 6-phase scope of work and sign-off register will be auto-populated from the CloudFuze PS template.
          </p>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <p className="text-xs text-slate-400">* Mandatory fields</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
            <button
              onClick={submit}
              disabled={!isValid}
              className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Engagement
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── SOW Tab ───────────────────────────────────────────────────────────────────

function SowTab({ eng, onChange }: { eng: PSEngagement; onChange: (field: string, value: any) => void }) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          1 — Parties &amp; engagement overview
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {([
            ['Client / Account Name *', 'clientName', 'Legal entity name as on contract', 'text'],
            ['SOW Reference ID', 'sowRefId', '', 'text'],
            ['Client Primary Contact *', 'clientContact', 'Full name and title', 'text'],
            ['Client Contact Email *', 'clientContactEmail', 'email@client.com', 'email'],
            ['CloudFuze PS Lead *', 'cfPsLead', 'Full name', 'text'],
            ['Account Manager *', 'accountManager', 'Full name', 'text'],
            ['Engagement Start Date *', 'startDate', '', 'date'],
            ['Estimated End Date *', 'endDate', '', 'date'],
          ] as [string, string, string, string][]).map(([label, field, placeholder, type]) => (
            <div key={field}>
              <label className={LABEL_CLS}>{label}</label>
              <input
                type={type}
                value={(eng as any)[field] || ''}
                onChange={e => onChange(field, e.target.value)}
                placeholder={placeholder}
                className={INPUT_CLS}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          2 — Engagement type &amp; workload classification
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <label className={LABEL_CLS}>Engagement Type *</label>
            <select value={eng.engagementType} onChange={e => onChange('engagementType', e.target.value)} className={SELECT_CLS}>
              <option value="">Select type…</option>
              {ENGAGEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Delivery Model *</label>
            <select value={eng.deliveryModel} onChange={e => onChange('deliveryModel', e.target.value)} className={SELECT_CLS}>
              <option value="">Select model…</option>
              {DELIVERY_MODELS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Priority *</label>
            <select value={eng.priority} onChange={e => onChange('priority', e.target.value)} className={SELECT_CLS}>
              <option value="">Select priority…</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>SOW Status</label>
            <select value={eng.sowStatus} onChange={e => onChange('sowStatus', e.target.value)} className={SELECT_CLS}>
              {SOW_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={LABEL_CLS}>Workloads in Scope *</label>
            <div className="flex gap-5">
              {WORKLOADS.map(w => (
                <label key={w} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eng.workloads.includes(w)}
                    onChange={() =>
                      onChange('workloads', eng.workloads.includes(w)
                        ? eng.workloads.filter(x => x !== w)
                        : [...eng.workloads, w])
                    }
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">{w}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          3 — Engagement description &amp; objectives
        </h3>
        <div className="space-y-5">
          {([
            ['Engagement Description *', 'engagementDescription', 'Describe what CloudFuze Professional Services will deliver — scope, context, and key activities.', 4],
            ['Client Objectives *', 'clientObjectives', 'What does the client want to achieve? Define measurable outcomes expected at engagement close.', 3],
            ['Success Criteria *', 'successCriteria', 'How will success be measured? List specific, verifiable criteria that must be met for sign-off.', 3],
            ['Assumptions *', 'assumptions', 'What is assumed to be true? Platform readiness, client resource availability, access, etc.', 3],
          ] as [string, string, string, number][]).map(([label, field, placeholder, rows]) => (
            <div key={field}>
              <label className={LABEL_CLS}>{label}</label>
              <textarea
                rows={rows}
                value={(eng as any)[field] || ''}
                onChange={e => onChange(field, e.target.value)}
                placeholder={placeholder}
                className={TEXTAREA_CLS}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          4 — Exclusions &amp; out of scope
        </h3>
        <div>
          <label className={LABEL_CLS}>Out of Scope Items *</label>
          <textarea
            rows={4}
            value={eng.outOfScope}
            onChange={e => onChange('outOfScope', e.target.value)}
            placeholder="List items, activities, or deliverables explicitly NOT included in this engagement. Be specific to avoid disputes."
            className={TEXTAREA_CLS}
          />
        </div>
      </section>
    </div>
  );
}

// ── Scope Tab ─────────────────────────────────────────────────────────────────

function ScopeTab({ phases, onUpdate }: { phases: Phase[]; onUpdate: (p: Phase[]) => void }) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const togglePhase = (pi: number) => setCollapsed(c => ({ ...c, [pi]: !c[pi] }));

  const updateActivity = (pi: number, ai: number, field: string, value: string) => {
    onUpdate(phases.map((p, pIdx) => ({
      ...p,
      activities: p.activities.map((a, aIdx) => (pIdx === pi && aIdx === ai ? { ...a, [field]: value } : a)),
    })));
  };

  const allActs = phases.flatMap(p => p.activities);
  const totalEffort = allActs.reduce((s, a) => s + parseFloat(a.effort || '0'), 0);
  const totalDone = allActs.filter(a => a.status === 'Completed').length;
  const totalActs = allActs.length;

  const cellInput = 'w-full bg-transparent border border-transparent outline-none focus:bg-blue-50 focus:border-blue-200 hover:bg-slate-50 rounded px-1.5 py-0.5 text-xs text-slate-600 transition-colors';

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-6 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
        <span>Total effort: <strong className="text-slate-800">{totalEffort} days</strong></span>
        <span>Activities: <strong className="text-slate-800">{totalDone}/{totalActs} completed</strong></span>
        <div className="flex-1 flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', totalDone === totalActs && totalActs > 0 ? 'bg-emerald-500' : 'bg-indigo-500')}
              style={{ width: `${totalActs > 0 ? (totalDone / totalActs) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 w-8 text-right">{totalActs > 0 ? Math.round((totalDone / totalActs) * 100) : 0}%</span>
        </div>
      </div>

      {/* Phases */}
      {phases.map((phase, pi) => {
        const phaseEffort = phase.activities.reduce((s, a) => s + parseFloat(a.effort || '0'), 0);
        const phaseDone = phase.activities.filter(a => a.status === 'Completed').length;
        const isCollapsed = !!collapsed[pi];

        return (
          <div key={pi} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => togglePhase(pi)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                <span className="text-sm font-semibold text-slate-700">{phase.name}</span>
                <span className="text-xs text-slate-400 hidden sm:inline">{phaseDone}/{phase.activities.length} done · {phaseEffort} days</span>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {[...new Set(phase.activities.map(a => a.status))].map(s => (
                  <span key={s} className={cn('text-xs px-2 py-0.5 rounded-full hidden sm:inline', ACTIVITY_STATUS_STYLE[s] || 'bg-gray-100 text-gray-500')}>{s}</span>
                ))}
              </div>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-t border-slate-200 bg-white">
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-10">#</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-44">Activity</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500">Deliverable / description</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-28">Owner</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-500 w-20">Effort (days)</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-24">Start date</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-24">End date</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase.activities.map((act, ai) => (
                      <tr key={ai} className="border-t border-slate-100 hover:bg-blue-50/20">
                        <td className="py-2 px-3 text-slate-400 font-mono">{act.num}</td>
                        <td className="py-1.5 px-2 text-slate-700">{act.activity}</td>
                        <td className="py-1.5 px-2">
                          <input value={act.deliverable} onChange={e => updateActivity(pi, ai, 'deliverable', e.target.value)} className={cellInput} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input value={act.owner} onChange={e => updateActivity(pi, ai, 'owner', e.target.value)} className={cellInput} />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <input value={act.effort} onChange={e => updateActivity(pi, ai, 'effort', e.target.value)} className={cn(cellInput, 'text-center w-14 mx-auto block')} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input value={act.startDate} onChange={e => updateActivity(pi, ai, 'startDate', e.target.value)} placeholder="DD-MMM-YY" className={cellInput} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input value={act.endDate} onChange={e => updateActivity(pi, ai, 'endDate', e.target.value)} placeholder="DD-MMM-YY" className={cellInput} />
                        </td>
                        <td className="py-1.5 px-2">
                          <select
                            value={act.status}
                            onChange={e => updateActivity(pi, ai, 'status', e.target.value)}
                            className={cn('text-xs px-2 py-1 rounded-lg cursor-pointer font-medium w-full outline-none border border-transparent focus:border-indigo-300', ACTIVITY_STATUS_STYLE[act.status] || 'bg-gray-100 text-gray-500')}
                          >
                            {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={4} className="py-2 px-3 text-xs font-semibold text-slate-500 text-right">Phase total:</td>
                      <td className="py-2 px-3 text-center text-xs font-bold text-slate-700">{phaseEffort}</td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-6 py-3 text-sm">
          <span className="text-indigo-600 font-semibold">Total engagement effort: </span>
          <span className="text-indigo-900 font-bold">{totalEffort} days</span>
        </div>
      </div>
    </div>
  );
}

// ── Sign-off Tab ──────────────────────────────────────────────────────────────

function SignoffTab({ signoffs, onUpdate }: { signoffs: SignoffSection[]; onUpdate: (s: SignoffSection[]) => void }) {
  const updateRow = (si: number, ri: number, field: string, value: string) => {
    onUpdate(signoffs.map((section, sIdx) => ({
      ...section,
      rows: section.rows.map((row, rIdx) => (sIdx === si && rIdx === ri ? { ...row, [field]: value } : row)),
    })));
  };

  const allRows = signoffs.flatMap(s => s.rows);
  const signedCount = allRows.filter(r => r.confirmation.trim()).length;
  const totalCount = allRows.length;

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        <span className={cn('font-semibold', signedCount === totalCount ? 'text-emerald-600' : 'text-slate-700')}>
          {signedCount} of {totalCount}
        </span> sign-offs recorded. All sign-offs must be completed before engagement close.
      </p>

      {signoffs.map((section, si) => (
        <div key={si}>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
            {section.section}
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600 border-b border-slate-200">Sign-off item</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600 border-b border-slate-200 w-36">Signed by (role)</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600 border-b border-slate-200">Signature / confirmation</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600 border-b border-slate-200 w-28">Date</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, ri) => (
                  <tr key={ri} className={cn('border-b border-slate-100 last:border-0 transition-colors', row.confirmation.trim() ? 'bg-emerald-50/40' : '')}>
                    <td className="py-2.5 px-4 text-slate-700">{row.item}</td>
                    <td className="py-2.5 px-4 text-slate-500">{row.role}</td>
                    <td className="py-1.5 px-3">
                      <input
                        value={row.confirmation}
                        onChange={e => updateRow(si, ri, 'confirmation', e.target.value)}
                        placeholder="Enter name or confirmation…"
                        className="w-full bg-transparent border border-transparent outline-none focus:bg-white focus:border-indigo-300 hover:bg-white hover:border-gray-200 rounded px-2 py-1 text-slate-600 transition-colors"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        value={row.date}
                        onChange={e => updateRow(si, ri, 'date', e.target.value)}
                        placeholder="DD-MMM-YYYY"
                        className="w-full bg-transparent border border-transparent outline-none focus:bg-white focus:border-indigo-300 hover:bg-white hover:border-gray-200 rounded px-2 py-1 text-slate-500 transition-colors"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

function PSDetailView({ eng, onUpdate, onBack, onSave, saved, canEdit, onDelete }: {
  eng: PSEngagement;
  onUpdate: (field: string, value: any) => void;
  onBack: () => void;
  onSave: () => void;
  saved: boolean;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'sow' | 'scope' | 'signoff'>('sow');

  const totalActs = eng.phases.reduce((s, p) => s + p.activities.length, 0);
  const doneActs = eng.phases.reduce((s, p) => s + p.activities.filter(a => a.status === 'Completed').length, 0);
  const signedCount = eng.signoffs.flatMap(s => s.rows).filter(r => r.confirmation.trim()).length;
  const totalSignoffs = eng.signoffs.flatMap(s => s.rows).length;

  const tabs = [
    { key: 'sow' as const, label: 'Statement of Work', icon: <FileText className="w-4 h-4" /> },
    { key: 'scope' as const, label: 'Scope of Work', icon: <Layers className="w-4 h-4" />, badge: `${doneActs}/${totalActs}` },
    { key: 'signoff' as const, label: 'Sign-off & Approvals', icon: <ClipboardCheck className="w-4 h-4" />, badge: `${signedCount}/${totalSignoffs}` },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            All Engagements
          </button>
          <span className="text-slate-300">|</span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{eng.clientName}</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId} · {eng.engagementType || 'Professional Services'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-3 py-1 rounded-full font-medium', SOW_STATUS_STYLE[eng.sowStatus] || 'bg-gray-100 text-gray-600')}>
            {eng.sowStatus}
          </span>
          {eng.priority && (
            <span className={cn('text-xs px-3 py-1 rounded-full font-medium', PRIORITY_STYLE[eng.priority] || 'bg-gray-100 text-gray-600')}>
              {eng.priority}
            </span>
          )}
          {canEdit ? (
            <>
              <button
                onClick={() => { if (confirm(`Delete engagement for "${eng.clientName}"? This cannot be undone.`)) onDelete(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <button
                onClick={onSave}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                  saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                )}
              >
                {saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </>
          ) : (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 border border-gray-200">View only</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-2 pt-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px',
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold', activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500')}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'sow' && <SowTab eng={eng} onChange={onUpdate} />}
          {activeTab === 'scope' && <ScopeTab phases={eng.phases} onUpdate={phases => onUpdate('phases', phases)} />}
          {activeTab === 'signoff' && <SignoffTab signoffs={eng.signoffs} onUpdate={signoffs => onUpdate('signoffs', signoffs)} />}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const LS_KEY = 'pmo_ps_v1';

function loadEngagements(): PSEngagement[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function ProfessionalServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canEditEngagement = (eng: PSEngagement) =>
    isAdmin || (!!eng.createdBy && eng.createdBy === user?.name);

  const [engagements, setEngagements] = useState<PSEngagement[]>(() => loadEngagements());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [engTypeFilter, setEngTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const selected = engagements.find(e => e.id === selectedId) ?? null;

  const filteredEngagements = engagements.filter(eng => {
    const s = searchFilter.toLowerCase();
    if (s && !eng.clientName.toLowerCase().includes(s) && !eng.sowRefId.toLowerCase().includes(s) && !eng.cfPsLead.toLowerCase().includes(s) && !eng.accountManager.toLowerCase().includes(s)) return false;
    if (engTypeFilter && eng.engagementType !== engTypeFilter) return false;
    if (statusFilter && eng.sowStatus !== statusFilter) return false;
    if (priorityFilter && eng.priority !== priorityFilter) return false;
    return true;
  });

  const activeFilterCount = [searchFilter, engTypeFilter, statusFilter, priorityFilter].filter(Boolean).length;
  const clearFilters = () => { setSearchFilter(''); setEngTypeFilter(''); setStatusFilter(''); setPriorityFilter(''); };

  const addEngagement = (eng: PSEngagement) => {
    const updated = [...engagements, eng];
    setEngagements(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSelectedId(eng.id);
  };

  const updateEngagement = (field: string, value: any) => {
    if (!selectedId) return;
    setEngagements(prev => prev.map(e => e.id === selectedId ? { ...e, [field]: value } : e));
  };

  const handleSave = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(engagements));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const deleteEngagement = (id: string) => {
    const updated = engagements.filter(e => e.id !== id);
    setEngagements(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSelectedId(null);
  };

  if (selected) {
    return (
      <PSDetailView
        eng={selected}
        onUpdate={updateEngagement}
        onBack={() => setSelectedId(null)}
        onSave={handleSave}
        saved={saved}
        canEdit={canEditEngagement(selected)}
        onDelete={() => deleteEngagement(selected.id)}
      />
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Professional Services</h1>
          <p className="text-sm text-slate-500 mt-0.5">SOW management, scope tracking, and sign-off register</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Engagement
        </button>
      </div>

      {engagements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-indigo-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">No engagements yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-xs">
            Create your first Professional Services engagement to start tracking the SOW, scope of work, and sign-offs.
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Engagement
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowFilters(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
              >
                <SlidersHorizontal size={16} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{activeFilterCount}</span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Clear all</button>
              )}
            </div>
            {showFilters && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Search by client, SOW ref, PS lead, account manager…"
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
                  />
                  {searchFilter && (
                    <button onClick={() => setSearchFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Engagement Type</label>
                    <div className="relative">
                      <select
                        value={engTypeFilter}
                        onChange={e => setEngTypeFilter(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white appearance-none pr-8"
                      >
                        <option value="">All Types</option>
                        {ENGAGEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      {engTypeFilter && (
                        <button onClick={() => setEngTypeFilter('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">SOW Status</label>
                    <div className="relative">
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white appearance-none pr-8"
                      >
                        <option value="">All Statuses</option>
                        {SOW_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      {statusFilter && (
                        <button onClick={() => setStatusFilter('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                    <div className="relative">
                      <select
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white appearance-none pr-8"
                      >
                        <option value="">All Priorities</option>
                        {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      {priorityFilter && (
                        <button onClick={() => setPriorityFilter('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    {searchFilter && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Search: {searchFilter}
                        <button onClick={() => setSearchFilter('')}><X size={10} /></button>
                      </span>
                    )}
                    {engTypeFilter && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Type: {engTypeFilter}
                        <button onClick={() => setEngTypeFilter('')}><X size={10} /></button>
                      </span>
                    )}
                    {statusFilter && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Status: {statusFilter}
                        <button onClick={() => setStatusFilter('')}><X size={10} /></button>
                      </span>
                    )}
                    {priorityFilter && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Priority: {priorityFilter}
                        <button onClick={() => setPriorityFilter('')}><X size={10} /></button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {filteredEngagements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
                <Briefcase className="w-6 h-6 text-indigo-300" />
              </div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">No engagements match your filters</h3>
              <button onClick={clearFilters} className="text-sm text-indigo-500 hover:text-indigo-700 underline mt-1">Clear filters</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {filteredEngagements.length} engagement{filteredEngagements.length !== 1 ? 's' : ''}
                {activeFilterCount > 0 ? ' matching filters' : ''}
              </p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Client / SOW Ref</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Engagement Type</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">PS Lead / AM</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Dates</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Priority</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">SOW Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Progress</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEngagements.map(eng => {
                      const totalActs = eng.phases.reduce((s, p) => s + p.activities.length, 0);
                      const doneActs = eng.phases.reduce((s, p) => s + p.activities.filter(a => a.status === 'Completed').length, 0);
                      const pct = totalActs > 0 ? Math.round((doneActs / totalActs) * 100) : 0;
                      return (
                        <tr
                          key={eng.id}
                          onClick={() => setSelectedId(eng.id)}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/30 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800">{eng.clientName}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-slate-600">{eng.engagementType || '—'}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {eng.workloads.map(w => (
                                <span key={w} className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{w}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {eng.cfPsLead && <p className="text-sm text-slate-600">{eng.cfPsLead}</p>}
                            {eng.accountManager && <p className="text-xs text-slate-400 mt-0.5">{eng.accountManager}</p>}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">
                            {eng.startDate || '—'} → {eng.endDate || '—'}
                          </td>
                          <td className="py-3 px-4">
                            {eng.priority && (
                              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_STYLE[eng.priority] || 'bg-gray-100 text-gray-500')}>
                                {eng.priority}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SOW_STATUS_STYLE[eng.sowStatus] || 'bg-gray-100 text-gray-600')}>
                              {eng.sowStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 w-8">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                            {canEditEngagement(eng) && (
                              <button
                                onClick={() => { if (confirm(`Delete engagement for "${eng.clientName}"? This cannot be undone.`)) deleteEngagement(eng.id); }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete engagement"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showNewModal && (
        <NewEngagementModal
          existingCount={engagements.length}
          onAdd={addEngagement}
          onClose={() => setShowNewModal(false)}
          createdBy={user?.name || ''}
        />
      )}
    </div>
  );
}
