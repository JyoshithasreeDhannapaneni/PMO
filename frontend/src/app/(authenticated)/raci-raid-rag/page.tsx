'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { Shield, AlertTriangle, BarChart2, RefreshCw, ChevronDown } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';

// ── Color helpers ─────────────────────────────────────────────────────────────

const RACI_STYLE: Record<string, string> = {
  R: 'bg-blue-100 text-blue-700 font-bold',
  A: 'bg-purple-100 text-purple-700 font-bold',
  C: 'bg-amber-100 text-amber-700 font-bold',
  I: 'bg-slate-100 text-slate-600 font-medium',
  '—': 'bg-white text-gray-300',
};
const RACI_ORDER = ['R', 'A', 'C', 'I', '—'];

const RAG_STYLE: Record<string, string> = {
  G: 'bg-green-100 text-green-700 font-bold',
  A: 'bg-amber-100 text-amber-700 font-bold',
  R: 'bg-red-100 text-red-700 font-bold',
  '—': 'bg-gray-100 text-gray-400',
};
const RAG_ORDER = ['G', 'A', 'R', '—'];

const PROB_STYLE: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-green-100 text-green-700',
  '—': 'bg-gray-100 text-gray-400',
};

const SEV_STYLE: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-green-100 text-green-700',
  '—': 'bg-gray-100 text-gray-400',
};

const STATUS_STYLE: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-700',
  Escalated: 'bg-red-100 text-red-700',
  'In progress': 'bg-amber-100 text-amber-700',
  Closed: 'bg-green-100 text-green-700',
};

const TYPE_STYLE: Record<string, string> = {
  R: 'bg-red-50 text-red-600 border border-red-200',
  A: 'bg-blue-50 text-blue-600 border border-blue-200',
  I: 'bg-amber-50 text-amber-600 border border-amber-200',
  D: 'bg-purple-50 text-purple-600 border border-purple-200',
};
const TYPE_LABEL: Record<string, string> = { R: 'Risk', A: 'Assumption', I: 'Issue', D: 'Dependency' };

// ── Initial RACI data ─────────────────────────────────────────────────────────

const INITIAL_RACI = [
  {
    phase: 'Pre-sales & POC',
    rows: [
      { activity: 'Customer discovery call', dh: 'I', mm: 'C', ps: 'R', am: 'A', cs: '—', cit: '—', cst: 'C', notes: '' },
      { activity: 'Define POC scope and success criteria', dh: 'I', mm: 'C', ps: 'R', am: 'A', cs: '—', cit: '—', cst: 'C', notes: 'Sign-off required from customer stakeholder' },
      { activity: 'Environment and connector setup', dh: '—', mm: 'C', ps: 'R', am: 'I', cs: '—', cit: 'C', cst: '—', notes: 'Customer IT to provide admin access' },
      { activity: 'Execute trial migration run', dh: '—', mm: 'C', ps: 'R', am: 'I', cs: '—', cit: 'C', cst: '—', notes: '' },
      { activity: 'POC results review with customer', dh: 'I', mm: 'C', ps: 'R', am: 'A', cs: '—', cit: '—', cst: 'C', notes: '' },
      { activity: 'POC sign-off and outcome recording', dh: 'I', mm: '—', ps: 'R', am: 'A', cs: '—', cit: '—', cst: 'C', notes: 'Won / Lost / Extended' },
      { activity: 'Handoff brief to migration manager', dh: 'I', mm: 'A', ps: 'R', am: 'I', cs: '—', cit: '—', cst: '—', notes: 'Lessons learned mandatory before close' },
    ],
  },
  {
    phase: 'Migration Scoping',
    rows: [
      { activity: 'Migration project kick-off', dh: 'A', mm: 'R', ps: 'C', am: 'I', cs: '—', cit: 'C', cst: 'I', notes: '' },
      { activity: 'Wave plan and schedule agreement', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'C', cst: 'A', notes: 'Customer stakeholder approves schedule' },
      { activity: 'Data volume and user mapping', dh: '—', mm: 'R', ps: 'C', am: 'I', cs: '—', cit: 'A', cst: '—', notes: '' },
      { activity: 'Risk and dependency identification', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'C', cst: 'I', notes: 'RAID log to be updated' },
      { activity: 'Customer IT readiness confirmation', dh: 'I', mm: 'A', ps: '—', am: 'C', cs: '—', cit: 'R', cst: 'C', notes: 'Admin access, firewall, MFA' },
    ],
  },
  {
    phase: 'Migration Execution',
    rows: [
      { activity: 'Wave migration execution', dh: 'I', mm: 'R', ps: '—', am: 'I', cs: '—', cit: 'C', cst: '—', notes: '' },
      { activity: 'Permissions and metadata validation', dh: '—', mm: 'R', ps: '—', am: 'I', cs: '—', cit: 'C', cst: '—', notes: '' },
      { activity: 'Error log review and remediation', dh: 'C', mm: 'R', ps: '—', am: 'I', cs: '—', cit: 'C', cst: '—', notes: '' },
      { activity: 'Delta / incremental migration runs', dh: '—', mm: 'R', ps: '—', am: 'I', cs: '—', cit: 'C', cst: '—', notes: '' },
      { activity: 'Customer IT co-ordination', dh: '—', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'A', cst: 'I', notes: 'For credential and access issues' },
      { activity: 'Cutover planning and scheduling', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'C', cst: 'A', notes: '' },
      { activity: 'Go-live execution', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'C', cst: 'I', notes: '' },
      { activity: 'Post-go-live validation', dh: 'I', mm: 'R', ps: '—', am: 'C', cs: '—', cit: 'A', cst: '—', notes: '' },
    ],
  },
  {
    phase: 'Customer Validation',
    rows: [
      { activity: 'Migration completion sign-off', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: '—', cit: '—', cst: 'A', notes: 'Written sign-off required' },
      { activity: 'Post-migration health check', dh: 'C', mm: 'R', ps: '—', am: 'I', cs: 'A', cit: 'C', cst: '—', notes: '' },
      { activity: 'CSAT survey issuance', dh: 'I', mm: '—', ps: '—', am: 'A', cs: 'R', cit: '—', cst: '—', notes: '' },
      { activity: 'Escalation resolution', dh: 'A', mm: 'R', ps: '—', am: 'C', cs: 'C', cit: 'C', cst: 'I', notes: 'AM to lead customer comms' },
    ],
  },
  {
    phase: 'Customer Success',
    rows: [
      { activity: 'CS track creation in PMO tracker', dh: 'I', mm: '—', ps: '—', am: 'A', cs: 'R', cit: '—', cst: '—', notes: 'Opened on migration completion' },
      { activity: 'CSAT monitoring and response', dh: 'I', mm: '—', ps: '—', am: 'C', cs: 'R', cit: '—', cst: 'A', notes: '' },
      { activity: 'Upsell / cross-sell identification', dh: 'I', mm: '—', ps: 'C', am: 'A', cs: 'R', cit: '—', cst: '—', notes: 'CF Migrate / Manage / PS / MS signals' },
      { activity: 'Renewal conversation', dh: 'I', mm: '—', ps: '—', am: 'A', cs: 'R', cit: '—', cst: 'I', notes: '' },
      { activity: 'Overage charge notification', dh: 'A', mm: 'C', ps: '—', am: 'R', cs: '—', cit: '—', cst: 'I', notes: 'AM owns customer conversation' },
      { activity: 'QBR preparation and delivery', dh: 'C', mm: 'C', ps: '—', am: 'A', cs: 'R', cit: '—', cst: 'C', notes: '' },
    ],
  },
];

