'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { Shield, AlertTriangle, BarChart2, RefreshCw, ChevronDown } from 'lucide-react';

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
      { id: 'PS-R-001', type: 'R', description: 'POC deadline missed due to customer IT delays in providing admin access', probability: 'High', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Raise blocker in PMO tracker immediately. AM to contact customer stakeholder within 24 hrs.', dueDate: '30-May-26', status: 'Open' },
      { id: 'PS-R-002', type: 'R', description: 'Customer exits POC without sign-off, blocking commercial conversion', probability: 'Medium', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Success criteria must be agreed in Phase 1. PM to review if Phase 4 runs beyond 48 hrs without response.', dueDate: 'POC end date', status: 'Open' },
      { id: 'PS-R-003', type: 'R', description: 'POC scope creep requested by customer mid-trial, delaying Phase 3', probability: 'Medium', severity: 'Medium', owner: 'Pre-sales Owner', mitigation: 'Any scope change post Phase 1 sign-off requires written agreement and may trigger POC extension fee.', dueDate: 'Ongoing', status: 'Open' },
      { id: 'PS-A-001', type: 'A', description: 'Customer has admin / global admin access ready before POC Phase 2 environment setup', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Confirm in discovery call. Document in POC Submission sheet. Chase weekly if not confirmed.', dueDate: 'Phase 1', status: 'Open' },
      { id: 'PS-A-002', type: 'A', description: 'Source and destination platforms are supported by CF Migrate for the agreed workload types', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Validate platform compatibility before POC kick-off. Raise to Dev team if unsupported connector needed.', dueDate: 'Pre-POC', status: 'Open' },
      { id: 'PS-A-003', type: 'A', description: 'Customer stakeholder has authority to sign off POC outcome and progress to full migration', probability: '—', severity: '—', owner: 'Pre-sales Owner', mitigation: 'Confirm decision-maker in discovery call. Ensure sign-off contact is documented in POC record.', dueDate: 'Phase 1', status: 'Open' },
      { id: 'PS-I-001', type: 'I', description: 'Alpine Systems — POC stale, no pre-sales update for 5 days, POC ends 30 May 2026', probability: '—', severity: 'Medium', owner: 'Pre-sales Owner', mitigation: 'AM to chase Dana M. today. If no update by 27 May, AM contacts Tom Reyes (customer) directly.', dueDate: '27-May-26', status: 'Escalated' },
      { id: 'PS-I-002', type: 'I', description: 'Contoso Ltd — POC validation phase delayed, customer sign-off 2 days overdue', probability: '—', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Pre-sales to contact Sarah Lin. If unresolved in 24 hrs, AM to escalate to customer senior stakeholder.', dueDate: '28-May-26', status: 'Open' },
      { id: 'PS-D-001', type: 'D', description: 'Admin access must be granted by customer IT before Phase 2 environment setup can begin', probability: '—', severity: 'High', owner: 'Customer IT', mitigation: 'Flagged in POC scope document. Pre-sales to chase weekly. Blocker to be logged in PMO tracker.', dueDate: 'Phase 2 start', status: 'Open' },
      { id: 'PS-D-002', type: 'D', description: 'NDA and data handling agreement must be signed before trial migration data is processed', probability: '—', severity: 'High', owner: 'Pre-sales Owner', mitigation: 'Standard NDA to be sent with POC scope document. Legal to review if customer proposes amendments.', dueDate: 'Phase 1', status: 'Open' },
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

function RaidTab({ data, setData }: { data: typeof INITIAL_RAID; setData: (d: typeof INITIAL_RAID) => void }) {
  const PROB_OPTS = ['High', 'Medium', 'Low', '—'];
  const STATUS_OPTS = ['Open', 'Escalated', 'In progress', 'Closed'];

  const updateField = (ti: number, ri: number, field: string, value: string) => {
    const next = data.map((team, tIdx) => ({
      ...team,
      rows: team.rows.map((row, rIdx) => (ti === tIdx && ri === rIdx ? { ...row, [field]: value } : row)),
    }));
    setData(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-wrap text-xs text-gray-500">
        {Object.entries(TYPE_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', TYPE_STYLE[k])}>{k}</span>
            {label}
          </span>
        ))}
        <span className="text-gray-400 italic">Click any cell to edit</span>
      </div>
      {data.map((team, ti) => (
        <div key={team.team}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-700">{team.team}</h3>
            <span className="text-xs text-gray-400">({team.rows.length} items)</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-24">ID</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-20">Type</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200">Description</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-20">Probability</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-20">Severity</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-32">Owner</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200">Mitigation / Action</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-24">Due Date</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600 border-b border-slate-200 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {team.rows.map((row, ri) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="py-2 px-3 font-mono text-slate-500">{row.id}</td>
                    <td className="py-2 px-3">
                      <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', TYPE_STYLE[row.type])}>
                        {TYPE_LABEL[row.type]}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 max-w-xs">
                      <EditableArea value={row.description} onChange={v => updateField(ti, ri, 'description', v)} />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <SelectCell value={row.probability} options={PROB_OPTS} style={PROB_STYLE} onChange={v => updateField(ti, ri, 'probability', v)} />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <SelectCell value={row.severity} options={PROB_OPTS} style={SEV_STYLE} onChange={v => updateField(ti, ri, 'severity', v)} />
                    </td>
                    <td className="py-1.5 px-2">
                      <EditableText value={row.owner} onChange={v => updateField(ti, ri, 'owner', v)} />
                    </td>
                    <td className="py-1.5 px-2 max-w-xs">
                      <EditableArea value={row.mitigation} onChange={v => updateField(ti, ri, 'mitigation', v)} />
                    </td>
                    <td className="py-1.5 px-2">
                      <EditableText value={row.dueDate} onChange={v => updateField(ti, ri, 'dueDate', v)} />
                    </td>
                    <td className="py-1.5 px-2">
                      <SelectCell value={row.status} options={STATUS_OPTS} style={STATUS_STYLE} onChange={v => updateField(ti, ri, 'status', v)} />
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

// ── RAG Tab ──────────────────────────────────────────────────────────────────

function RagTab({
  active, setActive, cs, setCs, team, setTeam,
}: {
  active: typeof INITIAL_RAG_ACTIVE; setActive: (d: typeof INITIAL_RAG_ACTIVE) => void;
  cs: typeof INITIAL_RAG_CS; setCs: (d: typeof INITIAL_RAG_CS) => void;
  team: typeof INITIAL_RAG_TEAM; setTeam: (d: typeof INITIAL_RAG_TEAM) => void;
}) {
  const RAG_FIELDS_ACTIVE: (keyof (typeof INITIAL_RAG_ACTIVE)[0])[] = ['overall', 'schedule', 'scope', 'resource', 'customer', 'budget'];
  const RAG_FIELDS_CS: (keyof (typeof INITIAL_RAG_CS)[0])[] = ['overall', 'adoption', 'csat', 'tickets', 'renewal', 'upsell'];
  const RAG_FIELDS_TEAM: (keyof (typeof INITIAL_RAG_TEAM)[0])[] = ['overall', 'capacity', 'blockers'];

  return (
    <div className="space-y-8">
      <div className="flex gap-4 flex-wrap text-xs text-gray-500">
        {[['G', 'Green — on track', RAG_STYLE.G], ['A', 'Amber — at risk', RAG_STYLE.A], ['R', 'Red — critical', RAG_STYLE.R]].map(([k, label, cls]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('w-6 h-5 rounded text-xs flex items-center justify-center font-bold', cls as string)}>{k}</span>
            {label}
          </span>
        ))}
        <span className="text-gray-400 italic">Click any RAG cell to change rating</span>
      </div>

      {/* Section 1 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">1</span>
          Active projects — POC and full migration
        </h3>
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
      </div>

      {/* Section 2 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">2</span>
          Customer success — post-migration health
        </h3>
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
      </div>

      {/* Section 3 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">3</span>
          Team health — delivery capacity and blockers
        </h3>
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
      </div>
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
          {activeTab === 'raid' && <RaidTab data={raidData} setData={setRaidData} />}
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
