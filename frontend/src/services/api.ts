import axios from 'axios';
import type {
  Project,
  DashboardOverview,
  CreateProjectInput,
  UpdateProjectInput,
  ApiResponse,
  PaginatedResponse,
  CaseStudy,
  Notification,
  ProjectPhaseRecord,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Projects API
export const projectsApi = {
  getAll: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    phase?: string;
    delayStatus?: string;
    planType?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    projectManager?: string;
    accountManager?: string;
    excludeStatus?: string;
    clientName?: string;
  }): Promise<PaginatedResponse<Project>> => {
    const { data } = await api.get('/projects', { params });
    return data;
  },

  getById: async (id: string): Promise<ApiResponse<Project>> => {
    const { data } = await api.get(`/projects/${id}`);
    return data;
  },

  create: async (project: CreateProjectInput): Promise<ApiResponse<Project>> => {
    const { data } = await api.post('/projects', project);
    return data;
  },

  update: async (id: string, project: UpdateProjectInput): Promise<ApiResponse<Project>> => {
    const { data } = await api.put(`/projects/${id}`, project);
    return data;
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    const { data } = await api.delete(`/projects/${id}`);
    return data;
  },

  getDelayed: async (): Promise<ApiResponse<Project[]>> => {
    const { data } = await api.get('/projects/delayed');
    return data;
  },

  getClientSummary: async (clientName: string): Promise<ApiResponse<any>> => {
    const { data } = await api.get('/projects/client-summary', { params: { clientName } });
    return data;
  },

  deleteClient: async (clientName: string): Promise<ApiResponse<void>> => {
    const { data } = await api.delete(`/projects/by-client/${encodeURIComponent(clientName)}`);
    return data;
  },
};

// Dashboard API
export const dashboardApi = {
  getDelayHappenedNotes: async (): Promise<Record<string, string>> => {
    const { data } = await api.get('/dashboard/delay-happened-notes');
    return data.data as Record<string, string>;
  },

  getOverview: async (manager?: string): Promise<ApiResponse<DashboardOverview>> => {
    const { data } = await api.get('/dashboard/overview', { params: manager ? { manager } : undefined });
    return data;
  },

  getStats: async () => {
    const { data } = await api.get('/dashboard/stats');
    return data;
  },

  getDelaySummary: async () => {
    const { data } = await api.get('/dashboard/delay-summary');
    return data;
  },

  getUpcomingDeadlines: async (days?: number) => {
    const { data } = await api.get('/dashboard/upcoming-deadlines', { params: { days } });
    return data;
  },

  getManagerStats: async (manager?: string) => {
    const { data } = await api.get('/dashboard/manager-stats', { params: manager ? { manager } : undefined });
    return data;
  },

  getWeeklyReport: async (manager?: string, startDate?: string, endDate?: string) => {
    const params: Record<string, string> = {};
    if (manager) params.manager = manager;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const { data } = await api.get('/dashboard/weekly-report', { params: Object.keys(params).length ? params : undefined });
    return data;
  },
};

// Phases API
export const phasesApi = {
  getByProjectId: async (projectId: string): Promise<ApiResponse<ProjectPhaseRecord[]>> => {
    const { data } = await api.get(`/phases/project/${projectId}`);
    return data;
  },

  update: async (id: string, updates: Partial<ProjectPhaseRecord>): Promise<ApiResponse<ProjectPhaseRecord>> => {
    const { data } = await api.put(`/phases/${id}`, updates);
    return data;
  },

};

// Templates API
export const templatesApi = {
  getAll: async (): Promise<{ success: boolean; data: any[] }> => {
    const { data } = await api.get('/templates');
    return data;
  },
  getById: async (id: string): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.get(`/templates/${id}`);
    return data;
  },
  create: async (template: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.post('/templates', template);
    return data;
  },
  update: async (id: string, updates: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.put(`/templates/${id}`, updates);
    return data;
  },
  delete: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await api.delete(`/templates/${id}`);
    return data;
  },
  // Phases
  addPhase: async (templateId: string, phase: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.post(`/templates/${templateId}/phases`, phase);
    return data;
  },
  updatePhase: async (phaseId: string, updates: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.put(`/templates/phases/${phaseId}`, updates);
    return data;
  },
  deletePhase: async (phaseId: string): Promise<{ success: boolean }> => {
    const { data } = await api.delete(`/templates/phases/${phaseId}`);
    return data;
  },
  // Tasks
  addTask: async (phaseId: string, task: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.post(`/templates/phases/${phaseId}/tasks`, task);
    return data;
  },
  updateTask: async (taskId: string, updates: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.put(`/templates/tasks/${taskId}`, updates);
    return data;
  },
  deleteTask: async (taskId: string): Promise<{ success: boolean }> => {
    const { data } = await api.delete(`/templates/tasks/${taskId}`);
    return data;
  },
};