// ── Initial RAID data ─────────────────────────────────────────────────────────

const INITIAL_RAID = [
  {
    team: 'Pre-sales Team',
    rows: [
      { id: 'PS-R-001', type: 'R', pocProject: 'Alpine Systems', description: 'POC deadline missed due to customer IT delays in providing admin access', probability: 'High', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Raise blocker in PMO tracker immediately. AM to contact customer stakeholder within 24 hrs.', dueDate: '30-May-26', status: 'Open' },
      { id: 'PS-R-002', type: 'R', pocProject: '', description: 'Customer exits POC without sign-off, blocking commercial conversion', probability: 'Medium', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Success criteria must be agreed in Phase 1. PM to review if Phase 4 runs beyond 48 hrs without response.', dueDate: 'POC end date', status: 'Open' },
      { id: 'PS-R-003', type: 'R', pocProject: '', description: 'POC scope creep requested by customer mid-trial, delaying Phase 3', probability: 'Medium', severity: 'Medium', owner: 'Pre-sales Owner', mitigation: 'Any scope change post Phase 1 sign-off requires written agreement and may trigger POC extension fee.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'PS-A-001', type: 'A', pocProject: '', description: 'Customer has admin / global admin access ready before POC Phase 2 environment setup', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Confirm in discovery call. Document in POC Submission sheet. Chase weekly if not confirmed.', dueDate: 'Phase 1', status: 'Open' },
      { id: 'PS-A-002', type: 'A', pocProject: '', description: 'Source and destination platforms are supported by CF Migrate for the agreed workload types', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Validate platform compatibility before POC kick-off. Raise to Dev team if unsupported connector needed.', dueDate: 'Pre-POC', status: 'Open' },
      { id: 'PS-A-003', type: 'A', pocProject: '', description: 'Customer stakeholder has authority to sign off POC outcome and progress to full migration', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Confirm decision-maker in discovery call. Ensure sign-off contact is documented in POC record.', dueDate: 'Phase 1', status: 'Open' },
      { id: 'PS-I-001', type: 'I', pocProject: 'Alpine Systems', description: 'Alpine Systems — POC stale, no pre-sales update for 5 days, POC ends 30 May 2026', probability: '—', severity: 'Medium', owner: 'Pre-sales Owner', mitigation: 'AM to chase Dana M. today. If no update by 27 May, AM contacts Tom Reyes (customer) directly.', dueDate: '27-May-26', status: 'Escalated' },
      { id: 'PS-I-002', type: 'I', pocProject: 'Contoso Ltd', description: 'Contoso Ltd — POC validation phase delayed, customer sign-off 2 days overdue', probability: '—', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Pre-sales to contact Sarah Lin. If unresolved in 24 hrs, AM to escalate to customer senior stakeholder.', dueDate: '28-May-26', status: 'Open' },
      { id: 'PS-D-001', type: 'D', pocProject: '', description: 'Admin access must be granted by customer IT before Phase 2 environment setup can begin', probability: '—', severity: 'High', owner: 'Customer IT', mitigation: 'Flagged in POC scope document. Pre-sales to chase weekly. Blocker to be logged in PMO tracker.', dueDate: 'Phase 2 start', status: 'Open' },
      { id: 'PS-D-002', type: 'D', pocProject: '', description: 'NDA and data handling agreement must be signed before trial migration data is processed', probability: '—', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Standard NDA to be sent with POC scope document. Legal to review if customer proposes amendments.', dueDate: 'Phase 1', status: 'Open' },
    ],
  },
  {
    team: 'Migration Team',
    rows: [
      { id: 'MT-R-001', type: 'R', description: 'Admin credentials expiring mid-migration causing wave execution to stall', probability: 'High', severity: 'High', owner: 'Migration Manager', mitigation: 'Validate credential expiry dates before each wave. Customer IT to confirm rotation schedule in advance.', dueDate: 'Before each wave', status: 'Escalated' },
      { id: 'MT-R-002', type: 'R', description: 'Migration speed below benchmark due to customer network throttling', probability: 'Medium', severity: 'Medium', owner: 'Migration Manager', mitigation: 'Run speed test in Phase 2. Agree bandwidth allocation window with customer IT before Wave 1.', dueDate: 'Before Wave 1', status: 'Open' },
      { id: 'MT-R-003', type: 'R', description: 'Permissions not replicating correctly to destination platform', probability: 'Medium', severity: 'High', owner: 'Migration Manager', mitigation: 'Permissions validation is mandatory post each wave. Escalate to Dev if error rate exceeds 2%.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'MT-R-004', type: 'R', description: 'Data volume exceeds agreed scope by more than 15%, requiring re-scoping', probability: 'Low', severity: 'Medium', owner: 'Migration Manager', mitigation: 'Re-scan source before each wave. Raise change request if volume threshold is exceeded.', dueDate: 'Before Wave 1', status: 'Open' },
      { id: 'MT-R-005', type: 'R', description: 'Go-live date missed due to customer IT blockers, triggering overage charges', probability: 'High', severity: 'High', owner: 'Migration Manager', mitigation: 'Log all customer-caused blockers immediately. AM to send overage notice. Delivery head to approve charge.', dueDate: 'On trigger', status: 'Open' },
      { id: 'MT-A-001', type: 'A', description: 'Customer IT team is available and responsive during agreed migration windows', probability: '—', severity: '—', owner: 'Account Manager', mitigation: 'Availability windows to be confirmed at project kick-off and documented in the wave plan.', dueDate: 'Kick-off', status: 'Open' },
      { id: 'MT-A-002', type: 'A', description: 'Source platform remains live and accessible until the final wave is completed', probability: '—', severity: '—', owner: 'Customer Stakeholder', mitigation: 'Source decommission date must be agreed in cutover plan. Not before CloudFuze written sign-off.', dueDate: 'Cutover plan', status: 'Open' },
      { id: 'MT-A-003', type: 'A', description: 'Delta migration will be used to capture changes made during the migration window', probability: '—', severity: '—', owner: 'Migration Manager', mitigation: 'Delta migration to be tested in Phase 3. Confirm delta capture interval with customer before go-live.', dueDate: 'Phase 3', status: 'Open' },
      { id: 'MT-I-001', type: 'I', description: 'Contoso Ltd — admin credentials expired, Wave 2 content migration paused for 7+ days', probability: '—', severity: 'High', owner: 'Migration Manager', mitigation: 'Escalated to Ben Marsh (IT Lead). AM to escalate to senior stakeholder if unresolved by 28 May.', dueDate: '28-May-26', status: 'Escalated' },
      { id: 'MT-I-002', type: 'I', description: 'Northwind Traders — Wave 2 blocked, 38% progress, go-live 10 Jun 2026 now at risk', probability: '—', severity: 'High', owner: 'Account Manager', mitigation: 'Overage notice to be sent by 28 May. Escalate to senior stakeholder if IT unresponsive by 29 May.', dueDate: '28-May-26', status: 'Escalated' },
      { id: 'MT-I-003', type: 'I', description: 'Lucerne Publishing — calendar sync failing for 52 mailboxes post-cutover', probability: '—', severity: 'Medium', owner: 'Migration Manager', mitigation: 'Root cause under investigation. Fix targeted 30 May. Customer to be updated every 48 hrs.', dueDate: '30-May-26', status: 'In progress' },
      { id: 'MT-D-001', type: 'D', description: 'Bandwidth allocation window must be agreed with customer IT before each migration wave', probability: '—', severity: 'High', owner: 'Customer IT', mitigation: 'Document agreed window in wave plan. Written confirmation required per wave start.', dueDate: 'Per wave', status: 'Open' },
      { id: 'MT-D-002', type: 'D', description: 'Destination tenant must be provisioned and licensed before migration can begin', probability: '—', severity: 'High', owner: 'Customer IT', mitigation: 'Confirm provisioning status in Phase 2 checklist. Block wave start if unlicensed users exist.', dueDate: 'Phase 2', status: 'Open' },
      { id: 'MT-D-003', type: 'D', description: 'Customer sign-off on post-wave validation report required before next wave commences', probability: '—', severity: 'Medium', owner: 'Account Manager', mitigation: 'Include sign-off step in wave completion checklist. 24-hr response window agreed with customer.', dueDate: 'Post each wave', status: 'Open' },
    ],
  },
  {
    team: 'Account Management Team',
    rows: [
      { id: 'AM-R-001', type: 'R', description: 'Customer disputes overage charges due to insufficient written notice', probability: 'Low', severity: 'High', owner: 'Account Manager', mitigation: 'Send overage notice in writing before charges apply. Copy delivery head. Use standard template.', dueDate: 'On trigger', status: 'Open' },
      { id: 'AM-R-002', type: 'R', description: 'Renewal lost due to low CSAT and unresolved post-migration issues', probability: 'Medium', severity: 'High', owner: 'Account Manager', mitigation: 'Monitor CSAT weekly in CS track. Trigger recovery call if score drops below 3.5. Escalate to delivery head.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'AM-R-003', type: 'R', description: 'Upsell opportunity missed due to delayed engagement post-migration', probability: 'Medium', severity: 'Medium', owner: 'Account Manager', mitigation: 'Review CF product signals in CS view at day 14 and day 30. Initiate upsell conversation within 30 days of go-live.', dueDate: 'Day-30', status: 'Open' },
      { id: 'AM-R-004', type: 'R', description: 'Customer escalation damages relationship before AM is aware of the issue', probability: 'Medium', severity: 'High', owner: 'Account Manager', mitigation: 'AM to monitor escalation flags in PMO tracker daily. Recovery call to be held within 48 hrs of flag.', dueDate: 'On flag', status: 'Open' },
      { id: 'AM-A-001', type: 'A', description: 'Customer will complete CSAT surveys at day 7, day 30, and day 90 check-in points', probability: '—', severity: '—', owner: 'Account Manager', mitigation: 'Include survey commitment in post-migration sign-off document. Chase manually if not returned in 3 days.', dueDate: 'Per survey', status: 'Open' },
      { id: 'AM-A-002', type: 'A', description: 'Contract covers Content, Messaging, and Email workloads as agreed in the SOW', probability: '—', severity: '—', owner: 'Account Manager', mitigation: 'Any additional workload requires a change request and separate pricing. Confirm scope at project kick-off.', dueDate: 'SOW date', status: 'Open' },
      { id: 'AM-A-003', type: 'A', description: 'Customer decision-maker for renewal is the same contact as the project stakeholder', probability: '—', severity: '—', owner: 'Account Manager', mitigation: 'Confirm renewal authority in discovery and re-confirm at QBR. Update contact record in CRM if it changes.', dueDate: 'QBR', status: 'Open' },
      { id: 'AM-I-001', type: 'I', description: 'Lucerne Publishing — CSAT at 2.8, customer dissatisfied with support response time', probability: '—', severity: 'High', owner: 'Account Manager', mitigation: 'Recovery call with Julia Moss required by 28 May. Do not wait for ticket resolution before calling.', dueDate: '28-May-26', status: 'Escalated' },
      { id: 'AM-I-002', type: 'I', description: 'Contoso Ltd — overage charge conversation not yet initiated, delay accumulating', probability: '—', severity: 'High', owner: 'Account Manager', mitigation: 'Overage notice to be sent to Ben Marsh by 28 May. Copy delivery head on all overage correspondence.', dueDate: '28-May-26', status: 'Open' },
      { id: 'AM-I-003', type: 'I', description: 'Fabrikam Inc — adoption plateaued at 58%, renewal in 75 days, sentiment neutral', probability: '—', severity: 'Medium', owner: 'Account Manager', mitigation: 'Propose PS-led adoption programme. Initiate renewal conversation now. Send adoption benchmark report.', dueDate: '05-Jun-26', status: 'Open' },
      { id: 'AM-D-001', type: 'D', description: 'Signed overage acknowledgement required from customer before additional charges are raised', probability: '—', severity: 'High', owner: 'Account Manager', mitigation: 'Use standard overage notice template. Delivery head approval required before sending.', dueDate: 'On trigger', status: 'Open' },
      { id: 'AM-D-002', type: 'D', description: 'QBR to be conducted before renewal conversation can be initiated for enterprise accounts', probability: '—', severity: 'Medium', owner: 'Account Manager', mitigation: 'QBR to be scheduled at day 60 post-migration. Include CSAT report, adoption data, and product signals.', dueDate: 'Day-60', status: 'Open' },
      { id: 'AM-D-003', type: 'D', description: 'CF product signal assessment (CF Manage / PS / Managed Services) required before upsell proposal', probability: '—', severity: 'Medium', owner: 'Account Manager', mitigation: 'Review CS track product signal cards at day 30. AM to qualify signal before proposing.', dueDate: 'Day-30', status: 'Open' },
    ],
  },
  {
    team: 'Dev Team',
    rows: [
      { id: 'DV-R-001', type: 'R', description: 'Unsupported source or destination connector requested during POC or migration', probability: 'Medium', severity: 'High', owner: 'Dev Team Lead', mitigation: 'Pre-sales to validate platform support before POC kick-off. Dev team to assess new connector in 5 business days.', dueDate: 'On request', status: 'Open' },
      { id: 'DV-R-002', type: 'R', description: 'Connector API deprecation by source or destination platform mid-migration', probability: 'Low', severity: 'High', owner: 'Dev Team Lead', mitigation: 'Monitor platform API changelogs monthly. Maintain 90-day advance notice protocol with engineering lead.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'DV-R-003', type: 'R', description: 'Custom metadata mapping request cannot be fulfilled within POC timeline', probability: 'Medium', severity: 'Medium', owner: 'Dev Team Lead', mitigation: 'Custom mapping to be scoped separately. Pre-sales to flag to Dev at Phase 1. Minimum 5-day dev lead time.', dueDate: 'Phase 1', status: 'Open' },
      { id: 'DV-R-004', type: 'R', description: 'Performance regression in CF Migrate impacting migration speed during active customer wave', probability: 'Low', severity: 'High', owner: 'Dev Team Lead', mitigation: 'Staging environment testing mandatory before each major release. Rollback plan to be maintained.', dueDate: 'Per release', status: 'Open' },
      { id: 'DV-A-001', type: 'A', description: 'CF Migrate supports all three workload types (Content, Messaging, Email) for agreed source/destination pairs', probability: '—', severity: '—', owner: 'Dev Team Lead', mitigation: 'Compatibility matrix to be maintained and reviewed monthly. Pre-sales to check before every POC.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'DV-A-002', type: 'A', description: 'API rate limits imposed by source or destination platforms will not materially affect migration speed', probability: '—', severity: '—', owner: 'Dev Team Lead', mitigation: 'Rate limit thresholds documented per connector. Migration manager to be briefed before each wave.', dueDate: 'Pre-wave', status: 'Open' },
      { id: 'DV-A-003', type: 'A', description: 'Hotfixes for critical migration bugs can be deployed within 24 hours of identification', probability: '—', severity: '—', owner: 'Dev Team Lead', mitigation: '24-hr SLA for P1 bugs confirmed with engineering lead. On-call rotation to be in place during active migrations.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'DV-I-001', type: 'I', description: 'Lucerne Publishing — SharePoint permission replication bug causing 2 unresolved tickets for 21 days', probability: '—', severity: 'High', owner: 'Dev Team Lead', mitigation: 'Root cause investigation in progress. Fix to be deployed by 30 May. Migration manager to validate post-fix.', dueDate: '30-May-26', status: 'In progress' },
      { id: 'DV-I-002', type: 'I', description: 'Lucerne Publishing — calendar sync failure for 52 mailboxes, suspected connector issue', probability: '—', severity: 'Medium', owner: 'Dev Team Lead', mitigation: 'Logs pulled and under analysis. Fix targeted 30 May. Customer to receive update every 48 hrs.', dueDate: '30-May-26', status: 'In progress' },
      { id: 'DV-I-003', type: 'I', description: 'CF Migrate connector for NAS / FileShare source flagged as requiring update for latest OS version', probability: '—', severity: 'Medium', owner: 'Dev Team Lead', mitigation: 'Connector update scoped for next sprint. Relecloud Corp migration paused pending fix.', dueDate: '15-Jun-26', status: 'Open' },
      { id: 'DV-D-001', type: 'D', description: 'Source and destination platform API credentials must be valid before Dev can test connector config', probability: '—', severity: 'High', owner: 'Customer IT', mitigation: 'Credential provisioning to be confirmed in Phase 2 checklist. Dev team blocked without valid API tokens.', dueDate: 'Phase 2', status: 'Open' },
      { id: 'DV-D-002', type: 'D', description: 'Staging environment must be available and mirroring production before each release', probability: '—', severity: 'High', owner: 'Dev Team Lead', mitigation: 'Staging parity to be confirmed by engineering lead before release sign-off.', dueDate: 'Per release', status: 'Open' },
      { id: 'DV-D-003', type: 'D', description: 'Pre-sales must flag custom connector or mapping requirements at Phase 1 for Dev scoping', probability: '—', severity: 'Medium', owner: 'Pre-sales Owner', mitigation: 'Custom requirements log to be maintained in POC Submission sheet. Dev to be looped in within 24 hrs of flag.', dueDate: 'Phase 1', status: 'Open' },
    ],
  },
];

// ── Initial RAG data ──────────────────────────────────────────────────────────

const INITIAL_RAG_ACTIVE = [
  { account: 'Contoso Ltd', workload: 'Content + Email', mgr: 'Priya S.', am: 'TBD', overall: 'R', schedule: 'R', scope: 'G', resource: 'G', customer: 'A', budget: 'A', comment: 'Admin credentials expired — Wave 2 paused 7+ days. Go-live 15 Jul at risk. Overage accumulating.', updated: '27-May-26' },
  { account: 'Alpine Systems', workload: 'Messaging', mgr: 'Dana M.', am: 'TBD', overall: 'A', schedule: 'A', scope: 'G', resource: 'G', customer: 'A', budget: 'G', comment: 'POC stale — no pre-sales update in 5 days. POC ends 30 May. AM to contact customer if unresolved today.', updated: '22-May-26' },
  { account: 'Fabrikam Inc', workload: 'Content + Messaging', mgr: 'Arjun T.', am: 'TBD', overall: 'A', schedule: 'G', scope: 'G', resource: 'G', customer: 'A', budget: 'G', comment: 'Wave 2 starts 28 May — customer comms not yet sent. Adoption at 62%, on track but watch customer engagement.', updated: '25-May-26' },
  { account: 'Woodgrove Bank', workload: 'Email', mgr: 'Ravi K.', am: 'TBD', overall: 'G', schedule: 'G', scope: 'G', resource: 'G', customer: 'G', budget: 'G', comment: 'Email migration 43% complete. No blockers. On track for 15 Jul go-live.', updated: '27-May-26' },
  { account: 'Northwind Traders', workload: 'Content', mgr: 'Priya S.', am: 'TBD', overall: 'R', schedule: 'R', scope: 'G', resource: 'G', customer: 'R', budget: 'A', comment: 'Wave 2 blocked — admin access expired. At 38% with go-live 10 Jun. Overage notice to be sent 28 May.', updated: '27-May-26' },
  { account: 'Lucerne Publishing', workload: 'Content + Email', mgr: 'Neha R.', am: 'TBD', overall: 'R', schedule: 'G', scope: 'G', resource: 'G', customer: 'R', budget: 'G', comment: 'Migration complete but 2 permission tickets open 21 days. Calendar sync failing 52 mailboxes. CSAT 2.8.', updated: '25-May-26' },
  { account: 'Tailwind Toys', workload: 'Content + Messaging', mgr: 'Priya S.', am: 'TBD', overall: 'G', schedule: 'G', scope: 'G', resource: 'G', customer: 'G', budget: 'G', comment: 'Migration completed 18 May. CS track open. Adoption 74% and growing. Renewal conversation due.', updated: '27-May-26' },
];

const INITIAL_RAG_CS = [
  { account: 'Tailwind Toys', workload: 'Content + Messaging', csOwner: 'Priya S.', am: 'TBD', overall: 'G', adoption: 'G', csat: 'G', tickets: 'G', renewal: 'A', upsell: 'G', comment: 'Day 5. Adoption 74%. CSAT 4.4. Renewal due 15 Jun — initiate proposal this week.', updated: '27-May-26' },
  { account: 'Woodgrove Bank', workload: 'Email', csOwner: 'Ravi K.', am: 'TBD', overall: 'G', adoption: 'G', csat: 'G', tickets: 'G', renewal: 'A', upsell: 'G', comment: 'Day 13. Mailbox access 98%. CSAT 4.6. Renewal 30 Jun. Upsell: content migration Div 2 + CF Manage.', updated: '27-May-26' },
  { account: 'Fabrikam Inc', workload: 'Content + Messaging', csOwner: 'Arjun T.', am: 'TBD', overall: 'A', adoption: 'A', csat: 'A', tickets: 'G', renewal: 'A', upsell: 'A', comment: 'Day 45. Adoption plateaued at 58%. CSAT 3.6. Renewal 5 Aug. PS-led enablement programme to be proposed.', updated: '25-May-26' },
  { account: 'Lucerne Publishing', workload: 'Content + Email', csOwner: 'Neha R.', am: 'TBD', overall: 'R', adoption: 'R', csat: 'R', tickets: 'R', renewal: 'R', upsell: '—', comment: 'Day 22. CSAT 2.8. 2 permission tickets 21 days open. Calendar sync failing. Recovery call required 28 May.', updated: '25-May-26' },
];

const INITIAL_RAG_TEAM = [
  { team: 'Pre-sales Team', lead: 'Pre-sales Lead', active: '3 POCs active', escalations: 1, overall: 'A', capacity: 'G', blockers: 'A', concern: 'Alpine Systems stale. POC deadline risk 30 May. Capacity stretched across 3 concurrent POCs.', updated: '27-May-26' },
  { team: 'Migration Team', lead: 'Migration Lead', active: '4 migrations', escalations: 3, overall: 'R', capacity: 'A', blockers: 'R', concern: 'Two accounts blocked on credentials. Contoso and Northwind both critical. Engineering support needed.', updated: '27-May-26' },
  { team: 'Account Management Team', lead: 'AM Lead', active: '7 accounts', escalations: 2, overall: 'A', capacity: 'G', blockers: 'A', concern: 'Lucerne Publishing recovery call overdue. Overage notice for Northwind not yet sent.', updated: '27-May-26' },
  { team: 'Dev Team', lead: 'Dev Lead', active: '2 bugs active', escalations: 2, overall: 'A', capacity: 'G', blockers: 'A', concern: 'Permission replication bug and calendar sync fix both due 30 May. On track but watch closely.', updated: '27-May-26' },
];

// ── Cell components ───────────────────────────────────────────────────────────

function RaciCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        onClick={() => setOpen(!open)}
        className={cn('w-8 h-7 rounded text-xs cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all', RACI_STYLE[value] || 'text-gray-300')}
      >
        {value}
      </button>
      {open && (
        <div className="absolute z-50 top-8 bg-white rounded-lg shadow-xl border border-gray-200 p-1 flex gap-1">
          {RACI_ORDER.map(v => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={cn('w-8 h-7 rounded text-xs font-medium transition-all hover:scale-110', RACI_STYLE[v], value === v && 'ring-2 ring-offset-1 ring-blue-500')}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RagCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        onClick={() => setOpen(!open)}
        className={cn('px-2.5 py-1 rounded text-xs cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all min-w-[2rem]', RAG_STYLE[value] || 'bg-gray-100 text-gray-400')}
      >
        {value}
      </button>
      {open && (
        <div className="absolute z-50 top-8 bg-white rounded-lg shadow-xl border border-gray-200 p-1 flex gap-1">
          {RAG_ORDER.map(v => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={cn('px-2.5 py-1 rounded text-xs font-medium transition-all hover:scale-110', RAG_STYLE[v], value === v && 'ring-2 ring-offset-1 ring-gray-500')}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectCell({ value, options, style, onChange }: { value: string; options: string[]; style: Record<string, string>; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={cn('px-2 py-0.5 rounded text-xs cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all whitespace-nowrap', style[value] || 'bg-gray-100 text-gray-500')}>
        {value}
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-1 min-w-[100px]">
          {options.map(v => (
            <button key={v} onClick={() => { onChange(v); setOpen(false); }} className={cn('block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-gray-50', style[v] || 'text-gray-600', value === v && 'font-semibold')}>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableText({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const save = () => { onChange(draft); setEditing(false); };
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={cn('w-full border border-blue-400 rounded px-1.5 py-0.5 text-xs outline-none bg-blue-50', className)}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn('cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-xs block', !value && 'text-gray-300 italic', className)}
      title="Click to edit"
    >
      {value || 'Click to edit'}
    </span>
  );
}

function EditableArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const save = () => { onChange(draft); setEditing(false); };
  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        rows={3}
        className="w-full border border-blue-400 rounded px-1.5 py-1 text-xs outline-none bg-blue-50 resize-none"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn('cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-xs block leading-relaxed', !value && 'text-gray-300 italic')}
      title="Click to edit"
    >
      {value || 'Click to edit'}
    </span>
  );
}

// ── RACI Tab ─────────────────────────────────────────────────────────────────

function RaciTab({ data, setData }: { data: typeof INITIAL_RACI; setData: (d: typeof INITIAL_RACI) => void }) {
  const COLS: { key: keyof (typeof INITIAL_RACI)[0]['rows'][0]; label: string }[] = [
    { key: 'dh', label: 'Delivery Head' },
    { key: 'mm', label: 'Migration Manager' },
    { key: 'ps', label: 'Pre-sales Owner' },
    { key: 'am', label: 'Account Manager' },
    { key: 'cs', label: 'Customer Success' },
    { key: 'cit', label: 'Customer IT' },
    { key: 'cst', label: 'Customer Stakeholder' },
  ];

  const updateCell = (pi: number, ri: number, field: string, value: string) => {
    const next = data.map((phase, pIdx) => ({
      ...phase,
      rows: phase.rows.map((row, rIdx) => (pi === pIdx && ri === rIdx ? { ...row, [field]: value } : row)),
    }));
    setData(next);
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 flex gap-4 flex-wrap text-xs text-gray-500">
        {[['R', 'Responsible — does the work', RACI_STYLE.R], ['A', 'Accountable — owns the outcome', RACI_STYLE.A], ['C', 'Consulted — input required', RACI_STYLE.C], ['I', 'Informed — kept updated', RACI_STYLE.I]].map(([k, label, cls]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('w-6 h-5 rounded text-xs flex items-center justify-center', cls as string)}>{k}</span>
            {label}
          </span>
        ))}
        <span className="text-gray-400 italic">Click any RACI cell to change its value</span>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left py-2.5 px-3 font-semibold text-slate-600 border border-slate-200 w-32">Phase</th>
            <th className="text-left py-2.5 px-3 font-semibold text-slate-600 border border-slate-200">Activity / Task</th>
            {COLS.map(c => (
              <th key={c.key} className="py-2.5 px-2 font-semibold text-slate-600 border border-slate-200 text-center whitespace-nowrap">{c.label}</th>
            ))}
            <th className="text-left py-2.5 px-3 font-semibold text-slate-600 border border-slate-200">Notes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((phase, pi) =>
            phase.rows.map((row, ri) => (
              <tr key={`${pi}-${ri}`} className="hover:bg-blue-50/30 transition-colors">
                {ri === 0 && (
                  <td rowSpan={phase.rows.length} className="py-2 px-3 border border-slate-200 font-medium text-slate-700 bg-slate-50 align-top text-center text-[11px] leading-snug">
                    {phase.phase}
                  </td>
                )}
                <td className="py-2 px-3 border border-slate-200 text-slate-700">{row.activity}</td>
                {COLS.map(c => (
                  <td key={c.key} className="py-1.5 px-1 border border-slate-200">
                    <RaciCell value={row[c.key] as string} onChange={v => updateCell(pi, ri, c.key, v)} />
                  </td>
                ))}
                <td className="py-1.5 px-2 border border-slate-200">
                  <EditableText value={row.notes} onChange={v => updateCell(pi, ri, 'notes', v)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── RAID Tab ─────────────────────────────────────────────────────────────────

const TYPE_CARD: Record<string, { color: string; bg: string; border: string; desc: string }> = {
  R: { color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',    desc: 'Something that could go wrong' },
  A: { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',   desc: 'Something assumed to be true' },
  I: { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300',  desc: 'A current problem or blocker' },
  D: { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-300', desc: 'Something we rely on externally' },
};

function AddRaidModal({ teamPrefix, existingRows, onAdd, onClose }: {
  teamPrefix: string;
  existingRows: { id: string; type: string }[];
  onAdd: (row: typeof INITIAL_RAID[0]['rows'][0]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [form, setForm] = useState({ type: '', description: '', probability: '—', severity: '—', owner: '', mitigation: '', dueDate: '', status: 'Open' });

  const selectType = (t: string) => {
    const countOfType = existingRows.filter(r => r.type === t).length + 1;
    const id = `${teamPrefix}-${t}-${String(countOfType).padStart(3, '0')}`;
    setForm(f => ({ ...f, type: t, id }));
    setStep('form');
  };

  const submit = () => {
    if (!form.description.trim()) return;
    onAdd({ ...(form as any) });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-slate-800">
            {step === 'type' ? 'Select Entry Type' : `New ${TYPE_LABEL[form.type]} — ${(form as any).id}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {step === 'type' ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(TYPE_CARD).map(([k, cfg]) => (
                <button
                  key={k}
                  onClick={() => selectType(k)}
                  className={cn('flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] hover:shadow-md', cfg.bg, cfg.border)}
                >
                  <span className={cn('text-sm font-bold', cfg.color)}>{k} — {TYPE_LABEL[k]}</span>
                  <span className="text-xs text-gray-500">{cfg.desc}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  placeholder="Describe the risk / assumption / issue / dependency…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Probability</label>
                  <select value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
                    {['High', 'Medium', 'Low', '—'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Severity</label>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
                    {['High', 'Medium', 'Low', '—'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
                <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. Migration Manager" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mitigation / Action</label>
                <textarea rows={2} value={form.mitigation} onChange={e => setForm(f => ({ ...f, mitigation: e.target.value }))} placeholder="Steps to mitigate or resolve…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                  <input value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} placeholder="e.g. 30-Jun-26" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
                    {['Open', 'Escalated', 'In progress', 'Closed'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setStep('type')} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">← Change type</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button
                onClick={submit}
                disabled={!form.description.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add Entry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function PocProjectCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setDraft(value); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value]);

  const uniqueOptions = Array.from(new Set(options.filter(Boolean)));

  const select = (v: string) => { onChange(v); setDraft(v); setOpen(false); };

  const commit = () => { onChange(draft); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setDraft(value); setOpen(!open); }}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-700 hover:bg-blue-50 transition-colors w-full text-left"
      >
        <span className="flex-1 truncate">{value || <span className="text-gray-300 italic">—</span>}</span>
        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[180px] overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setOpen(false); setDraft(value); } }}
              placeholder="Type or select…"
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400"
            />
          </div>
          <div className="max-h-40 overflow-y-auto py-1">
            {uniqueOptions.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400 italic">No projects yet</p>
            )}
            {uniqueOptions.map(opt => (
              <button
                key={opt}
                onClick={() => select(opt)}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${value === opt ? 'font-semibold text-indigo-700 bg-indigo-50' : 'text-slate-700'}`}
              >
                {opt}
              </button>
            ))}
            {draft && !uniqueOptions.includes(draft) && (
              <button
                onClick={() => select(draft)}
                className="block w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-gray-100 mt-1"
              >
                + Add &ldquo;{draft}&rdquo;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type RaidSortField = 'id' | 'type' | 'pocProject' | 'description' | 'probability' | 'severity' | 'owner' | 'mitigation' | 'dueDate' | 'status';

const PROB_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, '—': 3 };
const STATUS_ORDER: Record<string, number> = { Escalated: 0, Open: 1, 'In progress': 2, Closed: 3 };

function sortRaidRows(rows: typeof INITIAL_RAID[0]['rows'], field: RaidSortField, dir: 'asc' | 'desc') {
  return [...rows].sort((a, b) => {
    let va: string | number = (a as any)[field] ?? '';
    let vb: string | number = (b as any)[field] ?? '';
    if (field === 'probability' || field === 'severity') {
      va = PROB_ORDER[va] ?? 99;
      vb = PROB_ORDER[vb] ?? 99;
    } else if (field === 'status') {
      va = STATUS_ORDER[va] ?? 99;
      vb = STATUS_ORDER[vb] ?? 99;
    }
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb));
    return dir === 'asc' ? cmp : -cmp;
  });
}

function RaidTab({ data, setData, projectManagers }: { data: typeof INITIAL_RAID; setData: (d: typeof INITIAL_RAID) => void; projectManagers: string[] }) {
  const [activeTeam, setActiveTeam] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [sortField, setSortField] = useState<RaidSortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const PROB_OPTS = ['High', 'Medium', 'Low', '—'];
  const STATUS_OPTS = ['Open', 'Escalated', 'In progress', 'Closed'];
  const TYPE_OPTS = ['R', 'A', 'I', 'D'];

  const team = data[activeTeam];
  const isPreSales = team.team.startsWith('Pre');
  const isMigration = team.team.startsWith('Migration');
  const teamPrefix = isPreSales ? 'PS' : isMigration ? 'MT' : team.team.startsWith('Account') ? 'AM' : 'DV';

  const handleSort = (field: RaidSortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: RaidSortField }) => {
    if (sortField !== field) return <span className="ml-1 text-slate-300">↕</span>;
    return <span className="ml-1 text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const sortedRows = sortField ? sortRaidRows(team.rows, sortField, sortDir) : team.rows;

  const updateField = (ri: number, field: string, value: string) => {
    setData(data.map((t, tIdx) => ({
      ...t,
      rows: tIdx === activeTeam
        ? t.rows.map((row, rIdx) => (ri === rIdx ? { ...row, [field]: value } : row))
        : t.rows,
    })));
  };

  const addRow = (newRow: typeof INITIAL_RAID[0]['rows'][0]) => {
    setData(data.map((t, tIdx) => tIdx === activeTeam ? { ...t, rows: [...t.rows, newRow] } : t));
  };

  const deleteRow = (ri: number) => {
    setData(data.map((t, tIdx) => tIdx === activeTeam ? { ...t, rows: t.rows.filter((_, rIdx) => rIdx !== ri) } : t));
  };

  const thClass = "py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap";

  return (
    <div className="space-y-4">
      {showModal && (
        <AddRaidModal
          teamPrefix={teamPrefix}
          existingRows={team.rows}
          onAdd={addRow}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="flex gap-4 flex-wrap text-xs text-gray-500">
        {Object.entries(TYPE_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', TYPE_STYLE[k])}>{k}</span>
            {label}
          </span>
        ))}
        <span className="text-gray-400 italic">Click any cell to edit · Click column header to sort</span>
      </div>

      {/* Sub-tabs + Add button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-gray-200 flex-1">
          {data.map((t, ti) => (
            <button
              key={t.team}
              onClick={() => { setActiveTeam(ti); setSortField(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px',
                activeTeam === ti
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {t.team}
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold', activeTeam === ti ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500')}>
                {t.rows.length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="ml-3 mb-px flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Entry
        </button>
      </div>

      {/* Table for active team */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className={cn(thClass, 'text-left w-24')} onClick={() => handleSort('id')}>ID<SortIcon field="id" /></th>
              <th className={cn(thClass, 'text-left w-24')} onClick={() => handleSort('type')}>Type<SortIcon field="type" /></th>
              {isPreSales && <th className={cn(thClass, 'text-left w-32')} onClick={() => handleSort('pocProject')}>POC Project<SortIcon field="pocProject" /></th>}
              <th className={cn(thClass, 'text-left')} onClick={() => handleSort('description')}>Description<SortIcon field="description" /></th>
              <th className={cn(thClass, 'text-center w-20')} onClick={() => handleSort('probability')}>Probability<SortIcon field="probability" /></th>
              <th className={cn(thClass, 'text-center w-20')} onClick={() => handleSort('severity')}>Severity<SortIcon field="severity" /></th>
              <th className={cn(thClass, 'text-left w-36')} onClick={() => handleSort('owner')}>{isPreSales ? 'Pre-Sales Engineer' : isMigration ? 'Migration Manager' : 'Owner'}<SortIcon field="owner" /></th>
              <th className={cn(thClass, 'text-left')} onClick={() => handleSort('mitigation')}>Mitigation / Action<SortIcon field="mitigation" /></th>
              <th className={cn(thClass, 'text-left w-24')} onClick={() => handleSort('dueDate')}>Due Date<SortIcon field="dueDate" /></th>
              <th className={cn(thClass, 'text-left w-24')} onClick={() => handleSort('status')}>Status<SortIcon field="status" /></th>
              <th className="py-2 px-2 border-b border-slate-200 w-8" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => {
              const originalRi = team.rows.indexOf(row);
              return (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 group">
                  <td className="py-2 px-3">
                    <EditableText value={row.id} onChange={v => updateField(originalRi, 'id', v)} className="font-mono text-slate-500" />
                  </td>
                  <td className="py-2 px-3">
                    <SelectCell value={row.type} options={TYPE_OPTS} style={TYPE_STYLE} onChange={v => updateField(originalRi, 'type', v)} />
                  </td>
                  {isPreSales && (
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <PocProjectCell
                        value={(row as any).pocProject ?? ''}
                        options={team.rows.map((r: any) => r.pocProject ?? '')}
                        onChange={v => updateField(originalRi, 'pocProject', v)}
                      />
                    </td>
                  )}
                  <td className="py-1.5 px-2 max-w-xs">
                    <EditableArea value={row.description} onChange={v => updateField(originalRi, 'description', v)} />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <SelectCell value={row.probability} options={PROB_OPTS} style={PROB_STYLE} onChange={v => updateField(originalRi, 'probability', v)} />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <SelectCell value={row.severity} options={PROB_OPTS} style={SEV_STYLE} onChange={v => updateField(originalRi, 'severity', v)} />
                  </td>
                  <td className="py-1.5 px-2">
                    {isMigration ? (
                      <PocProjectCell
                        value={row.owner}
                        options={projectManagers}
                        onChange={v => updateField(originalRi, 'owner', v)}
                      />
                    ) : (
                      <EditableText value={row.owner} onChange={v => updateField(originalRi, 'owner', v)} />
                    )}
                  </td>
                  <td className="py-1.5 px-2 max-w-xs">
                    <EditableArea value={row.mitigation} onChange={v => updateField(originalRi, 'mitigation', v)} />
                  </td>
                  <td className="py-1.5 px-2">
                    <EditableText value={row.dueDate} onChange={v => updateField(originalRi, 'dueDate', v)} />
                  </td>
                  <td className="py-1.5 px-2">
                    <SelectCell value={row.status} options={STATUS_OPTS} style={STATUS_STYLE} onChange={v => updateField(originalRi, 'status', v)} />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <button
                      onClick={() => deleteRow(originalRi)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5 rounded"
                      title="Delete row"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── RAG Tab ──────────────────────────────────────────────────────────────────

function RagTab({
  active, setActive, cs, setCs, team, setTeam,
}: {
  active: typeof INITIAL_RAG_ACTIVE; setActive: (d: typeof INITIAL_RAG_ACTIVE) => void;
  cs: typeof INITIAL_RAG_CS; setCs: (d: typeof INITIAL_RAG_CS) => void;
  team: typeof INITIAL_RAG_TEAM; setTeam: (d: typeof INITIAL_RAG_TEAM) => void;
}) {
  const [activeSection, setActiveSection] = useState<'active' | 'cs' | 'team'>('active');
  const RAG_FIELDS_ACTIVE: (keyof (typeof INITIAL_RAG_ACTIVE)[0])[] = ['overall', 'schedule', 'scope', 'resource', 'customer', 'budget'];
  const RAG_FIELDS_CS: (keyof (typeof INITIAL_RAG_CS)[0])[] = ['overall', 'adoption', 'csat', 'tickets', 'renewal', 'upsell'];
  const RAG_FIELDS_TEAM: (keyof (typeof INITIAL_RAG_TEAM)[0])[] = ['overall', 'capacity', 'blockers'];

  const sections = [
    { key: 'active' as const, label: 'Active Projects', count: active.length },
    { key: 'cs'     as const, label: 'Customer Success', count: cs.length },
    { key: 'team'   as const, label: 'Team Health', count: team.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-4 flex-wrap text-xs text-gray-500">
        {[['G', 'Green — on track', RAG_STYLE.G], ['A', 'Amber — at risk', RAG_STYLE.A], ['R', 'Red — critical', RAG_STYLE.R]].map(([k, label, cls]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('w-6 h-5 rounded text-xs flex items-center justify-center font-bold', cls as string)}>{k}</span>
            {label}
          </span>
        ))}
        <span className="text-gray-400 italic">Click any RAG cell to change rating</span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px',
              activeSection === s.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {s.label}
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold', activeSection === s.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500')}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Active Projects */}
      {activeSection === 'active' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {['Account / project', 'Workload', 'Mgr / Pre-sales', 'Account Mgr', 'Overall', 'Schedule', 'Scope', 'Resource', 'Customer', 'Budget', 'Latest status comment', 'Updated'].map(h => (
                  <th key={h} className="py-2.5 px-2 font-semibold text-slate-600 border-b border-slate-200 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                  <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap"><EditableText value={row.account} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, account: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.workload} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, workload: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.mgr} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, mgr: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.am} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, am: v } : r))} /></td>
                  {RAG_FIELDS_ACTIVE.map(f => (
                    <td key={f} className="py-1.5 px-1 text-center">
                      <RagCell value={row[f] as string} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, [f]: v } : r))} />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 max-w-xs"><EditableArea value={row.comment} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, comment: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap"><EditableText value={row.updated} onChange={v => setActive(active.map((r, i) => i === ri ? { ...r, updated: v } : r))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Success */}
      {activeSection === 'cs' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {['Account', 'Workload', 'CS Owner', 'Account Mgr', 'Overall', 'Adoption', 'CSAT', 'Tickets', 'Renewal', 'Upsell', 'Latest comment', 'Updated'].map(h => (
                  <th key={h} className="py-2.5 px-2 font-semibold text-slate-600 border-b border-slate-200 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cs.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                  <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap"><EditableText value={row.account} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, account: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.workload} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, workload: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.csOwner} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, csOwner: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.am} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, am: v } : r))} /></td>
                  {RAG_FIELDS_CS.map(f => (
                    <td key={f} className="py-1.5 px-1 text-center">
                      <RagCell value={row[f] as string} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, [f]: v } : r))} />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 max-w-xs"><EditableArea value={row.comment} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, comment: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap"><EditableText value={row.updated} onChange={v => setCs(cs.map((r, i) => i === ri ? { ...r, updated: v } : r))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Team Health */}
      {activeSection === 'team' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {['Team', 'Team Lead', 'Active', 'Escalations', 'Overall', 'Capacity', 'Blockers', 'Key concern this week', 'Updated'].map(h => (
                  <th key={h} className="py-2.5 px-2 font-semibold text-slate-600 border-b border-slate-200 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                  <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap"><EditableText value={row.team} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, team: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.lead} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, lead: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap"><EditableText value={row.active} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, active: v } : r))} /></td>
                  <td className="py-2 px-2 text-center text-slate-600 font-medium">{row.escalations}</td>
                  {RAG_FIELDS_TEAM.map(f => (
                    <td key={f} className="py-1.5 px-1 text-center">
                      <RagCell value={row[f] as string} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, [f]: v } : r))} />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 max-w-xs"><EditableArea value={row.concern} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, concern: v } : r))} /></td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap"><EditableText value={row.updated} onChange={v => setTeam(team.map((r, i) => i === ri ? { ...r, updated: v } : r))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const LS_KEYS = { raci: 'pmo_raci_v1', raid: 'pmo_raid_v1', rag_active: 'pmo_rag_active_v1', rag_cs: 'pmo_rag_cs_v1', rag_team: 'pmo_rag_team_v1' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export default function RaciRaidRagPage() {
  const [activeTab, setActiveTab] = useState<'raci' | 'raid' | 'rag'>('raci');
  const [saved, setSaved] = useState(false);

  const { data: projectsData } = useProjects({ limit: 500 });
  const projectManagers = Array.from(
    new Set(
      (projectsData?.data ?? [])
        .map((p: any) => p.projectManager)
        .filter(Boolean)
    )
  ) as string[];

  const [raciData, setRaciData] = useState(() => load(LS_KEYS.raci, INITIAL_RACI));
  const [raidData, setRaidData] = useState(() => load(LS_KEYS.raid, INITIAL_RAID));
  const [ragActive, setRagActive] = useState(() => load(LS_KEYS.rag_active, INITIAL_RAG_ACTIVE));
  const [ragCs, setRagCs] = useState(() => load(LS_KEYS.rag_cs, INITIAL_RAG_CS));
  const [ragTeam, setRagTeam] = useState(() => load(LS_KEYS.rag_team, INITIAL_RAG_TEAM));

  const handleSave = () => {
    localStorage.setItem(LS_KEYS.raci, JSON.stringify(raciData));
    localStorage.setItem(LS_KEYS.raid, JSON.stringify(raidData));
    localStorage.setItem(LS_KEYS.rag_active, JSON.stringify(ragActive));
    localStorage.setItem(LS_KEYS.rag_cs, JSON.stringify(ragCs));
    localStorage.setItem(LS_KEYS.rag_team, JSON.stringify(ragTeam));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!confirm('Reset all changes to the original pre-loaded data? This cannot be undone.')) return;
    Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
    setRaciData(INITIAL_RACI);
    setRaidData(INITIAL_RAID);
    setRagActive(INITIAL_RAG_ACTIVE);
    setRagCs(INITIAL_RAG_CS);
    setRagTeam(INITIAL_RAG_TEAM);
  };

  const tabs = [
    { key: 'raci' as const, label: 'RACI Matrix',  icon: <Shield    className="w-4 h-4" /> },
    { key: 'raid' as const, label: 'RAID Log',      icon: <AlertTriangle className="w-4 h-4" /> },
    { key: 'rag'  as const, label: 'RAG Status',    icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">RACI / RAID / RAG Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">Responsibility matrix, risk &amp; issue log, and RAG status dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
              saved
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            )}
          >
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs + content */}
      <Card padding="none">
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

        <div className="p-4">
          {activeTab === 'raci' && <RaciTab data={raciData} setData={setRaciData} />}
          {activeTab === 'raid' && (
            <RaidTab
              data={raidData}
              setData={setRaidData}
              projectManagers={projectManagers}
            />
          )}
          {activeTab === 'rag'  && (
            <RagTab
              active={ragActive} setActive={setRagActive}
              cs={ragCs} setCs={setRagCs}
              team={ragTeam} setTeam={setRagTeam}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
