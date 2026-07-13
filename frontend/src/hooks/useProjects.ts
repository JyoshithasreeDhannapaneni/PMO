'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, dashboardApi, statusReportsApi, managerGoalsApi, migrationTypeApi, pocProjectsApi, accountManagerApi, customerSuccessApi, hubspotApi, psEngagementsApi } from '@/services/api';
import type { CreateProjectInput, UpdateProjectInput } from '@/types';

export function useProjects(params?: {
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
}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getAll(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (project: CreateProjectInput) => {
      const result = await projectsApi.create(project);
      // Auto-generate the first weekly report for the new project
      if (result?.data?.id) {
        try {
          await statusReportsApi.generateWeekly(result.data.id, 'system');
        } catch {
          // Non-blocking — project is created even if report generation fails
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      projectsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['statusReports', variables.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDashboard(manager?: string) {
  return useQuery({
    queryKey: ['dashboard', manager],
    queryFn: () => dashboardApi.getOverview(manager),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useWeeklyReport(manager?: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['weeklyReport', manager, startDate, endDate],
    queryFn: () => dashboardApi.getWeeklyReport(manager, startDate, endDate),
  });
}

export function useManagerStats(manager?: string) {
  return useQuery({
    queryKey: ['managerStats', manager],
    queryFn: () => dashboardApi.getManagerStats(manager),
  });
}

export function useDelayedProjects() {
  return useQuery({
    queryKey: ['projects', 'delayed'],
    queryFn: () => projectsApi.getDelayed(),
  });
}

// ── Weekly Report Hooks ───────────────────────────────────────────────────────

export function useStatusReports(projectId: string) {
  return useQuery({
    queryKey: ['statusReports', projectId],
    queryFn: () => statusReportsApi.getByProject(projectId),
    enabled: !!projectId,
  });
}

export function useLatestStatusReport(projectId: string) {
  return useQuery({
    queryKey: ['statusReports', projectId, 'latest'],
    queryFn: () => statusReportsApi.getLatest(projectId),
    enabled: !!projectId,
  });
}

export function useGenerateWeeklyReport(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (createdBy: string) =>
      statusReportsApi.generateWeekly(projectId, createdBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusReports', projectId] });
    },
  });
}

export function useManagerGoals() {
  return useQuery({
    queryKey: ['managerGoals'],
    queryFn: () => managerGoalsApi.getAll(),
  });
}

export function useManagerGoalsWithStats(manager?: string) {
  return useQuery({
    queryKey: ['managerGoalsWithStats', manager],
    queryFn: () => managerGoalsApi.getWithStats(manager),
  });
}

export function useUpsertManagerGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ managerName, goalPct }: { managerName: string; goalPct: number }) =>
      managerGoalsApi.upsert(managerName, goalPct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerGoals'] });
      queryClient.invalidateQueries({ queryKey: ['managerGoalsWithStats'] });
      queryClient.invalidateQueries({ queryKey: ['managerStats'] });
    },
  });
}

// ── POC / Account Manager / Customer Success Hooks ───────────────────────────

export function usePocProjects(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['poc-projects', params],
    queryFn: () => pocProjectsApi.getAll(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => pocProjectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
    },
  });
}

export function useUpdatePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      pocProjectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
    },
  });
}