// Case Studies API
export const caseStudiesApi = {
  getAll: async (status?: string): Promise<ApiResponse<CaseStudy[]>> => {
    const { data } = await api.get('/case-studies', { params: { status } });
    return data;
  },

  getByProjectId: async (projectId: string): Promise<ApiResponse<CaseStudy | null>> => {
    const { data } = await api.get(`/case-studies/project/${projectId}`);
    return data;
  },

  create: async (caseStudy: Partial<CaseStudy>): Promise<ApiResponse<CaseStudy>> => {
    const { data } = await api.post('/case-studies', caseStudy);
    return data;
  },

  generate: async (projectId: string): Promise<ApiResponse<{ caseStudy: CaseStudy; generatedContent: any }>> => {
    const { data } = await api.post(`/case-studies/generate/${projectId}`);
    return data;
  },

  update: async (id: string, updates: Partial<CaseStudy>): Promise<ApiResponse<CaseStudy>> => {
    const { data } = await api.put(`/case-studies/${id}`, updates);
    return data;
  },
};

// KB Articles API
export interface KbArticle {
  id: string;
  caseStudyId: string;
  projectId: string;
  title: string;
  issue: string | null;
  rootCause: string | null;
  fix: string | null;
  prevention: string | null;
  category: string;
  customerName: string | null;
  projectManager: string | null;
  migrationTypes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticleDraft {
  title: string;
  issue: string;
  rootCause: string;
  fix: string;
  prevention: string;
  category: string;
}

export const kbArticlesApi = {
  getAll: async (params?: { search?: string; category?: string; caseStudyId?: string }): Promise<ApiResponse<KbArticle[]>> => {
    const { data } = await api.get('/kb-articles', { params });
    return data;
  },

  extract: async (caseStudyId: string): Promise<ApiResponse<KbArticleDraft[]>> => {
    const { data } = await api.post(`/kb-articles/extract/${caseStudyId}`);
    return data;
  },

  bulkSave: async (caseStudyId: string, articles: KbArticleDraft[]): Promise<ApiResponse<KbArticle[]>> => {
    const { data } = await api.post('/kb-articles/bulk', { caseStudyId, articles });
    return data;
  },

  update: async (id: string, updates: Partial<KbArticleDraft>): Promise<ApiResponse<KbArticle>> => {
    const { data } = await api.put(`/kb-articles/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await api.delete(`/kb-articles/${id}`);
    return data;
  },
};

// Notifications API
export const notificationsApi = {
  getAll: async (params?: { page?: number; limit?: number; projectId?: string }): Promise<{
    success: boolean;
    data: Notification[];
    pagination: { page: number; total: number; totalPages: number };
  }> => {
    const { data } = await api.get('/notifications', { params });
    return data;
  },

  markAsRead: async (id: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.put(`/notifications/${id}/read`);
    return data;
  },

  markAllAsRead: async (): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.put('/notifications/mark-all-read');
    return data;
  },
};

// Auth API
export const authApi = {
  login: async (username: string, password: string): Promise<{
    success: boolean;
    data: { user: any; token: string };
    error?: { message: string };
  }> => {
    try {
      const { data } = await api.post('/auth/login', { email: username, password });
      return data;
    } catch (error: any) {
      return {
        success: false,
        data: { user: null, token: '' },
        error: { message: error.response?.data?.error?.message || 'Login failed' },
      };
    }
  },

  register: async (name: string, email: string, password: string): Promise<{
    success: boolean;
    data: { user: any; token: string };
    error?: { message: string };
  }> => {
    try {
      const { data } = await api.post('/auth/register', { name, email, password });
      return data;
    } catch (error: any) {
      return {
        success: false,
        data: { user: null, token: '' },
        error: { message: error.response?.data?.error?.message || 'Registration failed' },
      };
    }
  },

  me: async (): Promise<{ success: boolean; data: any }> => {
    try {
      const { data } = await api.get('/auth/me');
      return data;
    } catch (error) {
      return { success: false, data: null };
    }
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  // ── User Management ──────────────────────────────────────────────
  getUsers: async (): Promise<{ success: boolean; data: any[] }> => {
    const { data } = await api.get('/auth/users');
    return data;
  },

  createUser: async (user: {
    name: string;
    email: string;
    role: string;
    department?: string;
  }): Promise<{ success: boolean; data: any; message: string }> => {
    const { data } = await api.post('/auth/users', user);
    return data;
  },

  updateUserRole: async (
    userId: string,
    role: string
  ): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.put(`/auth/users/${userId}/role`, { role });
    return data;
  },

  toggleUserActive: async (
    userId: string,
    isActive: boolean
  ): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.put(`/auth/users/${userId}/toggle-active`, { isActive });
    return data;
  },

  deleteUser: async (userId: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.delete(`/auth/users/${userId}`);
    return data;
  },
};

// Status Reports API
export const statusReportsApi = {
  getByProject: async (projectId: string): Promise<{ success: boolean; data: any[] }> => {
    const { data } = await api.get(`/reports/project/${projectId}`);
    return data;
  },

  getLatest: async (projectId: string): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.get(`/reports/project/${projectId}/latest`);
    return data;
  },

  generateWeekly: async (projectId: string, createdBy: string): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.post(`/reports/project/${projectId}/generate`, { createdBy });
    return data;
  },

  create: async (report: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.post('/reports', report);
    return data;
  },

  update: async (id: string, updates: any): Promise<{ success: boolean; data: any }> => {
    const { data } = await api.put(`/reports/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await api.delete(`/reports/${id}`);
    return data;
  },
};

// Manager Goals API
export const managerGoalsApi = {
  getAll: async () => {
    const { data } = await api.get('/manager-goals');
    return data;
  },
  getWithStats: async (manager?: string) => {
    const { data } = await api.get('/manager-goals/with-stats', { params: manager ? { manager } : undefined });
    return data;
  },
  upsert: async (managerName: string, goalPct: number) => {
    const { data } = await api.post('/manager-goals', { managerName, goalPct });
    return data;
  },
  delete: async (id: string) => {
    const { data } = await api.delete(`/manager-goals/${id}`);
    return data;
  },
};

// Client Reviews API
export const clientReviewsApi = {
  getAll: async (filters?: { projectManager?: string; customerName?: string }) => {
    const { data } = await api.get('/reviews', { params: filters });
    return data;
  },
  getByProject: async (projectId: string) => {
    const { data } = await api.get(`/reviews/project/${projectId}`);
    return data;
  },
  getManagerSummary: async () => {
    const { data } = await api.get('/reviews/manager-summary');
    return data;
  },
  create: async (review: {
    projectId: string;
    reviewerName: string;
    reviewDate?: string;
    communicationScore: number;
    deliveryScore: number;
    qualityScore: number;
    supportScore: number;
    comments?: string;
  }) => {
    const { data } = await api.post('/reviews', review);
    return data;
  },
  update: async (id: string, updates: Partial<{
    reviewerName: string;
    reviewDate: string;
    communicationScore: number;
    deliveryScore: number;
    qualityScore: number;
    supportScore: number;
    comments: string;
  }>) => {
    const { data } = await api.put(`/reviews/${id}`, updates);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await api.delete(`/reviews/${id}`);
    return data;
  },
};

// Platform Reviews API — reviews sourced from Gartner, G2, Trustpilot, TrustRadius, etc.
export const platformReviewsApi = {
  getAll: async (filters?: { platform?: string; projectName?: string; projectManager?: string; accountManager?: string; minRating?: number; segment?: string }) => {
    const { data } = await api.get('/platform-reviews', { params: filters });
    return data;
  },
  getPlatforms: async () => {
    const { data } = await api.get('/platform-reviews/platforms');
    return data;
  },
  getManagerOptions: async () => {
    const { data } = await api.get('/platform-reviews/manager-options');
    return data;
  },
  getSummary: async () => {
    const { data } = await api.get('/platform-reviews/summary');
    return data;
  },
  getManagerSummary: async (type: 'accountManager' | 'projectManager') => {
    const { data } = await api.get('/platform-reviews/manager-summary', { params: { type } });
    return data;
  },
  create: async (review: {
    platform: string;
    projectName: string;
    projectId?: string;
    projectManager?: string;
    accountManager?: string;
    reviewerName?: string;
    rating: number;
    reviewText?: string;
    reviewUrl?: string;
    reviewDate?: string;
    segment?: 'SMB' | 'ENT' | 'PS';
    media?: Array<{ url: string; type: 'image' | 'video' }>;
  }) => {
    const { data } = await api.post('/platform-reviews', review);
    return data;
  },
  // Multipart upload (not base64-in-JSON) so testimonial videos up to 1GB
  // don't have to be buffered/inflated in memory as a JSON string.
  uploadMedia: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const { data } = await api.post('/platform-reviews/media', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
  delete: async (id: string) => {
    const { data } = await api.delete(`/platform-reviews/${id}`);
    return data;
  },
};

// Overage API
export const overageApi = {
  uploadSow: async (projectId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const { data } = await api.post(`/overage/${projectId}/sow`, formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
};

export const feedbackApi = {
  getAll: async () => {
    const { data } = await api.get('/feedback');
    return data;
  },
  create: async (payload: { type: 'ISSUE' | 'SUGGESTION'; message: string; images?: File[] }) => {
    const formData = new FormData();
    formData.append('type', payload.type);
    formData.append('message', payload.message);
    (payload.images ?? []).forEach((f) => formData.append('images', f));
    const { data } = await api.post('/feedback', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
  updateStatus: async (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'DONE') => {
    const { data } = await api.put(`/feedback/${id}/status`, { status });
    return data;
  },
};

// SMTP API
export const smtpApi = {
  get: async () => {
    const { data } = await api.get('/smtp');
    return data;
  },
  save: async (settings: { host: string; port: number; email: string; password: string; security: string }) => {
    const { data } = await api.post('/smtp/save', settings);
    return data;
  },
  test: async (settings: { host: string; port: number; email: string; password: string; security: string }) => {
    const { data } = await api.post('/smtp/test', settings);
    return data;
  },
};

// POC Projects API
export const pocProjectsApi = {
  getAll: async (params?: Record<string, any>) => {
    const { data } = await api.get('/projects', { params: { ...params, projectType: 'POC' } });
    return data;
  },
  create: async (projectData: Record<string, any>) => {
    const { data } = await api.post('/projects', { ...projectData, projectType: 'POC' });
    return data;
  },
  update: async (id: string, updates: Record<string, any>) => {
    const { data } = await api.put(`/projects/${id}`, updates);
    return data;
  },
};

// Account Manager View API
export const accountManagerApi = {
  getView: async () => {
    const { data } = await api.get('/account-manager/view');
    return data;
  },
};

// Customer Success API
export const customerSuccessApi = {
  getView: async () => {
    const { data } = await api.get('/customer-success');
    return data;
  },
  updateEntry: async (projectId: string, updates: Record<string, any>) => {
    const { data } = await api.put(`/customer-success/${encodeURIComponent(projectId)}`, updates);
    return data;
  },
};

// HubSpot API — upsell / cross-sell deal signals + AI insights
export const hubspotApi = {
  getSignals: async (refresh?: boolean) => {
    const { data } = await api.get('/hubspot/signals', { params: refresh ? { refresh: 'true' } : undefined });
    return data;
  },
  getStatus: async () => {
    const { data } = await api.get('/hubspot/status');
    return data;
  },
  getInsights: async () => {
    const { data } = await api.get('/hubspot/insights');
    return data;
  },
};

// Projects by migration type
export const migrationTypeApi = {
  getProjectsByType: async (type: string) => {
    const { data } = await api.get(`/dashboard/projects-by-migration-type/${type}`);
    return data;
  },
};

// PMO Settings API — shared across all managers
export const pmoSettingsApi = {
  get: async (): Promise<{ success: boolean; data: Record<string, any> }> => {
    const { data } = await api.get('/pmo-settings');
    return data;
  },
  save: async (settings: Record<string, any>): Promise<{ success: boolean; data: Record<string, any>; message: string }> => {
    const { data } = await api.post('/pmo-settings', settings);
    return data;
  },
  patch: async (partial: Record<string, any>): Promise<{ success: boolean; data: Record<string, any>; message: string }> => {
    const { data } = await api.patch('/pmo-settings', partial);
    return data;
  },
};

// External API Key Management — scope is 'all' | 'migrationManager' | 'mbr'
export const apiKeyApi = {
  get: async (scope: string): Promise<{ success: boolean; data: { scope: string; apiKey: string } }> => {
    const { data } = await api.get(`/api-key/${scope}`);
    return data;
  },
  regenerate: async (scope: string): Promise<{ success: boolean; data: { scope: string; apiKey: string } }> => {
    const { data } = await api.post(`/api-key/${scope}/regenerate`);
    return data;
  },
};

// Template Combinations API
export const templateCombinationsApi = {
  getCombinations: async () => {
    const { data } = await api.get('/template-combinations');
    return data.data as any[];
  },
  createCombination: async (payload: {
    migrationCategory: string;
    sourceName: string;
    targetName: string;
    sourceIcon?: string;
    targetIcon?: string;
  }) => {
    const { data } = await api.post('/template-combinations', payload);
    return data.data;
  },
  deleteCombination: async (id: string) => {
    await api.delete(`/template-combinations/${id}`);
  },
  getDocuments: async (combinationId: string) => {
    const { data } = await api.get(`/template-combinations/${combinationId}/documents`);
    return data.data as any[];
  },
  uploadDocument: async (combinationId: string, payload: {
    fileName: string;
    docType: string;
    fileData: string; // base64
    mimeType: string;
    fileSize: number;
    uploadedBy?: string;
  }) => {
    const { data } = await api.post(`/template-combinations/${combinationId}/documents`, payload);
    return data.data;
  },
  renameDocument: async (docId: string, fileName: string) => {
    await api.patch(`/template-combinations/documents/${docId}`, { fileName });
  },
  deleteDocument: async (docId: string) => {
    await api.delete(`/template-combinations/documents/${docId}`);
  },
  getDownloadUrl: (docId: string) => `/api/template-combinations/documents/${docId}/download`,
};

// Professional Services Engagements API
export const psEngagementsApi = {
  getAll: async () => {
    const { data } = await api.get('/ps-engagements');
    return data.data as any[];
  },
  create: async (engagement: any) => {
    const { data } = await api.post('/ps-engagements', engagement);
    return data;
  },
  update: async (id: string, engagement: any) => {
    const { data } = await api.put(`/ps-engagements/${id}`, engagement);
    return data;
  },
  remove: async (id: string) => {
    const { data } = await api.delete(`/ps-engagements/${id}`);
    return data;
  },
};

export const actionItemsApi = {
  getAll: async () => {
    const { data } = await api.get('/action-items');
    return data.data as any[];
  },
  create: async (item: any) => {
    const { data } = await api.post('/action-items', item);
    return data;
  },
  update: async (id: string, item: any) => {
    const { data } = await api.put(`/action-items/${id}`, item);
    return data;
  },
  remove: async (id: string) => {
    const { data } = await api.delete(`/action-items/${id}`);
    return data;
  },
};

export const emailHygieneApi = {
  getMetrics: async (forceRefresh = false) => {
    const { data } = await api.get('/email-hygiene', { params: forceRefresh ? { refresh: 'true' } : {} });
    return data;
  },
  exportExcel: async () => {
    const { data } = await api.get('/email-hygiene/export', { responseType: 'blob' });
    return data as Blob;
  },
  triggerSync: async () => {
    const { data } = await api.post('/email-hygiene/sync');
    return data as { success: boolean; data: { alreadyRunning: boolean; running: boolean; completedAt: string | null; error: string | null } };
  },
  getSyncStatus: async () => {
    const { data } = await api.get('/email-hygiene/sync-status');
    return data as { success: boolean; data: { running: boolean; startedAt: string | null; completedAt: string | null; error: string | null } };
  },
  getWeeklyTrend: async () => {
    const { data } = await api.get('/email-hygiene/weekly-trend');
    return data;
  },
};

export const callHygieneApi = {
  getMetrics: async (forceRefresh = false) => {
    const { data } = await api.get('/call-hygiene', { params: forceRefresh ? { refresh: 'true' } : {} });
    return data;
  },
  exportExcel: async () => {
    const { data } = await api.get('/call-hygiene/export', { responseType: 'blob' });
    return data as Blob;
  },
  getBestWorst: async (userEmail?: string) => {
    const { data } = await api.get('/call-hygiene/best-worst', { params: userEmail ? { userEmail } : {} });
    return data;
  },
  getOrgBestWorst: async () => {
    const { data } = await api.get('/call-hygiene/best-worst/org');
    return data;
  },
  getWeeklyTrend: async () => {
    const { data } = await api.get('/call-hygiene/weekly-trend');
    return data;
  },
};

export const callTranscriptsApi = {
  getRating: async (eventId: string, userEmail: string) => {
    const { data } = await api.get('/call-transcripts/rating', { params: { eventId, userEmail } });
    return data;
  },
  rate: async (payload: {
    eventId: string;
    subject: string;
    meetingStart: string | null;
    organizerEmail: string;
    joinUrl: string;
    internalUserEmail: string;
    internalUserName: string;
    customerAttendees: Array<{ name: string; email: string }>;
  }) => {
    const { data } = await api.post('/call-transcripts/rate', payload);
    return data;
  },
};

export const auditApi = {
  getAll: async (params?: {
    page?: number; limit?: number; userId?: string; entityType?: string;
    entityId?: string; action?: string; startDate?: string; endDate?: string;
  }) => {
    const { data } = await api.get('/audit', { params });
    return data;
  },
  getManagerLeaderboard: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get('/audit/manager-leaderboard', { params });
    return data;
  },
  getWeeklyTrend: async (params: { endDate: string; weeks?: number }) => {
    const { data } = await api.get('/audit/weekly-trend', { params });
    return data;
  },
  exportLogExcel: async (params?: {
    userId?: string; entityType?: string; entityId?: string; action?: string; startDate?: string; endDate?: string;
  }) => {
    const { data } = await api.get('/audit/export/log', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportLeaderboardExcel: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get('/audit/export/leaderboard', { params, responseType: 'blob' });
    return data as Blob;
  },
  getHygieneBoard: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get('/audit/hygiene-board', { params });
    return data;
  },
  exportHygieneExcel: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get('/audit/export/hygiene-board', { params, responseType: 'blob' });
    return data as Blob;
  },
  runHygieneScorecardNow: async () => {
    const { data } = await api.post('/audit/hygiene-scorecard/run-now');
    return data;
  },
  scheduleHygieneScorecard: async (recipients: string[], scheduledAt: string) => {
    const { data } = await api.post('/audit/hygiene-scorecard/schedule', { recipients, scheduledAt });
    return data;
  },
  getHygieneScorecardSchedules: async () => {
    const { data } = await api.get('/audit/hygiene-scorecard/schedules');
    return data;
  },
  cancelHygieneScorecardSchedule: async (id: string) => {
    const { data } = await api.delete(`/audit/hygiene-scorecard/schedules/${id}`);
    return data;
  },
  getHygieneWeeklyTrend: async () => {
    const { data } = await api.get('/audit/hygiene-board/weekly-trend');
    return data;
  },
};

// Escalation Mails API
export const escalationMailsApi = {
  getAll: async (params?: { owner?: string; issueType?: string; status?: string }) => {
    const { data } = await api.get('/escalation-mails', { params });
    return data;
  },
  getStats: async () => {
    const { data } = await api.get('/escalation-mails/stats');
    return data;
  },
  getConfig: async () => {
    const { data } = await api.get('/escalation-mails/config');
    return data;
  },
  // Parse an uploaded .eml/.msg file OR pasted raw text into a draft (no save).
  parseFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/escalation-mails/parse', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
  parseText: async (rawMail: string) => {
    const { data } = await api.post('/escalation-mails/parse', { rawMail });
    return data;
  },
  create: async (payload: Record<string, unknown>) => {
    const { data } = await api.post('/escalation-mails', payload);
    return data;
  },
  updateStatus: async (id: string, status: string) => {
    const { data } = await api.patch(`/escalation-mails/${id}/status`, { status });
    return data;
  },
  updateOwner: async (id: string, escalationOwner: string) => {
    const { data } = await api.patch(`/escalation-mails/${id}/owner`, { escalationOwner });
    return data;
  },
  updateReceivedAt: async (id: string, receivedAt: string) => {
    const { data } = await api.patch(`/escalation-mails/${id}/received-at`, { receivedAt });
    return data;
  },
  resolve: async (id: string, payload: { resolvedAt: string; rca: string; rcaDocs?: { url: string; name: string }[] }) => {
    const { data } = await api.patch(`/escalation-mails/${id}/resolve`, payload);
    return data;
  },
  updateResolution: async (id: string, payload: { resolvedAt?: string; rca?: string; rcaDocs?: { url: string; name: string }[] }) => {
    const { data } = await api.patch(`/escalation-mails/${id}/resolution`, payload);
    return data;
  },
  uploadRcaDocs: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const { data } = await api.post('/escalation-mails/rca-docs', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
  uploadMedia: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const { data } = await api.post('/escalation-mails/media', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },
  delete: async (id: string) => {
    const { data } = await api.delete(`/escalation-mails/${id}`);
    return data;
  },
};

export default api;
