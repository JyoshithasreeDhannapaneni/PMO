// Project Types
export type PlanType = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type ProjectPhase = 'KICKOFF' | 'MIGRATION' | 'VALIDATION' | 'CLOSURE' | 'COMPLETED';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type DelayStatus = 'NOT_DELAYED' | 'AT_RISK' | 'DELAYED';
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type CaseStudyStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';

export interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  accountManager: string;
  planType: PlanType;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  delayDays: number;
  delayStatus: DelayStatus;
  phase: ProjectPhase;
  status: ProjectStatus;
  migrationTypes: string | null;
  sourcePlatform: string | null;
  targetPlatform: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  description: string | null;
  notes: string | null;
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
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  atRiskProjects: number;
  pendingCaseStudies: number;
  avgDelayDays: number;
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
  projectManager: string;
  accountManager: string;
  planType: PlanType;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  migrationTypes?: string;
  sourcePlatform?: string;
  targetPlatform?: string;
  estimatedCost?: number;
  actualCost?: number;
  description?: string;
  notes?: string;
  phase?: ProjectPhase;
  status?: ProjectStatus;
  delayStatus?: DelayStatus;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {}
