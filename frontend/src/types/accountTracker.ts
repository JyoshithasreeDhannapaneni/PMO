// Customer Success → Account Tracker API shapes (backend services/accountTrackerService.ts and accountTrackerAi.ts).

/** Where a value came from: HubSpot data, the AI, measured activity, or the time-zone fallback. */
export type ValueBasis = 'hubspot' | 'ai' | 'activity' | 'timezone';

export type Level = 'High' | 'Medium' | 'Low';

export interface TrackerAiStatus {
  configured: boolean;
  /** Set while the AI is paused because of an account problem (e.g. out of credits). */
  pausedReason: string | null;
  running: boolean;
  total: number;
  done: number;
  analysed: number;
}

export interface AiAnalysis {
  overview: string;
  keyFacts: string[];
  msp: { isMsp: boolean; confidence: 'high' | 'medium' | 'low'; reason: string };
  cloudfuzeFit: { level: Level; reason: string };
  pastProjects: string[];
  techStack: { productivitySuite: string; tools: string[]; confidence: 'high' | 'medium' | 'low'; evidence: string };
  buyingSignals: { signal: string; strength: Level; evidence: string }[];
  opportunities: { title: string; detail: string }[];
  angle: string;
  /** false when the company homepage could not be read (blocked or offline). */
  usedHomepage: boolean;
  /** true when a web search filled in for an unreadable homepage. */
  usedResearch?: boolean;
  generatedAt: string;
}

export interface AiEngagement {
  summary: string;
  keyPoints: string[];
  openItems: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
  sentimentReason: string;
  nextAction: { action: string; reason: string; when: string };
  outreach: {
    channel: string;
    approach: string;
    emailSubject: string;
    emailBody: string;
    callOpener: string;
    talkingPoints: string[];
  };
  risks: string[];
  toolsMentioned: string[];
  connect: { attempts: number; responses: number; rate: number | null; level: Level | null };
  generatedAt: string;
}

export interface AiDealInsights {
  headline: string;
  wins: string[];
  losses: string[];
  atRisk: { deal: string; reason: string; action: string }[];
  nextBestActions: { deal: string; action: string }[];
  generatedAt: string;
}

export interface TrackerMe {
  id: string;
  name: string | null;
  email: string;
  role: string;
  admin: boolean;
  hubspotOwnerId: string | null;
  hubspotOwnerName: string | null;
  ownerLinkedManually: boolean;
  hubspotConfigured: boolean;
  aiConfigured: boolean;
}

export interface TrackerStatus {
  loaded: boolean;
  view: string;
  source: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  lastSyncedAt: string | null;
  lastSyncSummary: string | null;
  syncing: boolean;
  progress: string | null;
  lastError: string | null;
  warnings: string | null;
  hubspotConfigured: boolean;
  ai: TrackerAiStatus;
  counts: { companies: number; contacts: number; top20Companies: number; top20Msps: number };
}

export interface TrackerMetrics {
  totalCompanies: number;
  totalMsps: number;
  /** Companies the AI has not classified yet. */
  mspPending: number;
  notReachedOut: number;
  avgDaysSinceContact: number | null;
  customers: number;
}

export interface CompanyRow {
  id: number;
  company: string | null;
  domain: string | null;
  industry: string | null;
  industryGroup: string | null;
  country: string | null;
  employees: number | null;
  tier: string | null;
  openDeals: number | null;
  connectProbability: string | null;
  probability: string | null;
  connectBasis: ValueBasis | null;
  hubspotLink: string | null;
  /** null until the AI has classified the company. */
  msp: boolean | null;
  reachedOut: string | null;
  daysSinceLastContact: number | null;
  lifecycleStage: string | null;
  priorityReason: string | null;
  outreachStage: string | null;
  lastContactDate: string | null;
  timesReachedOut: number | null;
  callsCount: number | null;
  emailsCount: number | null;
  meetingsCount: number | null;
  notesCount: number | null;
}

export interface StatList { key: string; title: string; rows: CompanyRow[] }

export interface FilterOptions { countries: string[]; industryGroups: string[]; maxEmployees: number }

export interface CompanyFilters {
  search: string;
  tier: string;
  msp: boolean;
  openDeals: boolean;
  empRange: [number, number] | null;
  countries: string[];
  industryGroups: string[];
  probabilities: string[];
}

