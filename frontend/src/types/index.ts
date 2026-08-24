// Role Types
export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'VIEWER' | 'PRE_SALES' | 'ACCOUNT_MANAGER';

// POC Types
export type PocPhaseStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';
export type PocOutcome = 'won' | 'lost' | 'no_decision';
export type CfSignalLevel = 'none' | 'moderate' | 'strong' | 'active';

// Project Types
export type PlanType = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type ProjectPhase =
  | 'KICKOFF'
  | 'CLOUD_ADDING'
  | 'PILOT_MIGRATION'
  | 'ONETIME_MIGRATION'
  | 'DELTA'
  | 'FINAL_VALIDATION'
  | 'COMPLETED';
export type ProjectStatus = 'ACTIVE' | 'INACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type DelayStatus = 'NOT_DELAYED' | 'AT_RISK' | 'DELAYED' | 'EXTENDED';

export interface AtRiskHistoryItem {
  id: string;
  notes: string | null;
  markedAt: string;
  resolvedAt: string | null;
}
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type CaseStudyStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';

export interface Project {
  id: string;
  name: string;
  customerName: string;
  clientName?: string | null;
  projectManager: string;
  accountManager: string;
  planType: PlanType;
  segment?: 'ENT' | 'SMB' | null;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  delayDays: number;
  delayStatus: DelayStatus;
  expectedEnd?: string | null;
  phase: ProjectPhase;
  status: ProjectStatus;
  migrationTypes: string | null;
  sourcePlatform: string | null;
  targetPlatform: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  numberOfServers: number | null;
  projectMemory: string | null;
  description: string | null;
  notes: string | null;
  isOveraged?: boolean;
  isEscalated?: boolean;
  escalationPriority?: string | null;
  escalatedAt?: string | null;
  escalationNotes?: string | null;
  isAtRisk?: boolean;
  atRiskNotes?: string | null;
  atRiskMarkedAt?: string | null;
  atRiskHistory?: AtRiskHistoryItem[];
  overageAmount?: number | null;
  extendedEndDate?: string | null;
  cloudAddingStart?: string | null;
  cloudAddingEnd?: string | null;
  pilotMigrationStart?: string | null;
  pilotMigrationEnd?: string | null;
  onetimeMigrationStart?: string | null;
  onetimeMigrationEnd?: string | null;
  deltaMigrationStart?: string | null;
  deltaMigrationEnd?: string | null;
  finalValidationStart?: string | null;
  finalValidationEnd?: string | null;
  cloudAddingNotes?: string | null;
  pilotMigrationNotes?: string | null;
  onetimeMigrationNotes?: string | null;
  deltaMigrationNotes?: string | null;
  finalValidationNotes?: string | null;
  // POC fields
  projectType?: string;
  pocQualificationStatus?: PocPhaseStatus;
  pocEnvSetupStatus?: PocPhaseStatus;
  pocTrialStatus?: PocPhaseStatus;
  pocValidationStatus?: PocPhaseStatus;
  pocOutcomeStatus?: PocPhaseStatus;
  pocQualificationNotes?: string | null;
  pocEnvSetupNotes?: string | null;
  pocTrialNotes?: string | null;
  pocValidationNotes?: string | null;
  pocOutcomeNotes?: string | null;
  pocDeadline?: string | null;
  pocOutcome?: PocOutcome | null;
  pocHandoffTo?: string | null;
  pocHandoffDate?: string | null;
  pocMigrationSpeed?: number | null;
  pocErrorRate?: number | null;
  customerContact?: string | null;
  pocSuccessCriteria?: string | null;
  pocDataVolume?: string | null;
  pocPermissionsIntact?: boolean | null;
  pocMetadataIntact?: boolean | null;
  pocHandoffNotes?: string | null;
  pocNumUsers?: string | null;
  pocEstimatedData?: string | null;
  pocPhase1Checklist?: string | null;
  pocTenantAccess?: string | null;
  pocToolVersion?: string | null;
  pocTestAccounts?: string | null;
  pocFirewallIssues?: string | null;
  pocPhase2Checklist?: string | null;
  pocFilesMigrated?: string | null;
  pocDataMigratedGb?: number | null;
  pocErrorsFailed?: string | null;
  pocPhase3Checklist?: string | null;
  pocValidationDate?: string | null;
  pocIssuesRaised?: string | null;
  pocCustomerSatisfaction?: string | null;
  pocPhase4Checklist?: string | null;
  pocNextStep?: string | null;
  pocDealValue?: number | null;
  pocPhase5Checklist?: string | null;
  pocPreSalesOwner?: string | null;
  pocCriticalNotes?: string | null;
  onetimeProgress?: number | null;
  customerSuccess?: string | null;
  csatScore?: number | null;
  archiveCsatStatus?: 'SATISFIED' | 'NEUTRAL' | 'NOT_HAPPY' | null;
  delayHappened?: 'CUSTOMER_DELAY' | 'INTERNAL_DELAY' | 'BOTH' | null;
  rcaDocUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  phases?: ProjectPhaseRecord[];
  caseStudy?: CaseStudy | null;
}

