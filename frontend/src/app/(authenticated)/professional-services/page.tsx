'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { usePsEngagements, useCreatePsEngagement, useUpdatePsEngagement, useDeletePsEngagement } from '@/hooks/useProjects';
import {
  Briefcase, Plus, ChevronLeft, ChevronDown,
  FileText, X, Search, SlidersHorizontal, Trash2,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_TYPES = [
  'Content Migration', 'Email Migration', 'Messaging Migration',
  'Full Platform Migration', 'Adoption & Training', 'Custom Development',
  'Post-migration Support', 'Other',
];
const DELIVERY_MODELS = ['Fixed price', 'T&M', 'Retainer', 'Milestone'];
const WORKLOADS = ['Content', 'Email', 'Messaging'];
const ACTIVITY_STATUSES = ['Not started', 'In progress', 'Completed', 'Blocked'];

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
interface LineItem { id: string; name: string; description: string; status: string; startDate: string; endDate: string; }

interface PSEngagement {
  id: string; clientName: string; sowRefId: string; clientContact: string;
  clientContactEmail: string; cfPsLead: string; accountManager: string;
  startDate: string; endDate: string;
  engagementType?: string; workloads?: string[]; deliveryModel?: string;
  priority?: string; sowStatus?: string; engagementDescription: string;
  clientObjectives: string; successCriteria: string; assumptions: string;
  outOfScope: string; lineItems?: LineItem[];
  phases: Phase[]; signoffs: SignoffSection[]; createdAt: string;
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
  const lineItems = eng.lineItems || [];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all space-y-3"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 truncate">{eng.clientName}</p>
        <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId}</p>
      </div>

      {lineItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lineItems.map((item: LineItem) => (
            <span key={item.id} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
              {item.name || '(unnamed)'}
            </span>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 space-y-0.5">
        {eng.cfPsLead && <p><span className="text-slate-400">PS Lead:</span> {eng.cfPsLead}</p>}
        {eng.accountManager && <p><span className="text-slate-400">AM:</span> {eng.accountManager}</p>}
        {(eng.startDate || eng.endDate) && (
          <p><span className="text-slate-400">Dates:</span> {eng.startDate || '—'} → {eng.endDate || '—'}</p>
        )}
      </div>
    </div>
  );
}

// ── New Engagement Modal ──────────────────────────────────────────────────────

function NewEngagementModal({ existingCount, onAdd, onClose, createdBy }: {
  existingCount: number;
  onAdd: (eng: PSEngagement) => Promise<void>;
  onClose: () => void;
  createdBy: string;
}) {
  const year = new Date().getFullYear();
  const sowRefId = `CF-PS-${year}-${String(existingCount + 1).padStart(3, '0')}`;

  const [form, setForm] = useState({
    clientName: '', clientContact: '', clientContactEmail: '', cfPsLead: '',
    accountManager: '', startDate: '', endDate: '',
    engagementDescription: '', clientObjectives: '', successCriteria: '',
    assumptions: '', outOfScope: '',
    lineItems: [] as LineItem[],
  });

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const addLineItem = () => set('lineItems', [
    ...form.lineItems,
    { id: `li-${Date.now()}-${form.lineItems.length}`, name: '', description: '', status: 'Not started', startDate: '', endDate: '' },
  ]);
  const removeLineItem = (idx: number) => set('lineItems', form.lineItems.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: 'name' | 'description' | 'status' | 'startDate' | 'endDate', value: string) =>
    set('lineItems', form.lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const isValid =
    form.clientName.trim() && form.cfPsLead.trim() &&
    form.accountManager.trim() && form.startDate && form.endDate;

  const submit = async () => {
    const eng: PSEngagement = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sowRefId,
      createdBy,
      ...form,
      phases: defaultPhases(),
      signoffs: defaultSignoffs(),
      createdAt: new Date().toISOString(),
    };
    await onAdd(eng);
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
                <label className={LABEL_CLS}>Client Contact Email</label>
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

          {/* Section 2 — Line Items */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              2 — Line items
            </h3>
            <div className="space-y-2">
              {form.lineItems.length > 0 && (
                <div className="flex gap-2 mb-1 pr-7">
                  <span className="w-32 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</span>
                  <span className="flex-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</span>
                  <span className="w-32 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</span>
                  <span className="w-28 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Start date</span>
                  <span className="w-28 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">End date</span>
                </div>
              )}
              {form.lineItems.map((item, idx) => (
                <div key={item.id} className="flex gap-2 items-center">
                  <input
                    value={item.name}
                    onChange={e => updateLineItem(idx, 'name', e.target.value)}
                    placeholder="Item name…"
                    className={cn(INPUT_CLS, 'w-32 shrink-0')}
                  />
                  <input
                    value={item.description}
                    onChange={e => updateLineItem(idx, 'description', e.target.value)}
                    placeholder="Item description…"
                    className={cn(INPUT_CLS, 'flex-1')}
                  />
                  <select
                    value={item.status || 'Not started'}
                    onChange={e => updateLineItem(idx, 'status', e.target.value)}
                    className={cn('text-xs px-2 py-1.5 rounded-lg cursor-pointer font-medium w-32 shrink-0 outline-none border border-gray-200', ACTIVITY_STATUS_STYLE[item.status] || 'bg-gray-100 text-gray-500')}
                  >
                    {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <input
                    type="date"
                    value={item.startDate}
                    onChange={e => updateLineItem(idx, 'startDate', e.target.value)}
                    className={cn(INPUT_CLS, 'w-28 shrink-0')}
                  />
                  <input
                    type="date"
                    value={item.endDate}
                    onChange={e => updateLineItem(idx, 'endDate', e.target.value)}
                    className={cn(INPUT_CLS, 'w-28 shrink-0')}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(idx)}
                    className="w-5 shrink-0 text-gray-300 hover:text-red-500 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Add line item
              </button>
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
              3 — Engagement description &amp; objectives
            </h3>
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Engagement Description</label>
                <textarea rows={3} value={form.engagementDescription} onChange={e => set('engagementDescription', e.target.value)} placeholder="Describe what CloudFuze Professional Services will deliver…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Client Objectives</label>
                <textarea rows={2} value={form.clientObjectives} onChange={e => set('clientObjectives', e.target.value)} placeholder="What does the client want to achieve? Define measurable outcomes…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Success Criteria</label>
                <textarea rows={2} value={form.successCriteria} onChange={e => set('successCriteria', e.target.value)} placeholder="How will success be measured? List specific, verifiable criteria…" className={TEXTAREA_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Assumptions</label>
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
              <label className={LABEL_CLS}>Out of Scope Items</label>
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
          2 — Line items
        </h3>
        <div className="space-y-2">
          {(eng.lineItems || []).length > 0 && (
            <div className="flex gap-2 mb-1 pr-7">
              <span className="w-32 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</span>
              <span className="flex-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</span>
              <span className="w-32 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</span>
              <span className="w-28 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">Start date</span>
              <span className="w-28 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">End date</span>
            </div>
          )}
          {(eng.lineItems || []).map((item: LineItem, idx: number) => (
            <div key={item.id} className="flex gap-2 items-center">
              <input
                value={item.name || ''}
                onChange={e => onChange('lineItems', (eng.lineItems || []).map((li: LineItem, i: number) => i === idx ? { ...li, name: e.target.value } : li))}
                placeholder="Item name…"
                className={cn(INPUT_CLS, 'w-32 shrink-0')}
              />
              <input
                value={item.description}
                onChange={e => onChange('lineItems', (eng.lineItems || []).map((li: LineItem, i: number) => i === idx ? { ...li, description: e.target.value } : li))}
                placeholder="Item description…"
                className={cn(INPUT_CLS, 'flex-1')}
              />
              <select
                value={item.status || 'Not started'}
                onChange={e => onChange('lineItems', (eng.lineItems || []).map((li: LineItem, i: number) => i === idx ? { ...li, status: e.target.value } : li))}
                className={cn('text-xs px-2 py-1.5 rounded-lg cursor-pointer font-medium w-32 shrink-0 outline-none border border-gray-200', ACTIVITY_STATUS_STYLE[item.status] || 'bg-gray-100 text-gray-500')}
              >
                {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <input
                type="date"
                value={item.startDate}
                onChange={e => onChange('lineItems', (eng.lineItems || []).map((li: LineItem, i: number) => i === idx ? { ...li, startDate: e.target.value } : li))}
                className={cn(INPUT_CLS, 'w-28 shrink-0')}
              />
              <input
                type="date"
                value={item.endDate}
                onChange={e => onChange('lineItems', (eng.lineItems || []).map((li: LineItem, i: number) => i === idx ? { ...li, endDate: e.target.value } : li))}
                className={cn(INPUT_CLS, 'w-28 shrink-0')}
              />
              <button
                type="button"
                onClick={() => onChange('lineItems', (eng.lineItems || []).filter((_: LineItem, i: number) => i !== idx))}
                className="w-5 shrink-0 text-gray-300 hover:text-red-500 transition-colors flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange('lineItems', [...(eng.lineItems || []), { id: `li-${Date.now()}`, name: '', description: '', status: 'Not started', startDate: '', endDate: '' }])}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors mt-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add line item
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          3 — Engagement description &amp; objectives
        </h3>
        <div className="space-y-5">
          {([
            ['Engagement Description', 'engagementDescription', 'Describe what CloudFuze Professional Services will deliver — scope, context, and key activities.', 4],
            ['Client Objectives', 'clientObjectives', 'What does the client want to achieve? Define measurable outcomes expected at engagement close.', 3],
            ['Success Criteria', 'successCriteria', 'How will success be measured? List specific, verifiable criteria that must be met for sign-off.', 3],
            ['Assumptions', 'assumptions', 'What is assumed to be true? Platform readiness, client resource availability, access, etc.', 3],
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
          <label className={LABEL_CLS}>Out of Scope Items</label>
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

// ── Detail view ───────────────────────────────────────────────────────────────

function PSDetailView({ eng, onUpdate, onBack, onSave, saved, hasUnsaved, canEdit, onDelete }: {
  eng: PSEngagement;
  onUpdate: (field: string, value: any) => void;
  onBack: () => void;
  onSave: () => void;
  saved: boolean;
  hasUnsaved: boolean;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'sow'>('sow');

  const tabs = [
    { key: 'sow' as const, label: 'Statement of Work', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (hasUnsaved && !confirm('You have unsaved changes. Leave without saving?')) return;
              onBack();
            }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            All Engagements
          </button>
          <span className="text-slate-300">|</span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{eng.clientName}</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId} · Professional Services</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <>
              {hasUnsaved && !saved && (
                <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
              )}
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
                  saved ? 'bg-emerald-500 text-white' : hasUnsaved ? 'bg-indigo-700 text-white ring-2 ring-indigo-300 hover:bg-indigo-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'sow' && <SowTab eng={eng} onChange={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfessionalServicesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const isViewer = user?.role === 'VIEWER';
  const canEditEngagement = (eng: PSEngagement) =>
    !isViewer && (isAdmin || (!!eng.createdBy && eng.createdBy === user?.name));

  const queryClient = useQueryClient();
  const { data: engagements = [], isLoading } = usePsEngagements();
  const createMutation = useCreatePsEngagement();
  const updateMutation = useUpdatePsEngagement();
  const deleteMutation = useDeletePsEngagement();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localEdit, setLocalEdit] = useState<PSEngagement | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [engTypeFilter, setEngTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [migrating, setMigrating] = useState(false);

  const localStorageCount = (() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('pmo_ps_v1') : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch { return 0; }
  })();

  const migrateFromLocalStorage = async () => {
    setMigrating(true);
    try {
      const raw = localStorage.getItem('pmo_ps_v1');
      const items: PSEngagement[] = raw ? JSON.parse(raw) : [];
      for (const eng of items) {
        await createMutation.mutateAsync(eng);
      }
      localStorage.removeItem('pmo_ps_v1');
    } finally {
      setMigrating(false);
    }
  };

  const openEngagement = (id: string) => {
    const eng = engagements.find(e => e.id === id);
    setSelectedId(id);
    setLocalEdit(eng ? { ...eng } : null);
    setHasUnsaved(false);
  };

  const filteredEngagements = engagements.filter(eng => {
    const s = searchFilter.toLowerCase();
    if (s && !eng.clientName.toLowerCase().includes(s) && !eng.sowRefId.toLowerCase().includes(s) && !eng.cfPsLead.toLowerCase().includes(s) && !eng.accountManager.toLowerCase().includes(s)) return false;
    if (engTypeFilter && eng.engagementType !== engTypeFilter) return false;
    return true;
  });

  const activeFilterCount = [searchFilter, engTypeFilter].filter(Boolean).length;
  const clearFilters = () => { setSearchFilter(''); setEngTypeFilter(''); };

  const addEngagement = async (eng: PSEngagement) => {
    await createMutation.mutateAsync(eng);
    queryClient.setQueryData<any[]>(['ps-engagements'], (old) =>
      old ? [eng, ...old] : [eng]
    );
    setLocalEdit({ ...eng });
    setSelectedId(eng.id);
    setHasUnsaved(false);
  };

  const updateEngagement = (field: string, value: any) => {
    setLocalEdit(prev => prev ? { ...prev, [field]: value } : null);
    setHasUnsaved(true);
  };

  const handleSave = async () => {
    if (!localEdit) return;
    try {
      await updateMutation.mutateAsync({ id: localEdit.id, data: localEdit });
      queryClient.setQueryData<any[]>(['ps-engagements'], (old) =>
        old ? old.map(eng => eng.id === localEdit.id ? { ...localEdit } : eng) : old
      );
      setHasUnsaved(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      showToast('error', 'Save failed', err?.response?.data?.error || err?.message || 'Unknown error');
    }
  };

  const deleteEngagement = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setSelectedId(null);
    setLocalEdit(null);
    setHasUnsaved(false);
  };

  if (selectedId && localEdit) {
    return (
      <PSDetailView
        eng={localEdit}
        onUpdate={updateEngagement}
        onBack={() => { setSelectedId(null); setLocalEdit(null); setHasUnsaved(false); }}
        onSave={handleSave}
        saved={saved}
        hasUnsaved={hasUnsaved}
        canEdit={canEditEngagement(localEdit)}
        onDelete={() => deleteEngagement(localEdit.id)}
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
        {!isViewer && (
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Engagement
          </button>
        )}
      </div>

      {localStorageCount > 0 && (
        <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{localStorageCount} engagement{localStorageCount !== 1 ? 's' : ''} found in local browser storage</span> from before the database migration.
            Click to import them so all users can see them.
          </p>
          <button
            onClick={migrateFromLocalStorage}
            disabled={migrating}
            className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {migrating ? 'Importing…' : 'Import to database'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading engagements…</div>
      ) : engagements.length === 0 ? (
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
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Line Items</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">PS Lead / AM</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Dates</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEngagements.map(eng => {
                      return (
                        <tr
                          key={eng.id}
                          onClick={() => openEngagement(eng.id)}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/30 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800">{eng.clientName}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{eng.sowRefId}</p>
                          </td>
                          <td className="py-3 px-4">
                            {(eng.lineItems || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {(eng.lineItems || []).map((item: LineItem) => (
                                  <span key={item.id} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
                                    {item.name || '(unnamed)'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {eng.cfPsLead && <p className="text-sm text-slate-600">{eng.cfPsLead}</p>}
                            {eng.accountManager && <p className="text-xs text-slate-400 mt-0.5">{eng.accountManager}</p>}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">
                            {eng.startDate || '—'} → {eng.endDate || '—'}
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