export interface TrackerCompany {
  id: number;
  ownerKey: string;
  hubspotId: string;
  company: string;
  domain: string | null;
  website: string | null;
  hubspotLink: string | null;
  industryGroup: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employees: number | null;
  tier: string | null;
  annualRevenue: string | null;
  foundedYear: string | null;
  phone: string | null;
  linkedin: string | null;
  lifecycleStage: string | null;
  openDeals: number | null;
  associatedDeals: number | null;
  timesReachedOut: number | null;
  reachedOut: string | null;
  outreachStage: string | null;
  msp: boolean | null;
  mspBasis: ValueBasis | null;
  probability: string | null;
  connectProbability: string | null;
  connectBasis: ValueBasis | null;
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  primaryContactEmail: string | null;
  lastContactDate: string | null;
  daysSinceLastContact: number | null;
  callsCount: number | null;
  emailsCount: number | null;
  meetingsCount: number | null;
  notesCount: number | null;
  utcOffset: number | null;
  timeZone: string | null;
  bestConnectWindow: string | null;
  suggestedCallTime: string | null;
}

export interface TrackerContact {
  id: number;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
}

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export interface TrackerDeal {
  id: number;
  hubspotId: string;
  name: string | null;
  amount: number | null;
  currency: string | null;
  stageLabel: string | null;
  pipelineLabel: string | null;
  status: DealStatus | null;
  closeDate: string | null;
  createDate: string | null;
  dealType: string | null;
  lostReason: string | null;
  nextStep: string | null;
  companyName: string | null;
  hubspotLink: string | null;
  mine: boolean | null;
  dealOwnerName: string | null;
}

export interface DealRow { deal: TrackerDeal; companyId: number | null }

export interface CompanyDetail {
  company: TrackerCompany;
  location: string | null;
  overview: string | null;
  health: {
    totalActivities: number | null;
    daysSinceLastContact: number | null;
    health: 'Hot' | 'Warm' | 'Cold' | 'Unknown';
    healthScore: number;
    healthLabel: string;
  };
  ai: {
    configured: boolean;
    analysis: AiAnalysis | null;
    engagement: AiEngagement | null;
    error: string | null;
  };
  contacts: { contact: TrackerContact; primary: boolean }[];
  deals: DealRow[];
}

export type ActivityType = 'call' | 'note' | 'meeting' | 'email' | 'task';

export interface ActivityItem {
  type: ActivityType;
  id: string;
  timestamp: string | null;
  title: string | null;
  body: string | null;
  ownerId: string | null;
  ownerName: string | null;
  direction: string | null;
  outcome: string | null;
  durationSeconds: number | null;
  priority: string | null;
}

export interface ActivityFeed {
  items: ActivityItem[];
  unavailable: { type: string; reason: string }[];
  totals: Record<string, number>;
  fetchedAt: string;
}

export interface ContactRow {
  id: number;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  companyId: number | null;
  company: string | null;
  primary: boolean;
}

export interface DealQueryParams {
  from?: string | null;
  to?: string | null;
  date?: 'close' | 'created';
  status?: string;
  pipeline?: string;
  search?: string;
  dealOwner?: string;
}

export interface WonBucket { key: string; from: string; to: string; amount: number; count: number }

export interface DealSummary {
  wonAmount: number;
  wonCount: number;
  openAmount: number;
  openCount: number;
  weightedOpen: number;
  lostAmount: number;
  lostCount: number;
  winRate: number | null;
  avgWonAmount: number | null;
  avgDaysToClose: number | null;
  currency: string | null;
  mixedCurrencies: boolean;
  granularity: 'month' | 'quarter' | 'year';
  wonOverTime: WonBucket[];
  topCompanies: { name: string | null; companyId: number | null; amount: number; count: number }[];
}

export interface DealsPage {
  deals: DealRow[];
  summary: DealSummary;
  pipelines: string[];
  totalDeals: number;
  mineCount: number;
  othersCount: number;
  counts: { all: number; open: number; won: number; lost: number };
  totalsScope: 'mine' | 'others';
  insights: AiDealInsights | null;
}

export interface TopRow {
  rank: number;
  companyId: number;
  company: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  annualRevenue: string | null;
  rankingBasis: string;
  timesReachedOut: number | null;
  outreachStage: string | null;
  probability: string | null;
  msp: boolean | null;
  primaryContactName: string | null;
  hubspotLink: string | null;
}

export interface Top20 {
  type: 'companies' | 'msps';
  rows: TopRow[];
  stats: {
    highestRevenue: string | null;
    highestRevenueCompany: string | null;
    highestRevenueCompanyId: number | null;
    averageEmployees: number | null;
    highProbabilityCount: number;
  };
}

export interface TrackerInsights {
  source: string | null;
  stats: { id: number; metric: string; statValue: string; note: string }[];
  methodology: { id: number; field: string; note: string }[];
  dataQuality: { id: number; subject: string; issue: string; recommendation: string; companyId: number | null }[];
}

export interface TrackerOwner { id: string; name: string; email: string | null; synced: boolean }

export interface TrackerUserLink {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  hubspotOwnerId: string | null;
  hubspotOwnerName: string | null;
  ownerLinkedManually: boolean;
}