export interface ProjectPhaseRecord {
  id: string;
  projectId: string;
  phaseName: ProjectPhase;
  plannedDate: string;
  actualDate: string | null;
  status: PhaseStatus;
  notes: string | null;
}

export interface CaseStudy {
  id: string;
  projectId: string;
  status: CaseStudyStatus;
  title: string | null;
  content: string | null;
  publishedAt: string | null;
}

export interface Notification {
  id: string;
  projectId: string | null;
  type: string;
  title: string;
  message: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  project?: { id: string; name: string } | null;
}

// Dashboard Types
export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  inactiveProjects?: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  atRiskProjects: number;
  pendingCaseStudies: number;
  avgDelayDays: number;
  overagedCount?: number;
}

export interface ProjectsByStatus {
  status: ProjectStatus;
  count: number;
}

export interface ProjectsByPhase {
  phase: ProjectPhase;
  count: number;
}

export interface ProjectsByPlan {
  planType: PlanType;
  count: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  projectName: string;
  projectId: string;
  timestamp: string;
  details: string;
}

export interface DelaySummary {
  byStatus: { status: DelayStatus; count: number }[];
  topDelayed: { id: string; name: string; delayDays: number; customerName: string }[];
}

export interface UpcomingDeadline {
  id: string;
  name: string;
  customerName: string;
  plannedEnd: string;
  daysRemaining: number;
  phase: ProjectPhase;
}

export interface MigrationTypeStat {
  type: string;
  total: number;
  active: number;
  inactive: number;
  completed: number;
  cancelled: number;
  newProjects: number;
  overaged: number;
  delayed: number;
  atRisk: number;
}

export interface MigrationTypeStats {
  byType: MigrationTypeStat[];
  totals: {
    total: number;
    active: number;
    inactive: number;
    completed: number;
    cancelled: number;
    newProjects: number;
    overaged: number;
    delayed: number;
    atRisk: number;
  };
}

export interface DashboardOverview {
  stats: DashboardStats;
  projectsByStatus: ProjectsByStatus[];
  projectsByPhase: ProjectsByPhase[];
  projectsByPlan: ProjectsByPlan[];
  recentActivity: RecentActivity[];
  delaySummary: DelaySummary;
  upcomingDeadlines: UpcomingDeadline[];
  migrationTypeStats?: MigrationTypeStats;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { message: string };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
}

// Form Types
export interface CreateProjectInput {
  name: string;
  customerName: string;
  clientName?: string | null;
  projectManager: string;
  accountManager: string;
  planType: PlanType;
  segment?: 'ENT' | 'SMB' | null;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  migrationTypes?: string;
  sourcePlatform?: string;
  targetPlatform?: string;
  estimatedCost?: number;
  actualCost?: number;
  numberOfServers?: number;
  projectMemory?: string;
  customerContact?: string | null;
  description?: string;
  notes?: string;
  phase?: ProjectPhase;
  status?: ProjectStatus;
  delayStatus?: DelayStatus;
  isOveraged?: boolean;
  isEscalated?: boolean;
  escalationPriority?: string;
  isAtRisk?: boolean;
  atRiskNotes?: string | null;
  overageAmount?: number;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  projectType?: string;
  // History Archive's CSAT dropdown — separate from csatScore (a numeric /5
  // score used elsewhere), Account-Manager-editable only, see archive/page.tsx.
  archiveCsatStatus?: 'SATISFIED' | 'NEUTRAL' | 'NOT_HAPPY' | null;
  pocQualificationStatus?: PocPhaseStatus;
  pocEnvSetupStatus?: PocPhaseStatus;
  pocTrialStatus?: PocPhaseStatus;
  pocValidationStatus?: PocPhaseStatus;
  pocOutcomeStatus?: PocPhaseStatus;
  pocQualificationNotes?: string | null;
  pocEnvSetupNotes?: string | null;
  pocTrialNotes?: string | null;
  pocValidationNotes?: string | null;
  pocOutcomeNotes?: string | null;
  pocDeadline?: string | null;
  pocOutcome?: PocOutcome | null;
  pocHandoffTo?: string | null;
  pocHandoffDate?: string | null;
  pocMigrationSpeed?: number | null;
  pocErrorRate?: number | null;
  customerContact?: string | null;
  pocSuccessCriteria?: string | null;
  pocDataVolume?: string | null;
  pocPermissionsIntact?: boolean | null;
  pocMetadataIntact?: boolean | null;
  pocHandoffNotes?: string | null;
  onetimeProgress?: number | null;
}

