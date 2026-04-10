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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
};

// Dashboard API
export const dashboardApi = {
  getOverview: async (): Promise<ApiResponse<DashboardOverview>> => {
    const { data } = await api.get('/dashboard/overview');
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

  complete: async (projectId: string, phaseName: string): Promise<ApiResponse<void>> => {
    const { data } = await api.post(`/phases/${projectId}/complete/${phaseName}`);
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

export default api;