export function useDeletePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAccountManagerView() {
  return useQuery({
    queryKey: ['account-manager-view'],
    queryFn: () => accountManagerApi.getView(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCustomerSuccess() {
  return useQuery({
    queryKey: ['customer-success'],
    queryFn: () => customerSuccessApi.getView(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useHubspotSignals() {
  return useQuery({
    queryKey: ['hubspot-signals'],
    queryFn: () => hubspotApi.getSignals(),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateCustomerSuccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Record<string, any> }) =>
      customerSuccessApi.updateEntry(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-success'] }),
  });
}

export function usePsEngagements() {
  return useQuery({
    queryKey: ['ps-engagements'],
    queryFn: () => psEngagementsApi.getAll(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (engagement: any) => psEngagementsApi.create(engagement),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
  });
}

export function useUpdatePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => psEngagementsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
  });
}

export function useDeletePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => psEngagementsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
  });
}

export function useProjectsByMigrationType(type: string | null) {
  return useQuery({
    queryKey: ['projectsByMigrationType', type],
    queryFn: () => migrationTypeApi.getProjectsByType(type!),
    enabled: !!type,
  });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const authFetch = (url: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json());
};

export function useAllUsers() {
  return useQuery({
    queryKey: ['all-users'],
    queryFn: () => authFetch(`${API_BASE}/api/auth/users`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraStatus() {
  return useQuery({
    queryKey: ['jira-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/status`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraOAuthStatus() {
  return useQuery({
    queryKey: ['jira-oauth-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/oauth/status`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useJiraSla(managerName: string | null) {
  return useQuery({
    queryKey: ['jira-sla', managerName],
    queryFn: () => authFetch(`${API_BASE}/api/jira/sla?manager=${encodeURIComponent(managerName!)}`),
    enabled: !!managerName,
    staleTime: 0,
  });
}

export function useJiraEngineers() {
  return useQuery({
    queryKey: ['jira-engineers'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/engineers`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraExcelStatus() {
  return useQuery({
    queryKey: ['jira-excel-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/excel/status`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useOveragedProjects(manager?: string) {
  return useQuery({
    queryKey: ['overagedProjects', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/overaged-projects${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useEscalatedProjects(manager?: string) {
  return useQuery({
    queryKey: ['escalatedProjects', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/escalated-projects${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useMarkOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overageAmount, notes, extendedStartDate, extendedEndDate }: { id: string; overageAmount?: number; notes?: string; extendedStartDate?: string; extendedEndDate?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/mark-overage/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ overageAmount, notes, extendedStartDate, extendedEndDate }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overageAmount, notes, extendedStartDate, extendedEndDate }: { id: string; overageAmount?: number; notes?: string; extendedStartDate?: string; extendedEndDate?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/update-overage/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ overageAmount, notes, extendedStartDate, extendedEndDate }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUnmarkOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/unmark-overage/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteOverageHistoryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (historyId: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/overage-history/${historyId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useEscalateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority, notes }: { id: string; priority: 'LOW' | 'MEDIUM' | 'HIGH'; notes?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalate/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ priority, notes }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeescalateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/deescalate/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useArchivedEscalations(manager?: string) {
  return useQuery({
    queryKey: ['archivedEscalations', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/archived-escalations${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
  });
}

export function useArchiveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/archive-escalation/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['archivedEscalations'] });
    },
  });
}

export function useUnarchiveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/unarchive-escalation/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['archivedEscalations'] });
    },
  });
}

export function useEscalationDailyNotes(projectId: string | null, columnName?: string) {
  return useQuery({
    queryKey: ['escalationDailyNotes', projectId, columnName],
    queryFn: () => {
      const params = columnName ? `?columnName=${encodeURIComponent(columnName)}` : '';
      return authFetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}${params}`);
    },
    enabled: !!projectId,
    staleTime: 0,
  });
}

export function useAddEscalationDailyNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, note, author, noteDate, columnName }: { projectId: string; note: string; author?: string; noteDate?: string; columnName?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ note, author, noteDate, columnName }),
      }).then(r => r.json());
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escalationDailyNotes', vars.projectId] });
    },
  });
}

export function useDeleteEscalationDailyNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, noteId }: { projectId: string; noteId: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}/${noteId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escalationDailyNotes', vars.projectId] });
    },
  });
}

export function useDealDeskDeals(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  matchType?: string;
}) {
  const search = params?.search || '';
  const status = params?.status || '';
  const matchType = params?.matchType || '';
  const page = params?.page || 1;
  const limit = params?.limit || 25;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    ...(matchType ? { matchType } : {}),
  }).toString();
  return useQuery({
    queryKey: ['dealDeskDeals', page, limit, status, search, matchType],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk?${qs}`),
    staleTime: 60_000,
  });
}

export function useDealDeskStats() {
  return useQuery({
    queryKey: ['dealDeskStats'],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk/stats`),
    staleTime: 60_000,
  });
}

export function useDealDeskConfig() {
  return useQuery({
    queryKey: ['dealDeskConfig'],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk/config`),
    staleTime: 5 * 60_000,
  });
}

export function useTriggerDealDeskPoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/deal-desk/poll`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealDeskDeals'] });
      queryClient.invalidateQueries({ queryKey: ['dealDeskStats'] });
    },
  });
}

export function useUpdateDealMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, matchedPsId, matchedProjectId }: { id: string; matchedPsId?: string; matchedProjectId?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/deal-desk/${id}/match`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ matchedPsId, matchedProjectId }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealDeskDeals'] });
    },
  });
}