export interface CfProductSignal {
  level: CfSignalLevel;
  reason: string;
}

export interface AccountView {
  customerName: string;
  accountManager: string;
  needsAttention: boolean;
  attentionReasons: string[];
  pocTrack: Project | null;
  migrationTrack: Project | null;
  migrationTracks: Project[];
  handoffDate: string | null;
  handoffBy: string | null;
}

// ── Customer Success (redesigned) ──────────────────────────────────────────

export interface CsatData {
  score: number | null;
  verbatim: string | null;
  migrationQuality: number | null;
  supportExperience: number | null;
  onboarding: number | null;
  date: string | null;
}

export interface EscalationItem {
  projectId: string;
  projectName: string;
  priority: string;
  notes: string;
  projectType?: string;
}

export interface CustomerSuccessEntry {
  projectId: string;
  projectName: string;
  customerName: string;
  accountManager: string;
  projectManager: string;
  projectType: string;
  status: string;
  planType: string;
  workloadTypes: string[];
  isActive: boolean;
  isCompleted: boolean;
  pocOutcome: string | null;
  csat: CsatData;
  cfMigrate: CfProductSignal;
  cfManage: CfProductSignal;
  professionalServices: CfProductSignal;
  managedServices: CfProductSignal;
  hasEscalations: boolean;
  escalationCount: number;
  escalations: EscalationItem[];
  plannedEnd?: string | null;
}

export interface RenewalDueItem {
  id: string;
  name: string;
  customerName: string;
  accountManager: string;
  projectManager: string;
  plannedEnd: string;
  daysOverdue: number;
  status: string;
  phase: string;
  planType: string;
  projectType?: string;
}

export interface SignalItem {
  projectId: string;
  projectName: string;
  customerName: string;
  accountManager: string;
  product: string;
  level: CfSignalLevel;
  reason: string;
}

export interface CustomerSuccessPageData {
  accounts: CustomerSuccessEntry[];
  renewalDue: RenewalDueItem[];
  upsellSignals: SignalItem[];
  crossSellSignals: SignalItem[];
}

// Keep for backwards compatibility in customer-success page import
export type CustomerSuccessView = CustomerSuccessEntry;

export type HubspotDealCategory = 'upsell' | 'cross_sell' | 'renewal' | 'new_business' | 'other';
export type CfProductTag = 'cf_migrate' | 'cf_manage' | 'professional_services' | 'managed_services' | 'other';

export interface HubspotDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  pipeline: string;
  dealType: string | null;
  closeDate: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isOpen: boolean;
  category: HubspotDealCategory;
  cfProduct: CfProductTag;
  companyName: string;
}

export interface HubspotCustomerDeals {
  companyName: string;
  deals: HubspotDeal[];
  upsellCount: number;
  crossSellCount: number;
  openValue: number;
  wonValue: number;
  productBreakdown: Partial<Record<CfProductTag, { openValue: number; wonValue: number; openCount: number }>>;
}

export interface HubspotSignalsData {
  configured: boolean;
  fetchedAt: string | null;
  customers: Record<string, HubspotCustomerDeals>;
  error?: string;
  diagnostics?: {
    totalDeals: number;
    companyIdsFound: number;
    companyNamesFetched: number;
    companyFetchFailed: boolean;
    dealsKeyedByDealName: number;
  };
}

export type HubspotInsightType = 'interest' | 'opportunity' | 'risk' | 'renewal' | 'action';
export type HubspotInsightPriority = 'high' | 'medium' | 'low';

export interface HubspotInsight {
  type: HubspotInsightType;
  priority: HubspotInsightPriority;
  product?: CfProductTag;
  title: string;
  detail: string;
}
